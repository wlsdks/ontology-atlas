# Deployment Guide

> Static deployment guide based on Firebase Hosting. **Live**: https://oh-my-ontology.web.app
>
> This document is a single-place checklist of every step you need when deploying to Firebase. It covers everything from first-time setup to daily deploys, rollbacks, and custom domains. For the lightweight quickstart, see [`DEPLOY-FIREBASE.md`](./DEPLOY-FIREBASE.md).

## Table of contents

1. [Initial setup (one-time)](#1-initial-setup-one-time)
2. [Daily deploy flow](#2-daily-deploy-flow)
3. [Partial deploys (hosting only / rules only)](#3-partial-deploys-hosting-only--rules-only)
4. [Environment variables](#4-environment-variables)
5. [Firebase project configuration](#5-firebase-project-configuration)
6. [Custom domain hookup](#6-custom-domain-hookup)
7. [Rollback and version management](#7-rollback-and-version-management)
8. [Pre-deploy checklist](#8-pre-deploy-checklist)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Initial setup (one-time)

```bash
# 1. Install the Firebase CLI (global)
pnpm add -g firebase-tools

# 2. Sign in with your Google account
firebase login

# 3. Connect to the project (this repo already records it in .firebaserc)
firebase use oh-my-ontology

# 4. Verify access
firebase projects:list
```

**Create the `.env.local` file** — copy `.env.example` and fill in the real values:

```bash
cp .env.example .env.local
# Open it in your editor and paste the values from Firebase Console → Project settings → General → Your apps
```

**Allow Google sign-in domains** — Firebase Console → Authentication → Settings → Authorized domains:
- `localhost` (development)
- `oh-my-ontology.web.app` (default)
- `oh-my-ontology.firebaseapp.com` (alternate domain)
- Custom domain (if any)

**Register the admin allowlist** — Firebase Console → Firestore → `admins` collection:
- Document ID: the email (e.g. `you@example.com`)
- The document body can be empty (only existence is checked)

---

## 2. Daily deploy flow

```bash
# 1. Pull the latest main
git checkout main
git pull

# 2. Verify
pnpm tsc --noEmit           # type check
pnpm lint                   # ESLint + FSD boundary checks
pnpm test:run               # unit tests
pnpm build                  # static build → out/

# 3. Deploy
pnpm firebase deploy        # hosting + firestore.rules + storage.rules — everything
```

When the deploy finishes, the Firebase CLI prints the hosting URL. Open it right away and verify.

> **Tip**: If you run `firebase` often, install it globally (`pnpm add -g firebase-tools`) for convenience. Without the global install, fall back to `pnpm firebase ...` to run the local devDep.

---

## 3. Partial deploys

When you don't need to ship everything:

```bash
# Hosting only (when only static files changed)
pnpm firebase deploy --only hosting

# Firestore rules only (when security rules were edited)
pnpm firebase deploy --only firestore:rules

# Storage rules only (when screenshot upload rules were edited)
pnpm firebase deploy --only storage

# Both hosting and storage rules
pnpm firebase deploy --only hosting,storage
```

If only the rules changed, you can deploy directly without a build (hosting is not the target).

---

## 4. Environment variables

Every entry below must be filled in `.env.local`:

| Key | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `xxx.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `oh-my-ontology` |
| `OMOT_BUILD_PROJECT_SOURCE` | Optional. Leave empty by default. When set to `firestore`, the static build reads the project list from the Firestore REST API. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `xxx.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | numeric |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:xxx:web:xxx` |

> The Firebase Web `apiKey` is a public value. Committing it to Git is not a security risk (real security is enforced by Firestore Security Rules + the admins allowlist). Even so, `.env.local` is in `.gitignore` and stays local-only.

**Injected at build time** — only values prefixed with `NEXT_PUBLIC_` are bundled into the client. After editing `.env.local`, you must rerun `pnpm build` for the new values to take effect.

---

## 5. Firebase project configuration

- **Project ID**: `oh-my-ontology`
- **Firestore region**: `asia-northeast3` (Seoul)
- **Storage region**: `US-EAST1` (free tier)
- **Auth provider**: Google (`admins/{email}` allowlist)
- **Hosting**: static files in `out/` (Next.js `output: 'export'`)

### Firestore collections

| Collection | Write permission |
|---|---|
| `projects` | admins allowlist |
| `categories` | admins allowlist |
| `statuses` | admins allowlist |
| `admins` | **all writes blocked** — managed manually in the Firebase Console |

For the security rules definitions, see [`firestore.rules`](../firestore.rules) and [`storage.rules`](../storage.rules).

---

## 6. Custom domain hookup

### Prerequisites

- **Domain ownership** — you must have purchased the domain from a registrar (Gabia / Cloudflare / Namecheap, etc.) and be able to manage its DNS. Firebase does not sell domains.
- Firebase Hosting itself and the SSL certificate are free.

### Hookup steps

1. **Firebase Console → Hosting → Add custom domain**
2. Enter the desired domain (e.g. `map.demo.io` or `demo.io`)
3. Firebase provides a `TXT` record for ownership verification → add it to the DNS at your registrar
4. Once Firebase finishes verification, it provides the final DNS records:
   - **Subdomain** (`map.demo.io`): a single `CNAME` record is enough
     ```
     Type   Name   Value
     CNAME  map    
     ```
   - **apex domain** (`demo.io`): two `A` records (IPv4)
     ```
     Type   Name   Value
     A      @      151.101.x.x
     A      @      151.101.y.y
     ```
     (replace with the actual IPs Firebase gives you)
5. Wait for DNS propagation (10 minutes to 24 hours) → Firebase automatically issues a Let's Encrypt SSL certificate
6. Once it's done, you can reach the site at `https://map.demo.io`

### What you must do after hookup

- Add the new domain under Firebase Console → **Authentication → Settings → Authorized domains** (otherwise the Google sign-in popup will throw an error)
- Update the `SITE_URL` metadata in `src/app/layout.tsx` (for SEO and OpenGraph)
- Keep `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` in `.env.local` set to `xxx.firebaseapp.com` — switching it to the custom domain breaks the OAuth redirect

### apex domain support

A subdomain like `map.demo.io` is straightforward via CNAME. An apex like `demo.io` requires the registrar to support **ALIAS / ANAME** records to work cleanly. Cloudflare handles this automatically via "CNAME flattening". Gabia only supports `A` records, so you have to use the static IPs Firebase gives you.

---

## 7. Rollback and version management

Firebase Hosting automatically retains deploy history.

```bash
# List previous releases
pnpm firebase hosting:releases:list

# Roll back to a specific version (also possible with one click in the Console)
pnpm firebase hosting:rollback
```

Firebase Console → Hosting → Releases tab shows the timeline, size, and author, and supports one-click rollback. **The fastest recovery path when a deploy goes wrong**.

Firestore and Storage rules are not subject to rollback — check out the previous version from Git and redeploy.

---

## 8. Pre-deploy checklist

- [ ] Is `git status` clean? Any uncommitted changes?
- [ ] `pnpm tsc --noEmit` → 0 errors
- [ ] `pnpm lint` → 0 errors (including FSD boundaries)
- [ ] `pnpm test:run` → all passing
- [ ] `pnpm build` → succeeded and `out/` produced
- [ ] Did you run `pnpm dev` locally at least once? (especially for UI changes)
- [ ] If `firestore.rules` changed, did you test it against the Firestore Emulator?
- [ ] If you touched admin features, did you test with a real admin account?
- [ ] Did you update CHANGELOG.md and the related docs?

---

## 9. Troubleshooting

**Q. After deploying, the screen is blank or "No projects registered yet" persists for more than 3 seconds**
- The initial Firestore connection can be slow. If it persists after a refresh, check the env vars.
- In Dev Console → Network tab, check whether Firestore requests fail with 401/403.
- Confirm that `.env.local` was loaded at `pnpm build` time (only `NEXT_PUBLIC_*` is bundled).

**Q. The Google sign-in popup doesn't appear (production)**
- Make sure the current domain is included under Firebase Console → Authentication → Settings → **Authorized domains**.
- Firebase auto-adds the default domain, but custom domains must be registered manually.
- Test with the popup blocker turned off.

**Q. Google sign-in works, but admin access is denied**
- Check whether the email document exists in Firestore → `admins` collection. The document ID must equal the email.
- Verify the Firestore region — it should be `asia-northeast3`.

**Q. Static build fails (`pnpm build`)**
- In `output: 'export'` mode, server components that use server-only APIs will fail.
- `shared/api/firebase.ts` uses a lazy getter pattern, so it is not initialized at build time (intended behavior).
- The default `pnpm build` uses seed/demo data in `entities/project/api/build-time-fetch.ts` and does not depend on the network.
- If a production build needs Firestore as the source for static pages, set `OMOT_BUILD_PROJECT_SOURCE=firestore` explicitly. In that case, verify Firestore public read permissions and that `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is correct.

**Q. `firebase deploy` returns "HTTP Error: 403"**
- Re-authenticate with `firebase login --reauth`.
- Check whether `oh-my-ontology` shows up in `firebase projects:list` — if not, you don't have access.
- Ask the project owner for IAM permissions (Firebase Admin or Hosting Admin or higher).

**Q. `firebase deploy --only hosting` says "No HTTP hosts found for site"**
- Verify `firebase.json` → `hosting.public` is `out`.
- Verify you ran `pnpm build` first (the `out/` directory must exist).

**Q. Storage upload returns 403 (screenshot upload fails)**
- Check [`storage.rules`](../storage.rules) — the admin allowlist check function references the Firestore `admins` collection.
- Check the login session. Sign out and sign in again.

**Q. Firestore rules changes don't take effect**
- Verify you redeployed only the rules with `pnpm firebase deploy --only firestore:rules`.
- Check Console → Firestore → Rules tab for the latest version timestamp.
- Make sure the rules you tested in the emulator are in sync with the actual file.

**Q. Caching is too aggressive — new deploys are not reflected**
- The Cache-Control in `firebase.json` sets `1 year immutable` for JS / CSS / fonts — this is intentional because filenames are content-hashed.
- HTML defaults to `no-cache` and is reflected immediately. If not, do a browser hard refresh (⌘+Shift+R).
- If you replaced static fonts/images while keeping the same filename, you must change the filename to invalidate the cache.

---

## Change log

- 2026-04-13: Added custom domain, rollback, checklist, partial deploys, and expanded troubleshooting
- 2026-04-12: Initial draft (Phase 0)
