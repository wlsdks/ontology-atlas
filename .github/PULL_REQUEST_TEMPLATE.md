<!--
PR template — please fill out the two sections below.
Korean or English both fine.
-->

## Summary

<!-- 2~5 lines: what changes, why now. The diff explains the *what*; this section answers *why*. -->

-

## Test plan

<!-- How you verified. Paste relevant command output. Tick all that apply. -->

- [ ] `pnpm exec tsc --noEmit` — 0 errors
- [ ] `pnpm test:run` — all pass
- [ ] `pnpm lint` — 0 errors (warnings OK to retain, not to add new)
- [ ] `pnpm build` — static export succeeds
- [ ] `pnpm bundle:check` — local-first routes still 0 KB firebase
- [ ] If macOS desktop release, app-brand, release asset, or Tauri packaging changed: `pnpm desktop:check`
- [ ] If hosted-vs-installed runtime routing changed: `pnpm test:desktop:runtime`
- [ ] If Tauri native vault bridge changed: `pnpm test:desktop:bridge`
- [ ] If macOS release scripts/workflows changed: `pnpm test:desktop:check`
- [ ] If Firebase Hosting config/deploy workflow changed: `node --test scripts/check-firebase-hosting-deploy-env.test.mjs`
- [ ] If `scripts/validate-vault.mjs`, vault validation docs, or release/local validation gates changed: `pnpm test:vault:validate`
- [ ] If `scripts/audit-vault-paths.mjs`, dogfood path audit docs, or release/local audit gates changed: `pnpm test:vault:audit`
- [ ] If `docs/`, `public/docs-vault/`, or static dogfood manifest behavior changed: `pnpm docs-vault:check`
- [ ] If `mcp/`, `cli/`, package manifests, or release scripts changed: `pnpm package:check`
- [ ] If MCP tools / dogfood ontology changed: `pnpm dogfood:walk`
- [ ] Browser smoke test on changed surfaces (paste console errors here, ideally 0)
- [ ] If design changed: light + dark mode screenshots attached

## Mission v2 alignment

<!--
Mission v2 = "vault frontmatter is the graph; humans + AI agents author the same vault; local-first".
If your change interacts with this (new entity, new route, cloud-mode flow), please confirm or call out.
-->

- [ ] Doesn't quietly re-introduce LLM extraction / review queue / TBox-as-DB / cloud-only flows
- [ ] Root package stays Firebase SDK/Admin/CLI-free; Firebase is Hosting-only and separate from macOS app release
- [ ] Ontology Atlas remains the user-facing app/web brand; `ontology-atlas` remains repo/CLI/MCP/release asset identity

🤖 Powered by Claude Code, Cursor, or your favorite AI coding agent welcome.
