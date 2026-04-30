# Knowledge subsystem v2 착수 조건 점검 (2026-04-20)

## 배경

CLAUDE.md Section 8 에 정의된 knowledge subsystem v2 의 **착수 조건 5개**가
현재 리포 기준으로 어느 정도 준비돼 있는지 점검한다. 설계 문서 기반이 아니라
실제 코드·rules·함수가 존재하는지를 확인하는 것이 목적.

## 요약 매트릭스

| # | 조건 | 상태 | 핵심 근거 |
|---|------|------|----------|
| 1 | public/private collection 경계 | **READY** | `firestore.rules`, `storage.rules`, `DATA-MODEL.md` 3곳 모두 정의됨 |
| 2 | private approved graph canonical store | **READY** | `knowledgeApprovedNodes/Edges` 컬렉션 + rules + 인덱스 |
| 3 | trusted worker/publish backend (Cloud Functions 2nd gen) | **READY** | `functions/index.js` 1359줄, 6개 함수 실구현 |
| 4 | raw markdown 은 Storage `knowledge-documents/` 계약 | **READY** | `storage.rules` append-only, MIME/2MB 제한 |
| 5 | document metadata canonical rule | **PARTIAL** | 규칙은 문서화·엔티티 구현됐으나 conflict UX 화면 미완 |

## 조건별 상세

### 1. public/private collection 경계 — READY

- `firestore.rules`: 공개(`projects`, `knowledgePublicNodes/Edges/Meta`) · 비공개
  (`knowledgeDocuments`, `knowledgeDocumentVersions`, `knowledgeReviews`,
  `knowledgeExtractionJobs`) · backend-owned(`knowledgeApprovedNodes/Edges`,
  `knowledgeEvidence` 등) 세 층이 명확히 구분.
- `storage.rules` 47-53 라인: `knowledge-documents/{documentId}/{file}` 경로
  admin-only, append-only.
- `DATA-MODEL.md` §4-5 에 동일한 분류 기록.
- **남은 할 일**: 없음.

### 2. private approved graph canonical store — READY

- `knowledgeApprovedNodes` 에 `evidenceIds`, `lastApprovedAt`, `lastApprovedBy`
  필드 정의 → 승인 근거 추적 가능.
- `knowledgeApprovedEdges` 에 `from`/`to`/`type` 으로 방향성 표현.
- `firestore.indexes.json` 208-260 라인: 정렬/필터 인덱스 10개+.
- `functions/index.js` 의 `applyReviewActionCore` (~797) ·
  `publishKnowledgeProjectionCore` (~1007) 가 실제 write 책임.
- **남은 할 일**: 없음.

### 3. Cloud Functions (2nd gen) — READY

- `functions/index.js` 전체 firebase-functions/v2 표준 구문.
- 함수 6개:
  - `enqueueExtractionJob` (callable)
  - `processExtractionJob` (onDocumentCreated)
  - `reclaimStaleExtractionJobs` (onSchedule 5분)
  - `applyReviewAction` (callable)
  - `publishKnowledgeProjection` (callable)
- `REGION = "asia-northeast3"` 고정.
- **남은 할 일**:
  - Gemini adapter 실구현 (현재 stub)
  - `reclaimStaleExtractionJobs` lease timeout 운영 검증
  - 함수별 timeout/memory/concurrency 튜닝

### 4. Storage `knowledge-documents/` 계약 — READY

- `storage.rules` 47-53: append-only, 2MB 이하,
  `text/markdown` · `text/plain` · `application/octet-stream` 허용.
- 경로 규약:
  - 전역: `knowledge-documents/{documentId}/{versionId}.md`
  - account-scoped: `accounts/{accountId}/knowledge-documents/{documentId}/{versionId}.md`
- `readMarkdownFromStorage` (`functions/index.js` 147) 로 backend 가 읽음.
- **남은 할 일**:
  - version 파일 덮어쓰기 방지 운영 검증
  - 문서 삭제 시 storage cleanup 정책 (현재 미정의)

### 5. document metadata canonical rule — PARTIAL

- 규칙 (`DATA-MODEL.md` §6.5, spec §6.5, `ADMIN-GUIDE.md` §9.1):
  1. frontmatter 있으면 frontmatter 우선
  2. 없으면 UI form 입력
  3. 문서 헤더는 `currentVersionId` 의 파생값
- 엔티티 구현: `resolveKnowledgeCanonicalMetadata`,
  `parseKnowledgeFrontmatter`, `buildKnowledgeMetadataPreview`.
- **남은 할 일**:
  - metadata conflict detection UI 완성 (모델은 있고 화면 미완)
  - version ↔ document header 동기화 검증
  - frontmatter 파싱 실패 시 fallback 정책·테스트

## 결론

**당장 구현 착수 가능한가?** — **YES (단서 1가지)**

foundation 계약 (Firestore rules · Storage rules · data model · backend
contract · 엔티티 모델) 이 문서·코드 모두에서 충분히 정의됐고, 5개 착수
조건 중 4개가 READY. 조건 5 의 metadata conflict UX 는 운영 편의 이슈지
기술 차단이 아니므로, **현재 상태에서 다음 슬라이스를 시작할 수 있다**.

CLAUDE.md Section 8 의 "최소 유효 슬라이스"(문서 등록 · version 저장 ·
extraction job 생성 · job 상태 확인 · approved graph 저장) 중 상당 부분
이미 `functions/index.js` 에 구현돼 있어, 우선 과제는:

1. **Gemini adapter 실구현** — 지금은 stub 이라 extraction 이 실제 지식을
   뽑지 못함. 실 extraction 없이는 review/approval 도 공회전.
2. **metadata conflict UX 완성** — admin 이 frontmatter 충돌을 알아보고
   해결할 수 있어야.
3. **E2E 동선 검증** — 문서 업로드 → job 생성 → job 완료 → review → approved
   → public publish 까지 한 번 전체 경로를 돌려 성공시키기.

CLAUDE.md §8 의 "review queue, graph inspector, publish executor, 공개 연동
은 초기 범위에서 제외" 원칙은 여전히 유효 — 이미 만들어진 UI 를 완성도
높이는 것보다 **위 3가지** 가 우선.

## 이 리포트 의미

- 이 프로젝트 "문서가 프로젝트 구조가 됩니다" 약속을 실제 동작시키는 첫
  관문을 넘을 수 있다는 의미.
- CLAUDE.md 가 "아직 런타임에 없다" 라고 다소 보수적으로 써 있지만,
  실제로는 backend 까지 대부분 구축돼 있음. 문서와 코드 정합성 업데이트도
  후속 작업 후보.
