---
title: Enums
sidebar_position: 4
---

# Enums

Sova enums combine the convenience of named constants with the power
of tagged unions. A single declaration can hold simple case names,
payload-carrying variants, methods, and shared fields. The `when`
statement matches them exhaustively.

## Simple enums

```sova
enum Color {
    Red,
    Green,
    Blue,
}

let c = Color.Red
```

Each case is a singleton value. You compare them with `==` and pattern
match with `when`.

```sova
let label = when c {
    Color.Red   => "stop"
    Color.Green => "go"
    Color.Blue  => "wait"
    _           => "unknown"
}
```

The `_` branch is the default. The compiler insists on exhaustiveness:
without `_`, every case must appear at least once.

## Payload variants

A variant can carry data:

```sova
enum Result<T, E> {
    Ok(T),
    Err(E),
}

let r: Result<int, string> = Result.Ok(42)
```

`when` extracts the payload:

```sova
let display = when r {
    Result.Ok(value)  => "got " + string(value)
    Result.Err(msg)   => "failed: " + msg
}
```

Inside a `Result.Ok(value)` branch, `value` is bound to the wrapped
value with the right type (`T` in this case).

## Methods on enums

Enums can carry methods just like types do:

```sova
enum Status {
    Active,
    Suspended,
    Banned,

    func canLogIn(): bool {
        return when this {
            Status.Active => true
            _             => false
        }
    }
}
```

`this` inside a method is the enum instance. Methods are dispatched
through the value at runtime and work identically across backend and
frontend.

## Shared fields

A method-bearing enum can declare fields that every variant shares:

```sova
enum Event {
    timestamp: int

    Login,
    Logout,
    Click(target: string),
}

let e = Event.Click(target: "logout-button")
// e.timestamp is available regardless of which variant `e` is
```

Shared fields keep cross-cutting metadata in one place and are
populated through the constructor for each variant.

## Generic enums

Enums can be parameterised exactly like types:

```sova
enum Tree<T> {
    Leaf,
    Node(value: T, left: Tree<T>, right: Tree<T>),
}
```

Combined with `when`, generic enums make recursive data structures
expressive and safe:

```sova
func count<T>(t: Tree<T>): int {
    return when t {
        Tree.Leaf            => 0
        Tree.Node(_, l, r)   => 1 + count(l) + count(r)
    }
}
```

## Exhaustiveness

The compiler tracks exhaustiveness across every `when` expression and
statement that targets an enum. Missing a case is a hard error; the
fix is either to handle it or to add a `_` default. The same rule
applies to options (`none` and `some` are the two implicit cases).
