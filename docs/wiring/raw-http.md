---
title: Raw HTTP wires
sidebar_position: 5
---

# Raw HTTP wires

`wire(transport: "raw")` is the escape hatch for endpoints that don't
fit the JSON-in / JSON-out RPC shape of a regular `wire` function:
OAuth callbacks (cookies + redirects), webhook receivers (vendor-defined
body shapes), classic HTML form posts, server-sent-events bootstrap
handshakes, anything that needs to set headers or write a
non-JSON body byte-for-byte.

A raw wire skips the entire wire envelope. There's no
`(value, WireState)` tuple, no JSON encoding, no auto-generated
frontend stub. What you get is a thin handler the compiler installs
on the Sova router and passes the typed request + response handles
into:

```sova
package myapp/backend on backend

import "std/http"

wire(transport: "raw", method: "GET", path: "/oauth/discord/callback")
func discordCallback(req: http.Request, res: http.Response) {
    let code = req.query("code")
    let state = req.query("state")
    let cookieState = req.cookie("oauth_state")

    if code == "" || state != cookieState {
        res.redirect("/login?error=oauth", 302)
        return
    }

    let token = exchangeCode(code)
    res.setCookie("access_token", token, 900, true, true, "Lax", "/")
    res.redirect("/app", 302)
}
```

## Signature rules

A raw wire must take exactly two parameters in this order:

1. `req: http.Request` — the inbound request
2. `res: http.Response` — the outbound response writer

…and must not return a value. The compiler enforces all three at
compile time; misordered parameters, missing `import "std/http"`, or a
return value all produce a diagnostic.

Raw wires can only be hosted on the backend. The frontend can reach
them through a regular browser navigation, a `<form action="...">`
post, or a hand-written `fetch` — there's no Sova-generated stub.

## Why typed handles instead of bare `any`

The `req` and `res` parameters are typed `http.Request` and
`http.Response` rather than `any` so the compiler catches accidental
swaps (`func cb(res, req)`) and mis-typed handler shapes (`func cb(s:
string)`) before the build runs. The two types are thin wrappers
around the underlying `*net/http.Request` / `http.ResponseWriter`
values; the raw-wire codegen constructs them for each request, and the
`std/http` helpers below cast the underlying handle back to its
concrete `net/http` type internally.

## The `std/http` API

Every helper exists in two equivalent forms: a **method** on the
typed handle (preferred — `req.query("code")`, `res.redirect(...)`)
and a **top-level free function** taking the handle as its first
argument (`http.query(req, "code")`, `http.redirect(res, ...)`).
Pick whichever reads better in the surrounding code; method-style
matches the rest of `std/` (see `Mutex`, `Element`, `Document`).

Request — reads:

| Method                        | Free function                       | Purpose                                                    |
|-------------------------------|-------------------------------------|------------------------------------------------------------|
| `req.query(name)`             | `http.query(req, name)`             | First query-string value for `name`, or `""`.              |
| `req.queryAll(name)`          | `http.queryAll(req, name)`          | All query values for `name`.                               |
| `req.cookie(name)`            | `http.cookie(req, name)`            | Cookie value, or `""`.                                     |
| `req.header(name)`            | `http.header(req, name)`            | First request header value (canonical-case match).         |
| `req.method()`                | `http.method(req)`                  | HTTP method (`"GET"`, `"POST"`, ...).                      |
| `req.path()`                  | `http.path(req)`                    | URL path without query string.                             |
| `req.body()` / `bodyBytes()`  | `http.body(req)` / `bodyBytes(req)` | Single-shot body read as `string` / `[]byte`.              |
| `req.pathValue(name)`         | `http.pathValue(req, name)`         | URL path parameter (the `:id` in `/users/:id`).            |

Response — writes:

| Method                                                   | Free function                                                       | Purpose                                                  |
|----------------------------------------------------------|---------------------------------------------------------------------|----------------------------------------------------------|
| `res.setStatus(code)`                                    | `http.setStatus(res, code)`                                         | Write the HTTP status (one-shot).                        |
| `res.setHeader(name, value)`                             | `http.setHeader(res, name, value)`                                  | Add a response header (`Header.Add`).                    |
| `res.setHeaderReplace(name, value)`                      | `http.setHeaderReplace(res, name, value)`                           | Set a response header, replacing prior values.           |
| `res.setCookie(name, value, maxAge, httpOnly, secure, sameSite, cookiePath)` | `http.setCookie(res, ...)`                  | Write a `Set-Cookie` header. Positional options.         |
| `res.writeText(body)` / `writeHtml(body)`                | `http.writeText(res, body)` / `writeHtml(res, body)`                | Body + sensible Content-Type.                            |
| `res.writeJson(value)`                                   | `http.writeJson(res, value)`                                        | Body + `Content-Type: application/json`.                 |
| `res.writeBytes(data)`                                   | `http.writeBytes(res, data)`                                        | Raw bytes; no Content-Type set.                          |
| `res.redirect(url, status)`                              | `http.redirect(res, url, status)`                                   | `Location` header + 3xx status.                          |

## What raw wires give up

- **No `wire(authn:)` / `wire(authz:)` enforcement.** There's no
  JSON envelope to slot a `WireState.Unauthorized` into, so the
  options have no effect on raw wires. Handle auth yourself by
  reading the session cookie and returning early with
  `res.setStatus(401)` when missing.
- **No frontend stub.** The JS emitter skips raw wires entirely;
  there's nothing for the frontend to import. Browser navigations,
  forms, and hand-written `fetch` calls are the contract.
- **No `@-session`.** `@-session` only exists inside the regular
  wire envelope. Raw wires read cookies + headers directly.

## When to reach for it

Use a regular `wire` function whenever you can — you get type-safe
arguments, the wire-state envelope, the frontend stub, sessions, and
authz for free. Reach for `wire(transport: "raw")` only when the
endpoint must be reachable as a plain HTTP URL with a non-JSON
contract:

- OAuth callbacks (the provider posts query params and expects a 302)
- Webhook receivers (the vendor dictates the body shape)
- Server-sent-events bootstrap handshakes
- Classic HTML form posts to a non-JS endpoint
- Anything that needs to write non-JSON bytes byte-for-byte
