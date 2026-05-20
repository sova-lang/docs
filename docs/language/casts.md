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

## `as?` (planned)

A future version of the language will accept `as? T` to return
`option<T>` rather than the zero value on failure. The grammar already
parses the form; the type checker currently treats it the same as `as`.
Refrain from relying on it for safety today; check the result manually
if you need to.

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
