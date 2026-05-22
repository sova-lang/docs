---
title: Language server
sidebar_position: 1
---

# Language server

The Sova binary ships a Language Server Protocol implementation. The
language server is the same code that powers the compiler — the LSP
runs every analysis pass and then exposes the results through the
standard LSP wire format. Editors that speak LSP get production-grade
diagnostics, navigation, hover, completion, refactorings, and code
actions out of the box.

## Running the server

```bash
sova lsp
```

The command starts the language server on stdio. Editors usually
configure this for you automatically; the official
[Sova VS Code extension](https://marketplace.visualstudio.com/items?itemName=DasDarki.sova)
does so out of the box (`ext install DasDarki.sova`). For Vim, Neovim,
Helix, Zed, and Emacs, point the LSP client at the command `sova lsp`.

## Capabilities at a glance

| Capability | What you get |
| --- | --- |
| Diagnostics | Compile errors and warnings as you type, line-and-column accurate. |
| Hover | Type signature plus markdown-rendered doc comments for any symbol. |
| Definition | Jump to the declaring `func` / `type` / `let` / package. |
| Type definition | Jump from a value to the type's declaration. |
| References | Find all references to a symbol across the workspace. |
| Implementation | Find concrete types satisfying an interface. |
| Completion | Identifiers, members, package exports, keyword snippets. |
| Signature help | Parameter prompts at call sites. |
| Semantic tokens | Syntax-aware highlighting. |
| Document symbols | Outline view for the current file. |
| Code lenses | Run `main`, run individual `test "..."` blocks. |
| Code actions | Quick fixes for common diagnostics. |
| Rename | Cross-file renaming with conflict checking. |
| Folding | Block, function, and import folding. |
| Document formatting | Built-in formatter; canonicalises spacing and grouping. |
| Call hierarchy | Walk a function's incoming and outgoing call edges. |

## Doc comments

The hover popup renders the `///` and `/** … */` doc comments attached
to declarations. The recognised tags are:

- `@param name description`
- `@returns description` (and `@return` as an alias)
- `@example` (followed by an example block)
- `@deprecated reason`
- `@since 1.2`
- `@see other.symbol`

Tags are collected into a small bullet list under the rendered body;
unrecognised tags are passed through literally.

## Side-aware completion

The completion engine knows which side each declaration belongs to. A
frontend file does not see backend-only functions in its suggestion
list, even if the package they live in is a shared dependency. Wired
functions stay visible from both sides — they are the language-level
bridge for a reason.

## Stdlib navigation

ctrl+click on a stdlib symbol opens the actual stdlib source file on
disk, not a placeholder. The server resolves `std/...` virtual paths
through the same search list the compiler uses
(`SOVA_HOME`, the directory next to the binary, `<binary>/../std`, and
the CWD's `std/`), so you can step through `std/list`, `std/sync`, or
any other built-in module exactly as you would your own code.

The same goes for import paths and type references: clicking
`import "std/strings"` opens the package, and clicking the type name
in `let s: strings.Stripper = ...` jumps to the `type` declaration.

## VS Code extension

The reference editor integration is published as
[`DasDarki.sova`](https://marketplace.visualstudio.com/items?itemName=DasDarki.sova)
on the Visual Studio Marketplace. Install it from inside VS Code with:

```text
ext install DasDarki.sova
```

It launches `sova lsp` on demand, listens to the standard events, and
exposes three commands:

- `Sova: Restart Language Server` — for those rare moments after a
  manual binary update.
- `Sova: Run main()` — runs the current project's backend entry through
  `sova run`.
- `Sova: Run Test` — runs the test block under the cursor.

The extension installs grammar files for syntax highlighting before
the LSP attaches; once the server is running, semantic tokens take
over and you get full identifier-level colouring.

## Tracing

To see the JSON-RPC traffic, switch the trace setting in the editor:

```json
"sova.trace.server": "verbose"
```

The traffic appears in the editor's output panel. Use it when a
feature is misbehaving and you want to confirm what the client sent
and what the server replied.
