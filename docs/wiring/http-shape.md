---
title: HTTP-shape wires
sidebar_position: 6
---

# HTTP-shape wires

`wire` is normally JSON-RPC: a wired function turns into a POST handler
at `/__wire/<name>` that receives a JSON body and returns a JSON envelope.
That works for 90% of backend↔frontend calls — same signature both sides,
typed args, typed return.

Some calls don't fit that shape: an OAuth callback that reads a query
param + cookie and returns a redirect, a webhook receiver that ingests a
form-urlencoded body, a download endpoint that streams bytes. Until now
the only escape was [`wire(transport: "raw")`](/wiring/raw-http) — full
manual `http.Request` / `http.Response` access, but no frontend stub,
no typed return, no auth wrapper.

**HTTP-shape wires** are the middle ground. You declare a `path` and
`method` on the wire decorator, annotate each parameter with where its
value comes from (`@query`, `@path`, `@header`, `@cookie`, `@body`), and
optionally return one of the typed response types in `std/http`
(`http.Redirect`, more coming). The frontend stub still gets generated —
calling the wire from the frontend sends a real HTTP request with the
annotation-driven shape, and the response is reified back through the
declared return type. Session handling (`@.user` / `@.authenticate`)
keeps working exactly like JSON-RPC wires.

## When to use which

| Style | When |
| --- | --- |
| Default `wire func foo(x, y): T` (JSON-RPC) | Internal RPC between backend and frontend. The 90% case. |
| `wire(path, method) func foo(@query x, @path id): T` (HTTP-shape) | OAuth callbacks, REST-ish public endpoints, anything where the URL/headers matter. Still gets a typed frontend stub. |
| `wire(transport: "raw")` (raw) | Streaming responses, multipart uploads, server-sent events, anything fully byte-level. No frontend stub. |
| `http.addCustomWireHandler(path, fn)` (runtime) | Same shape as raw, but registered from user code at runtime instead of declared at parse time. Useful when paths come from config or a plugin registry. |

## Quick start: OAuth callback

```sova
import "std/http"
import "std/random"
import "std/oauth2"

let discord = oauth2.client(
    config: oauth2.presets.discord,
    clientId: env.get("DISCORD_CLIENT_ID"),
    clientSecret: env.get("DISCORD_SECRET"),
    redirectURI: "https://my.app/login/discord/callback",
)

wire(authn: false, method: "GET", path: "/login/discord")
func startLogin(): http.Redirect {
    let state = random.hex(16)
    let opts = http.cookieOptions(true, true, "Lax", "/", 600)
    return http.redirectTo(discord.authorizeURL(state))
        .setCookie("oauthState", state, opts)
}

wire(authn: false, method: "GET", path: "/login/discord/callback")
func discordCallback(
    @query code: string,
    @query state: string,
    @cookie oauthState: string,
): http.Redirect {
    if state != oauthState {
        return http.redirectTo("/login?error=state_mismatch")
    }
    let tok = discord.exchange(code)
    let user = upsertUser(discord.userInfo(tok.accessToken))
    @.authenticate(user.id, {})
    return http.redirectTo("/dashboard").clearCookie("oauthState")
}
```

No `http.Request` / `http.Response` anywhere — annotations carry the
binding intent, the typed return carries the response shape, and the
session (`@`) still works because HTTP-shape wires use the same
authentication pipeline as JSON-RPC ones.

## Parameter annotations

Each annotation maps the param to a different part of the incoming
request. They're mutually exclusive — pick exactly one per param. A
param **without** an annotation falls back to the default (URL query
for GET/DELETE, JSON body for POST/PUT/PATCH) — that's why existing
JSON-RPC wires keep working unchanged.

| Annotation | Source | Frontend stub behaviour |
| --- | --- | --- |
| `@query name?` | `?name=value` in the URL | Adds `?name=encodeURIComponent(value)` |
| `@path name?` | Path placeholder `:name` | Substitutes into the URL template |
| `@header name?` | HTTP header `name` | Adds to `fetch`'s `headers:` |
| `@cookie name?` | Cookie `name` | **Ignored on the stub** — browsers send cookies automatically via `credentials: 'include'`. Setting an arbitrary cookie from JS isn't possible for httpOnly cookies. |
| `@body name?` | JSON body field `name` | Adds to the JSON body |

The annotation takes an optional string argument: an alternate name
to bind. So `@query("user-id") userId: string` reads `?user-id=...`
but exposes `userId` to the function body.

### Path placeholders

`wire(path: "/users/:id")` — `:name` placeholders extract path
segments. The param annotated with `@path id` (or named `id` with no
annotation — backward-compat name-matching) binds the segment value.
Placeholder validation is compile-time: a `@path` param whose name
doesn't appear in the path produces an error.

### Body

When the method is POST/PUT/PATCH and one or more params have no
annotation (or have `@body`), they go into a JSON body object keyed
by their names. You can mix annotated params with body-bound ones:

```sova
wire(method: "POST", path: "/users/:id/avatar")
func setAvatar(
    @path id: string,
    @header authz: string,
    url: string,
    crop: bool,
): User {
    // url and crop arrive as JSON body fields
}
```

The frontend stub serialises `{url, crop}` as the body and sets
`Authorization` from `authz`. Path `:id` is substituted.

## Typed response types

Return one of the types in `std/http` to opt into a specific HTTP
response shape instead of the JSON envelope.

### `http.Redirect`

302 / 301 / 303 / 307 / 308 redirects with optional cookies. Construct
via:

```sova
http.redirectTo(url)                    // 302 by default
http.redirectWithStatus(url, 301)        // permanent
```

Chainable cookie helpers:

```sova
let opts = http.cookieOptions(
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 3600,
)
return http.redirectTo("/dashboard")
    .setCookie("sessionFlavor", "vanilla", opts)
    .clearCookie("oauthState")
```

The backend writes `Location:`, the requested status, and zero or more
`Set-Cookie:` headers. The frontend stub for a `http.Redirect`-returning
wire surfaces the new location to JS (instead of letting `fetch`
transparently follow it).

### `http.Html`

Server-rendered HTML pages. Sets `Content-Type: text/html; charset=utf-8`
automatically, supports cookies, custom status code:

```sova
wire(method: "GET", path: "/pages/:slug")
func renderPage(@path slug: string): http.Html {
    let page = loadPage(slug)
    if page == none {
        return http.htmlWithStatus("<h1>Not found</h1>", 404)
    }
    return http.html("<article>" + page!.body + "</article>")
        .setCookie("lastViewed", slug, http.cookieOptions(false, false, "Lax", "/", 86400))
}
```

Frontend stub returns `{body: string, status: int}` so client code can
inject the HTML into the DOM or branch on the status code.

### `http.File`

Downloads or inline-rendered binary content. Sets the appropriate
`Content-Disposition` and `Content-Type` headers:

```sova
wire(method: "GET", path: "/invoices/:id/pdf")
func downloadInvoice(@path id: string): http.File {
    let pdf = renderInvoicePdf(id)
    return http.file(pdf, "invoice-" + id + ".pdf", "application/pdf")
}

wire(method: "GET", path: "/avatars/:userId")
func avatar(@path userId: string): http.File {
    let png = loadAvatar(userId)
    return http.fileInline(png, "image/png")
}
```

`file(data, filename, contentType)` produces a download
(`Content-Disposition: attachment`). `fileInline(data, contentType)`
embeds inline so the browser renders it (`Content-Disposition:
inline`). Frontend stub returns `{data: Blob, filename: string,
contentType: string, status: int}`.

### `http.Status<T>`

A typed JSON response with an explicit HTTP status code and optional
headers. Use for REST-ish endpoints that need 201 Created, 202
Accepted, etc.:

```sova
wire(method: "POST", path: "/users")
func createUser(name: string, email: string): http.Status<User> {
    let user = persistUser(name, email)
    let s = new http.Status<User>()
    s.body = user
    s.status = 201
    return s.setHeader("Location", "/users/" + user.id)
}
```

The body still rides the standard `{value, state}` envelope, so the
wire's authn/authz contract continues to work. The frontend stub
returns `{body: T, status: int}` — your call site sees the typed `T`
under `body`, and can read the actual HTTP status code if it cares:

```js
const [result, state] = await createUser("alice", "alice@example.com")
// result.status === 201
// result.body === { id: "...", name: "alice", email: "alice@example.com" }
```

## Path collisions

Two `wire(path: "/x")` declarations with the same method are a
**compile error** — there's no silent last-wins. The error points at
both definitions:

```
wired route GET /users/:id collides with previously declared function 'getUserById'
```

This includes collisions with `http.addCustomWireHandler` registrations
made at runtime — but those happen too late for the compiler to catch,
so the runtime API returns an error instead (see below).

## `http.addCustomWireHandler` — runtime registration

Sometimes the path or handler isn't known until user code runs (loaded
from config, registered by a plugin, looped over a list of webhook
endpoints). `addCustomWireHandler` registers a raw-style handler at
runtime, before the server starts serving:

```sova
import "std/http"

func setupWebhooks() {
    let paths = env.get("WEBHOOK_PATHS").split(",")
    for path in paths {
        let err = http.addCustomWireHandler(path, func(req: http.Request, res: http.Response) {
            // raw req/res, same as `wire(transport: "raw")`
            http.writeText(res, "ok")
        })
        if err != none {
            log.error("webhook collision at " + path)
        }
    }
}

func main() {
    setupWebhooks()
}
```

Returns `option<error>`:
- `none` — registered successfully
- `some(error)` — either the path is already taken (by a declared wire OR a previous `addCustomWireHandler` call), or the server has already started (registration must happen before the wire server begins serving — typically inside `main()` before it returns).

The collision behaviour is **first-call-wins**: declared wires register
first (codegen emits them during server boot), then user calls to
`addCustomWireHandler` fill in additional routes. Conflicts are
detected at call time, not at server start.

## Session access

HTTP-shape wires and JSON-RPC wires share the same session pipeline:

```sova
wire(method: "POST", path: "/api/comments")
func createComment(@path postId: string, body: string): Comment {
    let userId = @.user as string         // load session
    let c = persistComment(userId, postId, body)
    @.authenticate(userId, {"last_seen": now})  // mutate session
    return c
}
```

The browser's cookies (set when the user logged in) get sent
automatically with every `fetch`; the backend loads `__session` from
the cookie, runs the handler, and writes back any session mutations.
Frontend `wire(authn: true)` (the default) gates the call with
`WireStateUnauthorized` if no valid session is present.

`@.authenticate(userId, claims)` works the same way on
`http.Redirect`-returning wires — the session cookie gets written
alongside the `Location` header, so the redirected request lands
authenticated.

## Frontend stub semantics

The generated frontend stub for `wire(method: "GET", path: "/hello/:name") func sayHello(@path name: string, @query loud: bool): string` looks roughly like:

```js
async function sayHello(name, loud) {
    const url = `/hello/${encodeURIComponent(name)}?loud=${encodeURIComponent(loud)}`
    const res = await fetch(url, { method: 'GET', credentials: 'include', headers: {} })
    if (!res.ok) return [null, mapStatus(res.status)]
    const data = await res.json()
    return [data.value, data.state]
}
```

Same call shape as a JSON-RPC stub — `[value, state]` tuple, same
state codes — only the transport differs. Switching a wire from
JSON-RPC to HTTP-shape (or back) doesn't change the calling code.

For typed-response wires the stub returns a wrapper object instead of
the bare reified value:

| Return type | Stub yields |
| --- | --- |
| `http.Redirect` | `{location: string, status: number}` — `fetch` runs with `redirect: 'manual'`, so the browser does NOT auto-follow; user code reads `location` and navigates explicitly. |
| `http.Html` | `{body: string, status: number}` — raw HTML text plus the response status. |
| `http.File` | `{data: Blob, filename: string, contentType: string, status: number}` — typical use is `URL.createObjectURL(data)` for inline preview or anchor download. |
| `http.Status<T>` | `{body: T, status: number}` — `body` is reified via the same `__sovaReify` path the JSON-RPC stub uses, so it lands fully typed; `status` is the actual HTTP status the backend wrote. |

Examples:

```js
// Redirect — user-driven navigation
const [{location}, state] = await startLogin()
window.location.href = location

// Html — render into the DOM
const [{body}, state] = await renderPage("about")
document.querySelector("#content").innerHTML = body

// File — trigger a download
const [{data, filename}, state] = await downloadInvoice("INV-001")
const url = URL.createObjectURL(data)
const a = document.createElement("a")
a.href = url
a.download = filename
a.click()

// Status<User> — typed reification, status awareness
const [{body, status}, state] = await createUser("alice", "alice@example.com")
if (status === 201) {
    showFlash("User " + body.name + " created")
}
```

## Migration

Existing `wire func foo(...) { ... }` declarations keep working
verbatim — no `path`/`method` means JSON-RPC, no annotations means
default name-based body binding. The new mechanisms only kick in when
you opt in by declaring `path`/`method` or annotating params.

The existing raw-wire pattern (`wire(transport: "raw")`) stays
supported as the escape hatch for cases where the response really
needs to be byte-level streaming or non-trivial multipart parsing.
HTTP-shape wires are the recommended default for everything that fits
the "typed request → typed response" shape.
