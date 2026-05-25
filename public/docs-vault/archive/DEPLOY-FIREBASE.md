# Firebase Hosting deployment guide

The hosted demo for oh-my-ontology runs on Firebase Hosting (project:
`oh-my-ontology`) and serves a static export. Since Next.js is configured with
`output: 'export'`, there is no server runtime — the free Spark plan is more
than enough.

## One-time setup (already done)

- [x] Firebase project `oh-my-ontology` created
- [x] `.firebaserc` configured with `default: oh-my-ontology`
- [x] `hosting` block in `firebase.json` — `public: out`, cleanUrls,
      trailingSlash, security headers, project/** rewrite

## Deploy commands

```bash
# First time only
npm install -g firebase-tools
firebase login

# Every deploy
pnpm build                          # static export → out/
firebase deploy --only hosting      # deploy only the hosting block in firebase.json
```

The `predeploy` hook runs `pnpm build` automatically, so just running
`firebase deploy --only hosting` will build first and then deploy.

## Deployment URLs

- Default: `https://oh-my-ontology.web.app`
- Alt: `https://oh-my-ontology.firebaseapp.com`
- Want a custom domain? Firebase console → Hosting → Add custom domain

## Post-deploy smoke checks

```bash
# Check that the core routes respond
for path in / /topology/ /docs/ /ontology/edit/ /ontology/insights/ /projects/; do
  curl -s -o /dev/null -w "%{http_code} %{size_download}b $path\n" \
    https://oh-my-ontology.web.app$path
done
```

Expected: all 200, size 50KB+ (healthy HTML).

Browser spot-check:
- `/` LandingPage copy + sign-in link
- `/topology` Sigma node (dogfood 1 project)
- `/ontology/insights` "Total ~130 nodes / 165 relations"
- DevTools Network: 0KB of firebase JS chunk on the user-facing first paint

## Regression guard

Before deploying, make sure `pnpm bundle:check` passes. The promise is to keep
the firebase chunk at 0KB on all 11 local-first routes (the core of PR #99).

## Cost

Firebase Hosting Spark plan = $0. A static export only uses the CDN cache —
free up to GB/day of traffic. Beyond that, switch to the Blaze plan
(pay-as-you-go).

## If you also want Firestore / Auth / Storage

Mission v2 treats cloud mode as optional, but if a user actually relies on
cloud sync:

```bash
firebase deploy --only hosting,firestore,storage
```

`firestore.rules` and `storage.rules` are already in the repo and ship together
with the deploy. Functions are deprecated under mission v2 — the `functions/`
directory no longer exists.
