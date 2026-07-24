# Deployment

> 2026-05 update — Round 10 removed all backend dependencies. The OSS now builds to a pure static site (`output: 'export'`), deployable to any static host (GitHub Pages, Vercel, Netlify, S3 + CloudFront, …). The canonical host is GitHub Pages; the old Firebase-specific guide is archived in [`docs/archive/DEPLOY-FIREBASE.md`](./archive/DEPLOY-FIREBASE.md) for historical reference only.

## Build

```bash
pnpm install
pnpm build          # static export → out/
```

This produces an `out/` directory with HTML/JS/CSS only. No server runtime.

## Deploy targets

Any static host works. Pick one:

> **Official host (2026-07): GitHub Pages — the sole web host.** The canonical
> live site is `https://wlsdks.github.io/ontology-atlas/`, deployed automatically
> by `.github/workflows/deploy-pages.yml` on every `main` push and on GitHub
> Release publication (subpath build via `NEXT_PUBLIC_BASE_PATH=/ontology-atlas`).
> Firebase Hosting was removed — Pages' 100 GB/month soft limit comfortably
> covers a read-only demo, and keeping a single static host removes a whole
> deploy toolchain and its credentials.

### GitHub Pages (canonical)

`.github/workflows/deploy-pages.yml` is the only web-deploy workflow. It:

- triggers on push to `main`, on `release: published`, and on manual
  `workflow_dispatch`
- builds the static export with `NEXT_PUBLIC_BASE_PATH=/ontology-atlas` and
  `NEXT_PUBLIC_OATLAS_FIRST_RELEASE_PENDING=0`, adapts the PWA manifest to the
  base path, disables Jekyll, and uploads/deploys the Pages artifact
- verifies the deployed download surface with
  `pnpm desktop:verify-hosted -- --base-url="https://wlsdks.github.io/ontology-atlas"`,
  and on a release event also runs
  `pnpm desktop:verify-download -- --tag=<published tag>` so the website deploy
  record includes the public DMG/checksum asset proof

No deploy secrets are required — Pages uses the workflow's `GITHUB_TOKEN` via
OIDC. The macOS tag release workflow (`.github/workflows/release-macos.yml`) is
intentionally app-only and separate: it publishes signed/notarized DMGs and does
not deploy the website.

Public URL after deploy: `https://wlsdks.github.io/ontology-atlas/`.

### Vercel

```bash
vercel --prod
```

Vercel auto-detects Next.js. `output: 'export'` produces a static build.

### Netlify, S3, other static hosts

Upload the contents of `out/` to your static host. The site has no
server-side rendering, no API routes, no environment-variable-driven
behavior — everything required is in the bundle.

## i18n + routing

The build emits both `/en/` and `/ko/` route trees. The root `/` redirects
to the user's preferred locale (default `en`). Configure your host to
serve `out/` with directory-style URLs (e.g. `out/en/topology/index.html`
served at `/en/topology/`). Most hosts handle this out of the box.

## Verification

```bash
pnpm test:run        # unit + component
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Then preview locally:

```bash
npx serve out
# visit http://localhost:3000
```

## What's NOT needed

- No `.env` file
- No Firebase project
- No database
- No auth provider
- No server runtime
- No emulators

If you see references to these in older guides, they're from before
Round 10 (May 2026) when the auth + cloud surface was permanently
removed. See [`docs/archive/`](./archive/) for the legacy cloud-mode setup.

## Future cloud collab

When sponsorship or collaboration features come back, the deployment story
will need a re-design (auth provider + DB + sync server). That's a
separate spec; this doc will be updated when it lands.
