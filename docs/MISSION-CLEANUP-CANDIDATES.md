# Mission Cleanup Candidates — mission v2 와 코드 정렬

> 작성: 2026-05-01 (Phase 3 MCP partner 머지 후)
> ✅ **Stage 1 + 2 + 3 + 4 코드 cleanup 모두 머지 완료** (2026-05-01 저녁, PR #5 / #6 / #7).
> mission v2: "사람과 AI agent 가 같이 저작하는 codebase ontology" — `docs/PRODUCT-DIRECTION.md`
> 본 문서는 *어떤 surface 가 mission 모순인지* 1원칙 분석 + *제거/단순화 staging plan*.

---

## TL;DR — 4 stage 현황

| Stage | 위험 | 가치 | 상태 |
|---|---|---|---|
| **1. UI mention 제거** ("분석 시작" 버튼 + 안내 문구) | 낮음 | 높음 | ✅ PR #5 머지 (commit 6208387) |
| **2. client httpsCallable 호출 제거** (`enqueueExtractionJob` etc.) | 중 | 높음 | ✅ PR #5 머지 (commit 958cc34) |
| **3. functions/ extraction code 제거** | 중 | 중 | ✅ PR #5 머지 (commit 7203af2) — code 만, deploy 안 함 |
| **4. review queue 페이지 + Firestore 컬렉션 정리** | 높음 | 낮음 | 부분 ✅ — 페이지 + entity + functions handler 제거 (PR #6 dd09c59), Firestore 컬렉션 데이터는 cold storage 로 보존 (read-only) |

추가 cleanup (본 문서 작성 후 발견):
- ✅ Stage 4 light (advertising) — PR #5 commit 5905da7
- ✅ Stage 5 (Q1=(a) 답) — useOntologyInsight, PR #6 commit b6b4edd
- ✅ MCP v0.2 (patch_concept + find_backlinks) — PR #7 commit 5b6a371
- ✅ docs/ontology dogfood vault sync — PR #7 commit 6ae9c06

---

## 1. mission 모순 surface inventory

### 1-A. AI extraction (Cloud LLM)

**Why mission-misaligned**: mission v2 가 "AI agent partner — 사용자 자기 LLM 비용 (Claude Code 등)" 으로 대체. cloud LLM 호출은 비용 모델 모순 + 비활성 잔재 (FEATURES.md §2 "비용 우려로 비활성").

| 파일 | 줄 | 역할 | 처리 |
|---|---|---|---|
| `functions/extract-gemini.js` | 224 | Gemini API 호출 | Stage 3 제거 |
| `functions/ontology-extract.js` (callClaude/extractOntology/buildExtractionPrompt 등) | ~700 (1295 중) | Claude API + prompt + 검증 | Stage 3 제거 (단 normalizeSlug, createStubPlaceholder 등 helper 는 frontmatter 흐름에 재활용 가능 — 보존) |
| `functions/index.js` `enqueueExtractionJob` (onCall) + `processExtractionJob` (onDocumentCreated) + `reclaimStaleExtractionJobs` (onSchedule) | ~700 (2012 중) | extraction job orchestration | Stage 3 제거 |
| `src/entities/knowledge-job/api/knowledge-job-api.ts` | full | client httpsCallable wrapper | Stage 2 제거 |
| `src/views/knowledge-document-detail/ui/KnowledgeDocumentDetailPage.tsx` 의 "분석 시작" 버튼 + isEnqueueing 상태 | 4 occurrences (line 345, 379, 771, 1196) | 사용자 수동 트리거 | Stage 1 제거 |
| `src/views/knowledge-review-workspace/ui/KnowledgeReviewWorkspacePage.tsx` 같은 안내 | 3 occurrences (line 301, 328, 331) | 사용자 안내 | Stage 1 제거 |
| `src/views/ontology-view/ui/OntologyViewPage.tsx` line 423 onboarding 문구 | 1 | "분석 시작 을 눌러요" 안내 | Stage 1 정정 (다른 흐름 안내로) |

### 1-B. 검수 큐 (`/review/knowledge`)

**Why partial mission-misaligned**: vault frontmatter 가 자기-승인 (mission 핵심) 인데 검수 게이트가 따로 존재 = 이중 surface.
**왜 부분만**: cloud 모드에서 cloud extraction 결과가 아직 검수 필요 (Stage 1+2 후 자연 폐기됨).

처리:
- Stage 1: local 모드 안내 banner 강화 (이미 존재)
- Stage 2 후: cloud extraction 자체 제거 → 검수 큐도 dead → Stage 4 candidate

### 1-C. dual collection (`knowledgeApprovedNodes` + `knowledgePublicNodes`)

**Why partial mission-misaligned**: local 모드는 vault `.md` 자체가 진실원이라 dual collection 의미 0. cloud 모드만 의미 있음.
**처리**: `docs/ONTOLOGY-MODEL-V2-DRAFT.md` 의 V2 통합 모델로 흡수. 별도 RFC. **본 문서 scope 외**.

### 1-D. landing page

**Why partial mission-misaligned**: `/` 가 ontology hub 가 됐으니 별도 landing 의 정체성 가치 0.
**현재**: 이미 단순화 commit (09dea05) — value chain rail / mini topology 만 남음.
**처리**: Stage 1 후 cosmetic 결정. 본 문서 scope 외.

---

## 2. Stage 1 — UI mention 제거 (즉시 실행 후보)

### 변경 파일

1. **`src/views/knowledge-document-detail/ui/KnowledgeDocumentDetailPage.tsx`**
   - "분석 시작" 버튼 자체 제거 (line ~771, ~1196)
   - 안내 step rail 의 "2. 분석 시작" 항목 제거 (line ~328, ~379)
   - `isEnqueueing` / `enqueueExtractionJob` state 정리
   - state 만 남는 dead code 제거
2. **`src/views/knowledge-review-workspace/ui/KnowledgeReviewWorkspacePage.tsx`**
   - 같은 패턴
   - local 모드 banner ("vault frontmatter 가 자기-승인") 만 남김
3. **`src/views/ontology-view/ui/OntologyViewPage.tsx`**
   - onboarding 안내 line 423: "분석 시작 을 눌러요 …" → "vault frontmatter 에 `kind:` 를 추가하면 자동으로 stub 노드가 만들어져요" 로 정정

### 회귀 차단

- vitest 의 KnowledgeDocumentDetailPage / KnowledgeReviewWorkspacePage 테스트 (각 ~5-10 케이스) — "분석 시작" 버튼 클릭 시뮬레이션 케이스 → 제거 또는 ontology vault 흐름으로 대체

### 예상 diff

- 약 100-150 줄 제거, 20 줄 안내 갱신
- 4 파일

### Rollback

- functions/ 와 entities/ 는 변경 없음 → 1 commit revert 로 UI 원복

---

## 3. Stage 2 — client httpsCallable 제거 (Stage 1 머지 후)

### 변경 파일

1. **`src/entities/knowledge-job/api/knowledge-job-api.ts`** — `enqueueExtractionJob` httpsCallable 제거. 다른 함수는 유지 (예: applyReviewAction 가 있다면).
2. **`src/entities/knowledge-graph/api/knowledge-graph-api.ts`** — `httpsCallable` 호출 6개 (line 71, 90, 105, 630, 642 등) 중 extraction 관련만 정리. `promoteStubNode` / `dismissStubNode` / `publishKnowledgeProjection` 은 보존 (mission 정렬).

### 회귀 차단

- entity 테스트 + 의존하는 view 테스트
- functions/ 미변경이므로 server side 는 호출 안 받을 뿐 동작 가능 (rollback safety)

### 예상 diff

- 약 80-120 줄 제거
- 2-3 파일

---

## 4. Stage 3 — functions/ extraction 코드 제거 (Stage 1+2 머지 + 2주 soak 후)

### 변경 파일

1. **`functions/extract-gemini.js`** — 224줄 통째 삭제
2. **`functions/ontology-extract.js`** — 1295줄 중 약 700줄 제거 (LLM 호출/prompt 부분). helper (`normalizeSlug`, `resolveCanonicalNodeId`, `createStubPlaceholder`, `mergeStubPlaceholders`) 는 보존 — `src/shared/lib/` 으로 이동 검토
3. **`functions/ontology-extract.test.mjs`** — 812줄 중 LLM 관련 테스트 제거. helper 테스트만 유지
4. **`functions/index.js`** — `enqueueExtractionJob`, `processExtractionJob`, `reclaimStaleExtractionJobs` 제거. helper import 정리. 약 700줄 제거 (`buildOutputRecord`, `buildGeminiOutputRecord`, fork routing 등)

### 회귀 차단

- functions 단위 테스트 → 줄어든 export 만 보장
- `firebase.json`, `firestore.indexes.json` — extraction job 관련 trigger 가 있으면 정리

### 예상 diff

- 약 1500-2000 줄 제거
- 4 파일

### Rollback

- git revert (functions deploy 전이라면 0 영향. 이미 deploy 됐으면 functions delete CLI 필요)

---

## 5. Stage 4 — Firestore 컬렉션 사후 정리 (별도 RFC)

`knowledgeJobs`, `knowledgeOutputs`, `knowledgeJobLeases` 등 extraction 흐름 전용 컬렉션의 데이터 마이그레이션 / 삭제. **본 문서 scope 외** — 별도 RFC + Firestore rules + 데이터 백업 전제.

---

## 6. 결정 게이트 (user 명시 승인 필요)

각 stage 진입 전 user 가 명시적으로 OK:

- [ ] **Stage 1 진행 OK?** — 즉시 실행 가능. 위험 낮음. ~100-150줄 제거.
- [ ] **Stage 2 진행 OK?** — Stage 1 머지 후. 약 80-120줄 제거.
- [ ] **Stage 3 진행 OK?** — Stage 1+2 soak 2주 후. 약 1500-2000줄 제거. functions deploy 영향 검토.
- [ ] **Stage 4 RFC 작성?** — Firestore 데이터 마이그레이션. 별도 큰 단위.

---

## 7. 본 문서가 안 다루는 것

- **`/review/knowledge` 페이지 자체 제거 결정** — Stage 2 후 dead 가 되지만 라우트 / view 제거는 user UX 결정.
- **dual collection (`knowledgeApprovedNodes` + `knowledgePublicNodes`) 통합** — V2 spec 흡수. `docs/ONTOLOGY-MODEL-V2-DRAFT.md` 참고.
- **landing page 추가 정리** — 이미 단순화됨. 추가 cosmetic 만 남음.
- **AI extraction 외 surface 의 mission 정렬 점검** — 본 문서는 *AI extraction 잔재* 만. 다른 cleanup 후보는 `docs/BACKLOG.md` 또는 별도 인벤토리.
