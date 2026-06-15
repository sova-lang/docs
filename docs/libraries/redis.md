---
title: Redis
sidebar_position: 1
---

# Redis

**`redis`** is the Sova port of [`go-redis/v9`](https://github.com/redis/go-redis).
It gives backend Sova code a thin, opinionated surface over the most
common Redis primitives — connecting, string keys + TTLs, atomic
counters, and Pub/Sub. Everything is an `extern` binding; the Go
emitter wires every call to the host library at compile time.

The package is **backend-only**. Pub/Sub messages cross into the
frontend through Sova's [wire](/wiring/overview) layer, not by
exposing the Redis client to JavaScript directly.

## What ships

| Module       | What it covers                                                |
| ------------ | ------------------------------------------------------------- |
| `client.sova` | Connection (`connect`, `connectAddr`, `close`, `ping`), strings (`get`, `set`, `setNX`, `del`, `exists`), TTLs (`expire`, `ttl`), atomic counters (`incr`, `incrBy`, `decr`), and admin helpers (`keys`, `flushDB`). |
| `pubsub.sova` | Pub/Sub primitives (`publish`, `subscribe`, `psubscribe`, `unsubscribe`). |

## Installing

```toml
[dependencies]
redis = { version = "^0.1.0" }
```

```sova
import "redis"
```

## Connecting

`redis.connect(url)` parses a `redis://[:password@]host:port/db` URI
and returns a client handle. Returns `none` when the URL is malformed.
The first real network call actually dials — the handle is lazy:

```sova
import "redis"

func main() {
    let client = redis.connect("redis://localhost:6379/0")
    if client == none {
        println("could not parse url")
        return
    }
    if !redis.ping(client) {
        println("server unreachable")
        return
    }
    defer redis.close(client)
}
```

For explicit address + auth without a URL, use `connectAddr(addr, password, db)`:

```sova
let client = redis.connectAddr("redis-prod:6379", "s3cret", 0)
```

`redis.close(client)` releases pooled connections — call it on
shutdown.

## Strings, counters, TTLs

The string-key surface mirrors the Redis command names directly. `set`
takes a TTL in seconds (pass `0` for no expiry):

```sova
let _ = redis.set(client, "hello", "world", 60)
println("hello = " + redis.get(client, "hello"))

if redis.exists(client, "hello") {
    let _ = redis.expire(client, "hello", 300)
    println("hello expires in: " + (redis.ttl(client, "hello") as string))
}
```

`setNX` is the SET-if-not-exists variant; it returns `false` when the
key already exists so it doubles as a one-line lock primitive:

```sova
if redis.setNX(client, "lock:checkout", "owner-1", 30) {
    defer redis.del(client, ["lock:checkout"])
    // critical section
}
```

Atomic counters:

```sova
let hits = redis.incr(client, "page-views")
let chunk = redis.incrBy(client, "tokens-issued", 100)
let remaining = redis.decr(client, "stock:item-42")
```

Bulk delete + admin:

```sova
let _ = redis.del(client, ["session:abc", "session:def"])
let cacheKeys = redis.keys(client, "cache:*")
let _ = redis.flushDB(client)  // careful — clears the whole DB
```

## Pub/Sub

`publish(channel, message)` returns the number of subscribers that
received the message. `subscribe(channels, handler)` registers a
callback per delivered message and returns a subscription handle
you can `unsubscribe` later:

```sova
import "redis"

let client = redis.connect("redis://localhost:6379/0")

let sub = redis.subscribe(client, ["chat:room-1", "chat:room-2"], (channel: string, payload: string) {
    println("[" + channel + "] " + payload)
})

let _ = redis.publish(client, "chat:room-1", "hello room")

// later...
let _ = redis.unsubscribe(sub)
```

`psubscribe(patterns, handler)` is the pattern variant — match
channels by glob (`"chat:*"`, `"orders:*:created"`, …):

```sova
let sub = redis.psubscribe(client, ["orders:*:created"], (channel: string, payload: string) {
    println("new order on " + channel + ": " + payload)
})
```

The handler runs on a background goroutine the Sova→Go bridge owns;
treat it like any other event callback (don't block forever, capture
state through reactive containers if you need to surface messages to
the rest of the app).

## Surface reference

Every public function in the package, grouped by file:

### `client.sova` — connection, keys, counters

| Function                                                       | Returns | Notes                                            |
| -------------------------------------------------------------- | ------- | ------------------------------------------------ |
| `connect(url: string)`                                         | `any`   | `redis://[:pw@]host:port/db` URI; `none` on parse error. |
| `connectAddr(addr: string, password: string, db: int)`         | `any`   | Explicit components alternative.                 |
| `close(client: any)`                                           | `bool`  | Release pooled connections.                      |
| `ping(client: any)`                                            | `bool`  | Server health check.                             |
| `set(client, key, value: string, ttlSeconds: int)`             | `bool`  | `ttlSeconds = 0` → no expiry.                    |
| `setNX(client, key, value: string, ttlSeconds: int)`           | `bool`  | SET-if-not-exists; `false` when key exists.      |
| `get(client, key: string)`                                     | `string` | Empty string when key is missing.               |
| `del(client, keys: []any)`                                     | `int`   | Number of keys deleted.                          |
| `exists(client, key: string)`                                  | `bool`  |                                                  |
| `expire(client, key: string, ttlSeconds: int)`                 | `bool`  | Update TTL on an existing key.                   |
| `ttl(client, key: string)`                                     | `int`   | Remaining seconds; `-1` no TTL, `-2` no key.    |
| `incr(client, key: string)`                                    | `int`   | Atomic `+1`. Creates key as `1` if missing.      |
| `incrBy(client, key: string, delta: int)`                      | `int`   | Atomic `+delta`.                                 |
| `decr(client, key: string)`                                    | `int`   | Atomic `-1`.                                     |
| `keys(client, pattern: string)`                                | `[]any` | Glob lookup. **Don't use in hot paths** — Redis scans the whole keyspace. |
| `flushDB(client: any)`                                         | `bool`  | Deletes every key in the current DB.             |

### `pubsub.sova` — channels

| Function                                                                            | Returns | Notes                                       |
| ----------------------------------------------------------------------------------- | ------- | ------------------------------------------- |
| `publish(client, channel: string, message: string)`                                 | `int`   | Number of subscribers that received it.     |
| `subscribe(client, channels: []any, handler: func(channel, payload: string))`       | `any`   | Returns subscription handle.                |
| `psubscribe(client, patterns: []any, handler: func(channel, payload: string))`      | `any`   | Pattern variant; handler signature is identical. |
| `unsubscribe(subscription: any)`                                                    | `bool`  | Closes the subscription.                    |

## See also

- **[GORM](/libraries/gorm)** — the other big backend extern port,
  for SQL persistence.
- **[Wiring overview](/wiring/overview)** — how to surface Redis-
  backed state (counters, pub/sub messages) to the frontend without
  exposing the client directly.
- **[`go-redis` documentation](https://redis.uptrace.dev/)** —
  the upstream library; everything the Sova layer accepts is what
  the host library accepts.
