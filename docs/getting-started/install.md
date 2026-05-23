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

## Install the toolchain

The installers download a prebuilt release from
[github.com/sova-lang/sova](https://github.com/sova-lang/sova/releases),
unpack the compiler and the bundled stdlib into a per-user directory,
and add that directory to your `PATH`. Re-running an installer upgrades
an existing installation in place.

### Linux & macOS (bash, zsh, sh)

```bash
curl -fsSL https://raw.githubusercontent.com/sova-lang/sova/main/install.sh | sh
```

### Linux & macOS (fish)

```fish
curl -fsSL https://raw.githubusercontent.com/sova-lang/sova/main/install.fish | fish
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/sova-lang/sova/main/install.ps1 | iex
```

Open a fresh terminal so the new `PATH` entry takes effect, then verify
the install:

```bash
sova version
```

### Updating

Re-run the same installer command, or once installed:

```bash
sova upgrade
```

### Pinning a specific version

Set `SOVA_VERSION` to install a specific release tag:

```bash
curl -fsSL https://raw.githubusercontent.com/sova-lang/sova/main/install.sh | SOVA_VERSION=v1.2.3 sh
```

```powershell
$env:SOVA_VERSION = 'v1.2.3'; iwr -useb https://raw.githubusercontent.com/sova-lang/sova/main/install.ps1 | iex
```

### Install location

| Platform        | Path                                              |
| --------------- | ------------------------------------------------- |
| Linux / macOS   | `~/.sova/` (binary + `std/`)                      |
| Windows         | `%LOCALAPPDATA%\sova\` (binary + `std\`)          |

Override the destination with the `SOVA_INSTALL_DIR` environment
variable before running the installer.

### Supported platforms

|         | x64 | arm64 |
| ------- | --- | ----- |
| Linux   | ✓   | ✓     |
| macOS   | ✓   | ✓     |
| Windows | ✓   | ✓     |

## Build from source

If you would rather build from a checkout — for instance to track `main`
or to contribute to the compiler — clone the repository and build with
Go:

```bash
git clone https://github.com/sova-lang/sova
cd sova
go build -o ~/.local/bin/sova .
```

Make sure `~/.local/bin` is on your `PATH`, then verify with:

```bash
sova --version
```

The compiler finds the stdlib via `<binary-dir>/std`,
`<binary-dir>/../std`, the current working directory's `std/`, or
`$SOVA_HOME/std` — in that order — so a source build also needs the
`std/` directory next to the binary (or `SOVA_HOME` pointed at the
checkout).

## Set up your editor

Sova ships an LSP server. The recommended editor support is the
**Sova VS Code extension**, which connects to `sova lsp` for diagnostics,
navigation, hover information, completions, and refactorings.

Install it from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DasDarki.sova),
or from the VS Code Quick Open prompt (`Ctrl+P` / `Cmd+P`):

```text
ext install DasDarki.sova
```

The extension auto-discovers `sova` on `PATH` and starts `sova lsp` for
you — no further configuration needed once the toolchain is installed.

### Building the extension from source

The extension lives in its own repository at
[github.com/sova-lang/vscode-sova](https://github.com/sova-lang/vscode-sova).
If you want to hack on it, clone that repository and build it locally
instead of installing from the Marketplace:

```bash
git clone https://github.com/sova-lang/vscode-sova
cd vscode-sova
npm install
npm run compile
```

Then open the folder in VS Code and launch the *Run Extension* target
to spawn a development host with your local build attached.

### Other editors

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
