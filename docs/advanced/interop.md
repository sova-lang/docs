---
title: Interop
sidebar_position: 1
---

# Interop with Go and JavaScript

Sova is happy to call into the host languages it compiles to. The
`extern` mechanism lets you bind a Go function, a JavaScript snippet,
or both, to a Sova-side function signature. This is how the standard
library implements its lower-level pieces, and it is the escape hatch
you reach for when something you need is already implemented natively.

## Shared externs

Most stdlib externs target both sides:

```sova
extern {
    func now(): int = {
        frontend: "() => Math.floor(Date.now() / 1000)"
        backend("time"): "func() int64 { return time.Now().Unix() }"
    }
}
```

The block declares one Sova function. The frontend mapping is a
JavaScript expression evaluating to a callable (often an arrow
function literal). The backend mapping is a Go function expression;
the parenthesised module name (`"time"` in this example) is added to
the generated file's import list.

Both branches must agree on the Sova-side signature. The compiler
type-checks the Sova signature, then trusts you to make the host
implementations match.

## Side-specific externs

Drop one of the two branches when you need a host-specific binding:

```sova
extern {
    // frontend only
    func consoleLog(msg: any) = {
        frontend: "(m) => console.log(m)"
    }

    // backend only
    func readFile(path: string): string = {
        backend("os"): "func(path string) string { b, _ := os.ReadFile(path); return string(b) }"
    }
}
```

`consoleLog` is only callable from frontend code; `readFile` only
from backend code. Cross-side calls are compile errors, same as for
plain Sova functions.

## Extern types

You can bring host types into the Sova type system as opaque struct
references. The most common use case is binding a JS library's class
or a Go struct without rewriting it:

```sova
extern type Date {
    frontend: "Date"
}

func now(): Date = {
    frontend: "() => new Date()"
}
```

Sova treats `Date` as a nominal struct. Field accesses fall through to
the host language; there is no Sova-side declaration of the fields.
Use sparingly — every extern type widens the trust surface.

## Go struct tags via `@structTag`

When a Sova `type` compiles to a Go struct (every `on backend` type
plus the shared field subset of frontend types — see
[Sides → Per-member sharing](/language/sides#per-member-sharing-on-a-one-sided-type)),
the compiler reaches for Go struct tags whenever a library on the Go
side wants metadata next to a field. The Sova surface is the
`@structTag` annotation; details and the multi-namespace stacking
rules are documented under
[Types → Struct tags](/language/types#struct-tags-via-structtag).

```sova
type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    @structTag("json", "id")
    id: int = 0
}
```

The compiler does not know which keys a library reflects on — `gorm`,
`validate`, `xml`, anything else — and intentionally does not bake
the list in. Whatever you put in the first argument becomes the tag
namespace verbatim, so a new ORM does not need compiler support to
work end-to-end with Sova-declared models.

## Extern variables

Bind to a constant value:

```sova
extern let __VERSION: string = {
    frontend: "globalThis.__APP_VERSION__"
    backend(""): "version.Tag"
}
```

The two branches must produce the same Sova-side type. The compiler
inlines the value at every reference site.

## When to use extern vs `wire`

`extern` is for *host calls*: native APIs, performance-sensitive
inner loops, things you cannot express in Sova. `wire` is for
*cross-tier calls*: backend logic the frontend invokes.

A frontend file calls a JS library function via `extern`. A frontend
file calls a backend Sova function via `wire`. The two never collide.

## The standard library as a reference

Almost every module in `std/` is implemented as a thin Sova wrapper
around an extern. Reading `std/strings.sova`, `std/sync.sova`, or
`std/json.sova` is the fastest way to learn the patterns. You will
notice:

- Sova-side names mirror the host module's API.
- `_`-prefixed externs are the private wrappers; the public Sova
  function calls them through a typed signature.
- Shared mappings always supply both sides so the same module works
  from any file.
