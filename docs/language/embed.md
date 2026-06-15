---
title: Embed
sidebar_position: 10
---

# Embed

`@embed` bakes the contents of a file on disk into a Sova `const` at
compile time. The same syntax works on both sides: a backend `const`
lowers to a Go variable backed by `//go:embed`; a frontend `const`
lowers to an inlined JS literal. Either way the file content is
*part of the build artefact* — no runtime fetch, no separate asset
to ship.

Use it for:

- Stylesheet files attached to Strix components.
- Static JSON, SVG, or text resources you want a typed handle to.
- Small binary assets (fonts, images) shipped with the app.

For larger frontend asset workflows — content-hash cache busting,
code splitting, automatic URL rewriting — see the upcoming bundling
docs. `@embed` is the foundation layer everything else builds on.

## Surface

`@embed` is an annotation on a `const` declaration:

```sova
@embed("./assets/logo.svg")
const Logo: string = ""

@embed("./styles/Button.css")
const ButtonCSS: string = ""

@embed("./fonts/Inter.woff2")
const InterFont: []byte = []
```

The declared type chooses the loader:

| Declared type     | Treated as                                        |
| ----------------- | ------------------------------------------------- |
| `string`          | Text — the file is read as UTF-8 and stored as a Sova string. |
| `[]byte`          | Binary — the file is read as raw bytes.           |

Anything else is rejected with a clear diagnostic at compile time.

The declaration must be `const`, not `let` — the contents are baked
in at compile time and reassigning them at runtime makes no sense.
The placeholder initializer (`= ""` or `= []`) is required for type
inference but its value is discarded; codegen replaces it with the
real file content.

## Path resolution

The path argument is **relative to the source file's directory**, not
to the project root:

```
project/
├── sova.toml
└── src/
    └── components/
        ├── Button.sova        // @embed("./Button.css")
        └── Button.css         // ✓ resolves here
```

This mirrors how `import "./foo"` works in JavaScript and how
`//go:embed foo.txt` works in Go: the file lives next to the code
that references it. The same rule applies to embeds inside library
packages — `@embed("./Button.css")` inside `strix/core/.../Button.sova`
finds `Button.css` next to the source, regardless of which project
consumes the library.

Absolute paths (`/etc/...`) and path components that walk outside the
project root (`../../../etc/passwd`) are rejected.

## What lowering looks like

### Backend

```sova
package myapp on backend

@embed("./assets/logo.svg")
const Logo: string = ""
```

After codegen, the Go side becomes:

```go
//go:embed __embeds/abc123-logo.svg
var Logo string
```

The compiler copies `assets/logo.svg` to
`<output-dir>/__embeds/<hash>-logo.svg` before `go build` runs, so
Go's `//go:embed` directive resolves at link time. The variable name
is the same on both sides; usage stays uniform.

### Frontend

```sova
package myapp on frontend

@embed("./styles/Button.css")
const ButtonCSS: string = ""
```

After codegen, the JS bundle includes:

```js
// @embed ButtonCSS (47 bytes)
const ButtonCSS = ".btn { color: red; ... }";
```

Binary embeds (`[]byte`) become a `Uint8Array` built from a
base64-decoded literal. There is no runtime fetch — the asset is part
of the JS bundle.

## Size limits

`@embed` enforces a default 8 MiB cap per file so a typo
(`@embed("./bigthing.bin")` on a 4 GB file) doesn't quietly blow up
the build. The cap is configurable per project via `sova.toml`
(coming in a future release).

## Cross-side use

The same `@embed` works regardless of whether the file is on the
backend, frontend, or shared:

```sova
package myapp on shared

@embed("./schema.json")
const Schema: string = ""
```

A shared embed produces both a backend-side `//go:embed` and a
frontend-side inlined literal — same content, same constant name on
both sides.

## SCSS preprocessing

`@embed` knows about `.scss` and `.sass` files. When the resolved
path has one of those extensions, the embed resolver shells out to a
Sass preprocessor (`sass` or `dart-sass`) and stores the **compiled
CSS** as the const's content. To the rest of the build pipeline the
embed looks identical to any other text embed — only the source on
disk is preprocessed.

This feature is **opt-in by installation**: Sova doesn't ship a Sass
compiler in-process. Install
[dart-sass](https://sass-lang.com/install) (or any compatible `sass`
binary) and put it on PATH. The compiler auto-discovers it:

```bash
# verify the auto-discovery
$ which sass
/usr/local/bin/sass
$ sass --version
1.83.0 ...
```

Once installed, `@embed("./Button.scss")` works the same as
`@embed("./Button.css")`:

```sova
@embed("./Button.scss")
const ButtonCSS: string = ""
```

The file (and any partials it `@use`s) gets compiled at build time;
the CSS string ends up in your bundle.

### Pinning a specific binary

For projects that need a specific Sass installation (CI, a vendored
binary), pin the path in `sova.toml`:

```toml
[build.scss]
command = "/opt/dart-sass/sass"
```

### Disabling Sass

For projects where SCSS files shouldn't be compileable (e.g. a
library that only ships CSS), turn it off in `sova.toml`:

```toml
[build.scss]
enabled = false
```

`@embed` on a `.scss` file then errors out with a clear diagnostic
instead of silently invoking whatever binary happens to be on PATH.

### What's not yet supported

- **Watched partials.** `sova dev` re-runs the build when the
  embedded `.scss` file changes, but not when an `@use`-imported
  partial (`_variables.scss`) changes. Use the main file for now;
  full dependency tracking lands in a follow-up.
- **Embedded compiler.** No in-process Sass implementation is shipped
  with Sova — installing dart-sass externally is required. This
  keeps the Sova binary small.

## Strix integration

Strix uses `@embed` to load CSS files via the `@StyleFile` synth
(see [Strix annotations](/frontend/annotations#stylefile)). Instead
of writing CSS as an inline string returned from `func style()`:

```sova
type Button with Composable, Component, Style {
    @StyleFile("./Button.css")
    func view(): Composable { ... }
}
```

The synth lowers to an `@embed`-backed constant + a generated
`style()` that returns it. The CSS is authored in `Button.css` with
real syntax highlighting, multi-line formatting, and editor support.

## Diagnostics

`@embed` reports several specific failures so misuse is caught
immediately:

- **`requires a `const` declaration`** — used on a `let`, can't bake content into mutable storage.
- **`requires a declared type of `string` ... or `[]byte``** — used on `int`, `bool`, custom types, etc.
- **`path must be a relative path string literal`** — argument is absolute, missing, or non-string.
- **`cannot find file ...`** — relative path resolved to a non-existent file or a directory.
- **`refuses to embed ... bytes; the size cap is ... bytes`** — file is larger than the configured cap.
- **`path ... escapes the project root`** — path walked outside the project tree.

Each diagnostic points at the `@embed(...)` annotation span, so the
editor highlights the exact problem.

## Dev mode

`sova dev` watches every file referenced by an `@embed` declaration
alongside the regular `.sova` and `.toml` source set. Editing the
embedded asset triggers a recompile and a live reload — the bundled
content stays in sync with the source on disk.

## See also

- **[Strix annotations](/frontend/annotations)** — the
  `@StyleFile` synth is the recommended way to use `@embed` for
  component CSS.
- **[Annotations](/language/annotations)** — `@embed` is a built-in
  annotation; the synth system lets libraries layer ergonomic
  decorators on top of it.
