---
title: Sessions
sidebar_position: 2
---

# Sessions

Sova treats user sessions as a language feature, not a library. Every
backend wire function has access to the current request's session via
the implicit `@` symbol; the session is signed, stored in an HMAC
cookie by default, and carries the roles and metadata you set on it.

## The `@` symbol

Inside a wired backend function, `@` is the session for this request:

```sova
wire func me(): User {
    return userById(@.id)
}

wire func logIn(email: string, password: string): User {
    let u = authenticate(email, password)
    @.authenticate(userId: u.id, roles: ["user"])
    return u
}
```

`@` resolves to a `sessions.Session` value. The implicit member
methods are described below.

`@` is only valid inside a wired backend function body. Outside that
context the compiler raises an error: there is no session to talk
about.

## Session fields and methods

A session offers:

| Member | Type | Purpose |
| --- | --- | --- |
| `@.id` | `string` | The session's unique identifier (UUID). |
| `@.user` | `any` | The authenticated user payload (whatever you stored). |
| `@.roles` | `[]string` | The roles attached to the session. |
| `@.claims` | `map<string, any>` | Free-form claims. |
| `@.rooms` | `[]string` | Pub/sub rooms the session belongs to. |
| `@.connectedAt` | `int` | Unix seconds when the session was bound. |
| `@.isAuthenticated()` | `bool` | True after a successful `authenticate(...)`. |
| `@.authenticate(...)` | `void` | Sets the user payload, roles, and claims. |
| `@.logout()` | `void` | Clears the session and removes the cookie. |
| `@.addRoles(roles: []string)` | `void` | Append roles. |
| `@.hasRole(role: string)` | `bool` | Check a single role. |
| `@.join(room: string)` | `void` | Add the session to a pub/sub room. |
| `@.leave(room: string)` | `void` | Remove from a room. |

### Authenticating

```sova
wire(authn: false) func logIn(email: string, password: string): User {
    let u = verify(email, password)
    @.authenticate(
        userId: u.id,
        roles: ["user"],
        claims: {"plan": u.plan},
    )
    return u
}
```

After `authenticate`, the session cookie is signed with the
`session_secret` declared in `sova.toml` and returned to the client.
Every subsequent request carries it; the backend extracts it and
populates `@` automatically.

### Logging out

```sova
wire func logOut() {
    @.logout()
}
```

The handler clears the cookie and the in-memory session record.

## Configuring the cookie

Set the cookie secret in `sova.toml`:

```toml
[wire]
session_secret = "rotate-me-for-production"
```

In production, supply the secret through the `WIRE_SESSION_SECRET`
environment variable instead of committing it. The compiler falls back
to the manifest value at startup.

## Front-end-initiated wires (push)

A wire declared on the frontend is one the *backend* invokes on a
specific client session. Use it for push notifications, real-time
updates, and similar fan-out scenarios:

```sova
package myapp/frontend on frontend

wire func notify(message: string) {
    showToast(message)
}
```

From the backend, address it on a session:

```sova
import "myapp/frontend"

wire func sendBroadcast(message: string) {
    sessions.broadcast().notify(message)
    // or, single target:
    // mySession.notify(message)
}
```

Frontend-hosted wires require a websocket transport — set
`transport: "ws"` on the frontend wire to opt in. Authenticated
sessions persist their websocket and stay reachable as long as they
hold a valid cookie.

## When not to use `@`

`@` is only available inside wired backend functions. If you need
session-like state outside that context (e.g. background jobs, or
shared logic in a non-wired helper), pass the relevant fields
explicitly. This keeps the session boundary observable in the
signature and keeps shared helpers easier to test.
