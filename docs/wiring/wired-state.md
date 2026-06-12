---
title: Wired state
sidebar_position: 4
---

# Wired state

Most cross-tier traffic flows through wired functions: the frontend
calls, the backend answers. For shared *values* — flags, configuration,
or any data the frontend wants to read directly — Sova offers wired
vars and consts.

## A wired const

```sova
package myapp/backend on backend

wire const appVersion: string = "1.0.0"
wire const featureFlags: map<string, bool> = {"newDashboard": true}
```

On the frontend, both are available as ordinary values you read with
their name:

```sova
import "myapp/backend"

println(appVersion)
if featureFlags["newDashboard"] {
    showNewDashboard()
}
```

Under the hood the compiler emits:

- On the backend: an `appVersion`/`featureFlags` global plus a wire
  GET handler that returns its current value.
- On the frontend: a stub that fetches the value lazily on first
  access and caches the result.

`wire const` is a one-way read: the frontend cannot write back. The
const guarantee is enforced at compile time.

## A wired let

`wire let` widens the semantics: the value is still owned by the
backend, but the backend can publish updates and the frontend
subscribes.

```sova
wire let activeUsers: int = 0
```

Reading `activeUsers` on the frontend behaves the same way as a wired
const. The difference is on the backend: the variable is broadcast
whenever it is reassigned, and connected frontend sessions receive the
update through their websocket.

To opt in to broadcasting, declare the wire transport as websocket:

```sova
wire(transport: "ws") let activeUsers: int = 0
```

Without the transport hint, the variable behaves like a const that
the backend happens to be able to write to (no broadcast).

## Reactive integration

A `@reactive wire let` is the reactive form of a wired var: every
push from the backend not only updates the mirror, but also notifies
any [Strix](/frontend/strix-overview) `effect`, `computed`, or
`view()` that read the value. The two pieces — backend push and
frontend reactivity — share the same observer protocol Strix uses for
ordinary `@reactive` class fields, so wired state composes with
component state without any glue code.

```sova
package game on backend

@reactive wire let ingameTime: int = 0

wire(authn: false) func tick() {
    ingameTime = ingameTime + 1
}
```

```sova
package game/client on frontend

import "strix" using *
import "strix/dom" using *
import "game" using { ingameTime, tick }

type Clock with Composable, Component {
    func view(): Composable {
        return Div {
            P { "Elapsed: " + (ingameTime as string) + "s" }
            Button(onClick: doTick) { "Tick" }
        }
    }

    private func doTick() {
        let _ = tick()
    }
}
```

Reading `ingameTime` inside `view()` registers the wire let as a
dependency of the view's effect. When any session calls `tick()`,
the backend handler reassigns `ingameTime`; the compiler-emitted
broadcast pushes the new value to every connected frontend; the
listener on each frontend writes through a reactive setter that
fires every dependency observer; Strix schedules the view for
re-rendering on the next microtask; and the DOM updates the
displayed seconds. None of those steps require user code: the
modifier on the declaration is the only opt-in.

The same machinery makes `computed` derivations of wire lets work
out of the box. A `computed<string>(func(): string { return
"Game time: " + (ingameTime as string) + "s" })` re-evaluates on
every push and propagates the new string through whichever consumers
read its `.value`.

If you only need the backend-push delivery — without the Strix
re-render — drop the `@reactive` modifier. The bare `wire let` form
still mirrors the value on the frontend and updates it on push, but
reads outside an effect do not subscribe and views do not re-render
when the value changes. See [Strix reactivity](/frontend/reactivity)
for the underlying primitives.

## When to reach for a wire function vs a wired var

| You want… | Use |
| --- | --- |
| A typed RPC the frontend triggers explicitly | `wire func` |
| A backend value the frontend reads occasionally | `wire const` |
| A backend value the frontend reads often or watches | `wire let` |
| A backend value with strong push semantics | `wire(transport: "ws") let` |

The compiler accepts all four shapes without ceremony; pick the one
that matches how the frontend actually uses the value.

## Authentication still applies

Wired vars respect the same `authn` / `authz` options as wired
functions:

```sova
wire(authn: true, authz: ["admin"]) let internalMetrics: map<string, int> = {}
```

An unauthenticated frontend reading `internalMetrics` receives
`WireState.Unauthorized` from the implicit getter.
