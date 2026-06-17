---
title: std/oidc
sidebar_position: 7
---

# std/oidc

OpenID Connect verification layer that sits on top of
[`std/oauth2`](/stdlib/oauth2). `oauth2.exchange` hands back an
`id_token` JWT from a trusted endpoint — but the token itself is
just a string. To trust its claims for authorization decisions
(`sub`, `email_verified`, `hd`, etc.) you must verify the
signature against the provider's JWKS and check `iss` / `aud` /
`exp`. This module does both.

```sova
import "std/oidc"
```

The package is `on backend`. Verification is server-side: the
JWKS endpoint is public but the verifier holds a per-instance
cache that you only want on one side of the wire.

## Quick start: Google ID token

```sova
import "std/env"
import "std/http"
import "std/oauth2"
import "std/oauth2/presets"
import "std/oidc"
import "std/random"

let google = oauth2.client(
    presets.google,
    env.get("GOOGLE_CLIENT_ID"),
    env.get("GOOGLE_SECRET"),
    "https://my.app/login/google/callback",
)

let googleVerifier = oidc.verifier(
    "https://accounts.google.com",
    env.get("GOOGLE_CLIENT_ID"),
)

wire(authn: false, method: "GET", path: "/login/google/callback")
func googleCallback(
    @query code: string,
    @query state: string,
    @cookie oauthState: string,
    @cookie oauthVerifier: string,
): http.Redirect {
    if state != oauthState {
        return http.redirectTo("/login?error=state")
    }
    let token = google.exchange(code, oauthVerifier)
    if token.idToken == "" {
        return http.redirectTo("/login?error=no_id_token")
    }
    let claims = googleVerifier.verify(token.idToken)
    if claims == none {
        return http.redirectTo("/login?error=invalid_id_token")
    }
    let id = claims!
    let user = upsertUser(id.sub, id.email, id.name, id.picture)
    @.authenticate(user.id, {})
    return http.redirectTo("/dashboard")
}
```

Construct one `Verifier` at module scope per (issuer, audience)
pair — the embedded JWKS cache then survives across requests.

## API

### `oidc.verifier(issuer, audience) Verifier`

Binds an OIDC issuer URL to your application's OAuth client ID.
The returned `Verifier` is stateful: it lazily fetches the
provider's OIDC discovery document
(`<issuer>/.well-known/openid-configuration`) and the JWKS, then
holds the JWKS in memory for one hour before refetching.

The `audience` value MUST match the `aud` claim the provider
stamps on every `id_token`. For Google / Microsoft / Auth0 /
Discord-as-OIDC, that's your OAuth client ID. For custom
providers, check what their issuer puts in `aud`.

Hold the returned value at module scope. A per-request
`Verifier` would refetch the JWKS on every login, which defeats
the cache and adds a Google round-trip to every authentication.

### `verifier.verify(idToken) option<IdToken>`

The verification entry point. Returns a fully-populated
`IdToken` on success, or `none` on ANY failure mode:

- malformed JWT (not three dot-separated base64url segments)
- empty input string
- `alg` other than `RS256` in the header (intentional — we don't
  speak `none`, `HS256`, or unsigned tokens; those have been the
  source of every JWT verification CVE ever)
- `kid` in header doesn't match any key in the cached JWKS
- signature doesn't verify
- `iss` claim doesn't match the verifier's `issuer`
- `aud` claim doesn't include the verifier's `audience` (handles
  both the single-string and array forms OIDC permits)
- `exp` claim is in the past
- the JWKS endpoint is unreachable (DNS, TLS, 5xx)

There is no way for the caller to distinguish *why* verification
failed. That's deliberate: every failure mode means "reject this
login", and exposing the reason invites caller code to whitelist
some of them.

### Types

```sova
type IdToken {
    sub: string
    iss: string
    aud: string
    exp: int
    iat: int
    nonce: string
    email: string
    emailVerified: bool
    name: string
    picture: string
    claims: map<string, any>
}

type Verifier {
    issuer: string
    audience: string
}
```

`claims` carries the entire verified payload, including
provider-specific fields the typed members don't surface
(Google's `hd` for hosted-domain assertions, Microsoft's `tid`
for tenant ID, Apple's `is_private_email`, etc.). Index it the
same way you'd navigate any `any`-typed map:

```sova
let hd = claims!.claims["hd"] as string  // Google G Suite domain
```

## How verification works

1. **Parse the JWT.** Split on `.` into three base64url-encoded
   segments. Decode the header.
2. **Reject non-RS256.** Header `alg` must be exactly `RS256`. Any
   other value (including `none`) means immediate rejection.
3. **Look up the key.** Match the header's `kid` against the
   cached JWKS. If no `kid` is provided, fall back to the first
   RSA key in the set.
4. **Verify the signature.** RSA-PKCS1-v1.5 with SHA-256 over
   `header.payload`. Anything other than a clean signature
   verification → reject.
5. **Validate `iss`.** Must match the verifier's configured
   issuer exactly. No prefix matches, no trailing-slash
   normalization beyond what the discovery doc returned.
6. **Validate `aud`.** OIDC permits `aud` to be either a string
   or an array of strings. Either form is accepted, and the
   verifier's configured audience must appear (as the string
   itself, or among the array elements).
7. **Validate `exp`.** Token must not be expired. No clock-skew
   tolerance — providers all issue tokens with comfortable
   `exp` windows (Google: 1 hour) so a few seconds of clock
   drift is irrelevant in practice.

## What's not in this library

- **ES256 / PS256.** Not yet implemented. RS256 covers every
  major OIDC provider — Google, Microsoft, Apple, Auth0, Okta,
  Keycloak, Discord-as-OIDC. Open an issue if you need an
  elliptic-curve flow.
- **Nonce validation.** The `nonce` claim is parsed and exposed
  on `IdToken.nonce`, but the verifier does NOT check it against
  a stored value. If you mint nonces during the authorize step
  and store them in a session, validate the round-trip in your
  callback handler: `if claims!.nonce != storedNonce { reject }`.
- **`iat` / `nbf` validation.** `iat` is exposed; `nbf` is
  ignored. Providers worth talking to don't issue forward-dated
  tokens; if you need strict `nbf` enforcement, check
  `claims!.claims["nbf"]` manually.
- **Custom claim validation** (Google's `hd`, Microsoft's
  `tid`). Read them off `claims!.claims[...]` and enforce in
  your application code.
- **JWKS pinning.** The verifier trusts whatever the JWKS
  endpoint returns. For very high-security deployments where
  even a compromised provider DNS / TLS chain is in the threat
  model, pin a hard-coded `n` / `e` and bypass `Verifier` —
  use `std/jwt` for the low-level primitives.

## Security checklist

- **Verify before trusting any `id_token` claim.** A token
  riding back from `oauth2.exchange` came through a TLS
  channel, but that's transport security, not signature
  authenticity. A malicious provider impersonator, a buggy
  edge proxy, or a stale captured token can all send you a
  plausible-looking JWT that wasn't actually signed by the
  issuer.
- **`oidc.verifier(...)` at module scope, not per-request.**
  The JWKS cache is per-`Verifier`-instance; a new instance
  per request defeats it.
- **Always validate the `aud` claim** — `verifier()` does this
  for you, but if you ever construct an `IdToken` from
  `claims!.claims` directly, you've bypassed that check.
- **Pair with `nonce` for replay defense in browser flows.** A
  raw OIDC code flow is replay-safe because the `code` is
  one-shot, but if you're using the implicit / fragment flow
  (which Sova does not implement by default), nonces are
  mandatory. Mint via `random.hex(16)`, persist in the auth
  cookie, validate in the callback.
- **Treat verification failure as final.** Don't fall back to
  `userInfo()` or any other "well, the signature didn't verify,
  but the access token still works" path. Reject the login.

## Custom (non-preset) providers

Anything that publishes a standard discovery document and
signs `id_token`s with RS256 works:

```sova
let auth0 = oidc.verifier(
    "https://my-tenant.auth0.com",
    env.get("AUTH0_CLIENT_ID"),
)

let okta = oidc.verifier(
    "https://my-tenant.okta.com/oauth2/default",
    env.get("OKTA_CLIENT_ID"),
)

let keycloak = oidc.verifier(
    "https://auth.example.com/realms/my-realm",
    env.get("KEYCLOAK_CLIENT_ID"),
)
```

The verifier discovers `jwks_uri` on first use; no manual
JWKS URL configuration needed.
