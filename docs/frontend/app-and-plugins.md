---
title: App and plugins
sidebar_position: 3
---

# The Strix application

Every Strix application starts with a `StrixApp` — a small handle
that pairs a root view with a list of plugins. You build it with
`createApp`, register plugins with `.use(...)`, and start the
application with `.mount(target)`:

```sova
import "std/browser"
import "strix" using *

createApp(func(): any { return new AppRoot() })
    .use(trailPlugin)
    .use(tonguePlugin)
    .mount(browser.doc().body().handle())
```

The shape mirrors Vue 3 on purpose — the chain reads top-down (build,
configure, mount), and the plugins run in registration order *before*
the root view is constructed, so any global state a plugin installs
is visible to the root.

## `createApp(viewFn)`

`createApp` takes a factory function that produces the root composable
and returns a fresh `StrixApp` handle:

```sova
func createApp(viewFn: any): StrixApp
```

The factory shape (`func(): any`) lets the framework defer the call
until after plugins run. A static instance also works — pass
`new MyApp()` directly when you do not need the deferred construction
— but the factory form is the recommended default because it composes
cleanly with plugins that install reactive state, register adapters,
or set up global handlers the root view depends on.

## `.use(plugin)`

`.use` appends a plugin to the application's plugin list. The handle
is returned so the call chains naturally:

```sova
type StrixApp {
    func use(plugin: any): StrixApp
    func mount(target: any): MountRecord
}
```

A plugin is one of two shapes:

- A **callback**: `func(app: any)`. The framework invokes it with the
  `StrixApp` instance so the plugin can inspect or extend it.
- An **install object**: any value with an `install(app)` method.
  Convenient when the plugin needs to carry state or configuration
  fields alongside its setup code.

The router, i18n, and store packages all ship a plugin in one of
these shapes — see their respective pages for the exact name to
register.

```sova
let myPlugin = func(app: any) {
    appCss(":root { --brand: #14b8a6; }")
}

createApp(func(): any { return new AppRoot() })
    .use(myPlugin)
    .mount(browser.doc().body().handle())
```

## `.mount(target)`

`.mount` runs every registered plugin in order, invokes the root view
factory, and attaches the resulting composable tree to the given DOM
node. The return value is a `MountRecord` that you can pass back to
`unmount(...)` if you ever need to tear the tree down.

```sova
let record = createApp(func(): any { return new AppRoot() })
    .mount(browser.doc().body().handle())

// later, on hot reload or teardown:
unmount(record)
```

Mounting is idempotent on the same handle: a second `.mount` call is a
no-op and returns an empty record. If you need a clean restart,
build a fresh `StrixApp` via `createApp` again.

## Global stylesheets with `appCss`

Plugins frequently want to inject design tokens, font imports, or a
small reset stylesheet that the rest of the app depends on. The
`appCss` helper appends a raw CSS string to the global Strix
stylesheet element (`<style data-strix-global>`), deduplicating
identical strings:

```sova
import "strix" using *

let designTokensPlugin = func(app: any) {
    appCss("
        :root {
            --bg: #0f172a;
            --fg: #f8fafc;
            --brand: #14b8a6;
        }
        html, body { margin: 0; background: var(--bg); color: var(--fg); }
    ")
}
```

Component-scoped CSS uses the `Style` mixin and is documented under
[Composable views → Scoped styles](/frontend/views#scoped-styles). Use
`appCss` only for genuinely global rules.

## Writing your own plugin

A typical plugin looks like this — a function that runs whatever
imperative setup the package needs, then either returns or wires
itself into Strix's APIs:

```sova
import "strix" using *
import "strix/nest" using *

type AnalyticsClient {
    @reactive lastEvent: string = ""
    func track(name: string) {
        this.lastEvent = name
    }
}

let analyticsPlugin = func(app: any) {
    let client = useNest(new AnalyticsClient()) as AnalyticsClient
    effect(func() {
        if client.lastEvent != "" {
            // ship to the real backend wire here
        }
    })
}

createApp(func(): any { return new AppRoot() })
    .use(analyticsPlugin)
    .mount(browser.doc().body().handle())
```

A plugin with constructor state and an `install` method works the
same way:

```sova
type AnalyticsPlugin {
    endpoint: string

    func install(app: any) {
        let client = useNest(new AnalyticsClient()) as AnalyticsClient
        // configure with this.endpoint, register effects, etc.
    }
}

createApp(func(): any { return new AppRoot() })
    .use(new AnalyticsPlugin(endpoint: "/wire/analytics"))
    .mount(browser.doc().body().handle())
```

## Order matters

Plugins run in the order you register them, and they all run before
the root view's factory is invoked. This guarantees the root view can
read whatever state a plugin installed without race conditions. If
two plugins both need to be installed, declare them in dependency
order:

```sova
createApp(func(): any { return new AppRoot() })
    .use(designTokensPlugin)   // installs global CSS variables
    .use(tonguePlugin)         // installs translation tables
    .use(trailPlugin)          // installs routes
    .mount(browser.doc().body().handle())
```

## Reference

```sova
func createApp(viewFn: any): StrixApp

type StrixApp {
    rootViewFn: any
    plugins:    []any
    mounted:    bool

    func use(plugin: any): StrixApp
    func mount(target: any): MountRecord
}

func appCss(raw: string)
```
