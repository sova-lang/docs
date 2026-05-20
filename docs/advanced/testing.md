---
title: Testing
sidebar_position: 2
---

# Testing

Sova ships a built-in test runner that drives both backends from a
single command. Tests are first-class declarations (`test "name"`),
the runner is `sova test`, and the same test source can exercise the
backend (compiled to Go and run as a binary) and the frontend
(compiled to JavaScript and run inside an embedded JS runtime).

This page is intentionally short on history; the most useful
information for a v1 user is the surface API. Expand into your project
when you actually start writing tests.

## A first test

```sova
package math/tests on shared

test "addition is commutative" {
    assert add(2, 3) == add(3, 2)
}
```

`test "..."` declares a test whose body runs once. `assert <expr>`
fails the test when the expression is false. The runner reports the
failing line and the rendered values.

Sova tests run inside the package they live in, so they have access to
private helpers and package-private symbols.

## Setup and teardown

Both per-test and per-group setup are supported:

```sova
test "uses a fixture" {
    setup {
        let db = newTestDatabase()
    }

    teardown {
        db.close()
    }

    db.insert(...)
    assert db.count() == 1
}
```

`setup` runs before every assertion in the test, `teardown` after.
The `setup` and `teardown` blocks share their scope with the test body
so any variable declared there is visible below.

For shared setup across many tests, use a `group`:

```sova
group "math suite" {
    setupAll {
        let r = random.seeded(42)
    }

    test "produces deterministic output" {
        assert next(r) == 17
    }

    test "and again" {
        assert next(r) == 91
    }
}
```

`setupAll` runs once for the entire group; `teardownAll` runs after
the last test.

## Tagging

Tests and groups accept a tag list:

```sova
test "expensive" tag: "slow", "network" {
    assertEventually(...)
}
```

Run a subset of tests by tag:

```bash
sova test --tag slow
sova test --no-tag network
```

## Parallelism

Add `parallel` to a test or group to run it concurrently with others
that share the parallel flag:

```sova
test "io heavy" parallel {
    // runs alongside other parallel tests
}
```

The runner enforces a sane default concurrency limit and serialises
non-parallel tests automatically.

## Frontend tests in the same source

A shared `test` declaration runs on both sides by default. Pin to a
single side with the explicit annotation:

```sova
test "backend-only" on backend {
    assert os.platform() != ""
}

test "frontend-only" on frontend {
    assert window.location.protocol != ""
}
```

The runner spawns the Go test binary for backend tests and an embedded
JS runtime (currently powered by [goja](https://github.com/dop251/goja))
for frontend tests, so a single `sova test` invocation covers both
artefacts.

## Determinism

Two helpers make tests independent of wall-clock and entropy:

- `time.now()` returns a deterministic clock that only advances when
  the test calls `testing.advanceTime(ms)`.
- `random.*` is seeded to a fixed value per test so any session ID or
  HMAC signature derived from it is byte-stable across runs.

Both helpers can be overridden inside a single test if you genuinely
need wall time or real entropy:

```sova
test "needs the real clock" {
    setup { testing.useRealTime() }
    ...
}
```

## What `sova test` reports

The default reporter prints a per-test PASS/FAIL line, then a
per-package summary, then the offending source snippets for any
failures. The exit code is the standard `0` on success, `1` on any
failure.

For CI, pass `--format json` to get a machine-readable summary, or
`--junit` to emit a JUnit-style XML report.
