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

## Per-member sharing on a one-sided type

The file-level rule is binary: either a type lives on one side or it
lives on both. That is fine for genuinely shared entities, but it
forces an awkward dance when *most* of a type belongs to one side and
only a sliver needs to cross. The classic example is a database
entity: a `User` with `id`, `name`, `passwordHash`, plus a
`save()` method that hits GORM. The Go side wants everything; the
frontend only needs `id`, `name`, and maybe a `display()` method that
formats the user. You do not want to write a DTO, marshal back and
forth, or split the type into two parallel declarations.

Sova solves this with a per-member `shared` modifier. Inside a type
that lives in a one-sided file, any field, method, constructor, or
cast prefixed with `shared` opts into emission on the other side:

```sova
package myapp on backend

import "gorm"

type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    shared id: int = 0

    shared name: string = ""

    passwordHash: string = ""          // backend-only

    shared new(id: int, name: string) {
        this.id = id
        this.name = name
    }

    shared func display(): string {
        return name + " (#" + (id as string) + ")"
    }

    func save() {                      // backend-only
        gorm.save(db, this)
    }
}
```

The frontend that imports `myapp` sees a `User` with `id`, `name`, the
`new(id, name)` constructor, and the `display()` method — but not
`passwordHash` or `save()`. The Go backend keeps the full type.
When a wired function returns a `User`, the wire layer reifies the
payload into the frontend's class on arrival, so `user.display()` is
callable as if you had constructed the instance locally.

### Rules a `shared` member must follow

The compiler checks that shared members can genuinely run on the
other side. The rules are conservative on purpose: a body that
compiles as `shared` must be safe to ship to the frontend without any
side-specific surgery.

- A **shared field**'s type must be transferable: primitives, options,
  lists / arrays / maps / tuples of transferable, or other shared
  types. The same definition as wire-transferable types.
- A **shared method, constructor, or cast** body may reference:
  - `this` and shared fields of `this`.
  - The body's own parameters and locally declared variables.
  - Other `shared` methods on `this`.
  - Symbols imported from `on shared` packages (including the
    transferable subset of the standard library).
- A shared body may **not** reference:
  - Non-shared fields or methods of the enclosing type.
  - Top-level vars or functions from a one-sided file.
  - Symbols imported from a one-sided package.

Each violation is a compile error with a precise pointer at the
forbidden reference, so when the validator rejects a shared body the
fix is always one of: mark the referenced member `shared`, move the
helper into a shared package, or pull the body apart so the
side-specific part lives on a non-shared sibling.

### Symmetry

The same rules apply from the other direction. A frontend-declared
type can mark members `shared` and the Go side will get a struct (with
its `@structTag` annotations) containing just the shared fields. The
type system is symmetric: whoever declares the type is the authority
on the full surface, and the other side gets the shared subset for
free.

### When to reach for it

| You want… | Use |
| --- | --- |
| The exact same type on both sides | `on shared` file |
| One side owns most of the type, the other needs a slice | per-member `shared` modifier |
| A frontend that calls into backend logic | wired function |

Per-member sharing covers the entity-with-a-thin-cross-side-surface
case that `on shared` is awkward for. The cost is one keyword per
member — the compiler does the rest.
