# CHANGELOG

> Major change history. Code commit messages answer *why*; this file answers *when / which surface changed*. Focused on **user-visible changes**, not PR-level granularity.
>
> Newest at the top. Date-based since we're pre-semver in the v0.x stage.

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
