# Deployment

> 2026-05 update — Round 10 removed all backend dependencies. The OSS now builds to a pure static site (`output: 'export'`), deployable to any static host (GitHub Pages, Vercel, Netlify, S3 + CloudFront, …). The canonical host is GitHub Pages. The old Firebase-specific guide was deleted along with the dependency — this line used to link to an archived copy that no longer exists (2026-07-31: the link had been dead, promising a document nobody could open).

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
- builds the static export with `NEXT_PUBLIC_BASE_PATH=/ontology-atlas`, adapts the PWA manifest to the
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

## macOS release — rehearse before protected dispatch

```bash
pnpm desktop:release-rehearsal --list   # what would run, and what cannot run here
pnpm desktop:release-rehearsal          # walk the runner's steps on this machine
# after creating and pushing the tag at main HEAD:
pnpm desktop:release-rehearsal --tag=vX.Y.Z
```

Run the untagged rehearsal before creating every `v*` tag. It walks the
`admit-release` and `build-macos` jobs of
`.github/workflows/release-macos.yml` **in file order** on your machine, so a
step that would stop the runner stops you first — for free.

Why it exists: `v1.0.0-rc.2` was tagged four times and stopped at the build job
four times. Each fix moved the failure exactly one square forward (readiness
gate → bridge tests → sidecar tool → sidecar dependencies). All four passed
locally, because a developer's machine already has everything the runner
lacks — and **no other workflow runs these gates**, so the first time they are
exercised is after a tag exists.

The rehearsal reads the workflow instead of copying its step list, so a new
step is picked up automatically. Steps it cannot run are printed as `SKIP`
**with the reason**, never passed over silently:

| Cannot run locally | Why | Where it is first proved |
| --- | --- | --- |
| Protected dispatch context | GitHub owns the event/ref/workflow SHA context | the `main` workflow_dispatch run |
| Tag version and source admission | needs an existing remote tag; `--tag` rehearses both against current HEAD | the tagged rehearsal, then `admit-release` |
| Signing credentials / `Import Apple Developer ID certificate` | protected environment secrets | the runner |
| `Build signed and notarized release artifact` | `codesign` with a real identity + `notarytool` | the runner |
| `Stage Draft Desktop Release` / `Publish Desktop Release` jobs | a real draft release and the `release` environment gate | the dispatched run |

In place of the signed build the rehearsal runs
`desktop:release-artifact:unsigned` end to end — build, route smoke, app
bundle, ad-hoc signing, updater-archive repack, DMG, checksum, and the
mounted-DMG install smoke. The two paths differ only in signing and
notarization.

If you have no `TAURI_SIGNING_PRIVATE_KEY` in your environment the rehearsal
mints a **throwaway** updater key so the repack step can run. That proves the
archive is rebuilt and signed; it does not prove it was signed with *our* key —
only the protected dispatched run can.

### Tagging rules the rehearsal cannot enforce

- **Tag the current `main` head.** `desktop:release-source` compares the tag's
  commit against the live default-branch head during admission.
- **Dispatch from `main`.** After admission, every job pins the admitted SHA;
  later merges to `main` do not invalidate the release.
- **A rerun needs a clean release slot.** `desktop:release-slot` fails closed if
  a release (including a draft) already exists for the tag, so delete the draft
  from a failed attempt before dispatching again.

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
