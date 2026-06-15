---
title: Annotations
sidebar_position: 7
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
- `@StyleFile(path)` — point a component at an external `.css` file
  and skip the inline-string boilerplate.

Like the rest of Sova's annotation packs, every entry expands at
compile time to existing primitives (`@reactive`, `@structTag`,
registry appends). The pack adds nothing at runtime — see
[Annotations](/language/annotations) for the underlying machinery.

Every annotation in this pack is declared `on frontend` — see
[side constraints](/language/annotations#side-constraints). The
compiler rejects `@Reactive` on a backend type at the use site with
a clear diagnostic, so accidentally putting a Strix annotation in
the wrong place is impossible. The pack still applies to
declarations in `on shared` files because their frontend half is a
real JS class that participates in Strix's reactivity.

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
synth Reactive on frontend type T {
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
synth Route(path: string) on frontend func F {
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

## `@StyleFile(path)` — external CSS

Strix's `Style` mixin asks each component for `func style(): string`
that returns CSS. Authoring CSS inline as a JS-escaped string is
unreadable past two rules. `@StyleFile` lets the component point at
a real `.css` file next to it on disk:

```sova
type Button with Composable, Component, Style {
    @StyleFile("./Button.css")

    func view(): Composable {
        return Element("button", "primary") { "Click" }
    }
}
```

With `Button.css` sitting next to `Button.sova`:

```css
.primary {
    background: rebeccapurple;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
}

.primary:hover {
    background: #4f3b6f;
}
```

What the synth does:

```sova
synth StyleFile(path: string) on frontend type T {
    emit @embed(path) private __strixStyleSource: string = ""
    emit func style(): string {
        return this.__strixStyleSource
    }
}
```

Two effects:

1. **Injects a private field** `__strixStyleSource: string` carrying
   the [`@embed`](/language/embed) annotation. The embed resolver reads
   the CSS at compile time and inlines it as the field's default
   value, so the contents are part of the JS bundle.
2. **Injects a `style()` method** that returns the field. The
   existing `Style` mixin's runtime (`__callStyle` →
   `__injectScopedCss`) consumes the return value exactly like a
   hand-written `style()` — no runtime path changes.

The path is resolved relative to the source file the `@StyleFile`
annotation is in, mirroring `@embed`'s rule. Strix-core components
that ship with their own CSS keep working when consumed from a
sibling project, because path resolution always anchors at the
source.

In `sova dev`, the watcher tracks the `.css` file — edit it and the
component re-renders with the new styles automatically.

### Using SCSS

`@StyleFile` accepts `.scss` and `.sass` paths too — they're
preprocessed at build time as long as `dart-sass` is installed on
PATH (or pinned via `[build.scss] command = "..."` in `sova.toml`).
See [Embed → SCSS preprocessing](/language/embed#scss-preprocessing)
for the installation surface and [Bundling → SCSS](/advanced/bundling#scss)
for the build-pipeline view.

```sova
type Button with Composable, Component, Style {
    @StyleFile("./Button.scss")

    func view(): Composable { ... }
}
```

`Button.scss` next to the component, with the full Sass surface
(variables, nesting, mixins, `@use` partials, `@extend`):

```scss
@use "tokens";

$pad-x: 16px;
$pad-y: 8px;

%clickable {
    cursor: pointer;
    user-select: none;
}

.primary {
    @extend %clickable;
    background: tokens.$accent;
    color: white;
    padding: $pad-y $pad-x;
    border-radius: 4px;
    transition: background 150ms ease;

    &:hover {
        background: lighten(tokens.$accent, 5%);
    }

    &:disabled {
        background: tokens.$divider;
        cursor: not-allowed;
    }
}

.large {
    padding: ($pad-y * 1.5) ($pad-x * 1.5);
    font-size: 1.125rem;
}
```

The synth + embed chain is identical to the `.css` case — only the
file gets preprocessed before its contents are baked in. The
compiled CSS lands inline in the JS bundle (so no extra HTTP
request) and Strix's runtime injector scopes it to the component
just like a `.css` `@StyleFile`.

LSP editor support extends naturally: class completion (`primary`,
`large`), hover showing the compiled rule body, jump into the
`.scss` file at the selector, references across the file and its
partials, and unknown-class warnings on misspellings.

#### When to choose `.scss` over `.css`

| Style file size                 | Recommendation |
| ------------------------------- | -------------- |
| < 50 lines, no shared tokens    | `.css` — modern CSS nesting + custom properties cover it. |
| Shared design tokens (colours, spacing scale) | `.scss` with a `_tokens.scss` partial. |
| Per-theme variants              | `.scss` — variables make the variant swap cleanly. |
| Heavy mixin reuse               | `.scss` — `%placeholder` + `@extend` keep the bundle small. |

Sova's bundler minifies the inlined CSS regardless, so the
production-bundle size difference between hand-written CSS and
SCSS-compiled CSS is negligible. Pick by author ergonomics.

### When to keep writing `style()` by hand

`@StyleFile` is sugar for the common case. For styles that genuinely
depend on runtime state (theme tokens fetched from a backend, dynamic
class names assembled from `@reactive` values, etc.), keep the
hand-written `func style(): string { ... }` — the runtime injector
(`__injectScopedCss`) handles it the same way.

## See also

- **[Strix overview](/frontend/strix-overview)** — the framework this
  pack decorates.
- **[Reactivity](/frontend/reactivity)** — the built-in `@reactive`
  annotation `@Reactive` / `@ReactiveShared` fan out to.
- **[Router](/frontend/router)** — the `Trail([...])` API that
  `@Route` registers against.
- **[Annotations](/language/annotations)** — the synth system that
  powers this pack. Read it to add your own Strix decorators
  (`@Computed`, `@OnMount(...)`, ...) on top of the existing
  primitives.
- **[GORM](/libraries/gorm)** — the companion pack for backend
  models; same conventions, different surface.
