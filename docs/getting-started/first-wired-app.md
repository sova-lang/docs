---
title: Your first wired app
sidebar_position: 3
---

# Your first wired app

The example from the previous page kept the backend and the frontend in
separate worlds. Wiring is the mechanism that lets them talk to each
other without any glue code on your side. In this guide we build a tiny
counter: the value lives on the backend, the frontend reads and
increments it, and Sova generates everything between the two.

## The shared shape

Create a file `src/shared.sova` describing the data the two sides will
exchange:

```sova
package counter on shared

type Snapshot {
    value: int
    label: string
}
```

The `on shared` annotation means this declaration is visible to both
backend and frontend code. Types like `Snapshot` are the typical content
of a shared file.

## The backend

`src/backend.sova` hosts the state and the wire functions:

```sova
package counter on backend

import "counter"

let __value: int = 0

wire func current(): Snapshot {
    return new Snapshot(value: __value, label: "ticks")
}

wire func tick(): Snapshot {
    __value = __value + 1
    return current()
}
```

Two functions, two wires. The compiler will turn `current()` and
`tick()` into HTTP endpoints on the backend and into typed function
stubs on the frontend.

## The frontend

`src/frontend.sova` calls the wire functions as if they were local:

```sova
package counter on frontend

import "counter"

func main() {
    let snap, _ = current()
    println("starting at " + string(snap.value))

    let next, _ = tick()
    println("now at " + string(next.value))
}
```

Two things to notice:

1. **The frontend has the same package name and imports it like any
   other.** There is no separate "API client" project.
2. **Wired calls return a tuple `(T, WireState)`.** The first element is
   the value, the second is the protocol-level state (Ok,
   Unauthorized, Forbidden, NotFound, Error). For this counter we
   discard it with `_`.

## Build, run, click

```bash
sova build
./dist/output     # in one terminal, runs the backend on :8080
```

Open the generated HTML, watch the console, and you will see the
counter increment with every call.

## What the compiler generated for you

Behind the scenes, Sova:

- Picked an HTTP route for each wire function (`/api/counter/current`,
  `/api/counter/tick`) using the function name as the basis.
- Generated a backend handler that decodes the request, calls your
  function, and emits a JSON payload of the shape `{value, state}`.
- Generated a frontend stub that fetches the route, decodes the JSON,
  and returns the right tuple — including HTTP status translated to
  `WireState`.
- Wired up the session cookie infrastructure so authenticated routes
  (which we cover in [Sessions](/wiring/sessions)) can identify the
  caller automatically.

Customisation is available: you can fix the HTTP method, override the
path, group wires together, set authentication rules, and more.
The [wiring overview](/wiring/overview) walks through every option.

When you are ready, the [project layout
page](/getting-started/project-layout) takes a step back and explains
how to organise a larger codebase.
