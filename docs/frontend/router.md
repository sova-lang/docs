---
title: Router (strix/trail)
sidebar_position: 4
---

# Routing with `strix/trail`

`strix/trail` is the official client-side router for Strix
applications. It hooks the browser's history API, exposes a single
reactive "current path" value, and ships two composables — `Link`
for navigation and `TrailView` for the per-route outlet — that make
SPAs feel like ordinary Strix component trees.

The router runs in **history mode**: URLs look like
`https://example.com/users/42`, navigation uses `pushState` /
`replaceState`, and the back/forward buttons just work because the
router subscribes to `popstate`.

## Installation

Add the dependency:

```toml
[dependencies]
strix         = "0.1"
"strix/dom"   = "0.1"
"strix/trail" = "0.1"
```

```bash
sova install
```

Then import the symbols you want at the top of any frontend file:

```sova
import "strix/trail" using *
```

## Declaring routes

A `Route` is a `path` + a `view` function. Paths support `:param`
placeholders that the router extracts at match time, and the wildcard
pattern `"*"` matches anything (typically used as the last entry for
a 404 page):

```sova
import "strix" using *
import "strix/dom" using *
import "strix/trail" using *

let routes = [
    new Route(path: "/",         view: func(p: any): any { return new HomeView() }),
    new Route(path: "/users",    view: func(p: any): any { return new UsersList() }),
    new Route(path: "/users/:id", view: func(p: any): any { return new UserDetail() }),
    new Route(path: "*",         view: func(p: any): any { return new NotFound() }),
]
```

Each view function receives the matched parameters as `any` — a JS
object shaped `{ id: "42" }` for the `:id` placeholder above. Read it
either by capturing the argument and indexing it, or by calling
`param("id")` from inside the view itself (the latter is usually
nicer because the view stays decoupled from the matcher).

## Installing the router

Call `Trail(routes)` once during startup. It records the route list,
installs the `popstate` listener if it has not been installed yet,
and seeds the reactive `currentPath` from `window.location.pathname`:

```sova
func Trail(routes: []Route)
```

The idiomatic place to call it is inside a Strix plugin:

```sova
let trailPlugin = func(app: any) {
    Trail(routes)
}

createApp(func(): any { return new AppRoot() })
    .use(trailPlugin)
    .mount(browser.doc().body().handle())
```

Subsequent `Trail(...)` calls overwrite the route list but leave the
listener attached — useful for hot reload during `sova dev`.

## Mounting the matched view

The `TrailView` composable is the outlet that renders the
currently-matched route's view function. Drop it inside any layout
the way you would a `<router-view>` in Vue:

```sova
type AppRoot with Composable, Component {
    func view(): Composable {
        return Div(class: "shell") {
            Nav(class: "topnav") {
                Link(to: "/")      { "Home" }
                Link(to: "/users") { "Users" }
            }
            Main(class: "content") {
                TrailView()
            }
        }
    }
}
```

`TrailView` re-renders on every navigation: when the path changes,
the placeholder is cleared, the new route's `view` factory is
invoked, and the resulting composable is mounted in place. If no
route matches, the placeholder stays empty until one does.

## Navigation

`Link` is a declarative anchor that renders as a real `<a href="...">`
(so right-click → "copy link" and command-click → "open in new tab"
behave like users expect) and intercepts plain left-clicks to
trigger a client-side `push` instead of a full page reload:

```sova
Nav {
    Link(to: "/")          { "Home" }
    Link(to: "/users")     { "Users" }
    Link(to: "/users/42")  { "Alice" }
}
```

Modifier-clicks (cmd / ctrl / shift / middle-click) fall through to
the browser's native open-in-new-tab handling.

For imperative navigation — after a login, after a form submission,
inside a `wire` callback — call one of the four navigation helpers
directly:

| Helper          | What it does                                                |
| --------------- | ----------------------------------------------------------- |
| `push(path)`    | Push a new history entry and navigate to `path`.            |
| `replace(path)` | Replace the current history entry (no back-button restore). |
| `back()`        | `history.back()` — equivalent to the browser's back button. |
| `forward()`     | `history.forward()` — equivalent to the forward button.     |

```sova
func handleLogin() {
    let ok, _ = backend.signIn(this.email, this.password)
    if ok {
        replace("/dashboard")
    }
}
```

## Reading the current path and params

Three helpers give read access to the current route:

```sova
func currentPath(): string         // the active path, e.g. "/users/42"
func currentParams(): any          // the extracted params, or none on no-match
func param(name: string): string   // single-param shortcut; "" on miss
```

All three read `__router.currentPath` (a `@reactive` field) under the
hood, so calling them inside an `effect`, a `computed`, or a
composable's `view()` automatically subscribes that scope to
navigation changes.

```sova
type UserDetail with Composable, Component {
    func view(): Composable {
        let id = param("id")
        return Div(class: "profile") {
            H1 { "User " + id }
            P  { "Path is " + currentPath() }
        }
    }
}
```

When the user navigates from `/users/42` to `/users/77`, `param("id")`
returns the new value, the view function re-runs, and the DOM
updates in place.

## A complete worked example

```sova
package todoapp on frontend

import "std/browser"
import "strix" using *
import "strix/dom" using *
import "strix/trail" using *

type HomeView with Composable, Component {
    func view(): Composable {
        return Div { H1 { "Welcome" } }
    }
}

type UserDetail with Composable, Component {
    func view(): Composable {
        return Div { H1 { "User " + param("id") } }
    }
}

type NotFound with Composable, Component {
    func view(): Composable {
        return Div { H1 { "Page not found" } }
    }
}

type AppRoot with Composable, Component {
    func view(): Composable {
        return Div(class: "shell") {
            Nav {
                Link(to: "/")          { "Home" }
                Link(to: "/users/42")  { "Alice" }
                Link(to: "/missing")   { "404" }
            }
            Main { TrailView() }
        }
    }
}

let routes = [
    new Route(path: "/",          view: func(p: any): any { return new HomeView() }),
    new Route(path: "/users/:id", view: func(p: any): any { return new UserDetail() }),
    new Route(path: "*",          view: func(p: any): any { return new NotFound() }),
]

func main() {
    createApp(func(): any { return new AppRoot() })
        .use(func(app: any) { Trail(routes) })
        .mount(browser.doc().body().handle())
}
```

## Reference

```sova
type Route {
    path: string
    view: any       // func(params: any): any
}

func Trail(routes: []Route)

func push(path: string)
func replace(path: string)
func back()
func forward()

func currentPath(): string
func currentParams(): any
func param(name: string): string

type Link with Composable {
    to:    string
    class: any
    id:    any
}

type TrailView with Composable
```
