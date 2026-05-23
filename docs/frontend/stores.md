---
title: Stores (strix/nest)
sidebar_position: 6
---

# Shared state with `strix/nest`

`strix/nest` is the simplest possible state container: one helper,
`useNest`, that hands every call site the *same* instance of a given
class. It is the equivalent of Pinia's `defineStore` or Zustand's
`create`, scaled all the way down to "one function plus a Map".

When a component holds state that nobody else needs, keep it as a
`@reactive` field on the component. When two unrelated components
need to read or write the same state, lift it into a nest store and
let both sides go through `useNest` to get the shared instance.

## Installation

```toml
[dependencies]
"strix/nest" = "0.1"
```

```bash
sova install
```

```sova
import "strix/nest" using *
```

## Declaring a store

A store is an ordinary Sova type. Field reactivity comes from
`@reactive`; methods are plain methods. The optional `Store` mixin
adds nothing at runtime — it is a documentation marker that signals
"this type is intended to be used as shared state":

```sova
import "strix" using *
import "strix/nest" using *

type CounterStore with Store {
    @reactive count: int = 0

    func inc() {
        this.count = this.count + 1
    }

    func reset() {
        this.count = 0
    }
}
```

You can omit `with Store` and `useNest` will still work — the mixin
is there so a reader skimming a file can immediately tell that
`CounterStore` is supposed to be shared, not instantiated ad-hoc.

## Reading the singleton

`useNest(prototype)` looks up the singleton for the *class* of
`prototype`. The first call for a given class wins: the prototype
you passed in is registered as the instance and returned. Subsequent
calls for the same class ignore their argument and return that first
instance:

```sova
func useNest(prototype: any): any
```

Because Sova's current generics are type-erased, the return type is
`any` — recover the concrete type with an `as` cast at the call
site:

```sova
let counter = useNest(new CounterStore()) as CounterStore
counter.inc()
println(counter.count)   // 1
```

A component that wants to participate in the same store does the
exact same thing:

```sova
type CounterDisplay with Composable, Component {
    func view(): Composable {
        let counter = useNest(new CounterStore()) as CounterStore
        return Div { "count: " + string(counter.count) }
    }
}

type CounterControls with Composable, Component {
    func view(): Composable {
        let counter = useNest(new CounterStore()) as CounterStore
        return Div {
            Button(onClick: func() { counter.inc() })   { "+1" }
            Button(onClick: func() { counter.reset() }) { "reset" }
        }
    }
}
```

`useNest(new CounterStore())` in `CounterControls` returns the exact
same instance that `CounterDisplay` got. Clicking `+1` writes to the
shared `count`, the setter fires, and `CounterDisplay`'s view
re-renders because it reads the same field.

The `new CounterStore()` you pass in is effectively a fallback
constructor for the *first* call. After that, the constructor is
discarded. This works out fine in practice — the fields' default
values are right there in the type declaration, so the prototype
carries no surprise state.

## When to use a nest vs. module singletons

Sova already gives you a perfectly good way to share state without
any helper at all: a `let` at the top level of a `shared` module is
constructed once per build. If you prefer that style — explicit,
imported by name, no `as` cast — feel free:

```sova
// stores/counter.sova
package myapp/stores on frontend

type CounterStore {
    @reactive count: int = 0
}

let counter = new CounterStore()
```

```sova
// anywhere else
import "myapp/stores"

stores.counter.count = stores.counter.count + 1
```

The trade-offs:

| Approach              | Pros                                                                 | Cons                                                                  |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `useNest(...)`        | Component-local lookup; no need to import the store everywhere; uniform shape across the codebase. | Returns `any`; needs `as` cast at the call site.                       |
| Module-level `let`    | Concrete type; no cast; clear ownership in one file.                 | Forces every consumer to import the module; harder to swap in tests.   |

Both produce identical runtime behaviour — `useNest` is a thin
convenience wrapper, not a different reactivity model. Pick whichever
ergonomics your team prefers and stick with it.

## Combining stores

A nest store is a perfectly ordinary type, so a larger store can
compose smaller ones with normal field references. Pull whichever
sub-stores you need from `useNest` in the constructor or on first
access:

```sova
type Auth {
    @reactive userName: string = ""
    @reactive token: string = ""
}

type Cart {
    @reactive lines: []string = []
    func add(item: string) {
        this.lines = this.lines + [item]
    }
}

type AppStore with Store {
    auth: Auth = useNest(new Auth()) as Auth
    cart: Cart = useNest(new Cart()) as Cart
}

// usage:
let app = useNest(new AppStore()) as AppStore
app.cart.add("Sova T-shirt")
```

Each sub-store is itself a singleton, so the `AppStore` is purely
notational — it is a convenient namespace, not a wrapper that hides
shared identity.

## Testing tip

Because `useNest` keys on the JavaScript class (the `constructor`
reference), a fresh `import` of the test runner does not reset the
nest. If a test needs a clean slate, write a store method that
resets the relevant fields (`counter.reset()` above) and call it
from `beforeEach`. Avoid relying on a hidden "wipe the singleton"
hook — the explicit reset is easier to reason about and keeps the
production code honest.

## Reference

```sova
mixin Store {}

func useNest(prototype: any): any
```
