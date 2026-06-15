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
| `gorm/annotations` | [Custom annotation pack](/libraries/gorm-annotations) — `@Pk`, `@Column(name)`, `@Index`, `@Timestamps`, ... that lower to `@structTag("gorm", ...)`. |

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
[`gorm/annotations`](/libraries/gorm-annotations) pack ships a curated
set of `synth` annotations that lower to the same `@structTag` calls
— the same model written with the pack:

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
the annotation pack page for the full list.

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

## See also

- **[GORM annotations](/libraries/gorm-annotations)** — the synth pack
  that turns `@structTag("gorm", "...")` into ergonomic `@Pk`,
  `@Column(...)`, `@Timestamps` decorators.
- **[Annotations](/language/annotations)** — the synth system the
  annotation pack is built on.
- The upstream
  [GORM documentation](https://gorm.io/docs/) — every tag string the
  Sova layer accepts is whatever real GORM reflects on at runtime,
  so the upstream tag reference applies verbatim.
