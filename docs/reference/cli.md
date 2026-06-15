---
title: CLI reference
sidebar_position: 2
---

# CLI reference

`sova` is the single entry point for every Sova-related command. This
page summarises the subcommands and the flags you will reach for most
often. Run `sova help <subcommand>` for the authoritative, always-up-
to-date version.

## `sova new`

Scaffold a new project:

```bash
sova new my-app
```

Creates `my-app/sova.toml` and `my-app/src/main.sova` with a minimal
backend `hello, sova` body. Use `--frontend` to scaffold a frontend
entry instead, or `--shared` for a multi-file template.

## `sova install`

Resolve and download dependencies declared in `sova.toml` into the
local `.sova/deps/` cache. Idempotent — run after editing the
manifest. Updates the lockfile only if you pass `--update`.

## `sova build`

Compile the project. By default emits both the Go backend artefact and
the JavaScript frontend bundle:

```bash
sova build                # debug build, both sides
sova build --prod         # optimised build, both sides
sova build --backend-only # only emit Go
sova build --frontend-only# only emit JS
```

The backend binary lands in `dist/`; the frontend bundle in `dist/`
alongside an `output.html` shell.

## `sova dev`

Run the project in development mode:

```bash
sova dev
```

Watches every `.sova` file, recompiles incrementally, restarts the
backend, and triggers a browser reload on change. Useful flags:

- `--port 9090` — bind to a different port.
- `--no-reload` — skip the live-reload websocket (useful for
  manual debugging).

## `sova run`

Build, then run the resulting binary. Equivalent to
`sova build && ./dist/output`. Mostly useful inside editor
integrations.

## `sova test`

Run every `test "..."` declaration in the project:

```bash
sova test
sova test --tag slow            # only tests tagged "slow"
sova test --no-tag network      # skip tests tagged "network"
sova test --frontend-only       # only run JS tests
sova test --format json         # machine-readable output
```

Tests run on the side they target. A shared test runs on both, a
side-tagged test runs only on its side.

## `sova fmt`

Format every Sova file in the workspace:

```bash
sova fmt
sova fmt path/to/file.sova
```

The formatter is the same code the LSP uses for the `formatting`
capability. Idempotent and conservative — it preserves your line
break choices wherever the grammar allows.

## `sova lsp`

Start the language server on stdio. Editors invoke this directly; you
will rarely need to.

## `sova check`

Run every type-checking and analysis pass without emitting code. The
fastest way to verify a workspace compiles:

```bash
sova check
```

Useful in CI as a quick gate before the full `sova build`.

## `sova synth`

A small group of subcommands for inspecting and validating
[custom annotations](/language/annotations) (synth packages):

- **`sova synth list [path]`** — print every `synth` declaration the
  current build sees, with its signature and target. Reads from every
  package the project resolves, including imported synth packs.

  ```text
  $ sova synth list
  Column(name: string) on field F
  Pk on field F
  Reactive on type T
  Route(path: string) on func F
  Timestamps on type T
  ...
  ```

- **`sova synth check [path]`** — run the check pipeline so synth
  expansion fires; report any diagnostics without emitting code.
  Cheaper than `sova check` because codegen passes never run.

- **`sova synth expand [path]`** — re-emit the project's Sova source
  after running synth expansion and annotation folding. The output
  shows exactly what a custom annotation lowered to, with folded
  literal arguments (`@structTag("gorm", "column:id")` rather than
  `@structTag("gorm", "column:" + "id")`). Synth-side files are
  skipped because they are the source of the expansion, not the
  output.

  Flags:

  - `--out <dir>` — write each file to `<dir>/<relative-path>`
    instead of stdout.
  - `--file <name>` — restrict output to one source file (substring
    match against the file's stored relative path).

  ```text
  $ sova synth expand --file model.sova
  // === src/model.sova ===
  package myapp on backend
  ...
  type User {
      @structTag("gorm", "primaryKey;autoIncrement") id: int
      @structTag("gorm", "column:display_name") name: string
      ...
      createdAt: int = 0
      updatedAt: int = 0
  }
  ```

## `sova clean`

Delete the `dist/`, `.output/`, and `.sova/deps/` caches. Use sparingly
— `sova install` and the dependency cache are designed to be
incremental.

## Global flags

A handful of flags apply to every subcommand:

- `-v` / `--verbose` — print additional diagnostic information.
- `--cwd <path>` — run as if invoked from `<path>` instead of the
  current directory.
- `--toolchain <version>` — use a specific Sova toolchain if you
  installed several. (Reserved for the future multi-version layout.)
