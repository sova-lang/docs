---
title: std/streams
sidebar_position: 8
---

# std/streams

Chainable LINQ-style pipeline over slices. The shape Sova devs
reach for when they want `users.filter(...).mapTo(...).toSlice()`
instead of nested for-loops with mutable accumulators.

```sova
import "std/streams"

let names = streams.of(users)
    .filter(func(u: User): bool { return u.age >= 18 })
    .sortedBy(func(a: User, b: User): bool { return a.age < b.age })
    .take(10)
    .mapTo(func(u: User): string { return u.name })
    .joinToString(", ", func(s: string): string { return s })
```

Two design choices worth knowing up-front:

- **Eager.** Every step builds a new slice in memory. Simple
  and predictable; for streams of a few thousand items it's the
  right trade-off. For multi-million-item streams you'd want
  lazy fused stages; that's not what this library is.
- **Cross-platform.** The package is `on shared` — same chain
  surface emits to Go on the backend and JavaScript on the
  frontend. Reach for it from either side without thinking about
  which one you're on.

## Construction

```sova
streams.of([]T) Stream<T>     // raw slice
streams.empty<T>() Stream<T>  // zero elements, T inferred from context
```

## Type-preserving operations

These return `Stream<T>` with the same element type. Chainable
without thinking.

| Op | What it does |
| --- | --- |
| `filter(pred)` | Keep elements for which `pred(x)` is true. Order preserved. |
| `take(n)` | Keep the first `n` elements. |
| `skip(n)` | Drop the first `n` elements. |
| `takeWhile(pred)` | Keep elements from the start while `pred(x)` is true; stop at first false. |
| `skipWhile(pred)` | Drop elements from the start while `pred(x)` is true; keep everything from first false onwards. |
| `distinctBy(keyFn)` | First occurrence per key wins; later duplicates dropped. |
| `reverse()` | Order reversed. |
| `sortedBy(less)` | Insertion sort (stable, O(n²) — fine up to a few thousand items). `less(a, b)` returns true when `a` should come before `b`. |
| `peek(fn)` | Apply `fn` for its side effect; pass the stream through unchanged. Useful for mid-chain logging. |

## Type-changing operations

| Op | Element shape |
| --- | --- |
| `mapTo<U>(fn)` | `T → U`. Returns `Stream<U>`. |
| `flatMapTo<U>(fn)` | `T → []U`; concatenates. Returns `Stream<U>`. |

The `<U>` is a **method-level generic** — Sova's type inference
resolves it from `fn`'s return type at the call site.

## Terminal: drain to a value

| Op | Returns | Notes |
| --- | --- | --- |
| `count()` | `int` | Number of elements. |
| `isEmpty()` | `bool` | True when no elements. |
| `first()` | `option<T>` | `none` when empty. |
| `last()` | `option<T>` | `none` when empty. |
| `firstMatch(pred)` | `option<T>` | First element where `pred(x)` is true. |
| `allMatch(pred)` | `bool` | True when every element satisfies `pred`. True for empty streams. |
| `anyMatch(pred)` | `bool` | True when at least one element satisfies `pred`. False for empty streams. |
| `noneMatch(pred)` | `bool` | True when no element satisfies `pred`. True for empty streams. |
| `reduce<R>(seed, combine)` | `R` | Left fold from `seed`. Use when the accumulator's type differs from `T`. |
| `fold<R>(seed, combine)` | `R` | Alias for `reduce`. |
| `joinToString(sep, render)` | `string` | Concatenates `render(x)` separated by `sep`. |
| `groupBy<K>(keyFn)` | `map<K, []T>` | Buckets elements by `keyFn(x)`. |

## Terminal: drain to a collection

| Op | Returns |
| --- | --- |
| `toSlice()` | `[]T` |
| `forEach(fn)` | `()` — applies `fn` to each element. |

## Combining streams

```sova
streams.concat<T>(a: Stream<T>, b: Stream<T>) Stream<T>
```

Joins two streams end-to-end. Both inputs must have the same
element type.

## Worked examples

**Sum the ages of adult users:**

```sova
let totalAge = streams.of(users)
    .filter(func(u: User): bool { return u.age >= 18 })
    .reduce(0, func(acc: int, u: User): int { return acc + u.age })
```

**CSV-style join of names, longest-first:**

```sova
let csv = streams.of(users)
    .sortedBy(func(a: User, b: User): bool { return len(a.name) > len(b.name) })
    .mapTo(func(u: User): string { return u.name })
    .joinToString(",", func(s: string): string { return s })
```

**Group by domain:**

```sova
let byDomain = streams.of(emails)
    .groupBy(func(e: string): string { return extractDomain(e) })
// byDomain["gmail.com"] -> []string of those emails
```

**Take adult IDs, drop duplicates, keep first 100:**

```sova
let ids = streams.of(users)
    .filter(func(u: User): bool { return u.age >= 18 })
    .mapTo(func(u: User): string { return u.id })
    .distinctBy(func(s: string): string { return s })
    .take(100)
    .toSlice()
```

## Performance notes

- Every step allocates a fresh `[]T`. For a 100-step chain over
  1000 items, that's 100 slice allocations. Acceptable for
  typical request-shaped workloads; not for tight inner loops on
  millions of items.
- `sortedBy` is insertion sort. For datasets above ~5000 items
  you want a merge/quicksort implementation; sort the underlying
  slice manually and wrap it with `streams.of(sorted)`.
- `distinctBy` is `O(n²)` because it does linear key lookup. For
  large streams with many distinct values, dedupe via a
  `map<K, bool>` keyed on the result of `keyFn` and rebuild a
  slice from that.

## What's not in this library

- **Lazy / fused iteration.** Every method materialises a slice.
  No `Iterator<T>` underlying the chain.
- **Parallel evaluation.** All operations run sequentially on
  the calling goroutine. Spin your own `parallel.map` if you
  need it.
- **`std/list.List<T>` integration.** Convert via `streams.of(list.toSlice())`.
