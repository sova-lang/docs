---
title: Composable views
sidebar_position: 1
---

# Composable views

The Sova frontend story is built around *composables*: types that opt
into a small mixin called `Composable` and form a tree the framework
mounts to the DOM. There is no template language, no JSX dialect, no
build-time transform on top of the compiler — the view tree is literal
Sova code.

The view runtime lives in the `strix` package (Sova's official UI
framework). Strix ships in the same repository as the language; you
add it to your dependencies and import its `dom` package for HTML
elements and its `core` package for components, reactivity, mounting,
and routing.

## Hello, view

```sova
package myapp on frontend

import "std/browser"
import "strix" using *
import "strix/dom" using *

type App with Composable, Component {
    func view(): Composable {
        return Div(class: "app") {
            H1 { "Hello, Strix" }
            P  { "This is a Sova view." }
        }
    }
}

func main() {
    let app = new App()
    mount(app, browser.doc().body().handle())
}
```

A few things to notice:

- The view is a type declaration with a `view()` method. The
  framework calls `view()` once at mount time, then again whenever a
  reactive dependency changes.
- HTML elements (`Div`, `H1`, `P`, …) are ordinary Sova types that
  mix in `Composable`. They are imported from `strix/dom` and
  invoked with a constructor call, named arguments, and a trailing
  composable block.
- The trailing block contains children. Children can be other
  composables, string literals, or arbitrary expressions whose value
  gets stringified at mount.

## Attributes and children

Constructor named arguments become DOM attributes. The block is the
list of children:

```sova
Div(class: "card", id: "main") {
    H2 { "Title" }
    P(class: "body") {
        Span { "Hello, " }
        Span(class: "name") { user.name }
    }
}
```

Strings, numbers, and boolean expressions all turn into text nodes;
nested composables become subtrees.

## Conditional rendering

`Show` accepts a condition function and renders the children only when
the condition returns `true`:

```sova
Show(cond: func(): bool { return this.loading }) {
    P { "Loading..." }
}
```

Use a function (not a boolean expression directly) so the framework
re-evaluates it on every reactive update.

## Lists

`For` iterates over a reactive collection, mounting one child subtree
per item:

```sova
Ul {
    For(
        each: func(): any { return this.todos },
        key:  func(item: any): any { return (item as Todo).id },
        render: func(item: any): any {
            let t = item as Todo
            return Li(class: if t.done { "row done" } else { "row" }) {
                Span { t.text }
                Button(onClick: func() { this.toggle(t.id) }) { "done" }
            }
        },
    )
}
```

Three arguments:

- `each` returns the current items (a function so the framework can
  re-call it).
- `key` produces a stable identity per item; the framework uses it to
  match old rows to new rows efficiently.
- `render` produces the composable for one item.

When the keyed snapshot changes (an item added, removed, or its
fields changed), the framework patches the DOM with the minimum work.

## Two-way bindings

Inputs accept a `bind:` argument that pairs a getter and a setter:

```sova
Input(
    placeholder: "What needs doing?",
    bind: bind(
        func(): any { return this.draft },
        func(v: any) { this.draft = v as string },
    ),
)
```

The framework wires the input's `value`/`change` plumbing so the
component's field stays in sync with the DOM.

## Mounting

The application owns its root composable and a host DOM node:

```sova
func main() {
    let app = new App()
    mount(app, browser.doc().body().handle())
}
```

`mount(root, host)` returns a `MountRecord` you can pass to
`unmount(...)` if you ever need to tear the tree down (uncommon in a
single-page app).

## Scoped styles

A composable can ship its own stylesheet by mixing in `Style`:

```sova
type App with Composable, Component, Style {
    func style(): string {
        return ".card { padding: 16px; background: #fff; }"
    }

    func view(): Composable {
        return Div(class: "card") { "hi" }
    }
}
```

`style()` returns a CSS string. The framework rewrites the selectors so
they only match elements inside this component, then injects the
result into `<head>` exactly once per component class. Use the
mixin `StyleUnscoped` instead if you want global styles.

## Where it goes from here

Composables are intentionally small — a type, a method, a tree. Most
of the work happens in the reactive runtime (which we cover in the
[next page](/frontend/reactivity)): fields decorated with `@reactive`
participate in change tracking, `effect(...)` and `computed(...)`
chain derived state, and the framework re-runs the view function in
response.
