---
title: Bundling
sidebar_position: 4
---

# Bundling

`sova build` doesn't just compile your Sova source — it bundles the
emitted JavaScript through [esbuild](https://esbuild.github.io)
before linking the production binary. The result is a small set of
**content-hashed, minified, tree-shaken** files that the prod binary
serves directly from an embedded filesystem.

`sova dev` skips the bundler entirely — fast incremental compiles
matter more than minification while you're iterating.

## What you get

After a successful `sova build`, the output directory
(`.output/` by default) looks like:

```
.output/
├── assets/
│   ├── runtime.<hash>.js        ← bundled, minified JS entry
│   ├── runtime.<hash>.js.map    ← chained sourcemap (resolves Sova source)
│   ├── manifest.json            ← logical name → hashed filename
│   ├── index.html               ← shell with <script src> already rewritten
│   ├── chunk.<hash>.js          ← per dynamic import() split (when present)
│   └── asset.<hash>.<ext>       ← bundled binary assets (when present)
├── __embeds/                    ← raw `@embed`-resolved files (staged for go:embed)
├── output.go                    ← Sova → Go codegen
└── prod_helpers.go              ← embed.FS-backed asset server
```

The Go binary `go build` produces from this directory embeds
**the entire `assets/` directory** via `//go:embed assets` — every
hashed file plus the manifest and the rewritten shell. No external
asset directory at runtime, no per-file `//go:embed` directives that
need rewriting when filenames change.

## How it works

The compiler's JavaScript emitter still produces one monolithic
`output.js` + sourcemap. The bundler step (between compile and `go
build`) treats that file as the entry point for esbuild with these
options:

- **Bundle** — resolve any internal imports.
- **MinifyWhitespace + MinifyIdentifiers + MinifySyntax** — full
  minify suite.
- **TreeShaking** — drop unused exports.
- **KeepNames** — preserve `wire`-exported function names so backend
  HTTP routes stay introspectable in tooling.
- **EntryNames `runtime.[hash]`** — content hash in the filename
  enables 1-year cache headers on the server side.
- **SourceMap = Linked, SourcesContent = Include** — emits a
  sourcemap chain that resolves all the way back to your Sova source
  through the compiler's own intermediate map.
- **Target = ES2022** — every browser Sova supports handles this
  natively.

esbuild then writes hashed entries into `<outputDir>/assets/`. The
bundler scans esbuild's `OutputFiles` and writes `manifest.json`:

```json
{
  "entry": "runtime.EJJQIX4J.js",
  "entry.map": "runtime.EJJQIX4J.js.map"
}
```

## The HTML shell

`sova build` looks for `web/index.html` in your project (configurable
via `[serve] web-dir` in `sova.toml`) and copies it into `assets/`,
rewriting the runtime `<script>` tag's `src` to the hashed filename:

```html
<!-- Your web/index.html: -->
<script type="module" src="/__sova/runtime.js"></script>

<!-- Becomes after build: -->
<script type="module" src="/__sova/runtime.EJJQIX4J.js"></script>
```

Projects without `web/index.html` get a sensible default shell with
the runtime tag pre-baked (you can override later).

If your custom shell is missing the `/__sova/runtime.js` tag entirely,
the build step injects one before `</body>` so the page still boots.

## The production server

The generated `prod_helpers.go` registers three HTTP handlers:

- **`/__sova/runtime.js`** — reads `manifest.json` once at startup,
  serves the hashed entry file from the embedded FS.
- **`/__sova/runtime.js.map`** — same, for the sourcemap.
- **`/__sova/<anything>`** — generic passthrough to any file in
  the embedded `assets/` directory (chunks, hashed binary assets,
  etc.) with the right `Content-Type` derived from the extension.
- **`/`** (fallback) — serves the rewritten `index.html` shell with
  `Content-Type: text/html`.

All asset responses include `Cache-Control: public, max-age=31536000, immutable`
because the content hash in the filename is the cache key. A new
build with new content produces new hashes; the browser's old cached
copy stays valid for the old version and won't accidentally serve
stale code.

## Dev vs prod

The bundler runs **only on `sova build`**. `sova dev` uses the
existing dev server (`dev_helpers.go`), which:

- Serves the raw `output.js` from disk
- Streams reload signals over SSE on file change
- Skips minification, hashing, and the manifest entirely

This keeps iteration fast (no esbuild round-trip per save) while
production still gets every optimisation. The trade-off worth knowing:
because dev serves the unbundled JS directly, debugging in dev is
slightly faster (one source-map step) while debugging in prod uses
the chained map (Sova → JS → bundle) which both Chromium and Firefox
handle but the latter occasionally with flake.

## Adjusting the bundler

P1 ships with a fixed configuration tuned for typical Sova apps. To
override (e.g. disable minification for a debug build, raise the
embed cap), future versions will read `[build.bundler]` keys from
`sova.toml`. Until then, the defaults are:

| Setting       | Default       |
| ------------- | ------------- |
| Minify        | on            |
| KeepNames     | on            |
| Tree-shaking  | on            |
| Target        | ES2022        |
| Sourcemap     | linked, w/ contents |

## Binary size

Linking esbuild into the Sova CLI binary adds approximately 6–8 MB
to the standalone Sova compiler distribution. The existing
`-ldflags=-s -w` on the user's production binary doesn't touch the
Sova binary itself, but `sova` is a build-time tool, not a runtime,
so the size cost only matters at installation time.

## SCSS

`@embed` (and therefore `@StyleFile`) accepts `.scss` and `.sass`
sources alongside plain `.css`. The compiler preprocesses them to
CSS at build time, then folds the result into the inlined string
literal exactly like a hand-written CSS embed. The Sass surface you
get is the upstream
[dart-sass](https://sass-lang.com) one in full — variables, mixins,
nesting, `@use` / `@import` partials, `@extend`, math, colour
functions, control flow.

### Installation

Sova does not ship a Sass compiler in-process. Install
[dart-sass](https://sass-lang.com/install) (or any compatible `sass`
binary) and put it on `PATH`. The compiler auto-discovers it:

```bash
$ which sass
/usr/local/bin/sass
$ sass --version
1.83.0 ...
```

Per-project pinning lives in `sova.toml`:

```toml
[build.scss]
command = "/opt/dart-sass/sass"  # explicit path, or omit for PATH lookup
enabled = true                    # set to false to forbid SCSS embeds
```

`enabled = false` turns SCSS off entirely — any `@embed` referencing
a `.scss` / `.sass` file then produces a clean compile-time
diagnostic instead of silently invoking whatever binary happens to
be on PATH. Useful for CI sandboxes that must not shell out, and
for libraries that ship only `.css`.

### End-to-end pipeline

For a Strix component written with `@StyleFile`:

```sova
type Card with Composable, Component, Style {
    @StyleFile("./Card.scss")

    func view(): Composable {
        return Div(class: "card") {
            Div(class: "card-header") { H2 { "Title" } }
            Div(class: "card-body") { "..." }
        }
    }
}
```

…with `Card.scss` sitting next to the source:

```scss
@use "tokens";

.card {
    background: tokens.$surface;
    border-radius: tokens.$radius-md;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

    .card-header {
        padding: 12px 16px;
        border-bottom: 1px solid tokens.$divider;
    }

    .card-body {
        padding: 16px;
    }

    &.featured {
        border: 2px solid tokens.$accent;
    }
}
```

…and a shared partial `_tokens.scss` in the same directory:

```scss
$surface: #ffffff;
$divider: #e6e8eb;
$accent:  rebeccapurple;
$radius-md: 6px;
```

Build sequence on `sova build`:

1. The `@StyleFile` synth lowers to an `@embed(path)`-decorated
   private field on the type (see [Strix annotations](/frontend/annotations#stylefile)).
2. `pass_resolve_embeds` resolves the path against the source file's
   directory, recognises the `.scss` extension, and shells out to
   `sass Card.scss`.
3. dart-sass resolves `@use "tokens"` against `_tokens.scss`, expands
   nesting, substitutes variables, and prints the compiled CSS to
   stdout.
4. The resolver captures the CSS bytes, stores them in the field's
   default literal, and hashes the content for cache invalidation.
5. The JS emitter inlines the CSS string into the bundle.
6. esbuild minifies the bundle (the CSS is treated like any other
   JS string literal — whitespace gets stripped).
7. The hashed `runtime.[hash].js` lands in `assets/` and the Go
   binary embeds the whole directory via `//go:embed`.

At runtime the component's `style()` method returns the compiled
CSS string and Strix's runtime injector scopes it onto the
`[data-s-Card-<hash>]` attribute selector — identical to a
hand-written CSS embed.

### What you get in the editor

The LSP integration matches the build-side capabilities one-for-one:

- **Class completion** — typing `Div(class: "<cursor>")` offers
  every class from `Card.scss` *and* every class from `_tokens.scss`
  (and any other partial reached via `@use` / `@import`).
- **Hover** — pointing at `"card-header"` shows the matching SCSS
  rule body in a markdown popup, with the source file name (e.g.
  `Card.scss`).
- **Go to Definition** (F12) — jumps into the partial's source file
  at the selector's line.
- **Find All References** — lists every occurrence across the
  stylesheet *and* its partials.
- **Unknown-class warning** — `Div(class: "card-bdy")` (typo)
  surfaces a Sova LSP warning at the literal's range on save.

See [`@cssClass` editor support](/language/annotations#csscclass-editor-support)
for the underlying mechanism.

### Known limits

- **Partial watching.** `sova dev` re-runs the build when the
  embedded `.scss` file changes, but not when a partial reached via
  `@use` / `@import` changes. Editing `_tokens.scss` requires a
  manual save of the parent file (or restarting `sova dev`) to pick
  up the change. The LSP class index DOES follow partials — only
  the dev-mode rebuild trigger doesn't yet.
- **Embedded compiler.** No in-process Sass implementation is shipped
  with the Sova binary. Installing dart-sass externally is required,
  which keeps the Sova binary small.
- **`@forward` and module re-exports.** dart-sass handles these
  perfectly at build time, but the LSP class extractor only follows
  one `@use` hop from the file the `@embed` points at. Classes
  re-exported via `@forward` through an intermediate module won't
  surface in completion. Workaround: have `@embed` point at the
  composing module directly, or list the partials individually.

See [Embed → SCSS preprocessing](/language/embed#scss-preprocessing)
for the surface details (diagnostic codes, error formatting, size
caps).

## See also

- **[Embed](/language/embed)** — assets brought in via `@embed` get
  staged into `__embeds/` before bundling; the bundler doesn't
  reprocess them (they're either inlined as JS literals or referenced
  through Go's `//go:embed` directives).
- **[Strix annotations](/frontend/annotations)** — `@StyleFile`
  inlines CSS into the JS bundle today; future P4 work adds esbuild's
  CSS-extraction loader so styles ship as a separate `styles.[hash].css`
  file.
- **[esbuild documentation](https://esbuild.github.io/api/)** — every
  knob the Sova bundler exposes is a thin facade over esbuild's
  options.
