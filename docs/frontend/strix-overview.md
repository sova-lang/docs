---
title: Strix overview
sidebar_position: 0
---

# Strix

**Strix** is the official frontend framework for Sova. It plays the
role that Vue, React, or Solid play in a JavaScript stack — a runtime
for building component trees, a reactivity system that drives
re-renders, and a set of building blocks (routing, internationalisation,
state containers) that most applications need before they ship.

Strix is written in Sova and compiles down through the regular
frontend pipeline. There is no separate runtime to install, no JSX
dialect, no template compiler — every page in this section is real
Sova code that runs through the same compiler that handles the rest
of your application.

## What is in the box

Strix ships as a small workspace of focused sub-packages. Each one is
versioned and published independently; depend on only what you use:

| Package        | What it gives you                                                         |
| -------------- | ------------------------------------------------------------------------- |
| `strix`        | Core runtime: composables, reactivity, mounting, lifecycle, styles, slots. |
| `strix/dom`    | The HTML element composables (`Div`, `Button`, `Input`, …) plus `Show` and `For`. |
| `strix/trail`  | Client-side router with history-mode navigation and reactive routes.       |
| `strix/tongue` | Internationalisation: a translation table, `t()` helper, and reactive locale. |
| `strix/nest`   | Lightweight singleton store container for shared application state.        |

The first two are the framework's heart and almost every Strix
application depends on them. The remaining three are optional — pull
them in when the feature they cover actually appears in your project.

## Installing

Add the packages you need to `sova.toml`:

```toml
[dependencies]
strix       = "0.1"
"strix/dom" = "0.1"
"strix/trail" = "0.1"
```

Then resolve the lockfile:

```bash
sova install
```

While the registry is still warming up you can also point at a local
clone or a git URL, which lets you track `main` or pin to a specific
commit:

```toml
[dependencies]
strix       = { git = "https://github.com/sova-lang/strix", subdir = "core",  branch = "main" }
"strix/dom" = { git = "https://github.com/sova-lang/strix", subdir = "dom",   branch = "main" }
```

The `subdir` selector is documented under
[Packages → Git dependencies and monorepos](/language/packages#git-dependencies-and-monorepos).

## A complete Strix application

The example below is everything a minimal Strix app needs — a single
component that renders a counter, a click handler that mutates a
reactive field, and the `createApp` chain that mounts it. Save it as
`src/frontend.sova` and run `sova dev`:

```sova
package counterapp on frontend

import "std/browser"
import "strix" using *
import "strix/dom" using *

type CounterView with Composable, Component {
    @reactive count: int = 0

    func view(): Composable {
        return Div(class: "page") {
            H1 { "Strix counter" }
            P  { "Clicks: " + string(this.count) }
            Button(onClick: func() { this.count = this.count + 1 }) {
                "click me"
            }
        }
    }
}

func main() {
    createApp(func(): any { return new CounterView() })
        .mount(browser.doc().body().handle())
}
```

A few things to note:

- The view is a *type*, not a function. The type mixes in `Composable`
  (so the framework can mount it) and `Component` (so lifecycle hooks
  like `onMount` are available).
- The `count` field is decorated `@reactive`. Reads inside `view()`
  subscribe to it; the assignment in the click handler fires the
  subscription, the framework re-runs `view()`, and the DOM updates
  in place.
- `createApp` returns a `StrixApp` builder. You chain `.use(...)` for
  each plugin (the router, the i18n loader, your own setup hooks),
  then `.mount(target)` to start the application against a real DOM
  node.

## Where to go next

| You want to…                                       | Read                                            |
| -------------------------------------------------- | ----------------------------------------------- |
| Understand component trees, slots, styles          | [Composable views](/frontend/views)             |
| Wire reactive fields, effects, computed values     | [Reactivity](/frontend/reactivity)              |
| Bootstrap an app and register plugins              | [App and plugins](/frontend/app-and-plugins)    |
| Add client-side routes and links                   | [Router (`strix/trail`)](/frontend/router)      |
| Translate strings and switch locale on the fly     | [Internationalisation (`strix/tongue`)](/frontend/i18n) |
| Share state between unrelated components           | [Stores (`strix/nest`)](/frontend/stores)       |
