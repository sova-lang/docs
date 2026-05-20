---
title: Sides
sidebar_position: 1
---

# Sides

Every Sova declaration belongs to one of three sides:

- **backend** — the code runs on the server, inside the generated Go
  binary. Only emitted to the Go artefact.
- **frontend** — the code runs in the browser, inside the generated
  JavaScript bundle. Only emitted to the JS artefact.
- **shared** — the code runs on both sides. It must therefore avoid any
  side-specific feature, but it sees the same definitions both halves
  do.

The side is declared once per file:

```sova
package todo/shared on shared

type Todo {
    id: int
    text: string
    done: bool
}
```

If you omit the annotation, the default is `shared`.

## Per-declaration overrides

A function can override the file's side with its own annotation:

```sova
package myapp on shared

func render(): string {
    return "hi"
}

// Backend-only helper inside a shared file:
func now(): int on backend {
    return time.unixSeconds()
}
```

Per-declaration overrides are most useful inside a shared file when a
single utility has a side-specific implementation that you do not want
to wrap with `wire`. Use sparingly — most shared utilities should stay
genuinely shared.

## What "side" means at compile time

The Sova compiler runs the same passes for both sides, but the codegen
step filters declarations by side:

- The Go codegen ignores any declaration whose effective side is
  `frontend`.
- The JavaScript codegen ignores any declaration whose effective side
  is `backend`.
- `wire`-flagged functions are an exception: they emit on both sides
  (a backend handler and a frontend stub). The body is only compiled
  for the backend; the frontend stub knows nothing about your
  implementation, only the signature.

The LSP applies the same filter for completion, so a frontend file does
not see backend-only helpers in the suggestion list.

## Importing across sides

Side-specific packages can only be imported from compatible sides:

| Importer | Imported package side | Allowed? |
| --- | --- | --- |
| `backend` | `backend` or `shared` | yes |
| `frontend` | `frontend` or `shared` | yes |
| `shared` | `shared` only | yes |
| any | other-side package | **no — compile error** |

If you have a piece of code that genuinely needs to cross the boundary
(e.g. a frontend file that wants to call backend logic), use a `wire`
function. Wiring is the *only* way to bridge the two sides; importing
across is intentionally forbidden so the compiler can keep the artefact
boundaries tight.
