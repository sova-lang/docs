---
title: Generics
sidebar_position: 6
---

# Generics

Sova generics let you describe types and functions whose internals work
for any choice of element type, with full type checking and zero
runtime cost beyond what the host language already pays. Generics are
*erased* at compile time — every type parameter becomes `any` in the
emitted Go and JavaScript — but the surface language gives you a
strongly typed view.

## Declaring type parameters

A type or function declares its parameters after the name:

```sova
type Pair<A, B> {
    first: A
    second: B
}

func swap<A, B>(p: Pair<A, B>): Pair<B, A> {
    return new Pair(first: p.second, second: p.first)
}
```

You can have any number of parameters; convention is `T`, `U`, `K`, `V`,
`A`, `B`.

The parameter is in scope across the entire declaration body: field
types, method signatures, method bodies, default values.

## Instantiation

Type parameters are usually inferred at the call site:

```sova
let p = new Pair(first: 1, second: "two")   // Pair<int, string>
```

When inference would be ambiguous, supply the arguments explicitly:

```sova
let empty = emptyList<int>()
let opt: option<int> = none
```

For type declarations, the instantiation appears in the type annotation
or in the `new` form:

```sova
let xs: List<int> = []
let other = new List<string>()
```

## Constraints

A type parameter can declare interface and/or mixin constraints. Both
constraint kinds are advisory at v1 — the type checker accepts them and
records them in the IR so future versions can enforce them; for now
constrained parameters are not enforced, but the syntax is stable.

```sova
interface Comparable<T> {
    func compare(other: T): int
}

func sort<T: Comparable<T>>(xs: []T): []T { ... }
```

The grammar:

- `<T: I1 + I2>` — interface constraints joined with `+`.
- `<T: I1 with M1 + M2>` — interfaces *and* mixins, separated by `with`.
- `<T with M1 + M2>` — mixin constraints only.

## Generic types in shared positions

Generic types travel across the wire boundary like any other type:

```sova
type Response<T> {
    data: T
    page: int
}

wire func listUsers(): Response<User> { ... }
```

The frontend stub returns `Response<User>` with the exact type, decoded
from the JSON envelope.

## What generics compile to

- On the Go side, every `T` becomes `any` (`interface{}`). The code
  performs the same type-erasure dance Go's own generics produce when
  compiled with type-erasure compilers.
- On the JavaScript side, types are invisible at runtime; the parameters
  are syntax only and contribute nothing to the bundle.

This trade-off keeps the runtime simple and the binaries small. It does
mean Sova generics are not monomorphised: a `List<int>` and a
`List<string>` share their backing implementation. For most application
code that is exactly the right choice; for numerical hot loops, drop to
specialised types or extern bindings.

## Worked example: a generic list

```sova
type List<T> {
    private items: []T = []

    new() {}

    new(initial: []T) {
        this.items = initial
    }

    cast(src: []T): List<T> {
        let l = new List<T>()
        l.items = src
        return l
    }

    func add(item: T) {
        this.items = this.items + [item]
    }

    func get(idx: int): option<T> {
        if idx < 0 || idx >= len(this.items) {
            return none
        }
        return this.items[idx]
    }

    func next(): option<T> {
        // ...iterable protocol; see std/list for the full implementation.
    }
}
```

This is the actual shape Sova's standard library uses for
`std/list.List<T>`. You can call it three ways and the compiler picks
the right path each time:

```sova
let a = new List<int>()                       // empty
let b = new List<int>(initial: [1, 2, 3])     // explicit ctor
let c: List<int> = [1, 2, 3]                  // implicit cast
```
