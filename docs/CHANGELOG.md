# CHANGELOG

> Major change history. Code commit messages answer *why*; this file answers *when / which surface changed*. Focused on **user-visible changes**, not PR-level granularity.
>
> Newest at the top. Date-based since we're pre-semver in the v0.x stage.

---

## 2026-05-11 — Ontology surface UX pass + 토폴로지 별자리 톤

UI 점검 보고서 (`/`, `/topology`, `/ontology`, `/ontology/insights`,
`/ontology/edit`, `/docs`, `/projects`) 의 우선순위 항목들을 30+ 작은 PR
로 풀어낸 세션.

- **`/ontology` 트리** — multi-parent silent drop 을 stat strip 의 amber
  warning pill 로 표면화 + capability 노드 default 접힘 + 모바일 element
  파일명 truncate. 트리의 데이터 경고 disclosure 톤도 red→amber 통일.
- **`/topology` 시각** — 사용자 피드백 *"대벌레 다리"* 해결 시리즈: zoom
  out 시 edge size 감쇠, edge curvature 직선→곡선, 노드 별빛 halo +
  푸른 dust edge ("은하계 별자리" 톤), 라이트 모드 회귀 정정, recenter
  의 bbox center fallback, minimap 톤 정합.
- **드래그→릴리스 후 detail 드로어 열림 회귀** — `dragMoved`
  `queueMicrotask` reset 이 `clickNode` 가드 무력화 → 다음 `downNode`
  까지 reset 유지.
- **`/projects` 카드 fact strip** — single-project vault 에서 *도메인 6 /
  역량 14 / 요소 62* 가 hide 되던 회귀 4 단계 fix (UI fallback → BFS 로
  contains 후손 projectIds 매달림 → project node id 를 frontmatter.slug 로
  정합).
- **`/docs` 첫 진입** — default slug `FEATURES` 우선 + `?intent=local` +
  vault 미선택 케이스 server fetch fallback (영문 에러 노출 회귀 차단).
- **SEO sweep** — `/ontology/edit` sitemap, hreflang trailing slash +
  x-default, locale 별 canonical, PWA manifest 의 R12 mission 어휘.
- **R10 cleanup sweep** — tsconfig stale exclude, CI continue-on-error,
  .gitignore Firebase section, hardcoded white alpha 14 곳 → 디자인 토큰.

## 2026-05-10 — Mobile docs responsive polish

Real mobile browser review found the `/docs` header and local-vault tools were
too desktop-shaped after the Topology shortcut was added.

- The mobile docs header now keeps Back, title, doc count, and Topology in one
  compact row, with source/search/tools controls on the second row.
- The local-vault tools panel no longer stays open after a successful folder
  load from `?intent=local`, so the first document is not covered by a floating
  menu.
- The tools menu uses a viewport-bounded mobile sheet when opened manually.
- Follow-up cmux-width review fixed `/ontology` narrow layout: mobile stat
  cards stack, the demo badge no longer pushes past 320 px, and deep tree rows
  clamp indentation/truncate inside the viewport.

## 2026-05-09 — Cleaner single-file repo bootstrap graph

Large demo bootstrap uncovered a second cold-start quality issue: single-file
layered repos could land support folders such as `src/domain` and `src/storage`
as fake capability nodes (`capabilities/domain`, `capabilities/storage`).

- Import graph module collapse now keeps `src/features/*.js` as capabilities
  while classifying support-layer files (`domain`, `storage`, `integrations`,
  `reports`, `shared`, `app`, `lib`, `utils`) as elements.
- A clean `init → bootstrap` run on the large demo now lands 5 README domains,
  8 user-facing capabilities, and 18 implementation elements with zero errors.
- Regression coverage now blocks folder-name capability noise from returning
  for single-file layered projects.

## 2026-05-09 — Docs-to-topology navigation visibility

Large demo project follow-up found a real discoverability gap: after loading a
local vault in `/docs`, the Topology entry existed only inside the small vault
tools menu, and mobile bottom navigation did not expose Topology at all.

- `/docs` header now has a direct Topology link beside the vault title/source
  controls.
- Mobile bottom navigation now exposes Topology as its own first-class tab
  instead of hiding it under Ontology.
- Browser smoke verified desktop `/docs` and mobile `/docs` can navigate
  directly to `/topology`.

## 2026-05-09 — Large clean-room bootstrap hardening

큰 단일 파일 feature 구조의 clean-room 프로젝트
`/Users/jinan/side-project/omot-large-demo` 로 `init → bootstrap → validate →
MCP verify → web /docs + /ontology + /topology`를 실제 수행했다. 발견한 문제:
`analyze`가 FSD marker만 보고 `src/features/*.js` 파일형 feature를 노드로 만들지
못했고, `infer-imports`가 만든 edge endpoint가 vault에 없어 bootstrap이 깨질 수
있었다.

- `bootstrap`이 import graph endpoint를 먼저 capability/domain 노드로 생성한 뒤
  `depends_on`을 적용한다. 단일 파일 feature slug는 `.js/.ts` 확장자를 제거한다.
- import로 만든 capability는 project→domain→capability containment로 연결해 웹
  ontology tree의 다중 부모 warning 없이 프로젝트 아래에 붙는다.
- 웹 `deriveOntologyFromVault`가 `domain: domains/foo`,
  `dependencies: [capabilities/bar]`, `contains: [capabilities/bar]` 같은
  folder-prefixed ref를 CLI/MCP와 같은 node id로 해석한다. 19 docs가 31 nodes로
  부풀던 중복 unknown/stub 문제가 사라졌다.
- 회귀 테스트 추가: 단일 파일 layered repo bootstrap, single-file feature import
  slug, folder-prefixed frontmatter ref 해석.

## 2026-05-09 — Clean onboarding bootstrap polish

Fresh user setup now covers the full `init → bootstrap → validate → MCP
register` journey. `analyze --apply` and `bootstrap` remove untouched `init`
starter examples before real repo-derived nodes land, while preserving any
starter file the user already edited. The clean onboarding smoke uses isolated
`HOME` and `CODEX_HOME`, confirms Codex starts with no MCP servers, then
registers the printed command.

CLI help now matches the current setup contract: auto-prefix is default,
`--raw-slug` is the opt-out, `init` writes real `.mcp.json` files for
Claude/Cursor, and Codex needs the printed `mcp add` command.
`init` also prints copy-pasteable repo-root bootstrap commands
(`oh-my-ontology analyze . --vault ./ontology` and `bootstrap . --vault
./ontology`) instead of placeholder `/path/to/your/repo` examples.

### Docs first-time path and route drift cleanup

The `/docs/?intent=local` first-time path now has E2E coverage for the
`docs/ontology/` dogfood hint. README and PRODUCT-DIRECTION were realigned with
the current route/tool surface: `/ontology/relations` is no longer listed as a
live route, MCP is 20 tools, and the dogfood vault count is 26 nodes.

### Launch copy current-surface guard

Launch drafts, publish notes, and README setup copy now describe the current
MCP/onboarding contract: 20 tools, generated `.mcp.json` files for Claude
Code/Cursor, Codex's printed `mcp add` command, and the 26-node dogfood vault.
A unit test blocks stale launch claims such as "12 tools", old dogfood demo
counts, and obsolete test totals from returning to current-facing docs.

### Starter vault agent setup parity

The starter vault README now spells out both AI-agent setup paths: generated
`.mcp.json` for Claude Code/Cursor and the explicit `codex mcp add` command for
Codex. Web workbench starter content and CLI templates are now covered by a
byte-for-byte parity test, so the two onboarding surfaces cannot drift silently.

### Local vault change toast coverage

`VaultDiffToaster` now delegates toast planning to a pure helper. Unit coverage
locks added/modified classification, null `mtime` skip behavior, removed-node
silence, preview ordering, and overflow copy so local vault polling can keep
showing concise external edit feedback without brittle component-only logic.

### Web E2E modernization

Playwright E2E was realigned to the current local-first, locale-prefixed
surface. Stale `/login`, `/knowledge`, `/review/*`, and `/project/sample`
expectations were replaced with `/en` routes, the dogfood `oh-my-ontology`
project, local vault picker copy, and static topology smoke. Full browser E2E
now passes (`27 passed`), and the accessibility structure audit reports zero
findings after adding the ontology page main landmark and demoting rendered
markdown document H1s inside the Docs Vault page.

## 2026-05-07 — Round 18: AI agent UX 강화 루프 — read shape · batch tools · vault health · ARIA tree · CLI --apply

자율 개선 루프 ~30 PR. **mcp 16→20 tools (read 10→12, write 6→8), cli 13→15 commands, /ontology-bootstrap round-trip ~25→3**. agent (Claude Code · Cursor · Codex) 가 적은 호출로 더 정확한 vault sync, 사용자가 키보드만으로 tree 완전 항해, agent-less CLI 도 batch parity.

### MCP — read tool 응답 shape 완전 일관 (#176 #180 #183 #186 #189 #191 #194 #195 #196)

read tool 5종 (`list_concepts` · `find_backlinks` · `find_orphans` · `query_concepts` · `find_evidence`) 매치 row 가 모두 같은 shape: `{ slug, kind, title, domain, mtime, ...specific }`. agent 가 어느 read tool 결과든 동일 sort/filter 로직 재사용 — staleness 감지 (mtime), 도메인 필터 모두 후속 `get_concept` 없이.

- `list_concepts`: `domain` 필터 (kind 결합), `since` 필터 (mtime-based incremental sync), 각 row `mtime`, `summary: true` opt-in (prose 미리보기 N+1→1 호출).
- `get_concept`: excerpt 가 *prose-aware* (heading/표/코드/리스트/인용 skip). dogfood `mcp-server.md` excerpt 800ch (table syntax) → 78ch (clear summary).
- 에러 메시지가 *actionable* — "Did you mean: ..." suggestion + 다음 액션 한 호출에 결정.
- `find_path` 응답에 `edges[via]` 추가 — agent 가 *왜* A↔B 가 연결됐는지 (어느 frontmatter key 가 link 했는지) 한눈에.

### MCP — 배치 도구 3개 + vault health 신규 (R+, 16→20 tools, #197 #198 #199 #220)

- **`get_concepts`** (read 11번째) — 입력 `{slugs: string[]}` (max 50), 출력 `{concepts: [...]}`. K round-trip → 1, partial result (missing slug 은 row-level `ok: false`).
- **`add_concepts`** (write 7번째) — 배치 노드 작성. 입력 *내* 중복 slug 사전 감지로 명료한 에러 ("duplicate slug in input batch"), atomic rollback 없음 (partial 시맨틱).
- **`add_relations`** (write 8번째) — 배치 edge 작성. idempotent (동일 edge → `alreadyExists: true`), 50-row chunk 분할 가능.
- **`validate_vault`** (read 12번째) — vault 전체 health 를 한 호출에 반환. agent 가 `list_concepts` 후 K개의 `get_concept` 경고를 모으는 패턴을 1 round-trip 으로 대체.

이로써 `/ontology-bootstrap` 흐름이 `analyze_repo_structure → add_concepts → add_relations` **3 round-trip 으로 완결** (이전 ~25). skill 본문 (`#200`) 도 새 도구 사용 가이드로 갱신.

### Tree — full ARIA tree 키보드 패턴 (#188 #190 #201 #202)

`/ontology` · `/` 페이지의 tree widget 이 W3C WAI tree role 표준 키 셋 완전 정합:

- **↑/↓** — 다음/이전 visible row focus
- **←/→** — collapse/expand
- **Home/End** — 첫/마지막 row (Cmd/Ctrl/Alt 모디파이어 무시 — 브라우저 스크롤 보존)
- **type-to-search** — 라틴/한글/숫자 1글자, 600ms 누적 buffer, wrap-around, 같은 char 반복으로 advance
- **← (leaf 또는 이미 접힘)** — parent row focus (depth-based walk-back)

기존 Tab 흐름은 그대로 유지 — additive layer.

### CLI — agent-less full bootstrap (#203 #204)

agent (Claude Code 등) 없는 환경 (CI · plain shell) 도 1줄로 vault 부트스트랩:

```bash
oh-my-ontology analyze . --apply       # 노드 batch land (add_concepts + add_relations)
oh-my-ontology infer-imports . --apply # depends_on edges land (50-row chunk)
```

`--apply` 미지정 default 는 read-only — \"git push --force\" UX 로 명시적 opt-in. partial result ("N landed · M already existed · K errors"), `--json` 시 머신 가독, 두번째 실행 idempotent.

### CLI — graph-level 명령 보강 (#182 #192 #193)

- `validate` — grouped-by-code 요약 섹션 (큰 vault 가독성)
- `orphans` — `find_orphans` MCP wrapper (15번째 명령)
- `path` — 회귀 fix 재도입 + `edges[via]` CLI 노출

### /topology 사용성 (#173 #174 #185)

- 도메인·고연결 ontology 노드 라벨 항상 노출, multi-parent self-warning 침묵 (시각적 noise 차단)
- ontology 노드 클릭 → 빈 drawer 대신 `/ontology` ego graph 로 라우팅
- edge dedup · `?` 키 글로벌 검색 충돌 fix · 모바일 truncate 회귀 일괄 정리

### Skill / Docs / Dogfood (#178 #179 #181 #200 #205)

- MCP `instructions` 필드 — agent 가 첫 메시지부터 정확한 가이드 (kind 계층 · 첫 호출 순서 · dry-run + confirm 패턴 · `expected_mtime` conflict guard)
- AGENTS.md / README.md / docs/FEATURES.md / mcp/README.md — tool count + read/write 분포 일괄 동기화 (16→19 흐름 따라 매 cycle)
- `/ontology-bootstrap` skill — 본문이 새 batch 도구 사용으로 갱신, CLI fallback 도 `--apply` 짝으로 batch parity
- dogfood `capabilities/cli-developer-entry` — 11→15 명령, --apply 반영 (cycle 동안 stale)

### 측정

| 지표 | R17 끝 | R18 끝 |
|---|---|---|
| MCP 도구 | 16 (read 10 + write 6) | **20 (read 12 + write 8)** |
| CLI 명령 | 13 | **15** |
| `/ontology-bootstrap` round-trip | ~25 | **3** |
| 전체 vitest | ~810 | **839** |
| MCP integration test | 14 | **24** |
| CLI integration test | 32 | **49** |
| stale tool count refs | 5 docs | 0 |

## 2026-05-06 — Round 17: `infer_imports` — TS/JS import graph → depends_on edges

R16 의 `analyze_repo_structure` (heuristic 후보) 의 *강력한 짝*. 코드의 *진짜 import graph* 를 자동 추출해 `depends_on` 관계 후보로. mcp v0.8.0 → v0.9.0 (15 → 16 tools), cli v0.4.0 → v0.5.0 (12 → 13 명령).

### MCP `infer_imports` (16번째 tool)

- TS/JS file 들 (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`) walk + regex parse
- import 종류 6 — static / dynamic `import()` / `require()` / `export ... from` / side-effect `import "X"` / type-only
- 상대 경로 (`./` `../`) → 실 파일 resolve (확장자 + `index.*` fallback)
- **`@/*` path alias** convention 자동 resolve (Next.js / FSD 의 80%+ case)
- external (npm) 분리, unresolved 분리 (`relative-not-found` / `alias-not-found`)
- **module-level edge collapse** — capability/feature folder 간 import 합산 (FSD bucket 인식: `features/X` / `entities/X` / `widgets/X` / `views/X`)

응답: `{ rootPath, filesScanned, edges[], externalImports[], unresolved[], moduleEdges[] }`. side effect 0.

### Validated — Paravel real-codebase

사용자 본인 React Native + Expo + FSD 1.8 GB:

| 측정 | 값 |
|---|---|
| files | 304 |
| edges | **837** (이전 R17 미적용 시 355 → alias resolve 로 2배+) |
| external (npm) | 506 |
| unresolved | 0 |
| **module edges** | **103** |

상위 module edges:
- `screens → shared` × 98
- `app → screens` × 22
- `features/diary → shared` × 18
- `features/create-post → entities/post` × 6
- ... 87 more

FSD layering 정확 자동 추출. 사용자 본인이 *수동 add_relation* 으로 그릴 그래프를 *코드에서 자동* 산출. **mission *"완벽에 가깝게 그래프 생성"* 의 다음 큰 step**.

### CLI `infer-imports` 명령 (13번째)

mcp child_process spawn wrapper. `--max-files N` / `--json`. 사용자 본인 daily 로 `oh-my-ontology infer-imports` 한 줄 → 이 codebase 의 *진짜 의존 관계* 표시.

### 단일 source of truth 보존

- 결과는 **return only** — vault frontmatter 절대 안 건드림
- 사용자 / agent 검토 후 *명시 `add_relation depends_on`* 만 진입
- 별도 cache / index 0
- drift surface 0

### Tests

- 8 unit case — relative / external / alias / dynamic+require+reexport / module collapse / unresolved / ignored folders / side-effect
- mcp 29 → **37 tests** (R17 8 추가)
- cli integration 32/32 (회귀 0)

### Mission align

R16 *analyze_repo_structure* 가 *kind 후보* 자동, R17 *infer_imports* 가 *관계 후보* 자동. 둘이 합쳐 사용자 한 번 호출 = 30+ 노드 + 100+ 관계 candidate. *기가막히게 잘해줘서 완벽에 가깝게 그래프* 의 base 둘 다 land.

---

## 2026-05-06 — Round 16: 자율 ingest base — `analyze_repo_structure` 첫 도구

사용자 grill-me 결정 (Q1: AI 자동 ontology 화 / Q2: 자율 ingest from codebase 가 가장 critical 약점). *"MCP 가 잘 되면서 온톨로지화를 기가막히게"* + *"단일 source of truth 보존"* 의 첫 step.

### MCP `analyze_repo_structure` (15번째 tool, mcp v0.7.1 → v0.8.0)

사용자 한 줄 *"이 codebase 분석해줘"* 후 AI agent (Claude Code, Codex, Cursor) 가 호출할 *deterministic helper*. **side effect 0** — vault frontmatter 절대 안 건드림, 후보만 return:

- `package.json` `name/description` → project candidate
- `README.md` 첫 H1 → project title fallback
- `README.md` H2 sections (Usage / Installation / Tests 등 generic skip) → domain candidates
- `src/features|entities|widgets|views/*` (FSD) 또는 `src/*` (generic) → capability/element candidates
- `suggestedRelations` — project contains 각 capability

응답 shape: `{ rootPath, framework, project, domains[], capabilities[], elements[], suggestedRelations[], skipped[] }`. 사용자 검토 후 *명시 add_concept / add_relation* 만 vault 진입 → **단일 source of truth 보존**.

### CLI `analyze` 명령 (cli v0.3.0 → v0.4.0, 11 → 12 명령)

mcp child_process spawn wrapper. 동일 contract — color CLI / `--json` / `--max-depth`. publish 후 `npx oh-my-ontology analyze` 한 줄로 분석.

### Tests + dogfood

mcp/src/analyze.test.mjs — 7 unit case (FSD / generic / no package.json / generic README skip / ignored folders / empty dir / suggested relations). dogfood `capabilities/mcp-server.md` 갱신 (15 tools, analyze.mjs element 추가). AGENTS.md *"빈 vault bootstrap"* 섹션 영문 + 한국어 추가.

### Mission align

이전 — 사용자가 `init` 후 *수동 add* 25 회 (Paravel real-codebase dogfood 측정). *첫 user Aha moment* 부족.
이후 — agent 가 한 번 `analyze_repo_structure` → 30+ 후보 즉시. 사용자 검토 + 1-clicks add_concept 다발 호출. *기가막히다* 의 base.

### R16 follow-up — `/ontology-bootstrap` skill

`/ontology-sync` (이미 자란 vault 의 incremental sync) 의 cold-start 짝. agent 한 줄 사용자 의도 ("이 codebase 분석해줘") → `analyze_repo_structure` → 5 줄 요약 → yes/pick/refine 분기 → `add_concept` / `add_relation` 다발 → 마무리 census diff.

- `.claude/skills/ontology-bootstrap/SKILL.md` 신설 — agent prompt 수준에서 흐름 orchestrate. 진입은 `add_concept` 만 → 단일 source of truth 보존
- AGENTS.md 의 *빈 vault bootstrap* 섹션 (영문 + 한국어) 갱신 — skill cross-ref
- dogfood `capabilities/ontology-bootstrap-skill` (26번째 노드) + `domains/ai-agent-partner.capabilities` endorse

vault 25 → 26 노드 (capability 14). orphan 1 (의도적 project) / drift 0 / validate clean.

### 다음 step (R18 후보)

- `extract_domains_from_readme` (heading 계층 + body 분석 deeper)
- agent 의 *implicit detect* 강화 (작업 중 자율 sync, b2 단계)
- `/ontology-bootstrap` skill 의 infer-imports 단계 통합 (analyze → infer → add 다발)

---

## 2026-05-06 — Round 15 follow-up #2: Project type honest (Concern 1 fix)

post-publish architectural audit (Plan agent advisor) 의 *blocking* Concern 1 fix. **`Project` 18 fields silent fabrication** — vault frontmatter 4 fields ↔ web 18 fields *두 source-of-truth*. `deriveProjectsFromVault` 가 fabricated default (`category: 'uncategorized'` / `status: 'active'` / `isHub: false` / `position: { x:0, y:0 }`) 을 박아 web 이 *vault 가 가지지 않은 정보* 를 표시. README *"frontmatter is the graph"* 약속과 충돌.

### 변경 — Project type 정직화

`src/entities/project/model/types.ts`:

| field | before | after |
|---|---|---|
| `category` | required | **optional** (vault frontmatter `category:` 명시 시만) |
| `status` | required | **optional** |
| `isHub` | required `boolean` | **optional** (vault `isHub: true` 명시 시만 true. false fabrication 차단) |
| `position` | required `ProjectPosition` | **optional** (vault `position:`/`positionX/Y:` 명시 시만) |
| `timeline` | required `ProjectTimeline` (often `{}`) | **optional** (`startedAt`/`launchedAt` 명시 시만) |

각 field 에 JSDoc *"vault frontmatter X 에서 derive. 없으면 undefined."* 명시.

### derive 함수 — silent fabrication 제거

`deriveProjectsFromVault` (src/entities/docs-vault/lib/derive-projects-from-vault.ts):
- `category: fm.category || 'uncategorized'` → frontmatter 명시 시만 string, 없으면 `undefined`
- 동일 패턴 — `status` / `isHub` / `position` / `timeline` 모두 honest. *empty 가 아니면 undefined*.

### Callsite 정리 (legacy fabrication 명시화)

20+ files 의 callsite 가 fabricated default 가정 — type level 변경으로 ts errors 발생. 일관 전략:
- *form-local default* (`ProjectInput` / form schema 등 사용자 vault frontmatter 작성 도구) — `?? 'uncategorized'` / `?? 'active'` / `?? { x:0, y:0 }` 적용. form 진입 시 default 채움 → frontmatter 에 기록 → 다음 derive 부터 honest.
- *integrity check* — frontmatter 가 명시 안 한 건 issue 아님 (사용자 의도). 명시됐는데 taxonomy 에 없으면 issue.
- *placement / topology* — undefined position 은 *원형 자동 배치* fallback (이전엔 fabricated `{0,0}` 으로 모든 노드 원점에 겹쳤음).
- *ProjectCard / SearchPalette / graph-build* — `Boolean(project.isHub)` 으로 narrow.

### TaxonomyProvider signature 변경

`categoryLabel: (id: string) => string` → `(id: string | undefined) => string`. undefined 이면 `'—'` (em-dash) placeholder. fabricated `'uncategorized'` 라벨 보다 honest.

### Test

derive test — `isHub 없으면 false` → `isHub 없으면 undefined` (R15 honest 명시). 814/814 unit, 32/32 cli integration, vault 25 nodes clean, 17 lint warnings (17 floor 그대로), build OK.

### Mission align

이전 — vault 4 fields, web 18 fields → README *"frontmatter is the graph"* 약속 violation. AI agent 가 `add_concept(kind:'project')` 해도 web 에선 placeholder taxonomy 로 렌더.
이후 — vault 가 가진 만큼만 web 에 표시. *honest second-source-of-truth 제거*. AI agent 가 만든 노드와 web 의 표시가 *정확히 일치*.

---

## 2026-05-06 — Round 15 follow-up: CLI graph-level 5 명령 (Concern 4 fix)

post-publish architectural audit (Plan agent advisor) 발견 *blocking* concern — **CLI 6 vs MCP 14 ergonomic asymmetry**. 개발자가 *위험한-그러나-필수* 작업 (rename / merge / delete / query / backlinks) 을 *AI agent 통해서만* 할 수 있어 mission *"developer + AI agent grow together"* inversion. 이 PR 이 fix.

### CLI 5 graph-level 명령 추가 (cli v0.2.0 → v0.3.0, 6 → **11 명령**)

| Command | Wraps MCP tool |
|---|---|
| `backlinks <slug>` | `find_backlinks` |
| `query "<filter>"` | `query_concepts` (typed DSL) |
| `rename <old> <new>` | `rename_concept` (dry-run + --confirm) |
| `merge <from> <into>` | `merge_concepts` (dry-run + --confirm) |
| `delete <slug>` | `delete_concept` (dry-run + --confirm + --force) |

### Implementation — `cli/src/lib/mcp-call.mjs` (single source of truth via spawn)

새 명령들은 MCP server child_process spawn + JSON-RPC 로 호출. mcp 가 *진실원*, cli 는 thin wrapper. drift surface 0 (logic 복제 안 함). spawn overhead ~50-100ms per call — 한 번씩 호출이라 acceptable.

- mcp entry resolution: `OMOT_MCP_PATH` env → `require.resolve('oh-my-ontology-mcp/src/index.js')` → monorepo dev fallback
- `cli/package.json` 에 `dependencies: { "oh-my-ontology-mcp": "^0.7.1" }` 명시 — npm install 시 mcp 자동

### Mission align

이전 — cli 는 *온톨로지 노드 만들기* (init/add/import) 까지만, *그래프 변경* 은 mcp-only. AI agent 가 *유일한 ergonomic write surface* 였음. 이제 — cli 가 mcp 와 *동등 권한*. 사용자가 본인 daily 로 rename/merge/delete 사용 가능.

### Tests

cli integration **24 → 32** (+8 new):
- backlinks 컬러 + JSON
- query DSL filter
- rename dry-run + --confirm + backlink redirect 검증
- delete backlinks 가드 + --confirm
- merge dry-run preview

### Dogfood vault

`capabilities/cli-developer-entry.md` 갱신 — 6 → 11 명령, 5 element 추가 (backlinks/query/rename/merge/delete + mcp-call helper).

---

## 2026-05-06 — Round 15: VSCode plugin 제거 — AI-agent 터미널 시대로 진입점 단순화

R14 closeout (PR #164) 후 사용자 명시 — *"vscode plugin 은 없어도 될 듯. 이제 대부분 vscode 안 쓰고 claude code / codex 를 사용하지"*. R13 에서 v0.1.0 → v0.9.0 까지 키운 4번째 surface 통째 제거. 4 surface (CLI · MCP · Web · VSCode) → **3 surface (CLI · MCP · Web)**.

### 왜 제거?

- **daily driver 변화** — 사용자 본인을 포함한 *primary audience (developer)* 가 일상 IDE 를 Claude Code / Codex 같은 AI-agent 터미널로 전환. VSCode 자체 점유율 감소.
- **가치 중복** — VSCode plugin 의 4 surface (TreeView / 코드↔ontology 점프 / Add concept / Backlinks panel) 가 모두 *MCP (AI agent) + CLI (developer terminal) + Web (그래프 시각화)* 의 조합으로 같은 가치 cover. graph webview 는 R13 #67 (v0.9.0) 에서 이미 *웹의 강점 영역으로 위임* 결정.
- **유지비 감소** — 매 PR 마다 4-layer 자동 검증 (단위 27 / MCP integration 3 / VSCode integration 5 / vsce package gate) + 5-way parser contract (12 fixture × 5 = 60 case) 부담. 3 surface 로 회복하면 4-way (12 × 4 = 48 case) 로 단순화.

### 제거 범위

- `vscode-plugin/` 폴더 통째 (15+ 파일, ~3000 LOC, v0.9.0 vsix 포함)
- `tests/contract/parse-frontmatter.contract.test.ts` 5-way → 4-way (vscode parser import 제거)
- `.github/workflows/ci.yml` 의 "VSCode plugin — install + test + e2e + package" step 제거 (xvfb-run + @vscode/test-electron + vsce package)
- dogfood vault: `capabilities/vscode-plugin-ide-entry.md` 삭제 + `domains/onboarding-ux.capabilities[]` 에서 endorse 제거 → 26 → 25 노드
- README / AGENTS.md (영문 + 한국어) / PRODUCT-DIRECTION 의 "(planned) VSCode plugin" / "VSCode plugin v0.1.0 MVP" / "4 surface" 표기 정리

### 보존 (재도입 시 root)

- 코드 자체는 git history 에 보존 (R13 wave PR #49-#67 commits). 미래 VSCode 재도입 결정 시 `git revert` 또는 cherry-pick 가능.
- `docs/CHANGELOG.md` R13 항목은 그대로 보존 — *역사적 사실* 이고, "한 번 빌드했다가 daily driver 변화로 제거" 결정 자체가 product call 기록.

### Surface 표 갱신

| Surface | 진입 | 상태 |
|---|---|---|
| **CLI** | `oh-my-ontology init / list / validate / add / find / import` | v0.2.x (6 명령) |
| **MCP** | 14 tools (8 read + 6 write) | v0.7.1 |
| **Web** | `/`, `/topology`, `/docs`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/projects`, `/project/[slug]` | R10 surface diet 후 |
| ~~VSCode plugin~~ | ~~status bar match · backlinks · add concept · MCP connect~~ | **제거 (R15)** |

→ "개발자가 어디 있든 같은 vault" 약속은 그대로 — *AI agent 터미널 (Claude Code · Codex · Cursor)* 이 IDE 역할을 흡수하며 VSCode plugin 의 일상 사용 가치가 자연스럽게 0 으로 수렴.

### CLI `init` 의 mcp 등록 마찰 1 step 제거

3 surface 의 onboarding 단순화 후속. 이전엔 `init` 이 `.mcp.json.example` 만 생성 → 사용자가 cp 해야 했음. 변경:

- `.mcp.json` 자체를 직접 생성. 사용자가 vault 폴더를 AI agent 에서 열면 *cp 단계 없이* 14 tools 즉시 등록.
- 기존 `.mcp.json` 보존 + `.mcp.json.example` 별도 (수동 merge 가능).
- `OMOT_VAULT` absolute → **relative `.`** (portability).

```diff
- npx oh-my-ontology init my-vault
- cd my-vault
- cp .mcp.json.example .mcp.json   # 마찰 1 step
- # AI agent 재시작
+ npx oh-my-ontology init my-vault
+ cd my-vault
+ # AI agent 즉시 인식
```

---

## 2026-05-05 — Round 14: AI agent ↔ vault 자동 sync + 웹 즉시 반영 + frontmatter schema

R13 closure 후 *"개발자와 AI agent 가 같이 키운다"* 미션의 자동성 강화. 두 갈래 — agent 가 vault 를 알아서 읽고/쓰고, 그 변화가 웹에 즉시 흘러오고. 9 PR 묶음 (#155-#163).

### Web 즉시 반영 — polling → 그래프 pulse → 두 toast (#155 #156 #157 #158)

사용자 명시 *"웹에서나 잘 반영되면 좋겠는데? 그걸 강화하는건 어때"* 의 4 단계 완성.

| Step | What | Where 인지 |
|---|---|---|
| #155 polling | 5s 간격 fingerprint check + visible-only 자동 reload | 백그라운드 |
| #156 graph diff pulse | 새 노드 amber sine 5s | `/topology` 그래프 |
| #157 added toast | `Added: <slug>` info toast | 모든 페이지 |
| #158 modified toast | `Edited: <slug>` success toast (mtime 변화) | 모든 페이지 |

이제 IDE / AI agent / CLI 어느 surface 가 vault 만지면 웹 탭 *focus 안 해도* ~5s 안에 그래프 + toast. `prevSlugsRef Set` → `prevMapRef Map<slug, mtime|null>` 로 확장해 added/modified 분기. static manifest (mtime null) 은 비교 skip 으로 false-positive 차단.

- `use-local-vault.ts` — `setInterval(tryReload, 5000)` visible-only, hidden 시 dispose
- `widgets/topology-map-sigma` — `runtimeRecentSlugs` 5s set, 기존 `recentPulse` 인프라 재사용
- `features/docs-vault-local/model/VaultDiffToaster.tsx` 신설 — 첫 mount baseline, 이후 added/modified 분류, PREVIEW 3 + "+N more"
- 사용자 검증 단계: dev server → IDE 에서 `oh-my-ontology add` 또는 `.md` 편집 → 5s 안 toast + 그래프 pulse

### Walkthrough 검증 + topology↔ontology 회복 (#159)

R14 walkthrough 에서 발견된 4 이슈 + 사용자 약속한 topology↔ontology 연계 회복.

- **i18n 404** — `app/[locale]/not-found.tsx` 추가, client-side locale 감지로 ko/en 분기. 이전엔 정적 export 한계로 `/ko/foo` 가 영문 fallback 만 떴다.
- **home UX 간격** — 좌하단 hint 카드와 stats bar 가 거의 붙어 있던 것을 `bottom-14` → `bottom-20` 으로 24px gap. 데이터 경고 alert 에 `ChevronRight` affordance.
- **stale doc** — AGENTS.md / .claude/rules/architecture.md 의 살아있는 라우트 목록에서 `/ontology/relations` 표기 제거 (R12 에서 사라졌고 분포 정보는 `/ontology/insights` 안으로 통합).
- **🚨 topology↔ontology 연계 회복** — `/topology` 가 dogfood 환경에서 *"1 노드 · 0 엣지"* 빈 화면이었던 회귀를 회복. `buildGraph` 에 `ontologyExtension` 옵션 추가, vault frontmatter 의 도메인 / 역량 / 요소 노드와 그 관계까지 같은 그래프에 그림. `isOntology` 플래그로 size scaling / owner overlay 분기에서 제외 → project 본 골격 보존. 결과 1 노드 → **68 노드 · 112 엣지** 로 회복.

### Frontmatter schema 양식 — three entry points 동기화 (#160)

사용자 질문 *"AI agent 가 같은 양식으로 작성하게 인식 가능한 구조"* 의 1차 답변. 두 진입점 (`add_concept` MCP · `add` CLI) 이 같은 schema 모듈을 통해 .md 만들고, 같은 advisory warnings 노출.

이전: `cli/templates/vault/` 에 kind 별 견본은 있었지만 `cli init` 만 사용. `add_concept` / `cli add` 는 `slug + kind + title` 만 박고 arrayDefaults 미채움 → AI agent 가 만든 capability 가 `elements: []` 슬롯조차 없는 .md 로 disk 에 남았다.

- **`mcp/src/schema.mjs` · `cli/src/lib/schema.mjs`** — single source. kind 별 `arrayDefaults` (project: domains/capabilities/elements, domain: capabilities, capability: elements), `requiredExtras` (capability/element 의 domain), `folder`, kind 별 starter body. 두 파일 lock-step.
- **3-way validator** 가 새 issue code `missing-expected-field` 동시에 인식. severity=warning (error 아님) → pre-existing vault 호환 보존.
- **Contract test** `tests/contract/vault-schema.contract.test.ts` — mcp/cli 두 schema 가 같은 결과 + UI 측 `KIND_EXPECTED_EXTRAS` 일치 강제.

### CLI `import` — 외부 .md schema 정규화 후 vault 정착 (#161)

#160 위에 분기, 사용자 약속의 *"우리 양식을 주면 그대로 작성해서 md import"* 답변. 세 진입점 (`add_concept` MCP · `add` CLI · 새 `import` CLI) 이 모두 같은 schema 모듈 통해 .md 만든다.

```bash
oh-my-ontology import <path...> [options]
  --vault path          target vault root (default: cwd)
  --kind K              fallback kind when input has no frontmatter kind:
  --auto-prefix         kind→folder (capability → capabilities/)
  --rename              slug clash 시 -2 / -3 ... 자동 회피
  --dry-run             디스크 변경 0, plan 만 출력
```

처리: `parseFrontmatter` → kind/slug/title resolve (입력 frontmatter > flag > basename) → `buildFrontmatter` → 충돌 detect → `writeDoc`. 입력의 다른 키 (depends_on / 사용자 정의 …) 보존, 빈 body 면 schema starter. `.git` / `node_modules` / dotfile 디렉토리 walk skip.

cli integration test 13 → **20 case**. cli `init / list / validate / add / find / import` **6 명령** 으로 확장.

### `/ontology-sync` agent skill + AGENTS read-while-coding 룰 (#162)

사용자 의도 *"AI agent 가 작업 중간 ontology 읽어서 도움받고, 끝나면 알아서 vault 에 기록"* 의 자동성 강화.

- **AGENTS.md 의 'Working with the ontology while you code' 섹션** 추가 — Read at start (`list_kinds` / `list_concepts` / `get_concept` / `find_backlinks` / `find_path`) + Write at end (`add_concept` / `add_relation` / `rename_concept` / `merge_concepts` / `patch_concept`) + skip 케이스 (typo, style, fixture). agent 시스템 prompt 수준에 박혀 매 prompt 활성.
- **`.claude/skills/ontology-sync/SKILL.md`** — `/ontology-sync` slash command. 사용자 명시 invoke 시 git diff + 컨텍스트로 ontology delta 식별 → MCP write 도구로 반영. reply 5 줄 max, failure mode 4 종 (duplicate slug / dangling parent / mtime conflict / backlink rot) cover.

Demo: 자연 prompt — *"password reset 추가하려고 plan"* — 만으로 agent 가 11 → 13 노드, frontmatter R14 양식 정확, validate 0 issue 로 자율 작성. 사용자가 "ontology" 단어 0 회 사용.

### SessionStart hook — vault 요약 자동 inject (#163)

#162 의 후속. 명시 호출 없이 *읽기 면* 활성. Claude Code 가 vault 있는 repo 에 attach 하면 한 번 census 를 system context 에 자동 inject — agent 가 매 prompt message #1 부터 ontology 인지.

vault 결정 우선순위: `OMOT_VAULT` env → `<cwd>/docs/ontology` → `<cwd>/vault` → cwd 의 `kind:` 가진 `.md` → 못 잡으면 silent exit. **vault 없는 repo 에서 noise 0**.

| 진입점 | 시점 | 효과 |
|---|---|---|
| **SessionStart hook** (#163) | 새 세션 시작 시 1회 | vault 인지가 message #1 부터 |
| **`/ontology-sync` skill** (#162) | 사용자 명시 invoke | git diff 기반 변경 추출 + write back |

암시적 + 명시적 두 갈래 활성. 메타 검증: dogfood vault 가 자기 자신의 새 hook 을 자기 ontology 에 자율 박음 — *"방금 추가한 SessionStart hook, ontology 에 sync 해줘"* 한 줄에 24 → 25 노드, dependencies/relates 자동 추론.

### Dogfood vault 갱신

R14 의 새 capability 2 노드 추가:
- `capabilities/ontology-sync-skill` (`.claude/skills/ontology-sync`)
- `capabilities/session-start-ontology-context` (`.claude/hooks/inject-ontology-summary.sh`)

23 → **25 노드** (capability 13 · domain 6 · element 4 · project 1 · vault-readme 1). `pnpm vault:validate` clean.

### 4 surface 모두 작동

| Surface | 진입 | 상태 |
|---|---|---|
| **CLI** | `oh-my-ontology init / list / validate / add / find / import` | v0.2.x (6 명령) |
| **MCP** | 14 tools (8 read + 6 write) | v0.7.1 |
| **Web** | `/`, `/topology`, `/docs`, `/ontology`, `/ontology/edit`, `/ontology/insights`, `/projects`, `/project/[slug]` | R10 surface diet 후 |
| **VSCode plugin** | status bar match · backlinks · add concept · MCP connect (graph webview R13 #67 에서 제거) | v0.9.0 |

→ "개발자가 어디 있든 같은 vault, 같이 자라남" 의 read 자동 + write 자동 + 즉시 반영 까지 도달.

---

## 2026-05-04 — Round 13: AI agent quality 첫 측정 + VSCode plugin MVP

R12 closure 후 *제품 핵심 가설* 첫 측정. 측정 결과 강한 confirming evidence 위에 README 약속의 미완성 surface (VSCode plugin) 첫 구현.

### AI agent quality benchmark (#47, #48)

`docs/benchmark/` 신설 — 7 task × 3 카테고리 (cross-cutting / semantic / negative-control), Claude Code + Codex 양 agent. Claude Code 자동 측정 (mcp/src/index.js spawn JSON-RPC), Codex 자동 측정 (codex exec). Codex 는 사용자 명시 승인 후 `--dangerously-bypass-approvals-and-sandbox` 로 진짜 MCP 실행.

**Cross-agent 결과 (n=2)**:
- **Claude Code**: MCP 가 hallucination 제거 — Cat A hallucinations 9 → 0, correctness +1.0
- **Codex (bypass)**: MCP 가 efficiency — Cat A tool calls 7.0 → 1.67 (76% 감소), correctness 이미 saturated
- **두 agent 모두 negative control (Cat C) 통과** — raw read 적절한 task 에 ontology 도구 over-reach 안 함

→ MCP integration 가치가 *agent 별로 다른 mechanism* 으로 measurable. README "Verifiable promises" 표에 "AI agent quality measurement (cross-agent, n=2)" 행 추가.

### MCP `instructions` field (#45)

mcp v0.7.0 → v0.7.1. Initialize 응답에 시스템-prompt 수준 안내 surface — kind 계층 (project→domain→capability→element), 호출 순서, write 도구 dry-run/confirm 패턴, expected_mtime 충돌 가드. 모든 연결 agent (Claude Code, Cursor) 가 매 세션 시행착오로 학습하던 부분을 단번에 해소.

### VSCode plugin v0.1.0 MVP (#49)

`vscode-plugin/` 신설. README 가 약속해 둔 *(planned) VSCode plugin* 의 first MVP. Activity Bar entry + TreeView (vault 노드 kind 별 그룹화) + 노드 클릭 → .md 열기. workspace 의 `docs/ontology/` 자동 detect 또는 picker. `globalState` 영속.

**5-way parser contract 편입** — `vscode-plugin/src/parse-frontmatter.ts` 가 5번째 진입점. 12 fixture × 5 parser = 60 case 가 매 PR 마다 drift 차단. `tests/contract/parse-frontmatter.contract.test.ts` 가 5-way 로 확장.

dogfood vault 에 `capabilities/vscode-plugin-ide-entry` 추가 (23 노드).

### Scaffold drift 정정 (#46)

`cli/templates/vault/README.md` + `src/features/docs-vault-local/lib/ontology-starter.ts` 의 "12 tools / write 4" stale 표기 → "14 tools / write 6" + rename_concept · merge_concepts 명시. 신규 사용자 첫 README 거짓말 차단.

### VSCode plugin v0.2.0 → v0.5.0 (#50 #51 #52 #54 #55)

MVP 후 5 PR 으로 v0.5.0 까지 — practically complete + 자동 회귀 가드.

- **v0.2.0 코드 ↔ ontology 점프 (#50)** — 활성 editor 의 파일이 vault 노드와 매치되면 status bar 좌측에 노드 title (kind icon + 제목). 클릭 → `.md` 점프. 매치 우선순위: exact path > directory ancestor > capability.elements 배열, longest-specific 한 매치 우승.
- **v0.3.0 Add concept (#51)** — Command Palette / TreeView `+` 버튼. kind picker → slug → title → optional domain → vault 에 새 `.md` 작성 + tree refresh + 새 .md 자동 열림. CLI `add` 와 동일 contract (auto-prefix, duplicate throw).
- **v0.4.0 MCP server connect + Backlinks panel (#52)** — plugin 이 `mcp/src/index.js` 를 child_process 로 spawn, stdio JSON-RPC 로 통신. 두 번째 TreeView 'Backlinks (current file)' 가 매치 노드의 `find_backlinks` 결과 표시. MCP 실패 시 raw filesystem scan (`computeBacklinksLocally`) 으로 graceful fallback. `useMcp` 설정으로 끄기 가능.
- **v0.5.0 self-match + e2e (#54 #55)** — ontology `.md` 직접 열어도 그 노드를 매치 결과로 surface (status bar + Backlinks 자동). `@vscode/test-electron` 으로 headless VSCode 띄워 5 e2e (activation / commands / config / contributes) 자동 검증. CI 매 PR 마다 `xvfb-run npm run test:e2e`.

### 4-layer 자동 검증 (#53 #55)

| Layer | 검증 |
|---|---|
| 단위 logic | `node --test` × 27 case |
| MCP integration | spawn `mcp/src/index.js` × 3 case |
| VSCode integration | `@vscode/test-electron` × 5 case |
| Marketplace 준비 | `vsce package` (CI step) |

총 35+ case 자동 — plugin 깨지면 즉시 fail. 사용자가 vsix 직접 install 해 검증한 후 marketplace publish 결정.

### 4 surface 완성

- **CLI** — `init / list / validate / add / find` (v0.2.0, R12)
- **MCP** — 14 tools (v0.7.1, R11+R13)
- **웹 workbench** — `/topology / /docs / /ontology` 등 (R10 surface diet 후)
- **VSCode plugin** — 4 surface in v0.5.0 (R13)

> "개발자가 어디 있든 같은 vault, 같이 자라남" 미션의 모든 진입점이 처음으로 다 존재.

---

## 2026-05-04 — Round 12: developer-primary 방향 + CLI 5 명령 + dogfood graph 강화

R11 fire #25 의 사용자 명시 ("의미없는 작업은 하지말고, 그래서 우리 서비스의 핵심 기능이 뭔데? 이게 명확해야해") 후 *제품 본질* 영역으로 전환. 12 task close.

### Primary audience 결정 (#33)

> **One codebase, one ontology, that the developer and their AI agent grow together.**

PM-primary 결정 reverted. 이유: 비개발자 친화 surface 가 *bonus, not target*. developer 가 자기 codebase 의 *cost-low 작성자*, 그 AI agent 가 *진짜 매일 사용자*. 차별점 = "ontology 가 코드 옆에서, 같은 git repo 에서, 개발자+AI 가 같이 키운다."

PRODUCT-DIRECTION v3, README, AGENTS, FEATURES 모두 sync. Phase 4 PM polish dropped + replacement (VSCode plugin / CLI 확장 / AI dogfood).

### CLI 4 새 명령 (#32 #34 #35) — developer 매일 진입점

기존: `init` 하나만 (init 후 *터미널 진입점 0*). v0.1 → **v0.2.0**.

| 명령 | 동작 |
|---|---|
| `list [vault]` | 노드 표 (color + `--kind` filter + `--json`) |
| `validate [vault]` | frontmatter 5 issue codes (CI gate, exit 1 on errors) |
| `add <kind> <slug> --title=...` | 새 노드 scaffold (duplicate throw, `--domain --body --vault`) |
| `find <query> [vault]` | title/slug 부분매칭 + yellow highlight + `--kind` filter + `--json` |

`init` 의 next-steps 흐름도 5 단계로 갱신 — explore → add first node → edit project.md → wire AI agent → see graph (#36 walk-through audit fix).

### Cross-package contract 4-way / 3-way (#32 #27 후속)

cli 별도 npm package 라 cross-import 불가능 → contract test 가 effective 단일화. parser 4-way (src/shared · mcp · scripts/lib · cli) 12 fixture × 4 = 48 case. validator 3-way (src/shared · mcp · cli) 8 fixture × 3 = 24 case.

### AI agent dogfood walk + graph 완전화 (#38 #39)

`scripts/dogfood-mcp-walk.mjs` 신설 — spawn mcp + 5 read tool sequence (list_kinds / list_concepts / find_evidence / find_path / find_backlinks / find_orphans). *AI agent 입장* 정보 quality 측정.

🚨 **진짜 발견**: dogfood vault 21 노드 중 **8 (38%) orphan** — R11 신규 capability 3 모두 parent domain 의 frontmatter 에서 endorse 빠뜨림. *graph 가 아니라 list*.

조치 (2 fire):
- domains/ai-agent-partner.capabilities: + mcp-conflict-guard
- domains/vault-local-first.capabilities: + vault-validator + vault-migrator
- domains/{ai-agent-partner,views,vault-local-first}.elements: + slug 명시 (이전 path 매칭 안 됨)
- domains/views.relates: + onboarding-ux (양방향 endorse)

**결과**: orphans 8 → **1 (5%)**. 남은 1 = project (top-level meta, 의도적). dogfood graph 사실상 완전.

### 영구 가드 추가 (R11 8 → R12 10)

- 9. `dogfood-mcp-walk.mjs` — 미래 dogfood 추가 시 회귀 차단
- 10. `cli/src/integration.test.mjs` — 11 case spawn 기반 cli 회귀 가드 (#40)

### Tarball 정밀화

- mcp 28.5 → 28.5 KB / 9 files (R11 #29, R12 변경 0)
- cli 14.7 → 13.2 KB / 17 files — test 제외 (#42, mcp 패턴 reuse)

### 신규 file (R12)

- scripts/dogfood-mcp-walk.mjs (228 LOC)
- scripts/perf-vault.mjs (R11 #31, baseline)
- cli/src/commands/{list,validate,add,find}.mjs
- cli/src/lib/{parse-frontmatter,validate,walk-vault,write-vault}.mjs
- cli/src/integration.test.mjs (11 case)
- cli/CHANGELOG.md
- tests/contract/validate-vault-document.contract.test.ts (R11 #27, 3-way)

### Test count

- root: 759 (R11 R12 통틀어 +118 from 641)
- cli: 0 → **11**
- mcp: ~30+

### 다음 (R13 candidates, 신호 대기)

- VSCode plugin scaffold (developer-primary IDE 통합)
- xyflow ERD builder ROI 재평가 (PM drop 후)
- 모바일 / FS Access API lock-in
- AI agent 의 *진짜 답변 quality* 측정 (LLM 호출 시뮬)

---

## 2026-05-04 — Round 11: AI partnership 강화 (vault tooling + parser contract + MCP graph-level write)

분석 기반 1원칙 라운드. silent corruption / parser drift / schema 진화 부재 / AI agent
write 비대칭 4 갭을 한 번에 닫음.

### 신규 surface

- **`pnpm vault:validate`** — vault frontmatter silent corruption 가시화. unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys 5 종 issue 검출. R9 changelog Scenario 3 (lenient parser, defer 됐던 것) 의 작업자 측 길.
- **`pnpm vault:migrate`** — schema 진화 마이그레이션 패턴. dry-run default, `--write` 명시 시 디스크 기록. 첫 reference: `2026-05-04-trim-frontmatter-values`. `scripts/migrations/README.md` 가 작성 가이드.
- **MCP v0.7.0 — 14 tools (8 read + 6 write)**: `rename_concept` + `merge_concepts` 추가. 한 번의 atomic 호출로 slug 변경/노드 합치기 + 모든 backlink (frontmatter array · inline string · body link `[[slug]]` · `(slug.md)`) 자동 redirect. 이전엔 AI agent 가 `find_backlinks` + N 회 `patch_concept` 으로 직접 짜야 했던 graph-level 변형이 1 콜.

### 코드 / 아키텍처

- **3-way frontmatter parser contract** (`tests/contract/parse-frontmatter.contract.test.ts`): `src/shared/lib` (런타임) · `mcp/src/parser.mjs` (별도 npm pkg) · `scripts/lib/parse-frontmatter.mjs` (빌드+CLI) — mcp 가 npm publish 의도라 물리적 단일 모듈 통합 불가능 → 12 fixture × 3 parser = 36 case contract test 가 effective 단일화. drift 즉시 차단.
- `scripts/lib/parse-frontmatter.mjs` 신설 — `scripts/build-docs-vault.mjs` 와 `scripts/validate-vault.mjs` 가 공유. 빌드 스크립트의 inline parser 105 LOC 제거.
- `mcp/src/vault.mjs` 의 `redirectBacklinks(rootPath, fromSlug, toSlug, { dryRun })` helper 추가. rename / merge 의 공통 핵심. tail-only 매칭도 새 tail 로 일관 갱신 + dedup. 7 단위 test (`mcp/src/redirect-backlinks.test.mjs`).
- `.githooks/pre-push` + `package.json` postinstall 자동 wire — `tsc --noEmit` 강제. R10 이후 `adc2abb` 부터 4 commit 연속 main direct push 로 CI failure 무시되던 패턴 방지.

### Bug fixes

- **TS 회귀** `src/entities/project/model/to-input.test.ts:15,20` — 최근 추가된 test 가 `ProjectLink.url` 을 `href` 로 잘못 적었고 `Date` 를 string 으로 줘서 4 commit 연속 CI failure. `--noEmit` clean 으로 정정.

### MCP conflict 감지 (#8 MVP + #19 closeout)

- `get_concept` 응답에 `mtime` (ms) 추가.
- 모든 write 도구에 `expected_mtime` consistency: `patch_concept` / `delete_concept` (#8) + `add_relation` / `rename_concept` / `merge_concepts` (#19 closeout). read 시점 mtime 과 다르면 `VaultConflictError` throw. 사람 GUI · 외부 에디터 · 다른 AI MCP 가 같은 .md 동시에 만질 때 silent overwrite 차단.
- 옵션 미지정 시 검증 skip — 기존 호출자 호환.
- `mcp/src/conflict-detection.test.mjs` 8 단위 케이스. 도구 핸들러 통합 test 는 #20 후속.
- UI 측 (docs-vault-local) save 흐름의 동일 가드는 #15 후속 task.

### Vault 가드 CI 통합

- `.github/workflows/ci.yml` 에 `pnpm vault:validate` step 추가. dogfood vault 의 frontmatter silent corruption 을 매 PR 마다 차단.

### Widgets/views audit (#10)

- 24K LOC widgets + 11K LOC views 분석. hotspot 식별: `views/docs-vault/ui/DocsVaultPage.tsx` 1712 LOC + 67 hooks (단일 파일 비대), `views/ontology-edit` 2233 LOC (3 파일 합), `widgets/project-drawer` 1058 LOC.
- 추출 후보 3 신규 task 등록: #16 DocsVaultPage 영역 분리 (P2, 1순위) · #17 ontology-builder feature 추출 (P3) · #18 project-drawer 의 impact/screenshots 분리 (P3).
- `widgets/topology-map-sigma` 4579 LOC 는 이미 25 파일로 잘 분리 — 추가 추출 가치 작음 (skip).

### Dogfood vault 갱신

- 새 capability 노드 3 개 추가 (R11 surface 반영):
  - `capabilities/vault-validator` (silent corruption 가시화 도구 — CLI + UI)
  - `capabilities/vault-migrator` (schema 진화 패턴)
  - `capabilities/mcp-conflict-guard` (mtime 기반 silent overwrite 차단)
- 18 → 21 노드. `pnpm vault:validate` clean. 매니페스트 43 → 46 docs.

### Sigma WebGL fallback (#9)

- R9 changelog 의 Scenario 10 (deferred — 사용자 보고 0, 이론적) 재평가 후 진행. 비용 작고 영구 가드. 모바일 / 저사양 / 장시간 사용에서 GPU context lost 가능성 cover.
- `shared/ui/error-boundary.tsx` 신설 — generic React class ErrorBoundary, fallback render-prop, `resetKey` prop 으로 자동 reset, `onError` 콜백. 5 단위 test.
- `widgets/topology-map-sigma/ui/SigmaErrorFallback.tsx` 신설 — SigmaTopology 전용 fallback UI: AlertTriangle + reset CTA + "트리 뷰로 전환" link + dev-mode error message.
- `SigmaTopology` 가 self-wrap (caller 영향 0). `resetKey` 는 `projects.length|selectedSlug|depthLimit` 조합 — props 큰 변화 시 자동 reset.
- i18n 키 `topology.errorFallback.{title,body,retry,switchToTree}` (en + ko).

### UI 측 mtime 충돌 감지 (#15 MVP)

- mcp #8 의 conflict guard 패턴을 사람 GUI 측에 적용. `VaultDoc` 에 `mtime?: number` 추가, `buildLocalManifest` 가 `file.lastModified` 캡처.
- `useLocalVault.saveDoc(slug, content, { expectedMtime })` 옵션 — write 직전 fs `file.lastModified` 와 비교, 다르면 `VaultConflictError` throw. 옵션 미지정 시 검증 skip (회귀 회피).
- `DocsVaultEditor.onSave` 가 `selectedDoc.mtime` 전달 + conflict 감지 시 toast.error "vault 가 외부에서 변경됐습니다" 알림. 사용자가 새로고침 → 재시도.
- `messages/{ko,en}.json` 의 `dialog.vaultConflict` 키 추가.
- TOC update / ZIP import 흐름은 후속 적용 (현재는 핵심 user 편집 경로 만 cover). dialog UI (reload/overwrite 선택) 도 후속 — 현재는 toast MVP.

### Audit 사이클 — onboarding docs sync (#21 후속)

- AGENTS.md 의 quick start (영문 + 한국어 양쪽) 에 `pnpm vault:validate` / `pnpm vault:migrate --list` 추가. R11 신규 명령들이 canonical contributor guide 에 등재.
- `.claude/hooks/block-npm-publish.sh` read-only audit — `(npm|pnpm|yarn) publish` 어디서든 패턴 매칭 차단 (mcp/ 안 cover), `npm pack --dry-run` 만 통과. python3 의존. 정상 작동 확인.
- 신규 P3 task 등록: dogfood elements/ 에 R11 신규 capability 의 코드 모듈 노드 추가 (#22).

### vault:migrate 의 git pre-write 안전망 (#21)

- `pnpm vault:migrate <id> --write` 가 vault 안의 uncommitted .md 를 감지하면 거부 (`--force` 명시 강행 가능). git 미설치 / non-repo / dry-run 모드 는 검사 skip 무해 통과.
- 마이그레이션 결과와 사용자 변경이 디스크에서 섞여 rollback 어려워지는 상황 방지. AGENTS.md 의 "rollback 은 git" 정책 강화.
- `scripts/migrations/README.md` 갱신.

### MCP 도구 핸들러 통합 test (#20)

- 단위 helper test (parser / vault / redirect / conflict-detection — 합 30+ case) 가 cover 안 했던 *도구 핸들러 자체* 의 input → routing → output 흐름 cover.
- `mcp/src/integration.test.mjs` 신설 — `spawn` + stdio JSON-RPC 라운드트립으로 server boot → `tools/call` → response 검증 → cleanup 패턴. verify.mjs 의 spawn 패턴을 test 로 옮김.
- 7 case: list_concepts 노드 수 / get_concept mtime / patch_concept stale → conflict error / rename_concept dry-run / rename_concept confirm / merge_concepts confirm / add_relation idempotent.
- 각 case 가 fresh tmp vault 만들고 server fork → SIGTERM cleanup. 총 ~10s.

### Vault validator UI surface (#14)

- LocalVaultPicker 에 frontmatter validation chip 추가. local 모드에서 manifest 의 parsed frontmatter 만 보고 missing-kind / empty-kind / unknown-kind 검출 (raw 다시 안 읽음 — fast UI path).
- error 1+ 시 빨강 chip (✗ N), warning 만일 때 amber chip (⚠ N). i18n: `validationChip` / `validationTooltip` (en + ko).
- docs-only 파일 (frontmatter 0 keys 또는 ontology 시그널 키 없음) 은 skip — noise 회피.
- `summarizeVaultValidation` collection helper + `validateVaultDocFrontmatter` 신설. 10 단위 test (parsed-only fast path + summarize counts + ok/error 분기).

### Test

- 641 → **695** unit pass (54 case 추가): validator 10 + parser contract 36 + migration 8.
- mcp/: 11 → **18 pass** (redirect-backlinks 7 추가).
- mcp/ verify: **14/14 도구** registered + 18 노드 vault 로드 OK.
- pnpm exec tsc: clean.

### Docs

- AGENTS.md / docs/FEATURES.md / docs/PRODUCT-DIRECTION.md / docs/ontology/README.md / docs/ontology/capabilities/mcp-server.md / docs/ontology/domains/ai-agent-partner.md / mcp/README.md / mcp/scripts/verify.mjs — 모든 도구 카운트 12 → 14 (read 8 + write 4 → 6) 동기화.
- launch/* (HN/Reddit/X 게시물 초안) 은 *publish 시점 snapshot* 이라 의도적으로 미갱신.

---

## 2026-05-03 — Round 9: robustness audit (3 ship · 2 defer · lint floor)

codex 의 10-시나리오 robustness audit 결과 — DEGRADED 4 + BROKEN 1.
회의주의 적용해 user-visible inconsistency 3 개만 ship.

### Bug fixes

- **`saveDoc` permission 거부 시 state sync (Scenario 1)** — 이전: throw
  만 하고 status 는 'loaded' 로 남아 사용자가 picker 가도 권한 문제
  모름. → `requireWritePermission` useCallback 으로 추출, 거부 시
  state→'permission-needed' 동기화 → LocalVaultPicker 의 reauth UI
  자동 노출.
- **Local source + vault error/permission-needed banner (Scenario 2)**
  — 이전: 폴더 rename / 권한 회수 시 silently server (sample) 매니페스트
  fallback → 사용자가 vault 죽음 모름. → /docs 헤더 아래 명시 banner +
  "Picker 열기" 버튼.
- **Local 토글 disabled 시 unsupported tooltip (Scenario 5)** —
  이전: Firefox / Safari < 18.2 사용자가 disabled opacity 만 보고 *왜*
  disabled 인지 모름. → Tooltip + sr-only description.

### Skip — defer

- **Scenario 9 — locale 전환 시 query state 손실** — 빈도 낮음 (locale
  전환 자주 안 함). DEFER.
- **Scenario 10 — WebGL context loss recovery** — theoretical, 보고 0.
  ErrorBoundary 설치 비용 vs 실제 영향 미정. 보고 들어오면 진행.

### Other Scenarios — verified HANDLED

- 4 (MCP 타이포 enum), 6 (빈 vault), 7 (cyclic deps), 8 (concurrent
  delete race) — codex 각각 verified.
- 3 (malformed YAML) — DEGRADED 이지만 parser 가 lenient by-design,
  사용자 영향 거의 없음. DEFER.

### Lint floor

이전 18 warnings → trivial 2 fix (`ManualSourceChip` `_props` targeted
disable + `DocsVaultPage:145` unused eslint-disable 제거) → 16 warnings
도달. 나머지 16 = categorical noise (15 set-state-in-effect localStorage
rehydrate, idiom 일치라 큰 architectural 결정 없이 fix 불가) + 1 lib
incompat (TanStack Virtual). 사실상 floor.

### 코드 / 아키텍처

- 2 commit · `chore: lint trivial 18→16` + `fix: Round 9 robustness`.
- `requireWritePermission` 신규 (~15 LOC) + 4 callsite + 4 useCallback
  dep array 갱신.
- 외부 `ensureReadWrite` 제거 (사용처 0).
- /docs 헤더 아래 신규 banner block (~25 LOC) — error / permission-needed
  branch.
- Local source 토글에 Tooltip wrap + sr-only description.
- 5 신규 i18n 키 (`vaultStatus.*`).

### Test

- pnpm exec tsc: clean.
- pnpm test:run: 579 pass.
- pnpm lint: 16 warnings (floor).
- pnpm build: green.

### Round 10 자연 후보 — 거의 없음 (wait-for-signal 강하게)

8 라운드 surface 다이어트 + 1 라운드 architectural 리팩터 + 1 라운드
robustness audit 후 codex / Plan / Explore 모두 큰 개선 영역 surface
안 함. 다음 라운드는 사용자 보고 (perf / WebGL crash / locale 전환
사용성) 또는 명시 product call 필요.

---

## 2026-05-03 — Round 8: useLocalVault provider 리팩터 (Round 7 deferred 항목)

Round 7 의 codex finding (8 callsite 독립 호출 → 한 페이지 mount 에 2-3
인스턴스) 를 perf 측정 없이도 architectural 가치가 명확한 well-scoped
리팩터로 ship. 코드 dedup + source-of-truth 명확화 + 큰 vault 의 cold-load
N× 감소.

### Architectural change

- 새 `LocalVaultProvider` (`src/features/docs-vault-local/model/LocalVaultProvider.tsx`)
  가 layout 에서 1 회 mount → 단일 state 인스턴스 보유.
- 기존 `useLocalVault` → `useLocalVaultInternal` rename (`@internal` 로
  마킹). 로직 변경 0.
- 새 `useLocalVault` 는 context consumer — 시그니처 이전과 동일이라 8
  callsite (RootEntryPage / OperationsNav / OntologyEditPage /
  DocsVaultPage / useDataSourceMode / useProjects / useProjectMutations /
  useVaultOntology) 코드 변경 0.
- Provider 외부 호출 시 explicit error (silent stub 위험 회피).

### User-visible change

없음. 순수 internal architectural — 사용자 시각엔 동일. 큰 vault (100+
파일) 사용자가 cold-load 가 빨라진 걸 느낄 수 있지만 18-node dogfood
에선 측정 한계.

### 코드 / 아키텍처

- 1 commit · 5 파일 · 신파일 1 (`LocalVaultProvider.tsx`, ~50 LOC).
- 기존 `use-local-vault.ts` 767 LOC 변경 = function rename + JSDoc 만
  (로직 0 줄 변경).
- `index.ts` barrel: `useLocalVault` export source 변경.
- `layout.tsx`: ToastProvider 바깥 (TaxonomyProvider 안) 에
  `<LocalVaultProvider>` mount.

### Test

- pnpm exec tsc: clean.
- pnpm test:run: 579 pass.
- pnpm build: green (static export).
- pnpm lint: 18 warnings (was 19, -1).

### Round 7 의 다른 deferred 후보들 — 여전히 wait-for-signal

- **`/ontology/edit` reconsideration** — UX persona walkthrough finding.
  cut vs re-design 결정은 사용자 사용 데이터 또는 명시 product call 후.
- **Phase 4 PM polish** — vocabulary 번역 spike. 별도 design 라운드.

---

## 2026-05-03 — Surface diet Round 7: 1원리 메타 검토 (1 ship · 3 defer)

3 에이전트 1원리 분석 — codex MVP audit · Plan 4 architectural axes
audit · general-purpose 3 personas walkthrough. 사용자 directive: "정말
하는게 좋다고 판단되는것만". 결과: 4 발견 중 1 ship, 3 개는 architectural
의미 있지만 user-signal 또는 design phase 필요로 명시적 DEFER.

### Bug fix #1 — MCP add_relation slug 존재 검증 (Cut Q)

Plan 발견: `mcp/src/index.js:497` `addRelation` 이 `from`/`to` slug 가
실재하는지 확인 안 함. AI agent typo / hallucinated slug 가 frontmatter
array 에 dangling reference 로 silently 추가됨. Round 5 (UI placeholder)
+ Round 6 (MCP blank title) 의 validation parity 확장.

→ `vault.mjs` 에 `vaultSlugExists(rootPath, slug)` helper 추가 — slug
형식 검사 + existsSync. throw 안 하고 boolean (caller-friendly). 6 단위
테스트 (top-level / subdir / 없음 / 빈/null/undefined / vault escape /
null byte injection). `addRelation` 가 양쪽 slug 검증, 친화적 에러.

### Architectural finding (defer to Round 8) — useLocalVault duplication

codex 발견: `useLocalVault()` 가 8 곳에서 독립 호출됨 — `RootEntryPage`,
`OperationsNav`, `OntologyEditPage`, `DocsVaultPage`, `useDataSourceMode`,
`useProjects`, `useProjectMutations`, `useVaultOntology`. 각 호출이 자체
`useState` + `useRef` + IDB rehydrate effect. 한 페이지 mount 에 2-3 개
인스턴스 동시 존재 → 같은 IDB 키에서 N 번 rehydrate, N 번
`buildLocalManifest` (FS 전체 walk), N 개의 fileHandles Map.

**왜 Round 7 에서 ship 안 함**: ~150 LOC 리팩터 + 8 파일 + provider
패턴 도입. 18-node dogfood 에선 perf 영향 측정 안 됨. 사용자 perf 보고
또는 큰 vault (100+ files) 데이터 driven 로 비용 정당화 후 Round 8.

**Round 8 구체 plan**:
1. 새 `LocalVaultProvider` 컴포넌트 (Context.Provider) — `app/[locale]/layout.tsx`
   에 mount. 내부에서 `useLocalVault` 의 현재 로직 1 회 실행.
2. 기존 `useLocalVault` 를 `useContext(LocalVaultContext)` consumer 로
   변경. throw if outside provider.
3. 8 callsite 변경 없음 (hook signature 동일).
4. cold-load perf benchmark (puppeteer / playwright trace) 로 검증 —
   build 횟수 N → 1 확인.

### Defer #2 — `/ontology/edit` 빌더 reconsideration

general-purpose persona walkthrough 발견: 3 personas (solo dev / PM /
AI agent) 모두 `/ontology/edit` 를 안 씀. dev 는 .md 직편, PM 은 모델
이해 못 함, AI agent 는 MCP. "most-built, least-justified" 평가. Round 4
의 ephemeral edge save chip 도 이 surface 만의 문제를 푼 것.

**왜 Round 7 에서 ship 안 함**: 빌더 자체 cut 은 product-direction 결정
. 시각적 inspection 가치는 분명 있고, dogfood 사용자 (Korean maintainer
본인) 가 어떻게 쓰는지 데이터 없음. 단순 cut 보단 "어떤 페르소나에게
어떻게 의미 있게 만들지" 별도 design 라운드 가치.

### Defer #3 — Phase 4 PM 친화 polish

PM persona walkthrough 발견: "frontmatter / slug / kind / ephemeral /
ego graph / ERD / MCP / vault" 같은 dev jargon 이 PM 진입 벽. PRODUCT-
DIRECTION 의 Phase 4 가 ⏳ 표시된 상태. dev+agent slice 는 v1.0
근접하지만 PM slice 는 vocabulary 번역/숨김 작업 필요.

**왜 Round 7 에서 ship 안 함**: 한 vocabulary 번역이 단일 page 변경이
아니라 시스템 wide 디자인. 별도 라운드 + 디자인 spike 필요.

### Codex 의 다른 발견들 — clean

- `next-themes` 는 `package.json` 에 없음 (custom impl 사용). codex 의
  잘못된 가정 정정.
- `/ontology/relations` 이미 제거 (Round 2). 추가 vestigial 없음.
- VaultDoc schema 에 dead field 없음 (Plan 검증).
- localStorage 에 vault data leakage 없음 (Plan 검증). Round 1 의
  radar-review-state 제거가 마지막 offender.
- 3 view 가 단일 projection root (`useOntologyInsight`) 공유 (Plan).
- Write 경로 `vault.{createDoc,updateFrontmatter,...}` 로 수렴 (Plan).

### 코드 / 아키텍처

- 1 commit · 4 파일 · `vault.mjs` (+22) · `index.js` (+15) · `vault.test.mjs` (+50 신파일) · `package.json` (+1).
- 새 helper 1 (`vaultSlugExists`) + 6 단위 테스트.
- mcp/ 테스트 5 → 11 pass.

### Test

- pnpm test:run: 579 pass · pnpm exec tsc: clean ·  mcp/ pnpm test: 11 pass · MCP verify.mjs: 12/12 도구 OK.

### Round 8 자연 후보 (우선순위)

1. **useLocalVault provider 리팩터** (codex finding) — perf 측정 후
   진행. ~150 LOC, 8 callsite, provider 패턴.
2. **`/ontology/edit` design review** (UX persona finding) — cut vs
   re-design 결정. 별도 spike.
3. **Phase 4 PM polish** (UX + PRODUCT-DIRECTION) — vocabulary 번역
   디자인 라운드.

---

## 2026-05-03 — Surface diet Round 6: MCP parity + vault drift (2 fix · 2 skip)

2 에이전트 좁은 회의 (Explore — dogfood vault drift · codex — validation
parity gap + MCP README drift). Round 5 의 회의주의 모드 유지: "정말
하는게 좋다고 판단되는것만". 4 발견 중 2 개 fix, 2 개 SKIP.

### Bug fix #1 — MCP patch_concept blank title 차단 (Cut O)

codex 발견: UI 의 `renameVaultDoc` 은 blank title 을 reject 하지만
`mcp/src/index.js:509` `patch_concept` 가 frontmatter 임의 patch 허용해
AI agent 가 `{ title: "" }` 또는 `{ title: "   " }` 를 보내면 vault
노드 title 이 silent 으로 비워짐. Round 5 의 ephemeral placeholder
pollution 과 같은 parity 문제 — 이번엔 entry point 가 MCP.

→ 새 helper `mcp/src/validate.mjs` 의 `isValidVaultTitle()` 로 단일
진실원. `addConcept` (필수 입력) + `patchConcept` (frontmatter 에 title
포함 시) 양쪽 가드. `null` 은 "title 키 삭제" 의도라 별도 에러 메시지
(frontmatter 깨짐 방지). 3 단위 테스트 (비-string / 빈 / trim 후 비 /
정상).

### Doc fix #2 — dogfood vault label drift (Cut P)

Explore 발견: `docs/ontology/domains/views.md` 의 title 이 "Views
(Topology · **Tree** · Builder)" 로 남음. Round 3 cut F 에서 sub-nav
"Tree" → "Browse" rename 했지만 vault 가 갱신 안 됨. body 도 검색 단축키
설명이 stale → 함께 갱신 (`⌘K` 프로젝트 / `⇧⌘K` 노드+프로젝트 통합).
docs-vault:build 재실행 → manifest sync.

### Skip decisions (codex 자체가 "maybe")

- **MCP add_concept project minimal 입력 허용** — codex 발견: `add_concept`
  가 project 를 slug/kind/title 만으로 허용하는데 UI `ProjectForm` 은
  category/status/description 필수. SKIP 근거: AI agent 가 incremental
  하게 stub 짓고 나중에 patch 하는 건 합리적 워크플로 (인간 폼 ≠ 에이전트
  API 같을 필요 없음). 진짜 데이터 무결성 문제 발견 시 Round 7 에서 재검.
- **/docs folder-topology project scaffold description 누락** — codex 발견:
  `DocsVaultPage:499` 의 quick scaffold 가 description 없이 작성. SKIP
  근거: scaffold 는 "빠른 stub 생성" 의도, `/project/new` 폼은 "canonical
  authoring". 다른 목적의 다른 contract — 사용자가 stub 후 폼에서 보강
  가능. UI 깨짐 보고되면 재검.

### Other findings — clean

- Explore: 잘못된 finding 1 개 (xyflow.md "F 키 fullscreen") — 검증
  결과 빌더의 F 키는 살아있음 (line 599-600). presentation mode 의 F
  키와 빌더 fullscreen 의 F 키를 conflate. 수정 안 함.
- codex: mcp/README 12 도구 vs 코드 (clean). verify.mjs 도 12/12 통과.
- 기타 vault 매니페스트 카운트 (domain 6 / capability 6 / element 4) 모두
  정확.

### 코드 / 아키텍처

- 2 commit (예정) · 6 파일.
- 새 파일 2: `mcp/src/validate.mjs` (~25 LOC) + 테스트 (~30 LOC).
- mcp package.json `test` 스크립트에 validate.test.mjs 추가.
- views.md frontmatter title 1 줄 + body 1 단락 갱신.
- manifest.json 자동 재생성.

### Test

- pnpm test:run: 579 pass · pnpm exec tsc: clean · pnpm build: green ·
  cd mcp && pnpm test: 5 pass · MCP verify.mjs: 12/12 도구 OK.

### Round 7 자연 후보 (만약 진행 시)

- **Codex 의 "maybe" 2 개 후속 검증** — 실제 사용자/에이전트가 minimal
  project 또는 description-less project scaffold 로 UI 깨짐 보고하는지.
  데이터 driven 결정.
- **그 외 = wait-for-signal** 유지. 6 라운드 surface 다이어트 + 2 라운드
  bug fix 후 codex / Explore 모두 큰 시그널 없음.

---

## 2026-05-03 — Surface diet Round 5: skeptic round (1 fix · 3 skip)

3 에이전트 회의주의 회의 (codex skeptic · Explore polish hunt · Plan
test design). 사용자 directive: "정말 하는게 좋다고 판단되는것만 해야
한다 + 검수도 하면서". 결과: 1 개 진짜 버그 fix, 나머지 후보들은 가치
< 비용 으로 SKIP.

### Bug fix (CRITICAL — Round 4 약속 위반)

- **Ephemeral 노드 placeholder title silent pollution 차단** —
  `addNode` 가 새 노드를 `defaultTitle: t('untitledPlaceholder')` 로
  채움 ("(enter a name)" / "(이름 입력)"). 사용자가 입력 안 하고 edge
  Save chip 누르면 `slugify("(enter a name)")` = `"enter-a-name"` →
  vault 에 `enter-a-name.md` 가 silent 생성되고 있었음. Inspector 의
  save 버튼은 같은 룰로 disabled 됐지만 chip 은 무방비.
  → `isUntitledTitle(title, placeholder)` helper 추출 + `saveEphemeral`
  과 `persistEphemeralEdge.resolveEndpoint` 양쪽에 가드. 8 단위 테스트
  (빈 문자열 / 공백 / 정확 매치 / trim / 실 입력 / substring / locale
  전환 / 빈 placeholder defensive) 로 회귀 lock. Round 4 가 약속한
  AGENTS.md self-approving frontmatter 원칙 진짜로 보장.

### SKIP decisions (codex skeptic 검증)

각 후보를 SKIP 한 근거:

- **K — Search palette 통합** SKIP. 두 팔레트는 *중복 아님* —
  `SearchPalette` = docs + projects + recent + project layer 패턴,
  `GlobalSearch` = ontology 노드 + 옵셔널 프로젝트 + kind/project 필터.
  합치려면 ranking · sections · filters · shortcuts · empty states · 선택
  semantics 전부 재설계 = 큰 비용. Round 4 H 가 두 버튼 나란히 노출
  → 발견성 문제는 이미 해결. VS Code 의 `⌘P` quick-open vs `⇧⌘P`
  command palette 처럼 scoped palette 둘이 *기능*.
- **L — LocalVaultPicker 헤더 hoist** SKIP. Round 4 J 가 dead-end 패치
  완료 (`?intent=local` URL + manual click 둘 다 dropdown 자동 펼침).
  1회성 picker 를 영구 header UI 로 hoist = 좁은 헤더 / 모바일 공간을
  vault loaded 후엔 secondary 가 되는 control 에 영구 점유 = 가치 ≪
  비용.
- **M — 10 단위 테스트 + 4 helper refactor** SKIP. codex 회의: 제안된
  10 시나리오 중 절반은 mock shape 검증 (orchestrator 가 결국 vault.
  createDoc / updateFrontmatter / toast 의 thin 래퍼). 더 중요한 product
  risk (placeholder 검증) 가 본 PR Cut N 으로 fix 되며 8 테스트로
  회귀 lock 됨. 추가 refactor 는 dedup 가치는 있으나 별도 PR 로 평가.

### Explore 결과 — codebase clean

Orphan i18n 0 · 죽은 export 0 · 죽은 localStorage 0 · stale comments 0 ·
inconsistencies 0 · untranslated copy 0. Round 1-4 가 깔끔하게 마무리됨
재확인.

### 코드 / 아키텍처

- 1 commit (`fix:`) · 4 파일 · +145 / -19 LOC.
- 새 파일 2: `is-untitled-title.ts` (~30 LOC) + 테스트 (~50 LOC).
- 8 새 단위 테스트.

### Test

- 580 (was 571) tests pass · build green · typecheck clean.

### Round 6 자연 후보 (만약 진행 시)

- **(없음 / wait-for-signal)** — 4 라운드 surface 다이어트 + 1 라운드
  bug fix 후 codex / Explore 모두 "더 손볼 곳 없음" 신호. 다음 라운드는
  사용자가 새 마찰점을 발견하거나 새 feature 요청을 받을 때 자연 발생.
  현재 페이스로 강행 시 over-engineering.

---

## 2026-05-03 — Surface diet Round 4: 검색 발견성 + 빌더 edge 영속

3 에이전트 병렬 회의 (codex pressure-test · general-purpose UX walkthrough
· Plan architect Builder edge persistence) 후 합의된 3 컷.

### User-visible changes

- **`/docs` Local 토글 첫 클릭이 picker 자동 노출** — Round 2 가 source
  토글을 헤더로 hoist 했지만 사용자가 헤더에서 직접 "Local" 클릭 시 picker
  UI 가 dropdown 안 깊숙이 묻혀 있어 next-step 모호. handleSourceChange
  에 한 줄 추가 — `?intent=local` URL 진입과 manual 클릭이 동일 동작
  (이미 vault loaded 면 펼침 안 함).
- **`/ontology` 글로벌 검색 (⇧⌘K) 가시화 버튼** — 이전엔 단축키만 있고
  visible button 없어 PM 이 ⇧⌘K 의 존재를 모름. ⌘K 옆에 "All" / "전체"
  버튼 추가 — 노드 + 프로젝트 통합 검색. 라벨은 정직 (codex 검증:
  GlobalSearch 가 ontology 노드 + 프로젝트만 cover, docs 미포함).
- **빌더 edge 에 "Save" 칩** — 가장 큰 Round 4 변경. 이전엔 사용자가
  endpoint 한쪽이 ephemeral 인 edge 를 그려도 in-memory 로만 남고
  새로고침 시 사라짐. 사용자는 어떤 edge 가 saved/unsaved 인지 모름.
  → ephemeral edge 가운데 amber chip "Save" 노출. 클릭 시 endpoint
  ephemeral 노드 (있으면) → vault 에 createDoc, 그 vault slug 들로
  source frontmatter array 자동 patch, ephemeral edge 정리.

### Critical discovery (codex + UX walkthrough)

vault↔vault edge 는 **이미 자동 persist** 되고 있었다 (`onVaultConnect`).
"ephemeral" 은 한쪽이라도 unsaved palette node 일 때만. 즉 빌더의 진짜
friction 은 자동/수동 구분 없는 시각 신호 + onboarding 카피의 misleading.

→ helpStepConnect / helpStepEphemeral / stepConnectStrong 등 onboarding
카피 4 곳 정정: "vault↔vault 자동 저장. 한쪽이 미저장 (amber) 이면 edge
의 Save 칩 클릭."

### 디자인 결정 — 4 design 비교 후 B 채택

Plan 에이전트가 4 가지 design 검토:
- A (auto-persist on edge drop): untitled.md silent pollution 위험
  (AGENTS.md self-approving 원칙 위반).
- B (per-edge save chip): 명시적 intent + 0 header 공간 + sandbox 보존.
- C (배치 banner): 3rd surface 추가 (palette + inspector + banner — clutter).
- D (solidify on inspector visit): 현재 friction + magic.

→ B 채택. codex 의 "DEFER" 우려 (slug mapping / failure recovery / 복잡도)
는 Plan 의 chip 단순화로 자연스럽게 해결됨.

### 코드 / 아키텍처

- 1 commit · 8 파일 · +322 / -47 LOC.
- 새 파일 1: `EphemeralEdge.tsx` (~85 LOC custom xyflow edge 컴포넌트).
- DocsVaultPage handleSourceChange 1-line 추가.
- OntologyViewPage 두 번째 search 버튼 (~30 LOC).
- OntologyEditPage persistEphemeralEdge orchestrator (~75 LOC) + 동적
  타입에 prop 추가.
- OntologyEditCanvas: edgeTypes 등록 + ephemeralFlow 매핑 단순화 (label /
  labelStyle / labelBgStyle 제거 — chip 이 흡수).
- 새 i18n 키 11 (`actions.globalSearch*` 3 + `toastEdgePersistNeedsTitle` 1
  + `ephemeralEdgeSave*` 3 + onboarding 4 정정).
- 제거 1 (`canvas.ephemeralEdgeLabel` — chip 이 흡수).

### Test

- 571 tests pass · build green.
- EphemeralEdge persist orchestrator 단위 테스트는 다음 PR 보류 — 로직
  검증은 우선 dogfood 수동 확인.

### Round 5 자연 후보

- **Search palette 통합** — UX walkthrough 권장 highest-effort: ⌘K /
  ⇧⌘K 두 개를 한 unified palette 로 합치고 섹션 구분 (Projects · Nodes
  · Docs). 현재 본 PR 은 두 버튼 노출로 발견성만 닫음. 통합은 ranking /
  section UX 별도 design 필요.
- **/docs LocalVaultPicker 헤더 hoist** — Round 4 의 J 는 dropdown 자동
  펼침으로 dead-end 만 닫음. picker 자체를 dropdown 밖 header-adjacent
  panel 로 옮기면 "Advanced" 가 아니라 first-run primary affordance 가
  됨.
- **EphemeralEdge persist 단위 테스트** — 본 PR 미포함. resolveEndpoint
  ephemeral / vault / 빈 title / static 모드 4 시나리오.

---

## 2026-05-03 — Surface diet Round 3: 첫 인상 + IA 정리

3 에이전트 병렬 회의 (user journey audit · inbound link 매핑 · IA 의견)
종합 결정. PM 입장 첫 인상 / IA 명확성에 집중한 4 컷 + 1 closure.

### User-visible changes

- **Landing primary CTA 재설계** — 이전엔 "Explore the ontology" (데모
  트리) 가 primary, "내 마크다운 폴더 열기" 가 secondary. 새 사용자가
  첫 클릭에서 데모로 빠져 자기 vault 활성화 경로를 못 찾는 dead-end.
  → 순서 swap: "내 마크다운 폴더 열기" 가 primary indigo solid,
  "데모 먼저 보기" 가 secondary outline.
- **Landing 카피 단순화 (PM 친화)** — "Markdown frontmatter is the graph"
  / "ERD" / "MCP" / "grep markdown" 같은 dev jargon 제거. "프로젝트의
  조각들 — 기능 / 모듈 / 누가 무엇에 의존하는지 — 를 마크다운 파일로
  정리합니다" 같은 행동 / 결과 중심 카피로.
- **`/ontology/insights` 패널 재배치** — Cut A 후속. 순서를 kind →
  edge types → projects → hubs → recent → orphans 로 (구조 진단을
  위로). 이전 "Cross-project relations" 별도 카드 (Cut A 에서 footer
  link 빠진 후 orphan card 됨) 를 edge types 패널 상단 inline caption
  으로 fold ("이 중 N 개 (X%) 가 cross-project").
- **Insights 의 "미연결 노드" 클릭 가능** — 이전엔 hubs / recent 만
  /ontology/?node= 로 연결되고 orphans 는 display-only dead-end.
  hover transition + Link 으로 정렬 — "정리 후보 발견 → 즉시 점프"
  가능.
- **Sub-nav 항상 노출 + "Tree" → "Browse" rename** — 이전엔 chevron
  토글 default-collapse 로 발견성 0 (사용자가 토글을 안 누름). 항상
  노출로 단순화 (localStorage / 토글 / chevron 모두 제거). 라벨도
  "Tree" 라고 했지만 실제 페이지가 트리 + ego 그래프 + 노드 detail 패널
  까지 보여주므로 "Browse" / "둘러보기" 로 rename.

### Decision recorded (no UI change)

- **`/` ↔ `/ontology` 라우트 dedupe — keep both 결정**. 둘 다
  `OntologyViewPage` 를 렌더하지만 codex 어드바이저 + 3 에이전트 inbound
  매핑 결과 *역할이 다름*: `/` = home / back-link / error fallback (10
  inbound), `/ontology` = explicit deep-link namespace (19 inbound).
  redirect 통합 시 한쪽 inbound 가 깨짐. RootEntryPage docstring 에
  의도 명시.

### 코드 / 아키텍처

- 5 commit (예정), 약 ~150 LOC 변경 (대부분 카피 / 순서 / 위치 재배치).
- OperationsNav: subNavOpen / SUBNAV_OPEN_KEY localStorage / chevron /
  toggle 함수 / 4 개 i18n 키 (subNav* family) 제거.
- 새 i18n 키 1 개 (`vaultWidgets.insights.edgeTypeCrossProjectInline`),
  제거 7 개 (subNav*, crossProjectPanelTitle/Subtitle, crossProjectFooter*).

### Test

- 571 tests pass (변동 없음).

### Deferred (Round 4 candidates)

- ⌘K vs ⇧⌘K 발견성 — 한 버튼이 둘 다 안내. 현재는 button 이 ⌘K
  hint 만 보여줌 (search 결과가 ontology 노드만일 거라 PM 이 글로벌
  검색 단축키를 모름).
- Builder edge 영속성 자동화. 현재 onboarding 이 "edge 그리고 inspector
  array 에 직접 추가" 라고 안내 — UX 마찰 큼.
- /docs 의 LocalVaultPicker 첫 진입 affordance — picker 가 advanced
  dropdown 안 깊숙이 묻혀 있음 (소스 토글이 헤더로 나와도 picker 자체는
  여전히 dropdown 안). landing CTA `?intent=local` 는 여전히 기어 자동
  펼침으로 보완 중.

---

## 2026-05-03 — Surface diet Round 2: 라우트 통합 + /docs 헤더 직접화

Round 1 컷 (5 곳) 직후 codex 어드바이저 재pressure-test 로 합의된 2 곳을
처리. 합의 안 된 1 건 (`/` ↔ `/ontology` 중복) 은 별도 사이클로 보류 —
nav / search / 노드 선택 URL 재작성 등 inbound 의존이 많아 careful pass
필요.

### User-visible changes

- **`/ontology/relations` 라우트 제거** — 122-줄 페이지가 단일 패널 (edge
  type 분포) 만 들고 있었고, `/ontology/insights` 가 같은 분포 패널 (top
  8 → 전체로 확장) 을 이미 보여줌. Sub-nav "Relations" 탭 / sitemap entry /
  insights 의 self-link footer 모두 제거. 동일 데이터를 두 라우트로
  분산시켜 인지 비용만 추가하던 구조.
- **`/docs` 상단 source 토글 직접 노출** — 이전에 우상단 gear 아이콘
  (Settings2) 뒤 dropdown 깊숙이 묻혀 있던 "샘플 vs 내 vault" 결정을
  헤더 인라인 2-button radio 로 노출. 비개발자에게 가장 중요한 결정이
  발견 비용 0 이 됨.
- **`/docs` advanced dropdown 은 local 모드 전용** — gear 버튼 자체가
  source === 'local' 일 때만 렌더. 안에는 folder-topology 토글 +
  LocalVaultPicker + ontology scaffold + new doc 버튼만 (server 모드에
선 dropdown 자체가 사라짐). tooltip "Advanced" → "Vault tools".
- **insights edge type 패널 = 전체 분포** — 이전 top 8 slice 제거.
  relations 페이지가 잘라내지 않고 모든 edge type 을 보여줬으므로 그
  capability 를 insights 가 흡수.

### Documentation cleanup (Round 1 leftovers)

- `docs/FEATURES.md` insights 섹션: stale "30-day timeline" / "10 most
  recent activities (relative time)" / "top 12 strongest relations"
  (이미 제거된 기능들) → 실제 구현된 Node preview / 전체 edge type 분포
  로 정정.
- `docs/ARCHITECTURE.md` 라우트 표 (2 곳) 갱신.
- `docs/DESIGN-SYSTEM.md` 의 stale `/settings/*` `/account` 라우트 언급
  제거 (R10 에서 진작 영구 제거됐는데 docs drift).
- `SigmaTopology.tsx` 의 stale `/diagnostics/insights` 주석 (2 곳, R10
  이전 audit 페이지 reference) 정리.
- `persistence.test.ts` 의 'graph' / 'stats' 명시 fallback assertion
  제거 (이미 unknown fallback 으로 커버됨).

### 코드 / 아키텍처

- 2 commit, 약 ~330 LOC 삭제.
- 라우트 1 개 (`/ontology/relations/`) + 페이지 컴포넌트 (`OntologyRelationsPage`)
  + barrel + sub-nav entry 제거.
- 13 개 i18n 번역 키 제거 + 3 개 신규 (sourceAriaLabel / vaultToolsTooltip /
  vaultToolsAriaLabel).
- DocsVaultPage advanced dropdown 안의 "View" / "Source" 섹션 헤더 +
  source picker 2-button grid 제거.

### Test

- 571 tests pass (변동 없음).

### Deferred

- `/` ↔ `/ontology` 라우트 중복 (vault-active 시 둘 다 OntologyViewPage
  렌더). codex 권고: `/ontology` canonical permalink, root → `/ontology/`
  redirect. 별도 PR 에서 inbound 의존 (OperationsNav active marker, search
  palette, 노드 선택 URL 재작성) 검토 후 처리.

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
- ~~`/ontology/insights` + `/ontology/relations` 통합~~ → 같은 사이클 내
  Round 2 cut A 로 처리. `/ontology/relations` 라우트 제거, edge type
  분포는 `/ontology/insights` 로 흡수.
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
