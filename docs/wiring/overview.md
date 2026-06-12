---
title: Wiring overview
sidebar_position: 1
---

# Wiring overview

Wiring is the feature that gives Sova its identity. Mark a function
with `wire` and the compiler synthesises the transport, the
serialisation, the routing, and the authentication for you. The two
sides of your application talk to each other through ordinary function
calls; the compiler is the one writing the REST scaffolding.

## A minimal wired function

```sova
package todoapp/backend on backend

import "todoapp/shared"

let __todos: []shared.Todo = []

wire func listTodos(): []shared.Todo {
    return __todos
}

wire func addTodo(text: string): []shared.Todo {
    let t = new shared.Todo(id: nextId(), text: text, done: false)
    __todos = __todos + [t]
    return __todos
}
```

On the frontend:

```sova
package todoapp/frontend on frontend

import "todoapp/backend"

func loadInitial() {
    let initial, _ = backend.listTodos()
    println("loaded " + string(len(initial)) + " todos")
}
```

The compiler generates an HTTP handler for `listTodos` and `addTodo`,
plus a frontend stub that fetches them and decodes the result. The two
sides talk to each other as if they were one program.

## What `wire` decorates

`wire` can prefix a function declaration, a `let`/`const` declaration,
or a whole block of declarations (a *wire group*). The most common form
is the function decorator.

### Wired functions

```sova
wire func current(): Snapshot { ... }
```

The function lives on the backend; the frontend gets a stub of the same
name with the same signature. Every wired function automatically:

- Returns a tuple `(T, WireState)`. The second element communicates
  protocol-level success or failure (Ok / Unauthorized / Forbidden /
  NotFound / Error). The frontend caller almost always destructures
  with `let value, state = call(...)`.
- Becomes async on the frontend (a Promise under the hood).

### Wired vars and consts

A wired `let` or `const` is a server-owned value the frontend reads:

```sova
wire let appVersion: string = "1.0.0"
```

The frontend stub fetches the value on demand and caches it
locally. `wire const` adds the "read-only on the wire" constraint.

### Wired groups

When several functions share the same options, group them:

```sova
wire(authn: true) {
    func listUsers(): []User { ... }
    func updateUser(u: User): User { ... }
}
```

Every declaration in the block inherits the `authn: true` option.
Inner declarations can override individual options.

## Options

`wire` accepts a handful of options.

### `method`

Override the auto-derived HTTP method. By default, Sova picks GET for
functions whose names begin with `get`, `list`, or `find`, and POST
otherwise.

```sova
wire(method: "PATCH") func updateUser(u: User): User { ... }
```

Allowed values: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.

### `path`

Override the auto-derived route. By default, Sova maps a function name
to a kebab-cased path under `/api/<package>/`:

```
listTodos        ->  GET   /api/todoapp/backend/todos
addTodo          ->  POST  /api/todoapp/backend/todo
getUserById(id)  ->  GET   /api/todoapp/backend/user/:id
```

Override with:

```sova
wire(path: "/api/v2/users/:id") func getUser(id: string): User { ... }
```

Use `:name` placeholders to bind path segments to parameters of the
same name.

### `transport`

Pin the wire to a specific transport. Backend wires accept `http`
(default) or `ws`; frontend wires accept `ws` (default) or `sse`.
Other combinations are rejected at compile time. Use this when you
want a websocket-based wire for push semantics.

### `authn`

Authentication. Defaults to `true` (every wire is authenticated). Set
`authn: false` for public endpoints:

```sova
wire(authn: false) func health(): string { return "ok" }
```

When `authn` is true the wire expects a valid session cookie; missing
or expired session → `WireState.Unauthorized` (HTTP 401).

### `authz`

Authorization. Pass a list of required roles:

```sova
wire(authz: ["admin"]) func banUser(id: string): User { ... }
```

The handler checks `session.hasRole("admin")` and returns
`WireState.Forbidden` (HTTP 403) when the check fails.

## Typed values across the wire

A common pain point with JSON-over-HTTP frameworks is that the data
arrives as a property bag: the wire returns `{ id: 42, name: "Alice" }`,
your client gets a plain JavaScript object, and methods you declared on
the class are unreachable. You then write a constructor that copies
fields out of the bag and rebuilds an instance — DTO code that exists
only to undo the JSON round-trip.

Sova does this work for you. Every wired function whose return type is
a Sova `type` (or a container of one — a slice of users, an option of
a tag, a tuple, a map with struct values) is wrapped on the frontend
side in a small reviver. The reviver walks the JSON, looks up the
declared class in a runtime registry, and produces a real instance
with the right prototype:

```sova
type User {
    id: int = 0
    name: string = ""

    func display(): string {
        return name + " (#" + (id as string) + ")"
    }
}

wire(authn: false) func getUser(): User { ... }
```

```sova
// frontend
import "myapp/backend"

func main() {
    let u, _ = getUser()
    println(u.display())              // → "Alice (#42)"
}
```

`u` is a `User` instance, not a plain object, and `u.display()`
dispatches to the method body that was emitted alongside the class.
The same revival also works recursively: a `User` whose
`tags: []Tag` field comes through the wire produces an array of `Tag`
instances, each with its own methods callable.

Sova-side struct types declared `on shared` (or with `shared` members
in a one-sided file — see [Per-member sharing](/language/sides#per-member-sharing-on-a-one-sided-type))
participate automatically. There is nothing to opt in to: if the wire
signature names a class type, you get instances back.

The same mechanism applies in the other direction. A wired function
that takes a class type as a parameter receives an instance when called
from JavaScript code that constructed one; backend Go code receives a
typed Go struct via reflection-driven unmarshalling. And for frontend
wires invoked from the backend (the inverse direction in a sessions-based
push), the WebSocket dispatcher revives each argument against the
declared parameter type before calling the registered handler. The
upshot is that class instances round-trip across the boundary in both
directions without any per-wire helper code.

## What you get for free

When the build runs, the compiler:

1. **Picks an HTTP route and method** for each wire, unless you
   override them.
2. **Emits a backend handler** that decodes path / query / body, looks
   up the session, runs `authn`/`authz`, invokes your function, and
   serialises the result as `{value, state}`.
3. **Emits a frontend stub** with the same name and signature. The
   stub `fetch`es the right URL, JSON-encodes any body, decodes the
   response, and *revives* class-typed return values so methods are
   immediately callable.
4. **Registers everything in the generated `main()`** so the backend
   binary starts an HTTP server on the configured port without you
   writing any plumbing.

The next pages cover the parts of wiring you reach for less often but
need eventually: [sessions](/wiring/sessions),
[authorization](/wiring/authorization), and the [wired state
form](/wiring/wired-state) for shared mutable values.
