---
title: std/random
sidebar_position: 3
---

# std/random

`std/random` ships three layers:

1. **Quick-and-dirty random.** `nextInt` / `nextFloat` / etc. —
   wall-clock-seeded helpers for casual use. Hooked into the
   test runner's determinism seam so test suites can pin
   sequences.
2. **Cryptographically-secure random.** `bytes(n) []byte` and
   `hex(n) string` over `crypto/rand` (Go's kernel CSPRNG) on
   the backend and `crypto.getRandomValues` (browser CSPRNG)
   on the frontend. Use for tokens, session IDs, refresh tokens
   — anything that must not be guessable.
3. **Seeded PRNG + weighted picker.** `Rng` is a Park-Miller
   LCG with explicit, mutable state — bit-identical between
   backend and frontend for the same seed. `WeightedPool<T>` is
   a generic probability-weighted selector that hands out items
   according to ratios you assign.

```sova
import "std/random"
```

## Casual random (wall-clock seeded)

| Function | Returns | Notes |
| --- | --- | --- |
| `nextInt()` | `int` | Non-negative pseudo-random integer. |
| `nextFloat()` | `float` | In `[0, 1)`. |
| `intBetween(lo, hi)` | `int` | In the half-open range `[lo, hi)`. |
| `floatBetween(lo, hi)` | `float` | In `[lo, hi)`. |
| `nextBool()` | `bool` | Uniform. |

These are seeded from `time.Now().UnixNano()` (backend) and
`Math.random()` (frontend), so calls vary between runs and
between platforms. **Not crypto-grade.** Use the next section
when guessability matters.

The test runner can swap the seed via the `__sovaTestHarness`
hook so a test suite gets a deterministic sequence — see the
[Testing docs](/advanced/testing).

## Cryptographic random

| Function | Returns | Notes |
| --- | --- | --- |
| `bytes(count: int)` | `[]byte` | `count` cryptographically-secure random bytes. |
| `hex(byteCount: int)` | `string` | `byteCount` bytes hex-encoded as `2 * byteCount` lowercase hex chars. |

Backend draws from `crypto/rand`; frontend draws from
`crypto.getRandomValues`. Both are documented kernel/browser
CSPRNGs — appropriate for tokens, session IDs, refresh tokens,
opaque identifiers.

```sova
// 64 hex chars = 256 bits of entropy — typical refresh-token shape.
let refreshToken = random.hex(32)

// Raw byte buffer for further crypto.
let nonce = random.bytes(12)
```

The casual helpers above are explicitly NOT crypto-secure. Use
`bytes` / `hex` when guessability would compromise security.

## Rng — seeded PRNG

`Rng` is a deterministic generator: the same seed always
produces the same sequence, on both backend and frontend.

Implementation is the **Park-Miller** linear congruential
generator (`state * 48271 mod 2147483647`). The arithmetic
stays within `Number.MAX_SAFE_INTEGER`, so the sequence is
**bit-identical between backend and frontend** for the same
seed — you can pre-generate a sequence server-side and the
client-side replay matches exactly.

### Construction

```sova
let r = random.seeded(42)

// Two instances with the same seed produce the same sequence.
let r1 = random.seeded(42)
let r2 = random.seeded(42)
for i in 0..5 {
    println(r1.intBetween(0, 100))  //=> 82 7 37 15 42
}
for i in 0..5 {
    println(r2.intBetween(0, 100))  //=> 82 7 37 15 42 — same
}
```

Seed `0` (or any multiple of `2147483647`) is normalised to `1`
to avoid the LCG's degenerate fixed point. Negative seeds are
absolute-valued before normalisation.

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.nextInt()` | `int` | Advances state. Always in `[1, 2147483647)`. |
| `.nextFloat()` | `float` | Sequence value mapped to `[0, 1)`. |
| `.intBetween(lo, hi)` | `int` | Half-open `[lo, hi)`. `hi > lo` required. |
| `.floatBetween(lo, hi)` | `float` | Half-open `[lo, hi)`. |
| `.nextBool()` | `bool` | Uniform from the sequence. |

**Not crypto-grade.** Park-Miller is great for reproducible
sequences (tests, replayable procedural content, deterministic
simulation), but a determined attacker who sees ~3 outputs can
predict the rest. Use `random.bytes` / `random.hex` for
anything security-sensitive.

## WeightedPool — generic weighted picker

`WeightedPool<T>` is a collection of items each tagged with a
probability weight, supporting weighted-random selection. Two
modes:

- **With replacement** (`pick()` / `pick(remove: false)`) —
  pool unchanged.
- **Without replacement** (`pick(remove: true)`) — the selected
  item and its weight are dropped from the pool. Useful for
  drawing N distinct items from the same pool.

### Quick use

```sova
let pool = new random.WeightedPool<string>()
pool.add("common", 0.7)
pool.add("rare", 0.25)
pool.add("legendary", 0.05)

// 70/25/5 distribution.
let drop = pool.pick() ?? "miss"
```

Weights are raw ratios — they don't need to sum to 1. Zero or
negative weights are accepted but their items will never be
picked. Empty pool (or one whose weights all sum to ≤ 0) returns
`none` from `pick`.

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.add(item: T, weight: float)` | | Appends with the given weight. |
| `.size()` | `int` | Current item count. |
| `.isEmpty()` | `bool` | |
| `.totalWeight()` | `float` | Sum of all weights — useful for computing normalised probabilities. |
| `.pick(remove: bool = false)` | `option<T>` | Default uses the global random source (wall-clock seeded). |
| `.pickWith(rng: Rng, remove: bool = false)` | `option<T>` | Rolls against the supplied `Rng` instead. |

### Deterministic picks

For tests or reproducible procedural content, pair `WeightedPool`
with a seeded `Rng`:

```sova
let pool = new random.WeightedPool<string>()
pool.add("a", 1.0)
pool.add("b", 1.0)
pool.add("c", 1.0)

let r = random.seeded(1337)
for i in 0..1000 {
    let drop = pool.pickWith(r) ?? "miss"
    // ...
}
// Same seed, same 1000 draws.
```

### Sampling without replacement

Draw 3 distinct items from a pool of 5:

```sova
let bag = new random.WeightedPool<int>()
bag.add(1, 1.0)
bag.add(2, 1.0)
bag.add(3, 1.0)
bag.add(4, 1.0)
bag.add(5, 1.0)

let r = random.seeded(99)
for i in 0..3 {
    let drawn = bag.pickWith(r, remove: true) ?? -1
    println(drawn)
}
println(bag.size())   //=> 2
```

The three returned values are distinct. Subsequent `pick`s only
draw from the remaining items.

### Weighted vs. uniform

For uniform sampling without weights, you can either use
`WeightedPool` with all-1.0 weights (as in the example above)
or call `intBetween(0, n)` to pick an index directly. The pool
shape gives you `remove: true` for free.
