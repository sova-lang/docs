---
title: Packages
sidebar_position: 8
---

# Packages

A package is the unit of code organisation, the unit of visibility, and
the unit of dependency. Every Sova file belongs to a package, every
import resolves to a package, and every shared symbol is qualified by
its package path.

## Declaring a package

The first line of every Sova file is the package declaration:

```sova
package myapp/users on backend
```

Two pieces of information sit on this line:

- The **package path** (`myapp/users`) — a slash-separated identifier
  that uniquely names the package. It is also the path you import to
  pull this package into another file.
- The **side** (`on backend` / `on frontend` / `on shared`) — see
  [Sides](/language/sides).

A package can span multiple files. All files in a directory that
declare the same `package` line belong to the same package and see
each other's top-level declarations without an import.

## Imports

To pull in another package:

```sova
import "myapp/shared"
import "std/strings"
import "myapp/backend" using *
```

The trailing `using *` re-exports every public symbol from the
imported package into the current scope. Without it, you reach into
the imported package with `package.member` syntax:

```sova
import "std/strings"

let upper = strings.toUpper("hello")
```

`using *` is convenient inside the same project; cross-project imports
typically keep the qualifier for clarity.

A second variant lets you cherry-pick specific names:

```sova
import "myapp/shared" using { User, Order }
```

Only `User` and `Order` become unqualified in the current file.

## Visibility

Sova has two visibility levels: public (the default) and
package-private. Names starting with a single underscore are
package-private; they are invisible from any other package.

```sova
package myapp/users on shared

let activeCount: int = 0      // public
let _lastSeen: int = 0        // package-private

func display(): string {      // public
    return _format(activeCount)
}

func _format(n: int): string {  // package-private
    return "active: " + string(n)
}
```

The compiler enforces underscore privacy at every cross-package access
site: completion hides the names, definition lookup ignores them, and
direct references produce a compile error.

Double-underscore names (`__name`) are exempt from this rule by
convention. They are reserved for framework-internal helpers that
genuinely need to cross packages — Strix uses them for its runtime
plumbing, for example. Application code should stick to single
underscore for privacy and avoid `__` unless you're writing a
framework.

## Cross-package types

A type defined in one package is referenced by qualifying its name:

```sova
import "myapp/users"

func render(u: users.User): string { ... }
```

You can also alias the import to avoid the qualifier:

```sova
import "myapp/users/very/long/path"

using U = very.long.path.User      // hypothetical: aliases declared elsewhere
```

In practice, prefer `using *` or `using { specific names }` over
manual aliasing.

## The standard library

Anything under `std/` is part of the Sova standard library. It is
shipped with the binary; you do not declare it in `sova.toml`:

```sova
import "std/strings"
import "std/list"
import "std/sync"
import "std/json"
```

The compiler resolves `std/...` from a search path that includes the
folder next to the binary, the `SOVA_HOME` environment variable when
set, and the current working directory's `std/` (for repo
development). When you ctrl+click a stdlib symbol the LSP opens the
actual file on disk, not a placeholder.

The most useful modules:

| Module | What it ships |
| --- | --- |
| `std/strings` | Substring, case, split, join, trim. |
| `std/list` | `List`, `LinkedList`, and their concurrent counterparts. |
| `std/sync` | `Mutex`, `RWMutex`, `WaitGroup`, `Once`. |
| `std/json` | `parse` / `stringify`. |
| `std/time` | `now`, `sleep`, formatting. |
| `std/random` | RNG, with the test runner's determinism hook. |
| `std/errors` | Helpers around the built-in `error` type. |

The [reference section](/reference/cli) lists every shipped module.

## Dependencies

`sova.toml` declares external dependencies under `[dependencies]`:

```toml
[dependencies]
strix = { path = "../strix/core" }
"strix/dom" = { path = "../strix/dom" }
my-lib = "1.2.3"
```

Path-based dependencies point at a directory on disk. Versioned
dependencies (planned) will resolve from a registry. After editing the
file, run:

```bash
sova install
```

to populate `.sova/deps/` and refresh the lockfile.

The lockfile (`sova.lock`) is committed; `sova install` reproduces a
known-good dependency tree byte-for-byte (subject to cache state),
and `sova update` is the only command that rewrites it.

### Git dependencies and monorepos

Pull a dependency directly from a git repository by giving its URL plus
a ref selector. The selector picks the exact commit; the priority is
`rev` > `tag` > `branch` > version range:

```toml
[dependencies]
http       = { git = "https://github.com/sova-lang/http",  tag = "v1.4.2" }
sandbox    = { git = "https://github.com/sova-lang/sandbox", branch = "main" }
research   = { git = "https://github.com/sova-lang/research", rev = "abc1234" }
flexible   = { git = "https://github.com/sova-lang/flex",  version = "^2.0" }
```

When the same git repository hosts several Sova packages — a typical
monorepo layout with one `sova.toml` per library — point each
dependency at the subdirectory that holds the package with the
`subdir` field:

```toml
[dependencies]
greet  = { git = "https://github.com/me/sova-libs", tag = "greet-v0.2.0",  subdir = "libs/greet"  }
mathy  = { git = "https://github.com/me/sova-libs", tag = "mathy-v1.4.2",  subdir = "libs/mathy"  }
events = { git = "https://github.com/me/sova-libs", branch = "main",       subdir = "libs/events" }
```

Each entry behaves as if it were the only package in the repository:
the resolver reads the `sova.toml` inside the subdirectory, the
materialiser stages only that subtree under `.sova/deps/`, and the
lockfile records the subdir alongside the commit so the install is
reproducible. The same repository can be cloned just once and serve
several dependencies of your project, each pinned to its own version
through a per-package tag scheme like `greet-v0.2.0`.

`subdir` works the same way on `path = ...` dependencies — handy when
several local libraries live under one directory while you develop
them:

```toml
greet = { path = "../monorepo", subdir = "libs/greet" }
mathy = { path = "../monorepo", subdir = "libs/mathy" }
```

The CLI shorthand `sova add` accepts `subdir=...` as a URL fragment
parameter:

```bash
sova add greet "https://github.com/me/sova-libs#tag=greet-v0.2.0&subdir=libs/greet"
```

The subdir path is interpreted relative to the repository root and
must not escape it; `subdir = "../something"` is rejected at install
time. Missing subdirectories produce a clean diagnostic rather than a
silent broken install.
