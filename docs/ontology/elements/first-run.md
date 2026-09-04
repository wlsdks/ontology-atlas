---
uid: d2b30e04-1fb4-4630-a8d8-f4a289594a3a
slug: elements/first-run
kind: element
title: First Run
display_ko: 첫 실행 화면
domain: domains/onboarding-and-shell
path: src/views/first-run
created_by: "agent:unknown"
---

Installed-app first run screen. It offers only local create/open paths and reveals the workbench after a real vault exists; bundled sample exploration remains on the web. Evidence of implementation for capabilities/first-run-starter.

## Evidence

- Primary implementation: `src/views/first-run/ui/FirstRunPage.tsx#FirstRunPage`
- Focused test: `src/views/first-run/ui/FirstRunPage.test.tsx#renders only local-vault actions and the trust line, with no demo or download CTA`
