---
name: 온톨로지 manual editor v0 — 사용자 직접 노드 작성
description: 추출 워커 거치지 않고 사용자가 직접 ontology 노드·관계 추가하는 surface 설계
status: 🌿 Phase 4 in progress — Phase 1 (PR #65) + Phase 2 (PR #66) + Phase 3 (PR #67) production 배포 완료. iter 38 에 manual chip 표시 (트리/검색/ego/카드 4 surface 일관).
date: 2026-04-27
related:
  - docs/superpowers/specs/2026-04-27-ontology-v1-experience-concept.md
  - docs/superpowers/specs/2026-04-27-ontology-design-loop.md (v0 백본)
  - docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md
---

# 온톨로지 manual editor v0

> **목적**: 사용자가 추출 워커·검수 사이클 없이 직접 ontology 노드를 만들고 관계를 그리는 경로. 문서 → 추출 → 검수 흐름의 보완 (대체 X).

---

## 0. 왜 필요한가

현재 ontology 가 자라는 유일한 경로:

1. md 문서 작성 → frontmatter 입력
2. 추출 워커 (Anthropic LLM) 호출
3. `knowledgeExtractionJobs` → `knowledgeOutputs` (검수 후보)
4. 검수자가 승인 → `knowledgeApprovedNodes/Edges`
5. publish → `knowledgePublic*`

**문제점**:

- 비기술 사용자에게 frontmatter · md · LLM 흐름이 friction.
- 단순한 노드 (예: 새 capability 1개 추가) 만 원해도 전 흐름 거쳐야 함.
- 추출 워커 비용·지연 (Anthropic 토큰 + 검수 cycle).
- 진안의 머릿속에 이미 명확한 ontology 단위가 있을 때, 그걸 시스템에 옮기는 길이 LLM 우회 너무 멈.

**원하는 경로**: "이 capability 가 있다" → 한 폼 → 즉시 ontology 에 자라남.

---

## 1. 사용자 시나리오

### S1 — 진안, 새 capability 직접 추가

- `/ontology` 페이지 헤더 "+ 노드 추가" 또는 트리 우상단
- 모달: kind (역량) / project (드롭다운) / id (자동 slug 추천) / title / summary 입력
- 비슷한 기존 노드 매치 (iter 21 `findSimilarOntologyNodes`) 미리 경고
- 제출 → `knowledgeApprovedNodes` 직접 write (추출/검수 우회)
- 즉시 트리에 등장

### S2 — 진안, 기존 두 노드 사이 관계 직접 그리기

- ontology 노드 상세 패널에 "+ 관계 추가" 버튼
- 모달: target 노드 선택 (cmdk 검색 재활용) / type 선택 (7 종) / 메모
- 제출 → `knowledgeApprovedEdges` 직접 write
- 1-hop ego graph 즉시 갱신

### S3 — 진안, manual 노드를 나중에 문서로 backfill

- manual 노드는 `evidenceIds` 빈 채로 자람
- 나중에 문서 작성하면 그 문서의 evidence 가 manual 노드에 추가
- 별도 surface 안 가도 자연스러운 backfill

---

## 2. 데이터 경계

### 2.1 새 필드 — `source: "manual" | "extraction"`

**기존**: `KnowledgeGraphNode` / `KnowledgeGraphEdge` 의 모든 인스턴스가 추출-검수-승인 거친 결과로 가정.

**v0**: 같은 collection (`knowledgeApprovedNodes/Edges`) 에 두 source 가 섞임.

```ts
interface KnowledgeGraphNode {
  // 기존 필드 ...
  source?: "manual" | "extraction";  // 새. 옵션 (legacy default = extraction).
  manualAuthor?: string;              // source=manual 시 uid.
  manualNote?: string;                // source=manual 시 추가 메모.
}
```

**호환성**: 옵션 필드라 기존 데이터·코드 깨지지 않음. UI 가 `source === "manual"` 시 "manual" chip 표시.

### 2.2 출처 추적

- `manualAuthor` — uid (Firestore rules 가 `request.auth.uid` 와 일치 검증)
- `lastApprovedBy` — 같은 uid (manual = self-approve)
- `evidenceIds` — manual 노드는 처음 `[]` (나중에 문서로 backfill 가능)
- `lastApprovedAt` — write 시 serverTimestamp

### 2.3 publish projection

manual 노드도 `knowledgePublicNodes` 로 publish 됨. UI 가 `source` 필드 노출 — 사용자가 "이거 추출인가, 누가 손으로 넣었나" 식별 가능.

---

## 3. Firestore rules 변경

### 3.1 현재 (v0 백본)

`knowledgeApprovedNodes/Edges` 는 trusted server (Cloud Functions `applyReviewActionCore`) 만 write 가능. 클라이언트 write 차단.

### 3.2 변경

```
match /knowledgeApprovedNodes/{nodeId} {
  allow read: if isAccountMember(resource.data.accountId);
  allow create: if isAccountMember(request.resource.data.accountId)
                && request.resource.data.source == "manual"
                && request.resource.data.manualAuthor == request.auth.uid
                && request.resource.data.kind in ["project", "domain", "capability", "element", "document"]
                && request.resource.data.title is string
                && request.resource.data.title.size() > 0;
  allow update: if isAccountMember(resource.data.accountId)
                && resource.data.source == "manual"
                && resource.data.manualAuthor == request.auth.uid;
  allow delete: if isAccountMember(resource.data.accountId)
                && resource.data.source == "manual"
                && resource.data.manualAuthor == request.auth.uid;
}
```

**원칙**:

- **manual 만 client write 가능** — extraction 출처는 여전히 server 만.
- account member + author 본인만 update/delete.
- kind 화이트리스트 (TBox 5 클래스, `unknown` 제외).
- title 비어 있지 않음.

### 3.3 Edge rules 동일

`knowledgeApprovedEdges` 도 같은 패턴 — manual edge 만 client create 가능.

---

## 4. UI 진입점

### 4.1 `/ontology` 페이지

- 헤더 "+ 노드 추가" 버튼 — 모달 열기
- 노드 상세 패널 "+ 관계 추가" 버튼 — selectedNode 가 from 으로 prefilled

### 4.2 모달 폼 (노드)

- kind 드롭다운 (5 클래스, `unknown` 제외)
- project 자동완성 (기존 project node + 검색)
- id (자동 slug 추천 from title, 사용자 override 가능)
- title (필수)
- summary (옵션)
- **dedup 매치** — title 입력 시 실시간 `findSimilarOntologyNodes` (iter 21 매처) 호출 → 비슷한 기존 노드 카드 표시. score ≥ 80 시 amber 경고.
- 제출 버튼 — 비슷한 노드 있으면 "그래도 만들기" / "기존 노드 보기" 두 옵션.

### 4.3 모달 폼 (관계)

- from / to 노드 (둘 다 cmdk 같은 검색)
- type (7 종 라디오)
- 메모 (옵션, manual edge 의 manualNote)
- 제출 → write + ego graph 갱신.

### 4.4 노드/edge 표시

- `source: "manual"` 인 노드/edge 에 inline "manual" chip (warm gray).
- 패널에 manualAuthor + manualNote 표시.

---

## 5. 단계적 구현 plan

### Phase 1 — 데이터 모델 + rules (docs-first 후 코드)

- `KnowledgeGraphNode/Edge` 에 `source / manualAuthor / manualNote` 필드 추가 (옵션).
- mapper 가 새 필드 read/write.
- firestore.rules 변경 + emulator 테스트.
- DATA-MODEL.md 갱신 (manual source 명시).
- **분량**: 2-3 fire.

### Phase 2 — Manual node create UI

- `/ontology` 헤더 "+ 노드 추가" 버튼.
- 모달 컴포넌트 + 폼 + dedup 매치.
- `addNoteFn(input): Promise<string>` entity api (client-side write).
- **분량**: 3-4 fire.

### Phase 3 — Manual edge create UI

- 노드 상세 패널 "+ 관계 추가" 버튼.
- 모달 + 폼 + target 검색.
- `addEdgeFn(input): Promise<string>` entity api.
- **분량**: 2-3 fire.

### Phase 4 — Manual chip + 출처 표시

- 노드/edge UI 가 source/manualAuthor/manualNote 표시.
- 모든 surface (트리 / 검색 결과 / 1-hop ego / 카드) 일관.
- **분량**: 2-3 fire.

### Phase 5 — Edit / Delete

- manual 노드 inline 편집 (title / summary)
- delete (관련 edge 도 cascade)
- 충돌 회피: extraction 으로 자란 같은 ID 노드와 합쳐지면 manual 정보 보존.
- **분량**: 3-4 fire.

**총 12-17 fire** — 큰 작업. C (visual editor) 전제 조건.

---

## 6. 위험 + 대안

### 6.1 위험

- **데이터 오염** — 사용자가 무작위 manual 노드 양산 → ontology 품질 저하. 완화: dedup 경고 + `source` 표시 + manualAuthor 추적.
- **합치기 충돌** — 같은 ID 노드를 한 사람은 manual, 다른 추출이 만들면 어느 쪽이 truth? → **§6.3 결정** 참조.
- **publish projection 비용** — manual create 빈도 ↑ 시 publish 트리거 빈도 ↑. 완화: throttle / batch (Phase 4 publish projection 단계에서 정량 측정 후 결정).

### 6.2 대안

- **manual 만 별도 collection** — `knowledgeManualNodes`. extraction 과 완전 분리. 단점: UI 가 두 source 합쳐서 보여줘야, 조회 복잡 ↑.
- **manual 도 검수 cycle 거침** — manual 후보 → 검수 → approved. 이 경우 "쉽게 만들기" 의도와 모순.
- **temporary draft** — manual 은 draft 로 자람, 일정 시간 후 자동 승인. 중간 안.

→ **선택**: 같은 collection + `source` 필드 (옵션 2.1).

### 6.3 충돌 정책 결정 (Phase 1 closure)

**원칙**: **manual wins** — 사용자가 명시적 의도로 만든 노드는 자동 추출이 덮어쓰지 못한다.

#### 6.3.1 케이스 A — manual 이 먼저, extraction 이 같은 ID 후보 생성

1. extraction 워커가 frontmatter `id` 로 같은 ID 후보를 만들어 `knowledgeExtractionOutputs` 에 적재.
2. 검수자가 승인 시 `applyReviewActionCore` (Cloud Functions) 가 기존 `knowledgeApprovedNodes/{id}` 를 read.
3. 기존 노드의 `source === "manual"` 이면:
   - **title / summary / manualNote 보존** (manual 의 user truth 우선).
   - **evidenceIds 만 합집합 추가** (extraction 이 가져온 새 evidence id 추가).
   - **lastApprovedAt / lastApprovedBy 는 기록하되 source 는 "manual" 유지**.
   - extraction 의 `parentId` 가 있고 manual 의 `parentId` 가 비어 있으면 채워넣음 (보강 가능).
4. 검수 큐 UI 가 "기존 manual 노드와 합쳐짐 (title 보존)" 알림 표시.

#### 6.3.2 케이스 B — extraction 이 먼저, manual 이 같은 ID 시도

1. 클라이언트 manual create 시 firestore.rules `create` 만 허용 (현재 §3.2 그대로). 같은 ID 가 이미 있으면 Firestore 가 `ALREADY_EXISTS` 반환.
2. 클라이언트 UI 가 에러 캐치 → "이 ID 는 이미 추출 결과로 존재. 기존 노드 보기 / 다른 ID 로 시도" 두 옵션.
3. **manual 이 extraction 노드를 update 하지 못함** — rules 가 `resource.data.source == "manual"` 만 update 허용 (§3.2). 사용자가 extraction 노드를 손으로 고치고 싶으면 Phase 5 의 별도 "extraction-to-manual conversion" 작업 필요 (현재 범위 외).

#### 6.3.3 Edge 충돌

같은 (from, to, type) 튜플 edge 가 양 source 에서 만들어지는 경우:

- **edge ID 가 다르면 별개 edge** — 각자 source 유지. 시각화 시 weight 로 표현 (현재도 evidenceCount 가 중복 evidence 합산).
- **edge ID 가 같으면 노드와 동일 manual wins 정책** — manual edge 의 manualNote 보존, evidenceIds 만 합집합.

#### 6.3.4 publish projection 처리

`publishKnowledgeProjectionCore` 는 `source` 필드를 그대로 `knowledgePublicNodes/Edges` 로 복사. 공개 surface 가 manual chip 표시 가능 (옵션, Phase 4).

**구현 위치**: Cloud Functions `applyReviewActionCore` — Phase 1 데이터 모델 + rules 변경 외 코드 변경은 Phase 4 (publish projection 갱신) 또는 Phase 5 (cascade). Phase 2-3 (UI) 는 충돌 시 케이스 B 의 `ALREADY_EXISTS` 캐치만 구현하면 됨.

---

## 7. A (frontmatter wizard) 와의 관계

A 는 추출 흐름의 입력 친절화. B (이 문서) 는 추출 흐름 우회. 둘 다 가능 — 사용자가 상황에 맞게 선택.

- "문서가 있고 자동 추출 신뢰" → A (wizard 가 등급 A 진입 도움)
- "단순 노드 1-2 개만 빠르게" → B (manual editor 직접)

UI 진입점 분리 → 사용자가 혼동 안 함.

---

## 8. 다음 액션

### Phase 1 (iter 35 — ✅ 완료, PR #65 머지)
- [x] `source` / `manualAuthor` / `manualNote` 옵션 필드 (types + mapper + DATA-MODEL.md)
- [x] firestore.rules manual create/update/delete (kind/type 화이트리스트, author 본인만, accountId/from/to 불변)
- [x] §6.3 충돌 정책 결정 (manual wins + 케이스 A/B/edge/publish 명시)
- [ ] (옵션) emulator rules unit test — Phase 2 UI 와 함께 e2e 로 검증 (배포 후 사용자 손 검증으로 대체)

### Phase 2 (iter 36 — ✅ 완료, PR #66 머지)
- [x] `addManualKnowledgeNode(input): Promise<{id, alreadyExists}>` entity api — `runTransaction` 으로 race-safe + §6.3.2 케이스 B 분기. 입력 검증 순수 함수 + 9 unit test.
- [x] `ManualNodeCreateModal` widget — kind 5종 select, ID (자동 추천 `<kind>.<slug>` + override), 제목/요약/메모, inline dedup 매치 (top 4, score ≥ 80 amber), ID 충돌 사전 감지, `ALREADY_EXISTS` 알림.
- [x] `/ontology` 헤더 첫 액션 pill = "노드 추가" (인디고 강조). 생성 성공 시 selectedNode 자동 점프.
- [ ] dev/production 시각 검증 — 사용자 손 클릭 (배포 후).

### Phase 3 (iter 37 — ✅ 완료, PR #67 머지)
- [x] `addManualKnowledgeEdge(input): Promise<{id, alreadyExists}>` entity api — `runTransaction` race-safe + canonical edge ID `<type>:<from>-><to>` (functions/index.js:1036 와 동일). 검증 순수 함수 (account/from/to/self-loop/type) + 9 unit test.
- [x] `ManualEdgeCreateModal` widget — from prefill, type 7종 select, to 검색 dropdown (title/ID 부분 매치 top 8), label/메모, edge ID 사전 충돌 감지 (composeManualEdgeId 로 미리 계산 후 existingEdges 비교), `ALREADY_EXISTS` 알림.
- [x] `NodeDetailPanel` 헤더 "+ 관계" 인디고 버튼 (stub 노드 제외) → from prefill 후 모달 열기.
- [x] production 배포 완료 (`firebase deploy --only hosting,firestore:rules`, main `01fb407`).

### Phase 4 (iter 38 — 진행 중)
- [x] `ManualSourceChip` 신규 (entities/knowledge-graph/ui) — warm gray inline 라벨, compact/default 두 사이즈. extraction 은 chip 안 그림 (signal-to-noise 보호).
- [x] NodeDetailPanel — 헤더 kind label 옆 chip + summary 아래 "작성 메모" (manualNote) 박스.
- [x] OntologyTreeView — 트리 행 + orphans 행 chip.
- [x] GlobalSearch — ontology 결과 행 chip.
- [x] OntologyEgoGraph — manual 노드는 SVG 점선 외곽 (center / neighbor), manual edge 는 line 점선.

### Phase 5 부터
- Phase 5: manual 노드 inline 편집 (title / summary / manualNote) + delete (cascade — 관련 manual edge 도 같이).
- 충돌 회피: extraction 으로 자란 같은 ID 노드와 합쳐지면 manual 정보 보존 (§6.3.1).

A (frontmatter wizard) 는 Phase 1-5 와 병행 가능 (다른 surface, 다른 흐름).
