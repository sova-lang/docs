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

For type declarations and constructors, the instantiation appears in
the type annotation or in the `new` form:

```sova
let xs: List<int> = []
let other = new List<string>()
let opt: option<int> = none
```

## Explicit type arguments at call sites — turbofish

For generic *functions* and *methods*, inference resolves the type
parameters from the argument shapes. When inference would be ambiguous
(e.g. `reduce<R>(seed: R, combine: ...)` where `R` only flows from a
literal `0` that could be `int` or `float`), pin the type explicitly
with the turbofish `::<T>`:

```sova
let n = identity::<int>(42)
let strings = streams.of([1, 2, 3])
    .mapTo::<string>(func(x: int): string { return formatInt(x) })

let total = numbers.reduce::<float>(0.0, sum)
```

The `::` is mandatory. Without it, `name<T>(arg)` is genuinely
ambiguous: the parser can't decide between a generic call and two
chained comparisons `(name < T) > (arg)`. The turbofish is borrowed
from Rust for the same reason it exists there — explicit and
unambiguous, only typed when needed (which, in practice, is rarely;
inference covers nearly every call site).

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

## Wildcards

Sometimes a signature wants to *accept* a generic type but does not
care about the specific parameter at the call site — only that the
caller passes "some instance". Sova spells this with the wildcard
`?`, a first-class member of the type grammar.

The plain wildcard means "any type":

```sova
func describe(x: ?): string {
    return (x as string)
}
```

`?` is equivalent to `any` for the value's static type. The difference
is purely stylistic: `?` reads as "I don't care which type" at a call
site, whereas `any` reads as "this value can be anything for the
lifetime of the binding". Use whichever feels right in context.

### Bounded wildcards

You can pin the wildcard to interface or mixin constraints:

```sova
interface Drawable { func draw() }
interface Sized    { func size(): int }

mixin   Tagged    { tags: []string = [] }

func render(x: ?: Drawable + Sized) {
    x.draw()
    println(x.size())
}

func archive(x: ? with Tagged) {
    for t in x.tags {
        println(t)
    }
}

func attach(x: ?: Drawable with Tagged) {
    x.draw()
    println(x.tags[0])
}
```

The grammar mirrors the constraint grammar for type parameters:

- `? : I1 + I2` — must implement these interfaces.
- `? with M1 + M2` — must mix in these mixins.
- `? : I1 with M1` — combined; interfaces and mixins.

Constraints are accepted by the type checker and recorded in the IR,
but the v1 type system does not enforce them at the call site (the
type-erasure approach treats every parameter as bidirectionally
assignable). They are documentation today, with enforcement coming in
a later release; the syntax is stable so any code you write now
remains valid then.

### When to use wildcards vs named parameters

Use `?` when the type appears in *exactly one position* in the
signature — typically a single parameter. Once a type appears more
than once (a parameter and a return value, or two parameters that
must match), reach for a named parameter:

```sova
// Wildcard is fine: the type appears once, the caller cares only that it implements Sized.
func area(shape: ?: Sized): int { return shape.size() }

// Named parameter: caller and callee both rely on the link.
func swap<T>(a: T, b: T): (T, T) { return (b, a) }
```

If you find yourself writing `?: I` in two parameter slots, switch to
`<T: I>` so the compiler can track that they refer to the same type.

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
