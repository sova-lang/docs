---
title: Types
sidebar_position: 2
---

# Types

Sova has a small core set of primitive types, a handful of compound
types built on them, and user-defined types declared with `type`. The
type system is fully static, with type inference at most binding sites,
and it serves both the Go and the JavaScript backends without
compromise.

## Primitives

| Sova | Go | JavaScript | Notes |
| --- | --- | --- | --- |
| `int` | `int64` | `number` | 64-bit signed integer. |
| `float` | `float64` | `number` | IEEE 754 double-precision. |
| `bool` | `bool` | `boolean` | |
| `string` | `string` | `string` | UTF-8 on the wire, native strings at rest. |
| `char` | `rune` | `number` | A single Unicode code point. |
| `byte` | `byte` (`uint8`) | `number` | An 8-bit unsigned integer, range 0..255. |
| `any` | `any` (`interface{}`) | unrestricted | Escape hatch; explicit casts required to narrow. |

`int` and `float` interconvert implicitly in arithmetic; `byte` and
`int` interconvert implicitly with each other. Everything else needs an
explicit cast.

## Compound types

```sova
let xs: []int = [1, 2, 3]               // slice
let ys: [int 3] = [1, 2, 3]             // fixed-size array
let dict: map<string, int> = {"a": 1}    // map
let pair: (int, string) = (1, "one")     // tuple
let opt: option<int> = none              // option (see next page)
let ch: chan<int> = chan<int>(8)         // buffered channel
let fn: func(int): bool = (x) => x > 0   // function type
```

Tuples can name their fields:

```sova
let p: (x: int, y: int) = (x: 3, y: 4)
println(p.x + p.y)
```

Named fields make destructuring and field access explicit, which is
particularly useful when a function returns multiple values.

### Trailing commas

Array, map, and tuple literals accept an optional trailing comma:

```sova
let xs = [
    "common",
    "rare",
    "legendary",
]

let dict = {
    "alice": 1,
    "bob":   2,
}

let pair = (1, "one",)
```

Useful for multi-line literals where you want every element on
its own line, including the last — keeps git diffs clean when
items are added or reordered. Single-line literals work the same
way: `[1, 2, 3,]` is valid (just stylistically rare). Empty
literals (`[]`, `{}`) work everywhere a typed context is available —
field defaults, typed `let`, return positions, assignments, and
function arguments all propagate the expected element type into
the literal.

## User-defined types

A `type` declaration introduces a nominal record:

```sova
type Point {
    x: float
    y: float
}

let origin = new Point(x: 0.0, y: 0.0)
```

Fields default to a value when one is provided:

```sova
type Counter {
    value: int = 0
    label: string = "ticks"
}
```

With defaults you can call `new Counter()` and get a fully initialised
value. Without them you must pass each missing field as a named
argument.

### Private fields

Prefix a field with `private` to make it visible only inside the
type's own methods:

```sova
type Box<T> {
    private items: []T = []

    func add(item: T) {
        this.items = this.items + [item]
    }

    func size(): int {
        return len(this.items)
    }
}
```

Outside `Box`'s methods, `b.items` is an error; only `b.size()` and
`b.add(...)` are visible.

### Methods, constructors, casts

Inside the body you can declare methods (`func name(args): T { ... }`),
explicit constructors (`new(args) { this.x = ... }`), and casts
(`cast(p: SourceT): Self { ... }`):

```sova
type Celsius {
    private degrees: float

    new(degrees: float) {
        this.degrees = degrees
    }

    cast(f: float): Celsius {
        return new Celsius(degrees: f)
    }

    func freezing(): bool {
        return this.degrees <= 0.0
    }
}

let c: Celsius = -3.5       // implicit cast from float
println(c.freezing())       // true
```

Casts marked at the type are *implicit* in assignment positions: the
compiler inserts the call automatically when a value of `SourceT`
appears where `Self` is expected.

### Struct tags via `@structTag`

When a Sova type compiles to a Go struct (which is what happens for
every `on backend` or `on shared` type, plus the shared-field subset
of a frontend-declared type), the compiler emits Go struct tags
alongside each field. By default it adds a `json:"<fieldname>"` tag so
the value round-trips cleanly through wire serialisation, and that is
all most fields need. When a library on the Go side reflects on
additional tags — GORM looking for `gorm:"primaryKey"`, the validator
package looking for `validate:"required"`, an XML encoder looking for
`xml:"id,attr"` — you reach for `@structTag`:

```sova
type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    @structTag("json", "id")
    id: int = 0

    @structTag("gorm", "size:200;not null")
    @structTag("gorm", "index")
    name: string = ""

    @structTag("gorm", "uniqueIndex")
    email: string = ""
}
```

The annotation takes exactly two string arguments. The first is the
tag *namespace* — anything the consuming Go library reflects on,
typically `gorm`, `json`, `validate`, `xml`, `yaml`. The second is the
literal value the tag should carry. The compiler does not know what
the keys mean — it just splices them into the Go struct tag verbatim
— so you are not limited to a fixed list and a new ORM does not need
compiler support.

Multiple `@structTag` entries with the same namespace stack: their
values are joined with a single space. So the two `@structTag("gorm",
...)` annotations on `name` above produce `` `gorm:"size:200;not null
index"` `` in the generated Go. Library-specific separators (GORM's
`;`, validate's `,`) are something you choose inside the value; Sova
just concatenates.

The Sova-side `json` tag the compiler adds automatically is
overridable. If you supply your own `@structTag("json", ...)`, that
value wins; otherwise the default `json:"<fieldname>"` is emitted.
Sova-private fields (whose names start with `__`) get no tag at all
so they stay invisible to JSON consumers.

`@structTag` is enforced at compile time: the wrong number of
arguments, a non-string argument, or an empty namespace each produce
a precise diagnostic, so a typo never makes it past the build.

### Mixins

A `mixin` declaration is a reusable bundle of fields and methods.
Mixins are *inlined* into every type that lists them under `with`:

```sova
mixin HasId {
    id: int = 0
}

type User with HasId {
    name: string
}

type Order with HasId {
    total: float
}
```

`User` and `Order` both have an `id` field; mixins keep the duplication
in one place without inheritance.

Mixin members can carry the same modifiers as type members — `private`
to keep an inlined helper invisible outside the host type, and
`shared` to opt the inlined member into cross-side emission when the
host type lives in a one-sided file. The modifier is carried with the
member during inlining, so the receiving type does not have to
re-declare the intent:

```sova
mixin Identified {
    shared id: int = 0

    shared func ident(): string {
        return "id=" + (id as string)
    }
}

type User with Identified {                // declared on backend
    shared name: string = ""
    passwordHash: string = ""
}
```

`User` ends up with `id` and `ident()` as shared members (inherited
from the mixin) plus its own shared `name` and its backend-only
`passwordHash`. See the [Sides page](/language/sides#per-member-sharing-on-a-one-sided-type)
for the cross-side semantics in detail.

## Type aliases

A `using` declaration introduces a transparent alias for an existing
type:

```sova
using UserId = int
using Citizen = Person
using LocalThing = inner.Thing
```

Aliases are transparent at the type level: `UserId` and `int` are the
same type, methods on `Person` are visible on `Citizen`, and the
compiler accepts the alias in every position the original is allowed.
Use them to give domain-specific names to primitives or to shorten
fully qualified type references.

## Casts

Sova prefers narrowness. When two types are not directly assignable, an
explicit `as T` cast is required:

```sova
let v: any = 42
let n = v as int          // succeeds at runtime, returns 0 on failure (no panic)
let s = (3.14 as int)     // float -> int truncation
```

Sova's `as` is non-throwing on both backends:

- On Go it lowers to `strconv` conversions or a two-value type
  assertion that discards the error.
- On JavaScript it lowers to `Number(...)`, `String(...)`, `(... | 0)`,
  and similar idioms that return a default on failure.

`as?` (option-cast) is reserved for option-returning conversions but is
not yet wired up at v1; for now use `as T` and check the result
manually if you need to detect failures.
