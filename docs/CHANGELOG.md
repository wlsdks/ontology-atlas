# CHANGELOG

> 주요 변경 이력. 코드 commit 메시지가 *왜* 를 답하고, 이 파일은 *언제 / 어떤 surface 가 바뀌었는지* 를 답한다. PR 단위가 아닌 **사용자 가시 변화** 위주.
>
> 최신이 위. semver 도입 전 v0.x 단계라 날짜 기반.

---

## 2026-05-02 — local-first 첫 paint firebase 0 (PR #99)

### 사용자 가시 변화

- **첫 페이지 로드 가벼워짐** — `/`, `/topology`, `/docs`, `/ontology/edit`, `/projects`, `/knowledge`, `/login`, `/account` 등 user-facing 진입점이 firebase JS (~773kb chunks) 를 정적으로 로드하지 않는다. cloud 모드 명시 진입 (signin / cloud entity mutation) 시점에만 lazy 로드.
- **모바일 / 느린 네트워크 LCP 개선** — firebase SDK parse 비용 0.
- **호스팅 비용 측면**: vault picked 사용자는 firebase 계정 자체가 안 만들어짐. 정적 export 라 origin server 비용은 어차피 0 이고, 이제는 firebase 트래픽도 cloud 모드 진입 전엔 0.
- **동작은 그대로** — cloud 모드 사용자도 모든 기능 동일 작동 (함수 호출 시점에 firebase chunk 가 다운로드).

### 아키텍처 변화 (개발자 가시)

- **entity barrel 분리 패턴** — `@/entities/<x>` 는 type / lib / pure helper 만. firestore api 는 `@/entities/<x>/api` 로 직접 import. 새 contributor 는 mode-aware feature 작성 시 cloud branch 만 `import('@/entities/<x>/api')` 로 dynamic import.
- **mapper Timestamp duck-typing** — `instanceof Timestamp` 체크 대신 `coerceFirestoreDate(value)` 헬퍼 (`@/shared/lib/firestore-timestamp-coerce`). entity model 이 firebase 의존 0.
- **`package.json sideEffects` allowlist** — `*.css` + `firestore-noise-patch` 만 side-effectful 로 표시. 나머지는 webpack tree-shake.

### 새 module

- `src/shared/lib/firestore-noise-patch.ts` — 기존 `FirebaseProvider` 의 console 노이즈 패치를 firebase-deps-free 모듈로 분리. layout 에서 side-effect import 만으로 install.
- `src/shared/lib/firestore-timestamp-coerce.ts` — Timestamp duck-typing 헬퍼 + 8 케이스 단위 테스트.
- `src/entities/knowledge-graph/api/index.ts` — knowledge-graph api barrel (전엔 main barrel 에 섞여 있었음).

### 제거

- `src/app/providers/FirebaseProvider.tsx` (-91 줄) — 하던 일이 console 패치 + 불필요한 `getFirebaseApp()` warmup 두 가지였는데, 패치는 pure 모듈로 분리하고 warmup 은 `<link rel="preconnect">` 가 이미 함.

---

## 2026-05-01 (밤) — UX 1원리 batch + Phase 4 비개발자 친화 + V1.5 cardinality

이전 entry 의 7 PR 외에 추가로 12 PR 머지 (#15-#23). 전 세션 누적 19 PR.

### 사용자 가시 변화

- **`/`** 빈 vault empty-state — local 모드일 때 inline `frontmatter snippet` 추가 (사용자가 빌더 진입 없이 직접 `.md` 만들 수 있게, copy-paste 가능). 외부 mode 는 기존 3-step 안내.
- **`/docs/`** dogfood vault hint — LocalVaultPicker 의 idle 상태에 "처음이세요? 이 repo 의 `docs/ontology/` 를 선택해 보세요" 안내. 비전 검증의 가장 빠른 path.
- **OperationsNav mode badge** (UX-2 신규) — 데스크톱 + 모바일 nav 의 우측에 현재 모드 chip 항상 표시 (`vault · NN docs` / `cloud sync` / `데모`). 사용자가 데이터가 어디로 가는지 한눈에.
- **빌더 (`/ontology/edit`) onboarding 카피** — "ERD 이상 — 도메인 지도" 비개발자 친화. mission v2 의 *AI agent partner* 도 명시.
- **빌더 vault md write** (P1-1 / UX-4) — 빌더에서 노드 저장 시 mode 분기: local 모드면 `vault/${kind}s/${slug}.md` 직접 작성, cloud 모드면 Firestore upsert. mission v2 의 *사람 + AI agent 양립* 약속의 핵심 missing piece 해소.
- **kind 별 lucide 아이콘** — Tree / Builder palette 에 직관적 metaphor (project=Folder, domain=Layers, capability=Cog, element=Box, …). 색은 단일 인디고 + 무채색 헌장 그대로.
- **검색 PM 친화 분류** (`⇧⌘K`) — group heading "Ontology / Documents / Projects" → "개념 / 글 / 프로젝트". placeholder + aria-label 도 한국어.
- **UI 영문 transliteration 정리** — "edge type 분포" → "관계 종류 분포", "evidence 풍부" → "근거 문서 많은" 등. 코드 식별자 (`kind` / `node` / `edge`) 는 그대로.
- **데모 데이터 mission v2 정렬** — `Demo Knowledge` 컨테이너 capabilities 가 mission v1 잔재 ("검수 큐", "frontmatter 추출") → mission v2 ("vault frontmatter 진실원", "AI agent partner") 로 교체.

### 새 entity / feature / module

- `mcp/scripts/verify.mjs` — 1줄 verify CLI. parser smoke + server boot + tools/list + list_concepts 통합 검증. 실패 시 어느 step 인지 진단.
- `mcp/src` v0.2 → **v0.3** — `find_path(from, to, maxHops?)` BFS + `list_kinds()` census 추가. 7 → 9 도구.
- `src/entities/ontology-class/model/icons.ts` — `getOntologyKindIcon(kind)` shared helper.
- `src/widgets/operations-nav` 의 `ModeBadge` 컴포넌트.
- `docs/ATOMIC-AUDIT-2026-05-01.md` — 13 도메인 1원리 audit 결과 (438 줄).
- `docs/UX-FIRST-PRINCIPLES.md` — 7-step user journey 마찰 분석 + P0/P1/P2 매트릭스.

### 제거

- `src/widgets/ontology-output-badges/` 통째 (-425 줄, 0 imports — extraction review-queue 의존 잔재).

### Ontology 모델 진화 (V1.x)

- **V1.1** ✅ qualifiers + rank 머지 (이전 entry 에 기록, 본 entry 에는 후속 dogfood 만)
- **V1.5** ✅ Relation Cardinality 머지 — `OntologyRelation` 에 `sourceCardinality?` + `targetCardinality?` 옵셔널 (additive, breakage 0). 5 새 단위 test.

### Documentation

- `README.md` + `AGENTS.md` mission v2 동기화 (이전 entry).
- `docs/FEATURES.md` 전면 재작성, `docs/ARCHITECTURE.md` / `docs/DATA-MODEL.md` / `docs/MODE-AWARE-CRUD.md` mission v2 정렬.
- `docs/BACKLOG.md` mission v2 phase 후 next-work 통합 (T28-T38 + UX-1/2/3/4).
- `docs/MISSION-CLEANUP-CANDIDATES.md` 압축 (4 stage 모두 ✅, archived analysis).
- `docs/PRODUCT-DIRECTION.md` Phase 1-4 status 표시 (1 ✅ / 2 ⏸ / 3 ✅ / 4 ⏳).
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` 진행 상황 표 — V1.1 + V1.5 ✅, V1.2/V1.3/V1.4 대기.
- `mcp/README.md` v0.3 (9 도구) 갱신 + sample LLM prompt + verify CLI 안내.
- `docs/ontology/` dogfood vault — `capabilities/builder-vault-write` + `capabilities/v1-5-cardinality` 추가, `capabilities/mcp-server` 9 도구로 갱신. 22 노드.

### 검증 통과 상태

- **117 test files / 839 tests passing** (V1.5 +5)
- tsc 0 errors
- lint 0 errors (warnings 79 pre-existing)
- `node --check functions/index.js` syntax OK
- MCP `npm run verify` end-to-end 9 도구 + 22 노드 dogfood vault 정상
- Playwright MCP browser-level QA (15 라우트) — mission v2 surface 정상, console error 0, mode badge "데모" 노출, stale "Demo" title 0

### Open questions

- **Q1, Q2** — ✅ 답완료
- **Q3-Q8 (V2 spec)** — V1.2 (Q6+Q7), V1.3 (Q5), V1.4 (Q4) 차단

### 누적 통계 (이번 세션 19 PR)

- 약 -5,833 줄 mission cleanup (PR #5-#11)
- +438 줄 audit / +210 줄 UX 분석 / +245 줄 BACKLOG · FEATURES 동기화
- +574 줄 신기능 (MCP v0.3 / mode badge / vault md write / V1.5 / kind icons / frontmatter snippet / verify CLI)

---

## 2026-05-01 (저녁) — Phase 3 (AI agent partner) + mission v2 cleanup

PRODUCT-DIRECTION v2 의 mission "사람과 AI agent 가 같이 저작하는 codebase ontology" 를 코드 + functions + dogfood vault 까지 일관시킨 큰 cleanup. 누적 PR #5 / #6 / #7 머지.

### 사용자 가시 변화

- **AI agent partner 신설** — `mcp/` MCP 서버 (`@modelcontextprotocol/sdk@^1.0.0`). Claude Code 같은 LLM agent 가 stdin/stdout JSON-RPC 로 vault ontology 를 read/write. v0.2.0 7 도구: `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `add_concept` / `add_relation` / `patch_concept`. 등록: `.mcp.json.example` 또는 `mcp/README.md`.
- **`docs/ontology/` dogfood vault** — 이 프로젝트 자기 자신의 mental model 을 frontmatter md 로 표현. 1 project + 8 domain + 6 capability + 4 element = 20 노드.
- **`/` ontology hub mode-aware** (Q1=(a)) — vault 활성 시 `/` 가 자동으로 vault frontmatter 의 stub 노드를 트리·ego graph·검색에 표시 (LOOP-TASK Open question #1 답).
- **빈 vault UX** — local 모드에서 vault 가 활성됐는데 ontology 노드가 없으면 "vault 가 비어있어요" 안내 + 2-step (frontmatter / 빌더) CTA. local 모드면 "vault 열기" step skip.
- **"분석 시작" cloud LLM 추출 흐름 제거** — mission v2 의 비용 모델이 *user-side AI agent (Claude Code)* 로 옮겨감. 영향 surface:
  - `/knowledge/documents/[id]` 상세 — 4 단계 stepper → 2 단계 (upload → publish), `ExtractorVersionToggle` / "분석 시작" / "다시 분석" CTA 4곳 제거 → "vault 열기" / "빌더 열기" CTA
  - `/review/knowledge` 검수 큐 — 페이지 + 라우트 통째 삭제. `OperationsNav` '문서 확인' 탭 제거 (5탭 → 4탭). 6 view 의 review 링크 제거
  - `/ontology` toolbar 의 "검수 큐" pill 제거, "미해결 참조" Stat 의 review 큐 링크 → 페이지 안 stub 리스트로 변경
  - `WorkspaceOntologyStrip` 의 stub chip target → `/ontology` 트리 stub 리스트로
  - landing onboarding ValueChainRail "추출 돌리기" → "frontmatter 자체가 자기 승인"

### 새 entity / feature / module

- `mcp/` 통째 — MCP 서버 패키지 (parser.mjs / vault.mjs / index.js / parser.test.mjs). v0.1.0 (5 도구) → v0.2.0 (7 도구).
- `src/features/vault-ontology/model/use-ontology-insight.ts` — mode-aware ontology insight. local: vault frontmatter stub 변환, cloud: knowledgePublic projection.
- `docs/ontology/` 통째 — 자기 ontology vault.
- `docs/MISSION-CLEANUP-CANDIDATES.md` — 4 stage cleanup staging plan (Stage 1+2+3+4 모두 완료).
- `.mcp.json.example` — Claude Code 등록 템플릿.

### 제거 / 정리

- **functions/index.js: 2,012 → 543 줄 (-73%)**
  - `enqueueExtractionJob` / `processExtractionJob` / `reclaimStaleExtractionJobs` (extraction 흐름 3 handler) 제거
  - `applyReviewAction` (검수 큐 callable) 제거
  - 의존 cores + helpers 약 20 함수 정리
  - `extract-gemini.js` (224 줄) + `ontology-extract.js` (1,295 줄) + `ontology-extract.test.mjs` (812 줄) 삭제
  - secrets `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` 제거. `@google/generative-ai` 의존성 제거
- **`src/views/knowledge-review-workspace/` 통째 삭제** (1,357 줄 view + barrel)
- **`app/review/` 통째 삭제** (page + redirect + sub-route)
- **entity layer**: `enqueueKnowledgeExtractionJob` httpsCallable wrapper, `approveKnowledgeOutput` / `rejectKnowledgeOutput` callable + 6 type, `getKnowledgeReviewWorkspaceHref` helper 제거. 각 barrel export 정리.
- **6 view caller**: KnowledgeDocumentDetailPage / (지운 KnowledgeReviewWorkspacePage) / KnowledgeDocumentsPage / KnowledgeDashboardPage / ProjectSelectorPage / ProjectEditorPage 의 review 큐 링크 정리
- **누적 정리**: PR #5 -3,729 줄 + PR #6 -2,096 줄 + PR #7 -8 줄 = **약 -5,833 라인**

### 검증 통과 상태

- **117 test files / 843 tests passing**
- tsc 0 errors
- lint 0 errors (warnings 79 pre-existing)
- `node --check functions/index.js` syntax OK
- MCP 서버 stdin/stdout JSON-RPC: initialize → tools/list (7 도구) → tools/call (`add_concept` / `patch_concept` / `find_backlinks` / `find_evidence` / `get_concept` / `list_concepts`) end-to-end 정상
- dev server (port 3210) 핵심 라우트 200, 삭제된 `/review/knowledge/` 404, HTML 에 Error 마커 0

### Open questions

- **Q1** — ✅ 답완료 ((a) 채택, useOntologyInsight 도입)
- **Q2 (share-doc 제거)** — 여전히 대기
- **Q3-Q8 (V2 spec)** — 여전히 대기

### 운영 노트

- `firebase deploy --only functions` 는 user 가 실행 안 함 (firebase 배포 안 함 정책). functions/ 변경은 코드만 정리, deploy 안 됨. 기존 cloud functions 가 살아있어도 호출자 0 이라 dead.
- 기존 `knowledgeExtractionJobs` / `knowledgeExtractionOutputs` / `knowledgeReviews` / `knowledgeApprovalEvents` Firestore 컬렉션 데이터 — cold storage (read-only), 더 이상 callable 없어 archive-only.

---

## 2026-05-01 — Mode-aware CRUD + Builder rebrand

### 사용자 가시 변화

- `/` Landing — 정적 미니 토폴로지 SVG (14 노드 / 21 relations) + 3-step rail (markdown → 추출 → 토폴로지·트리·ERD) + Obsidian/Notion 비교 카피 + footer (MIT licensed · GitHub · 기술 스택). Marketing 섹션 (Why / Coming soon roadmap / Stats / framer-motion 애니메이션 / Sigma drift 배경) 은 모두 제거.
- `/projects/` — 비로그인 사용자 redirect 제거. list 즉시 노출. 비로그인 + vault 활성 사용자가 ProjectQuickCreatePanel 로 *vault 의 .md 직접 생성* 가능 (mode-aware).
- `/ontology/edit/` — '온톨로지 아틀라스' → **'온톨로지 빌더'** 로 rebrand. 헤더 5줄 → 1줄 + ⓘ 툴팁. max-w 1400 → 1800 으로 캔버스 확장. 비로그인 시 'Missing or insufficient permissions' raw 에러 안 보이고 ephemeral 캔버스만 자유.
- `/ontology/` — 'i' 아이콘 hover 툴팁 동작 + 카피 강화 (계층 + 빌더 진입 안내). '편집기' 버튼 → **'빌더 열기 →'** 인디고 fill prominent. 하단 footer 에 nodes/relations + mode + projection version 노출 (V1.0 강점 가시화).
- `/ontology/` 의 vault 모드 — `VaultOntologyStubsPanel` 노출. frontmatter (`kind`, `capabilities`, `elements`, `relates`, `dependencies`, `domain`) 가 즉시 stub 노드/엣지로 자라는 모습 시각화.
- OperationsNav '문서' 탭 — vault 활성 시 `/docs/` 로, 그 외 `/knowledge/` 로 분기.
- Landing / app 전체의 'Demo' 브랜드 잔재 → **`oh-my-ontology`** 로 정리 (page title / OG / twitter / PWA manifest).

### 새 entity / feature / shared 모듈

- `src/shared/lib/data-source-mode.ts` + `src/features/data-source-mode/` — 4 운영 모드 (Static / Local / Cloud / Hybrid) 인지 hook.
- `src/features/project-data-source/` — `useProjectMutations` mode-aware hook (local 은 vault 직접 쓰기, cloud 는 Firestore).
- `src/entities/docs-vault/lib/project-frontmatter.ts` — Project ↔ frontmatter 양방향 매퍼 + `buildProjectMarkdown`.
- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` — frontmatter → ontology stub 변환 (fast path, AI 추출 거치지 않음).
- `src/features/vault-ontology/` — useVaultOntology hook + VaultOntologyStubsPanel widget.
- `src/entities/local-fs-handle/` — File System Access 핸들의 entity 화 (multi-vault forward-compat).
- `src/entities/local-fs-handle/api/permission.ts` — `verifyHandlePermission(handle, mode, {ask})` 일반화 유틸.
- `src/entities/docs-vault/lib/build-local-manifest.ts` — `computeLocalVaultFingerprint` 함수 추가 (auto-refresh skip).

### 제거 / 정리

- `src/features/workspace-project-bridge/` — 통째 삭제 (771 줄 / 9 파일 / 50 tests). multi-account 컨테이너 어댑터 single-user 모드 전환 후 dead.
- `src/widgets/workspace-project-selector/ui/WorkspaceProjectSelector.tsx` — dead UI 230 줄 삭제.
- `src/shared/lib/account-scope.ts` — `appendWorkspaceProjectQuery` / `readRuntimeWorkspaceProjectId` stub 함수 제거.
- `src/shared/lib/use-workspace-project-query.ts` — 통째 삭제 + 3 consumer 의 dead destructure 정리.
- `useScopedAccountAccess` 의 `_accountId` 파라미터 제거 (11 call site 동시 정리).
- `src/views/account-settings/` 의 일부 + `src/widgets/account-menu/` 일부 — 더 이상 사용 안 되는 코드 path 정리.
- e2e audit spec 4 개의 dead `/admin/*` URL 7개 제거.
- LocalVaultPicker 의 off-canon palette (peachy / muted-red / indigo 변종) → 캐논 warning(244,183,49) / danger(229,72,77) / indigo(94,106,210) + 시멘틱 토큰으로 통일.
- LocalVaultPicker error 상태에 actionable 안내 한 줄 추가.

### 버그 fix

- `OntologyEditPage` 의 `accountId = null` 하드코드 제거 — ERD 캔버스 manual node 저장 가능 회복 (이전엔 항상 "계정이 확인되지 않았어요" 토스트로 fail).
- `useApprovedGraphFlow` 가 비로그인 시 Firestore 구독 시도 → raw permissions error — accountId === null 면 구독 skip + 빈 그래프 + loaded:true.
- frontmatter parser 가 multi-line YAML list (`capabilities:\n  - x`) 미지원 → 지원 추가.
- `useLocalVault` 의 manual `refresh` 도 fingerprint skip 적용 (auto-refresh 만 됐던 것).

### 신설 spec / docs (untracked, user review 대기)

- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.0 강점 + V1.1~V1.5 단계별 진화 (qualifiers / literals / rich-refs / ActionType / cardinality) + V2 통합 statement 모델 + 90+ 항목 체크리스트 + Mermaid 도식 2개 + Glossary 50+ 용어 + 8 Open questions + 13 섹션.
- `docs/LOCAL-FIRST-SYNC.md` — 4 운영 모드 + 충돌 해소 5 원칙 + Hybrid 도입 전 4 open questions.
- `docs/OFFLINE-FIRST-UX-FLOW.md` — 6 사용자 상태 × 11 라우트 매트릭스 + 5-step 온보딩.
- `docs/ACTION-TYPE-SECURITY-DRAFT.md` — V1.4 ActionType 의 8 보안 항목 deepen.
- `docs/MODE-AWARE-CRUD.md` — 오늘 도입한 mode-aware 패턴 contributor 가이드 + anti-pattern 4 종.

### 검증 통과 상태

- 927 tests passing (131 test files)
- tsc 0 errors
- lint 0 errors (warnings 모두 pre-existing)
- Playwright 시각: `/`, `/projects/`, `/ontology/`, `/ontology/edit/`, `/docs/`, 8 라우트 audit 모두 console errors 0.
- 누적 commit: 약 30+ (이날 단일 세션). 누적 diff: -3000+ / +1500+ 라인 (정리 위주).

### Open questions (user 답 대기)

1. `/` 토폴로지가 활성 vault 가 있을 때 자동 전환되어야 하는가? (a/b/c)
2. share-doc 시스템 (`/share/[token]` + sharedDocs Firestore) 제거해도 되는가? (a/b)
3. V2 spec 의 P0/P1 Open questions Q1~Q8 (multi-vault 시점 / ActionType 인증 / dual-read 기간 / none vs unknown / extractionModelId 검증 / summary 마이그레이션 / literal naming scope / ActionInvocation 보존)

---

## 2026-04-30 이전

이전 변경은 이 CHANGELOG 도입 전 — git log 참조 (`git log --oneline 7b16945..ba1e102`).
