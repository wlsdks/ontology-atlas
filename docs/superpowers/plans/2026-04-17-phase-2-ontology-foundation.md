# Phase 2 구현 계획 — Ontology Foundation

> Goal: Markdown 문서를 원천 소스로 받아 온톨로지 후보를 생성하고, 운영자가 리뷰 후 공개 그래프에 반영할 수 있는 최소 운영 루프를 만든다.

**Reference:**

- [`../specs/2026-04-17-ontology-driven-project-map.md`](../specs/2026-04-17-ontology-driven-project-map.md)
- [`../../DATA-MODEL.md`](../../DATA-MODEL.md)
- [`../../ADMIN-GUIDE.md`](../../ADMIN-GUIDE.md)

---

## 1. 범위

이 phase에서 반드시 끝내야 하는 것:

- Markdown 문서 저장
- frontmatter/섹션 규격 검사
- extraction job 생성
- Gemini 기반 추출 워커 인터페이스
- extraction 결과 저장
- 리뷰 큐
- 승인된 노드/엣지 저장

이 phase에서 하지 않는 것:

- 완전 자동 공개 반영
- 기존 홈을 온톨로지 화면으로 전면 교체
- Git 동기화
- 다중 provider 운영

---

## 2. 산출물

- `ontologyDocuments` 저장/조회 API
- `ontologyExtractionJobs` 생성/상태 갱신 API
- `ExtractionProvider` 인터페이스
- Gemini adapter 초안
- 리뷰 큐 UI
- ontology node/edge 승인 저장
- 문서 규격 가이드 초안 UI

---

## 3. 구현 순서

### Track A — 데이터/모델

- [ ] `docs/DATA-MODEL.md`에 ontology 컬렉션 초안 반영
- [ ] `src/entities/ontology-document/model`
- [ ] `src/entities/ontology-node/model`
- [ ] `src/entities/ontology-edge/model`
- [ ] `src/entities/ontology-review/model`

### Track B — 문서 등록

- [ ] `/admin/ontology/documents`
- [ ] 문서 생성 폼
- [ ] frontmatter 파서
- [ ] 규격 점수 계산기
- [ ] chunk 분해기

### Track C — 추출 워커 연동

- [ ] extraction job 생성
- [ ] provider interface 정의
- [ ] Gemini adapter 구현
- [ ] output schema validator
- [ ] extraction 결과 저장

### Track D — 리뷰 큐

- [ ] `/admin/ontology/reviews`
- [ ] 신규 노드 승인
- [ ] 신규 관계 승인
- [ ] merge candidate 처리
- [ ] evidence excerpt viewer

### Track E — 공개 화면 최소 통합

- [ ] 승인된 ontology data read model 생성
- [ ] Structure View 프로토타입
- [ ] Evidence Drawer 최소 버전

---

## 4. 권장 파일 배치

```text
src/
  entities/
    ontology-document/
    ontology-node/
    ontology-edge/
    ontology-review/
    ontology-extraction/
  features/
    ontology-document-create/
    ontology-document-parse/
    ontology-review-approve/
    ontology-review-merge/
  widgets/
    ontology-document-list/
    ontology-review-queue/
    ontology-evidence-drawer/
    ontology-structure-canvas/
  views/
    admin-ontology-dashboard/
    admin-ontology-documents/
    admin-ontology-reviews/
```

---

## 5. API/서비스 경계

초기에는 메인 앱과 워커를 느슨하게 연결한다.

- 앱: Firestore에 `job` 생성
- 워커: `queued` job 조회 후 처리
- 워커: 결과를 `ontologyExtractions`와 `ontologyReviews`에 저장
- 앱: 리뷰 승인 시 `ontologyNodes`/`ontologyEdges` 반영

---

## 6. 수용 기준

- 운영자는 Markdown 1개를 등록하고 추출 실행까지 할 수 있다.
- 문서 규격 문제를 UI에서 즉시 볼 수 있다.
- 추출 결과가 리뷰 큐에 쌓인다.
- 리뷰에서 승인한 노드/엣지가 저장된다.
- Structure View가 승인된 데이터만 읽어 렌더할 수 있다.

---

## 7. 리스크

- 자유형 문서 입력이 많으면 리뷰 큐가 폭증할 수 있다.
- 노드 병합 로직이 약하면 그래프 중복이 빠르게 누적된다.
- 워커 출력 스키마가 느슨하면 이후 모든 UI가 흔들린다.

초기 대응:

- 규격 점수 낮은 문서는 자동 반영 금지
- merge candidate는 무조건 리뷰 큐
- provider output JSON schema를 엄격히 고정
