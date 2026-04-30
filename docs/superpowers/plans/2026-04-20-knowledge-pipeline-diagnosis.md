# 문서(md) → 토폴로지 파이프라인 진단 리포트

> T-04. 2026-04-20. 사용자 약속 B2 "md 문서 등록 → 노드 분해 → 연계 →
> 토폴로지 표시"의 현재 런타임 구현 상태를 단 한 장으로 정리한다.
> 코드 변경 없이 **관찰만**. 다음 사이클이 이 리포트를 입력으로 "빈 조각"을
> 채워 나간다.

## 1. 전체 파이프라인 요약

```
[Admin UI: 문서 업로드]
  → Firestore: accounts/{aid}/knowledgeDocuments + …Versions (scoped)
  → onCall: enqueueExtractionJob                                (functions/index.js:1157)
    → Firestore: accounts/{aid}/knowledgeJobs (queued)          (onDocumentCreated 트리거)
      → Cloud Function: processExtractionJob (processExtractionJobCore) (functions/index.js:662)
        → 상태: queued → leased → processing → succeeded|failed
        → Firestore: accounts/{aid}/knowledgeOutputs + …Evidence
[Admin UI: 리뷰 워크스페이스]
  → onCall: applyReviewAction                                   (functions/index.js:1302)
    → Firestore: accounts/{aid}/knowledgeApprovedNodes + …Edges  (private canonical)
[Admin UI: 공개 반영]
  → onCall: publishKnowledgeProjection                          (functions/index.js:1341)
    → Firestore: knowledgePublicNodes + knowledgePublicEdges     (전역 공개)
[공개 프로젝트 상세 (비로그인)]
  → subscribeKnowledgeProjectInsight                            (knowledge-graph-api.ts)
    → Firestore read: knowledgePublicNodes / …Edges             (rules: allow read: if true)
    → ProjectKnowledgeTopology 렌더
```

**결론**: 모든 단계의 코드가 이미 존재한다. 설계 문서만 있는 단계는 없다. 단,
몇 개 조각이 UI에서 손이 닿지 않거나 계약이 살짝 어긋난다(아래 §3).

## 2. 현재 상태 (구현 단계별)

### 2-1. 도메인 / 스키마
- `src/entities/knowledge-document/model/types.ts` — 문서·버전 타입
- `src/entities/knowledge-job/model/types.ts` — `KnowledgeJobStatus` 6 단계
  (`queued` · `leased` · `processing` · `succeeded` · `failed` · `superseded`)
- `src/entities/knowledge-output/model/`, `src/entities/knowledge-evidence/model/`,
  `src/entities/knowledge-version/model/` — 추출 결과·근거 인용·버전 타입
- `src/entities/knowledge-graph/model/types.ts` — approved/public 노드·엣지
- Firestore rules (`firestore.rules`):
  - `accounts/{aid}/knowledgeDocuments|Versions|Jobs|Outputs|Evidence|ApprovedNodes|ApprovedEdges` — 공간 멤버 또는 admin 읽기/쓰기
  - 전역 `knowledgeDocuments|Jobs|Outputs|Evidence|ApprovedNodes|ApprovedEdges` — admin 전용
  - 전역 `knowledgePublicNodes|knowledgePublicEdges` — **public read**, write 금지

**판정**: 도메인·스키마·권한 경계는 **탄탄**. 공개/비공개 경계가 공간·전역 두
층으로 분리돼 있고 rules에서 인위적으로 write를 막아 canonical이 손상될 여지가
없다.

### 2-2. 엔티티 API (클라이언트 SDK)
- `knowledge-document-api.ts` — listKnowledgeDocuments · getKnowledgeDocument ·
  subscribeKnowledgeDocuments · createKnowledgeDocumentWithInitialVersion ·
  createKnowledgeDocumentVersion · setKnowledgeDocumentCurrentVersion ·
  listKnowledgeVersionsByDocument · subscribeKnowledgeVersionsByDocument
- `knowledge-job-api.ts` — enqueueKnowledgeExtractionJob (onCall 브리지) ·
  listKnowledgeJobsByDocument · subscribeKnowledgeJobsByDocument
- `knowledge-graph-api.ts` — approveKnowledgeOutput (onCall) ·
  publishKnowledgeProjection (onCall) · listKnowledgeProjectInsight ·
  subscribeKnowledgeProjectInsight
- `knowledge-output/api/`, `knowledge-evidence/api/` — 조회/구독 (확인 필요하나
  엔티티 디렉토리 존재)

**판정**: 클라이언트가 Cloud Functions로 명령을 전달하는 onCall 브리지가 세 곳에
있고, Firestore 직접 읽기는 공개 컬렉션 위주로 존재. 설계와 일치.

### 2-3. Cloud Functions (functions/index.js, 1359 lines)
- `enqueueExtractionJob` (onCall, line 1157) — 문서 버전 대기열 등록
- `processExtractionJob` (onDocumentCreated, line 1276) — 작업 생성 즉시
  `processExtractionJobCore`로 실행
- `reclaimStaleExtractionJobs` (onSchedule, line 1291) — lease 만료 좀비 회수
- `applyReviewAction` (onCall, line 1302) — 승인/거부 → approvedNodes/Edges 작성
- `publishKnowledgeProjection` (onCall, line 1341) — private → public 복사

**판정**: 파이프라인 4대 트리거(enqueue · process · review · publish) 전부 구현.
onSchedule(reclaim)까지 있어 좀비 복구도 있음.

### 2-4. Admin UI
- `admin-knowledge-dashboard` — 문서 목록 진입
- `admin-knowledge-documents` — 목록
- `admin-knowledge-document-new` — 업로드 폼 (문서 생성 + enqueue 여부 확인 필요)
- `admin-knowledge-document-detail` — 버전/작업/출력 조회, onCall 호출 2건
- `admin-knowledge-review-workspace` — 리뷰 + 승인 + 공개 반영, onCall 호출 6건

**판정**: 각 단계의 UI 진입점이 모두 존재. 리뷰 워크스페이스가 가장 많은 onCall을
쥐고 있어 파이프라인의 병목이 여기에 집중됨.

### 2-5. 공개 상세 (프로젝트 토폴로지 미리보기)
- `src/views/project-detail/ui/ProjectDetailPage.tsx` →
  `subscribeKnowledgeProjectInsight(slug, accountId, ...)` 구독
- `ProjectKnowledgeTopology` 가 `knowledgePublicNodes/Edges` 기반으로 렌더
- 게스트는 scopedAccess === guest 면 구독 skip (`knowledgeInsight` 빈 상태 유지)

**판정**: 공개 링크로 들어온 방문자가 knowledge 미리보기를 바로 볼 수 있는
라우팅이 준비됨. 단, 데이터가 비어있으면 "아직 공개된 항목 지도가 없습니다"
빈 상태 카피로 이어지며 이 부분은 B2 흐름의 "끝"에 해당.

## 3. 현재 갭·의심 지점

### 3-1. 🟡 업로드 폼과 enqueue 흐름 연결 확인 필요
- `admin-knowledge-document-new` 내부에서 `createKnowledgeDocumentWithInitialVersion`
  후 자동으로 `enqueueKnowledgeExtractionJob`까지 체인되는지 확인 필요.
- 만약 "문서 생성 → 사용자가 직접 추출 실행 버튼을 눌러야 함" 구조라면 B2 여정이
  한 번 끊긴다. 자동 enqueue가 기대치.
- 스펙상 초안은 "extraction job 생성"까지 slice 1에 포함(CLAUDE.md §8).

### 3-2. 🟡 업로드 → 처리 상태를 사용자에게 보여주는 UI
- jobs는 subscribe 가능. document-detail 페이지에서 `subscribeKnowledgeJobsByDocument`로
  `queued/processing/succeeded/failed`를 실시간 표시해야 "내 문서가 어디까지
  갔지?"가 풀린다.
- 현재 UI가 실제로 이 상태를 스팟라이트 하는지 확인 필요(스크롤·레이아웃·
  빈 상태 카피 포함).

### 3-3. 🟠 리뷰 → 승인 → 공개 반영의 UX 단계
- applyReviewAction(승인) 후 publishKnowledgeProjection(공개 반영) 두 온콜
  사이에 "리뷰 완료 배치" 같은 중간 상태가 UI에 드러나는지, 한 번에 몰아서
  publish를 트리거하는 명확한 CTA가 있는지.
- 사용자 여정이 "승인 → 공개 반영" 두 동작을 이해하도록 문구·순서가 명확해야.

### 3-4. 🟢 공개 미리보기가 실제 데이터 없을 때의 안내
- `knowledgePublicNodes`가 비면 ProjectKnowledgeTopology가 "문서 등록하러 가기"
  같은 **관리자용** CTA를 따로 보여주고, 게스트/멤버에게는 "문서가 모이면 여기에
  노드가 나타나요" 안내만 보여야.
- 이미 `ProjectKnowledgeTopology` 에서 안내 카피는 있음 (`아직 이 프로젝트 내부에
  공개된 항목 지도가 없습니다…`). 관리자에게 **직접 편집으로 점프**하는 버튼은
  있는지 재확인.

### 3-5. 🟠 demo 계정 seed의 파이프라인 노출
- `stress-lab` 계정에 문서·jobs·outputs·approvedNodes·publicNodes가 시드 반영돼
  공개 방문자가 "아 이렇게 흐름이 진행되는구나"를 한 눈에 볼 수 있어야 설득력 최대.
- 현재 stress spec(`tests/e2e/stress-topology.spec.ts`)가 2652 항목까지 참조.
  해당 수치가 실제 Firestore stress-lab 계정에 있는지, 없는 환경에서 링크 공유 시
  어떻게 보이는지 재현 필요.

## 4. 다음 사이클 권고 — 티켓 분할

**T-04-a (다음 사이클 즉시)**: admin-knowledge-document-new가 문서 생성 직후
자동 enqueueExtractionJob 하는지 코드 경로 확인. 안 하면 추가. 회귀 방지
spec으로 "업로드 → 5초 내 job queued 상태 표시" 확인.

**T-04-b**: document-detail 페이지에서 subscribeKnowledgeJobsByDocument 반영
UI 확인. 상태 배지(큐/진행/성공/실패) 없으면 추가. 실시간 반응 사용자 체감 확보.

**T-04-c**: review-workspace에서 "승인 N건" → "모두 공개 반영" CTA 순서·카피 검토.

**T-04-d**: 공개 상세 knowledge 빈 상태에 "관리자라면 바로 편집" 버튼 조건부.
이미 `canManageProject` 기반 CTA 있으면 skip.

**T-04-e (장기)**: demo/stress-lab 계정 Firestore 시드에 knowledgeDocuments ~
knowledgePublicNodes 체인 주입 운영 스크립트 정비. `scripts/` 또는 functions
트리거로.

**위 T-04-a~e는 별도 티켓으로 지침서 §3에 승격**하고, 루프가 1개씩 처리한다.

## 5. 지침서 원칙 §1.2와의 정합성

§1.2 "기획 → 스키마 → 권한 → UI 순서"에 비춰 보면 현재 상태는:

| 단계 | 구현 | 판정 |
| --- | --- | --- |
| 기획(유스케이스 B2) | CLAUDE.md + specs v2 | ✅ |
| 도메인·Firestore 스키마 | 8개 컬렉션 계약, rules 명시 | ✅ |
| 공개/비공개 읽기 권한 경계 | rules 이중 layer (공간/전역 + public 노드) | ✅ |
| Cloud Functions (변이) | 4 트리거 + 1 스케줄 | ✅ |
| 클라이언트 API | 엔티티별 api/ 정리 | ✅ |
| Admin UI | 5 views 존재 | ✅ (완성도는 T-04-a~d로) |
| 공개 렌더 | ProjectKnowledgeTopology 연결 | ✅ |
| 데모 데이터 | stress-lab 계정 스펙은 있음, 실재 확인 필요 | 🟡 T-04-e |

**결론**: §1.2를 만족. UI 완성도와 데모 데이터만 점진 개선 대상.

## 6. 1줄 요약

> "파이프라인 골격은 이미 end-to-end로 흐르고 있다. 사용자가 '막혔다' 느끼는
> 구간은 (a) 문서 업로드 직후 다음 행동이 뭔지 안내, (b) 리뷰→공개 반영 두
> 단계의 구분, (c) 공개 화면에서 빈 상태를 만났을 때 관리자 진입 경로.
> 티켓 T-04-a~e로 하나씩 메꾼다."
