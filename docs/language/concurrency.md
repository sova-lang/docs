---
title: Concurrency
sidebar_position: 7
---

# Concurrency

Sova borrows its concurrency model from Go: lightweight tasks
communicate through typed channels. The same surface syntax works on
both backends — `go` schedules a Go goroutine on the server, and a
Promise-based fibre on the frontend.

## `go` and the runtime

```sova
go func() {
    println("hello from a task")
}()
```

On the backend, `go fn()` is translated to a real `go fn()` statement
in the emitted Go. On the frontend, Sova provides a minimal cooperative
runtime that schedules the closure on a microtask. The two are not
interchangeable in performance terms, but they are interchangeable in
semantics.

`go` also accepts a function call directly:

```sova
go handleRequest(req)
```

## Channels

A channel is declared with `chan<T>`. Buffered channels take an integer
capacity in the initialiser:

```sova
let ch: chan<int> = chan<int>()      // unbuffered
let buf: chan<string> = chan<string>(16)  // buffered, capacity 16
```

Send and receive look like method calls:

```sova
ch.send(42)
let v, ok = ch.recv()
ch.close()
```

`recv()` returns a tuple of the value and a `bool`; the boolean is
`false` when the channel is closed and drained.

## `select`

A `select` block waits for the first of several channel operations:

```sova
select {
    case v = ch.recv() => println("got " + string(v))
    case other.send(7) => println("sent")
    default            => println("nothing ready")
}
```

`default` is optional. Without it, the select blocks until one case is
ready.

## Timers

Two helpers ship in the language for time-driven channels:

- `after(ms: int): chan<none>` — returns a channel that fires once
  after the given delay in milliseconds.
- `every(ms: int): chan<none>` — returns a channel that fires every
  `ms` milliseconds.

Both are useful inside `select`:

```sova
select {
    case _ = job.recv()  => process()
    case _ = after(5000).recv() => println("timeout")
}
```

## Synchronisation primitives

The standard library `std/sync` provides `Mutex`, `RWMutex`,
`WaitGroup`, and `Once`. Each wraps the host primitive directly on the
backend and provides a minimal queue-based implementation on the
frontend (since the browser is single-threaded but supports
cooperative coroutines):

```sova
import "std/sync"

type Cache {
    private m: sync.Mutex = new sync.Mutex()
    private data: map<string, int> = {}

    func set(k: string, v: int) {
        this.m.lock()
        this.data[k] = v
        this.m.unlock()
    }
}
```

## No `async` / `await` on the surface

Sova deliberately omits user-facing `async` and `await` keywords.
Asynchrony is a property of the call graph the compiler tracks for
you — a function is "async" iff it (transitively) calls an
extern declared `async`, and that bubbles up through every caller
automatically via the `pass_propagate_async` pass. From the
author's perspective every call looks synchronous; from the
emitter's perspective the right `await` / `Promise.resolve` calls
get inserted on the frontend, and goroutine-blocking semantics
preserved on the backend.

```sova
import "std/jwt"

// jwt.signHS256 is declared `async` in its extern. The compiler
// notices, auto-lifts issueToken (and every transitive caller) to
// the async chain, and emits `await jwt.signHS256(...)` on the JS
// side without us writing `await` at all.
func issueToken(userId: string, secret: string): string {
    return jwt.signHS256(payload(userId), secret)
}

wire(authn: false) func login(name: string): string {
    return issueToken(name, env.get("JWT_SECRET"))
}
```

The single exception is the `async` modifier on `extern func`
declarations — the binding tells the compiler the underlying
host call is asynchronous on at least one side (typically the
frontend). User-level code never writes `async func` or `await`.

This trade-off comes from prioritising language-level readability
over local fine-grain control: most Sova code is request-handler
shaped, where async chains are wide but shallow, and explicit
`await` everywhere reads as ceremonial. The escape hatch when you
need real fine-grain concurrency is `go` + channels, which Sova
keeps as first-class surface forms.

## When to use channels vs reactive state

Channels model *streams of events*: requests arriving on the server,
animation ticks on the frontend, messages from a websocket. Reactive
state (covered in [Reactivity](/frontend/reactivity)) models *the
current value of a piece of state*, including the work needed to
recompute derived values whenever a dependency changes.

In practice you reach for both in a typical app:

- Channels for the wire transport and for cross-task communication.
- Reactive state for the view layer and for any value the UI displays.
