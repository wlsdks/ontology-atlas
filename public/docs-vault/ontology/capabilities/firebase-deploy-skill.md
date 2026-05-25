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
identifiers, runs the docs/type/build/bundle gates, deploys with
`firebase deploy --only hosting`, and verifies the live `web.app` URL.

The skill explicitly keeps Firebase as a static host only. It blocks accidental
drift toward Functions, Firestore, Storage, Auth, or committed credentials.
The hosted surface remains product introduction, download, and read-only demo;
real local vault work is routed to the installed macOS app.

`pnpm test:mcp:docs` now guards that contract by checking `firebase.json`,
`.firebaserc`, `.firebaseignore`, `.gitignore`, the deploy guide, and this skill
doc together.
