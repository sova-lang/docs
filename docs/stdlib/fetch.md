---
title: std/fetch
sidebar_position: 5
---

# std/fetch

Outbound HTTP client. `on shared` so the same surface works in
backend code (compiled through Go's `net/http`) and in frontend
code (compiled through the browser's `fetch` API).

This is intentionally separate from [`std/http`](/wiring/raw-http),
which models the **inbound** side — the typed `Request` /
`Response` handles a `wire(transport: "raw")` handler receives
from the server runtime. `std/fetch` is for code that *initiates*
requests.

```sova
import "std/fetch"

let resp = fetch.get("https://api.example.com/users")
if !resp.ok() {
    println("request failed: ${resp.status}")
    return
}
let users = json.decode(resp.body) as []any
```

## Convenience helpers

For the common cases, reach for the one-shot helpers:

| Function | Returns | Notes |
| --- | --- | --- |
| `fetch.get(url)` | `Response` | One-shot GET. |
| `fetch.post(url, body, contentType)` | `Response` | Raw body + Content-Type. |
| `fetch.postJson(url, value)` | `Response` | JSON-encode `value`, sets `Content-Type: application/json`. |
| `fetch.postForm(url, body)` | `Response` | Already-URL-encoded body, sets `Content-Type: application/x-www-form-urlencoded`. The canonical OAuth token-exchange shape. |
| `fetch.urlEncode(value)` | `string` | Percent-encodes per RFC 3986 form-encoding. |

For anything else, drop down to the builder.

## Request builder

`fetch.request(method, url)` mints a fresh `Request` builder.
Chain setters, then call `.send()` to fire it and get back a
`Response`:

```sova
let resp = fetch.request("POST", "https://api.example.com/login")
    .bearer(refreshToken)
    .header("X-Client-Version", "1.2.3")
    .withJson({"username": "alice", "remember": true})
    .timeout(5000)
    .send()
```

### Builder methods

| Method | Notes |
| --- | --- |
| `.header(name, value)` | Sets / replaces a header. Chains. |
| `.bearer(token)` | Sets `Authorization: Bearer <token>`. Chains. |
| `.withBody(body, contentType)` | Raw body + Content-Type. Chains. |
| `.withJson(value)` | JSON-encode `value`, sets `Content-Type: application/json`. Chains. |
| `.timeout(ms)` | Per-request timeout in milliseconds. Default 30s. `<= 0` disables. Chains. |
| `.send()` | Fires the request and returns a `Response`. |

The builder owns its state — there's no implicit clone between
calls, so don't share one `Request` between two `.send()`'s
unless you want both to see the same final state.

## Response

```sova
type Response {
    status: int          // HTTP status code, or 0 on transport failure
    body: string         // Body decoded as UTF-8 text
    bodyBytes: []byte    // Raw body (backend only; empty on frontend)
    headers: map<string, string>  // Single-value-per-key; repeated headers keep only last value
}
```

| Method | Returns |
| --- | --- |
| `.ok()` | `bool` — true iff `200 <= status < 300` |

### Failure surface

There are **no panics or exceptions**. Transport failures (DNS,
refused, TLS handshake, timeout, network down) surface as a
`Response` with `status = 0` and the error description in
`body`. Callers distinguish "transport down" from "4xx/5xx" by
checking `status == 0`:

```sova
let resp = fetch.get(url)
if resp.status == 0 {
    // Transport-level failure — resp.body has the error message.
    log.error("upstream unreachable: ${resp.body}")
    return
}
if !resp.ok() {
    // 4xx/5xx — resp.body is the upstream's error payload.
    return
}
// 2xx — resp.body is the success payload.
```

This shape lets the happy path stay branch-free and pushes
failure handling into explicit `if` branches, matching Sova's
no-panic policy.

## Async on the frontend, sync on the backend

`.send()` is genuinely async on the frontend — the underlying
`fetch(url, init)` call returns a Promise — and sync on the
backend (Go's `http.Client.Do` blocks). Sova auto-lifts the
async chain through callers via the `pass_propagate_async`
pass, so user code reads identically on both sides:

```sova
// This compiles the same way on backend (sync Go call) and
// frontend (await-chained Promise) — no `async` / `await` from
// the caller side.
func loadUser(id: string): User {
    let resp = fetch.get("/api/users/${id}")
    return json.decode(resp.body) as User
}
```

See [Concurrency → No async / await on the surface](/language/concurrency#no-async--await-on-the-surface)
for the full explanation of how the async lift works.

## URL-encoding example

The OAuth-style token-exchange shape:

```sova
let body =
    "grant_type=authorization_code" +
    "&code=" + fetch.urlEncode(code) +
    "&redirect_uri=" + fetch.urlEncode(redirectUri) +
    "&client_id=" + fetch.urlEncode(clientId) +
    "&client_secret=" + fetch.urlEncode(clientSecret)

let resp = fetch.postForm("https://oauth.example.com/token", body)
```

## Headers caveat

`Response.headers` is a single-value-per-key map. HTTP allows
repeated headers (`Set-Cookie` is the canonical example) but the
map shape only keeps the last value. If you need every cookie
from a `Set-Cookie: ...` chain, the backend's `bodyBytes` +
`http.Response.Header` would be the right escape hatch — file
an issue if you hit this in practice and the API can grow a
`headerAll(name) []string` accessor.
