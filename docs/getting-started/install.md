---
title: Install Sova
sidebar_position: 1
---

# Install Sova

Sova ships as a single binary. The binary contains the compiler, the
package manager, the language server, and a development server, so there
is no extra tooling to install once you have the binary on `PATH`.

## Prerequisites

You will need:

- **Go 1.22 or newer** — Sova generates Go code for the backend artefact
  and invokes `go build` under the hood. The standard Go toolchain on
  `PATH` is enough.
- **Node.js 18 or newer** — the development workflow runs the generated
  JavaScript bundle in Node when you ask for an offline check, and the
  optional dev server uses Node to drive the frontend reload.

You do not need a separate npm or Yarn project; Sova manages its own
dependencies through `sova.toml` and `sova.lock`.

## Build from source

While the binary releases are still in preparation, build from source:

```bash
git clone https://github.com/sova-lang/sova
cd sova
go build -o ~/.local/bin/sova .
```

Make sure `~/.local/bin` is on your `PATH`. Verify with:

```bash
sova --version
```

## Set up your editor

Sova ships an LSP server. The recommended editor support is the
**Sova VS Code extension**, which connects to `sova lsp` for diagnostics,
navigation, hover information, completions, and refactorings.

To install the extension during development:

```bash
cd editors/vscode-sova
npm install
npm run compile
```

Then load the folder in VS Code through *Run Extension*. Once the
extension is published you will be able to install it from the
Marketplace and skip the manual build.

If you use a different editor, point its language-client extension at the
command `sova lsp`. Every editor with LSP support will get the same
features the VS Code extension exposes; only the UI wrapping differs.

## What `sova` ships

A few subcommands you will use most often:

| Command | What it does |
| --- | --- |
| `sova new <name>` | Scaffold a new project with `sova.toml` and a starter `src/` layout. |
| `sova install` | Resolve dependencies declared in `sova.toml` into the local cache. |
| `sova build` | Compile to Go and JavaScript artefacts under `.output/` and `dist/`. |
| `sova dev` | Run the compiler in watch mode and start the backend with hot reload. |
| `sova test` | Run the Sova-side test suite (uses the test runner described in [Testing](/advanced/testing)). |
| `sova lsp` | Start the language server (used by editors; you rarely call it directly). |

The remainder of the guide assumes the binary is on `PATH` and you have
the editor extension enabled, but the language itself works perfectly
well from a plain terminal.

When you are ready, continue to [Hello, world!](/getting-started/hello-world).
