---
title: GORM
sidebar_position: 0
---

# GORM

**`gorm`** is the Sova port of the Go [GORM](https://gorm.io) ORM. It
gives backend Sova code a fluent API for connecting to a database,
running CRUD, composing queries, applying schema migrations, and
managing transactions — all backed by the real GORM library at
runtime. The Sova-side surface is a thin layer of `extern` bindings
over `gorm.io/gorm`; the Go emitter wires every call to the host
library.

The package is **backend-only**. There is no frontend equivalent —
a Sova model declared on the backend round-trips to the frontend
through a `wire` boundary, not by exposing GORM directly.

## What ships

| Package           | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `gorm`            | Core: connection, CRUD, query builder, migrations, transactions. |
| `gorm/sqlite`     | SQLite driver (pure-Go via `github.com/glebarez/sqlite`). |
| `gorm/postgres`   | PostgreSQL driver (via pgx).                              |
| `gorm/annotations` | Custom-annotation pack — `@Pk`, `@Column(name)`, `@Index`, `@Timestamps`, ... that lower to `@structTag("gorm", ...)`. Covered in [Annotation pack](#annotation-pack) below. |

Pull only what you need:

```toml
[dependencies]
gorm               = { version = "^0.1.0" }
gorm/sqlite        = { version = "^0.1.0" }
"gorm/annotations" = { version = "^0.1.0" }
```

## Modelling

A model is a regular Sova `type`. GORM reflects on the generated Go
struct at runtime, so every column rule is expressed as a Go struct
tag — which Sova emits via the built-in `@structTag(key, value)`
annotation:

```sova
package myapp on backend

import "gorm"

type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    @structTag("json", "id")
    id: int = 0

    @structTag("gorm", "size:200;not null")
    @structTag("gorm", "index")
    name: string = ""

    @structTag("gorm", "uniqueIndex")
    email: string = ""

    createdAt: int = 0
    updatedAt: int = 0
}
```

Writing `@structTag` repeatedly gets noisy fast. The
[`gorm/annotations`](#annotation-pack) pack ships a curated set of
`synth` annotations that lower to the same `@structTag` calls — the
same model written with the pack:

```sova
import "gorm/annotations" using *

type User {
    @Pk
    @JSON("id")
    id: int = 0

    @Size(200) @NotNull @Index
    name: string = ""

    @UniqueIndex
    email: string = ""
}

@Timestamps
type Post {
    @Pk id: int = 0
    title: string = ""
}
```

`@Timestamps` injects the `createdAt`/`updatedAt` fields itself; see
the [annotation pack](#annotation-pack) section below for the full
list.

## Connecting

```sova
import "gorm"
import "gorm/sqlite"

func main() {
    let db = gorm.open(sqlite.open("app.db"))
    if db == none {
        println("could not connect")
        return
    }
    defer gorm.close(db)
}
```

For non-default behaviour:

```sova
let cfg = gorm.newConfig()
cfg["skipDefaultTransaction"] = true
cfg["prepareStmt"] = true
let db = gorm.openWithConfig(sqlite.open("app.db"), cfg)
```

Supported config keys today: `skipDefaultTransaction` (bool),
`prepareStmt` (bool), `dryRun` (bool). Unknown keys are ignored.

`gorm.ping(db)` round-trips to the database; `gorm.lastError(db)`
returns the most recent error message attached to the handle (GORM's
chain-and-check pattern — every chain step records its error, you
inspect after the terminal call).

## Migrations

`gorm.autoMigrate(db, [new User(), new Post()])` reflects on the
provided model instances and creates / updates tables to match.
`dropTable` and `hasTable` are also available:

```sova
import "gorm"

let _ = gorm.autoMigrate(db, [new User(), new Post()])
let exists = gorm.hasTable(db, new User())
```

`autoMigrate` is idempotent — call it on every boot.

## CRUD

The CRUD surface mirrors GORM's terminal calls. Every function takes
the GORM handle (possibly after a chain of query builders, see below)
and a model instance:

```sova
import "gorm"

let user = new User()
user.name = "Alice"
user.email = "alice@example.com"

let _ = gorm.create(db, user)
println("inserted user id: " + (user.id as string))

let found = new User()
let _ = gorm.firstByID(db, found, user.id)

found.name = "Alicia"
let _ = gorm.save(db, found)

let _ = gorm.deleteRecord(db, found)
```

The terminal calls return the (possibly chained) GORM handle as `any`
so you can keep chaining, but the common case is to inspect
`gorm.lastError(db)` or `gorm.rowsAffected(db)`:

```sova
let _ = gorm.create(db, user)
if gorm.lastError(db) != "" {
    println("insert failed: " + gorm.lastError(db))
}
```

Batch inserts go through `gorm.createBatch(db, list, batchSize)`.
Read-into-slice goes through `gorm.find(db, outList)`. Counts go
through the `gorm.count(db)` helper.

## Query building

Chain query builders before a terminal call. Each builder returns a
new handle:

```sova
import "gorm"

let adults = new []User()
let q = gorm.where(gorm.table(db, "users"), "age > ?", [18])
let q2 = gorm.order(q, "name asc")
let q3 = gorm.limit(q2, 50)
let _ = gorm.find(q3, adults)
```

The available chain steps mirror GORM's: `where`, `or`, `not`,
`order`, `groupBy`, `having`, `limit`, `offset`, `selectColumns`,
`preload`, `joins`, `table`, `distinct`.

## Transactions

```sova
import "gorm"

let tx = gorm.begin(db)
let _ = gorm.create(tx, new User { name = "Alice" })
let _ = gorm.create(tx, new User { name = "Bob" })
if gorm.lastError(tx) != "" {
    let _ = gorm.rollback(tx)
} else {
    let _ = gorm.commit(tx)
}
```

`begin`, `commit`, `rollback`, `savepoint`, `rollbackTo` are all
available in `gorm/tx`.

## Raw SQL

For anything the builder doesn't reach:

```sova
import "gorm"

let q = gorm.raw(db, "SELECT id, name FROM users WHERE active = ?", [true])
let out = new []User()
let _ = gorm.find(q, out)
```

`gorm.exec` runs non-query statements (`UPDATE`, `DDL`).

## What lives where

| File            | Surface                                                    |
| --------------- | ---------------------------------------------------------- |
| `db.sova`       | `open`, `openWithConfig`, `close`, `ping`, `lastError`, `rowsAffected`, `newConfig`. |
| `crud.sova`     | `create`, `createBatch`, `save`, `update`, `updates`, `deleteRecord`, `first`, `firstByID`, `last`, `find`, `count`, `countInto`. |
| `query.sova`    | `where`, `not`, `or`, `order`, `groupBy`, `having`, `limit`, `offset`, `selectColumns`, `preload`, `joins`, `table`, `distinct`. |
| `migrate.sova`  | `autoMigrate`, `dropTable`, `hasTable`.                    |
| `tx.sova`       | `begin`, `commit`, `rollback`, `savepoint`, `rollbackTo`.  |
| `raw.sova`      | `raw`, `exec`.                                             |

## Annotation pack

**`gorm/annotations`** is a [synth pack](/language/annotations) that
turns the verbose `@structTag("gorm", "...")` form into ergonomic
`@Pk` / `@Column(name)` / `@Index` / `@Timestamps` decorators.
Every annotation in this pack lowers — at compile time — to one or
more `@structTag` entries that real GORM reflects on at runtime, so
there is **no extra runtime cost**. The Sova
[synth expander](/language/annotations) does all of the work before
codegen runs.

Every annotation in this pack is declared `on backend` — see
[side constraints](/language/annotations#side-constraints). The
compiler rejects `@Pk` on a frontend type at the use site with a
clear diagnostic, so accidentally putting a GORM annotation in the
wrong place is impossible. The pack still applies to declarations in
`on shared` files because their backend half is a real Go struct
that GORM reflects on.

### Installing

```toml
[dependencies]
"gorm/annotations" = { version = "^0.1.0" }
```

```sova
import "gorm/annotations" using *
```

`using *` is the recommended import form for any synth pack — see
[Annotations](/language/annotations) for why.

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

### Stacking annotations

Built-in `@structTag` annotations stack: multiple entries with the
same namespace are joined with a space when GORM sees the Go struct
tag at runtime. So:

```sova
@Pk @Size(200) @NotNull
name: string = ""
```

produces a Go struct tag of `gorm:"primaryKey autoIncrement size:200 not null"` — both GORM-readable and consistent with the upstream
documentation. Order is preserved.

### What lowering looks like

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

- **[Annotations](/language/annotations)** — the synth system that
  powers the annotation pack. Read it if you want to add your own
  GORM decorators (e.g. `@HasMany`, `@BelongsTo`) on top of
  `@structTag`.
- **[GORM tag reference](https://gorm.io/docs/models.html#Fields-Tags)** —
  the upstream list of every tag string the Sova layer eventually
  feeds GORM.
- **[Strix annotations](/frontend/annotations)** — the frontend-side
  counterpart pack.
