---
title: What is Sova?
slug: /intro
sidebar_position: 1
---

# What is Sova?

:::warning Sova is in alpha
The language, the toolchain, and the standard library are all under
active development. Surface syntax can change between releases, the
compiler still has known bugs, and breaking changes are likely
without a deprecation window. Use Sova for exploration and personal
projects today; treat anything you build with it as something you
might need to refactor when the next version lands.
:::

Sova is a multi-tier programming language. You write a single Sova codebase
and the compiler emits two artefacts: a Go binary that runs the backend and
a JavaScript bundle that runs in the browser. The two halves share the same
types, the same package layout, the same standard library, and the same
mental model.

The defining feature is **wiring**. Mark a function with `wire`, declare
which side hosts it, and the compiler synthesises the transport, the
serialisation, the routing, and the authentication for you. Where most
stacks ask you to maintain a REST contract between two codebases, Sova
treats the boundary as just another function call.

## A short example

```sova
package todo on shared

import "std/list"

type Todo {
    id: int
    text: string
    done: bool
}

let __nextId: int = 1
let __todos: []Todo = []

wire func listTodos(): []Todo {
    return __todos
}

wire func addTodo(text: string): []Todo {
    let t = new Todo(id: __nextId, text: text, done: false)
    __nextId = __nextId + 1
    __todos = __todos + [t]
    return __todos
}
```

That is the whole backend. The frontend can call `addTodo("write docs")`
directly; the compiler routes the call over HTTP, signs the session cookie
that authenticates it, returns the new list, and updates the reactive
state that drives the view.

## How Sova feels

Sova is statically typed, lightly functional, and deliberately small. The
syntax is reminiscent of TypeScript and Go, with a few ideas of its own:

- **Sides.** Every file and every declaration belongs to `backend`,
  `frontend`, or `shared`. The compiler knows which artefact each piece of
  code ends up in.
- **Options instead of nulls.** Missing values are explicit
  (`option<int>`) and unwrapped deliberately (`x!`, `??`,
  `guard let`).
- **Enums with payloads.** Algebraic data types with method bodies and
  exhaustive `when` matching.
- **Composables.** UI elements are types that mix in `Composable`; the
  view tree is literal Sova code, not a template language.
- **Reactive fields.** Mark a field `@reactive` and the framework wires up
  subscriptions for you.

## Where to go next

If you want to feel the language in your hands, start with the
[installation guide](/getting-started/install) and the
[hello-world walkthrough](/getting-started/hello-world).

If you prefer to read first, the [language tour](/language/types) covers
types, options, enums, casts, generics, concurrency, and packages, in that
order.

If wiring is what brought you here, jump straight to
[the wiring overview](/wiring/overview).
