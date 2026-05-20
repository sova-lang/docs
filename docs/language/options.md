---
title: Options
sidebar_position: 3
---

# Options

Sova does not have a `null` value. The absence of a value is modelled
with `option<T>` and a single sentinel, `none`. Functions that may fail
to produce a value return `option<T>`, and the type system makes sure
you can never accidentally use `none` as if it were a real `T`.

## Declaring an option

```sova
let maybeName: option<string> = none

func findUser(id: int): option<User> {
    if id == 0 {
        return none
    }
    return new User(id: id)
}
```

The return type can also be inferred: a function that has at least one
non-`none` return path and at least one `none` return path is treated
as returning `option<T>` automatically.

## Implicit lifting

Whenever the context expects `option<T>`, a value of type `T` is
accepted directly:

```sova
func findCached(key: string): option<int> {
    return 7        // lifted to option<int>
}

let opt: option<string> = "hello"   // same lift
```

This means the only place you write `none` explicitly is when you
genuinely want the absent case.

## Reading the value

There are four ways to unwrap an option:

### 1. The postfix `!` operator

The most direct form:

```sova
let user = findUser(42)!
println(user.name)
```

`!` asserts that the option is not `none` and returns the underlying
value. If the option *is* `none`, the host language nil-pointer / null
access fires — this is the unsafe but ergonomic option for situations
where you have already verified presence.

### 2. The coalescing operator `??`

Provide a default value:

```sova
let title = findTitle(id) ?? "untitled"
```

The left side must be `option<T>`, the right side must be `T`. The
result is `T`. No partial values escape.

### 3. `guard let`

`guard let` extracts a value and exits the surrounding scope when the
option is `none`:

```sova
func display(id: int): string {
    guard let user = findUser(id) return ""
    return user.name
}
```

After the `guard let`, `user` has type `User` (not `option<User>`) for
the rest of the function. If the option was `none`, control flow takes
the `return` branch and the rest of the function never runs.

### 4. Pattern matching with `when`

```sova
let label = when findUser(id) {
    none      => "anonymous"
    some(u)   => u.name
}
```

`when` is exhaustive: the compiler insists on both `none` and `some(x)`
branches so you cannot accidentally forget one.

## Flow-sensitive narrowing

Inside an `if x != none { ... }` block, Sova narrows the type of `x`
from `option<T>` to `T` automatically for plain variables:

```sova
let head = list.head
if head != none {
    println(head!.value)   // !.value is the explicit unwrap
}
```

Field accesses (`this.head`) are not narrowed today — copy them to a
local first if you want narrowing.

## `option` on the wire

`option<T>` survives the wire boundary intact: it serialises to
`null` for absent values and to the underlying value for present ones.
A wired function returning `option<User>` automatically encodes the two
cases for both Go and JavaScript, and the frontend receives the same
typed result.
