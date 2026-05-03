# CHANGELOG

> Major change history. Code commit messages answer *why*; this file answers *when / which surface changed*. Focused on **user-visible changes**, not PR-level granularity.
>
> Newest at the top. Date-based since we're pre-semver in the v0.x stage.

---

## 2026-05-03 — Surface diet: 5 dead UI cuts

First-principles audit of every UI surface — does each toggle / mode /
widget serve the user's 3 jobs (그래프 본다 / 그래프 쓴다 / 개념 찾는다)?
어드바이저 (codex) second opinion 으로 합의된 5 곳을 컷.

### User-visible changes

- **`/` 홈** — 상단 우측의 "프레젠테이션 모드" (F 키) 진입 / fullscreen
  토글 + ESC 종료 버튼 제거. OSS local 도구에서 fullscreen 발표 use case 가
  검증된 적 없음.
- **`/docs` 헤더** — "전체 / 기획자 / 엔지니어" audience 토글 제거. dogfood
  vault 18 노드 어디에도 `mode: planner|engineer` frontmatter 가 없어 토글
  결과가 항상 동일했음 (사용자에게 무엇을 거른지 모호).
- **`/docs` 우측 advanced 메뉴** — view: graph (vault mini Sigma) /
  view: stats (단어수·태그·orphans 통계) 두 모드 제거. 그래프는 `/topology`,
  메트릭은 `/ontology/insights` 가 이미 전담.
- **`/docs` 문서 내부** — Relationship Radar 사이드 패널 제거 (확인 / 무시 /
  리셋 / 무시한 거 비우기 4-state). 이 위젯의 "확인" 액션이 vault 의 실제
  edge 를 만들지 않고 localStorage review state 만 남기던 검증 안 된 추천
  휴리스틱.
- **`/docs` 본문 위 메타바** — 문서마다 표시되던 "Planner / Engineer /
  Shared" 관점 chip 제거 (audience 토글이 사라졌으므로 의미 없음).

### 단축키 변경

- F 키 (presentation 토글) 사라짐. `?` (단축키 도움말) / `D` (문서 드로어)
  / `⌘K` (검색) / `⇧⌘K` (글로벌 검색) 는 그대로.

### 코드 / 아키텍처

- 5 commit, 약 ~2400 LOC 삭제.
- 위젯 4 개 파일 통째 삭제: `DocsVaultRelationshipRadar`, `DocsVaultGraph`,
  `DocsVaultStats`, `DocsVaultAudienceMismatchNotice`.
- 엔티티 `relationship-radar` 스코어러 + `radar-review-state` 라이브러리 +
  `classifyMode` (parse-frontmatter / scripts) 삭제.
- `VaultDoc.mode` 필드 + `VaultMode` 타입 제거 — vault 매니페스트 스키마
  단순화. `pnpm docs-vault:build` 재실행 → manifest.json 의 `mode` 필드
  43 → 0.
- 41 개 i18n 번역 키 제거 (audience\* / mode\* / radar\* / stats\* /
  graph.\* / presentation\*).
- `DocsVaultPage.tsx` 1950 → 1700 LOC.

### Test

- 593 → 571 tests pass. 22 test 가 함께 삭제됨 (deleted widget 들의 자체
  test).

### Deferred / kept (codex second opinion)

- `/topology` 라우트 — keep (permalink / SEO canonical 가치).
- `/project/[slug]/edit` 라우트 — keep (인라인 편집은 일부 필드만 커버,
  full editor 만 가지는 12 필드 — slug / category / status / dates / owner
  / icon / progress / isHub / nameEn / detail / 등).
- `/docs view: folder-topology` — keep (project 스캐폴드 + 포지션 저장
  capability 가 아직 다른 surface 에 없음).
- `/ontology/insights` + `/ontology/relations` 통합 → 별도 PR.
- `/` (vault 있을 때) ↔ `/ontology` 중복 (둘 다 `OntologyViewPage` 렌더) →
  별도 결정.

---

## 2026-05-03 — Round 10: permanent removal of auth + cloud surface

`oh-my-ontology` is now a pure local-first OSS. All optional Firebase /
Firestore / Auth / Cloud Functions / Storage code has been **permanently
removed**. The `.md` files in your vault are the single source of truth.

### User-visible changes

- **No login** — `/login`, `/signup`, `/account`, `/reset-password` routes
  are gone. The "Sign in" button in the landing header is gone. The
  "Sign out" button in the operations nav is gone.
- **No settings** — `/settings/categories`, `/settings/statuses`,
  `/settings/import` were cloud-only and are gone. Categories / statuses
  are now build-time defaults (vault-defined custom taxonomy is a future
  feature).
- **No cloud-mode badge** — the OperationsNav `cloud sync` chip can no
  longer appear. Vault and demo (static) badges remain.
- **No screenshot uploader** — was Firebase Storage-backed; gone. Markdown
  inline images are the path forward.
- **No manual node/edge cloud modal** — the "Add node" button on `/ontology`
  now links straight to the builder canvas (`/ontology/edit`), where new
  nodes are saved into the vault directory.
- **No `.env` setup needed** — `pnpm dev` and `pnpm build` work without
  any environment variables. `.env.example` is now a minimal placeholder.

### Code / architecture

- Net delete: ~20,000 lines (R10a 2225 + R10c 4634 + R10b 12227).
- `DataSourceMode` enum narrowed: `'static' | 'local' | 'cloud'` → `'static' | 'local'`.
- Deleted: `@/features/{user-auth,permissions,account-scope,docs-vault-access}`,
  `@/widgets/account-menu`, `@/entities/admin`, every `@/entities/*/api`,
  `@/shared/api/firebase.ts`, `firestore.rules`, `firebase.json`, mapper.ts
  (Firestore ↔ Date) and their tests, manual-node/edge-create-modal widgets,
  ScreenshotUploader.
- `package.json`: removed `firebase`, `firebase-admin`, `firebase-tools`
  dependencies. Removed `dev:firestore-emulator`, `dev:firebase-emulators`,
  `test:e2e:public-*` scripts.
- `pnpm bundle:check` now shows 0 firebase SDK chunks across all routes
  (down from 731KB on settings pages pre-R10).
- 5 e2e tests removed (auth/cloud-emulator-dependent). Remaining 14
  e2e specs run without firebase emulators.

### Future cloud collab

When sponsorship / collaboration features come back, auth and cloud sync
will be re-designed from scratch (the v0.x removal preserves git history
as a reference but does not stub anything). For now, the OSS is
single-user, single-machine, single-source.

---

## 2026-05-02 — OSS launch readiness: English-first docs + npm publish guard

### User-visible changes

- **All OSS-facing docs are now English-first** — global contributors can read the full project from README → AGENTS → docs/* without Korean. README.md and AGENTS.md keep a Korean sub-section (`한국어 가이드`) at the bottom for native readers.
- **Vault starter templates ship in English** — `npx oh-my-ontology init` and the `/docs` "Create starter seed" button now write English `README.md` / `project.md` / `domains/example.md` / `capabilities/example.md` / `elements/example.md`, so non-Korean users get a coherent first experience.
- **`mcp/README.md` is the npm package face** — when published, https://www.npmjs.com/package/oh-my-ontology-mcp will display polished English copy.
- **New `docs/TROUBLESHOOTING.md`** — a single English doc covering scaffold / MCP / build / publish issues for OSS users.

### Translated to English (in-place)

- `mcp/README.md` (npm publish face)
- `docs/PUBLISH-NPM.md` · `docs/PRODUCT-DIRECTION.md` · `docs/FEATURES.md` · `docs/ARCHITECTURE.md` · `docs/DATA-MODEL.md` · `docs/DESIGN-SYSTEM.md` · `docs/MODE-AWARE-CRUD.md` · `docs/DEPLOY-FIREBASE.md` · `docs/DEPLOYMENT.md` · `docs/CHANGELOG.md`
- `cli/templates/vault/*.md` (5 starter files) + the in-app `src/features/docs-vault-local/lib/ontology-starter.ts` mirror

### Kept Korean intentionally

- `docs/BACKLOG.md` · `docs/MISSION-CLEANUP-CANDIDATES.md` · `docs/launch/*` — internal trackers / draft material (the maintainer is the only reader)
- `README.md` · `AGENTS.md` · `CLAUDE.md` — bilingual sub-section for Korean contributors
- Seed data values in `docs/DATA-MODEL.md` and design-rule examples in `docs/DESIGN-SYSTEM.md` — these are literal data, not prose

### npm publish guard (3 layers)

`npm publish` / `pnpm publish` / `yarn publish` is now blocked from running unless the user explicitly authorizes it:

1. `.claude/rules/forbidden.md` — auto-loaded behavioral rule
2. `.claude/settings.json` PreToolUse hook + `.claude/hooks/block-npm-publish.sh` — intercepts Bash commands matching publish patterns and returns `permissionDecision: "deny"`
3. `CLAUDE.md` — high-level Claude-specific reminder; CLAUDE.md remains a thin wrapper, the rule lives in `forbidden.md`

Tested with 7 input shapes: `npm publish`, `cd mcp && npm publish`, `pnpm publish`, `npm pack --dry-run` (allowed), `npm whoami` (allowed), `npm pack` without `--dry-run` (blocked), `ls -la` (allowed).

### FEATURES.md drift sync

Brought `docs/FEATURES.md` back in line with the actual codebase:

- **Removed** stale references: `/knowledge` / `/knowledge/documents/*` routes (entity removed in commit `a906635`), `KnowledgeDocumentNewPage`, `node --check functions/index.js` (the `functions/` folder itself is gone), the outdated "Cumulative cleanup stats" block.
- **Updated** numbers: MCP tool table 7 → 11 (read 7 + write 4), dogfood vault 21 → 23 nodes, vitest counts 118/848 → 100/721.
- **Added** new sections: `/docs` scaffold button (`OntologyStarterCta`), CLI package, npm publish guard, "Removed by mission v2 cleanup" expanded entries, and a brand-new **Section 8 "OSS distribution surfaces"** documenting npm packages, Firebase Hosting, GitHub OSS surfaces, and the publish guard.
- `AGENTS.md` got the same drift fix (route list + test counts + cleanup note).

### Tooling

- `scripts/audit-data-model.mjs` — accept either Korean or English `## 5. Storage 구조|layout` heading so the data-model audit test passes after translation.

### Verification

- `pnpm exec tsc --noEmit` — 0 errors
- `pnpm lint` — 0 errors (62 pre-existing warnings)
- `pnpm test:run` — 100 files / 721 tests pass
- CLI smoke (`node cli/src/index.mjs init test-vault`) writes 5 English `.md` + `.mcp.json.example`
- Hook smoke — 7/7 input shapes behave as expected

---

## 2026-05-02 — local-first first paint firebase 0 (PR #99)

### User-visible changes

- **First page load is lighter** — user-facing entry points like `/`, `/topology`, `/docs`, `/ontology/edit`, `/projects`, `/knowledge`, `/login`, `/account` no longer statically load firebase JS (~773kb chunks). The lazy load only happens when explicitly entering cloud mode (signin / cloud entity mutation).
- **Better LCP on mobile / slow networks** — zero firebase SDK parse cost.
- **Hosting cost angle**: users who pick a vault never get a firebase account created. Origin server cost was already 0 (static export), and now firebase traffic is also 0 until cloud mode is entered.
- **Behavior is unchanged** — cloud-mode users get all features identically (the firebase chunk is downloaded at function-call time).

### Architecture changes (developer-visible)

- **entity barrel split pattern** — `@/entities/<x>` is now type / lib / pure helper only. firestore api lives at `@/entities/<x>/api` and must be imported directly. New contributors writing mode-aware features should `import('@/entities/<x>/api')` dynamically only on the cloud branch.
- **mapper Timestamp duck-typing** — instead of `instanceof Timestamp` checks, use the `coerceFirestoreDate(value)` helper (`@/shared/lib/firestore-timestamp-coerce`). entity model has zero firebase dependency.
- **`package.json sideEffects` allowlist** — only `*.css` + `firestore-noise-patch` are marked side-effectful. Everything else is webpack tree-shakeable.

### New modules

- `src/shared/lib/firestore-noise-patch.ts` — extracted the existing `FirebaseProvider`'s console noise patch into a firebase-deps-free module. Installed in layout via a side-effect import alone.
- `src/shared/lib/firestore-timestamp-coerce.ts` — Timestamp duck-typing helper + 8-case unit tests.
- `src/entities/knowledge-graph/api/index.ts` — knowledge-graph api barrel (previously mixed into the main barrel).

### Removed

- `src/app/providers/FirebaseProvider.tsx` (-91 lines) — its responsibilities were a console patch + an unnecessary `getFirebaseApp()` warmup. The patch moved to a pure module, and `<link rel="preconnect">` already handles warmup.

---

## 2026-05-01 (night) — UX first-principles batch + Phase 4 non-developer friendliness + V1.5 cardinality

In addition to the 7 PRs in the previous entry, 12 more PRs (#15-#23) merged. 19 PRs total this session.

### User-visible changes

- **`/`** empty-vault empty-state — in local mode, an inline `frontmatter snippet` was added so users can create a `.md` directly without entering the builder (copy-paste ready). Other modes keep the existing 3-step guidance.
- **`/docs/`** dogfood vault hint — the LocalVaultPicker idle state now suggests "First time? Try selecting `docs/ontology/` from this repo." The fastest path for vision validation.
- **OperationsNav mode badge** (UX-2 new) — the right side of both desktop and mobile nav now always shows the current mode chip (`vault · NN docs` / `cloud sync` / `demo`). Users see at a glance where data is going.
- **Builder (`/ontology/edit`) onboarding copy** — "more than ERD — a domain map", written for non-developers. Mission v2's *AI agent partner* is also called out.
- **Builder vault md write** (P1-1 / UX-4) — saving a node in the builder now branches by mode: in local mode it writes `vault/${kind}s/${slug}.md` directly; in cloud mode it upserts to Firestore. This closes the key missing piece in mission v2's *human + AI agent coexistence* promise.
- **lucide icons per kind** — Tree / Builder palette now uses intuitive metaphors (project=Folder, domain=Layers, capability=Cog, element=Box, …). Color stays single-indigo + neutral per the design charter.
- **PM-friendly search categories** (`⇧⌘K`) — group headings "Ontology / Documents / Projects" → "Concepts / Writing / Projects". Placeholder + aria-label translated to Korean too.
- **UI English-transliteration cleanup** — "edge type distribution" → "relation kind distribution", "evidence rich" → "documents with many citations", etc. Code identifiers (`kind` / `node` / `edge`) are kept as is.
- **Demo data aligned to mission v2** — the `Demo Knowledge` container's capabilities replaced mission v1 leftovers ("review queue", "frontmatter extraction") with mission v2 ("vault frontmatter as source of truth", "AI agent partner").

### New entities / features / modules

- `mcp/scripts/verify.mjs` — one-line verify CLI. Integrated check of parser smoke + server boot + tools/list + list_concepts. Diagnoses which step failed.
- `mcp/src` v0.2 → **v0.3** — added `find_path(from, to, maxHops?)` BFS + `list_kinds()` census. 7 → 9 tools.
- `src/entities/ontology-class/model/icons.ts` — `getOntologyKindIcon(kind)` shared helper.
- `ModeBadge` component in `src/widgets/operations-nav`.
- `docs/ATOMIC-AUDIT-2026-05-01.md` — first-principles audit results across 13 domains (438 lines).
- `docs/UX-FIRST-PRINCIPLES.md` — 7-step user journey friction analysis + P0/P1/P2 matrix.

### Removed

- All of `src/widgets/ontology-output-badges/` (-425 lines, 0 imports — leftover from extraction review-queue dependency).

### Ontology model evolution (V1.x)

- **V1.1** ✅ qualifiers + rank merged (recorded in the previous entry; this entry only covers follow-up dogfooding)
- **V1.5** ✅ Relation Cardinality merged — added `sourceCardinality?` + `targetCardinality?` optionals to `OntologyRelation` (additive, zero breakage). 5 new unit tests.

### Documentation

- `README.md` + `AGENTS.md` synced to mission v2 (previous entry).
- `docs/FEATURES.md` fully rewritten; `docs/ARCHITECTURE.md` / `docs/DATA-MODEL.md` / `docs/MODE-AWARE-CRUD.md` aligned to mission v2.
- `docs/BACKLOG.md` consolidated next-work after mission v2 phase (T28-T38 + UX-1/2/3/4).
- `docs/MISSION-CLEANUP-CANDIDATES.md` compressed (all 4 stages ✅, archived analysis).
- `docs/PRODUCT-DIRECTION.md` shows Phase 1-4 status (1 ✅ / 2 ⏸ / 3 ✅ / 4 ⏳).
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` progress table — V1.1 + V1.5 ✅, V1.2/V1.3/V1.4 pending.
- `mcp/README.md` updated to v0.3 (9 tools) + sample LLM prompt + verify CLI guide.
- `docs/ontology/` dogfood vault — added `capabilities/builder-vault-write` + `capabilities/v1-5-cardinality`, updated `capabilities/mcp-server` to 9 tools. 22 nodes.

### Verification status

- **117 test files / 839 tests passing** (V1.5 +5)
- tsc 0 errors
- lint 0 errors (79 pre-existing warnings)
- `node --check functions/index.js` syntax OK
- MCP `npm run verify` end-to-end: 9 tools + 22-node dogfood vault healthy
- Playwright MCP browser-level QA (15 routes) — mission v2 surfaces healthy, 0 console errors, mode badge "demo" visible, 0 stale "Demo" titles

### Open questions

- **Q1, Q2** — ✅ answered
- **Q3-Q8 (V2 spec)** — blocked by V1.2 (Q6+Q7), V1.3 (Q5), V1.4 (Q4)

### Cumulative stats (19 PRs this session)

- Roughly -5,833 lines from mission cleanup (PR #5-#11)
- +438 lines audit / +210 lines UX analysis / +245 lines BACKLOG · FEATURES sync
- +574 lines new features (MCP v0.3 / mode badge / vault md write / V1.5 / kind icons / frontmatter snippet / verify CLI)

---

## 2026-05-01 (evening) — Phase 3 (AI agent partner) + mission v2 cleanup

A large cleanup that aligns PRODUCT-DIRECTION v2's mission ("a codebase ontology authored together by humans and AI agents") across code + functions + dogfood vault. PR #5 / #6 / #7 merged cumulatively.

### User-visible changes

- **AI agent partner introduced** — `mcp/` MCP server (`@modelcontextprotocol/sdk@^1.0.0`). LLM agents like Claude Code can read/write the vault ontology over stdin/stdout JSON-RPC. v0.2.0 ships 7 tools: `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `add_concept` / `add_relation` / `patch_concept`. Register via `.mcp.json.example` or `mcp/README.md`.
- **`docs/ontology/` dogfood vault** — this project's own mental model expressed as frontmatter md. 1 project + 8 domains + 6 capabilities + 4 elements = 20 nodes.
- **`/` ontology hub is mode-aware** (Q1=(a)) — when a vault is active, `/` automatically surfaces the vault's frontmatter stub nodes in the tree, ego graph, and search (LOOP-TASK Open question #1 answered).
- **Empty-vault UX** — in local mode when a vault is active but has no ontology nodes, show a "vault is empty" guide + 2-step (frontmatter / builder) CTA. The "open vault" step is skipped in local mode.
- **"Start analysis" cloud LLM extraction flow removed** — mission v2's cost model shifted to *user-side AI agents (Claude Code)*. Affected surfaces:
  - `/knowledge/documents/[id]` detail — 4-step stepper → 2 steps (upload → publish); 4 sites of `ExtractorVersionToggle` / "start analysis" / "re-analyze" CTAs removed → "open vault" / "open builder" CTAs
  - `/review/knowledge` review queue — page + route deleted entirely. `OperationsNav` 'Document review' tab removed (5 tabs → 4 tabs). Review links removed from 6 views
  - `/ontology` toolbar's "review queue" pill removed; the "unresolved references" Stat's review-queue link → in-page stub list
  - `WorkspaceOntologyStrip`'s stub chip target → `/ontology` tree stub list
  - landing onboarding ValueChainRail "run extraction" → "frontmatter is self-approving"

### New entities / features / modules

- `mcp/` in its entirety — MCP server package (parser.mjs / vault.mjs / index.js / parser.test.mjs). v0.1.0 (5 tools) → v0.2.0 (7 tools).
- `src/features/vault-ontology/model/use-ontology-insight.ts` — mode-aware ontology insight. local: vault frontmatter stub conversion; cloud: knowledgePublic projection.
- `docs/ontology/` in its entirety — own ontology vault.
- `docs/MISSION-CLEANUP-CANDIDATES.md` — 4-stage cleanup staging plan (Stages 1+2+3+4 all complete).
- `.mcp.json.example` — Claude Code registration template.

### Removed / cleanup

- **functions/index.js: 2,012 → 543 lines (-73%)**
  - removed `enqueueExtractionJob` / `processExtractionJob` / `reclaimStaleExtractionJobs` (3 extraction-flow handlers)
  - removed `applyReviewAction` (review-queue callable)
  - cleaned up ~20 dependent core + helper functions
  - deleted `extract-gemini.js` (224 lines) + `ontology-extract.js` (1,295 lines) + `ontology-extract.test.mjs` (812 lines)
  - removed secrets `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. Removed `@google/generative-ai` dependency
- **`src/views/knowledge-review-workspace/` deleted entirely** (1,357-line view + barrel)
- **`app/review/` deleted entirely** (page + redirect + sub-route)
- **entity layer**: removed `enqueueKnowledgeExtractionJob` httpsCallable wrapper, `approveKnowledgeOutput` / `rejectKnowledgeOutput` callables + 6 types, `getKnowledgeReviewWorkspaceHref` helper. Each barrel export cleaned up.
- **6 view callers**: review-queue links cleaned up in KnowledgeDocumentDetailPage / (deleted KnowledgeReviewWorkspacePage) / KnowledgeDocumentsPage / KnowledgeDashboardPage / ProjectSelectorPage / ProjectEditorPage
- **Cumulative cleanup**: PR #5 -3,729 lines + PR #6 -2,096 lines + PR #7 -8 lines = **about -5,833 lines**

### Verification status

- **117 test files / 843 tests passing**
- tsc 0 errors
- lint 0 errors (79 pre-existing warnings)
- `node --check functions/index.js` syntax OK
- MCP server stdin/stdout JSON-RPC: initialize → tools/list (7 tools) → tools/call (`add_concept` / `patch_concept` / `find_backlinks` / `find_evidence` / `get_concept` / `list_concepts`) end-to-end healthy
- dev server (port 3210): core routes return 200, deleted `/review/knowledge/` returns 404, 0 Error markers in HTML

### Open questions

- **Q1** — ✅ answered ((a) chosen, useOntologyInsight introduced)
- **Q2 (share-doc removal)** — still pending
- **Q3-Q8 (V2 spec)** — still pending

### Operations notes

- The user does not run `firebase deploy --only functions` (no-firebase-deploy policy). Changes to functions/ are code-only cleanup, not deployed. Existing cloud functions are still alive but have 0 callers — dead.
- Existing `knowledgeExtractionJobs` / `knowledgeExtractionOutputs` / `knowledgeReviews` / `knowledgeApprovalEvents` Firestore collection data — cold storage (read-only); no callable remains, so archive-only.

---

## 2026-05-01 — Mode-aware CRUD + Builder rebrand

### User-visible changes

- `/` Landing — static mini topology SVG (14 nodes / 21 relations) + 3-step rail (markdown → extract → topology·tree·ERD) + Obsidian/Notion comparison copy + footer (MIT licensed · GitHub · tech stack). Marketing sections (Why / Coming-soon roadmap / Stats / framer-motion animation / Sigma drift background) all removed.
- `/projects/` — non-logged-in user redirect removed. List is shown immediately. Non-logged-in users with an active vault can use ProjectQuickCreatePanel to *create .md directly in the vault* (mode-aware).
- `/ontology/edit/` — 'Ontology Atlas' → **'Ontology Builder'** rebrand. Header trimmed from 5 lines → 1 line + ⓘ tooltip. Canvas widened from max-w 1400 → 1800. Non-logged-in users no longer see the raw 'Missing or insufficient permissions' error — the ephemeral canvas is fully usable.
- `/ontology/` — 'i' icon hover tooltip works + copy strengthened (hierarchy + builder entry guidance). 'Editor' button → **'Open Builder →'** prominent indigo fill. Footer at the bottom now shows nodes/relations + mode + projection version (surfacing V1.0 strengths).
- `/ontology/` vault mode — `VaultOntologyStubsPanel` is shown. Visualizes how frontmatter (`kind`, `capabilities`, `elements`, `relates`, `dependencies`, `domain`) immediately grows into stub nodes/edges.
- OperationsNav 'Documents' tab — branches to `/docs/` when a vault is active, otherwise `/knowledge/`.
- 'Demo' brand leftovers across landing / app → cleaned up to **`oh-my-ontology`** (page title / OG / twitter / PWA manifest).

### New entities / features / shared modules

- `src/shared/lib/data-source-mode.ts` + `src/features/data-source-mode/` — hook that recognizes 4 operating modes (Static / Local / Cloud / Hybrid).
- `src/features/project-data-source/` — `useProjectMutations` mode-aware hook (local writes vault directly; cloud writes Firestore).
- `src/entities/docs-vault/lib/project-frontmatter.ts` — bidirectional Project ↔ frontmatter mapper + `buildProjectMarkdown`.
- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` — frontmatter → ontology stub conversion (fast path, bypasses AI extraction).
- `src/features/vault-ontology/` — useVaultOntology hook + VaultOntologyStubsPanel widget.
- `src/entities/local-fs-handle/` — entity-ization of File System Access handles (forward-compat for multi-vault).
- `src/entities/local-fs-handle/api/permission.ts` — generalized `verifyHandlePermission(handle, mode, {ask})` utility.
- `src/entities/docs-vault/lib/build-local-manifest.ts` — added `computeLocalVaultFingerprint` function (auto-refresh skip).

### Removed / cleanup

- `src/features/workspace-project-bridge/` — deleted entirely (771 lines / 9 files / 50 tests). Multi-account container adapter — dead after switching to single-user mode.
- `src/widgets/workspace-project-selector/ui/WorkspaceProjectSelector.tsx` — 230 lines of dead UI deleted.
- `src/shared/lib/account-scope.ts` — removed `appendWorkspaceProjectQuery` / `readRuntimeWorkspaceProjectId` stub functions.
- `src/shared/lib/use-workspace-project-query.ts` — deleted entirely + dead destructure cleanup in 3 consumers.
- removed `_accountId` parameter from `useScopedAccountAccess` (cleaned up 11 call sites at once).
- parts of `src/views/account-settings/` + parts of `src/widgets/account-menu/` — cleaned up no-longer-used code paths.
- 7 dead `/admin/*` URLs removed from 4 e2e audit specs.
- LocalVaultPicker's off-canon palette (peachy / muted-red / indigo variants) → unified to canonical warning(244,183,49) / danger(229,72,77) / indigo(94,106,210) + semantic tokens.
- LocalVaultPicker error state — added a one-line actionable hint.

### Bug fixes

- Removed the `accountId = null` hardcode in `OntologyEditPage` — restored manual node saving on the ERD canvas (previously always failed with the "account not confirmed" toast).
- `useApprovedGraphFlow` was attempting Firestore subscription when not logged in → raw permissions error — now skips subscription when accountId === null + returns empty graph + loaded:true.
- frontmatter parser didn't support multi-line YAML lists (`capabilities:\n  - x`) → support added.
- `useLocalVault`'s manual `refresh` now also applies the fingerprint skip (previously only auto-refresh did).

### New specs / docs (untracked, awaiting user review)

- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.0 strengths + V1.1~V1.5 staged evolution (qualifiers / literals / rich-refs / ActionType / cardinality) + V2 unified statement model + 90+ checklist items + 2 Mermaid diagrams + 50+ Glossary terms + 8 Open questions + 13 sections.
- `docs/LOCAL-FIRST-SYNC.md` — 4 operating modes + 5 conflict-resolution principles + 4 open questions before introducing Hybrid.
- `docs/OFFLINE-FIRST-UX-FLOW.md` — 6 user states × 11 routes matrix + 5-step onboarding.
- `docs/ACTION-TYPE-SECURITY-DRAFT.md` — V1.4 ActionType's 8 security items, deeper.
- `docs/MODE-AWARE-CRUD.md` — contributor guide for the mode-aware pattern introduced today + 4 anti-patterns.

### Verification status

- 927 tests passing (131 test files)
- tsc 0 errors
- lint 0 errors (all warnings pre-existing)
- Playwright visual: `/`, `/projects/`, `/ontology/`, `/ontology/edit/`, `/docs/` and 8 routes audited — all 0 console errors.
- Cumulative commits: ~30+ (single session today). Cumulative diff: -3000+ / +1500+ lines (mostly cleanup).

### Open questions (awaiting user answers)

1. Should `/` topology auto-switch when an active vault exists? (a/b/c)
2. Can the share-doc system (`/share/[token]` + sharedDocs Firestore) be removed? (a/b)
3. V2 spec P0/P1 Open questions Q1~Q8 (multi-vault timing / ActionType auth / dual-read window / none vs unknown / extractionModelId validation / summary migration / literal naming scope / ActionInvocation retention)

---

## Before 2026-04-30

Earlier changes predate this CHANGELOG — see git log (`git log --oneline 7b16945..ba1e102`).
