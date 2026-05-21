---
title: Interfaces
sidebar_position: 9
---

# Interfaces

An interface in Sova is a named *contract*: a list of method signatures
that any conforming type must provide. Interfaces are how Sova lets you
write code against an abstract capability — "anything I can compare",
"anything I can serialise" — without committing to a particular
concrete type. Together with `with`-style mixins, they cover the
classical inheritance use cases without inheritance itself.

## Declaring an interface

```sova
interface Drawable {
    func draw()
    func area(): float
}
```

An interface declaration has only signatures: each method gives its
name, parameters, and return type, with no body. Sova interfaces can
declare any number of methods.

The declaration introduces a new nominal type. You can use the name
anywhere a type is expected — as a parameter type, a field type, a
return type, or a generic constraint.

## Implementing an interface

A type implements an interface by declaring it in the `implements`
clause:

```sova
type Circle implements Drawable {
    radius: float

    func draw() {
        println("o")
    }

    func area(): float {
        return 3.14159 * this.radius * this.radius
    }
}
```

The compiler verifies the contract: every method the interface
requires must be present with a matching signature. If a method is
missing or has the wrong shape, the build fails with a precise error
pointing at the gap.

A type can implement several interfaces by listing them, separated
with commas:

```sova
interface Serializable { func toJSON(): string }

type User implements Drawable, Serializable {
    func draw()        { ... }
    func area(): float { return 0.0 }
    func toJSON(): string { ... }
}
```

## Using an interface as a type

Once a type implements an interface, you can use the interface as the
static type of a value:

```sova
func render(d: Drawable) {
    d.draw()
    println("area = " + (d.area() as string))
}

let c = new Circle(radius: 2.0)
render(c)
```

At the call site the static type is `Drawable`; at runtime the actual
type is the implementing type, and dynamic dispatch routes
`d.draw()` to `Circle.draw`. Slices of interface values work the way
you would expect:

```sova
let shapes: []Drawable = [new Circle(radius: 1.0), new Square(side: 4.0)]
for s in shapes {
    render(s)
}
```

## Interfaces vs mixins

Sova has two reuse mechanisms with similar surface syntax: interfaces
and mixins. They solve different problems.

| Feature | Interface | Mixin |
| --- | --- | --- |
| Carries method bodies? | No — signatures only. | Yes — fields and methods are inlined. |
| Carries fields? | No. | Yes. |
| Composition shape | `type X implements I` | `type X with M` |
| Use case | Polymorphism: write code against a capability. | Code reuse: share fields/methods across types. |
| Runtime dispatch | Dynamic on the value's runtime type. | None — the methods are part of `X`. |

A type can do both at once:

```sova
mixin Identified {
    id: int = 0
}

interface Stored {
    func save(): bool
}

type User implements Stored with Identified {
    name: string

    func save(): bool {
        return database.insert(this.id, this.name)
    }
}
```

`User` gets an `id` field from the mixin and is statically callable
through the `Stored` interface.

## Generic interfaces

Interfaces accept type parameters:

```sova
interface Comparable<T> {
    func compare(other: T): int
}

type Money implements Comparable<Money> {
    amount: int
    currency: string

    func compare(other: Money): int {
        return this.amount - other.amount
    }
}
```

This is the typical pattern for the F-bounded "any T that knows how to
compare against itself" use case. Combined with type-parameter
constraints, you can write generic functions that require their
inputs to be comparable:

```sova
func max<T: Comparable<T>>(a: T, b: T): T {
    if a.compare(b) >= 0 {
        return a
    }
    return b
}
```

The constraint is recorded on the type parameter and documented in
hover popups; full constraint enforcement at the call site is
scheduled for a future release.

## Interfaces over the wire

Wired functions cannot accept or return interface-typed values
directly. The reason is mechanical: the wire encoder needs to know
the exact runtime shape so the receiver can decode it, and a polymorphic
interface erases that information. The compiler reports
`ErrWireNonTransferableType` if you try.

When you need polymorphism across the wire, encode the variant
explicitly — for example, with a tagged enum:

```sova
enum Shape {
    Circle(radius: float),
    Square(side: float),
}

wire func storeShape(s: Shape) { ... }
```

The enum carries its variant tag through the JSON envelope and the
recipient knows which branch to take.

## A small worked example

The full pattern, end to end:

```sova
package shapes on shared

interface Drawable {
    func draw()
    func area(): float
}

mixin Tagged {
    label: string = ""
}

type Circle implements Drawable with Tagged {
    radius: float

    func draw()        { println("o (" + this.label + ")") }
    func area(): float { return 3.14159 * this.radius * this.radius }
}

type Square implements Drawable with Tagged {
    side: float

    func draw()        { println("☐ (" + this.label + ")") }
    func area(): float { return this.side * this.side }
}

func showAll(items: []Drawable) {
    for it in items {
        it.draw()
        println((it.area() as string))
    }
}
```

Three ideas at once:

- The interface defines the polymorphic surface (`Drawable`).
- The mixin shares the `label` field across both concrete types.
- The collection (`[]Drawable`) holds heterogeneous instances; the
  iteration dispatches dynamically on each one.

That is the entire compositional vocabulary the language provides —
small enough to keep in your head, expressive enough for the real-world
shapes you need.
