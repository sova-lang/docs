---
title: npm packages
sidebar_position: 2
---

# Using npm packages from Sova

Sova's `extern` mechanism (see [Interop](./interop.md)) lets you bind any
JavaScript symbol by hand. For npm packages with TypeScript declarations
that's tedious work, so Sova ships an automation pipeline: a separate
generator (`ts2sova-generator`) translates `.d.ts` declarations into typed
Sova interop bindings, and `sova build` installs the underlying npm package
and bundles its JS automatically.

## The two-tier workflow

The recommended pattern mirrors how [`browserx`](https://github.com/sova-lang/browserx)
works: a **library author** runs the generator once and publishes a Sova
package with the bindings committed; **end users** just add that Sova
package as a regular dependency.

### Library author (one-time per lib)

```bash
# 1. Make a Sova package that holds the bindings
mkdir dayjs-sova && cd dayjs-sova
mkdir src
cat > sova.toml <<'EOF'
[package]
name = "dayjs"

[npm-dependencies]
dayjs = "^1.11"
EOF

# 2. Install ts2sova-generator (one-time setup; only authors need bun)
git clone https://github.com/sova-lang/ts2sova-generator
cd ts2sova-generator && bun install && cd ..

# 3. Generate once via sova build's pipeline
SOVA_TS2SOVA_DEV_REPO=$PWD/ts2sova-generator sova build
cp .sova/npm/bindings/dayjs/*.sova src/

# 4. Commit the generated .sova files
git add . && git commit -m "dayjs bindings" && git push
```

### End user (per project, zero extra setup)

```toml
# sova.toml
[package]
name = "myapp"

[dependencies]
dayjs = { git = "https://github.com/.../dayjs-sova" }
# or path = "../dayjs-sova"
```

```sova
import "dayjs"

func boot() {
    let d = dayjs.dayjs("2026-06-17" as any)
    println(d.format("YYYY-MM-DD"))                            // 2026-06-17
    println(d.add(7 as float, "day" as any).format("YYYY-MM-DD"))  // 2026-06-24
}
```

`sova build` reads the binding package's `sova.toml`, sees its
`[npm-dependencies] dayjs = "^1.11"` entry **transitively**, runs `npm
install` for the consumer, and esbuild bundles the real dayjs JS into the
runtime. No env vars on the end user's machine, no generator clone, no
bun — just `node`, which Sova already requires.

Build output:

```
sova build
-> installing 1 npm package(s) into .sova/npm (0 direct, 1 transitive)
-> compiling Sova sources
ok bundled → assets/runtime.<hash>.js
```

## Direct npm-deps (one-off bindings in your app)

If you want to bind a one-off lib in your own app without making a separate
Sova package, declare it directly in your app's `sova.toml`:

```toml
[npm-dependencies]
some-internal-lib = "^1.0"
```

This **requires bun + the ts2sova-generator repo** at build time on the
consumer's machine:

```bash
SOVA_TS2SOVA_DEV_REPO=/path/to/ts2sova-generator sova build
```

The generator only runs for **direct** entries. Transitive entries from
library deps stay install-only — Sova trusts the bindings the author
committed.

## Cache layout

Everything lives under `<project>/.sova/npm/` and is gitignored by the
default `sova init` scaffold:

```
.sova/npm/
  .cache-key             sha256 of the merged npm-deps table
  package.json           synthetic, regenerated each install
  package-lock.json      npm's lockfile (never moved into source tree)
  node_modules/          npm install output
  bindings/<alias>/      generated Sova sources, one dir per direct dep
    sova.toml
    <alias>.sova         (or multiple files when the lib is big)
```

The cache key is keyed on the **full transitive set** of npm-deps. Adding,
removing, or repinning anything in the dep tree invalidates the cache and
triggers a re-install + (for direct deps) a regenerate.

## Dependency forms

```toml
[npm-dependencies]
# Bare version range
dayjs = "^1.11"

# Inline table — override the npm package name or import style
stripeJs = { package = "@stripe/stripe-js", version = "^2.0" }

# Force default-import emission (skips auto-detection from the lib's .d.ts)
chalk = { version = "^5.0", default = true }
```

Fields:

- `version` — npm semver range. Defaults to `"latest"`.
- `package` — real npm package name when it differs from the alias.
  Useful for scoped packages.
- `default` — force `extern default "<pkg>" { ... }` emission (ESM default
  import) when `true`; force namespace import when `false`. Auto-detected
  from `export = X` / `export default` patterns when omitted.

## What gets generated

For each direct dep, the generator walks the lib's `.d.ts` (and every
transitively-referenced declaration file) and emits typed Sova wrappers:

- **Interfaces** → Sova `type` wrappers carrying a `handle: any` field +
  typed getters/setters per property + typed methods per signature.
  Augmentations across files are merged.
- **Classes** → same shape; static methods become top-level
  `<TypeName><MethodName>` factory functions.
- **Functions** → top-level Sova `func`. TS overloads emit as multiple Sova
  funcs with the same name; Sova's overload resolution picks the best
  match per call site.
- **Enums** → Sova `enum` (string-payload variant if all members are
  string-literal-initialized).
- **Type aliases** → Sova `using` when they resolve to a non-`any` type.
- **Top-level vars** → getter function `func name(): T { return ... }`.
- **Generics** are retained — `function map<T, U>(arr: T[], fn: (x: T) => U): U[]`
  emits as `func map<T, U>(arr: []T, fn: func(x: T): U): []U`.

JSDoc is preserved as Sova `///` doc comments — hover in your IDE shows the
upstream documentation, code blocks, and source links.

For libs where a single value is both callable and has static members
(lodash's `_`: `_(arr)` wraps, `_.VERSION` is a string, `_.map(...)` is a
method), both surfaces emit: a type wrapper for chain-style use and
top-level Sova funcs for static-style use. `lodash.chunk(arr, 3)` and
`lodash.wrap().chunk(arr, 3)` both work.

## Multi-file output

Big libs (three.js, pixi.js, lodash) split into one Sova file per source
`.d.ts` so the LSP only loads what you actually touch. Lodash for example
emits 13 files (`lodash.sova`, `lodash__common-array.sova`,
`lodash__common-collection.sova`, ...). All declare `package <alias>` and
Sova merges them at compile time.

The wrapper body of any single merged interface still lives in one file
(Sova types are closed — they can't extend across files). The smaller
per-source files contain the top-level static-surface funcs and the
auxiliary types.

## Known limitations

- **Conditional / mapped types** (`T extends U ? X : Y` /
  `{ [K in keyof T]: V }`) degrade to `any`. Genuinely undecidable without
  instantiation context.
- **CommonJS-only libs** that don't ship TS types and don't have a
  `@types/<lib>` package can't bind. There's no JSDoc-based fallback.
- **Direct npm-deps require bun + the ts2sova-generator repo** at build
  time. This is the only path where end-user setup beyond `node` matters;
  authoring a bindings package and depending on it avoids that.
- **The generator is currently a separate repo, not bundled into the Sova
  binary.** A future release will embed it as a node-compatible bundle so
  even the direct-dep path needs zero extra setup.

See the [ts2sova-generator README](https://github.com/sova-lang/ts2sova-generator)
for the full generator surface and per-library notes.
