---
title: Standard Library
sidebar_position: 1
---

# Standard Library

Sova ships a small but opinionated standard library under the `std/`
import prefix. Every shipped module lives next to the compiler binary
(or under `$SOVA_HOME`), so an `import "std/foo"` always resolves to
the same code regardless of project layout — there's nothing to put
in `sova.toml`.

The stdlib's design promises:

- **Cross-platform by default.** A package marked `on shared`
  compiles into both backend (Go) and frontend (JavaScript)
  emit, with identical surface and semantically-equivalent
  behaviour. Reach for `std/fetch` or `std/env` from either side
  without thinking about which one you're on.
- **No panics.** Failure modes that could panic in another
  language surface as `option<T>` instead: `time.parse(...)` →
  `option<Instant>`, `env.lookup(...)` → `option<string>`,
  `pool.pick()` → `option<T>`. Callers decide what "missing"
  means; the stdlib never aborts the host process for you.
- **Typed handles, not raw integers.** Time has `Instant` and
  `Duration`. Random has `Rng`. Pools have `WeightedPool<T>`.
  Raw-integer escape hatches exist for legacy interop (`time.now()
  int`), but new code should reach for the typed surface.
- **No surprises across the wire.** Stdlib types are wire-shaped:
  `Instant` rides the wire as an int64, `DateTime` as
  `(nanos, zoneName)`, `Date` as three small ints. A wired
  function that returns `Instant` reifies to a typed handle on
  both sides without further surgery.

## Modules at a glance

| Module | What it ships |
| --- | --- |
| [`std/time`](/stdlib/time) | `Instant`, `Duration`, `Zone`, `Date`, `DateTime`, DST helpers, pattern formatter / parser. |
| [`std/random`](/stdlib/random) | `nextInt`/`nextFloat`/..., crypto-grade `bytes` / `hex`, seeded `Rng`, generic `WeightedPool<T>`. |
| [`std/env`](/stdlib/env) | Cross-platform env-var access (`get` / `getOr` / `lookup`), no panics. |
| [`std/fetch`](/stdlib/fetch) | Outbound HTTP client (`Request` builder, `Response`), `on shared`. |
| `std/strings` | Substring, case, split, join, trim, replace. |
| `std/list` | `List<T>`, `LinkedList<T>`, concurrent variants. |
| `std/sync` | `Mutex`, `RWMutex`, `WaitGroup`, `Once`. |
| `std/json` | `parse` / `stringify`. Returned `any` supports direct `[k]` indexing. |
| `std/errors` | Helpers around the built-in `error` type. |
| `std/http` | **Inbound** HTTP types used by raw wires (`Request`, `Response`). See [Raw HTTP wires](/wiring/raw-http). |
| `std/jwt` | JWT signing / verification. |
| `std/crypto` | SHA-256/512, HMAC. |
| `std/hex` | Hex encoding. |
| `std/base64` | Base64 (standard + URL-safe variants). |
| `std/concurrent` | `setTimeout` / `setInterval`-style helpers backed by goroutines or browser timers. |

This section documents the four packages with the deepest surface;
the rest are concise enough to read directly from source — `ctrl+click`
any symbol in your editor jumps to the actual stdlib file.

## Cross-platform vs. one-sided

Most stdlib packages are `on shared`. Three exceptions:

- `std/http` is **backend-only** (it wraps `net/http`'s server
  surface, which doesn't exist in a browser).
- `std/jwt`'s sign / verify path is async on the frontend (uses
  WebCrypto) and sync on the backend — Sova auto-lifts the async
  chain through callers via the `pass_propagate_async` pass, so
  user code reads identically on both sides.
- The dotenv loader (`sova.toml [env]` autoload) is purely a
  backend init concern; the frontend reads from `globalThis.__SOVA_ENV`
  populated by the page shell. From user code this is invisible —
  `env.get("X")` works on both sides.

The package docs call out side-specific behaviour where it
matters.

## No-panic policy

Every function in the stdlib that *could* fail (parse a malformed
string, look up a missing env var, draw from an empty pool)
returns `option<T>` rather than panicking. The two canonical
unwrap shapes:

```sova
// Default fallback — never panics, type stays narrow.
let port = env.lookup("PORT") ?? "3000"

// Force-unwrap when you're sure — host nil-deref if wrong.
let zone = time.zone("Europe/Berlin")!
```

`!` is for the "this can't be none, and if it is the program
has bigger problems" case. `??` is for the "I have a sensible
fallback" case. The stdlib makes both ergonomic.
