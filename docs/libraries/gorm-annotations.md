---
title: GORM annotations
sidebar_position: 1
---

# GORM annotations

**`gorm/annotations`** is a synth pack that turns the verbose
`@structTag("gorm", "...")` form GORM expects into ergonomic
`@Pk` / `@Column(name)` / `@Index` / `@Timestamps` decorators.
Every annotation in this pack lowers — at compile time — to one or
more `@structTag` entries that real GORM reflects on at runtime, so
there is **no extra cost at runtime**. The Sova
[synth expander](/language/annotations) does all of the work before
codegen runs.

## Installing

Add to `sova.toml`:

```toml
[dependencies]
"gorm/annotations" = { version = "^0.1.0" }
```

Import the pack with `using *` so the bare `@Pk` form works without a
package qualifier:

```sova
package myapp on backend

import "gorm" using *
import "gorm/annotations" using *

type User {
    @Pk
    id: int = 0

    @Column("display_name") @NotNull
    name: string = ""
}
```

`using *` is the recommended import form for any synth pack — see
[Annotations](/language/annotations) for why.

## The annotations

### Primary key

| Annotation        | Lowers to                                            |
| ----------------- | ---------------------------------------------------- |
| `@PrimaryKey`     | `@structTag("gorm", "primaryKey")`                   |
| `@AutoIncrement`  | `@structTag("gorm", "autoIncrement")`                |
| `@Pk`             | `@structTag("gorm", "primaryKey;autoIncrement")` — the combo most apps want. |

```sova
type User {
    @Pk
    id: int = 0
}
```

### Columns

| Annotation          | Argument             | Lowers to                                       |
| ------------------- | -------------------- | ----------------------------------------------- |
| `@Column(name)`     | `name: string`       | `@structTag("gorm", "column:" + name)`          |
| `@JSON(name)`       | `name: string`       | `@structTag("json", name)`                      |
| `@Ignore`           | —                    | `@structTag("gorm", "-")` — exclude from the DB. |

```sova
type Post {
    @Column("post_id") @JSON("id")
    id: int = 0

    @Ignore
    sessionScratch: string = ""
}
```

### Indexes and uniqueness

| Annotation                | Argument              | Lowers to                                            |
| ------------------------- | --------------------- | ---------------------------------------------------- |
| `@Index`                  | —                     | `@structTag("gorm", "index")`                        |
| `@NamedIndex(idx)`        | `idx: string`         | `@structTag("gorm", "index:" + idx)`                 |
| `@Unique`                 | —                     | `@structTag("gorm", "unique")`                       |
| `@UniqueIndex`            | —                     | `@structTag("gorm", "uniqueIndex")`                  |
| `@NamedUniqueIndex(idx)`  | `idx: string`         | `@structTag("gorm", "uniqueIndex:" + idx)`           |

```sova
type Account {
    @Pk id: int = 0

    @UniqueIndex
    email: string = ""

    @NamedIndex("idx_active_since")
    activeSince: int = 0
}
```

### Constraints

| Annotation              | Argument              | Lowers to                                            |
| ----------------------- | --------------------- | ---------------------------------------------------- |
| `@NotNull`              | —                     | `@structTag("gorm", "not null")`                     |
| `@Size(n)`              | `n: int`              | `` `@structTag("gorm", "size:${n}")` `` — string-template fold produces `"size:200"` etc. |
| `@Default(value)`       | `value: string`       | `@structTag("gorm", "default:" + value)`             |
| `@Constraints(rules)`   | `rules: string`       | `@structTag("gorm", rules)` — catch-all for anything not covered above. |

```sova
type Product {
    @Pk id: int = 0

    @Size(200) @NotNull
    name: string = ""

    @Default("0")
    stock: int = 0

    @Constraints("check:price >= 0")
    price: int = 0
}
```

### Member-injection annotations

These don't decorate an existing field — they **inject new fields**
into the type at compile time. Both apply on `on type T`:

| Annotation     | Injects                                                       |
| -------------- | ------------------------------------------------------------- |
| `@Timestamps`  | `createdAt: int = 0` and `updatedAt: int = 0`                 |
| `@SoftDelete`  | `deletedAt: int = 0`                                          |

```sova
@Timestamps
@SoftDelete
type Post {
    @Pk id: int = 0
    title: string = ""
}
```

After expansion the Sova compiler sees the type as if you had typed
those three fields by hand — they bind, infer, and emit normally.
LSP member completion on `post.` shows them.

The default type is `int` (Unix-style timestamps) because the synth
pack avoids forcing a `std/time` dependency on every consumer.
Override by writing the fields yourself when you prefer
`time.Time`.

### `@GormModel(table)` — every-field shortcut

`@GormModel(name)` on a type adds a table-level tag *and* iterates
every field, decorating each with a `column:<fieldname>` tag. It's
the one-line `@GormModel("users")` form for tables where the column
names match the field names.

```sova
@GormModel("users")
type User {
    @Pk id: int = 0
    name: string = ""
    email: string = ""
}
```

Expands to:

```sova
@structTag("strix.gorm.table", "users")
type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    @structTag("gorm", "column:id")
    id: int = 0

    @structTag("gorm", "column:name")
    name: string = ""

    @structTag("gorm", "column:email")
    email: string = ""
}
```

Mix and match with per-field annotations — they stack rather than
override.

## Stacking annotations

Built-in `@structTag` annotations stack: multiple entries with the
same namespace are joined with a space when GORM sees the Go struct
tag at runtime. So:

```sova
@Pk @Size(200) @NotNull
name: string = ""
```

produces a Go struct tag of `gorm:"primaryKey autoIncrement size:200 not null"` — both GORM-readable and consistent with the upstream
documentation. Order is preserved.

## What lowering looks like

Run `sova synth expand --file <your-file>.sova` to see exactly what
the compiler generates. For the demo earlier:

```sova
@Pk
@Column("user_id")
id: int = 0
```

→ after expansion:

```sova
@structTag("gorm", "primaryKey;autoIncrement")
@structTag("gorm", "column:user_id")
id: int = 0
```

→ Go codegen:

```go
ID int64 `gorm:"primaryKey;autoIncrement column:user_id" json:"id,omitempty"`
```

(The `json:"id,omitempty"` is the default Sova field tag; supply your
own `@JSON("...")` to override it.)

## See also

- **[GORM](/libraries/gorm)** — the underlying ORM package.
- **[Annotations](/language/annotations)** — the synth system that
  powers this pack. Read it if you want to add your own GORM
  decorators (e.g. `@HasMany`, `@BelongsTo`) on top of `@structTag`.
- **[GORM tag reference](https://gorm.io/docs/models.html#Fields-Tags)** — the upstream list of every tag string the Sova layer eventually feeds GORM.
