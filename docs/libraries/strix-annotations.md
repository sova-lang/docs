---
title: Strix annotations
sidebar_position: 2
---

# Strix annotations

**`strix/annotations`** is a synth pack that wraps a small set of
Strix patterns in `@`-prefixed shortcuts:

- `@Reactive` — mark every field of a type as `@reactive` in one shot.
- `@ReactiveShared` — same, but only fields with the `shared`
  modifier.
- `@Route(path)` — register a function as a routable view; emits both
  a metadata tag and a build-wide registry entry.
- `@PageTitle(title)` — attach a static title to a view.

Like the rest of Sova's annotation packs, every entry expands at
compile time to existing primitives (`@reactive`, `@structTag`,
registry appends). The pack adds nothing at runtime — see
[Annotations](/language/annotations) for the underlying machinery.

## Installing

```toml
[dependencies]
"strix/annotations" = { version = "^0.1.0" }
```

```sova
import "strix/annotations" using *
```

## `@Reactive` — flatten the per-field `@reactive` boilerplate

Strix tracks reactivity per field with the built-in `@reactive`
annotation. Stores often want every field to be reactive — writing
the annotation once per line gets tedious.

```sova
import "strix/annotations" using *

@Reactive
type CounterStore {
    count: int = 0
    label: string = ""
    history: []int = []
}
```

expands to:

```sova
type CounterStore {
    @reactive count: int = 0
    @reactive label: string = ""
    @reactive history: []int = []
}
```

Under the hood:

```sova
synth Reactive on type T {
    for f in T.fields {
        emit on f {
            @reactive
        }
    }
}
```

The `for ... in T.fields` loop visits every field of the target type
and splices `@reactive` onto each.

### `@ReactiveShared` — only the shared subset

Cross-side types (a backend `type User` whose shared subset round-trips
to the frontend over the wire) often want **only the shared fields**
to be reactive. `@ReactiveShared` adds a `where f.isShared` filter to
the loop:

```sova
@ReactiveShared
type User {
    shared name: string = ""
    shared avatarUrl: string = ""
    passwordHash: string = ""   // not shared → no @reactive
}
```

After expansion only `name` and `avatarUrl` carry `@reactive`. The
backend-only `passwordHash` is untouched.

## `@Route(path)` — register a routable function

A Strix frontend application currently registers routes by building
an array of `Route` instances and passing it to `Trail([...])`:

```sova
import "strix/trail" using *

Trail([
    new Route { path = "/", view = HomeView },
    new Route { path = "/users/:id", view = UserView },
])
```

`@Route(path)` lets each view function self-register:

```sova
import "strix/annotations" using *

@Route("/")
func HomeView(): Composable {
    return Div { "home" }
}

@Route("/users/:id")
func UserView(params: any): Composable {
    return Div { "user: " + params.id }
}
```

What expansion does:

```sova
synth Route(path: string) on func F {
    emit on F {
        @structTag("strix.route", path)
    }
    emit append to strixRoutes {
        path
    }
}
```

Two effects:

1. **A `@structTag("strix.route", path)` tag** is attached to the
   function for downstream codegen / introspection tools that scan
   annotated functions.
2. **The path string is appended to a build-wide `strixRoutes`
   registry** stored in the compiler cache under
   `synth_reg:strixRoutes` as a `[]Expr`. A future Strix codegen
   plugin (or your own generator) can read it to materialise the
   `Trail([...])` call automatically.

Today the registry side-channel is informational — the standard
pipeline does not consume it. You still wire `Trail([...])` manually,
but the `@structTag` makes annotated routes discoverable in tooling
and `sova synth expand` shows them in the rendered source.

## `@PageTitle(title)` — static title tag

Attach a constant title to a view type for SEO or browser-tab purposes:

```sova
@PageTitle("Dashboard - Acme")
type DashboardView with Component {
    func view(): Composable {
        return Div { "..." }
    }
}
```

Expands to `@structTag("strix.title", "Dashboard - Acme")` on the
type. The tag is metadata only — read it from a layout component or a
custom plugin that scans for `strix.title` tags. The pack ships it as
a stable home for the "this view has a title" convention so multiple
projects agree on the same tag namespace.

## See also

- **[Strix overview](/frontend/strix-overview)** — the framework this
  pack decorates.
- **[Annotations](/language/annotations)** — the synth system that
  powers this pack. Read it to add your own Strix decorators
  (`@Computed`, `@OnMount(...)`, ...) on top of the existing
  primitives.
- **[GORM annotations](/libraries/gorm-annotations)** — the companion
  pack for backend models; same conventions, different surface.
