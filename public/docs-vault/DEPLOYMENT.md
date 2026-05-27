# Deployment

> 2026-05 update — Round 10 removed all backend dependencies. The OSS now builds to a pure static site (`output: 'export'`), deployable to any static host (Firebase Hosting, Vercel, Netlify, GitHub Pages, S3 + CloudFront, …). The detailed Firebase-specific guide is archived in [`docs/archive/DEPLOY-FIREBASE.md`](./archive/DEPLOY-FIREBASE.md) for reference.

## Build

```bash
pnpm install
pnpm build          # static export → out/
```

This produces an `out/` directory with HTML/JS/CSS only. No server runtime.

## Deploy targets

Any static host works. Pick one:

### Firebase Hosting

```bash
pnpm build
npm install -g firebase-tools  # or use npx
firebase login
firebase projects:create oh-my-ontology
firebase use oh-my-ontology
firebase deploy --only hosting
```

This repo already includes `firebase.json`, `.firebaserc`, and
`.firebaseignore` for static Hosting. `firebase.json` points to `out/` and
does not configure rewrites, Functions, Firestore, Storage, or auth.
Maintainer deploys should copy `.env.prod.example` to the gitignored
`.env.prod` first so the Firebase project id and live verification URLs are
explicit before production Hosting is updated.
Run `pnpm firebase:deploy-check` before `firebase deploy --only hosting`; it
fails if `.env.prod` is missing, `.firebaserc` points at another project,
Firebase config drifts away from static Hosting, or `.env.prod` could be
committed/uploaded.

The macOS tag release workflow (`.github/workflows/release-macos.yml`) is
intentionally app-only: it publishes signed/notarized DMGs without Firebase
secrets or Hosting deploy steps. `.github/workflows/deploy-hosting.yml` owns the
separate website path for manual dispatch or human-created Release events. That
workflow writes `.env.prod` from GitHub repository variables, authenticates with
the `FIREBASE_SERVICE_ACCOUNT_JSON` secret, sets
`NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING=0`, runs the same static deploy gates,
deploys only Firebase Hosting with `firebase-tools@15.17.0`, then runs
`pnpm desktop:verify-hosted` against the configured public URL. When the deploy
was triggered by a published GitHub Release, or a manual dispatch supplies
`release_tag`, it also runs `pnpm desktop:verify-download` for that tag so the
website deploy record includes the public DMG/checksum asset proof.

Expected public URLs after deploy:

- `https://oh-my-ontology.web.app`
- `https://oh-my-ontology.firebaseapp.com`

If the URL returns Firebase's "Site Not Found" page, the project/Hosting site
does not exist yet, the local `.firebaserc` points at the wrong project, or the
site has not been deployed after the project was created.

### Vercel

```bash
vercel --prod
```

Vercel auto-detects Next.js. `output: 'export'` produces a static build.

### GitHub Pages, Netlify, S3, …

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
pnpm firebase:deploy-check
pnpm bundle:check    # local-first chunk leak guard
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
