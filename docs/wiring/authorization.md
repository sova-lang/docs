---
title: Authentication & authorization
sidebar_position: 3
---

# Authentication and authorization

Sova has built-in primitives for both halves of the access-control
question. Authentication ("is the caller signed in?") and authorization
("does this caller have the right roles?") are wire options, not
runtime patterns you re-implement per endpoint.

## Authentication

By default every wire requires authentication. The handler resolves
the session cookie before dispatching; if no session exists or the
cookie's signature is invalid, the wire returns
`WireState.Unauthorized` (HTTP 401) and never enters your function
body.

To opt out — for public endpoints, health checks, login routes — set
`authn: false`:

```sova
wire(authn: false) func health(): string {
    return "ok"
}

wire(authn: false) func logIn(email: string, password: string): User {
    let u = verify(email, password)
    @.authenticate(userId: u.id, roles: ["user"])
    return u
}
```

The login wire is unauthenticated for the obvious reason: by the time
the caller can log in, there is no session yet. Once `@.authenticate`
runs, future wires inherit authentication automatically.

## Authorization

Wires can require specific roles:

```sova
wire(authz: ["admin"]) func banUser(userId: string): User { ... }
wire(authz: ["admin", "moderator"]) func deletePost(id: string) { ... }
```

The handler checks `session.hasRole(role)` for each listed role. The
default semantics is *any-of*: the call succeeds if the session has
at least one of the listed roles. To require *all* of them, use the
explicit form:

```sova
wire(authz: { all: ["billing", "admin"] }) func issueRefund(...) { ... }
wire(authz: { any: ["editor", "admin"] }) func editArticle(...) { ... }
```

If the check fails, the wire returns `WireState.Forbidden` (HTTP 403)
without touching the function body.

## Wire groups

Group several wires that share the same options:

```sova
wire(authn: true, authz: ["admin"]) {
    func banUser(id: string): User { ... }
    func deletePost(id: string) { ... }
    func resetPassword(id: string): User { ... }
}
```

Individual declarations inside a group can override single options:

```sova
wire(authn: true, authz: ["admin"]) {
    func banUser(id: string): User { ... }
    wire(authz: ["moderator"]) func warnUser(id: string) { ... }
}
```

`warnUser` keeps the group's `authn: true` but loosens `authz` to
`moderator`.

## Wire rulesets

For projects with many endpoints sharing the same policy, declare a
reusable ruleset:

```sova
wire ruleset adminOnly(authn: true, authz: ["admin"])
wire ruleset publicGet(authn: false, method: "GET")

wire:adminOnly func banUser(id: string): User { ... }
wire:publicGet func featureFlags(): map<string, bool> { ... }
```

A ruleset is just a named bag of options. Use them when a project has
a small number of recurring policy combinations.

## What the caller sees

The frontend stubs translate HTTP status codes back into the
`WireState` enum:

```sova
let user, state = banUser(id)
when state {
    WireState.Ok           => println("banned")
    WireState.Unauthorized => println("please log in")
    WireState.Forbidden    => println("permission denied")
    WireState.NotFound     => println("user not found")
    WireState.Error        => println("something blew up")
}
```

Authentication failures and authorization failures both produce a
single typed tuple element; the frontend never has to inspect raw HTTP
status codes.

## Custom claims and roles after login

`@.authenticate(...)` accepts arbitrary claims:

```sova
@.authenticate(
    userId: u.id,
    roles: ["user", u.plan],   // dynamic role from the user record
    claims: {"orgId": u.orgId},
)
```

Use roles for static policies (the kind `authz: ["admin"]` matches);
use claims for free-form attributes you want to access through
`@.claims["orgId"]` in handlers.
