# Mission Cleanup Candidates — mission v2 와 코드 정렬 (✅ ARCHIVED)

> ✅ **모든 stage 머지 완료** (2026-05-01 저녁, PR #5-#11). 본 문서는 *historical analysis* 로 보관 — 같은 패턴의 cleanup 이 미래에 필요할 때 참조용.
>
> 사용자 가시 변화 시간순: `docs/CHANGELOG.md` (2026-05-01 저녁 entry).
> 현재 next-work: `docs/BACKLOG.md`.

---

## 1원리 분석 (요지)

mission v2 = "사람과 AI agent 가 같이 저작하는 codebase ontology" (`docs/PRODUCT-DIRECTION.md`).

척추 = `md frontmatter → ontology`. AI agent = MCP partner (user-side LLM 비용). 검수 = frontmatter 자체가 자기-승인.

게이트 질문: *"X 가 mission 의 척추 / partner / 자기-승인 흐름과 모순되는가?"*

→ 모순이면 제거. 모순 안 되면 보존 (cloud-mode 옵션 등).

---

## ✅ 완료된 staging plan

| Stage | 변경 | 머지 |
|---|---|---|
| **1. UI "분석 시작" CTA 제거** | 3 view (`KnowledgeDocumentDetailPage` / `KnowledgeReviewWorkspacePage` / `OntologyViewPage`) | PR #5 commit 6208387 |
| **2. entity httpsCallable 제거** | `enqueueKnowledgeExtractionJob` + barrel | PR #5 commit 958cc34 |
| **3. functions/ extraction code 제거** | `extract-gemini.js` + `ontology-extract.js` 통째 삭제, `index.js` 1080→543 줄 | PR #5 commit 7203af2 |
| **Stage 4 light** (advertising) | nav '문서 확인' 탭 + 우상단 pill + ontology stat link | PR #5 commit 5905da7 |
| **Stage 4 full** (review queue page) | `/review/knowledge` 라우트+view+helper+callable+functions handler 통째 삭제 | PR #6 commit dd09c59 |
| **Stage 5 / Q1=(a)** | `useOntologyInsight` — `/` ontology hub 가 vault 활성 시 자동 vault 모드 | PR #6 commit b6b4edd |
| **MCP v0.2** | `patch_concept` + `find_backlinks` 도구 추가 | PR #7 commit 5b6a371 |
| **dogfood vault sync** | `docs/ontology/` Stage 4+5 + MCP v0.2 반영 | PR #7 commit 6ae9c06 |
| **빈 vault empty-state** | OntologyViewPage 의 mode-aware 안내 | PR #8 |
| **README + AGENTS mission v2 정렬** | 진입점 문서 동기화 | PR #9 |
| **V1.1 Wikidata** | `qualifiers?[]` + `rank?` (additive, breakage 0) | PR #10 |
| **stale "Demo" title** | Playwright MCP QA 발견 — 7 file fix | PR #11 |
| **BACKLOG / FEATURES / ARCHITECTURE / DATA-MODEL / MODE-AWARE-CRUD** | mission v2 동기화 | PR #12-#13 |

누적 정리: 약 **-5,833 라인** (functions/index.js 73% 감축 포함).

---

## 보존 결정 (mission 정렬 또는 cloud-mode 옵션)

- `promoteStubNode` / `dismissStubNode` / `publishKnowledgeProjection` — stub 해결 + public projection. mission 정렬.
- `subscribeKnowledgeJobsByDocument` — historical job state 표시. cloud 모드 review surface 에서 여전히 유효.
- `CopyProjectLinkButton` — 단순 URL 복사. mission 무관, 손해 없음.
- 기존 `knowledgeApprovedNodes/Edges` + `knowledgePublicNodes/Edges` — manual editor + projection. 유지.
- `signInWithDemo` (데모 viewer 로그인) — 외부 사용자가 fork 안 하고 둘러보기. mission 무관.

## Cold storage (read-only)

mission v2 cleanup 후 callable 가 없어 read-only:

- `knowledgeExtractionJobs` / `knowledgeExtractionOutputs`
- `knowledgeReviews` / `knowledgeReviewEvents` / `knowledgeApprovalEvents`
- `knowledgeDocumentChunks` / `knowledgeEvidence`

archival 정책은 운영 결정 (`docs/BACKLOG.md` T38).

## firebase deploy 정책

user 정책상 firebase 배포 안 함. functions/ 변경은 코드만, deploy 안 됨. 기존 cloud functions 가 살아있어도 호출자 0 이라 dead.
