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

`@embed` (and therefore `@StyleFile`) understands `.scss` / `.sass`
files. Sova doesn't ship a Sass compiler in-process — install
[dart-sass](https://sass-lang.com/install) externally and the
compiler picks it up from PATH automatically. Pin a specific binary
or disable the feature entirely via `[build.scss]` in `sova.toml`:

```toml
[build.scss]
command = "/opt/dart-sass/sass"  # explicit path, or omit for PATH lookup
enabled = true                    # set to false to forbid SCSS embeds
```

See the [Embed → SCSS preprocessing](/language/embed#scss-preprocessing)
section for the surface and known limits (partials aren't yet
included in the dev watcher's reload set).

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
