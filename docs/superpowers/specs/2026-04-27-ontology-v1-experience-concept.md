---
name: 온톨로지 v1 — Experience Concept
description: v0 백본 완료 후 사용자 경험·UI/UX 단계의 살아 있는 기획 문서
status: 🌱 draft (loop iter 1)
date: 2026-04-27
related-loop: 15분 cron */15 * * * * (CronCreate 4f59a674) — `/Users/stark/.claude/projects/-Users-stark-ai-project-map/memory/ontology-loop-state.md`
---

# 온톨로지 v1 — Experience Concept

> v0 가 "온톨로지를 **만들 수 있는** 시스템" 까지 깎았다면, v1 은 "**그게 있어서** 사용자가 더 잘 만나고·찾고·이해하는" 단계다. 살아 있는 기획 문서. 매 루프 갱신.

---

## 0. 이 문서의 위치 / 참고 문서

- v0 (참고만, 이 루프에서 직접 수정 X):
  - [`2026-04-27-ontology-design-loop.md`](./2026-04-27-ontology-design-loop.md) — 자율 기획-구현 루프, C-1 phase 종결
  - [`2026-04-27-ontology-frontmatter-contract.md`](./2026-04-27-ontology-frontmatter-contract.md) — md frontmatter v1 계약 (등급 A/B/C)
  - [`2026-04-27-ontology-id-resolution.md`](./2026-04-27-ontology-id-resolution.md) — canonical node ID + stub
  - [`2026-04-27-ontology-c1-runbook.md`](../notes/2026-04-27-ontology-c1-runbook.md) — 측정 runbook
- v1 (이 문서) — UX 출발점 + backlog. 사용자 피드백마다 §3·§4·§6 즉시 갱신.

---

## 1. 한 문장 (이 줄에 합의가 있어야 v1 의 모든 결정이 안 흔들림)

> **온톨로지가 보이지 않게 작동하면서, 모든 surface (홈 / 프로젝트 / 문서) 에서 사용자가 "필요한 것을 더 빠르게 만난다."**

핵심 키워드:

- **보이지 않게** — `/ontology` 가 메인 surface 가 되는 건 v1 의 목표가 아니다. ontology 는 척추, 사용자 surface 는 토폴로지·프로젝트 상세·문서·검색.
- **만난다** — 검색·탐색·추천 — 능동·수동 둘 다.

---

## 2. v0 가 만든 것 (한 화면 요약)

| 영역 | 결과물 |
|---|---|
| **TBox** | 5 클래스 (project / domain / capability / element / document) + 7 관계 (contains / belongs_to / depends_on / implements / uses / describes / related_to) + `unknown` placeholder |
| **입력 계약** | md frontmatter v1 (등급 A/B/C — 신뢰도 cap 1.0 / 0.84 / 0.59) |
| **추출 워커** | Cloud Functions (`processExtractionJob`) — Anthropic engine, ontology grade 적용 |
| **검수** | `applyReviewActionCore` 분기, `promoteStubNode` / `dismissStubNode` |
| **저장** | `knowledgeApprovedNodes` / `knowledgeApprovedEdges` (canonical) + `knowledgeExtractionJobs` |
| **UI** | `/ontology` 트리 + 노드 상세 패널 + stub 리스트 widget + e2e smoke |

→ 즉 "백엔드·검수 백본 + 트리 형 viewer 1 개" 까지 닿은 상태.

---

## 3. v1 이 답할 질문 (이 4 개를 못 답하면 어떤 UI 도 헛돈다)

1. **사용자에게 ontology 가 있는 것과 없는 것이 어떻게 다른가?** (가치 명세)
2. **`/ontology` 라우트는 누가 무슨 목적으로 쓰는가?** (현재는 진안의 검수용 트리 ⇒ v1 에서 더 확장될지, 흡수될지)
3. **홈 토폴로지 (공개) ↔ ontology (비공개 canonical) 가 어떻게 연결되나?** (`knowledgePublicNodes/Edges` projection 의 첫 사용처)
4. **새 문서를 넣을 때 ontology 가 어떻게 도와주나?** (frontmatter 추천·중복 감지·자동 위치 배치)

각 질문의 잠정 답은 §4 시나리오 + §6 backlog 로 분해.

---

## 4. 핵심 사용자 시나리오 5 개

> 한 시나리오당 "**누가 / 어디서 / 무엇을 / 결과로 무엇이 달라지는가**" 4 줄.

### S1 — 방문자, 홈에서 한눈에 "무엇이 무엇이며"

- **누가**: 외부 방문자
- **어디서**: 공개 홈 `/` 토폴로지
- **무엇을**: 노드 색·모양만 봐도 project / domain / capability / element 이 구분
- **결과**: 동질 노드 점토(현재) → 이질 클래스가 보이는 지도. ontology 가 있어야 가능한 첫 가시 효과.

### S2 — 진안, 새 capability 추가 시 ontology 가 도움

- **누가**: 진안 (주인)
- **어디서**: 새 md 문서 작성 / 업로드 직후 모달
- **무엇을**: frontmatter 의 `kind / project / domain / aliases` 추천. 비슷한 기존 노드 후보 (중복 방지) 표시.
- **결과**: 등급 A 진입율 ↑ → 추출 신뢰도 cap 1.0 → 자동 승인 가능.

### S3 — 진안, ontology 트리에서 한 노드 → 모든 컨텍스트로 점프

- **누가**: 진안
- **어디서**: `/ontology` 노드 상세 패널 (현재 트리 + 상세까지 있음)
- **무엇을**: "관련 문서 (evidenceIds) / 의존 / 역의존 / 같은 domain 의 다른 capability" 가 한 패널에서 보임 + 클릭 점프.
- **결과**: ontology 가 단순 viewer 가 아니라 **navigation hub** 로 격상.

### S4 — 누구나, 글로벌 검색 1 회로 노드·문서·프로젝트 통합 점프

- **누가**: 진안 + 방문자
- **어디서**: 글로벌 검색 (cmdk 후보, 현재 없음)
- **무엇을**: "auth-login" 1 회 검색 → ontology 노드 + 관련 md 문서 + 해당 프로젝트 + 토폴로지 위치 4 종 통합 결과.
- **결과**: ontology 가 검색의 의미 backbone 으로 작동. naive title 검색을 대체.

### S5 — 진안, 임의 노드에서 "관련 개념" 1-hop / 2-hop 탐색

- **누가**: 진안
- **어디서**: `/ontology` 노드 상세 패널 안의 작은 sigma 인스턴스 (또는 풀 화면 Expand)
- **무엇을**: 현재 노드 중심 1-hop ego graph → 2-hop 토글 → 흥미로운 관계 발견.
- **결과**: Roam style backlinks 의 ontology 강화 버전. ontology 가 있어서 가능한 "관계 탐색".

---

## 5. UI / UX 진입점 매핑

| 시나리오 | 진입점 (기존 surface 우선) | 새 surface 필요? |
|---|---|---|
| S1 | 홈 토폴로지 (`/`) — 노드 스타일 분기 | X (기존 sigma 위에 색 분기) |
| S2 | `/knowledge/documents/[id]` 작성 직후 모달 | △ (모달 신규, 라우트는 기존) |
| S3 | `/ontology` 상세 패널 확장 + `/knowledge/documents/[id]` 양방향 링크 | X (기존 surface 안) |
| S4 | 글로벌 검색 widget (cmdk, ⌘K) | ○ (신규 widget — 모든 surface 공통) |
| S5 | `/ontology` 상세 패널 안의 mini sigma | X (기존 surface 안) |

→ **새 라우트 0 개**. 기존 surface 의 자연스러운 확장.

---

## 6. 작업 backlog (우선순위 — 매 루프 머리에서 1 개)

### 가장 가벼운 슬라이스부터 (먼저 5 개 — 각 1~2 루프 분량)

- ✅ **O-1** (iter 2) `/ontology` 노드 상세 패널 → "관련 문서" 섹션 (`evidenceIds` 활용, 클릭 시 `/knowledge/documents/view/?id=` 점프)
- ✅ **O-2** (iter 3) `/ontology` 트리 → 노드 kind 별 inline 라벨 chip + 라벨 단일화
- ✅ **O-3** 글로벌 cmdk 검색 widget — 본 task 완료 (iter 10):
  - ✅ **O-3a** (iter 5) cmdk 패키지 + widget shell + ⌘K hotkey + ontology 노드 source + `/ontology` mount + 결과 행 메타 (iter 6 polish)
  - ✅ **O-3b** (iter 8-10) documents source — 매처(b-1) + UI 다중 그룹(b-2) + `/ontology` subscribe·wire(b-3). projects 는 별도 fire 로 미룸.
  - ✅ **O-3c** 다른 surface mount — `MountedGlobalSearch` wrapper + `useGlobalSearchHotkey` hook (iter 12). `/knowledge/documents` (iter 12) + `/review/knowledge` + `/knowledge` 대시보드 (iter 13) 모두 mount. Home 은 기존 SearchPalette 와 동거 결정 후 별도.
- ✅ **O-4** (iter 3) 홈 hero `HeroHeader` + `HeroCollapsed` 양쪽에 "온톨로지" pill 진입점
- ✅ **O-5** 노드 상세 패널 1-hop / 2-hop — 본 task 완료 (iter 41):
  - ✅ **O-5a** (iter 4) 1-hop 관계 텍스트 리스트 (방향 · edge type · 이웃 kind · 클릭 시 selectedNode 전환 chain)
  - ✅ **O-5b** (iter 11) **SVG 시각화** — sigma 대신 SVG (1-hop 보통 < 12 노드, SSR friendly + cleanup 부담 X). radial layout (12시 시작, 시계 방향), outgoing 인디고/incoming 무채색 화살표. 미연결 (stub) 이웃은 amber 톤. 클릭으로 selectedNode 전환 (텍스트 리스트와 같은 chain).
  - ✅ **O-5c** (iter 41) **2-hop 토글** — `buildOntologyEgoSubgraph` 에 `hops?: 1 | 2` 옵션 + BFS (1-hop 우선, cycle 방지, stub pivot 제외). `buildRadialEgoLayout` 동심원 (1-hop inner / 2-hop outer ring, `innerRadiusRatio` 기본 0.55). `OntologyEgoGraph` hop 별 시각 위계 (hop=2 stroke alpha / radius 약화). `NodeDetailPanel` 헤더에 "1-hop / 2-hop" 라디오 토글, 노드 변경 시 자동 1-hop 복귀. S5 closure.

### 중간 단계 (다음 5 — 컨텍스트 더 필요)

- **O-6** frontmatter 추천 패널 (S2 — `aliases` 후보 + 중복 노드 감지)
- ✅ **O-7** (iter 4) `/ontology` 빈 상태 → 3 단계 onboarding + "문서 볼트" 1차 CTA
- **O-8** 검수 큐 inbox UI 정돈 (`/review/knowledge` Phase 2 일부)
- **O-9** 홈 토폴로지에 ontology projection 가시화 (S1 — 첫 인상 임팩트). sub-task:
  - ✅ **O-9a** (iter 39) 워크스페이스 보기에 `<WorkspaceOntologyStrip>` 한 줄 mount — selectedProject 없을 때만 노출. ontology 노드 N · kind chip · stub amber pill. 가벼운 슬라이스로 즉각 인지.
  - ✅ **O-9b** sigma 토폴로지 project 노드 borderColor 분기 — `buildGraph` 에 `ontologyCountsBySlug` 옵션 + `pickDominantOntologyKind` + `ontologyBorderTone` 순수 함수 chain. plain project (container / hub 제외) 만 적용 — domain 블루 그레이 / capability 인디고 alpha 0.75 / element 틸 그레이 / unknown amber. fill 무채색 + 단일 두께 (1.5px) 유지로 헌장 §11 "size 변동 금지 / 둘 이상의 채색 시스템 금지" 준수. SigmaTopology 가 `useKnowledgePublicNodes(accountId)` 구독, HomePage / ProjectDetailPage 패스스루.
- **O-10** 사용자 onboarding (한국어 spec frontmatter 가이드 inline)

### 보류 (백본 더 필요)

- ontology-aware semantic search (vector + relations) — v0 T-11 측정 결과 후 비용 판단
- LLM agent 형 chat surface
- 모바일 전용 ontology UX (S1 / S4 부터 desktop-first 인라인)

---

## 7. 디자인 원칙 reminder

- **Linear 무채색 + 단일 인디고 `#5e6ad2`** 만. kind 별 색은 **chroma 변동 없는 hue** 한 톤씩 (예: 인디고 / 슬레이트 / 제이드 — DESIGN-SYSTEM 정의 후 사용).
- **금지** — 보라핑크 그라디언트 / glassmorphism / glow pulse / scale hover / 움직이는 그라디언트 배경.
- **새 라우트 추가 금지** — 기존 surface 흡수 우선. 새 라우트가 정말 필요하면 §5 매핑부터 다시 갱신.
- **공개 surface 데이터 경계** — `/` 와 `/projects` 와 `/project/[slug]` 는 `knowledgePublicNodes/Edges` 만 읽는다. canonical (`knowledgeApproved*`) 직접 읽기 금지.

---

## 8. 사용자 확인 필요 항목 (다음 메시지 시 우선 처리)

- §1 한 문장 동의?
- §4 시나리오 5 개 중 "이거 먼저" 가 어디?
- §6 backlog O-1 ~ O-5 우선순위 OK? (아니면 O-3 cmdk 부터? O-4 진입점부터?)

→ 사용자 답이 없으면 기본 우선순위 = O-1 → O-2 → O-3 → O-4 → O-5 순.

---

## 9. 갱신 규칙

- 매 루프 시작 시 §6 backlog 머리에서 1 개 선택, 끝낼 분량 (15 분 안) 인지 확인
- 사용자 피드백 시 §1 / §3 / §4 / §6 가운데 영향받는 섹션 즉시 갱신, 갱신 한 줄을 §10 에 추가
- 같은 작업이 2 루프 이상 걸리면 §6 에서 sub-task 로 쪼개기

---

## 10. 갱신 로그

- 2026-04-28 — iter 41 — **O-5c 완료** (S5 시나리오 closure). build-ego 에 hops 옵션 + 2-hop BFS (1-hop 우선 / cycle 방지 / stub pivot 제외, 7 vitest). ego-layout 동심원 (innerRadiusRatio 기본 0.55, 1-hop 만일 때 단일 ring 회귀, 4 vitest). OntologyEgoGraph hop 별 시각 위계. NodeDetailPanel 헤더에 라디오 토글, selectNode 헬퍼로 노드 변경 시 자동 1-hop 복귀. v1 spec §4 시나리오 5/5 모두 닫힘 — S1(O-9b) S2(O-6) S3(O-1·O-5) S4(O-3) S5(O-5c).
- 2026-04-28 — iter 40 — **O-9b 완료** (S1 시나리오 closure). plan mode 로 검토·디자인·실행 한 fire (5 commit). `src/shared/lib/ontology-tree/project-ontology-counts.ts` (집계 + 도미넌트 결정, 11 vitest) + `src/widgets/topology-map-sigma/lib/ontology-tone.ts` (kind → border RGBA, 6 vitest) + `graph-build.ts` 에 `ontologyCountsBySlug` 옵션 (4 vitest) + `SigmaTopology` 가 `useKnowledgePublicNodes` 구독 + HomePage / ProjectDetailPage 패스스루. 1737줄 SigmaTopology 의 reducer 는 0 줄 손 — build 단계에서 borderColor 결정 후 sigma program attribute 통과. 헌장 §11 "size 변동 / 채색 시스템 / glow / scale" 모두 미충돌 (border 만 분기, 단일 1.5px).
- 2026-04-27 — iter 39 — **O-9a 완료** (sub-task). 홈 워크스페이스 보기 (selectedProject 없음 + 컨테이너 zoom 도 아닐 때) 에 `<WorkspaceOntologyStrip accountId={scopedAccountId} />` 한 줄 mount. 매치 0 자동 숨김. SigmaTopology 직접 손 (1737 줄) 부담을 피하면서 첫 인상 가시화 확보. O-9b (sigma 노드 색 분기) 는 별도 fire 로 보류.
- 2026-04-27 — iter 1 — v1 컨셉 문서 초안 작성, ontology-loop-state.md 메모리 생성, 첫 commit/push (이 루프).
- 2026-04-27 — iter 2 — **O-1 완료**. `/ontology` 노드 상세 패널에 "관련 문서 N" 섹션 추가 — `evidenceIds` 를 `documentTitleByEvidenceId` 매핑으로 title 복원, `/knowledge/documents/view/?id=&returnTo=/ontology/` 로 점프. document kind 노드는 "문서 열기 →" CTA 별도. 표시 6 개 + 나머지는 "+N개 더" 표기.
- 2026-04-27 — iter 3 — **O-2 + O-4 묶어서 완료**.
  - O-2: `KIND_TONE` 에 `document` (warm gray) + `unknown` (amber, 기존 stub 안내와 일관) 추가. 라벨 진실원을 `entities/ontology-class` 에 새 `getOntologyKindLabel()` 로 단일화 — `OntologyTreeView` / `OntologyViewPage` 양쪽 중복 제거. `DEFAULT_ONTOLOGY_CLASSES` (seed) 의 `name` 이 진실원. unit test 2 종 추가 (seed 6 / fallback).
  - O-4: `HeroHeader` + `HeroCollapsed` 에 `ontologyHref` prop + `Network` 아이콘 pill 추가. `HomePage` 두 hero 인스턴스에 `appendAccountQuery("/ontology/", scopedAccountId)` 전달. expanded hero 는 텍스트 pill, collapsed hero 는 원형 아이콘 — 기존 docs vault pill 패턴과 일관.
- 2026-04-27 — iter 4 — **O-5a + O-7 묶어서 완료**.
  - O-5a: 노드 상세 패널에 "관계 N" 섹션 — 1-hop ego subgraph (방향 + edge type + 이웃 노드 kind label). 이웃 노드 클릭 시 selectedNode 전환으로 그래프 탐색 chain 가능. 미존재 이웃 (데이터 갭) 은 amber 톤 비활성. shared lib 에 `buildOntologyEgoSubgraph()` + `OntologyEgoSubgraph` 타입 추가. unit test 5 종 (정렬 / self-loop / 양방향 / 미존재 노드 / 미존재 center). 1-hop sigma 시각화 (O-5b) 는 후속 sub-task 로 분리.
  - O-7: `/ontology` 빈 상태 onboarding 강화. 단일 "검수 큐 열기" CTA 만 있던 빈 상태에 "문서 등록 → 추출 돌리기 → 검수 → 승인" 3 단계 가이드 + "문서 볼트 열기" 1차 CTA 추가. 데이터 있을 때는 노출 안 됨.
- 2026-04-27 — iter 5 — **O-3a 완료 (글로벌 검색 widget 첫 슬라이스)**.
  - cmdk 1.1.1 패키지 추가. 새 widget `src/widgets/global-search/` — `Command.Dialog` 기반, Linear 톤 styling.
  - 자체 매처 `matchOntologyNodes()` (4 단계 score: title-prefix > title-substring > summary > id) — `shouldFilter={false}` 로 cmdk 는 표시·키보드 nav 만, 정렬은 우리가 통제. 한·영 혼합 매치. unit test 7 종.
  - `/ontology` 페이지에 mount + ⌘K · Ctrl+K hotkey + 헤더 "검색" 버튼. 결과 선택 시 selectedNode 로 점프 → 기존 상세 패널 흐름 재사용.
  - 다른 source (documents · projects) + 다른 surface mount 는 O-3b/c 로 분리.
- 2026-04-27 — iter 6 — **§6 backlog 진척 표시 + 검색 결과 polish + 빌드 검증**.
  - GlobalSearch 결과 행에 "근거 N" inline 메타 추가 (evidenceCount fallback evidenceIds.length).
  - §6 backlog 에 ✅ / 🟡 / ⬜ 진행 상태 마킹. O-3 sub-task (a/b/c) 명시. O-5 sub-task (a/b) 명시.
  - 553 tests passed (100 files). typecheck OK · lint OK · 빌드 성공 (Next.js 16 — /ontology static + 1994 SSG 라우트).
  - **Deploy 결정**: feature branch 상태에서 production deploy 는 사용자 확인 필요 (main 머지 후 deploy vs 직접 deploy). 카운터 5 도달했지만 사용자 답 받기 전까지 deploy 보류.
- 2026-04-27 — iter 7 — **GlobalSearch 빈 query 안내 강화 + /ontology 헤더 검수 큐 inline 진입**.
  - GlobalSearch: 빈 query 시 corpus size + 안내 ("N개 노드가 색인되어 있어요. 한·영 모두 OK"). 0 corpus 시 "검수 큐에서 후보를 승인하면 자라요". 결과 그룹 헤더가 "Ontology · 최근" / "Ontology · 매치" 로 분기 — 빈 query 일 때 sample 인지 명확.
  - /ontology 헤더의 검색 버튼 옆에 "검수 큐" pill 추가 — 데이터 있을 때도 inline 진입 가능 (기존 빈 상태 카드의 CTA 와 별개로 항상 노출).
  - 카운터 동결 유지 (5, deploy 대기). 다음 fire 도 코드 작업만.
- 2026-04-27 — iter 8 — **O-3b 1단계: `matchKnowledgeDocuments` 매처 + test (순수 함수만)**.
  - `src/widgets/global-search/lib/match.ts` 에 `matchKnowledgeDocuments()` + `KnowledgeDocumentSearchResult` 타입 추가.
  - 점수: title-prefix > title-substring > kind/projectId > id. 빈 query 는 updatedAt desc (최신 우선). 같은 점수 내 정렬도 updatedAt desc — ontology 매처 (title localeCompare) 와 다른 정렬 기준 (문서는 시간 차원이 강한 신호).
  - unit test 5 종 (정렬 / score 단계 / 같은 점수 시간 정렬 / 빈 결과 / limit). 총 12 tests passed.
  - widget UI 카테고리 분리 + /ontology subscribe 는 다음 fire (O-3b-2).
- 2026-04-27 — iter 9 — **O-3b-2: GlobalSearch UI 다중 source 지원**.
  - `GlobalSearchProps` 에 `documents` + `onSelectDocument` (옵션) prop 추가. 둘 다 전달되면 별도 그룹 노출, 없으면 ontology 만.
  - cmdk Item value 를 `<source>:<id>` prefix 로 충돌 회피.
  - empty/heading/placeholder 메시지가 documents 유무에 따라 자동 분기. footer 에 "N 색인" / "N 매치" 카운터 추가.
  - documents row: kind chip + title + projectId(데스크톱) + status. 톤은 ontology 와 시각적으로 구분 (warm gray 보더).
  - `/ontology` 페이지에서 documents subscribe 는 O-3b-3 (다음 fire). 현재는 GlobalSearch 가 documents prop 없이 호출되어 영향 없음 (ontology 결과만).
- 2026-04-27 — iter 10 — **O-3b-3: `/ontology` 페이지에서 documents wire — 검색 closure**.
  - `subscribeKnowledgeDocuments(accountId, callback, onError)` 추가. 권한 게이팅은 Firestore rules 가 처리, 권한 없으면 빈 배열로 자연스럽게 검색에서 제외. 페이지 자체 에러로 승격하지 않음.
  - GlobalSearch 에 documents prop + onSelectDocument 콜백 전달. 결과 선택 시 `useRouter().push()` 로 `/knowledge/documents/view/?id=&returnTo=/ontology/` 점프.
  - **O-3 본 task 완료** — `⌘K` 한 번으로 ontology 노드 + knowledge 문서 둘 다 검색·점프 가능. 다른 surface (홈 / 프로젝트 상세) mount 는 O-3c.
- 2026-04-27 — iter 11 — **O-5b: 1-hop ego SVG 시각화 (사용자 의구심에 임팩트 점프 답)**.
  - `shared/lib/ontology-tree` 에 `buildRadialEgoLayout()` 순수 함수 + 6 unit test (center 위치 / 12·3·6·9시 / outgoing/incoming edge 끝점 / padding inferred radius).
  - 새 widget `src/widgets/ontology-ego-graph/` — SVG 기반 (sigma 대신, 1-hop 작은 그래프엔 SVG 가 더 적합 + SSR friendly). outgoing 인디고/incoming 무채색 화살표 marker. 미연결 (stub) 이웃은 amber 톤. 라벨 anchor 자동 분기 (left/right/center).
  - NodeDetailPanel 의 "관계" 섹션 머리에 mount — 텍스트 리스트와 같은 onSelectNeighbor chain. 큰 ego (>12) 는 라벨 겹침 가능, 트리·검색 surface 가 보조.
  - 26 ontology-tree tests passed (build-tree 10 + build-ego 5 + ego-layout 6 + tree-view 5).
- 2026-04-27 — iter 12 — **O-3c 1단계: `MountedGlobalSearch` wrapper + `useGlobalSearchHotkey` hook + `/knowledge/documents` mount**.
  - `useGlobalSearchHotkey(open, setOpen)` hook 추출 — ⌘K hotkey 단일 진입점 (input/textarea/contentEditable 안에서는 default suppress).
  - `MountedGlobalSearch` widget — accountId 만 받고 ontology + documents 자체 구독 + GlobalSearch 렌더 + ⌘K hook 등록 모두 내장. onSelectNode / onSelectDocument 미제공 시 default = 라우팅 점프.
  - `/ontology` 페이지의 자체 ⌘K useEffect 를 hook 호출 한 줄로 단순화. (자체 GlobalSearch + selectedNode override 는 페이지 동작 유지하므로 그대로.)
  - `/knowledge/documents` 페이지 헤더에 `<MountedGlobalSearch accountId={accountId} returnTo="/knowledge/documents/" />` 한 줄 mount — 운영 사용자가 문서 페이지에서도 ⌘K 로 ontology + 다른 문서 검색·점프.
  - 다른 운영 surface 추가는 한 줄 mount 로 가능. Home 은 기존 SearchPalette 동거 결정 후.
- 2026-04-27 — iter 13 — **O-3c 2단계: 검수 워크스페이스 + 대시보드 mount (multi-surface)**.
  - `/review/knowledge` 페이지에 `<MountedGlobalSearch accountId={accountId} returnTo="/review/knowledge/" />` 한 줄 mount — 검수 중에도 ⌘K 로 ontology · 다른 문서 점프.
  - `/knowledge` 대시보드 페이지에도 한 줄 mount.
  - **O-3c 본 task 완료** — 운영 surface 4 곳 (ontology + documents + review + dashboard) 모두 ⌘K 글로벌 검색 가능. Home 은 기존 SearchPalette 와 동거 결정 보류.
  - **O-3 전체 완료** (a + b + c). cmdk + 다중 source + ⌘K + multi-surface 모두 wired.
- 2026-04-27 — iter 15 — **PR #57 생성** (https://github.com/AslanLabs/narnia/pull/57). 13 commit (iter 1-14) 한 view 에 모음. 사용자가 review · merge · 추가 요청 결정 쉽게. v1 backlog 진척 5/10 + 신규 widget · entity · test 요약. main 머지 + production deploy 는 사용자 결정.
- 2026-04-27 — iter 34 — **A 2단계 — frontmatter 등급 badge + slug 추천 (wizard 마무리)**.
  - 새 순수 함수 `src/shared/lib/ontology-tree/recommend-slug.ts` — title → kebab-case slug (한글 보존, 음역 X). + 8 unit test (한글 / 한·영 혼합 / 특수문자 / 연속 공백 / 영문 lower-case / 숫자 / 빈 / 전부 invalid).
  - 새 순수 함수 `src/entities/knowledge-document/model/frontmatter-grade.ts` — `computeFrontmatterGrade({ frontmatter, pageTitle, pageKind, pageProjectIds })` returns `{ grade: A|B|C, missingRequired, missingRecommended }`. ontology-frontmatter-contract §2 기준 (필수 5종 + 권장 4종). 페이지 폼 입력 fallback 으로 frontmatter 비어도 등급 추정. + 7 unit test.
  - 새 widget `<FrontmatterGradeBadge>` — A 인디고 강조 / B 무채색 / C amber. tooltip + 인라인으로 누락 키 (예: "필수 누락: id, version") 표시. 추출 워커 등급과 1:1 일치 → 사용자가 "지금 입력으로 cap 1.0 받나?" 즉각 답.
  - KnowledgeDocumentNewPage title input 아래 mount: ① ID 추천 ("ID 추천: auth-login — frontmatter id: auth-login 로 박으면 등급 ↑"), ② FrontmatterGradeBadge, ③ DocumentNewOntologyHints (iter 33).
  - 617 tests passed (107 files). typecheck/lint clean.
  - 다음 fire — iter 33+34 묶어 PR + 머지 + deploy → B Phase 1 코드 시작.
- 2026-04-27 — iter 33 — **PR #63 머지 + production deploy + B spec 작성 + A 1단계 (dedup hint)**.
  - 사용자 명시 plan: 1) deploy 2) A frontmatter wizard 3) B manual editor docs-first 4) C 보류.
  - PR #63 (1 commit, iter 32 type 필터) 머지 → main `550942f`. production deploy 진행 (사용자 명시 권한). 14 commit 누적분 사용자 손에.
  - **B docs-first**: 새 spec `docs/superpowers/specs/2026-04-27-ontology-manual-editor-v0.md` — 사용자 직접 ontology 노드 작성 surface 설계. 동기 / 시나리오 3개 / 데이터 경계 (source 필드) / firestore rules 변경 / UI 진입점 / 5 phase 단계적 구현 / 위험·대안.
  - **A 1단계**: 새 widget `src/widgets/document-new-ontology-hints/` — `<DocumentNewOntologyHints accountId title kind />`. iter 21 `findSimilarOntologyNodes` + `CandidateOntologyMatch` 재사용. title 입력 시 비슷한 기존 ontology 노드 inline 표시 (score ≥ 80 amber 경고). title 짧음 / 매치 0 자동 숨김. KnowledgeDocumentNewPage title input 아래 mount.
  - 다음 fire: A 2단계 (등급 A 진입 안내 + slug 추천), B Phase 1 (source 필드 + rules 코드 시작).
- 2026-04-27 — iter 32 — **PR #62 머지 + `/ontology/relations` edge type 필터**.
  - PR #62 (2 commit: hook + documents chip) 머지 → main `36e82e5`. 브랜치 자동 정리.
  - OntologyRelationsPage 의 분포 panel 행을 클릭 가능 button 으로 변경. selectedType state — 행 클릭 toggle, 강한 관계 list 가 selectedType 적용한 filteredEdges 로 재계산.
  - 분포 panel 활성 행은 인디고 강조 + bar 진하게 / 강한 관계 header 에 선택 type pill + "필터 해제" 버튼.
  - 사용자가 type 골라 그 종류의 강한 관계만 검토 가능 (예: depends_on 만 보기).
- 2026-04-27 — iter 31 — **`/knowledge/documents` 각 행에 "Ontology N" 카운트 chip**.
  - useKnowledgePublicNodes hook + count map (documentId 별 evidenceIds 누적). project/document kind 제외.
  - 모바일 Card: title 옆 column 안 indigo pill (count > 0 시).
  - 데스크톱 Table: 새 "Ontology" 컬럼, 0 시 "—" 표시.
  - 사용자가 어떤 문서가 ontology 에 잘 기여하나 한눈에. ProjectSelectorPage badge 패턴 동일.
- 2026-04-27 — iter 30 — **PR #61 머지 + `useKnowledgePublicInsight` hook + 3 페이지 마이그레이션**.
  - PR #61 (3 commit: hook + stub inline + relations) 머지 → main `42a3492`. 브랜치 자동 정리.
  - 새 hook `src/entities/knowledge-graph/api/use-knowledge-public-insight.ts` — `useKnowledgePublicInsight(accountId)` returns `{ insight, error }`. nodes 만 필요한 widget 은 `useKnowledgePublicNodes`, edges 도 필요한 페이지는 이쪽.
  - 3 페이지 마이그레이션: OntologyViewPage / OntologyInsightsPage / OntologyRelationsPage. 자체 useEffect + useState (insight + error) boilerplate 한 줄로 압축.
  - 602 tests passed (105 files). typecheck OK · lint OK.
- 2026-04-27 — iter 29 — **새 라우트 `/ontology/relations` — edge 단위 view**.
  - shared/lib/ontology-tree/relations.ts — `computeEdgeTypeDistribution(edges)` + `selectStrongEdges(edges, nodes, limit)` + `StrongEdgeRow` 타입. evidenceCount fallback evidenceIds.length, 같은 evidence 면 type asc 안정 정렬, fromTitle/toTitle resolve. + 7 unit test (분포 2 + strong 5).
  - 새 라우트 `app/ontology/relations/page.tsx` + 새 view `src/views/ontology-relations/`. 2 패널: Edge type 분포 (한글 라벨 + bar) + 강한 관계 top 12 (양 끝 노드 클릭 시 deeplink).
  - `/ontology` 헤더에 "관계" pill 진입점 추가.
  - 노드 (트리/insights) ↔ 관계 (relations) 두 시각 분리 — 의미 edge type 분포가 무엇인지 한눈에.
- 2026-04-27 — iter 28 — **`/ontology` 페이지에 OntologyStubList inline + 직접 promote/dismiss**.
  - 기존 OntologyStubList widget (검수 페이지에서 사용 중) 을 OntologyViewPage 에도 mount.
  - subscribeStubNodes + handlePromoteStub / handleDismissStub (검수 페이지와 같은 패턴) — promoteStubNode / dismissStubNode 호출.
  - 트리 다음에 inline section: "검수 대기 stub N" 라벨 + 에러 메시지 + widget. stubs.length 0 자동 숨김.
  - 사용자가 ontology 페이지 보다가 stub 직접 처리 가능 — 검수 큐 가지 않아도 됨. 검수 흐름 페이지 통합.
- 2026-04-27 — iter 27 — **PR #60 머지 + `useKnowledgePublicNodes` shared hook 추출 + 5 widget 마이그레이션 (boilerplate 제거)**.
  - PR #60 (4 commit: insights timeline + 트리 검색 + /projects badge + dashboard summary) 머지 → main `34c524c`.
  - 새 hook `src/entities/knowledge-graph/api/use-knowledge-public-nodes.ts` — `useKnowledgePublicNodes(accountId)`. 자체 useEffect + setState + onError boilerplate. 권한 없으면 빈 배열.
  - 5 widget 마이그레이션 — DocumentOntologyEvidenceSection / ProjectOntologyOverview / WorkspaceOntologyStrip / DashboardOntologySummary / ProjectSelectorPage. 각 widget 의 useEffect + useState 중복 코드 한 줄 hook 호출로 압축.
  - 595 tests passed (104 files). dead import 정리.
- 2026-04-27 — iter 26 — **`/knowledge` 대시보드에 `<DashboardOntologySummary>` 큰 카드**.
  - 새 widget `src/widgets/dashboard-ontology-summary/` — accountId 받고 자체 subscribe + 큰 panel: kind 분포 grid (4 클래스 + stub amber) + 최근 활동 5 + "트리 →" / "인사이트 →" 두 진입.
  - 매치 0 자동 숨김. 권한 없으면 빈 배열 → 자동 비노출.
  - WorkspaceOntologyStrip (한 줄 strip) 와 다른 큰 카드 — dashboard 시나리오 강화. KnowledgeDashboardPage 마지막 section 뒤에 mount.
- 2026-04-27 — iter 25 — **`/projects` 카드에 ontology count badge — 사용자 자주 보는 surface 가시 강화**.
  - ProjectSelectorPage 에 subscribeKnowledgePublicGraph 1 회 + projectIds count map (1994 카드 각자 subscribe 회피).
  - 각 카드 slug 라인 옆에 "Ontology N" pill (count > 0 시만, 인디고 톤). title 툴팁 "이 프로젝트의 ontology 노드 N개".
  - 사용자가 어떤 프로젝트가 ontology 풍부한지 한눈에. 매치 0 자동 숨김 → 빈 프로젝트는 노이즈 없음.
- 2026-04-27 — iter 24 — **OntologyTreeView inline 검색 필터 — ⌘K 글로벌과 별개로 트리 안 좁히기**.
  - shared/lib/ontology-tree/filter-tree.ts — `filterTreeByQuery(roots, query)`. 매치 노드 + 부모 chain 보존, 형제 제외, 매치 노드 자손은 모두 keep (컨텍스트 보존). 빈 query 는 input 그대로. 한·영 lower-case substring. + 6 unit test.
  - OntologyTreeView 헤더에 search input + clear 버튼. 매치 0 안내 메시지. orphans 도 query 로 필터.
  - 큰 트리에서 노드 빠르게 좁히기 — 글로벌 검색 (페이지 점프 + 패널 열기) 과 다른 사용성 (트리 컨텍스트 안에서 보기).
- 2026-04-27 — iter 23 — **PR #59 머지 + `/ontology/insights` 5번째 패널 (30일 활동 타임라인)**.
  - PR #59 (4 commit: WorkspaceOntologyStrip + insights 라우트 + similarity 매처 + 검수 mount) 머지 → main `3759769`. 브랜치 자동 정리.
  - production deploy 는 hook 으로 차단 (사용자 명시 권한 없으면 거부) — 다음 fire 사용자 confirm 후.
  - shared/lib/ontology-tree 에 `buildActivityTimeline(nodes, options?)` + `ActivityTimelineDay` 타입. 일별 카운트, 빈 날 0 prefill, date asc 정렬, `now` 인자로 테스트 가능. + 5 unit test (default 30일 / 정렬 / 합산 / 범위 밖 무시 / days 인자).
  - `/ontology/insights` 에 5번째 패널 "30일 활동" 추가 — full-width (md:col-span-2). div 기반 bar chart (CSS height %), title=`<date> · <count>` tooltip + 시작·오늘 라벨.
  - 17 insights tests (12 + 5).
- 2026-04-27 — iter 22 — **검수 워크스페이스에 `<CandidateOntologyMatch>` mount — 검수 효율 closure**.
  - KnowledgeReviewWorkspacePage 에 `subscribeKnowledgePublicGraph` 추가 → existingOntologyNodes 구독.
  - 후보 노드 (project / domain / capability / element / concept 5 group) 각각 inline 매치 표시. 매치 0 자동 숨김. score ≥ 80 시 amber 경고 — "이미 같은 노드가 있어 보임".
  - 검수자가 promote 결정 전에 기존 ontology 와 비교 → dedup 회피·중복 분기 방지. v0 검수 흐름의 quality safeguard.
- 2026-04-27 — iter 21 — **검수 후보 ↔ 기존 ontology 비슷도 매처 + widget (다음 fire 에 검수 페이지 mount)**.
  - shared/lib/ontology-tree 에 `findSimilarOntologyNodes(candidate, existingNodes, limit)` + `SimilarityCandidate` / `SimilarityMatch` 타입. 점수 7 단계 (정확 100/80, prefix 60/50, substring 40/30, id 20). + 8 unit test.
  - 새 widget `src/widgets/candidate-ontology-match/` — 후보 노드 옆에 "비슷한 기존 노드 N" inline. score ≥ 80 시 amber 톤 경고 ("이미 같은 노드가 있어 보임"). 매치 0 자동 숨김. onSelectMatch 콜백 옵션 (promote 대신 evidence 묶기 지원 여지).
  - 검수 워크스페이스 페이지 mount 는 다음 fire (페이지 800 줄 + 후보 grouping 위치 결정 필요).
- 2026-04-27 — iter 20 — **새 라우트 `/ontology/insights` — 4 패널 (사용자 "범위 너무 작아" 답)**.
  - shared/lib/ontology-tree 에 `computeKindDistribution` / `computeDegreeCentrality` / `selectTopByDegree` / `selectRecentNodes` + 12 unit test (kind dist 2 / degree 4 / topByDegree 4 / recent 2).
  - 새 라우트 `app/ontology/insights/page.tsx` + 새 view `src/views/ontology-insights/`. 4 패널: kind 분포 (bar chart) · 허브 노드 (degree desc 위 10) · 최근 활동 (lastApprovedAt desc 위 10) · 미연결 노드 (orphans, amber 톤).
  - 각 노드 클릭 시 `/ontology/?node=<id>` deeplink 점프 (iter 18 deeplink 와 동기). 빈 상태 onboarding 메시지 + 문서 볼트 진입.
  - `/ontology` 헤더에 "인사이트" pill 진입점 + ⌘K 글로벌 검색 mount.
  - "트리는 hierarchy, 인사이트는 통계" — `/ontology` 보조 surface.
- 2026-04-27 — iter 19 — **PR #58 머지 (followup) + `/projects` 헤더에 `<WorkspaceOntologyStrip>` 한 줄 strip**.
  - iter 17 deploy 가 hang (firebase pipe 깨진 듯, 30분+ 0 bytes) → 강제 종료. PR #58 머지 후 main 에서 재 build·deploy 사이클.
  - 새 widget `src/widgets/workspace-ontology-strip/` — accountId 받고 자체 subscribe + 한 줄 stat strip (Ontology N · 도메인/역량/요소 chip · stub amber pill). 매치 0 자동 숨김.
  - ProjectSelectorPage 헤더 직후 mount — 사용자가 가장 자주 보는 surface 에 가벼운 ontology 가시.
- 2026-04-27 — iter 18 — **`/ontology` deeplink (`?node=<id>`) — navigation chain 강화**.
  - OntologyViewPage 에 useEffect 추가 — `?node=` query 가 있고 insight 로드되면 해당 노드 자동 selectedNode (이미 selectedNode 있으면 사용자 명시 선택으로 가정해 덮어쓰지 않음).
  - MountedGlobalSearch default `onSelectNode` 가 `/ontology/?node=<id>` 로 점프하도록 갱신. 검색 → 외부 surface → ontology 점프 시 패널 자동 열림.
- 2026-04-27 — iter 17 — **PR #57 머지 + 브랜치 정리 + `/project/[slug]` 에 ontology overview 카드 + production deploy**.
  - `gh pr merge 57 --merge --delete-branch` — main 에 14 commit 흡수, remote/local feature 브랜치 자동 삭제.
  - 새 widget `src/widgets/project-ontology-overview/` — `<ProjectOntologyOverview accountId projectSlug />`. 자체 `subscribeKnowledgePublicGraph` + `projectIds.includes(slug)` 필터 + kind 카운트 chip + sample (project/document 제외) + "전체 트리 →". 매치 0 자동 숨김.
  - ProjectDetailPage footer 직전에 한 줄 mount — 1994 SSG 라우트 모두에 client-side 가벼운 ontology 가시. "공개 surface 무거운 작업 금지" 정신 준수 (sigma 토폴로지는 그대로, 새 카드만).
  - production deploy: main 빌드 성공 → `firebase deploy --only hosting`. 카운터 5 → 0 reset. 새 작업은 `feature/ontology-v1-followup` 브랜치에서.
- 2026-04-27 — iter 16 — **`/knowledge/documents/view` 에 "근거 ontology 노드" 역방향 inline + ⌘K mount**.
  - 새 widget `src/widgets/document-ontology-evidence/` — `<DocumentOntologyEvidenceSection accountId documentId />`. 자체 `subscribeKnowledgePublicGraph` 구독 + `evidenceIds.includes(documentId)` 필터 + chip + summary + "전체 트리 →" 링크. 매치 0 이면 자체 숨김.
  - `KnowledgeDocumentDetailPage` 끝에 한 줄 mount + `<MountedGlobalSearch>` ⌘K 도 추가. 사용자가 자기 문서로 어떤 ontology 가 자랐는지 즉각 확인 (검수 → 결과 흐름 closure).
  - widget 분리 패턴 = MountedGlobalSearch / OntologyEgoGraph 와 동일 — 페이지 무게 변동 없이 추가.
- 2026-04-27 — iter 14 — **`/ontology` stat "검수 대기 stub" + 트리 전체 펼치기/접기 토글**.
  - Home 의 SearchPalette (695 줄, 프로젝트 검색 메인) 흡수 vs 동거 검토 — 흡수는 큰 작업, 동거는 ⌘K 충돌. **결정**: ontology 검색은 운영 surface 4 곳 한정. 사용자가 hero pill 로 `/ontology` 진입 후 ⌘K. 이미 현재 상태이므로 코드 변경 X.
  - `/ontology` stat grid 4 → 5 칸. "검수 대기 stub N" 카드 추가 (`kind === 'unknown'` count). N > 0 시 amber 톤 + `/review/knowledge/` 점프 가능 카드. Stat 컴포넌트에 `accent` + `href` prop 추가.
  - `OntologyTreeView` 에 "전체 펼치기 / 전체 접기" toolbar — 카운트 ("N / M 펼침") 표시, disabled 상태 처리. `flattenTree` 로 collapsible IDs 한 번 계산.
  - 36 ontology tests passed (build-tree 10 + build-ego 5 + ego-layout 6 + tree-view 15).
