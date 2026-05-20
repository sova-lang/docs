---
title: Hello, world!
sidebar_position: 2
---

# Hello, world!

This walkthrough creates a tiny project that prints to the console from
the backend and from the frontend. It is intentionally small: we touch
the project scaffold, the `on backend|frontend|shared` annotation, and
the build pipeline, and that is enough to land the mental model the rest
of the documentation builds on.

## Create the project

From a clean directory, run:

```bash
sova new hello-sova
cd hello-sova
```

You should see something like:

```
hello-sova/
├── sova.toml
└── src/
    └── main.sova
```

The contents of `sova.toml`:

```toml
[package]
name = "hello-sova"
version = "0.1.0"

[project]
entry = "src/main.sova"

[serve]
port = 8080
host = "127.0.0.1"
```

And `src/main.sova`:

```sova
package hello on backend

func main() {
    println("hello, sova")
}
```

## Build and run

```bash
sova build
./dist/output
```

You should see:

```
hello, sova
```

The build emits two artefacts:

- `.output/output.go` and `.output/output.js`, the generated source
  files for inspection.
- `dist/output`, the compiled backend binary.

For a backend-only project the JavaScript bundle exists but is empty.

## Add a frontend file

Sova projects can mix sides freely. Add a second file
`src/greet.sova`:

```sova
package hello on frontend

import "std/browser"

func main() {
    let doc = browser.doc()
    doc.body().handle()
    println("hello from the browser")
}
```

A single package can host multiple `main` functions, one per side. The
compiler picks the right one for each artefact.

Rebuild:

```bash
sova build
```

You now have an `.output/output.html` and `.output/output.js` ready to
serve. Open the HTML in a browser (or use `sova dev`, which we cover in
the next page) and the message lands in the console.

## What just happened

Two ideas at work, both small but important:

1. **Sides are explicit.** Every Sova file declares which artefact it
   contributes to with `on backend`, `on frontend`, or `on shared`.
   The compiler refuses to mix incompatible code: a backend file cannot
   import a frontend-only package, for example.
2. **The build is one command.** You do not configure two toolchains.
   Sova takes the same source and produces one Go binary plus one JS
   bundle, with the type system enforcing compatibility across the
   boundary.

Next, in [First wired app](/getting-started/first-wired-app), we let the
frontend call into the backend without writing a single byte of REST
plumbing.
