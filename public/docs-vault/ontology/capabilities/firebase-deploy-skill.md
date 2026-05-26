---
slug: capabilities/firebase-deploy-skill
kind: capability
title: Firebase Deploy Skill (.claude/skills/firebase-deploy)
domain: ai-agent-partner
elements: [.claude/skills/firebase-deploy/SKILL.md]
---

# Firebase Deploy Skill

`.claude/skills/firebase-deploy/SKILL.md` is the agent-runbook for publishing
the static promo/download website to Firebase Hosting. It reads local `.env.prod`
identifiers, runs the docs/type/build/bundle gates plus
`pnpm firebase:deploy-check`, deploys with `firebase deploy --only hosting`,
and verifies the live `web.app` URL.
`.github/workflows/deploy-hosting.yml` is the maintainer CI path for the same
contract: after a public macOS GitHub Release is published, it writes a temporary
`.env.prod` from repository variables, authenticates with
`FIREBASE_SERVICE_ACCOUNT_JSON`, runs the same static deploy preflight, deploys
only Hosting with `firebase-tools@15.17.0`, and runs
`pnpm desktop:verify-hosted` against the live URL.

The skill explicitly keeps Firebase as a static host only. It blocks accidental
drift toward Functions, Firestore, Storage, Auth, or committed credentials.
The hosted surface remains product introduction, download, and read-only demo;
real local vault work is routed to the installed macOS app.

`pnpm test:mcp:docs` now guards that contract by checking `firebase.json`,
`.firebaserc`, `.firebaseignore`, `.gitignore`, the deploy guide, and this skill
doc together.
`pnpm firebase:deploy-check` is the deploy-time preflight for `.env.prod`,
project-id alignment, static-only Hosting config, and `.env.prod` ignore
coverage before the Firebase CLI uploads `out/`.
