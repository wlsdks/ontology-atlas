---
name: firebase-deploy
description: Deploy the oh-my-ontology static site to Firebase Hosting from this repo. Use when the user asks to deploy, redeploy, publish the site, update Firebase Hosting, or verify the live web.app URL. The workflow must read `.env.prod`, build the static export, deploy only Hosting, and verify the live URL. Never commit `.env.prod` or introduce Firebase backend services.
---

# /firebase-deploy — static Firebase Hosting deploy

This project deploys as a pure static export. Firebase is only the file host:
no Functions, Firestore, Storage, Auth, emulators, or server runtime.

## Required local file

Read `.env.prod` at the repo root before deploying. It is gitignored and should
contain deployment identifiers only:

```bash
FIREBASE_PROJECT_ID=oh-my-ontology
FIREBASE_HOSTING_URL=https://oh-my-ontology.web.app
FIREBASE_HOSTING_ALT_URL=https://oh-my-ontology.firebaseapp.com
```

Do not print or commit tokens, service account JSON, refresh tokens, or npm
publish credentials. If `.env.prod` is missing, stop and ask the user to create
it or provide the Firebase project id. Use `.env.prod.example` as the non-secret
template.

For the GitHub-hosted deploy path, `.github/workflows/deploy-hosting.yml`
expects these repository settings:

- secret: `FIREBASE_SERVICE_ACCOUNT_JSON`
- variables: `FIREBASE_PROJECT_ID`, `FIREBASE_HOSTING_URL`,
  `FIREBASE_HOSTING_ALT_URL` (defaults match `.env.prod.example`)

The workflow runs on public GitHub Release publication and manual dispatch. It
still writes a temporary `.env.prod`, runs `pnpm firebase:deploy-check`, deploys
only Hosting with `firebase-tools@15.17.0`, and verifies the live download route.

## Workflow

Run commands one by one so failures are attributable.

```bash
test -f .env.prod
set -a; source .env.prod; set +a
test -n "$FIREBASE_PROJECT_ID"
test -n "$FIREBASE_HOSTING_URL"
pnpm test:mcp:docs
pnpm firebase:deploy-check
pnpm exec tsc --noEmit
pnpm build
pnpm bundle:check
firebase use "$FIREBASE_PROJECT_ID"
firebase deploy --only hosting
/usr/bin/curl -I -L --max-time 15 "$FIREBASE_HOSTING_URL/en/"
/usr/bin/curl -I -L --max-time 15 "$FIREBASE_HOSTING_URL/sitemap.xml"
```

`pnpm test:mcp:docs` is part of this deploy path because it fails if
`firebase.json` stops being static Hosting-only or if local deploy credentials
stop being ignored.
`pnpm firebase:deploy-check` is the local deploy preflight: it parses
`.env.prod`, checks that `.firebaserc` points at the same project, confirms
`firebase.json` is still Hosting-only, and refuses to continue if `.env.prod`
could be committed or uploaded.

If `firebase` is not installed, use `npx firebase-tools` for `use` and
`deploy`, but keep the same arguments. If Firebase login is missing, run
`firebase login` interactively only when the user is present; otherwise stop
with the exact auth error.

## Verification

Deployment is complete only when all are true:

- `firebase deploy --only hosting` reports `Deploy complete`.
- The hosting URL returns `HTTP 200` for `/en/`.
- `/sitemap.xml` returns `HTTP 200`.
- `pnpm test:mcp:docs` proves Firebase config is Hosting-only and local deploy
  credentials remain ignored.
- `pnpm firebase:deploy-check` proves `.env.prod`, `.firebaserc`,
  `firebase.json`, `.gitignore`, and `.firebaseignore` agree before deploy.
- `pnpm bundle:check` still reports Firebase SDK chunk `0`.
- In GitHub Actions, `.github/workflows/deploy-hosting.yml` publishes only the
  static `out/` Hosting target and then runs `pnpm desktop:verify-hosted`.

For UI-sensitive landing changes, also run a short Playwright check against
`$FIREBASE_HOSTING_URL/en/` and `$FIREBASE_HOSTING_URL/en/docs/?intent=local`.

## Failure modes

- **Wrong project**: `.firebaserc` and `.env.prod` disagree. Use
  `firebase use "$FIREBASE_PROJECT_ID"` before deploy and surface the mismatch.
- **Backend drift**: if `firebase.json` gains `functions`, `firestore`,
  `storage`, or auth-related config, stop and ask for confirmation. This skill
  is for static Hosting only.
- **Build output missing**: deploy only after `pnpm build` creates `out/`.
- **Pricing concern**: remind the user that static Hosting is usually free at
  small traffic, but Firebase pricing can change and quota should be checked
  against the current Firebase pricing page before making cost promises.

## Reply shape

Keep it short:

1. Build/test commands run.
2. Firebase project id used.
3. Hosting URL.
4. Live URL verification status.
5. Any caveat, especially auth or quota.
