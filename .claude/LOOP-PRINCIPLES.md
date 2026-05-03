# Loop principles — 20분 1회 자동 개선

이 파일은 20분마다 1회 자동 실행되는 loop 의 단일 진실원이다. 매 iteration
이 파일 전체를 읽고, "Iteration protocol" 섹션에 따라 **최대 9 개 atomic
개선을 라운드로빈으로 빠르게 수행한 뒤** 멈춘다 (다음 wakeup 까지 대기).

## 불변 규칙 (매 iteration 절대 위반 금지)

- `pnpm test:run` 깨지면 즉시 revert. green 일 때만 commit.
- `pnpm exec tsc --noEmit` clean 이어야 한다.
- `pnpm lint` errors 0 이어야 한다 (warnings 는 사전 존재 — 새로 추가 금지).
- `pnpm build` + `pnpm bundle:check` 성공해야 한다.
- 디자인 헌장 (`@.claude/rules/design.md`) 위반 0 — 보라/핑크 그라디언트, glassmorphism,
  glow pulse, neon, scale hover, 둘 이상 채색 시스템 등 절대 금지.
- mission v2 정합 — vault frontmatter 가 그래프. 백엔드 / 인증 surface 부활 금지.
- 한 iteration 이 한 atomic. chain 금지 — 다음 atomic 까지 가지 않음.

## 9 원칙 (매 iteration 에 모두 적용)

1. **1 원칙 사고로 기능 분해** — *정말 필요한가?* 다른 방식으로 같은 결과를 더
   단순하게 낼 수 있나? 분해 후 "이건 없어도 됨" 결론이면 그 자체가 한 atomic.

2. **불필요하면 제거** — 정말 필요하지 않은 기능은 sub-agent 들과 간단한 회의를
   진행하고 제거. (Agent 도 안 호출할 정도로 명백하면 그냥 잘라낸다.)

3. **사용성 = vault** — 사용자는 본인 markdown 폴더 (local-first) 만으로 모든
   기능이 잘 동작해야 한다. 페이지만 제공한다는 mission. 매 iteration 직접
   ontology 설계 시나리오를 머릿속에 walk-through 하고 발견된 마찰을 우선순위.

4. **어려움 → 쉽게** — 설계 / 사용 중 발견된 어려움은 그 자리에서 더 쉬운 방법
   고민하고 적용. "사용자가 이 단계에서 헤맬까?" 가 yes 이면 그게 다음 atomic.

5. **창의 OK** — 다방면 접근 환영. 표준 패턴 외에도 한 surface 만의 unique
   해법이라도 사용자 가치가 크면 채택.

6. **UI 핵심** — 매 iteration 한 surface 의 디자인 1 개 더 예쁘게. (디자인 헌장
   안 — 단일 인디고 + 무채색 + 모션 절제 + scale hover 0.) 토스 / 애플 같은
   감성 — 깔끔, 절제, 적절한 여백, 마이크로 인터랙션.

7. **모든 페이지 순회** — 한 페이지 끝나면 다음. 라운드 로빈으로 17 user-facing
   route 전부 돈다. surface 목록 (Iteration protocol 섹션 참조).

8. **오류 0** — 사용자 vault 흐름이 절대 깨지면 안 된다. 특히 폴더 선택, 저장,
   읽기, 검색 — local 모드에서 reproducible 하게 동작. 페이지만 제공한다는
   mission 준수.

9. **성능 = 안티패턴 0** — 렉 없는 최적화. 큰 vault (200+ 노드) 도 견뎌야 한다.
   `useEffect` deps 누락, `useMemo` deps 과잉, 매 render 새 객체 생성, O(n²)
   같은 안티패턴 0. Sigma forceAtlas2 / xyflow / cmdk 같은 무거운 라이브러리는
   특히 신중.

## Iteration protocol

매 iteration 최대 9 개 atomic. 라운드로빈으로 surface 를 한 번씩 훑되, 한
surface 에서 즉시 개선할 후보가 없으면 다음으로 skip. 끝나면 다음 cron fire
까지 대기 (자동 chain 금지).

### 1) 다음 surface 결정

"Progress log" 마지막 entry 의 surface 를 보고 round-robin 다음 surface 선택.
순서:

1. `/` (landing / ontology hub)
2. `/topology`
3. `/docs`
4. `/ontology`
5. `/ontology/edit`
6. `/ontology/insights`
7. `/ontology/relations`
8. `/projects`
9. `/project/[slug]` (대표 fixture: `oh-my-ontology`)
10. `/project/[slug]/edit`
11. mcp/ (MCP 서버 자체)
12. global chrome (OperationsNav / BottomTabBar / GlobalSearch / SearchPalette)
13. shared/ui primitives (Button, Tooltip, Card, …)
14. features/docs-vault-local (vault picker / scaffold)
15. design tokens (`app/globals.css` `@theme`)
16. messages/{en,ko}.json (i18n 정합)
17. docs/ontology/ (dogfood vault — 자기 ontology 갱신)

Progress log 비어있으면 1) 부터 시작. 마지막 entry 가 17 이면 1) 로 wrap.

### 2) 9 원칙 적용 — 한 surface 정밀 분석

- **1 원칙 분해** — 이 surface 의 핵심 사용자 가치는? 그것을 가장 단순한 형태로
  표현하면? 현 구현이 더 복잡하면 단순화 후보.
- **사용성 마찰** — 사용자가 이 페이지에서 헤맬 1순위 지점.
- **UI 예쁨** — 디자인 헌장 안에서 더 예쁘게 만들 1 개. 여백 / 타이포 위계 /
  보더 / 모션.
- **성능** — 안티패턴 1 개. 렌더링 / deps / 라이브러리 호출.

### 3) 가장 임팩트 있는 1 개 만 atomic 으로 수정

후보 4 개 중 *가장 임팩트 큰 1 개* 만 그 iteration 에서 고친다. 나머지는 메모만
하고 다음 iteration / round-robin 으로 미룬다.

### 4) 검증

- `pnpm exec tsc --noEmit`
- `pnpm test:run`
- `pnpm lint`
- 변경이 페이지 시각이나 라우팅에 영향 → `pnpm build`
- 변경이 import 그래프에 영향 → `pnpm bundle:check`
- 변경이 시각 / 인터랙션 → 가능하면 Playwright 1 surface 확인 (시간 허용 시)

### 5) Commit

- conventional prefix (`feat:` / `fix:` / `refactor:` / `chore:` / `style:` / `perf:`)
- 본문은 *왜* 를 적는다 (한국어 또는 영어 OK).
- 작은 atomic 은 main 직접 push 또는 quick PR 후 immediate `--admin` merge.

### 6) Progress log 갱신

이 파일의 "Progress log" 맨 위에 1 줄 append:

```
[YYYY-MM-DD HH:MM] <surface> — <한 줄 변경 요약> (PR #N or commit hash)
```

### 7) 다음 surface 로 진행

이번 iteration 에서 9 개 atomic 을 채우거나, round-robin 한 바퀴를 돌았는데
더 고칠 후보가 없으면 멈춘다. 한 surface 에서 후보가 없으면 다음 surface 로
즉시 skip. 매 atomic 사이엔 검증 (1~5단계) 와 progress log append 를 반복.

iteration 종료 후 다음 cron fire (20m 후) 까지 대기. 자동 chain 금지.

## Progress log (newest on top)

<!-- 매 atomic 1 줄씩 append. 비어있으면 1) `/` surface 부터 시작. -->

[2026-05-03 13:25] chore /ontology/insights — kind 분포 bar 의 unknown 색 hardcoded rgba → UNKNOWN_TONE.strokeStrong (단일 진실원 정렬, commit b738ef6)
[2026-05-03 13:23] perf /ontology/edit — vaultSelected useMemo + docsBySlug Map (manifest.docs.find O(N) → Map O(1)) — commit 43d64b1
[2026-05-03 13:20] refactor /docs (widgets/docs-vault) — orphan \`isPinned\` 함수 + re-export 영구 삭제 (caller 0, consumer 들이 pinnedSet.has 로 직접 lookup, commit 28e1a78)
[2026-05-03 13:18] perf / (HomePage) — handleSelect 의 노드 lookup renderProjects.find O(N) → projectBySlug Map O(1) (commit 6d9b8b1)
[2026-05-03 13:16] fix docs/ontology — ontology-core.md broken refs (deleted entities/ontology-relation + non-existent docs/DATA-MODEL + ONTOLOGY-MODEL-V2-DRAFT) 정리 + manifest 재생성 (commit f8cfc16)
[2026-05-03 13:14] fix features/docs-vault-local — scaffoldTopology 가 사용자 vault 에 작성하는 ko-only README + categories + statuses + samples → 영어 표준화 + R10-removed `/share?t=` 링크 + stale 단축키 정리 (commit c42260d)
[2026-05-03 13:11] fix shared/ui (InfoHint) — button ↔ tooltip aria-describedby 누락 a11y 회귀 정정 (스크린리더가 tooltip 본문에 도달 못 했던 회귀, commit f11d2fa)
[2026-05-03 13:10] chore global chrome (global-search) — useGlobalSearchHotkey JSDoc + match.test.ts 의 "Fire 2" sprint marker 2 곳 정리 (commit dfebdaa)
[2026-05-03 12:59] fix mcp/ — 12 도구 schema description (top-level + parameter, ~30 ko 항목) 영문화 (AI agent universal 호환성, commit be3dbce)
[2026-05-03 12:30] fix /project/[slug]/edit — ProjectForm name/nameEn input 의 stale "Demo" placeholder → locale-aware namePlaceholder/nameEnPlaceholder (commit cd3f41d)
[2026-05-03 12:27] fix /projects — useProjectMutations 의 ko throw 2 곳 (slug 충돌 + STATIC_REJECTION) 영문화 + slug quoted display (en locale 회귀, commit 639e741)
[2026-05-03 12:25] refactor /ontology/insights+/relations — edge type rows 빌드 중복 (~24 LOC) → entities/knowledge-graph 의 buildEdgeTypeRows 공유 + KNOWN_EDGE_TYPE_SET O(1) lookup (commit 8bfe87b)
[2026-05-03 12:21] docs /ontology/insights — JSDoc 패널 리스트 4 → 실제 7 패널 (project별/edge type/cross-project 추가) 정합 (commit 8c8f194)
[2026-05-03 12:20] chore /ontology/edit — 테스트 description 의 \`Round 9a T0-4\` / \`Round 9b T1-9\` 옛 sprint marker 5 곳 정리 (commit 954213e)
[2026-05-03 12:18] fix /ontology — OntologyMetaFooter 의 하드코딩 영문 ("nodes/relations/mode:") → 2 새 i18n key (counts/modePrefix) 로 locale-aware (ko 사용자가 영문 푸터 받던 회귀, commit d6e93d6)
[2026-05-03 12:17] fix /docs — dailyNote (할 일/메모) + TOC (목차) 템플릿의 ko-only 섹션 헤딩 → locale-aware 3 i18n key 신설 (en 사용자 vault 에 ko 헤딩 작성 회귀, commit 8a9baaf)
[2026-05-03 12:14] chore / (HomePage) — "eval B3 finding" 옛 평가 marker 정리 + 단축키 도움말 버튼 위 중복 코멘트 통합 (commit ade70cb)
[2026-05-03 12:12] fix docs/ontology — topology-sigma-render 의 stale UI element (Legend 사라짐 / RegionNavigator → SigmaMinimap rename) + Mission v2 phase history marker 정리 + manifest 재생성 (commit 14c5a38)
[2026-05-03 12:10] chore features/docs-vault-local — scaffoldOntology 의 "eval round 4 — perf agent finding" 옛 session marker 정리 (commit 9c14624)
[2026-05-03 12:09] fix shared/ui (LiveAnnouncer) — broken-by-design ZWSP "dedup workaround" (single static ZWSP 가 same-message diff 변화 못 만들어 false promise) 제거 + JSDoc 정확화 + 테스트 2 동기화 (commit a1c1ce1)
[2026-05-03 12:05] chore global chrome (MountedGlobalSearch) — JSDoc 의 stale "Fire 2" sprint marker 2 곳 + R10 cloud 호스팅 history 정리 (commit eeb7d89)
[2026-05-03 12:04] fix mcp/scripts/verify — CLI log/console output 의 ko 라벨 9 곳 영문화 (en locale CLI 사용자 회귀, commit cfc731e)
[2026-05-03 12:03] fix /project/[slug]/edit — projectFormSchema 의 ko 검증 메시지 12 곳 + linksText 라우팅 가드 + 4 테스트 영문화 (en locale 회귀, commit afbb136)
[2026-05-03 12:00] fix /project/[slug] — status dot var() fallback hex 가 실제 token 과 drift (e.g. #27a644 vs #78be96) → fallback 제거, token 단일 진실원 (commit 172bcfd)
[2026-05-03 11:58] chore /projects — empty-state dead-end 가드 코멘트 "로그인 + 멤버" R10-stale → "static 모드 (vault 미선택)" 정확화 (commit 98a3d23)
[2026-05-03 11:56] refactor /ontology/insights+/relations — edge type label 중복 (~34 LOC switch + 28 i18n key) 제거 → useEdgeTypeLabel + edgeTypes namespace 신설 (commit 5abae25)
[2026-05-03 11:47] refactor /ontology/edit — OntologyInspector 의 localizeKind 중복 제거 → useOntologyKindLabel 공유 (10 i18n key per locale orphan 정리, kind 확장 자동 wire, commit af3a638)
[2026-05-03 11:44] perf /ontology — totalNodes / docCount 매 render 재계산 → useMemo 안정화 (selection re-render 비용 절감, commit c88eb20)
[2026-05-03 11:43] perf /docs — handleImportVault 의 manifest.docs.some O(N×M) → Set O(N+M) (큰 vault 큰 import 시 ~50,000 검사 → ~600, commit 3a50078)
[2026-05-03 11:42] perf / (HomePage) — LiveAnnouncer referenced 카운트 projects.filter O(N*D) → reverseDeps Map O(1) lookup (큰 vault 의 selection/hover re-render 비용 절감, commit 3af31b7)
[2026-05-03 11:41] fix docs/ontology — vault-local-first 의 broken docs ref (LOCAL-FIRST-SYNC.md / OFFLINE-FIRST-UX-FLOW.md non-existent) → 살아있는 .claude/rules + FEATURES.md 로 정리 + manifest 재생성 (commit ba0b535)
[2026-05-03 11:39] chore messages — orphan key metadata.pages.home (per locale) 영구 삭제 (root 가 layout default title 로 fallback, commit 959dcb7)
[2026-05-03 11:38] fix features/docs-vault-local — useLocalVault mutation API (save/create/delete/updateFrontmatter/rename/scaffoldOntology) 의 ko throw 9 곳 영문화 (en locale 회귀, commit 20fd419)
[2026-05-03 11:36] chore shared/ui — 3 primitive JSDoc 정리 (detail-card 의 "어드민" R10 ref / empty-state 의 "위 ㅏ안" typo / staggered-fade-in 의 "eval Aesthetic agent" session marker, commit 32563d5)
[2026-05-03 11:35] chore global chrome (OperationsNav) — stale "5 탭 / 5 개" 카운트 (R10 namespace 축소 전 history) → 실제 3 정정 (commit 21ef841)
[2026-05-03 11:29] fix mcp/ — index.js + vault.mjs 의 ko 하드코딩 throw 11 곳 영문화 (AI agent JSON-RPC 응답 호환성, commit 9475b7b)
[2026-05-03 11:27] fix /project/[slug]/edit — bulk-update.ts 의 ko 하드코딩 throw "대상 카테고리..." → 영어 + id 노출 (commit 4756dd6)
[2026-05-03 11:26] perf /project/[slug] — nextProjectCandidates dedup O(N²) findIndex → Set O(N) (큰 hub 안정성, commit 0f70be3)
[2026-05-03 11:25] chore /projects — ProjectSelectorPage 의 stale "cloud markdown 호스팅" + "1,979 프로젝트" 코멘트 정리 (commit e85a63c)
[2026-05-03 11:23] fix /ontology/insights — cross-project footer 의 stale "strong-relations / cross chip" ref 정리 (iteration 28 atomic 7 에서 사라진 기능 link 시 오기, commit 0fa04b4)
[2026-05-03 11:22] refactor /ontology/insights — R10b 후 영구 hidden 활동 패널 + buildActivityTimeline + 11 i18n key (per locale) 영구 삭제 + isVaultSentinelMode 단순화 (~204 LOC, commit 9183a7e)
[2026-05-03 11:18] fix /ontology/edit — Atlas export markdown 의 ko-only 헤딩/안내 (## 노드 / ## 관계 / 본문 placeholder) → 영어 표준화 (사용자 디스크 .md export 회귀, commit 1d01f51)
[2026-05-03 11:17] fix /ontology — 빈 vault getStarted snippet 의 ko-only 코드 예시 (\`인증\` / 한국어 본문) → 영어 표준화 (commit c8f7edc)
[2026-05-03 11:15] fix /docs — getDocContent / editResolver 의 ko 하드코딩 throw "로컬 볼트에 {slug} 없음" 영문화 (en locale 회귀, commit 9ad8133)
[2026-05-03 11:13] chore features/theme-toggle — ThemeToggle JSDoc 의 stale "로그아웃" R10 leftover 정리 (commit a176b64)
[2026-05-03 11:10] refactor / (HomePage) — pinnedDocs storage key 하드코딩 → PINNED_DOCS_STORAGE_PREFIX 공유 (silent drift 차단, commit 62f09b3)
[2026-05-03 11:08] chore docs/ontology — sigma-graphology element 의 stale "(구) / (신)" 표기 → "(홈 hub) 와 (alias)" 정확화 + manifest 재생성 (commit cc9ace8)
[2026-05-03 11:06] fix messages — useOntologyKindLabel KNOWN_KINDS 에 'vault-readme' 추가 (orphan i18n key wire-up: vault scaffold README 가 raw "vault-readme" 대신 친절한 라벨 노출, commit 906fc9a)
[2026-05-03 11:03] fix features/docs-vault-local — useLocalVault load/open catch 의 ko 하드코딩 fallback 메시지 2 곳 제거 (en locale 회귀, picker 의 t('errorFallback') 으로 위임, commit 203692f)
[2026-05-03 11:01] fix shared/ui (InlineEditable) — view 모드 ariaLabel spread 누락 a11y 회귀 + 하드코딩 ko title "클릭해서 편집" 제거 (commit dbf5170)
[2026-05-03 11:00] chore global chrome (BottomTabBar) — R10-removed 라우트 hide list (5 prefix) + dead shouldHide 가드 제거 + stale "4분할 / Direction A / /knowledge" 코멘트 정리 (commit c238dc5)
[2026-05-03 10:57] perf mcp/ — findPath BFS path 복원 unshift O(D²) → push+reverse O(D) (commit f78f1ea)
[2026-05-03 10:55] fix /project/[slug]/edit — ProjectForm 의 R10-removed /settings/categories·statuses 깨진 Link 제거 + ReturnLabelKey union dead 분기 + 6 i18n key (per locale) orphan 정리 (commit e409993)
[2026-05-03 10:51] chore /project/[slug] — ProjectDetailPage 의 stale Demo 브랜딩 예시 + account 쿼리 코멘트 정리 (R10 leftover, commit 2827376)
[2026-05-03 10:50] chore /projects — workspace tools 섹션 R10 leftover 정리 (Admin 라벨, demo- CSV prefix, 중복 canMutateProjects 가드, 단일-child grid wrapper, commit 301fd41)
[2026-05-03 10:48] refactor /ontology/relations — R10b 후 영구 hidden 이던 strong 패널 + dead type filter UI + selectStrongEdges helper + 8 i18n key (per locale) 영구 삭제 (~298 LOC, commit 8b5b467)
[2026-05-03 10:43] fix /ontology/insights — edge type bar 의 max baseline 계산 회귀 (canonical [0] 대신 reduce Math.max) 정정 (commit b794d0c)
[2026-05-03 10:42] chore /ontology/edit — JSDoc stale "approved" / "cloud useApprovedGraphFlow" terminology 2 곳 정정 (commit 5d542c5)
[2026-05-03 10:41] chore /ontology — OntologyViewPage ephemeral marker 3 곳 정리 (S5 sprint, /knowledge R10-removed ref, UX-6, commit c8833fa)
[2026-05-03 10:39] fix /docs — source 'Server' + Cloud (☁️) 아이콘 → 'Sample' + Package (📦) — R10 후 cloud 부재 mental model mismatch 정정 (4 i18n key, commit 64b59c8)
[2026-05-03 10:37] fix /topology — stale Korean meta description (en locale 사용자가 받던 ko description 회귀) + "Phase 1 (Direction A)" JSDoc 정리
[2026-05-03 10:35] fix / (HomePage) — 모바일 mini brand label 의 stale "Demo" → "oh-my-ontology" (R10 leftover, commit 9c73a45)
[2026-05-03 10:30] refactor entities/category + features/taxonomy — Category dead createdAt/updatedAt + presence helper + TaxonomyProvider hydrated/showCategoryRegions 영구 삭제 (commit b1212eb)
[2026-05-03 10:17] entities/docs-vault — project-frontmatter sanity check 주석 정확화 (commit 424fe4d)
[2026-05-03 10:16] entities/ontology-class — dead OntologyClass 타입 re-export 2 곳 제거 (commit 5e4e887)
[2026-05-03 10:13] entities/project — \`Project.hubSlugs?\` dead 필드 영구 삭제 (reader 0, commit 2bf4594)
[2026-05-03 10:12] fix entities/docs-vault — derive-ontology empty-warning 의 stale kind 제안 정정 (commit 7586b02)
[2026-05-03 10:10] refactor entities/ontology-class — getOntologyKindIcon 의 dead \`decision/workflow\` 매핑 제거 (commit 9acdac7)
[2026-05-03 10:09] refactor entities/ontology-class — OntologyClass 의 dead 필드 6 + 타입 2 + helper 영구 삭제 (commit 965a27f)
[2026-05-03 10:05] refactor entities/knowledge-graph — KnowledgeGraphNode/Edge 의 dead 필드 11 + 타입 3 영구 삭제 (commit 809a324)
[2026-05-03 09:59] chore views/ontology-edit — export-frontmatter JSDoc 의 stale spec 파일명 ref 정리 (commit 5148b94)
[2026-05-03 09:57] refactor views/ontology-edit — \`approvedNodes\` → \`vaultNodes\` rename + ontology-class JSDoc 정리 (commit 41efb94)
[2026-05-03 09:50] shared/ui — 마지막 \`Fire 5\` ephemeral marker 2 곳 정리 (commit e4e93a2)
[2026-05-03 09:48] 4 surface — \`audit X-N\` / \`iter N\` ephemeral marker 5 곳 정리 (commit 903c9d5)
[2026-05-03 09:46] 4 file — \`T-N\` ephemeral marker 4 곳 정리 (commit e564142)
[2026-05-03 09:45] 5 surface — \`PR #N\` ephemeral marker 5 곳 정리 (commit 55cc429)
[2026-05-03 09:42] fix entities/docs-vault — relates[] folder/slug → 기존 노드 정확 resolve (2-pass + helper, commit 4689956)
[2026-05-03 09:39] fix dogfood project.md — 중복 \`capabilities/elements\` 제거 (multi-parent edge 회귀 종결, commit a3498ed)
[2026-05-03 09:37] fix widgets/ontology-tree-view — expandedCount \`defaultExpanded=false\` 회귀 정정 (commit 89cced8)
[2026-05-03 09:36] perf — BFS shift() → head pointer 3 곳 추가 (sigma depth + docs deps bar, commit 59fcd52)
[2026-05-03 09:34] perf entities/project — BFS 3 곳 \`Array.shift()\` → head pointer (O(n²) 회귀 차단, commit af2a6bc)
[2026-05-03 09:29] 10 surface — 잔존 \`R10 / R10b\` JSDoc history marker 9 곳 정리 (commit d2a69d4)
[2026-05-03 09:26] 3 features — \`R10b / cloud\` 잔존 history marker 정리 (commit e88c667)
[2026-05-03 09:25] /ontology/edit — OntologyInspector \`approved 노드 (cloud legacy)\` JSDoc 정리 (commit d3de049)
[2026-05-03 09:24] refactor classifyMode — dead slug match 8개 → 2개 단순화 (양쪽 src + scripts, commit df5eb96)
[2026-05-03 09:21] fix /project/[slug] — stale Demo 브랜딩 4 곳 + 하드코딩 ko-KR inLanguage → locale-aware (commit 72cbaf3)
[2026-05-03 09:19] shared/lib — useDocumentTitle JSDoc \"Demo\" layout default → \"locale-aware siteName\" (commit 5ba4b6b)
[2026-05-03 09:18] app/sitemap — \`R10b\` ephemeral marker 정리 (commit 5f47293)
[2026-05-03 09:17] app/robots — R10-제거된 disallow 5 항목 정리 (commit 0a36be5)
[2026-05-03 09:16] shared/config — SITE_URL JSDoc 의 stale Firebase Hosting + TODO 정리 (commit 6e2bcea)
[2026-05-03 09:12] /ontology/insights + /ontology/relations — JSX UX-N marker 5 곳 정리 (commit e227150)
[2026-05-03 09:11] 5 surface — \`P0-B Phase 6\` / \`P1-5\` marker + stale ?account propagation 설명 정리 (commit fba41c4)
[2026-05-03 09:09] /docs — AdminDocsContent → DocsVaultContent rename (R10-leftover misnomer, commit 3bfc74a)
[2026-05-03 09:07] /ontology/insights — UX-13/14/17/8 ephemeral marker 4 곳 정리 (commit 4e03a71)
[2026-05-03 09:06] views/ontology-edit — Round 9a T0-4 / Round 6 ephemeral marker 7 곳 정리 (commit cea2df8)
[2026-05-03 09:04] /ontology/edit + /topology — Round 9b T1-9 / T1-11 marker 2 곳 정리 (commit 1fcb066)
[2026-05-03 09:00] feat entities/docs-vault — \`domains: [...]\` plural array 인식 (project.md → 6 자식 도메인 트리 연결, commit d856126)
[2026-05-03 08:58] fix entities/docs-vault — \`domain:\` edge 방향 반전 정정 (capability ↔ domain 트리 부모-자식 정정, commit f199f72)
[2026-05-03 08:54] 3 surface — stale \"23 노드\" / \"23 nodes\" 카운트 → 18 nodes reconcile (commit b3bbb69)
[2026-05-03 08:46] widgets/ontology-tree-view — \`Fire 2\` / \`UX-12\` ephemeral marker 3 곳 정리 (commit df1739b)
[2026-05-03 08:45] views/docs-vault parts/lib — \`Fire 4-N\` ephemeral marker 5 곳 정리 (commit 001e6f3)
[2026-05-03 08:44] /topology — HomePage \`Fire 2\` ephemeral marker 3 곳 정리 (commit 7085894)
[2026-05-03 08:43] /docs — DocsVaultPage \`Fire 4-N\` ephemeral marker 5 곳 정리 (commit 648e8f7)
[2026-05-03 08:41] /topology — SigmaControls HelpOverlay 닫힐 때 trigger focus 복원 (commit cee3014)
[2026-05-03 08:40] /ontology/edit — BlastRadiusConfirm 닫힐 때 trigger focus 복원 (commit a58201f)
[2026-05-03 08:39] features/project-quick-edit — ProjectQuickEditPanel modal 닫힐 때 trigger focus 복원 (commit eed29d0)
[2026-05-03 08:38] /docs — DocsVaultUnifiedPalette 닫힐 때 trigger focus 복원 (commit 4e291aa)
[2026-05-03 08:36] /docs — DocsVaultUnifiedPalette dialog 에 aria-modal=true 추가 (commit 8ac1c87)
[2026-05-03 08:32] features/project-edit — ProjectForm \`Fire 6-N\` ephemeral marker 4 곳 정리 (commit 594e40b)
[2026-05-03 08:31] global chrome — GlobalSearch \`Fire 2/5\` ephemeral marker 3 곳 정리 (commit 9aa352e)
[2026-05-03 08:30] perf /docs — DocsVaultGraph adj map 을 selectedSlug 와 분리 (selection click latency O(N) 제거, commit b8659d4)
[2026-05-03 08:27] widgets/ontology-tree-view — dead ONTOLOGY_ROOT_SORT_LABEL 한국어 상수 영구 삭제 (commit e8735ff)
[2026-05-03 08:24] widgets/public-quick-actions — 한국어 하드코딩 8 곳 → publicQuickActions i18n (commit 07972df)
[2026-05-03 08:22] features/project-share — CopyProjectLinkButton 한국어 하드코딩 5 곳 → i18n (commit 175960c)
[2026-05-03 08:20] /docs — 새 프로젝트 .md 템플릿 본문 placeholder locale-aware (commit 7d81d5f)
[2026-05-03 08:19] entities/project — ProjectCard \"핵심 허브\" / \"공유 시스템\" eyebrow props 패턴 i18n (commit bf1b809)
[2026-05-03 08:17] entities/knowledge-graph — ManualSourceChip title 한국어 → i18n-aware (commit 2196fae)
[2026-05-03 08:14] shared/ui — InlineEditable default placeholder 한국어 → 영문 (commit 619cfaa)
[2026-05-03 08:13] perf /docs — DocsSidebarBody 의 activeTagSlugs Set 매-render 생성 회피 (commit 7bc6f37)
[2026-05-03 08:11] /docs — DocsVaultTree nav aria-label 한국어 하드코딩 정리 (commit 40a7e7d)
[2026-05-03 08:10] /ontology/edit — OntologyInspector untitled-placeholder sentinel 영문 locale 회귀 fix (commit dcdd64a)
[2026-05-03 08:07] /docs — DocsVaultTags "태그" / "건" suffix i18n-aware (commit 9215135)
[2026-05-03 08:05] /docs — DocsVaultAudienceMismatchNotice 한국어 하드코딩 6 곳 → i18n (commit 3beaab0)
[2026-05-03 08:04] /topology — SigmaNodeTooltip "허브" / "연결 N" / title i18n-aware (commit 3fd1152)
[2026-05-03 08:01] shared/ui — LinkListEditor visible text + aria 6 곳 i18n (commit 6ba17fb)
[2026-05-03 07:59] shared/ui — ChipListEditor X / + 버튼 aria-label i18n-aware (commit 5def0ef)
[2026-05-03 07:46] /ontology/edit — \`P1-1 (UX-4)\` ephemeral marker 2 곳 정리 (commit 694cfb2)
[2026-05-03 07:45] /ontology — OntologyViewPage stale R10b/cloud/eval-marker 6 곳 정리 (commit 451e0b5)
[2026-05-03 07:43] messages — docsVault.advanced.ontologyHintSuffix \"21 nodes\" → \"18 nodes\" (commit 513e777)
[2026-05-03 07:42] global chrome — OperationsNav stale comment 4 곳 (rightSlot R10 / /knowledge / A2-6 / cloud ModeBadge) 정리 (commit 6376635)
[2026-05-03 07:40] mcp/ — Round 9b T1-6 / T1-8 ephemeral marker 4 곳 정리 (commit f4662e8)
[2026-05-03 07:38] /project/[slug]/edit — ProjectEditorPage 의 R10b 잔존 cloud-mode 주석 3 곳 정리 (commit 20721ed)
[2026-05-03 07:37] /project/[slug] — ProjectDetailPage 의 R10/R10b/P1-5 ephemeral 주석 5 곳 정리 (commit 3619358)
[2026-05-03 07:36] /projects — ProjectSelectorPage stale 주석 / ephemeral marker 정리 (commit 137a541)
[2026-05-03 07:34] messages + 2 view — edgeTypeKo* i18n 키 → edgeType* 명명 정정 (commit 36b4a57)
[2026-05-03 07:29] /ontology/insights — formatRelativeDate fallback 의 ko-KR 하드코딩 → locale-aware (commit 1ebdb89)
[2026-05-03 07:27] /topology (HomePage) — R10-leftover dead state 2 개 (dismissAccountMenu / selectorOpen) 영구 제거 (commit 51e9f19)
[2026-05-03 07:26] / (LandingPage) — MiniTopology caption 의 nodes/relations 카운트 array.length 에서 derive (drift risk 차단, commit ecac64d)
[2026-05-03 07:24] docs/ontology — project.md frontmatter 정정 (broken \`domain: workbench\` + 잘못된 element kind 분류 + 중복 relates, commit d2e205c)
[2026-05-03 07:22] features/locale-switch — EN/KO 버튼에 locale.{english,korean} aria-label 와이어업 (orphan 키 → a11y 가치, commit f9fe9c6)
[2026-05-03 07:21] design tokens — prefers-contrast:more 의 light 모드 회귀 (light gray on light gray) 정정 (commit 67def65)
[2026-05-03 07:20] features/docs-vault-local — LocalVaultPicker 마지막 스캔 툴팁 날짜 locale-aware (commit 7ba3f6c)
[2026-05-03 07:19] shared/ui — ToastProvider region aria-label "작업 알림" 한국어 하드코딩 → locale-aware (commit 3b75918)
[2026-05-03 07:18] global chrome — BottomTabBar 홈 탭이 /ontology · /topology 에서도 활성화 (matchPrefixes 무시 회귀 fix, commit 552618e)
[2026-05-03 07:14] /project/new — metadata title 도 locale-aware (en: New project / ko: 새 프로젝트, commit 8dae59b)
[2026-05-03 07:13] 7 페이지 metadata — title 하드코딩 한국어 → locale-aware generateMetadata (영문 탭 표시 회귀 종결, commit b1871e6)
[2026-05-03 07:08] features/docs-vault-local — ontology-starter 의 stale evidenceIds → relates / path 정정 (commit 5ea5aba)
[2026-05-03 07:05] cli/templates/vault/{domains,capabilities,elements} — stale evidenceIds → relates / path (commit 5176858)
[2026-05-03 07:02] cli/templates/vault/README — stale tools / kind / hosted URL 정리 (commit a0d936f)
[2026-05-03 06:58] .claude/rules/git — stale account-scope 예시 정정 (commit 93ab563)
[2026-05-03 06:55] mcp/ — verify CLI 출력 sample 의 stale 노드 카운트 정정 (commit 2787acc)
[2026-05-03 06:51] global chrome — OperationsNav 의 stale `id: 'knowledge'` → `'docs'` (commit 31791c2)
[2026-05-03 06:48] shared/config — dead env.ts 영구 삭제, 사용자 false-warning 회귀 종결 (commit 1a0594e)
[2026-05-03 06:44] database/ddl/postgres — orphan SQL DDL 폴더 영구 삭제 (~750 LOC, commit 0a99b6a)
[2026-05-03 06:42] .claude/rules/documentation — 사라진 docs / Firestore 가이드 정리 (commit 2b791ee)
[2026-05-03 06:41] CONTRIBUTING — entities/<x>/api firestore 분리 룰 설명 정리 (commit 6805894)
[2026-05-03 06:40] docs/launch/HN-POST — \"11 tools\" → \"12 tools\" (commit 671e0d2)
[2026-05-03 06:39] docs/launch/REDDIT-POSTS — MCP 도구 카운트 + firebase 표현 정리 (commit b438247)
[2026-05-03 06:38] docs/launch/X-THREAD — MCP 도구 카운트 + firebase 표현 정리 (commit 0aede51)
[2026-05-03 06:37] docs/launch/README — Firebase deploy / MCP 카운트 정리 (commit b497ec5)
[2026-05-03 06:35] docs/BACKLOG — R10b-사라진 Firestore archival / collection 통합 task → VOID (commit cd206d6)
[2026-05-03 06:34] docs/TROUBLESHOOTING — stale Firebase 섹션 정리 (commit ebb8e73)
[2026-05-03 06:22] docs/FEATURES — §5 mission v2 + R10 removal 섹션 합성·확장 (commit c3d1e28)
[2026-05-03 06:21] docs/FEATURES — §8.2 Hosting + §8.4 OSS docs 표 정리 (commit c8df4ce)
[2026-05-03 06:20] docs/FEATURES — §6 Verification stale 카운트 + 날짜 갱신 (commit 4cdc6f2)
[2026-05-03 06:19] docs/FEATURES — fallback page + intentional absences 정리 (commit d2ef0fa)
[2026-05-03 06:18] docs/FEATURES — data flow 다이어그램 + 부수 위젯 표 정리 (commit f9a354d)
[2026-05-03 06:17] docs/FEATURES — hook reference 표의 stale cloud / accountId 정리 (commit 286ad15)
[2026-05-03 06:16] docs/FEATURES — projects 섹션 + fallback 의 stale Firestore refs 정리 (commit 68fd799)
[2026-05-03 06:15] docs/FEATURES — /ontology + /ontology/edit 의 stale cloud refs 정리 (commit b979d53)
[2026-05-03 06:14] docs/FEATURES — mode branching 섹션을 R10b reality 로 갱신 (commit df7fe6e)
[2026-05-03 06:03] docs/ontology — capabilities/builder-vault-write stale 문서 ref / 작업 ID 정리 (commit a4311c4)
[2026-05-03 06:02] views/ontology-edit — OntologyInspector deps 복합 표현 추출 (commit 2f2dabb)
[2026-05-03 06:01] views/ontology-view — selectNode 를 useCallback 으로 안정화 (commit f0d5261)
[2026-05-03 06:00] views/ontology-view — NodeDetailPanel unused ownDocumentId 제거 (commit acc8b7b)
[2026-05-03 05:59] views/project-detail — unused currentPath / pathname / searchParams 정리 (commit 40d7fab)
[2026-05-03 05:57] shared/ui — StaggeredFadeIn unused eslint-disable directive 제거 (commit 0d8c6bc)
[2026-05-03 05:56] views/ontology-view — 3 unused 변수 / import (locale / isVaultSentinelMode / isVaultSentinelDate, commit 2ddfc10)
[2026-05-03 05:55] views/ontology-edit — OntologyEditPage unused searchParams + import 제거 (commit 7cf57fc)
[2026-05-03 05:54] views/home — HomePage 의 4 unused 변수 정리 (resetSigmaFilters / setSelectorOpen / handleToggleHub / hideMobileOverlayControls, commit c6d8afb)
[2026-05-03 05:45] shared/ui — locale-redirect SUPPORTED const → union 타입 (commit 3dc8442)
[2026-05-03 05:44] views/home — HomePage unused Project import 제거 (commit 518be7c)
[2026-05-03 05:43] mcp/ — deleteConcept dry-run 부재 misleading 안내 fix + unused 변수 (commit f247a06)
[2026-05-03 05:41] shared/lib — parse-frontmatter unused ParsedValue 타입 제거 (commit 9bb43f2)
[2026-05-03 05:40] messages — 4 i18n orphan 키 일괄 정리 (commit b99d82e)
[2026-05-03 05:39] widgets/topology-map-sigma — SigmaControls 의 hardcoded 라벨 6 개 i18n 와이어업 (commit 22ddb6e)
[2026-05-03 05:36] messages — ontologyView R10b orphan 5 키 정리 (commit 6a0101a)
[2026-05-03 05:35] /ontology — getStarted.stepCloud* → stepStatic* 명명 정확화 (commit a3fbcb8)
[2026-05-03 05:33] messages — ontologyView.footer.modeCloud orphan 키 제거 (commit dc0cd54)
[2026-05-03 05:22] entities/ontology-class — defaults JSDoc 의 사라진 sync target 정정 (commit d6169c1)
[2026-05-03 05:21] shared/lib — orphan ontology-frontmatter lib 영구 삭제 (~680 LOC, commit 62be85c)
[2026-05-03 05:20] docs/ontology — capabilities/topology-sigma-render element path 정정 (commit b624d85)
[2026-05-03 05:19] docs/ontology — capabilities/ontology-hub-mode-aware 정확한 hook 분기 갱신 (commit 30d97f6)
[2026-05-03 05:18] docs/ontology — capabilities/frontmatter-to-ontology path + kind 정정 (commit 6d51fe5)
[2026-05-03 05:17] docs/ontology — elements/file-system-access-api broken indexed-db ref 제거 (commit 6fa7940)
[2026-05-03 05:16] entities/project — projectToInput JSDoc stale Firestore mapper 언급 정정 (commit 3350b81)
[2026-05-03 05:15] entities/{category,status} — types JSDoc Firestore 문서 ID 정정 (commit db054ab)
[2026-05-03 05:14] entities/ontology-relation — orphan TBox seed 폴더 영구 삭제 (~326 LOC + 테스트, commit 7cdd793)
[2026-05-03 05:04] docs/ontology — domains/mode-aware-adapters.md broken refs → mode-aware-adapter (commit fa29676)
[2026-05-03 05:03] docs/ontology — domains/vault-local-first.md broken capability refs 6개 제거 (commit d3bc9aa)
[2026-05-03 05:02] docs/ontology — domains/ontology-core.md broken refs reconcile (commit 909e9d3)
[2026-05-03 05:01] docs/ontology — domains/onboarding-ux.md broken capability refs 7개 제거 (commit f34dd69)
[2026-05-03 05:00] messages — featuresMisc + settings 9 sub-key namespace 영구 복구 (R10c 잘못 삭제, commit 243b2e2)
[2026-05-03 04:58] messages — ontologyView i18n namespace 영구 복구 (R10c 잘못 삭제, commit 01b1add)
[2026-05-03 04:55] entities/project — types JSDoc 의 Firestore 참조 제거 (commit fe26900)
[2026-05-03 04:54] entities/docs-vault — derive-ontology JSDoc 의 stale kind / Firestore 참조 정정 (commit 8a25746)
[2026-05-03 04:53] features/data-source-mode — useDataSourceMode JSDoc stale 'cloud' enum 정정 (commit e4522d4)
[2026-05-03 04:43] features/project-import — orphan CSV import 폴더 영구 삭제 (~350 LOC, commit 74e560f)
[2026-05-03 04:42] features/topology-layout — orphan computeInitialLayout 폴더 영구 삭제 (~310 LOC, commit 8dd5b06)
[2026-05-03 04:41] 5 surface — stale Firestore 코멘트 일괄 정정 (commit d4a2346)
[2026-05-03 04:39] entities/knowledge-graph — KnowledgeGraphSource 의 dead 'extraction' 값 narrow (commit bb1c60a)
[2026-05-03 04:38] widgets/project-ontology-overview — useMemo deps 안정화, exhaustive-deps 경고 해소 (commit b0ba433)
[2026-05-03 04:37] messages — modeBadge.demoTooltip "비로그인/signed out" 제거 (commit 66736be)
[2026-05-03 04:36] /ontology/edit — toastDemoMode "로그인하세요" 잘못된 instruction 정정 (commit 2560187)
[2026-05-03 04:35] entities/knowledge-graph — KnowledgePublicMeta 타입 + insight.meta 필드 영구 제거 (commit 98e78d7)
[2026-05-03 04:33] entities/knowledge-graph — dead evidence-summary lib 영구 삭제 (~280 LOC, commit 742b7f8)
[2026-05-03 04:30] docs/ontology — domains/views.md broken capability refs 정리 (commit f539070)
[2026-05-03 04:29] messages — topologyWidgets.projectKnowledge 22 키 (per locale) orphan 정리 (commit cf26567)
[2026-05-03 04:27] mcp/ — add_concept canonical kind enum 검증 + schema description fix (commit ce45490)
[2026-05-03 04:26] widgets/project-knowledge-topology — dead widget 영구 삭제 (875 LOC, commit 44901a5)
[2026-05-03 04:24] /project/[slug] — dead knowledgeInsight 분기 영구 제거 (~259 LOC + i18n 24 키, commit f778118)
[2026-05-03 04:20] /ontology — stat strip + footer 의 dead publishedAt 분기 제거 (commit 84ed367)
[2026-05-03 04:17] /docs — adminDashboardHref → projectsListHref 명명 정정 (commit a510d57)
[2026-05-03 04:16] features/taxonomy + entities/{category,status} — firebase 우회 주석 + import 통합 (commit b551d06)
[2026-05-03 04:14] / (HomePage) — firebase-우회 직접 파일 import 를 barrel 로 통합 (commit 1b743c1)
[2026-05-03 04:09] scripts/check-bundle — dead cloud-admin 보고 분기 제거 (commit e6443db)
[2026-05-03 04:08] docs/ontology — ai-agent-partner 정확한 capability + 12 도구 카운트 (commit fe3c9e3)
[2026-05-03 04:07] messages — R10-leftover toast/confirm/role 6 키 정리 (commit 0597367)
[2026-05-03 04:04] messages — ontologyWidgets.manual{Node,Edge} 50 키 R10b orphan 정리 (commit b1bbd73)
[2026-05-03 04:02] design tokens / BottomTabBar — locale-stable selector data-tabbar=primary (commit 237d4ec)
[2026-05-03 04:00] features/docs-vault-local — LocalVaultPicker setInterval 변수 shadow 회피 (commit 8b93e9c)
[2026-05-03 04:00] widgets/ProjectDrawer — dead evidence section + i18n 9 키 정리 (~135 LOC, commit 9de6a19)
[2026-05-03 03:57] global chrome — MountedGlobalSearch nodes EMPTY frozen reference (perf, commit 2cd985c)
[2026-05-03 03:55] mcp/ — slugToPath path traversal 차단 (vault root 외부 read/write 봉쇄, commit 3a83c52)
[2026-05-03 03:47] entities/knowledge-graph — dead manual-{node,edge}-input validators 4 파일 삭제 (~433 LOC, commit b548aef)
[2026-05-03 03:45] features/project-quick-create — dead accountId prop / payload 합성 정리 (commit 9fe867c)
[2026-05-03 03:44] entities/project — Project / ProjectInput 의 dead accountId 필드 제거 (commit 67929a8)
[2026-05-03 03:43] /ontology — dead accountId / 'cloud' 모드 타입 정리 (NodeDetailPanel/CopyNodeLinkButton/footer, commit a87643d)
[2026-05-03 03:41] /docs — dead accountId 분기 + 무의미 useMemo 제거 (commit c257e16)
[2026-05-03 03:40] /topology (SigmaTopology) — borderColor 가 vault ontology kind 다시 반영 (useOntologyInsight 와이어, commit 2bc7b8c)
[2026-05-03 03:39] / (HomePage) — 항상-빈 selectedKnowledgeInsight 분기 영구 제거 (~114 LOC + i18n orphan, commit 82d81d8)
[2026-05-03 03:35] docs/ontology — MCP 도구 카운트 12 (read 8) 갱신 (mcp-server.md + README.md, commit cbae6e0)
[2026-05-03 03:34] docs/ontology — project.md capabilities 가 실제 capabilities/ 폴더와 reconcile (broken refs 2 fix, commit dc56a71)
[2026-05-03 03:27] messages — landing.returnTarget* 5 R10-leftover 키 정리 (commit 0606f50)
[2026-05-03 03:25] features/docs-vault-local — ontology-starter README 도구 카운트 12 (read 8) 갱신 (commit 56ecbe9)
[2026-05-03 03:24] shared/ui — StaggeredFadeIn 의 중복 reduced-motion JS 분기 제거, CSS-only 단순화 (commit 12444bb)
[2026-05-03 03:23] global chrome — MountedGlobalSearch 가 vault ontology nodes surface (commit 75a74fd)
[2026-05-03 03:22] mcp/ — findPath 의 nonexistent equal slug fake path 회귀 fix + BFS perf 정리 (commit 8dfb570)
[2026-05-03 03:20] views/project-editor — dead accountId prop / payload 덮어쓰기 제거 (commit d91e7a2)
[2026-05-03 03:19] views/project-detail — accountId 전체 제거 (Props/TopBar/State/save 4건, commit dcd79c1)
[2026-05-03 03:17] /projects — ontology 카운트 vault 진실원에 다시 연결 (EMPTY placeholder 정리, commit b277d6d)
[2026-05-03 03:16] /ontology/relations — sentinel 모드 dead strongEdges 계산 skip + typeMax memo (commit ccb9f87)
[2026-05-03 03:08] views/ontology-edit — export accountId 의존 제거 (URN/GraphML/파일명 'atlas' 고정, commit 2f3d632)
[2026-05-03 03:05] widgets/SigmaTopology + ProjectDrawer — dead accountId prop 제거 (3 mount 사이트 동시, commit eaa7921)
[2026-05-03 03:00] views/ontology-insights + relations — dead accountId const 5 줄 정리 (commit 7d6aea4)
[2026-05-03 02:43] shared/lib — account-scope.ts 영구 삭제 (caller 0, commit b61d338)
[2026-05-03 02:42] app/project/new — ProjectNewClientPage dead account query 정리 (commit 6128162)
[2026-05-03 02:41] views/project-selector — 사용 안 하는 ACCOUNT_QUERY_KEY import 제거 (commit e08188d)
[2026-05-03 02:40] widgets/workspace-strip + ontology-overview — useOntologyInsight() arg 정리 (commit b1d7092)
[2026-05-03 02:39] 4 surface ACCOUNT_QUERY_KEY ternary 일괄 정리 (OntologyEdit/View/ProjectOntologyOverview/DashboardOntologySummary, commit 67a445c)
[2026-05-03 02:38] `/project/[slug]` — Breadcrumb + docs link 의 ?account= 분기 제거 (commit 6c7e9bc)
[2026-05-03 02:37] entities/project — getTopologyProjectHref dead accountId/projectId 인자 제거 (commit 97361e9)
[2026-05-03 02:36] entities/project — getProjectDetailHref/Url dead accountId/projectId 인자 제거 (commit f9adccb)
[2026-05-03 02:35] global chrome — MountedGlobalSearch dead 'accountId' + legacy 'returnTo' prop 제거 (commit 1de7df4)
[2026-05-03 02:21] messages — modeBadge.cloud{Label,AriaLabel,Tooltip} orphan keys 제거 (commit ab808bf)
[2026-05-03 02:20] AGENTS/README — dogfood 노드 카운트 21→18 갱신 (commit 8bdd60b)
[2026-05-03 02:19] docs/ontology — vault README capability 카운트 9→6 (commit 47ee2be)
[2026-05-03 02:18] docs/ontology — R10 후 사라진 capability 3개 (tbox-versioning, v1-1-qualifiers-rank, v1-5-cardinality) 정리 (commit 862fff6 + project.md update)
[2026-05-03 02:17] entities/knowledge-graph — KnowledgeEdgeType 주석 stale Firestore 컬렉션 ref 정리 (commit 862fff6)
[2026-05-03 02:16] `/projects` — ontologyCountBySlug → module-scope EMPTY const (perf, commit bfc9a8f)
[2026-05-03 02:15] messages — nav.search + nav.shortcuts orphan keys 제거 (commit d86ff3e)
[2026-05-03 02:14] `/project/[slug]/edit` — ProjectEditClientPage dead account query plumbing 제거 (commit b9eafd3)
[2026-05-03 02:02] app/[locale]/page.tsx — stale '?account=' 주석 정리 (commit fafb343)
[2026-05-03 02:01] docs/ontology — vault README 도메인 카운트 8→6 갱신 (commit 510eb03)
[2026-05-03 02:00] global chrome — OperationsNav dead 'rightSlot' prop 제거 (commit 87e99e8)
[2026-05-03 01:59] mcp/ — query DSL equality 대소문자 무시 (Panel E T1-2) (commit b659344)
[2026-05-03 01:58] `/project/[slug]` — dead 'accountId ?? project.accountId' fallback 사슬 제거 (commit beb1bb0)
[2026-05-03 01:57] `/ontology/edit` — forceAtlas2 iterations vault 크기에 따라 graceful degrade (commit f3db24a)
[2026-05-03 01:56] `/docs` — tagCounts useMemo, palette 가 매 render 새 array 받지 않도록 (commit fcf0da3)
[2026-05-03 01:43] global chrome — MountedGlobalSearch dead account query 분기 + ACCOUNT_QUERY_KEY import 제거 (commit 60d5dfc)
[2026-05-03 01:43] mcp/ — get_concept missing slug 시 절대 경로 leak 차단 (commit b020123)
[2026-05-03 01:42] `/project/[slug]` — ProjectDetail empty-state accountId 분기 + dead 'projects list' fallback 제거 (commit caf3ca3)
[2026-05-03 01:41] `/ontology/edit` — export accountId 직접 'unscoped' 인라인 (commit 05da736)
[2026-05-03 01:40] `/ontology/insights` + `/ontology/relations` — useOntologyInsight() arg + dead ternary 정리 (commit 7331b55)
[2026-05-03 01:39] `/ontology` — useOntologyInsight() arg 제거 (commit 543e45f)
[2026-05-03 01:38] `/topology` — SigmaTopology dead useMemo 제거, module-scope EMPTY_ONTOLOGY_COUNTS 로 (commit b327d64)
[2026-05-03 01:33] `/` (landing) — StaggeredFadeIn HTML 무효 wrapper 제거, list semantics 회복 (commit 820927d)
