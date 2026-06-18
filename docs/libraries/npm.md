---
title: npm packages
sidebar_position: 10
---

# Using npm packages from Sova

Sova can pull TypeScript libraries from npm and translate them into typed
Sova bindings at build time. Declare what you want in `sova.toml`, write
`import "<libname>"` in your Sova source, and the compiler handles the rest:
running `npm install` into a hidden cache, generating Sova interop wrappers
from the lib's `.d.ts`, and bundling the actual JS implementation into the
frontend output via esbuild.

## Quick start

```toml
# sova.toml
[package]
name = "myapp"

[project]
entry = "src/main.sova"

[npm-dependencies]
dayjs = "^1.11"
```

```sova
// src/main.sova
package myapp on frontend
import "dayjs"

func boot() {
    let d = dayjs.dayjs("2026-06-17" as any)
    println(d.format("YYYY-MM-DD"))                       // 2026-06-17
    println(d.add(7 as float, "day" as any).format("YYYY-MM-DD"))  // 2026-06-24
}
```

`sova build` will:

1. **Install** the npm deps into a hidden cache at `<project>/.sova/npm/`
   (this directory is in the default `.gitignore` scaffolded by `sova init`).
2. **Generate** typed Sova bindings via the `ts2sova-generator` tool, writing
   one `.sova` file per dep under `<project>/.sova/npm/bindings/<alias>/`.
3. **Type-check** your Sova code against the generated bindings.
4. **Bundle** the real npm package's JS into the production runtime — esbuild
   picks it up via `nodePaths` pointing at `.sova/npm/node_modules`.

The cache is keyed by a hash of the `[npm-dependencies]` table. Re-running
`sova build` skips reinstall + regeneration when the table is unchanged. Edit
or add a dep → cache key changes → install + generate re-run automatically.

## Dependency forms

The grammar mirrors regular `[dependencies]` — a bare version range or an
inline table:

```toml
[npm-dependencies]
# Bare version range (most common)
dayjs = "^1.11"

# Inline table when you need to override the npm package name or force the
# import style. The TOML key is the alias you use on the Sova side; the
# `package` field is the real npm package name.
stripeJs = { package = "@stripe/stripe-js", version = "^2.0" }

# Force default-import emission (skips auto-detection from the lib's .d.ts).
chalk = { version = "^5.0", default = true }
```

Available fields:

- `version` — npm semver range. Defaults to `"latest"`.
- `package` — real npm package name when it differs from the alias. Useful
  for scoped packages where the alias has no `@`/`/` characters.
- `default` — force `extern default "<pkg>" { ... }` emission (ESM default
  import) when `true`; force namespace import when `false`. Auto-detected
  from `export = X` / `export default` patterns in the lib's `.d.ts` when
  omitted.

## What gets generated

For each dep, `ts2sova-generator` walks the lib's `.d.ts` (resolved from
`package.json#types` / `package.json#typings` / `package.json#exports` /
`index.d.ts` / `@types/<lib>` fallback) and emits:

- **Interface declarations** → Sova `type` wrappers with `handle: any` field +
  typed getters/setters per property + typed methods per signature.
  Interface augmentations across files are merged (critical for libs like
  lodash where `LoDashStatic` is split across 14 files).
- **Class declarations** → same as interfaces; static methods become
  top-level `<TypeName><MethodName>` factory functions.
- **Function declarations** → top-level Sova `func`. TS overloads emit as
  multiple Sova funcs with the same name; Sova's overload resolution picks
  the best match per call site.
- **Enum declarations** → Sova `enum` (string-payload variant when all
  members are string-literal-initialized).
- **Type aliases** → Sova `using` when they resolve to a non-`any` type.
- **Top-level vars** → getter function `func name(): T { return ... }`.

JSDoc is preserved as Sova `///` doc comments — hover in your IDE shows the
upstream documentation.

Type translation degrades gracefully:

| TypeScript                                | Sova                            |
| ----------------------------------------- | ------------------------------- |
| `string` / `number` / `boolean`           | `string` / `float` / `bool`     |
| `T[]` / `Array<T>`                        | `[]T`                           |
| `Record<K, V>` / `Map<K, V>`              | `map<K, V>`                     |
| `Promise<T>`                              | `T` + `async` extern flag       |
| `T \| null \| undefined`                  | `option<T>`                     |
| `T \| U` (heterogeneous)                  | `any`                           |
| `Partial<T>` / `Readonly<T>`              | `T` (passthrough)               |
| `ArrayBuffer` / `Uint8Array` / ...        | typed wrapper (matches browserx)|
| conditional / mapped / template-literal   | `any`                           |

## Layout under `.sova/npm/`

```
.sova/npm/
  .cache-key             sha256 of the [npm-dependencies] table
  package.json           synthetic, regenerated each install
  package-lock.json      npm's lockfile (auto-generated, never moved)
  node_modules/          npm install output
  bindings/
    dayjs/
      sova.toml
      dayjs.sova         generated typed wrappers + extern blocks
```

Everything under `.sova/` is meant to be ephemeral — the `sova init` scaffold
includes it in `.gitignore` by default. If you want reproducibility across
machines, keep your `sova.toml` precise (pin exact versions instead of
ranges); the lockfile inside the cache is never committed.

## The two-tier workflow

The recommended pattern mirrors `browserx`: a **library author** runs the
generator once and publishes a Sova package with the bindings committed;
**end users** add that Sova package as a regular dep, and Sova auto-installs
the underlying npm package transitively.

**Library author** (one-time per lib):

```bash
# 1. Make a Sova package that's just the bindings
mkdir dayjs-sova && cd dayjs-sova
cat > sova.toml <<EOF
[package]
name = "dayjs"

[npm-dependencies]
dayjs = "^1.11"
EOF

# 2. Generate the bindings into src/ (one shot)
SOVA_TS2SOVA_DEV_REPO=/path/to/ts2sova-generator \
  sova build  # generates .sova/npm/bindings/dayjs/dayjs.sova

# 3. Commit the generated file as src/dayjs.sova
mkdir src
cp .sova/npm/bindings/dayjs/dayjs.sova src/dayjs.sova
git add . && git commit -m "dayjs bindings"
git push
```

**End user** (per-project, zero extra setup):

```toml
[package]
name = "myapp"

[dependencies]
dayjs = { git = "https://github.com/.../dayjs-sova" }
# or:  dayjs = { path = "../dayjs-sova" }
```

```sova
import "dayjs"
func boot() {
    let d = dayjs.dayjs("2026-06-17" as any)
    println(d.format("YYYY-MM-DD"))
}
```

`sova build` for the end user:

1. Resolves `dayjs` (the Sova binding lib) as a regular path/git dep.
2. Walks its `sova.toml`, sees `[npm-dependencies] dayjs = "^1.11"`.
3. Adds dayjs to the install plan **as transitive** — `npm install`s it into
   `.sova/npm/node_modules/` but **does NOT regenerate bindings** (trusts
   what the author committed).
4. esbuild bundles the real npm dayjs JS via `nodePaths`.

Output:
```
sova build
-> installing 1 npm package(s) into .sova/npm (0 direct, 1 transitive)
-> compiling Sova sources
ok bundled → assets/runtime.<hash>.js
```

No env var, no generator clone, no bun on the end user's machine — just
node (which Sova already requires).

## Direct npm-deps (for app authors who want one-off bindings)

If you want to generate bindings for a one-off lib in your own app (without
making a separate Sova package), declare them directly in your app's
`sova.toml`:

```toml
[npm-dependencies]
some-internal-lib = "^1.0"
```

This requires bun + the ts2sova-generator repo at build time:

```bash
SOVA_TS2SOVA_DEV_REPO=/path/to/ts2sova-generator sova build
```

The generator only runs for **direct** entries — transitive deps coming in
from your library deps are install-only.

## Known limitations

- **Function-overload merging** in TS deduplicates overloads by arity, not by
  parameter type — two overloads with the same number of params but
  different types keep only the first.
- **Generics are erased.** `Array<T>` becomes `[]any`. The TS type info is
  available but not yet threaded through.
- **Conditional / mapped / template-literal types** degrade to `any`.
- **CommonJS-only libs** without `.d.ts` or `@types/<lib>` can't bind — the
  generator needs declaration files.
- **Libraries where a single value is callable AND has static members**
  (e.g. lodash's `_`) bind partially: the callable and static surfaces are
  both emitted, but users have to remember which they're calling.

See [ts2sova-generator's README](https://github.com/sova-lang/ts2sova-generator)
for the full surface and per-library notes.
