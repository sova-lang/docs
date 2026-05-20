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

## Reactive frontend integration

A wired var paired with the reactive runtime (see
[Reactivity](/frontend/reactivity)) becomes a reactive value
automatically. Wrap it with `effect(...)` in a component and the view
re-renders whenever the backend publishes a new value.

```sova
import "myapp/backend"

effect(func() {
    document.title = "Active: " + string(activeUsers)
})
```

Every broadcast triggers the effect, the title updates, and the user
sees the live number without any manual subscription bookkeeping.

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
