---
title: Deployment
sidebar_position: 4
---

# Deployment

Sova compiles to a single backend binary that serves its own frontend
bundle. This deliberate choice keeps deployment simple: ship one
executable, point it at a port, and it serves both the static assets
and the wire endpoints from the same origin. No reverse proxy is
required, and the same-origin policy means session cookies just work.

## What the build produces

`sova build --prod` emits:

```
dist/
├── output            # the backend binary
├── output.html       # the frontend entry HTML
└── assets/           # generated JS, CSS, sourcemaps
```

In `dev` mode the layout is similar but unminified; the binary serves
the frontend with hot-reload hooks attached.

## Embedding the frontend

In production builds, the backend binary embeds the frontend bundle
through Go's `embed` package. The result is a single executable that
contains everything it needs to run. To verify:

```bash
sova build --prod
./dist/output
# In another terminal:
curl http://localhost:8080/
```

You should get back the rendered HTML, served from inside the binary.

## Environment variables

A few environment variables tune the runtime:

| Variable | Purpose |
| --- | --- |
| `WIRE_HOST` | Host to bind to. Overrides `[wire].host` in `sova.toml`. |
| `WIRE_PORT` | Port to bind to. Overrides `[wire].port`. |
| `WIRE_SESSION_SECRET` | Cookie HMAC secret. Overrides the manifest entry. |
| `WIRE_BACKEND` | (frontend) Base URL the JS bundle should talk to. Defaults to same-origin. Only relevant for test-mode and reverse-proxy scenarios. |

In production set `WIRE_SESSION_SECRET` from your secret manager
rather than committing the manifest value.

## `sova dev`

The dev server (`sova dev`) is built for the iteration loop:

```bash
sova dev
```

It watches every Sova source file, recompiles on change, restarts the
backend binary, and reloads connected browser pages over a websocket.
A typical session looks like:

```
[sova dev] watching src/**/*.sova
[sova dev] backend running on http://127.0.0.1:8080
[sova dev] reload triggered: src/frontend.sova
[sova dev] backend restarted in 240ms
```

`sova dev` is intended for local development only — it skips
optimisations and embeds extra diagnostics. Use `sova build --prod`
for anything that ships.

## Container deployments

The backend binary is fully static when you set `CGO_ENABLED=0` for
`go build`. A typical Dockerfile:

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.22 as build
WORKDIR /app
COPY . .
RUN go install github.com/sova-lang/sova@latest
RUN sova install
RUN sova build --prod

FROM gcr.io/distroless/static
COPY --from=build /app/dist/output /sova-app
ENV WIRE_HOST=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["/sova-app"]
```

A distroless static image is the typical target; the binary needs no
shared libraries and is happy in a scratch or distroless base.

## Reverse proxies

Same-origin is the easiest deployment, but a reverse proxy is fine
too. Three knobs to remember:

- The frontend bundle defaults to same-origin requests. Behind a
  proxy on a different host, set `WIRE_BACKEND` at build time (it is
  inlined into the bundle) or expose it through a JS-readable global
  the bundle consults.
- The session cookie is `SameSite=Lax` by default. Cross-origin
  deployments need `SameSite=None; Secure` — set
  `WIRE_SESSION_COOKIE_SAMESITE=none` to opt in.
- The proxy must forward the cookie header verbatim. Most defaults
  do; if you see authentication failures only behind the proxy,
  this is the first thing to check.

## Health checks

A common health-check pattern:

```sova
wire(authn: false) func health(): string {
    return "ok"
}
```

That's the entire endpoint. Hook your orchestrator at
`/api/<package>/health` (or whatever path Sova picks for the
function); a 200 OK with `{"value": "ok", "state": 0}` means the
binary is up and the wire surface is responding.

## Logging

The generated backend uses Go's standard `log` package for the
plumbing logs. Application logs go through the Sova-side `println`
(which lowers to `fmt.Println`) and any extern bindings you have
written. For structured logging in production, bind to your favourite
Go logger through `extern`.
