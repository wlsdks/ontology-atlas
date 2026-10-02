---
title: Planet Traveler Mascot
doc_type: spec
status: draft
area: product
date: 2026-10-02
decisions: [5b4ca3c7-ae8f-4ac8-a729-3c9b721ab982]
---

# Planet Traveler Mascot

## Person and moment

Observed: on 2026-10-02 the owner supplied `/Users/jinan/Downloads/atlas-character-pack`, selected its character for every Atlas mascot, explicitly named README, `/ko/download/`, and occasional in-app appearances, and requested smooth pixel animation. The pack's `README.txt` selects `02_main_character.png` as identity authority and sheets 04/06/07/08 as motion references. Direct inspection of the main image shows a cream hood, dark face, cyan eyes, blue scarf and boots, and a floating ringed planet.

The primary person is a developer moving from repository discovery to download and an installed workbench. The bounded `orient` outcome is recognizing the same Atlas identity at those entry points and in the optional companion. This is a continuity hypothesis grounded in the owner's selection, not evidence of improved ontology understanding or acceptance. Learners and people using Atlas without agents see the same identity.

The PO brief records `observed`, `positioning`, and a one-way review route with `moment,evidence` lenses. Truth, transfer, agent-write, and human-correction boundaries are unchanged. Product priorities remain those in `docs/PRODUCT-DIRECTION.md:17`: this artwork does not establish task-context quality, Meaning Diff delivery, or next-task reuse.

## Today

Baseline before implementation at `36087b57a`; source references in this section describe that baseline.

- README loads light/dark raster lockups (`README.md:5`). Shared brand rendering selects authored 64/32/16px assets and pixelated sampling (`src/shared/ui/brand-mark.tsx:10`). Gateway chrome uses its compact form (`src/widgets/gateway-chrome/ui/GatewayNav.tsx:64`).
- The current documented character is an ivory-faced dark suit with chartreuse details (`docs/design/brand.md:38`). The 2026-08-28 decision requires one raster-first identity and small-size proof (`docs/DECISIONS.md:1769`). The owner's new selection supersedes that character and palette, while retaining raster clarity and truthful work-state boundaries.
- The optional companion uses fox atlases and eight named poses (`src/features/agent-activity/ui/CompanionSprite.tsx:6` and `:28`). Its active animation already depends on visibility, reduced motion, and blocked state (`src/features/agent-activity/ui/CompanionWorld.tsx:92`). The companion ontology likewise describes a fox (`docs/ontology/capabilities/companion-memories.md:14`); this description must follow the actual identity change through the ontology write contract.
- Work presence is a finite verified-read sequence with terminal completion, without inferred idle work (`src/features/agent-activity/ui/AgentMascotPresence.tsx:24`). The 2026-09-22 companion-home decision preserves truthful poses and static reduced-motion equivalents (`docs/records/decisions/2026-09-22-companion-personal-memory-home-5b3db4ad-cbd5-4fb1-b635-6c1b9e493cec.md:11`).
- Hosted deployment, current installed bundle, and frame-level appearance were not inspected by this planner. They require the lead's live evidence; source observations above are not deployed-state claims.

## Problem and alternatives

Ranked value against cost:

1. One recognizable character across README, download, OS icons, and the workbench restores owner-selected identity continuity. Cost is a complete asset-consumer inventory and native-size adaptations; partial replacement would leave the original problem.
2. Smooth optional-companion and work-sequence poses preserve the identity while moving. Cost is authored frames, registration, and runtime footage; frozen or generic replacements would contradict the explicit motion request.
3. Additional emotions and decorative scenes have lower immediate value and add visual and delivery cost; existing required states take priority.

Keep existing robot and fox: lowest cost and no behavior risk, but fails the explicit choice and keeps two identities. Replace only the header: low cost and immediately visible, but fails continuity with the app and companion. Selected: adapt the supplied traveler into one family of production pixel assets and replace every existing mascot consumer in one bounded release. It has the highest asset-production cost but preserves local-first operation without new services or authority.

Existing users lose the robot/fox appearance, not their companion progress, controls, journals, or work receipts. Smoothness comes from coherent pose transitions and stable foot contact; multiplying files alone is not success. The first slice is the complete identity replacement plus all existing motion states. Unrequested new game systems and presentation surfaces are excluded.

## Flow

1. When the person sees README or the download page, Atlas presents the selected traveler in existing brand positions and keeps the installation action legible.
2. When the person opens the installed app, Atlas presents the same identity in OS assets and existing in-app mascot positions, including first-run and waiting surfaces.
3. When the person opens the optional companion, Atlas shows that traveler in the existing idle, walk, attack, read, code, greet, sleep, and victory roles; input, progress, and saved memories retain their meaning.
4. When verified Atlas reading begins, the traveler enters and reads; only completion of that observed sequence permits its success pose.
5. When an agent is wrong, evidence is absent, or a sequence fails, the traveler does not celebrate unsupported success. Existing result and correction controls remain authoritative.
6. When reduced motion is enabled or the page is hidden, decorative motion stops while static identity, direct controls, and truthful status remain available.

## States

| State | Web | macOS app |
|---|---|---|
| Static entry / first run | No new message key; existing brand alt or decorative empty alt. Continue through existing download or folder action. | No new message key; static OS and chooser identity. Open a folder. |
| Waiting / partial load | Existing waiting status remains; new traveler never implies verified work. Wait or use the existing recovery action. | Same status contract; existing recovery action remains. |
| Verified read | `agentActivity.mascot.detected`, then `.reading`; inspect existing work status. | Same keys and next action. |
| Verified completion | `agentActivity.mascot.success`; inspect the existing receipt. | Same key and next action. |
| Missing evidence / failed operation | No new mascot message; existing result UI carries uncertainty or failure. Inspect or correct the result. | Same contract; no success pose. |
| Optional companion | Existing `companion.world.traveler` and controls; move, interact, or close. | Same keys and actions with the same traveler. |
| Reduced motion / hidden page | No new key; static pose or paused scene, direct controls retained. | Same contract. |
| Empty / single / largest measured vault | No new key; artwork does not depend on node count. Use existing folder and graph actions. | Same contract. |

## Copy

None — this identity replacement changes no user-facing strings or message keys. Existing English/Korean catalogs remain authoritative; no new character name or success claim is introduced. Existing status strings are `Verified agent reading detected.`, `The agent is reading the ontology.`, and `The verified agent work completed.` in `messages/en/agentActivity.json`; their existing Korean counterparts remain in `messages/ko/agentActivity.json`.

## Edge cases

- Empty and single-node vaults use the same identity; the currently enumerated dogfood vault has 100 nodes. Largest rendered count is unknown until the lead records the affected-surface capture; no capacity claim is made.
- First run, light/dark backgrounds, transparent edges, 16px favicon/tray, and high-density OS icons need distinct readability checks. The planet may simplify at micro scale; hood and cyan-eyed face must remain recognizable.
- Hangul folder names, renamed/moved/unreadable folders, and concurrent source edits retain existing messages and recovery paths. Mascot artwork must not add input handling or alter folder authority.
- Offline app use loads bundled assets. Hosted caching or a stale installed bundle can retain old art; verification distinguishes source, deployed site, and installed app.
- Hidden or closed companion scenes and live reduced-motion toggles stop animation without discarding progress or requiring an app restart.

## Out of scope

- New progression, dialogue, powers, or mascot-driven ontology decisions: identity and animation do not authorize these features.
- Replacing topology kind marks, graph nodes, companion enemies, or third-party logos: these are not the Atlas mascot.
- A new backend, telemetry, external image loading, login, or storage schema: all production assets are local static resources.
- Rewriting frozen historical records and old release binaries: document the new decision and ship current assets through the normal delivery path.

## Acceptance criteria

1. Given the supplied primary image, when the owner inspects the master and 128/64/32/16px contact sheet on light/dark backgrounds, then the cream hood, dark face, cyan eyes, blue accents, and full-size ringed planet remain coherent without matte fringes or blurred pixel grids. Evidence: design-audit asset contact sheet.
2. Given a person starting at README, when they continue through `/ko/download/` to the installed app and optional companion without opening source files, then captures show the same selected identity at every existing mascot position. Fail on a remaining robot/fox mascot or an obscured primary action. Evidence: lead's rendered surface inventory and installed-app walkthrough; this is the bounded `orient` recovery proof.
3. Given every companion pose and direction, when the person walks, stops, turns, reads, and attacks, then frames contain no neighboring sprite fragments, changing body scale, accidental clipping, or discontinuous foot registration. Evidence: actual-screen motion recording and `CompanionSprite.test.tsx`, retaining distance-driven walking.
4. Given missing evidence, an unverified operation, or a failed sequence, when work state updates, then no unsupported completion pose appears; a verified read and terminal completion still produce one finite sequence. Evidence: `AgentMascotPresence.test.tsx` and `tests/e2e/agent-mascot-presence.spec.ts`.
5. Given live reduced-motion changes and a hidden/closed companion, when animation would otherwise advance, then decorative loops stop, direct controls remain usable, and no background work is invented. Evidence: companion runtime recording and applicable existing companion E2E coverage.
6. Given an existing saved companion and an offline installed app, when the updated bundle opens, then the new identity renders and progress/journal data and folder controls remain intact. Evidence: installed-app readback, preserving user-local data.
7. Given all replacement assets and runtime edits, when the lead runs `pnpm checks:changed -- --run` and every recommendation, then required checks pass; the delivery report separately names source, hosted, and installed verification and any unperformed proof.

## Risks

1. Downsampling erases identity or leaves inconsistent pixel sizes. Probe each authored tier at actual display size before asset fan-out; simplify micro details deliberately.
2. A hidden consumer, cached hosted file, or stale app bundle retains the old mascot. Use an explicit asset-consumer inventory plus hosted and native bundle readback, including README lockups, favicon/tray, packaging, waiting states, and companion preload references.
3. Motion introduces jitter, extra rendering work, or false completion. Use registered frames and real screen recordings, retain current gating and hidden/reduced-motion pauses, and run the existing semantic-state failure probes.

## Later

1. Additional emotions only when an existing interaction has an observed missing response; retain the same identity and accessibility contract.
2. Additional decorative scenes only after the complete replacement and movement proof pass and the owner requests a new context.

## Owner question

None — the supplied character and complete replacement scope are explicit. The lead records the superseding identity decision; restoring the prior asset family remains possible through version control without changing user data.
