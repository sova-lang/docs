# Sova documentation site

This directory hosts the official Sova language documentation, built
with [Docusaurus](https://docusaurus.io). The site lives under
`docs/` (the content), is configured by
[`docusaurus.config.ts`](./docusaurus.config.ts), and is themed to
match the Sova owl logo's teal-to-purple gradient.

## Local development

```bash
npm install
npm start
```

`npm start` launches the Docusaurus dev server on
<http://localhost:3000>, watches every Markdown file, and reloads the
page on save.

## Build

```bash
npm run build
```

Emits the static site under `build/`. Deploy that directory to any
static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages).

## Structure

```
docs/
├── intro.md                  # Landing copy that the sidebar opens with
├── getting-started/          # Installation, hello world, first wired app
├── language/                 # Sides, types, options, enums, casts, generics, concurrency, packages
├── wiring/                   # Wiring overview, sessions, authn/authz, wired state
├── frontend/                 # Composable views, reactivity
├── advanced/                 # Interop, testing, deployment
└── reference/                # LSP, CLI

src/
├── components/HomepageFeatures/   # Landing feature grid
├── pages/index.tsx                # Landing page
└── css/custom.css                 # Theme overrides (teal-purple palette)

static/img/
├── logo.png                       # Used in navbar, footer, hero, social cards
└── favicon.png
```

## Editing tips

Markdown front matter controls a page's slot in the sidebar:

```yaml
---
title: My new page
sidebar_position: 4
---
```

`sidebar_position` decides the order inside the parent category;
`title` is what shows up in the sidebar and the browser tab.

Code blocks default to syntax highlighting via Prism. The Sova
language does not have a Prism grammar yet; the closest fit visually
is `ts` (TypeScript), which we use throughout for now. Switch to a
custom grammar once one ships.

## Deployment

The repository is set up to be deployed by the standard Docusaurus
`deploy` flow (`npm run deploy`) to GitHub Pages. Adapt the
`organizationName`, `projectName`, and `deploymentBranch` fields in
`docusaurus.config.ts` if you publish elsewhere.
