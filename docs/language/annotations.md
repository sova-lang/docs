---
title: Annotations
sidebar_position: 9
---

# Annotations

An annotation is a `@`-prefixed decoration on a declaration that gives
the compiler — or a library that runs at compile time — extra
information about that declaration. Sova ships two flavours of them:

- **Built-in annotations** that the compiler itself reads. `@reactive`
  on a field, `@structTag(...)` on a field that needs a Go struct tag,
  `@embed("path")` on a const that should bake a file's contents into
  the build, `@cssClass` on a string parameter that the LSP should
  treat as a CSS class slot. These have hard-coded meaning baked into
  the compiler passes (and, for `@cssClass`, into the LSP).
- **Custom annotations** written by you (or a library author) using
  the `synth` sub-language. A custom annotation looks identical at the
  use site — `@PrimaryKey`, `@Route("/users/:id")` — but it is
  *expanded* by the compiler into a tree of built-in annotations,
  new fields, methods, ctors, or registry entries before any other
  pass sees the code.

Custom annotations are how libraries like Strix's router and the
[GORM annotation pack](/libraries/gorm#annotation-pack) reduce a
screen of `@structTag("gorm", "primaryKey;autoIncrement")` repetitions
to a single `@Pk` on every model. This page covers both flavours and
the `synth` language used to build the second one.

## Using a built-in annotation

Built-in annotations have fixed names and fixed argument shapes. The
two most-used ones today:

```sova
type User {
    @reactive count: int = 0

    @structTag("gorm", "primaryKey")
    @structTag("json", "id")
    id: int = 0
}
```

`@reactive` opts a field into Strix's fine-grained reactivity.
`@structTag("<key>", "<value>")` adds one entry to the Go struct tag
emitted for the field; stacking multiple `@structTag` annotations with
the same namespace joins their values with a single space.

The compiler folds each annotation argument to a compile-time constant.
Anything that does not fold — a runtime function call, a non-`const`
variable reference — is rejected with a clear diagnostic.

## Custom annotations: the `synth` sub-language

A custom annotation is a `synth` declaration that lives in a file
declared `on synth`. The synth declares its **name**, an optional
**parameter list**, a **target kind** (what kind of declaration it
attaches to), and a **body** that says what the use site should expand
into.

```sova
package myapp/annotations on synth

synth Pk on field F {
    emit on F {
        @structTag("gorm", "primaryKey;autoIncrement")
    }
}

synth Column(name: string) on field F {
    emit on F {
        @structTag("gorm", "column:" + name)
    }
}
```

A user-side file imports the synth package with `using *` and writes
the annotations bare:

```sova
package myapp on backend

import "myapp/annotations" using *

type User {
    @Pk
    id: int

    @Column("display_name")
    name: string
}
```

After the `expand_synths` pass runs (early in the pipeline, before name
resolution), the type the rest of the compiler sees is literally:

```sova
type User {
    @structTag("gorm", "primaryKey;autoIncrement")
    id: int

    @structTag("gorm", "column:display_name")
    name: string
}
```

You can confirm that with `sova synth expand` — see the
[CLI reference](/reference/cli) — which re-emits Sova source after
expansion.

### Side constraints

A synth can be restricted to one of Sova's
[sides](/language/sides) by inserting `backend`, `frontend`, or
`shared` between `on` and the target kind:

```sova
synth Pk on backend field F {
    emit on F {
        @structTag("gorm", "primaryKey")
    }
}

synth Reactive on frontend type T {
    for f in T.fields {
        emit on f {
            @reactive
        }
    }
}
```

The rule the expander enforces at the use site:

| Synth declares  | Allowed on `on backend` files | Allowed on `on frontend` files | Allowed on `on shared` files |
| --------------- | ----------------------------- | ------------------------------ | ---------------------------- |
| no side         | yes                           | yes                            | yes                          |
| `backend`       | yes                           | **no**                         | yes                          |
| `frontend`      | **no**                        | yes                            | yes                          |
| `shared`        | **no**                        | **no**                         | yes                          |

`backend`-only and `frontend`-only synths are still allowed on
`on shared` declarations because a shared declaration lives on both
sides — a `@Pk` on a shared type is fine because the backend
implementation still receives the struct tag GORM reads. A
`shared`-required synth requires the use site to itself be in a
shared file, since the synth is making a statement about something
that must round-trip across the wire.

Using a side-restricted synth on the wrong side is a clean diagnostic
at the use site, not a runtime mystery:

```
error[ERR.SEM.0017]: synth 'Pk' is declared `on backend` and cannot
be used in a file on side `frontend` (the file's side must match, or
be `shared` for backend/frontend-restricted synths)
```

This is the recommended pattern for any library annotation pack: pin
each synth to its real audience so consumers can't accidentally
decorate the wrong side. `gorm/annotations` ships every entry as
`on backend`; `strix/annotations` ships every entry as `on frontend`.

### Target kinds

The `on [side] <kind> <BindName>` clause says which declarations the
synth attaches to and binds the surrounding declaration to a name you
can reference in the body. Available kinds:

| Kind     | Attaches to                                  | Example                            |
| -------- | -------------------------------------------- | ---------------------------------- |
| `type`   | `type T { ... }` declarations                | `synth GormModel on type T`        |
| `field`  | Fields inside a type body                    | `synth Pk on field F`              |
| `func`   | Top-level `func` declarations                | `synth Route on func F`            |
| `method` | `func` inside a type body                    | `synth Logged on method M`         |
| `ctor`   | `new(...) { ... }` inside a type body        | `synth Tracked on ctor C`          |
| `param`  | Function or method parameters                | `synth Required on param P`        |
| `let`    | Top-level `let`/`const`                      | `synth Reactive on let L`          |

Using a synth on the wrong target kind is a diagnostic at the use site,
not a runtime mystery.

### Synth body verbs

A synth body is a list of clauses that the interpreter walks every
time the annotation is used. Six clauses exist today.

#### `emit on <bind>`

Splice annotations onto whatever `<bind>` resolves to in the
surrounding scope.

```sova
synth NotNull on field F {
    emit on F {
        @structTag("gorm", "not null")
    }
}
```

When the bind is the synth's outer target, the spliced annotations
*replace* the original `@SynthName` use-site annotation. When the bind
is a for-loop iteration variable (see below), the annotations append
onto whatever entity the loop is currently iterating.

#### `emit append to <registry>`

Append an expression to a named, build-wide registry. Useful for
collecting route paths, model classes, or anything else a downstream
generator wants to consume.

```sova
synth Route(path: string) on func F {
    emit on F {
        @structTag("strix.route", path)
    }
    emit append to strixRoutes {
        path
    }
}
```

The registry is stored under `synth_reg:<name>` in the compiler cache
as a `[]Expr`. Codegen plugins or `sova synth` introspection tools can
read it; today nothing in the standard pipeline does, so registries
are mainly a hook for libraries that ship their own generator.

#### `emit <fieldDecl>` — inject a new field

Only valid on `on type T` synths. Adds a new field to the target type
on every expansion.

```sova
synth Timestamps on type T {
    emit createdAt: int = 0
    emit updatedAt: int = 0
}
```

Using `@Timestamps` on `type User { id: int }` yields a User type with
`id`, `createdAt`, and `updatedAt` fields. The injected fields go
through the same downstream passes as hand-written ones — they bind,
infer, fold, and emit code as if you'd typed them yourself.

#### `emit <methodDecl>` — inject a new method

```sova
synth Pingable on type T {
    emit func ping(): int {
        return 1
    }
}
```

`@Pingable` on `type Service { }` gives `Service` a `ping()` method
that returns `1`. The method body is cloned as-is and resolved against
the user type's package — `this.field`, peer methods, and imports from
the user's file are all in scope. **The synth's own parameters are
not substituted into the method body**, only into annotation
arguments and parameter defaults.

#### `emit <ctorDecl>` — inject a constructor

```sova
synth WithSeed on type T {
    emit new(seed: int) {
    }
}
```

Adds an extra `new(seed: int) { ... }` constructor to the target type.
Multiple `emit ctor` clauses are allowed and produce one extra
constructor each.

#### `for <var> in <bind>.<member> [where <pred>]`

Iterate over a target's sub-elements and run an inner body per element.

```sova
synth GormModel(table: string) on type T {
    emit on T {
        @structTag("gorm.table", table)
    }
    for f in T.fields {
        emit on f {
            @structTag("gorm", "column:" + f.name)
        }
    }
}
```

Inside the loop, `f` is bound to the current iteration element and
`emit on f` reaches into *its* annotation list — so a single
`@GormModel("users")` use site decorates the type itself and every one
of its fields.

Known collections:

| On bind kind | `.member`               |
| ------------ | ----------------------- |
| `type`       | `.fields`, `.methods`, `.ctors` |
| `func`       | `.params`               |
| `method`     | `.params`               |
| `ctor`       | `.params`               |

The optional `where <pred>` clause filters by boolean property.
Properties are `<bind>.<name>` and are hard-coded per bind kind:

| Bind kind  | Boolean properties                       |
| ---------- | ---------------------------------------- |
| `type`     | `isExtern`                               |
| `field`    | `isShared`, `isPrivate`                  |
| `method`   | `isShared`, `isPrivate`, `isAsync`       |
| `ctor`     | `isShared`                               |
| `func`     | `isAsync`, `isWired`                     |
| `param`    | `isVariadic`                             |
| `let`      | `isConst`, `isWired`                     |

```sova
synth PublicOnly on type T {
    for f in T.fields where f.isShared {
        emit on f {
            @structTag("public", f.name)
        }
    }
}
```

There are also string properties — `<bind>.name` on everything that
has one, plus `<bind>.type` on fields and params — that interpolate
when they appear in annotation argument expressions (`"col:" + f.name`
above, or `` `size:${n}` `` for an int param).

### Parameters and substitution

A synth can take parameters, typed the same way function parameters
are:

```sova
synth Size(n: int) on field F {
    emit on F {
        @structTag("gorm", `size:${n}`)
    }
}
```

At the use site, the parameter is filled with a literal:

```sova
type Post {
    @Size(500)
    body: string
}
```

The synth expander substitutes the call-site argument into every
`VarRef` in emitted annotation argument expressions that matches the
parameter name. The substitution covers literals, `+` concatenation,
parenthesised groups, and string templates (`` `${name}` ``). For
template strings with int/bool parts the template-fold step stringifies
each part, so `` `size:${500}` `` collapses to `"size:500"` after
folding.

Loop-variable string properties (`f.name`, `f.type`) follow the same
substitution path: `FieldAccessExpr` of the form `<loopVar>.<prop>`
becomes a string literal at expansion time.

### Chaining and the recursion limit

A synth's emitted annotation can itself be a custom annotation. The
expander runs in rounds — after each pass, any annotation still
matching a registered synth is expanded again — until the list
stabilises or `synthExpansionDepthLimit` (16) is hit. Self-emitting
synths produce a clean diagnostic instead of looping forever:

```sova
synth Loop on field F {
    emit on F {
        @Loop  // never terminates → diagnostic, original dropped
    }
}
```

## Where synths live

A `synth` declaration must live in a file whose `on` clause says
`on synth`. Synth-side files are **invisible to codegen** — the Go and
JavaScript emitters skip them entirely. They exist solely as a source
of synths the expander reads at build time.

```sova
// strix/annotations/src/annotations.sova
package strix/annotations on synth

synth Reactive on type T {
    for f in T.fields {
        emit on f {
            @reactive
        }
    }
}
```

Distribute a synth pack like any other package — its own folder, its
own `sova.toml`, listed under `[dependencies]` of the consuming
project. The consumer imports with `using *` so the bare
`@SynthName` form works without a package qualifier.

## Inspecting synths from the CLI

Three subcommands of `sova synth` work with synth packages — see
[CLI reference](/reference/cli) for full flags:

- **`sova synth list`** — print every registered synth in the
  current build with its signature.
- **`sova synth check`** — run the check pipeline so synth expansion
  fires; report any diagnostics without emitting code.
- **`sova synth expand`** — re-emit the project's Sova source after
  expansion (and after annotation folding). Useful for debugging what
  a custom annotation actually lowers to.

The LSP also knows about synths: completion on `@` lists every
registered synth alongside the built-in ones, hover renders the
synth's signature and source, and **Go to Definition** on a
`@SynthName` jumps to the `synth` declaration even across packages.

## Built-in annotations today

| Name                  | Targets             | Effect                                                       |
| --------------------- | ------------------- | ------------------------------------------------------------ |
| `@reactive`           | field, wired let    | Opts the declaration into Strix's reactive observation.      |
| `@structTag(k, v)`    | field               | Adds one `<k>:"<v>"` entry to the generated Go struct tag.   |
| `@embed("path")`      | top-level const, field | Bakes a file's contents into the declaration at compile time — backend gets a `//go:embed`-backed `string` / `[]byte`, frontend gets an inlined literal. See [Embed](/language/embed). |
| `@cssClass`           | param, field        | Marks a string-typed parameter or field as a CSS-class slot. The compiler treats the annotation as metadata only; the LSP uses it to offer precise class completion, hover, and unknown-class warnings at call sites. See [`@cssClass` editor support](#csscclass-editor-support) below. |

Everything else (`@Pk`, `@Route("/foo")`, `@Reactive`, ...) is a
custom annotation defined by a library you depend on. The Strix and
GORM annotation packs ship a curated set; see
[Strix annotations](/frontend/annotations) and
[GORM](/libraries/gorm#annotation-pack) for the full list.

## `@cssClass` editor support

`@cssClass` is purely an LSP affordance — the compiler accepts the
annotation and emits nothing extra. Library authors put it on
parameters or fields whose string values become CSS class names; the
editor then turns generic string literals at those positions into
real class slots:

```sova
// In a library (Strix's `HtmlElement` mixin uses this pattern):
mixin HtmlElement {
    @cssClass
    class: any = ""
    ...
}

type Div with Composable, HtmlElement {
    ...
}

// In user code:
Div(class: "primary")  // ← LSP offers `primary`, `btn-large`, ... here
                       //   pulled from every @StyleFile / @embed CSS in the project
```

What the LSP layers on top of the plain annotation:

1. **Completion** — typing inside the string at a `@cssClass`-marked
   slot surfaces every class name in the project's stylesheets,
   ranked above identifier-fallback noise and tagged with the
   callee in the detail line (e.g. `CSS class · Div (arg #1)`).
2. **Hover** — pointing at a known class shows the matching CSS rule
   body and source file in a markdown popup.
3. **Go to Definition** (F12) — jumps into the `.css` / `.scss` file
   at the selector's line.
4. **Find All References** — lists every occurrence of the class
   across the project's stylesheets, including SCSS partials reached
   via `@use` / `@import`.
5. **Unknown-class warning** — when a string literal at a
   `@cssClass` slot doesn't match any class in the project, a
   Warning surfaces on save. Multi-class strings like `"primary large"`
   are split and checked token-by-token; only the unknown tokens
   trigger the warning.

The annotation works equally on function parameters and on type
fields (so type-constructor calls like `Div(class: "...")` get the
same treatment as function calls like `Element("button", "primary")`).
Named-argument call sites (`fn(class: "primary")`) are resolved by
field/param name rather than positional index — exactly what Strix's
ctor-call surface depends on.

Without `@cssClass`, the LSP still falls back to a broad
"any string literal in the file" heuristic for class completion (so
users who copy-paste CSS classes from elsewhere aren't left out),
but hover, jump, and the unknown-class warning only trigger when
the slot is explicitly marked. The split is by design: opt-in
precision where library authors care, soft fallback everywhere
else.
