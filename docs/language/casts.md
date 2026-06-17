---
title: Casts and conversions
sidebar_position: 5
---

# Casts and conversions

Sova draws a clear line between implicit and explicit conversions.
Implicit conversions are the ones the compiler can do without surprises;
everything else needs an explicit `as` cast. Both forms compile to
non-throwing host-language code on each backend, so a cast that would
fail returns the type's zero value rather than panicking.

## Implicit conversions

A few cases convert automatically.

### Numeric

`int` and `float` interconvert in arithmetic and assignment positions.
`byte` and `int` likewise — handy for working with raw bytes without
ceremony:

```sova
let n: int = 42
let f: float = n         // ok
let b: byte = n          // ok, byte is "int in 0..255"
```

### Option lifting

A value of `T` is accepted wherever `option<T>` is expected. The
implicit lift wraps it with the present-case:

```sova
func findOne(): option<User> {
    return new User(id: 1)   // lifted to option<User>
}
```

### Generic parameters

A value of a generic type parameter `T` is assignable to and from any
other type at the type-system level. Sova performs full generic erasure
at runtime, and the type checker mirrors that by treating `T` as
bidirectionally assignable.

### `any` (widening only)

Any value is assignable to `any`. The reverse — `any` to a concrete
type — requires an explicit cast.

### Type aliases

Aliases declared with `using` are transparent. `using UserId = int`
makes `UserId` interchangeable with `int` in every position.

### Cast declarations on types

A user-declared `cast(p: SourceT): Self { ... }` block makes the
conversion implicit at assignment sites:

```sova
type List<T> {
    private items: []T = []

    new() {}

    cast(src: []T): List<T> {
        let l = new List<T>()
        l.items = src
        return l
    }
}

let xs: List<int> = [1, 2, 3]    // implicit cast via the cast decl
```

The compiler inserts the call to the cast function automatically. This
gives library authors a way to make literals (slices, maps, tuples)
flow into wrapper types without surface ceremony.

## Explicit casts

Everywhere else, use `as T`:

```sova
let v: any = "42"
let s = v as string
let n = v as int        // parses or returns 0; never panics
```

`as T` works for:

- primitive ↔ primitive conversions (`int`, `float`, `bool`, `string`,
  `char`, `byte`)
- `any` to any concrete type (runtime type assertion; returns the type's
  zero value on mismatch)
- struct subtype to its mixin / interface

Sova's cast policy:

- **Never panics on either backend.** The Go side uses `strconv` and
  two-value type assertions; the JavaScript side uses `Number`,
  `parseInt`, and the `||` fallback idioms. Both return zero values on
  failure.
- **Always reflexive.** `x as TypeOf(x)` is a no-op.
- **Transparent through aliases.** Casting to or from a `using` alias
  is the same as casting to or from the underlying type.

## `as?` — safe casts

When you want to distinguish a successful cast from a failed one, use
`as?`. The result is an `option<T>` rather than a plain `T`: a
successful conversion returns `some(value)`, and a failed one returns
`none`. Nothing in the chain panics, on either backend.

```sova
let raw: any = "42"

let parsed = (raw as? int)
when parsed {
    some(n) => println("got " + (n as string))
    none    => println("not a number")
}

let fallback = (raw as? float) ?? 0.0
let userName = (raw as? string) ?? "anonymous"
```

`as?` accepts the same conversions `as` does, plus a few extras that
have an inherent failure case:

| Conversion | `as T` behaviour | `as? T` behaviour |
| --- | --- | --- |
| `string → int` | parses, returns `0` on failure | parses, returns `none` on failure |
| `string → float` | parses, returns `0.0` on failure | parses, returns `none` on failure |
| `string → bool` | `true` only for `"true"`, else `false` | `some(true/false)` for `"true"`/`"false"`, else `none` |
| `any → ConcreteT` | runtime type assertion, returns zero value on mismatch | runtime type assertion, returns `none` on mismatch |
| numeric widening / narrowing (`int ↔ float`, `int ↔ byte`, `int ↔ char`) | always succeeds | always succeeds, wrapped in `some(...)` |
| `int|float|bool|char → string` | always succeeds | always succeeds, wrapped in `some(...)` |

In short, `as?` is the right tool whenever the caller actually wants
to know whether the conversion succeeded. `as` is for the cases where
the failure mode of "use the zero value and keep going" is acceptable
or even desired.

### Pairing with `guard let`

`as?` plays nicely with `guard let`:

```sova
func parseUser(raw: any): option<User> {
    guard let id = (raw as? string) return none
    return findUser(id)
}
```

The guard rejects bad input early; the rest of the function then sees
`id: string` without ceremony.

### Pairing with `??`

The coalescing operator gives you a typed default:

```sova
let port = (env.get("PORT") as? int) ?? 8080
```

If the environment variable is unset or unparsable, `port` falls back
to `8080`.

## Casts between handle-wrapper types

Sova types with a single `handle: any` field follow a special cast
contract. `browserx` uses this shape for every WebIDL wrapper
(`Element`, `HTMLInputElement`, `MouseEvent`, ...), but the rule is
general — any user type with `handle: any` participates.

```sova
let el = browserx.byId("submit")!     // Element
let input = el as? HTMLInputElement   // option<HTMLInputElement>
let force = el as HTMLInputElement    // HTMLInputElement, no runtime check
```

- **`as? T`** runs a runtime `instanceof` check against the
  target type's JS-side constructor. Returns `some(T)` when the
  underlying handle matches, `none` when it doesn't. Use this whenever
  the call site might receive a wrong subtype.
- **`as T`** rewraps the handle without checking. The result is a
  typed wrapper around whatever the handle actually is. Methods that
  the runtime object doesn't carry return `undefined` rather than
  throwing — matching the rest of the cast policy. Use this when you
  already know the type (e.g. you just constructed it).

The check uses the JS engine's prototype chain, not just the tag
name, so a custom element extending `HTMLInputElement` narrows
correctly.

## `instanceof` — type test

`instanceof` evaluates to a `bool` without committing to a cast:

```sova
let h = browserx.byId("submit")!
if h instanceof HTMLInputElement {
    let i = h as HTMLInputElement
    i.setValue("ready")
}
```

For handle-wrapper targets the check matches `as?`'s runtime test:
the underlying handle's prototype chain. For primitives it falls back
to a `typeof` check. `null` / `undefined` receivers always return
`false`; a missing JS-side constructor returns `false` rather than
throwing.

The natural reading is the imperative one — *"is this thing one of
those?"*. Use it as a guard:

```sova
guard let e = (raw as? Event) else { return }
if e instanceof MouseEvent {
    let m = e as MouseEvent
    handleClick(m.clientX(), m.clientY())
}
```

## Putting it together

```sova
type Temperature {
    private celsius: float

    new(c: float) { this.celsius = c }

    cast(f: float): Temperature {
        return new Temperature(c: (f - 32.0) * 5.0 / 9.0)
    }
}

let t: Temperature = 98.6       // implicit cast: Fahrenheit -> Temperature
let raw: any = "98.6"
let f: float = raw as float     // explicit cast, returns 0 on parse failure
let t2: Temperature = f         // implicit cast again
```

Two implicit casts and one explicit cast, no panics anywhere along the
chain. The same code compiles to Go and to JavaScript with the same
semantics.
