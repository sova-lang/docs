---
title: std/oauth2
sidebar_position: 6
---

# std/oauth2

Consumer-side OAuth 2.0 client. Drives the **Authorization Code +
PKCE** flow (RFC 6749 + RFC 7636) against a third-party identity
provider — Discord, Google, GitHub, Microsoft, or any custom IdP
— so users can log into your app via their existing account
without you ever seeing their password.

For the *provider* side (your app issues tokens to other apps),
see `std/oauth2/server` (planned).

```sova
import "std/oauth2"
import "std/oauth2/presets"
```

The package is `on backend` because every interesting step
(token exchange, refresh, userinfo) carries the `clientSecret`.
Frontend code triggers the flow by calling a wired backend
function that returns `http.Redirect` to the authorize URL.

## The 4-step flow

```
                                     ┌──────────┐
                                     │ Browser  │
                                     └────┬─────┘
                                          │ 1. user clicks "log in with X"
                                          │    wire returns http.Redirect to
                                          │    provider's /authorize
                                          ▼
┌─────────────┐                      ┌──────────┐                        ┌──────────┐
│  Your Sova  │                      │ Browser  │                        │ Provider │
│  backend    │ ──────redirect───►   │          │ ─────GET /authorize──► │ (Google, │
│             │                      │          │                        │  Discord)│
│             │                      │          │ ◄────302 to /callback── │          │
│             │                      │          │      ?code=...&state=. │          │
│             │ ◄──GET /callback──── │          │                        │          │
│             │     ?code&state      │          │                        │          │
│             │                      │          │                        │          │
│  2. verify  │                      │          │                        │          │
│     state   │                      │          │                        │          │
│             │                      │          │                        │          │
│  3. exchange│ ──POST /token        │          │                        │          │
│     code    │      ─────────────────────────────────────────────────►  │          │
│             │ ◄─{access_token,...}─────────────────────────────────── │          │
│             │                      │          │                        │          │
│  4. fetch   │ ──GET /userinfo       │          │                        │          │
│     userinfo│      ─────────────────────────────────────────────────►  │          │
│             │ ◄────{id, email}────────────────────────────────────────  │          │
│             │                      │          │                        │          │
│  upsert     │                      │          │                        │          │
│  + session  │ ──Redirect─────────► │          │                        │          │
│             │                      │          │                        │          │
└─────────────┘                      └──────────┘                        └──────────┘
```

Steps 2 + 3 + 4 all live inside the same wired callback handler.

## Quick start: Discord login

```sova
import "std/env"
import "std/http"
import "std/oauth2"
import "std/oauth2/presets"
import "std/random"

let discord = oauth2.client(
    presets.discord,
    env.get("DISCORD_CLIENT_ID"),
    env.get("DISCORD_SECRET"),
    "https://my.app/login/discord/callback",
)

wire(authn: false, method: "GET", path: "/login/discord")
func startLogin(): http.Redirect {
    let state = random.hex(16)
    let verifier = oauth2.newCodeVerifier()
    let opts = http.cookieOptions(true, true, "Lax", "/", 600)
    return http.redirectTo(discord.authorizeURL(state, verifier))
        .setCookie("oauthState", state, opts)
        .setCookie("oauthVerifier", verifier, opts)
}

wire(authn: false, method: "GET", path: "/login/discord/callback")
func discordCallback(
    @query code: string,
    @query state: string,
    @cookie oauthState: string,
    @cookie oauthVerifier: string,
): http.Redirect {
    if state != oauthState {
        return http.redirectTo("/login?error=state_mismatch")
    }
    let token = discord.exchange(code, oauthVerifier)
    if token.accessToken == "" {
        return http.redirectTo("/login?error=token_exchange_failed")
    }
    let info = discord.userInfo(token.accessToken)
    if info == none {
        return http.redirectTo("/login?error=userinfo_failed")
    }
    let user = upsertDiscordUser(info!)
    @.authenticate(user.id, {})
    return http.redirectTo("/dashboard")
        .clearCookie("oauthState")
        .clearCookie("oauthVerifier")
}
```

No `http.Request` / `http.Response` plumbing anywhere — `@query` /
`@cookie` annotations carry the binding intent, `http.Redirect`
carries the response, and `@.authenticate` slots into the same
session pipeline normal wires use.

## API

### `oauth2.client(provider, clientId, clientSecret, redirectURI) Client`

Binds a `Provider` together with your app's credentials. The
returned `Client` carries the secret — keep it strictly backend-
side (the `on backend` package marker enforces this; importing
from frontend code is a compile error).

### `client.authorizeURL(state, codeVerifier) string`

Builds the URL to redirect the user's browser to. `state` is a
CSRF token you persist (in a cookie) and re-check on the
callback — `random.hex(16)` is the conventional choice.
`codeVerifier` is the PKCE secret; generate via
`oauth2.newCodeVerifier()` and persist in the same cookie. Pass
`""` to skip PKCE for legacy providers (not recommended).

### `client.exchange(code, codeVerifier) Token`

Swaps an authorization `code` for a `Token`. Server-to-server
POST that includes your `clientSecret` — never expose to the
frontend. Returns a Token with empty `accessToken` on failure;
check before using.

### `client.refresh(refreshToken) Token`

Exchanges a `refreshToken` for a fresh access token. **The
provider may rotate the refresh token** — Google does, GitHub
doesn't (GitHub doesn't issue them at all by default), Discord
does. Always overwrite your stored copy with `token.refreshToken`
from the response.

### `client.userInfo(accessToken) option<any>`

Fetches the provider's userinfo endpoint with `Authorization:
Bearer <accessToken>`. Returns the raw decoded JSON as `any`
because the shape is provider-specific:

- **Discord**: `{id, username, global_name, email, avatar, …}`
- **Google**: `{sub, email, email_verified, name, given_name, family_name, picture, locale}` (OIDC standard)
- **GitHub**: `{id, login, name, email, avatar_url, …}` (but
  `email` is often null — fetch `/user/emails` separately for
  the verified list)
- **Microsoft**: `{sub, email, name, preferred_username, …}` (OIDC standard)

Navigate via `info! as map<string, any>` then `[key] as string`
for each field.

Returns `none` on transport failure or non-2xx response.

### `oauth2.newCodeVerifier() string`

Generates a fresh PKCE code verifier per RFC 7636: 43
URL-safe-base64 characters drawn from
`crypto/rand`. Persist alongside `state` in the auth cookie.

### `oauth2.codeChallenge(verifier) string`

Derives the `code_challenge` from a `code_verifier` via the
S256 transform (`base64url(SHA-256(verifier))`).
`client.authorizeURL` calls this internally — direct use only
needed when you're building the authorize URL by hand.

## Types

```sova
type Provider {
    authorizationURL: string
    tokenURL: string
    userInfoURL: string
    scopes: []string
    usePKCE: bool = true
}

type Token {
    accessToken: string
    refreshToken: string
    tokenType: string
    expiresIn: int
    scope: string
    idToken: string
    raw: string
}

type Client {
    provider: Provider
    clientId: string
    clientSecret: string
    redirectURI: string
}
```

`Token.raw` carries the unparsed JSON response — useful for
debugging when the provider returns a field we don't surface, or
when you need to forward the original envelope somewhere.

`Token.idToken` is populated only for OIDC providers when you
requested the `openid` scope. The string is a signed JWT;
decode + verify via a JWT library (`std/jwt` covers the
mechanics).

## Presets

`std/oauth2/presets` ships canonical configurations for the four
identity providers Sova apps reach for first:

| Preset | Scopes (default) | Userinfo shape |
| --- | --- | --- |
| `presets.discord` | `identify`, `email` | `{id, username, global_name, email, avatar, ...}` |
| `presets.google` | `openid`, `email`, `profile` | OIDC standard claims |
| `presets.github` | `read:user`, `user:email` | `{id, login, name, email, ...}` (email at separate endpoint) |
| `presets.microsoft` | `openid`, `email`, `profile` | OIDC standard claims |

All four use PKCE. To extend the scopes, copy the preset and
tweak:

```sova
import "std/oauth2"
import "std/oauth2/presets"

let driveProvider = presets.google
driveProvider.scopes = driveProvider.scopes + ["https://www.googleapis.com/auth/drive.readonly"]
let client = oauth2.client(driveProvider, ..., ..., ...)
```

For a custom provider, construct a `Provider` directly with your
own endpoints and scopes.

## Provider quirks

### GitHub

- No refresh tokens by default — access tokens are long-lived.
  `client.refresh(...)` is a no-op.
- Userinfo endpoint returns the profile but emails come from
  `/user/emails` (needs the `user:email` scope). Fetch
  separately when you need the verified email list:
  ```sova
  let emailsResp = fetch.request("GET", "https://api.github.com/user/emails")
      .bearer(token.accessToken)
      .send()
  ```

### Microsoft

The `common` tenant in the preset works for both personal and
work/school accounts. For a single-tenant app, copy the preset
and replace `common` with your tenant ID in the
`authorizationURL` and `tokenURL`.

### Discord

The bot/OAuth split: `presets.discord` is the OAuth flow (user
auth). Bot tokens (server-side daemon-style) use a different
issuance path — not covered by this library.

## Custom providers

Anything that speaks OAuth 2.0 Authorization Code + PKCE works
with a custom `Provider`:

```sova
let okta = new oauth2.Provider()
okta.authorizationURL = "https://my-tenant.okta.com/oauth2/v1/authorize"
okta.tokenURL = "https://my-tenant.okta.com/oauth2/v1/token"
okta.userInfoURL = "https://my-tenant.okta.com/oauth2/v1/userinfo"
okta.scopes = ["openid", "email", "profile", "groups"]
okta.usePKCE = true

let client = oauth2.client(okta, ..., ..., ...)
```

Same client / authorize / exchange / userInfo surface as the
presets.

## Security checklist

- **Always set the `state` cookie** as `httpOnly: true`,
  `secure: true` (in prod), `sameSite: "Lax"`. Same for the
  `verifier` cookie. They're confidentiality-bound: if leaked,
  CSRF defenses break.
- **Always validate `state == cookie_state`** on the callback
  before exchanging the code. Mismatch = drop the request, don't
  proceed.
- **Never embed `clientSecret` in the frontend bundle.** The
  `on backend` package marker prevents accidental imports, but
  if you somehow plumb the secret into a `wire`-returned struct,
  it'll ride the JSON envelope to the client. Don't.
- **Rotate stored refresh tokens** after every `client.refresh`.
  Providers that issue rotating refresh tokens will eventually
  revoke the old one — keeping the new one is mandatory.
- **`Token.idToken` is NOT verified by `exchange`.** It comes
  back from a trusted endpoint (TLS-secured, with your client
  secret), but if you're going to trust its claims for
  authorization decisions (`sub`, `email_verified`, etc.) you
  should still verify the signature against the provider's JWKS.

## What's not in this library yet

- **OpenID Connect verification** — `id_token` claim validation
  against a fetched JWKS. Planned for `std/oidc` (follow-up).
- **Provider-side OAuth** — your app issuing tokens to other
  apps. Planned for `std/oauth2/server`.
- **Device code flow** — the "type this code into your TV" flow.
  Add when a user asks.
- **Apple Sign In** — `client_secret` is a signed JWT rather
  than a static string, which doesn't fit the current `Client`
  shape. Possible follow-up if there's demand.
