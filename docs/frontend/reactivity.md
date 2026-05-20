---
title: Reactivity
sidebar_position: 2
---

# Reactivity

Sova's reactive runtime is the part of the framework that keeps a
component's view in sync with its state. The model is small: fields
decorated `@reactive` track reads and writes, `effect(...)` re-runs
a closure whenever its read set changes, and `computed(...)` is the
same idea producing a derived value.

You almost never have to think about it. Declare a field reactive,
read it inside the view function, and the framework re-renders when
the field changes. The remainder of this page is the contract for the
cases where you do.

## `@reactive` fields

```sova
type Counter with Composable, Component {
    @reactive count: int = 0
    @reactive label: string = "ticks"

    func view(): Composable {
        return Div { string(this.count) + " " + this.label }
    }
}
```

Each `@reactive` field generates:

- A getter that records the field's *read* in the currently active
  tracking scope.
- A setter that fires every observer registered for the field.
- An observers list. The runtime uses it to invalidate dependent
  computations.

Writes go through the setter automatically when you assign to the
field: `this.count = this.count + 1` is enough.

## `effect`

`effect(fn)` runs `fn` once. Any reactive field `fn` reads is added to
its dependency set; whenever any of those fields change, `effect`
schedules `fn` to run again. The return value is a stop function;
calling it cancels the effect.

```sova
let stop = effect(func() {
    document.title = "Hi, " + user.name
})

// later, when you want to stop tracking:
stop()
```

Effects are how the framework re-runs `view()` in your components.
You will rarely create them yourself; they are the right primitive
when you want to mirror reactive state into a non-Strix sink (a
WebSocket message, the document title, a window resize handler).

## `computed`

A `computed(fn)` value is an effect that returns a value. The closure
recomputes whenever its dependencies change, and the result is
cached:

```sova
let total = computed(func(): int {
    return this.items.length * this.price
})

println(total.value)
```

Reads of `total.value` participate in the tracking system, so an
effect or view that reads it picks up changes transitively.

## Wiring reactivity to wires

Wired values plug in cleanly. A `wire let value: int = 0` is
already reactive on the frontend; reading it inside `effect(...)`
subscribes to backend pushes.

A common pattern: keep server state in a reactive field, populate it
with a wire call, and let the view re-render when it lands:

```sova
type App with Composable, Component {
    @reactive todos: []Todo = []

    func loadInitial() {
        let initial, _ = backend.listTodos()
        this.todos = initial
    }

    func view(): Composable {
        return Ul {
            For(
                each: func(): any { return this.todos },
                key:  func(item: any): any { return (item as Todo).id },
                render: func(item: any): any {
                    let t = item as Todo
                    return Li { t.text }
                },
            )
        }
    }
}
```

The first call to `loadInitial()` resolves the wire, assigns the
result to `this.todos`, the setter fires, and the view re-renders.

## Batched updates

The runtime coalesces effect re-runs into a microtask: multiple writes
in the same synchronous block produce a single re-render. Most of the
time you do not have to think about it; if you ever need to force a
flush (typically inside tests), the `runtime.flush()` helper is
exposed by Strix.

## Pitfalls

A few things to watch out for:

- **Methods that read reactive fields must be called from inside an
  effect** to participate in tracking. The view function is one such
  effect; manual subscription helpers from Strix are the others.
  Code outside an effect can read fields freely but does not get
  re-run.
- **Reactive fields hold their *current* value.** Read them as you
  would any other field; do not wrap them in extra getters.
- **Don't mutate inside the view.** If you write to a reactive field
  from the body of `view()`, the framework re-schedules itself,
  triggering an infinite loop. Move the write into an event handler
  (`onClick`, `onSubmit`) or into a lifecycle hook.

## Lifecycle hooks

Components opt into lifecycle hooks by defining methods:

```sova
type App with Composable, Component {
    func onMount() {
        this.loadInitial()
    }

    func onUnmount() {
        // clean up subscriptions, timers, etc.
    }
}
```

`onMount` runs once after the framework attaches the component's DOM.
`onUnmount` runs once before the DOM is removed. Use them for any
imperative setup that does not belong in the view function.
