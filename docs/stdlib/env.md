---
title: std/env
sidebar_position: 4
---

# std/env

Cross-platform access to runtime configuration. The same surface
works on backend (`os.Getenv` / `os.LookupEnv`) and frontend
(reads from `globalThis.__SOVA_ENV` populated by the page shell)
— so configuration code can live in `on shared` files and read
identically on both sides.

```sova
import "std/env"

let port = env.getOr("PORT", "3000")
let secret = env.lookup("JWT_SECRET") ?? panic("JWT_SECRET required")
```

## Four lookup functions

| Function | Returns | When unset |
| --- | --- | --- |
| `env.get(name)` | `string` | `""` (empty string) |
| `env.getOr(name, fallback)` | `string` | `fallback` (also when set to `""`) |
| `env.has(name)` | `bool` | `false` — distinguishes "unset" from "set to empty" |
| `env.lookup(name)` | `option<string>` | `none` — `some(value)` includes the empty-string case |

The four cover the cases you'll actually hit:

- **`get`** when an empty string is a sensible fallback. Quick
  and silent.
- **`getOr`** when you want a non-empty default. Use this for
  tunables like `PORT`, `LOG_LEVEL`.
- **`has`** as a feature gate. `if env.has("DEBUG") { ... }`.
- **`lookup`** when you need to distinguish "unset" from "set
  to empty", or when you want typed missingness. Pair with
  `guard` or `??` for required values.

## No `mustGet` — and why

Sova explicitly doesn't ship a panic-on-missing helper. Panics
in generated code produce poor diagnostics, leak into hot paths,
and tend to grow tendrils. The idiomatic patterns:

```sova
// Fail fast at boot with a structured error.
guard env.lookup("JWT_SECRET")
// JWT_SECRET is now bound and known-good past this point.

// Inline fallback.
let url = env.lookup("API_URL") ?? "http://localhost:3000"

// Branch on presence.
if env.has("FEATURE_FLAG_X") {
    // ...
}
```

If your boot path really wants a single fail-fast line, write it
yourself — it's three lines, and you get to control the error
message.

## Sides

`std/env` is `on shared`. The backend extern wraps `os.Getenv`
/ `os.LookupEnv`; the frontend extern reads from
`globalThis.__SOVA_ENV`, a plain `{ KEY: "value" }` object the
page populates before Sova boots. Two ways to fill it:

1. **Manually**, as a `<script>` block in your HTML shell.
   Useful when you render server-side and want to thread real
   env vars through to the client.
2. **Automatically**, via the dotenv autoload (next section).

If `__SOVA_ENV` is missing, every frontend lookup returns the
empty string / `none`. No errors, no warnings — the absence is
treated as "no config available", which is the right default for
SSG-like builds.

## Dotenv autoload (`[env]` in `sova.toml`)

Opt your project into automatic dotenv loading by adding an
`[env]` table:

```toml
# sova.toml
[env]
autoload = true
files = [".env", ".env.${profile}", ".env.local", ".env.${profile}.local"]
public_prefix = "PUBLIC_"
```

The build pipeline reads each file in declaration order, later
values winning, then bakes the merged map into the build:

- **Backend**: emits an `init()` block that calls
  `os.Setenv(k, v)` for each loaded variable, but only when the
  key is **not already set** in the live process environment —
  so a real env-var at run time always wins over the file-baked
  default.
- **Frontend**: emits a `globalThis.__SOVA_ENV = {...}` literal
  at the very top of the JS bundle. Only keys whose name starts
  with `public_prefix` are included.

### Public prefix and security

The default `public_prefix` is `""` — empty string — which
exposes **nothing** to the frontend. This is the fail-closed
default: you have to explicitly mark variables as client-safe
by giving them a `PUBLIC_` (or whatever prefix you pick) prefix.
`SECRET_KEY` stays server-side; `PUBLIC_API_URL` makes it into
the bundle.

```env
DATABASE_URL=postgres://localhost/myapp     # backend-only
SECRET_KEY=hunter2                          # backend-only
PUBLIC_API_BASE=https://api.example.com     # exposed
PUBLIC_FEATURE_X=true                       # exposed
```

With `public_prefix = "PUBLIC_"`, the bundle ships only the
`PUBLIC_*` keys; the others stay server-only.

### Profiles

The `files` array supports a `${profile}` placeholder. The
profile name comes from the `SOVA_PROFILE` build-time env var
(defaulting to `"development"`), so you can ship a base `.env` +
per-profile overlays without touching the manifest per
environment:

```
SOVA_PROFILE=production sova build
# reads .env, .env.production, .env.local, .env.production.local
```

The Vite / Next.js convention: layered files, later entries
winning, machine-local overlays (`.env.local`) typically
`.gitignore`'d to keep developer-specific overrides out of the
repo.

### Missing files

Files that don't exist on disk are silently skipped — there's no
error. So a base `.env` + an optional `.env.local` works without
a `.env.local` having to exist.

## Reading the loaded env from code

Once `[env].autoload` is on, your `env.get(...)` / `env.lookup(...)`
calls just work. There's no separate API to "consult the dotenv";
the loader injects values into the environment before user code
runs, so a normal `env.get("DATABASE_URL")` returns the dotenv
value (unless overridden by a real process env var).
