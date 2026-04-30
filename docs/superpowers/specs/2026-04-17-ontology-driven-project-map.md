# Aslan Project Map — Ontology-Driven 확장 설계

**작성일**: 2026-04-17
**작성자**: 진안 + Codex
**상태**: 보류
**버전**: 0.1
**대체 문서**: [`2026-04-17-document-knowledge-subsystem-v2.md`](./2026-04-17-document-knowledge-subsystem-v2.md)
**선행 문서**: [`2026-04-12-aslan-project-map-design.md`](./2026-04-12-aslan-project-map-design.md)

---

## 1. 개요

### 1.1 무엇을 바꾸려는가

현재 Aslan Project Map은 프로젝트 사이의 연결을 `dependencies` 중심으로 표현하는 **토폴로지 맵**이다. 다음 단계에서는 Markdown 기획 문서를 입력으로 받아, 문서 안의 개념과 관계를 추출하고, 이를 근거 기반 그래프로 축적하는 **온톨로지 기반 시스템 맵**으로 확장한다.

핵심 변화는 단순하다.

- 지금: "A 프로젝트가 B 프로젝트에 의존한다"
- 확장 후: "A 프로젝트 안에 어떤 도메인이 있고, 그 도메인이 어떤 기능을 가지며, 어떤 요소가 그것을 구현하고, 이 사실이 어떤 문서에서 왔는지"까지 표현

### 1.2 왜 필요한가

현 구조는 공개 포트폴리오로는 충분히 강하지만, 아래 문제를 가진다.

- `dependencies`만으로는 연결의 의미가 너무 빈약하다.
- 문서가 늘어나도 그래프가 자동으로 진화하지 않는다.
- 프로젝트 내부 구조가 "프로젝트 단위 카드" 아래에서 잘 드러나지 않는다.
- 문서 간 중복, 용어 흔들림, 숨은 관계를 사람이 수동으로 정리해야 한다.

### 1.3 목표

1. 기획 Markdown을 시스템의 원천 입력으로 삼는다.
2. 문서를 자동 분해해 온톨로지 노드/관계 후보를 생성한다.
3. 메인 화면은 `Project -> Domain -> Capability -> Element` 계층으로 읽히게 만든다.
4. 모든 관계는 문서 근거와 신뢰도를 가진다.
5. 자동 추출은 가능하게 하되, 낮은 신뢰도 연결은 사람이 검수한다.

### 1.4 Non-Goals

- 자유형 Markdown을 100% 정확도로 해석하는 범용 AGI 에디터
- 첫 버전부터 완전 무인 운영
- 온톨로지를 외부 표준 RDF/OWL로 바로 내보내는 것
- 모든 개념 타입을 초기에 다 지원하는 것

---

## 2. 제품 원칙

### 2.1 토폴로지를 버리지 않는다

온톨로지는 토폴로지를 대체하는 것이 아니라 상위 모델이다. 즉, **토폴로지는 온톨로지의 한 뷰**로 취급한다.

- 온톨로지: 의미 모델
- 토폴로지: 그중 연결성을 강조한 시각화 모드

이 원칙을 지키면 현재 공개 화면의 장점을 잃지 않으면서 확장할 수 있다.

### 2.2 문서가 원천 소스다

그래프를 사람이 UI에서 직접만 편집하는 방식은 유지 비용이 높다. 문서를 원천으로 두고, UI는 문서에서 추출된 구조를 검수/보정하는 역할을 맡는다.

### 2.3 관계는 항상 근거를 가져야 한다

온톨로지 노드와 엣지는 가능하면 항상 아래 메타를 가져야 한다.

- 어떤 문서에서 왔는가
- 문서의 어느 섹션/청크에서 왔는가
- 사람이 승인했는가
- 모델이 얼마나 확신하는가

### 2.4 자동화와 검수는 분리한다

LLM은 후보를 제안한다. 저장과 병합은 스키마 검증과 규칙 엔진이 한다. 최종 공개 반영은 운영자가 승인한다.

---

## 3. 정보구조

### 3.1 메인 계층

첫 버전의 주 계층은 아래처럼 고정한다.

```text
Project
  -> Domain
    -> Capability
      -> Element
```

이 계층은 메인 캔버스에서 위에서 아래로 읽히는 기본 구조다.

### 3.2 각 레벨의 의미

| 레벨 | 의미 | 예시 |
| --- | --- | --- |
| `Project` | 외부에 드러나는 제품/시스템/이니셔티브 단위 | Aslan Maps, Reactor |
| `Domain` | 프로젝트 안의 큰 문제영역 또는 운영 영역 | 인증, 에이전트 실행, 문서 처리 |
| `Capability` | 도메인이 제공하는 기능적 능력 | 로그인, spec 검색, 권한 검증 |
| `Element` | 실제 구현체, 자산, 인터페이스, 데이터 구조 | API, Agent, Screen, Collection, Prompt |

### 3.3 `Element` 아래를 더 나누지 않는 이유

초기에는 `Element`보다 더 깊은 트리 레벨을 추가하지 않는다. 대신 `elementType`으로 분류한다.

예시:

- `service`
- `api`
- `agent`
- `workflow`
- `schema`
- `data-store`
- `ui`
- `prompt`
- `integration`

이유는 다음과 같다.

- 화면 깊이가 늘어날수록 탐색 난도가 급격히 올라간다.
- 초기에 가장 많이 흔들리는 것은 구조보다 타입 이름이다.
- 뎁스를 늘리기보다 속성을 늘리는 편이 병합과 검색에 유리하다.

### 3.4 문서는 계층 노드가 아니라 근거 노드다

문서 자체는 `Project -> Domain -> Capability -> Element` 트리에 직접 매달지 않는다. 문서는 별도의 `Document` 노드로 존재하며, 각 개념을 설명하는 근거로 연결된다.

```text
Document --describes--> Project/Domain/Capability/Element
```

이렇게 해야 메인 캔버스가 문서 파일 목록처럼 무너지지 않는다.

---

## 4. 온톨로지 노드와 관계

### 4.1 노드 타입

첫 버전은 아래 5개만 공식 지원한다.

- `project`
- `domain`
- `capability`
- `element`
- `document`

### 4.2 관계 타입

첫 버전의 표준 관계 타입은 아래로 제한한다.

| 관계 | 의미 |
| --- | --- |
| `contains` | 상위 구조가 하위 구조를 품음 |
| `belongs_to` | 특정 개념이 상위 개념에 속함 |
| `depends_on` | 기능/요소가 다른 기능/요소에 의존 |
| `implements` | 요소가 기능을 구현 |
| `describes` | 문서가 개념을 설명 |
| `uses` | 한 요소가 다른 요소를 사용 |
| `related_to` | 약한 연관. 초기 추출에서 보조 관계로 사용 |

### 4.3 관계 해석 원칙

- `contains`와 `belongs_to`는 구조 관계다.
- `depends_on`, `implements`, `uses`는 동작 관계다.
- `describes`는 문서 근거 관계다.
- `related_to`는 임시적이다. 충분한 근거가 쌓이면 더 구체적인 타입으로 승격한다.

### 4.4 노드 중복 병합 원칙

같은 개념으로 보이는 노드는 아래 기준으로 병합 후보를 만든다.

1. 명시적 `id` 일치
2. 동일 `project` 안에서 `title`과 `aliases` 정규화 후 일치
3. 동일 문서 묶음에서 타입과 문맥이 일치

확신이 낮으면 병합하지 않고 리뷰 큐로 보낸다.

---

## 5. Markdown 문서 계약

### 5.1 왜 규격이 필요한가

자유형 Markdown만으로도 일부 추출은 가능하지만, 운영 가능한 수준의 정확도를 얻기 어렵다. 따라서 "사람이 쓰기 부담스럽지 않으면서, 기계가 안정적으로 읽을 수 있는" 최소 규격이 필요하다.

### 5.2 기본 계약

문서는 아래 두 층으로 구성한다.

1. **Frontmatter**
2. **권장 섹션 구조**

### 5.3 필수 Frontmatter

```md
---
id: auth-login
kind: capability
project: aslan-maps
domain: authentication
title: 로그인
status: active
aliases:
  - sign in
tags:
  - auth
relates:
  - type: depends_on
    target: iam
---
```

필수 필드는 아래다.

- `id`
- `kind`
- `project`
- `title`

권장 필드는 아래다.

- `domain`
- `status`
- `aliases`
- `tags`
- `relates`

### 5.4 권장 본문 섹션

아래 섹션 이름을 기본 규격으로 권장한다.

- `요약`
- `문제`
- `역할`
- `입력`
- `출력`
- `구성 요소`
- `관계`
- `의사결정`
- `오픈 이슈`

섹션명이 다르더라도 추출은 시도하되, 위 표준 이름을 쓰는 문서에 더 높은 신뢰도를 준다.

### 5.5 자유형 Markdown 처리

규격을 따르지 않는 문서도 받을 수는 있다. 다만 처리 방식은 다르게 한다.

- frontmatter 없음: `document`만 생성하고 약한 후보 추출
- 섹션명 불명확: chunk 단위 후보만 생성
- 관계 대상 불명확: `related_to` 후보만 생성
- 중복 충돌 큼: 리뷰 큐 우선 전송

즉, 자유형 문서를 막지 않되, **자동 반영 수준은 낮춘다**.

---

## 6. 문서 인제스트 파이프라인

### 6.1 전체 흐름

```text
문서 업로드
  -> 문서 정규화
  -> 청크 분해
  -> 엔티티/관계 후보 추출
  -> 기존 그래프와 매칭
  -> 병합/충돌 판정
  -> 리뷰 큐
  -> 승인 후 공개 그래프 반영
```

### 6.2 단계별 설명

#### A. 문서 등록

- Markdown 원문 저장
- 파일 메타 저장
- 문서 해시 생성
- 프로젝트/소스 폴더와 연결

#### B. 정규화

- frontmatter 파싱
- heading tree 추출
- bullet/list/table/code block 구분
- 링크, 인라인 코드, callout 정리

#### C. 청크 분해

문서를 아래 기준으로 chunk로 나눈다.

- heading 구간
- 리스트 블록
- 표
- 코드 블록 인접 설명

chunk는 이후 evidence 단위가 된다.

#### D. 후보 추출

각 chunk에서 아래를 추출한다.

- 노드 후보
- 관계 후보
- 속성 후보
- 별칭 후보
- 근거 span

#### E. 엔티티 해석

후보를 기존 ontology와 비교해 아래로 분류한다.

- 신규 생성
- 기존 노드와 병합
- 관계 추가
- 충돌
- 검토 필요

#### F. 리뷰/승인

운영자는 아래 항목만 검수한다.

- 중복 병합 후보
- 낮은 신뢰도 관계
- 상위 계층 배치 충돌
- 잘못 추출된 node kind

### 6.3 신뢰도 정책

각 노드/관계 후보는 `0.0 ~ 1.0` 신뢰도를 가진다.

- `0.85+`: 규격 문서 + 명시적 관계 + target 일치
- `0.60~0.84`: 문맥상 유력하나 명시성 부족
- `<0.60`: 자동 반영 금지, 리뷰 큐

### 6.4 증거 보존 정책

모든 확정 노드/엣지는 적어도 하나의 evidence를 가진다.

- `documentId`
- `chunkId`
- `excerpt`
- `createdAt`
- `extractorVersion`

---

## 7. 사용자와 핵심 Job

### 7.1 주요 사용자

이 기능은 아래 3개 사용자군을 기준으로 설계한다.

| 사용자 | 목적 | 가장 중요한 화면 |
| --- | --- | --- |
| `방문자` | 프로젝트 구조와 의미를 빠르게 이해 | 공개 메인 캔버스 |
| `운영자` | 문서를 넣고 그래프를 유지/정제 | 어드민 리뷰 큐 |
| `작성자` | 문서 규격에 맞춰 지식 구조를 공급 | 문서 작성 가이드 + 업로드 화면 |

### 7.2 해결해야 하는 핵심 Job

#### 방문자 Job

- "이 프로젝트는 어떤 도메인과 기능으로 구성되는가?"
- "이 기능은 무엇이 구현하고, 무엇에 의존하는가?"
- "이 연결이 왜 생겼는가?"

#### 운영자 Job

- "새 Markdown 문서를 넣으면 그래프 후보가 생겨야 한다."
- "잘못 추출된 노드와 관계를 빠르게 정리해야 한다."
- "공개 화면에 반영되기 전, 불확실한 연결만 골라 검수해야 한다."

#### 작성자 Job

- "문서를 어떻게 쓰면 구조가 잘 추출되는지 즉시 이해할 수 있어야 한다."
- "자유형 문서도 넣을 수는 있지만, 규격 문서가 더 잘 먹힌다는 피드백을 받아야 한다."

---

## 8. UX 원칙

### 8.1 공개 화면 원칙

- 공개 화면은 "지식 대시보드"처럼 보이면 안 된다.
- 메인 경험은 여전히 "맵을 읽는다"여야 한다.
- 사용자는 구조를 먼저 보고, 관계와 근거는 필요할 때 내려가서 봐야 한다.

### 8.2 어드민 화면 원칙

- 운영자는 "문서 업로드 → 추출 결과 확인 → 승인" 흐름을 한 눈에 이해해야 한다.
- 리뷰 큐는 테이블 관리 화면보다 "지식 편집실"처럼 보여야 한다.
- 문제는 전체 리스트가 아니라 "검토가 필요한 차이" 중심으로 보여야 한다.

### 8.3 정보 밀도 원칙

- 메인 캔버스: 구조 우선
- 우측 패널: 의미와 근거
- 리뷰 큐: diff 우선
- 문서 상세: 원문보다 추출 결과와 근거 span 우선

### 8.4 시각 톤 원칙

온톨로지 기능이 추가되어도 현재 디자인 철학은 유지한다.

- Linear 기반
- 흑백 + 단일 인디고
- 분석 툴 같은 다색 heatmap 금지
- 그래프 시각화 때문에 형광색 상태 배지 남용 금지
- 문서/근거 UI도 "관리 콘솔"보다 "정리된 에디토리얼 패널"에 가깝게 설계

---

## 9. 화면 구조와 UI/UX 설계

### 9.1 공개 메인 화면

#### 기본 모드: `Structure View`

메인 캔버스는 아래 4개 레인을 가진다.

- `Project Lane`
- `Domain Lane`
- `Capability Lane`
- `Element Lane`

레이아웃 규칙:

- 좌상단에서 우하단으로 흐르는 약한 대각 리듬
- 허브 project는 완전 중앙이 아니라 약간 상단에 배치
- domain은 project 바로 아래에 붙되, 너무 카드 리스트처럼 정렬하지 않는다
- capability와 element는 완전 균등 그리드 대신 군집 느낌 유지

사용자 액션:

- 노드 클릭: 우측 패널 오픈
- 레인 라벨 클릭: 해당 레인만 강조
- capability 클릭: 하위 element와 관련 relation만 강조
- document evidence 있음: 우측 패널에서 excerpt preview 노출

#### 보조 모드: `Relation View`

선택 노드를 중심으로 관계를 다시 읽는 모드다.

- `depends_on`
- `implements`
- `uses`
- `describes`

표시 규칙:

- structure view의 레인 감각은 유지
- 선택 노드와 1-hop 관계만 기본 강조
- 2-hop 이상은 명시적 확장 액션이 있을 때만 노출

#### 우측 패널: `Evidence Drawer`

패널 상단:

- 노드 이름
- kind 라벨
- 상위 계층 breadcrumb
- 승인 상태 또는 근거 개수

패널 본문:

- `정의`
- `상하위 구조`
- `연결 관계`
- `근거 문서`
- `최근 추출 이력`

패널 하단:

- 상세 페이지 이동
- 근거 문서 열기
- 관계 강조 토글

### 9.2 어드민 정보구조

온톨로지 기능용 어드민은 아래 4개 화면으로 나눈다.

| 경로 | 목적 |
| --- | --- |
| `/admin/ontology` | 운영 개요, 큐 현황, 최근 추출 작업 |
| `/admin/ontology/documents` | 문서 등록/목록/상태 |
| `/admin/ontology/reviews` | 검토가 필요한 후보 처리 |
| `/admin/ontology/nodes/[id]` | 노드/엣지 단건 수정과 근거 확인 |

### 9.3 어드민 대시보드 UX

첫 화면은 "전체 건수"보다 "지금 처리할 일"이 먼저 보이게 만든다.

상단 카드:

- `검토 필요`
- `오늘 추출`
- `충돌 후보`
- `승인 대기 문서`

메인 리스트:

- 최근 extraction job
- 실패 job
- confidence 낮은 관계
- 병합 대기 노드

우측 보조 패널:

- 문서 규격 체크 요약
- 추출기 상태
- 최근 승인 로그

### 9.4 문서 등록 화면 UX

문서 등록은 "파일 업로드"보다 "문서 소스 등록" 개념으로 설계한다.

입력 영역:

- 프로젝트 선택
- 문서 제목
- 소스 타입 (`upload`, `paste`, `import`)
- 원문 입력 또는 파일 업로드

실시간 검사:

- frontmatter 감지 여부
- 필수 필드 누락
- 표준 섹션 감지 비율
- 예상 추출 난이도

하단 액션:

- `초안 저장`
- `추출 실행`
- `규격 자동 보정 제안 보기`

### 9.5 리뷰 큐 UX

리뷰 큐는 이 기능의 핵심 화면이다. 단순 테이블로 끝내면 운영 피로가 높아진다.

기본 레이아웃:

- 좌측: 검토 항목 목록
- 중앙: 후보 diff
- 우측: 근거 excerpt + 원문 위치

검토 단위:

- `신규 노드`
- `신규 관계`
- `중복 병합`
- `상위 계층 재배치`
- `문서 규격 문제`

각 항목에서 가능한 액션:

- `승인`
- `거절`
- `병합`
- `관계 타입 변경`
- `상위 이동`
- `보류`

### 9.6 문서 상세 화면 UX

문서 상세는 원문 viewer가 아니라 "문서 기반 추출 결과 설명 화면"이어야 한다.

상단:

- 문서 메타
- 최근 추출 시각
- 추출 상태
- 규격 점수

본문 2열:

- 좌측: 원문 섹션/청크
- 우측: 해당 청크에서 생성된 nodes/edges/evidence

핵심 인터랙션:

- 청크 hover -> 연결된 후보 highlight
- 후보 클릭 -> 원문 span highlight
- 경고 클릭 -> 해당 frontmatter/섹션으로 점프

### 9.7 모바일 원칙

온톨로지 기능은 모바일에서 완전 동일 경험을 강제하지 않는다.

- 공개 화면: 구조 탐색 + evidence drawer까지만 최적화
- 어드민 화면: 리뷰 큐는 read-only 우선, 승인 작업은 최소화
- 문서 상세 원문/후보 split view는 모바일에서 탭 전환으로 처리

---

## 10. 시스템 구성과 추출 워커 계약

### 10.1 컴포넌트 경계

시스템은 아래 4개 역할로 나눈다.

| 영역 | 책임 |
| --- | --- |
| `메인 앱` | 문서 등록, job 생성, 리뷰 큐, 승인 반영, 공개 렌더 |
| `추출 워커` | chunking, prompt 구성, LLM 호출, 후보 반환 |
| `검증 레이어` | schema validation, confidence 계산, merge rule 적용 |
| `저장 레이어` | 원문, chunk, 결과, 리뷰 상태, 승인된 ontology 저장 |

### 10.2 Gemini 사용 원칙

Gemini는 첫 후보 추출용으로 적합하다. 다만 제품 구조는 provider-agnostic 해야 한다.

- 앱은 Gemini SDK 세부사항을 몰라야 한다.
- 앱은 `ExtractionProvider` 인터페이스만 의존한다.
- Gemini는 `candidate generator`이지 truth engine이 아니다.

### 10.3 워커 배치 위치

권장 구조:

- 메인 앱: Next.js + Firebase
- 추출 워커: 별도 job runner 또는 Cloud Run 성격의 분리 실행기

초기에는 수동 트리거 배치로 시작해도 된다.

- 운영자가 `추출 실행` 클릭
- job 생성
- 워커가 문서 로드 후 추출
- 결과를 Firestore에 저장

### 10.4 Provider 계약

```ts
type ExtractionProvider = {
  extractDocument(input: ExtractionInput): Promise<ExtractionOutput>;
};
```

### 10.5 워커 입력 계약

```ts
type ExtractionInput = {
  jobId: string;
  documentId: string;
  projectId?: string;
  documentMeta: {
    title?: string;
    sourceType: "upload" | "paste" | "import";
    hash: string;
  };
  rawMarkdown: string;
  parsed: {
    frontmatter: Record<string, unknown>;
    chunks: Array<{
      chunkId: string;
      headingPath: string[];
      markdown: string;
    }>;
  };
};
```

### 10.6 워커 출력 계약

```ts
type ExtractionOutput = {
  documentSummary: {
    title: string;
    inferredKind?: "project" | "domain" | "capability" | "element" | "document";
    warnings: string[];
  };
  nodes: Array<{
    tempId: string;
    kind: "project" | "domain" | "capability" | "element" | "document";
    title: string;
    aliases?: string[];
    elementType?: string;
    projectId?: string;
    parentRef?: string;
    confidence: number;
    evidence: Array<{
      chunkId: string;
      excerpt: string;
    }>;
  }>;
  edges: Array<{
    tempId: string;
    type:
      | "contains"
      | "belongs_to"
      | "depends_on"
      | "implements"
      | "describes"
      | "uses"
      | "related_to";
    fromRef: string;
    toRef: string;
    confidence: number;
    evidence: Array<{
      chunkId: string;
      excerpt: string;
    }>;
  }>;
  warnings: string[];
};
```

### 10.7 후처리 원칙

워커 출력 후 시스템은 아래를 수행한다.

1. JSON schema validation
2. 금지 kind/type 필터링
3. confidence 보정
4. 중복 후보 매칭
5. 리뷰 항목 생성

LLM 출력이 그대로 공개 데이터가 되는 일은 없어야 한다.

---

## 11. 데이터 모델 제안

> 이 섹션은 구현 제안이다. 실제 스키마 변경 전에는 반드시 `docs/DATA-MODEL.md`를 먼저 갱신한다.

### 11.1 컬렉션 초안

```text
firestore/
├── projects/
├── ontologyNodes/
├── ontologyEdges/
├── ontologyDocuments/
├── ontologyDocumentChunks/
├── ontologyExtractionJobs/
├── ontologyExtractions/
└── ontologyReviews/
```

### 11.2 노드 초안

```ts
type OntologyNodeKind =
  | "project"
  | "domain"
  | "capability"
  | "element"
  | "document";

type OntologyNode = {
  id: string;
  kind: OntologyNodeKind;
  title: string;
  projectId?: string;
  parentId?: string;
  elementType?: string;
  aliases: string[];
  tags: string[];
  sourceDocumentIds: string[];
  status?: "active" | "planned" | "deprecated";
  approved: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 11.3 엣지 초안

```ts
type OntologyEdgeType =
  | "contains"
  | "belongs_to"
  | "depends_on"
  | "implements"
  | "describes"
  | "uses"
  | "related_to";

type OntologyEdge = {
  id: string;
  type: OntologyEdgeType;
  from: string;
  to: string;
  evidenceDocumentIds: string[];
  confidence: number;
  approved: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 11.4 문서 초안

```ts
type OntologyDocument = {
  id: string;
  projectId?: string;
  title: string;
  sourceType: "upload" | "paste" | "import";
  path?: string;
  hash: string;
  rawMarkdown: string;
  frontmatter: Record<string, unknown>;
  extractionStatus: "idle" | "queued" | "running" | "completed" | "failed";
  formatScore: number;
  lastExtractionJobId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 11.5 리뷰 항목 초안

```ts
type OntologyReviewItem = {
  id: string;
  type:
    | "new_node"
    | "new_edge"
    | "merge_candidate"
    | "reparent_candidate"
    | "format_issue";
  status: "open" | "approved" | "rejected" | "snoozed";
  documentId?: string;
  extractionJobId?: string;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 11.6 점진 전환 원칙

초기에는 기존 `projects` 컬렉션을 유지한다.

- 현재 공개 화면은 계속 `projects`로 동작
- 온톨로지 컬렉션은 병행 구축
- 충분한 데이터가 쌓이면 홈의 기본 시점을 온톨로지 기반으로 전환
- `projects.dependencies`는 이후 `ontologyEdges(type=depends_on)`와 동기화 또는 파생 뷰로 재정의

---

## 12. 운영 플로우

### 12.1 문서 등록 플로우

1. 운영자가 `/admin/ontology/documents`에서 문서를 등록한다.
2. 시스템이 frontmatter와 섹션 규격을 즉시 검사한다.
3. 운영자가 `추출 실행`을 누르면 job이 생성된다.
4. 워커가 추출 결과를 저장한다.
5. 리뷰 큐에 검토 항목이 생성된다.
6. 운영자가 승인하면 ontology graph에 반영된다.

### 12.2 리뷰 플로우

1. 운영자가 `/admin/ontology/reviews`로 들어간다.
2. 좌측 목록에서 가장 영향도 높은 항목이 상단에 온다.
3. 중앙 diff에서 "무엇이 새로 생겼는지"를 본다.
4. 우측 근거 패널에서 excerpt를 보고 승인/수정/거절한다.
5. 승인 즉시 공개 그래프 또는 승인 대기 그래프에 반영된다.

### 12.3 실패 플로우

#### 문서 규격이 약한 경우

- 업로드는 허용
- format score 낮음 표시
- 자동 반영 금지
- 규격 보정 제안 CTA 노출

#### 추출 실패

- job 상태 `failed`
- 실패 로그 저장
- 재시도 버튼 제공
- 원문은 유지

#### 중복 병합 충돌

- 자동 병합 금지
- merge candidate review 생성
- 기존 노드와 후보 노드 비교 화면 노출

---

## 13. 화면 목록과 구현 우선순위

### 13.1 공개 화면

- `홈 Structure View`
- `홈 Relation View`
- `Evidence Drawer`
- `Node Detail Page` 또는 기존 상세 확장

### 13.2 어드민 화면

- `Ontology Dashboard`
- `Document List`
- `Document Create / Detail`
- `Review Queue`
- `Node Detail Editor`

### 13.3 MVP 우선순위

반드시 먼저 만들 것:

1. `Document List`
2. `Document Create`
3. `Extraction Job Status`
4. `Review Queue`
5. `홈 Structure View 최소 버전`

나중에 붙여도 되는 것:

- 문서 import source 다양화
- 관계 필터 고도화
- 공개용 문서 깊은 탐색
- 배치 재추출

---

## 14. 단계별 롤아웃

### Phase A — 계약과 스키마

- 문서 규격 확정
- relation type whitelist 확정
- Firestore 컬렉션 초안 확정
- extraction output schema 확정

### Phase B — 문서 저장 계층

- 문서 등록 UI
- frontmatter 검사기
- chunk 분해기
- extraction job 생성

### Phase C — Gemini 기반 추출 워커

- provider adapter
- prompt template
- output validator
- extraction result 저장

### Phase D — 리뷰 큐

- review item 생성
- 신규 노드 승인
- 관계 승인/거절
- merge candidate 처리

### Phase E — 공개 화면 통합

- Structure View 도입
- Evidence Drawer 도입
- Relation View 최소 버전 도입

### Phase F — 기존 topology와 합류

- `projects.dependencies`와 ontology edge 동기화 규칙 정리
- 기존 상세 페이지와 evidence 연결
- 기존 추천 경로와 ontology 기반 큐레이션 결합

---

## 15. 성공 기준

### 15.1 제품 성공 기준

1. 규격 문서 10개를 넣었을 때 주요 노드/관계의 80% 이상이 수동 수정 없이 후보로 생성된다.
2. 운영자는 문서 1개 등록 후 5분 안에 공개 반영까지 끝낼 수 있다.
3. 방문자는 메인 화면에서 프로젝트 내부 구조를 계층적으로 이해할 수 있다.
4. 어떤 관계든 클릭하면 "왜 연결됐는지"를 문서 근거로 설명할 수 있다.

### 15.2 UX 성공 기준

1. 리뷰 큐에서 항목 1개 처리 시간이 30초 이내다.
2. 규격이 약한 문서도 실패 이유를 바로 이해할 수 있다.
3. 메인 화면은 기존 토폴로지보다 복잡해 보여서는 안 된다.
4. 모바일에서도 evidence 확인까지는 무리 없이 가능하다.

---

## 16. 오픈 이슈

1. Markdown 업로드를 Firestore 메타 + Storage 원문으로 둘지, Git 기반 sync로 둘지 결정 필요
2. 문서 버전 히스토리를 어디까지 보존할지 결정 필요
3. 한 노드가 여러 프로젝트에 걸칠 때 `projectId`를 단일값으로 둘지 다중 소속으로 열지 결정 필요
4. 추출 워커를 Cloud Run, GitHub Action, 로컬 배치 중 어디에 둘지 결정 필요
5. 공개 화면에서 `Document`를 어디까지 직접 노출할지 결정 필요
6. 상세 페이지를 기존 `/project/[slug]`에 합칠지 ontology detail route를 별도 둘지 결정 필요

---

## 17. 현재 권고안

온톨로지 확장의 첫 구현 단위는 "모든 문서를 완벽히 이해하는 시스템"이 아니다. 실제로는 아래 순서가 맞다.

1. 문서 계약을 고정한다.
2. 문서 저장과 규격 검사부터 만든다.
3. Gemini 기반 추출 워커를 분리된 후보 생성기로 둔다.
4. 리뷰 큐를 먼저 붙여 운영 루프를 만든다.
5. 그 다음 공개 Structure View를 점진적으로 올린다.

이 순서를 지키면 현재의 강한 공개 토폴로지 경험을 잃지 않으면서, 문서 기반 지식 지도로 자연스럽게 확장할 수 있다.
