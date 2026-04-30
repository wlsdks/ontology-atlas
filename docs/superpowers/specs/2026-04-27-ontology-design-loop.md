# 온톨로지 시스템 설계 — 자율 기획 루프

**작성일**: 2026-04-27
**상태**: 🔄 진행 중 (research → options → decision → tasks → dev)
**현재 단계**: `dev`
**선행 문서 (보류)**: [`2026-04-17-ontology-driven-project-map.md`](./2026-04-17-ontology-driven-project-map.md)
**관련 (knowledge v2)**: [`2026-04-17-document-knowledge-subsystem-v2.md`](./2026-04-17-document-knowledge-subsystem-v2.md), [`2026-04-17-knowledge-backend-contract-v1.md`](./2026-04-17-knowledge-backend-contract-v1.md)

---

## ⭐ 왜 이 작업이 중요한가 (loop 가 매 fire 마다 다시 읽을 것)

**온톨로지를 만들 수 있는 시스템이 되는 것** 이 Aslan Project Map 의 **핵심 정체성**이다. 토폴로지 (프로젝트-의존성 그래프) 는 그 출구 중 하나일 뿐이고, 진짜 가치는:

- md 문서 → 노드/관계 자동 추출 → 검수 → 그래프
- 그래프가 자라며 프로젝트·도메인·역량·요소 사이 관계가 쌓임
- 사용자가 새 문서를 넣을 때마다 시스템 이해도가 깊어짐

이 루프의 결과물은 곧 **제품의 두 번째 척추** 가 된다. 따라서:

- 단계마다 "충분한가?" 를 후하게 잡지 말고 **빡빡하게** 검증한다 (research 가 얕으면 options 가 흔들리고, decision 이 약해짐).
- 결정 단계에서 망설여지면 보류하고 research 로 되돌아간다 — **잘못된 결정 < 늦은 결정**.
- dev 단계 진입 후에도 task 분해가 부실하면 tasks 단계로 다시 내려간다.
- 이 작업은 다른 UI 작업들과 동급이 아니다. **속도보다 정확도**.

---

## 0. 루프 동작 규칙 (자기 자신을 위한 지침)

이 문서는 **20분마다 fire 되는 cron loop** 가 읽고 갱신하는 살아 있는 설계 문서다. 매 fire 시 아래를 따른다.

1. **현재 단계**(`상태` 줄) 확인 — `research / options / decision / tasks / dev` 중 하나.
2. 단계별로 다음 행동을 한 번 수행:
   - `research` — §1 연구 노트에 새 정보 1~2개 추가. 출처 포함. 충분히 모이면 §2 옵션 정리로 넘어가며 단계 = `options`.
   - `options` — §2 에 옵션별 장단점·구현 난이도·트레이드오프 보강. 옵션이 명확해지면 단계 = `decision`.
   - `decision` — §3 결정 근거 작성, 결정 못 하면 보류 사유 기록. 결정 완료 시 단계 = `tasks`.
   - `tasks` — §4 개발 task 단위로 분해 (각각 1 PR 크기). 분해 완료 시 단계 = `dev`.
   - `dev` — `redesign/simple-mobile` 외에 새 브랜치 (`feature/ontology-*`) 만들고 §4 의 다음 task 1개 수행 + 커밋.
3. **§5 반복 로그**에 한 줄 추가: `날짜 시각 · 단계 · 무엇을 했는지`.
4. 각 fire 의 작업은 **20분 안에 끝나는 분량**으로 자른다. 분량 큰 작업은 task 로 분해해 다음 fire 로 미룬다.
5. **다른 작업 가지치기 금지** — 이 문서 외 디자인 / UI 작업은 이 루프에서 안 한다. (사용자가 따로 지시하면 모름)

---

## 1. 연구 노트 (research)

> 온톨로지란 무엇인지, 다른 시스템은 어떻게 구현하는지, 우리 컨텍스트에 어떻게 적용 가능한지를 모은다.

### 1.1 정의 — 온톨로지 vs 토폴로지 vs 지식 그래프

#### 권위 있는 정의

- **W3C OWL 2 Overview** — "Ontologies are formalized vocabularies of terms, often covering a specific domain and shared by a community of users. They specify the definitions of terms by describing their relationships with other terms in the ontology." OWL 온톨로지는 4 요소로 구성: **classes, properties, individuals, data values**. 단순 schema 와 차별점은 **formal semantics** — 추론 (reasoning / inference) 이 가능한 logical meaning 을 부여한다는 것. ([w3.org/TR/owl2-overview](https://www.w3.org/TR/owl2-overview/))
- **Wikipedia (Information Science)** — "a representation, formal naming, and definitions of the categories, properties, and relations between the concepts, data, or entities". Tom Gruber (1993) 의 고전적 정의: **"a specification of a conceptualization"**. 구성 요소: **individuals (instances), classes (concepts), attributes, relations, axioms (제약식)**. ([en.wikipedia.org/wiki/Ontology_(information_science)](https://en.wikipedia.org/wiki/Ontology_(information_science)))
- **Stanford Encyclopedia of Philosophy** — 철학적 ontology 는 "the study of what there is" — 무엇이 존재하며 그것들의 가장 일반적인 metaphysical 속성·관계를 다룸. 정보과학 ontology 는 이걸 컴퓨터가 다룰 수 있도록 **형식화** 한 것. ([plato.stanford.edu/entries/logic-ontology](https://plato.stanford.edu/entries/logic-ontology/))

#### 우리가 받아갈 정의 (이 프로젝트 작업 기준)

> **온톨로지** = 도메인 안의 **개념(classes)** · **개체(individuals)** · **속성(attributes)** · **관계(relations)** 을 형식화하고, **제약식(axioms)** 으로 그 의미를 규정한 명세.

핵심은 "그래프가 있다" 가 아니라 **"의미가 있어서 추론·검증이 가능하다"** 는 것.

#### 토폴로지 ≠ 온톨로지 (핵심 차이)

| 축 | 토폴로지 (현 시스템) | 온톨로지 (목표) |
|---|---|---|
| 관심사 | **연결 구조** — 누가 누구에 의존하는가 | **의미 구조** — 무엇이 무엇이며 어떻게 관련되는가 |
| 노드 의미 | 동질적 (모두 "프로젝트") | 이질적 (Project / Domain / Capability / Element …) |
| 엣지 의미 | 단일 (`dependency`) | 다중 + 명명된 관계 (`uses` / `realizes` / `contains` / `extends` …) |
| 추론 | 없음 (시각화만) | 가능 (제약식이 있으면 일관성 검증·암묵 관계 추출) |
| 진화 방식 | 사람이 직접 입력 | 문서로부터 자동 추출 + 검수 |
| 데이터 출처 | `projects` 컬렉션 (수동 등록) | md 문서 본문 (markdown corpus) |

토폴로지는 온톨로지의 **얕은 view 한 가지** — 모든 노드를 "프로젝트" 클래스로, 모든 엣지를 "depends-on" 관계로 좁히면 토폴로지가 된다. 즉 온톨로지가 척추가 되면 토폴로지는 그 위의 한 projection.

#### 지식 그래프 (Knowledge Graph) 와의 관계

- **온톨로지** = schema / TBox (terminological — 클래스·속성·제약 정의)
- **지식 그래프** = data / ABox (assertional — 실제 instance 들의 사실)
- 합쳐서 "**ontology-backed knowledge graph**" — 우리가 만들려는 것이 정확히 이 형태. knowledge v2 의 `knowledgeApprovedNodes/Edges` 가 ABox 후보, 아직 비어 있는 TBox (스키마·관계 종류·제약) 를 이 루프가 설계해야 함.

### 1.2 산업 사례 — 어떤 형태의 온톨로지를 쓰나

도구를 4 진영으로 묶어 분석. 각 진영의 **TBox 강도** (얼마나 명시적 schema 가 있나) 와 **자동 추출 강도** (LLM 으로 그래프를 자라게 하나) 를 축으로.

#### A) 자유 그래프 — 사용자가 손으로 엮음, TBox 거의 없음

- **Roam Research** — block / page / bidirectional link 가 핵심 단위. `[[page]]` 문법으로 사용자가 직접 링크. **사실상 ontology 없음** — 모든 노드는 동질, 관계는 무명 (`refers-to`). LLM 자동 추출 없음. 가치는 "기록의 마찰 최소화 + 양방향 연결" 그 자체.
- **Logseq** — Roam clone 에 가까운 outliner. block 기반 + properties (`key:: value`) + datalog query. TBox 는 사용자가 properties 를 일관성 있게 쓸 때만 emergent. AI/LLM 통합은 플러그인 영역.

#### B) 사용자 정의 schema — TBox 를 유저가 직접 만듦

- **Obsidian Dataview** — frontmatter / inline `[key:: value]` 로 metadata 인덱싱. DQL (LIST/TABLE/CALENDAR/TASK) + JS API. **사용자가 implicit ontology 를 짠다** — 어떤 필드를 일관되게 쓰느냐가 곧 schema. 한계: "indexes and queries, doesn't edit" — 진짜 graph DB 가 아니라 파일 위 query engine. 관계 traversal 약함. ([blacksmithgu.github.io/obsidian-dataview](https://blacksmithgu.github.io/obsidian-dataview/))
- **Tana** — "supertags" 가 TBox. 태그가 단순 라벨이 아니라 **타입 + 필드 정의** (예: `#person` 은 email, role, company 필드를 가짐). 노드끼리 관계 가능. 제일 명시적인 사용자 정의 ontology 도구.
- **Notion** — relational databases + relation/rollup 속성. relational 모델이지 graph 모델이 아님. AI 는 주로 본문 작성·요약·번역 — **자동 그래프 추출은 약함**.

#### C) LLM 자동 추출 — 문서 → 그래프 자동, schema 도 자동

- **Microsoft GraphRAG** — 가장 적극적. LLM 이 unstructured text 에서 **entity + relationship** 추출 → 그래프 → bottom-up hierarchical clustering → community detection → community summary 생성. 질의 시 local search (entity 중심) / global search (community 중심) 둘 다 가능. Naive RAG (chunk + vector) 가 풀지 못하는 "흩어진 정보 잇기 + 거시적 요약" 을 잡음. ⚠️ "indexing can be an expensive operation". ([github.com/microsoft/graphrag](https://github.com/microsoft/graphrag), [microsoft research blog](https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/))
- **AutoSchemaKG (Bai et al., 2025)** — 큰 코퍼스에서 **unsupervised clustering + relation discovery** 로 schema 자체를 자동 유도. 사람이 TBox 를 짜지 않음. ([arxiv 2510.20345 survey](https://arxiv.org/abs/2510.20345))
- **KARMA (Lu & Wang, 2025)** — multi-agent 구조, 각 agent 가 schema-guided 추출. 정확도·일관성↑.

#### D) 학술 / 시맨틱 웹 — 명시적 형식 ontology

- **W3C OWL / RDF / SPARQL** — 가장 엄밀. classes / properties / axioms / reasoning. 하지만 **러닝 커브 가파름** — 일반 사용자 도구로 쓰기 어렵고, 작성·유지 비용이 큼.
- **Schema.org** — 웹 메타데이터용 공통 vocabulary (Person / Organization / Event …). TBox 만 정의, ABox (실제 데이터) 는 각 사이트 책임.

#### 우리에게 시사점

| 진영 | 받아갈 점 | 버릴 점 |
|---|---|---|
| A (Roam/Logseq) | **마찰 없는 입력** — md 문서가 곧 입력 | 무명 관계 / 동질 노드 (의미 약함) |
| B (Dataview/Tana) | **사용자가 점진적으로 schema 구체화** 할 수 있는 길 | 전부 사람 손에 맡기면 1,979 프로젝트 규모에서 깨짐 |
| C (GraphRAG/AutoSchemaKG) | **md → 자동 추출 + schema induction** 의 핵심 기술 차용 | 비용·지연 문제 → 모든 입력에 즉시 적용은 위험 |
| D (OWL/Schema.org) | **클래스·속성·제약 의 형식적 어휘** | 풀 OWL 의 엄밀함은 우리 도메인에 과함 |

**결론 hint (§3 으로 이어질):** 우리 시스템은 **B + C 의 합성** — 사용자가 가벼운 TBox 를 짤 수 있게 하되, LLM 이 md 문서로부터 ABox (와 schema 후보) 를 자동 제안하고, 사람이 검수하는 형태가 가장 적합해 보임.

### 1.3 자동 추출 기술 — md → 그래프 의 실제 파이프라인

#### 핵심 3 단계 (학술 표준 — LLM 시대 이전·이후 공통)

1. **NER (Named Entity Recognition)** — 텍스트에서 entity 식별 + 타입 분류 (Person / Organization / Location / Project / Capability …). 전통: CRF / HMM / 규칙. 현대: Transformer token classification, 또는 LLM prompt-based span extraction. ([Wikipedia NER](https://en.wikipedia.org/wiki/Named-entity_recognition))
2. **RE (Relation Extraction)** — 추출된 entity 쌍 사이 의미 관계 분류 (`A uses B`, `A contains B`). LLM 시대에는 NER 과 통합되어 한 번에 (joint extraction) 처리하는 추세.
3. **Linking / Coreference** — 같은 entity 가 다른 표현으로 나오면 (예: "iam-aslan", "IAM 허브", "the IAM project") 동일 노드로 합치기.

#### LLM 시대의 추출 패러다임 (2024~2026 survey 기준)

- **Schema-guided extraction (정적)** — 미리 정의한 ontology (TBox) 를 prompt 에 넣고 "이 schema 에 맞춰 추출" 시킴. 정확도·일관성↑, 하지만 schema 가 rigid 하면 cross-domain 일반화↓. KARMA 가 대표.
- **Schema-induced extraction (동적)** — schema 자체도 LLM 이 발견. AutoSchemaKG: unsupervised clustering 으로 entity 타입·관계 타입 induce. 새 도메인에 빠르게 적용 가능, 단 노이즈↑.
- **Multi-turn / dialogue extraction** — ChatIE (Wei et al. 2024) 처럼 대화로 점진적 추출. 한 번에 안 되는 복잡한 관계를 나눠서.
- **Decomposed extraction** — KGGEN (Mo et al. 2025) 처럼 entity 검출 → 관계 생성 두 단계로 분리. 각 단계가 단순해져 정확도↑.
- **Constrained decoding** — JSON schema / regex 로 LLM 출력 형식 강제 (OpenAI structured outputs, llamacpp grammar). hallucination 줄이고 후처리 단순화. 핵심 도구.

출처: [arxiv 2510.20345 — LLM-empowered KG construction survey](https://arxiv.org/abs/2510.20345), [arxiv 2305.13168 — LLMs for KG Construction](https://arxiv.org/abs/2305.13168)

#### 추출 비용·지연 현실 (GraphRAG 기준)

- GraphRAG 공식 경고: "indexing can be an expensive operation". 1 만 단어 코퍼스에 수십~수백 LLM 호출, $ 단위 비용 발생.
- **batch processing 전제** — realtime 추출은 비현실적. 사용자가 md 를 저장 → 백그라운드 워커가 추출 → 후보가 준비되면 검수 큐로.

#### 우리 stack (Firebase + 정적 export) 에서 가능한가

| 요소 | 가능성 | 비고 |
|---|---|---|
| md 파일 저장 | ✅ 이미 됨 | Storage `knowledge-documents/{accountId}/{docId}.md` |
| 추출 워커 (LLM 호출) | ✅ 가능 | Cloud Functions 2nd gen — knowledge backend contract v1 에 이미 정의됨 |
| LLM 모델 호출 | ✅ 가능 | Functions 에서 Anthropic / OpenAI / Gemini API 호출. Firebase 가 외부 HTTP egress 허용 |
| schema 저장 (TBox) | ✅ 신설 컬렉션 | `ontologyClasses`, `ontologyRelations`, `ontologyAxioms` (또는 단일 `ontologySchema`) 신설 — DATA-MODEL 갱신 필요 |
| 추출 후보 저장 (ABox candidates) | ✅ 가능 | 기존 `knowledgeApprovedNodes/Edges` + 새 `*Candidates` 컬렉션 |
| 검수 UI | ✅ 가능 | `/review/knowledge` 라우트 이미 reserved |
| 정적 export 와 충돌? | ❌ 없음 | 추출은 server-side (Functions), 공개 surface 만 정적 export |
| 추론 (OWL reasoner) | ⚠️ 제약 | Functions 환경에 OWL reasoner 띄우기 비용↑. 초기엔 reasoning 없이 fact graph 만, 나중에 단순 transitive closure 정도부터 |

**제약 요약**: 정적 export 는 공개 surface 만이므로 추출 파이프라인에 영향 없음. 비용·지연이 진짜 제약이지 stack 제약은 아님.

#### 최소 슬라이스 제안 (이 §1.3 결론)

```
md 저장 → 워커 트리거 → LLM 추출 (constrained JSON) → candidates 저장
  → 사용자 검수 UI → 승인 → approved graph 반영 → 공개 projection
```

각 화살표가 1 PR 단위 task 후보. §4 (tasks) 에서 구체화.

### 1.4 우리 시스템 현재 상태 — foundation 까지 어디가 깔려 있나

#### 4.1 현재 살아 있는 것 (런타임 존재)

```text
[ user ]
   ↓ md
Storage  knowledge-documents/{accountId}/{docId}.md          ← raw 입력
   ↓ (아직 워커 없음, 컬렉션만 정의)
Firestore  projects/{slug}                                   ← 토폴로지 (active)
           categories/{id}, statuses/{id}, hubs/{hubId}      ← 토폴로지 보조 (active)
           accounts/{accountId}                              ← scope root (active)
```

`projects` 가 유일한 의미 있는 데이터. 토폴로지 시각화 (`SigmaTopology`) + project detail 둘 다 이걸 읽음. 1,979 개 — 기존 슬러그 하나당 행 하나.

#### 4.2 정의는 됐지만 비어 있는 것 (foundation 계약)

DATA-MODEL.md §4 + knowledge backend contract v1 까지 와 있음. 컬렉션 schema 는 박혀 있고 firestore.rules / storage.rules / indexes 까지 닫혀 있는데 **데이터가 들어간 적은 없음**.

| 컬렉션 | 역할 | 누가 쓰는가 (rule) | 클라이언트 read 가능? |
|---|---|---|---|
| `knowledgeDocuments` | 문서 메타 | account owner | private |
| `knowledgeDocumentVersions` | 문서 버전 | account owner | private |
| `knowledgeDocumentChunks` | 청크 분해 | backend only | admin read |
| `knowledgeExtractionJobs` | 추출 잡 | backend (생성·갱신) | account owner read |
| `knowledgeExtractionOutputs` | 추출 결과 후보 | backend only | admin read |
| `knowledgeEvidence` | 근거 chunk 주소 | backend only | admin read |
| `knowledgeReviews` | 검수 트레이 | account owner | private |
| `knowledgeApprovedNodes` | **canonical TBox+ABox 노드** | backend only (admin write 가능) | private |
| `knowledgeApprovedEdges` | **canonical 엣지** | backend only | private |
| `knowledgePublishes` | publish 실행 이력 | backend only | admin read |
| `knowledgePublicNodes` | **공개 projection** | backend only | **public read** |
| `knowledgePublicEdges` | 공개 projection | backend only | public read |
| `knowledgePublicMeta/current` | projection pointer | backend only | public read |

핵심 관찰: **공개/비공개 경계가 컬렉션 레벨에서 강제** 됨. raw 문서, 추출 후보, approved canonical 은 절대 public read 불가. public read 는 `knowledgePublic*` 3 개뿐.

#### 4.3 실제 schema (canonical 기준 — DATA-MODEL.md §4 발췌)

**`knowledgeApprovedNodes`**: `id, title, kind: string, projectIds[], parentId?, summary?, evidenceIds[], currentRevisionId?, lastApprovedAt, lastApprovedBy`

**`knowledgeApprovedEdges`**: `id, from, to, type: "depends_on"|"implements"|"uses"|"describes"|"related_to", projectIds[], evidenceIds[], currentRevisionId?, lastApprovedAt, lastApprovedBy`

**관찰**:
- `kind` 가 **enum 이 아니라 string** — 무엇을 노드 종류로 쓸지 의도적으로 미정. TBox 가 아직 없음.
- `type` 은 **5 종 enum** — `depends_on, implements, uses, describes, related_to`. 보류 스펙 (§1.5 참조) 의 7 종 중 **`contains`, `belongs_to` 가 빠짐**.
- `parentId` 가 있어 계층 표현은 가능하지만 의미 (`Project→Domain→Capability→Element` 같은) 는 강제하지 않음.
- `evidenceIds[]` 는 필수 — 모든 승인된 사실은 근거를 가져야 한다는 원칙을 schema 가 강제.

#### 4.4 빠진 것 (foundation 위에 얹어야 할 것)

| 빠진 조각 | 무게 |
|---|---|
| **TBox / 스키마 등록 컬렉션** (`ontologyClasses`, `ontologyRelations` 같은) — 어떤 `kind` / 어떤 `type` 이 합법인지 명세 | ★★★★ 핵심 |
| **추출 워커 본체** (Cloud Function 구현) — md 받아 LLM 으로 candidates 만드는 코드 | ★★★★ 핵심 |
| **검수 UI** (`/review/knowledge`) — 후보 → 승인 흐름의 화면 | ★★★ |
| **publish 실행기** — approved → public projection 이동 backend | ★★★ |
| **공개 surface 의 ontology view** — 공개 화면이 `knowledgePublicNodes/Edges` 를 읽는 사용자 컴포넌트 | ★★ |
| **schema 진화 / 마이그레이션 도구** — TBox 가 바뀔 때 ABox 재정렬 | ★ (나중) |

#### 4.5 정적 export 와의 호환성 (재확인)

- 추출 / publish 는 **server-side (Cloud Functions)** — 정적 export 와 무관.
- 공개 surface 는 `knowledgePublicNodes/Edges` 를 client onSnapshot 으로 읽음 — build-time 이 아니라 runtime read. 기존 `projects` 와 같은 패턴.
- `output: 'export'` 제약은 **건드리지 않음**. 안전.

### 1.5 보류된 ontology-driven 스펙 (2026-04-17) 의 핵심 — 받아갈 / 버릴 / 수정할 부분

#### 5.1 보류 스펙이 제안한 것 (1008 줄, 13 절)

핵심 아이디어:

1. **4-layer 정보 구조**: `Project → Domain → Capability → Element`. 추가 깊이 없이 `Element.elementType` 으로 분류 (service / api / agent / workflow / schema / data-store / ui / prompt / integration).
2. **5 노드 타입**: `project, domain, capability, element, document`. document 는 계층 노드가 아니라 **근거 노드** — 트리에 매달지 않고 `describes` 관계로만 연결.
3. **7 관계 타입**: `contains, belongs_to` (구조) / `depends_on, implements, uses` (동작) / `describes` (근거) / `related_to` (약).
4. **모든 관계는 근거 + 신뢰도** — 어느 문서·어느 섹션 출처 + LLM confidence.
5. **자동화 / 검수 분리** — LLM 은 제안만, 승인은 사람.
6. **노드 병합 원칙** — id 일치 / `title + aliases` 정규화 / 동일 문서 묶음 + 타입 일치.
7. **md frontmatter 계약** — 문서가 시스템 입력일 때 따라야 할 형식 (필수 키, 권장 본문 섹션).

#### 5.2 v2 foundation 이 이미 받아간 것

비교해 보면 v2 foundation 은 **데이터 substrate 를 거의 통째로 가져왔다**:

| 보류 스펙 요소 | v2 foundation | 차이 |
|---|---|---|
| 노드 5 타입 | `kind: string` (free) | enum 강제 안 함 |
| 관계 7 타입 | enum 5 타입 | `contains`, `belongs_to` 빠짐 |
| 근거 메타 (어느 문서·어느 섹션) | `evidenceIds[]` + `knowledgeEvidence` 컬렉션 | ✅ 거의 그대로 |
| 자동화 / 검수 분리 | `knowledgeExtractionJobs` → `knowledgeReviews` → `knowledgeApprovalEvents` 4 단계 | ✅ 그대로 |
| 노드 병합 원칙 | `currentRevisionId` 로 revision 추적 | 병합 알고리즘은 backend 책임 |
| public projection 분리 | `knowledgePublic*` 3 컬렉션 | ✅ 그대로 |
| md frontmatter 계약 | (foundation 에 미반영) | ★ 빠짐 |

즉 **데이터 모델은 살아 있고, 런타임 / UX / 추출 알고리즘이 빠져 있다**.

#### 5.3 보류된 이유 (추정 + CLAUDE.md 단서)

CLAUDE.md 가 "보류된 초안 — 구현 기준으로 사용하지 않는다" 라고만 적었으니 명문화된 이유는 없다. 코드 / 문서 정황으로 추정:

- **범위가 너무 큼** — 1008 줄, 13 절, 5 가지 사용자 페르소나 정의, frontmatter 계약, 충돌 해결 로직 등. 한 번에 짓기엔 위험.
- **데이터 substrate 만 떼어 v2 foundation 으로 살림** — 위험을 분산. 이건 좋은 결정.
- **UX / 추출 / 검수 / publish 의 동시 설계** 가 부담. 각 layer 의 결정이 다른 layer 에 영향.
- **knowledge subsystem 자체가 admin 격리** 였던 시기 (지금은 admin 폐기 중) — 권한 모델이 흔들리던 시점이라 결정을 미룸.

#### 5.4 받아갈 / 버릴 / 수정할 부분 (이 루프의 작업 분량 결정용)

| 영역 | 결정 | 이유 |
|---|---|---|
| **4-layer 정보 구조** (`Project → Domain → Capability → Element`) | ✅ 받아감 | 단순·이해 용이. 다만 강제하지 않고 "기본 view" 로 둠 |
| **5 노드 타입** | ✅ 받아감 + `kind` enum 화 | foundation 의 free string 보다 약간 빡빡하게 |
| **`element.elementType` 분류** | ✅ 받아감 (9 종) | 깊이 추가 대신 속성 분류 방향 동의 |
| **7 관계 타입** | ⚠️ 수정 — 5 → 7 로 확장 (`contains`, `belongs_to` 추가) | 구조 관계가 빠지면 4-layer 가 표현 안 됨 |
| **md frontmatter 계약** | ✅ 받아감 | 입력 정형화 안 하면 LLM 추출 정확도 흔들림 |
| **노드 병합 원칙 (id / 정규화 / 문맥)** | ✅ 받아감 | 표준 알고리즘 |
| **자동화 / 검수 분리** | ✅ 이미 받아감 (foundation) | foundation 에 살아 있음 |
| **신뢰도 (confidence) 필드** | ⚠️ 보강 필요 | foundation 에는 명시 X. extraction output 단계에 추가해야 |
| **5 페르소나** (admin / curator / reader 등) | ❌ 버림 | admin 폐기 정책과 충돌. "자기 계정의 주인이 자기 자산" 모델로 단순화 |
| **충돌 해결 / merge UI 디테일** | 🔄 미루기 | 검수 큐 v0 가 돌고 나서 학습 후 결정 |
| **외부 RDF/OWL export** | ❌ 버림 (Non-Goal) | 보류 스펙도 Non-Goal 로 명시. 우리도 동의 |

#### 5.5 결론 — research 단계 마무리 가능?

§1.1 ~ §1.5 가 다 채워졌다. 다음 fire 에서:
- §1 검토 → 빠진 데이터 결정 (e.g., 신뢰도 임계값 / TBox 진화 정책) 추가 보강이 필요한가?
- 충분하면 단계 = `options` 로 전환하고 §2 옵션 비교 표 시작.

**예상**: 다음 fire 에서 `options` 진입. 옵션 A/B/C 의 비교를 1년/5년 시나리오로 빡빡하게.

### 1.5 보류된 ontology-driven 스펙 (2026-04-17) 의 핵심

- 4-layer 모델: `Project → Domain → Capability → Element`
- 각 관계는 문서 근거 + 신뢰도
- 자동 추출 + 사람 검수
- (TODO) 보류된 이유와 재개 시 받아갈 부분 / 버릴 부분 정리

---

## 2. 옵션 (options)

> 핵심 포크: **별도 기능 vs 시스템 자체를 온톨로지화 vs 단계적 흡수**.
>
> 진안의 비전 (ontology = 두 번째 척추) 을 전제로 평가한다. "안전한 작은 도구" 가 목표면 답이 다르지만 **그건 우리 목표가 아니다**.

### 옵션 A — 별도 surface 로 추가

문서·프로젝트는 그대로 두고 `/ontology/*` 같은 새 surface 를 추가. 사용자가 문서 업로드 → "추출" 버튼을 명시적으로 누름. 결과 그래프는 토폴로지와 분리된 별도 view.

- **장점**: 기존 시스템 0 회귀. 점진. 실패해도 이전 동선 유지. 작은 PR 들로 출시. 사용자가 ontology 가치 체험할 시간을 줌.
- **단점**: **이중 멘탈 모델** — 토폴로지 / ontology 가 같은 정보를 다르게 표현 → 일관성 유지 비용 영구. 자동 진화 약함 (사용자가 매번 트리거). ontology 가 "곁가지" 라는 자체 메시지. 진안 비전 ("두 번째 척추") 과 **거리**.
- **구현 복잡도**: ★★ (5점 만점). 새 라우트 + 추출 워커 + 검수 UI + 시각화. backend 는 foundation 위에 worker 추가만.
- **리스크**: 낮음. 실패해도 surface 1 개 비활성화. 데이터 손실 없음.
- **마이그레이션 부담**: 0. 기존 데이터 그대로.
- **비용**: 사용자 명시 트리거라 LLM 호출량 제한적. 월 $ 단위 (소규모).

### 옵션 B — 시스템 자체를 온톨로지화 (입력 시점부터 자동)

md 문서가 들어오면 즉시 추출 워커 발동 → 노드/관계 후보 → 검수 큐 → 승인 → 그래프 성장. 토폴로지는 ontology 의 한 view (모든 노드를 `Project` 클래스로 좁힌 projection) 로 흡수.

- **장점**: 단일 멘탈 모델. md 입력 시점부터 자동 진화. 토폴로지가 ontology-backed → 같은 데이터에서 두 view. 문서 늘수록 그래프 풍부. **진안 비전 정합**.
- **단점**: 추출 실패 시 시스템 자체가 흔들림. 모든 입력에 LLM → 비용↑·지연↑. 마이그레이션 큼 (1,979 프로젝트 → ontology 노드로 변환). 검수 백로그 누적 위험. **한국어 LLM 추출 정확도가 발목 잡으면 사용자 신뢰 빠르게 잃음**.
- **구현 복잡도**: ★★★★. 추출 / 검수 / publish / 공개 surface / 마이그레이션 5 영역 동시.
- **리스크**: 높음. 추출 시원찮으면 입력 안정성에 영향. 한국어 NER+RE 정확도 사전 검증 필수. 비용 사전 견적 필수.
- **마이그레이션 부담**: 큼. 기존 1,979 프로젝트 → 자동 변환 + 사람 검수 (현실적으로 batch 작업).
- **비용**: 입력 단가 × 문서 수 × 평균 청크 수 × LLM 호출. GraphRAG 경고 ("indexing can be expensive") 가 우리에게도 적용. 사전에 한국어 1 페이지 추출 단가 측정 필요.

### 옵션 C — 하이브리드 (단계적 흡수, A 로 시작 → B 로 수렴)

명시적 4 단계 cutover 정의:

| Phase | 무엇 | 진입 조건 | 종료 조건 |
|---|---|---|---|
| C-1 | `/ontology` surface + 명시 추출 (= A) | foundation 위에 worker / 검수 UI 빌드 | 추출 성공률 > 80%, 사용자 검수 cycle < 24h |
| C-2 | 신규 md 입력 시 백그라운드 자동 추출 (opt-in) | C-1 안정 | 자동 추출 사용자 만족도 측정, 비용 모델 확정 |
| C-3 | 신규 md 입력 자동 추출 default + 기존 1,979 일괄 마이그레이션 | C-2 통계 양호 | 마이그레이션 검수 완료 |
| C-4 | 토폴로지 = ontology view 로 흡수, 별도 surface 폐기 (= B) | C-3 그래프 안정 | ontology 척추 완성 |

- **장점**: 위험 분산. 매 phase 마다 사용자가 평가. foundation 이 이미 데이터 substrate 깔아놨으니 C-1 시작 비용 낮음. cutover 기준이 명문화돼 있어 결단 미루기 어려움.
- **단점**: phase 1-3 동안 두 모델 (토폴로지 + ontology) 코드 공존. cutover 기준이 흐려지면 영원히 C-1 에 갇힐 위험. 각 phase 인터페이스 변환 비용.
- **구현 복잡도**: ★★★ (한 phase 씩). 누적은 B 와 비슷하지만 분산.
- **리스크**: 중. 각 phase 실패 시 다음 phase 결정에 영향. cutover 기준이 명확하면 위험 통제 가능.
- **마이그레이션 부담**: phase 별로 분산. 마지막 phase 에서만 큰 변환.
- **비용**: phase 별 점증. C-1 은 A 수준, C-3-C-4 는 B 수준에 도달.

### 비교 표 (8 축)

| 축 | A 별도 surface | B 입력시 자동 | C 단계적 흡수 |
|---|---|---|---|
| **기존 토폴로지 회귀 위험** | 0 | 큼 (마이그레이션 시 데이터 변환 위험) | 작음 (phase 별 격리) |
| **자동 진화 정도** (md → graph) | ★ (사용자 명시) | ★★★★★ (default) | C-1: ★, C-4: ★★★★★ |
| **사용자 멘탈 모델 부담** | 이중 (토폴로지 + ontology) | 단일 | C-1~C-3: 이중 → C-4: 단일 |
| **진안 비전 정합** ("두 번째 척추") | 거리 — ontology 가 곁가지 | 정합 | C-4 까지 가면 정합, 도중에 멈추면 A |
| **구현 복잡도** (1~5) | 2 | 4 | 3 (phase 당), 누적 4 |
| **단기 리스크** (3 개월) | 낮음 | 높음 (한국어 추출 정확도 미검증) | 낮음 (C-1 = A 수준) |
| **장기 리스크** (3 년) | 곁가지 채로 굳음 → 비전 달성 실패 | 비용 폭주 / 검수 백로그 | C-4 cutover 결단 미루기 |
| **마이그레이션 부담** | 0 | 큼 (1,979 일괄) | phase 별 분산 |
| **비용 (LLM 호출)** | 사용자 명시 → 작음 | 입력 시점 → 큼 | phase 별 점증 |
| **첫 가치 전달까지 (TTV)** | 빠름 (1~2 주) | 느림 (2~3 개월) | 빠름 (C-1 1~2 주) |
| **foundation 활용도** | 부분 | 전부 | phase 별 점증 |
| **롤백 용이성** | 쉬움 (surface off) | 어려움 (데이터 변환 후) | phase 별 가능 |

### 시나리오 분석 — 1년 후 / 5년 후

**옵션 A (1y)**: `/ontology` surface 가 동작. 사용자 일부가 사용. 데이터 양 미미 (수십 노드). 토폴로지가 여전히 main. 진안 비전 진척 없음.
**옵션 A (5y)**: ontology 가 주변부 도구. "잘 쓰는 사람만 쓰는 도구". 토폴로지 척추 그대로. **비전 미달성**.

**옵션 B (1y)**: 새 입력 자동 추출 동작. 검수 백로그 누적. 한국어 추출 정확도 70~85% 라면 사용자가 매 검수마다 수정. 비용 월 $ 수십~수백. 기존 1,979 마이그레이션 진행 중. 흔들리는 시기.
**옵션 B (5y)**: 그래프 풍부 (수만 노드). ontology 가 진짜 척추. 사용자가 새 분야 (운영/제품/조직) 도 같은 시스템으로 다룸. **비전 달성** — 단 추출 정확도가 충분히 올라온 경우.

**옵션 C (1y)**: C-1 안정 + C-2 진행 중. 사용자가 가치 체험. foundation 이 살아 있음. 비용 통제 안에서. 진안 비전 향한 진로 명확.
**옵션 C (5y)**: C-3~C-4 까지 도달했으면 B 와 같은 결과. cutover 결단을 안 했으면 A 와 같은 결과. **결단 의지가 결정함**.

### 결정 hint (§3 으로 이어질)

- 옵션 A 는 **비전 미달성 보장** — 진안의 "두 번째 척추" 와 정합 안 됨.
- 옵션 B 는 **비전 달성 가능 / 단기 리스크 큼** — 한국어 추출 정확도가 사전 미검증.
- 옵션 C 는 **A 의 안전성 + B 의 비전 정합** — 단 cutover 기준이 명문화돼야 의미 있음.

가장 무게 있는 후보는 **C** — 단, C-1 → C-4 진입 기준 (정확도·비용·검수 처리 시간) 을 §3 에서 숫자로 못 박아야 한다.

---

## 3. 결정 (decision)

### 3.1 결정 — **옵션 C 채택** (단계적 흡수, A → B 로 수렴)

진안 비전 ("ontology = 두 번째 척추") 정합 + 단기 리스크 통제 + foundation 활용 — 세 조건이 동시에 만족되는 유일한 옵션.

진행 시퀀스: **C-1 → C-2 → C-3 → C-4**. 각 phase 진입·종료 조건은 §3.3 에 숫자로 못 박는다.

### 3.2 근거 — Why C, Why not A/B

| 평가 차원 | A | B | C | 가중치 |
|---|---|---|---|---|
| 진안 비전 정합 (척추) | ❌ | ✅ | ✅ (C-4 도달 시) | 가장 높음 |
| 단기 안전성 | ✅ | ❌ | ✅ (C-1 ~ C-2) | 높음 |
| 비용 통제 | ✅ | ❌ | ✅ (phase 별 점증) | 높음 |
| foundation 활용 | 부분 | 전부 | phase 별 점증 → 전부 | 중 |
| 결단 의지 의존성 | 낮음 | 낮음 | **높음** (cutover 결단) | — |

**Why not A**: 비전 미달성 보장. 옵션 A 의 1y/5y 시나리오가 보여주듯 ontology 가 "곁가지 도구" 로 굳음. 진안이 명시적으로 "두 번째 척추" 라고 했으므로 비전과 맞지 않는 옵션은 채택 X.

**Why not B (직진)**: 단기 리스크가 너무 큼. 한국어 LLM 추출 정확도 미검증. 비용 모델 미견적. 1,979 프로젝트 일괄 마이그레이션 위험. 검수 백로그 누적 시 사용자 신뢰 빠르게 잃음. 같은 목적지 (ontology = 척추) 를 더 안전한 경로 (C) 로 갈 수 있는데 위험한 직진을 선택할 이유 없음.

**Why C**: A 의 단기 안전성 + B 의 비전 정합. 단점 ("cutover 결단 의지 필요") 은 §3.3 의 숫자 임계값으로 통제. cutover 기준이 명문화되어 있으면 결단을 미루기 어려움 — 진척 없으면 phase 가 넘어가지 않으므로 자동 알람.

### 3.3 Cutover 임계값 (숫자로 못 박기)

각 phase 종료 = 다음 phase 진입 조건. **이 숫자들이 충족되어야만** 다음 phase 로 넘어간다.

#### C-1 → C-2 진입 조건 (명시 추출이 안정됨)

- **추출 정확도**: 한국어 md 1 페이지 (≈3,000자) 입력 시 사람이 검수해서 **승인하는 노드/엣지 비율 ≥ 80%**. 측정 sample: 진안의 실제 spec 문서 10 개에서 추출 → 사람 검수.
- **검수 처리 시간**: 후보 → 승인 cycle median ≤ 24 시간 (사용자가 실제로 따라잡을 수 있는가).
- **추출 단가**: 1 페이지당 LLM 비용 ≤ $0.05 (예: Claude Sonnet 4.6 입력 3K 토큰 + 출력 2K 토큰 기준). 측정 후 확정.
- **시스템 안정성**: 추출 워커 실패율 < 5% (시스템 오류 / LLM API 오류 합산).

#### C-2 → C-3 진입 조건 (자동 추출이 default 가 될 만큼 검증됨)

- **자동 추출 사용자 만족도**: opt-in 사용자 중 "자동 추출이 도움된다" 응답 ≥ 80% (간단한 in-app 설문).
- **비용 모델**: 월 입력량 × 단가 추정치가 진안 예산 안 (월 $50 이하 가정, 변경 가능).
- **검수 백로그**: 미처리 후보 ≤ 100 개 / 입력 후 7 일 이내에 처리율 ≥ 80%.

#### C-3 → C-4 진입 조건 (토폴로지 흡수)

- **마이그레이션 완료율**: 기존 1,979 프로젝트 → ontology 노드 변환 + 사람 검수 ≥ 95%.
- **그래프 안정성**: 마이그레이션 후 30 일 동안 ABox 변경 (삭제·재분류) 비율 < 5%.
- **공개 surface 호환**: `/ontology` view 가 `/` (홈 토폴로지) 와 동일 정보를 더 풍부하게 보여줌. 사용자 피드백 ≥ 80% positive.

#### 결단 강제 장치

- 각 phase 진입 후 **3 개월** 안에 다음 phase 진입 조건이 충족되지 않으면, **결정 회의** (사용자 + Claude) 를 열어 그만둘지 / 보강할지 결정. 미루기 금지.

### 3.4 시작점 — 이 결정의 즉시 행동

**C-1 빌드**. 다음 §4 에서 PR 단위 task 로 분해. foundation (`knowledgeApprovedNodes/Edges`, `knowledgeExtractionJobs` 등) 이 이미 깔려 있으니 시작 비용 낮음.

C-1 의 핵심 deliverable:
1. **TBox 정의** (5 노드 클래스 + 7 관계 타입) — 컬렉션 + seed
2. **추출 워커 v0** — 명시 트리거, 1 문서 처리
3. **검수 UI v0** — 후보 → 승인/거절
4. **`/ontology` view v0** — 트리 표현 (Project → Domain → Capability → Element)
5. **md frontmatter 계약 명세** — 입력 정형화 가이드

---

## 4. 개발 task 분해 (tasks)

> C-1 (명시 추출 + 검수 UI + `/ontology` view) 까지의 PR 단위 분해. 각 task 1~3 일 분량.

### 4.1 의존 그래프

```text
T-1 TBox 컬렉션 + seed         T-2 edge enum 5→7        T-3 frontmatter docs
       │                              │
       └─────┬─────────────┬──────────┘                  (독립)
             ▼             ▼
        T-4 추출 워커 skeleton ◀──── T-7 confidence 필드 (T-4 와 병행)
             │
             ▼
        T-5 검수 UI v0
             │
             ▼
        T-6 /ontology view v0
```

### 4.2 task 카드

#### T-1 — TBox 컬렉션 정의 + 5 노드 클래스 seed

- **brief**: ontology TBox (스키마) 를 저장할 컬렉션 2 개 신설 (`ontologyClasses`, `ontologyRelations`) + 5 노드 클래스 + 7 관계 타입 seed 데이터.
- **영향 범위**:
  - 새 컬렉션: `ontologyClasses/{classId}`, `ontologyRelations/{relationId}`
  - `firestore.rules` — 두 컬렉션 admin write / public read 규칙
  - `firestore.indexes.json` — 필요 시 정렬 인덱스
  - `docs/DATA-MODEL.md` — §4 에 컬렉션 정의 추가
  - `scripts/seed-ontology-tbox.ts` — seed 스크립트 (5 클래스 + 7 관계)
  - `src/entities/ontology-class/`, `src/entities/ontology-relation/` — type + read API
- **검증 방법**: Firestore emulator rules 테스트 (admin write / public read), seed 실행 후 컬렉션 확인, type 컴파일.
- **의존**: 없음
- **추정 분량**: 1일
- **첫 PR 자체 완결성**: ✅ — schema 만 박는 것이라 다른 task 없이도 의미 있음.
- **상태**: ✅ done
  - ✅ T-1a — DATA-MODEL.md 에 `ontologyClasses` / `ontologyRelations` 정의 + 시드 표 (5 클래스 + 7 관계)
  - ✅ T-1b — `firestore.rules` 에 `ontologyClasses` / `ontologyRelations` (read 누구나, write admin) 추가 + 헤더 코멘트 갱신
  - ✅ T-1c — `src/entities/ontology-class/` + `ontology-relation/` (types + defaults + mapper + api + tests). vitest 17 통과.
  - ✅ T-1d — `scripts/seed-ontology-tbox.mjs` 작성 (Firebase Admin SDK, batch write, 빈 컬렉션만 시드). emulator / production 둘 다 호환.

#### T-2 — `knowledgeApprovedEdges.type` enum 5→7 확장 (`contains`, `belongs_to` 추가)

- **brief**: 보류 스펙의 7 관계 타입 중 빠진 2 개 (`contains`, `belongs_to`) 를 canonical edge enum 에 추가.
- **영향 범위**:
  - `docs/DATA-MODEL.md` §4 `knowledgeApprovedEdges` 의 `type` enum 갱신
  - `docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md` ExtractionOutput edge type 갱신
  - `src/entities/knowledge-graph/model/types.ts` — `KnowledgeEdgeType` union + `KNOWLEDGE_EDGE_TYPES` const + `isKnowledgeEdgeType` guard
  - re-export 사슬 (`model/index.ts`, `entities/.../index.ts`)
  - `firestore.rules` — 현재 type 필드 레벨 validation 없음 (trusted backend 책임). 그대로 유지.
- **검증 방법**: vitest — TBox 시드와 enum 정합성 + guard truthy/falsy 케이스. type compile.
- **의존**: 없음 (T-1 과 병행 가능)
- **추정 분량**: 0.5일
- **상태**: ✅ done

#### T-3 — md frontmatter 계약 명세 (docs only)

- **brief**: 추출 워커가 입력 받을 md 의 형식 — frontmatter 키, 권장 본문 섹션, JSON schema. 보류 스펙 §5 에서 가져와 T-1 TBox + T-2 edge enum + T-7 신뢰도 정책에 정합.
- **영향 범위**:
  - 새 파일: `docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md`
  - 8 절 구성: 왜 / 처리 등급 (A strict / B lenient / C freeform) / frontmatter 명세 (필수 5 + 권장 4 + relates / elementType) / 본문 섹션 / 완전 예시 3 (A·B·C) / JSON Schema (워커 검증용) / 진화 정책 / 미해결
  - 등급별 **신뢰도 상한** 명시 — A=1.0, B=0.84, C=0.59 → T-7 임계값과 정합
  - `relates` 키 = frontmatter-declared edges (신뢰도 1.0, LLM 추출 아님). incompatible source/target → 0.5 강등.
  - `additionalProperties: true` — 사용자 도메인 키 받기, 워커는 무시
- **검증 방법**: 진안 검토 (PR 코멘트). JSON Schema 는 T-4 워커가 implements.
- **의존**: 없음
- **추정 분량**: 0.5일
- **상태**: ✅ done

#### T-4 — 추출 워커 skeleton (Cloud Function)

- **brief**: `knowledgeExtractionJobs` 가 생성되면 발동되는 Cloud Function. md 1 문서 입력 → LLM 호출 (constrained JSON output) → `knowledgeExtractionOutputs` 저장.
- **영향 범위**:
  - 새 디렉토리: `functions/src/ontology-extract/`
  - 트리거: `onCreate` `knowledgeExtractionJobs/{jobId}`
  - LLM client (Anthropic Claude API), prompt template (T-1 의 TBox 를 prompt 에 포함)
  - `knowledgeExtractionOutputs` 에 candidates 저장 + `knowledgeEvidence` 에 chunk 주소 기록
  - 실패 시 `knowledgeExtractionJobs.status = 'failed'` + errorCode/Message
- **검증 방법**:
  - unit test: prompt formatter, JSON schema validator
  - integration test (mock LLM): emulator 에서 job 생성 → output 생성 확인
  - 1 실제 문서 (진안 spec md) 로 수동 smoke
- **의존**: T-1 (TBox 가 있어야 schema-guided prompt), T-2 (7 관계 타입), T-3 (frontmatter 명세), T-7 (confidence)
- **추정 분량**: 2~3일
- **상태**: ✅ done
  - ✅ T-4a — `src/shared/lib/ontology-frontmatter/` — frontmatter 파서 + 등급 분류. vitest 19.
  - ✅ T-4b — `validate-output.ts` — LLM JSON 검증기. vitest 16.
  - ✅ T-4c — `build-prompt.ts` — schema-guided prompt builder. vitest 12.
  - ✅ T-4d — `call-llm.ts` + `functions/ontology-extract.js` JS mirror. node:test 14.
  - ✅ T-4e — `functions/index.js` 의 `processExtractionJobCore` 에 `isOntologyExtractorVersion` 디스크리미네이터 + `loadOntologyTBox` (Firestore fetch + seed fallback) + `buildOntologyOutputRecord` 통합. ANTHROPIC_API_KEY 시크릿 secrets 배열에 추가. ontology 경로는 stub fallback 없음 — 명시적 실패. integration smoke (mock LLM + DEFAULT TBox + STRICT_DOC + buildOntologyOutputRecord) 포함 vitest 106 + node:test 14 통과.

#### T-5 — 검수 UI v0 (`/review/knowledge`)

- **brief**: 기존 KnowledgeReviewWorkspacePage (1004 LOC, approve flow 가동 중) 위에 ontology 추출 메타 (grade / usage / latency / drop count) surface.
- **영향 범위**:
  - `src/entities/knowledge-output/` — type 확장 (grade, usage, latencyMs, validationErrorCount) + mapper 갱신
  - 새 widget `src/widgets/ontology-output-badges/` — provider / grade / cap / token / cost / latency / drop 칩
  - 기존 `KnowledgeReviewWorkspacePage` 에 widget wire (T-5c)
- **검증 방법**: vitest unit (mapper 확장 + widget 렌더 + RTL).
- **의존**: T-4 (추출 결과 필요), T-7 (confidence 임계값)
- **추정 분량**: 2일
- **상태**: ✅ done
  - ✅ T-5a — `KnowledgeOutput` type + mapper 에 grade / usage / latencyMs / validationErrorCount 확장. vitest 18.
  - ✅ T-5b — `OntologyOutputBadges` widget 신설. RTL 8.
  - ✅ T-5c — `KnowledgeReviewWorkspacePage` "항목 후보" 카드 헤더에 `<OntologyOutputBadges output={latestOutput} layout="row" />` wire. legacy Gemini 출력은 provider 칩만 표시 (graceful), ontology 출력은 grade·cap·token·cost·latency·drop 칩 모두 표시. tsc / lint / 26 vitest 통과.

#### T-6 — `/ontology` view v0 (트리 시각화)

- **brief**: 새 라우트 `/ontology` — Project → Domain → Capability → Element 트리. 승인된 데이터를 onSnapshot 으로 읽음.
- **영향 범위**:
  - 새 lib: `src/shared/lib/ontology-tree/` — 순수 트리 빌더
  - 새 widget: `src/widgets/ontology-tree-view/` — 인덴트 트리 + expand/collapse
  - 새 라우트: `app/ontology/page.tsx`
  - 새 view: `src/views/ontology-view/`
  - BottomTabBar 항목 검토 (일단 별도 surface)
- **검증 방법**: vitest unit (tree builder + RTL component) + 수동 시각 확인.
- **의존**: T-1, T-5
- **추정 분량**: 1.5일
- **상태**: ✅ done
  - ✅ T-6a — `src/shared/lib/ontology-tree/` 트리 빌더 + 헬퍼. vitest 15.
  - ✅ T-6b — `src/widgets/ontology-tree-view/` — OntologyTreeView. RTL 10.
  - ✅ T-6c — 새 API `subscribeKnowledgePublicGraph` (전역, project 필터 X) 추가. `src/views/ontology-view/OntologyViewPage` (헤더 + 통계 4카드 + 트리 + OperationsNav). `app/ontology/page.tsx` route. 함께 boundary 위반 4 건 정리 — `validate-output.ts` 의 `KNOWLEDGE_EDGE_TYPES` value import 를 inline 으로, `build-prompt.test.ts` 의 DEFAULT seeds 를 로컬 fixture 로. tsc / vitest 68 / lint (관련 파일 0 error) 통과.

#### T-7 — `knowledgeExtractionOutputs` 에 confidence 필드 보강

- **brief**: 추출 candidate 에 LLM confidence 점수 추가 (보류 스펙 §2.3 의 "신뢰도" 원칙).
- **영향 범위**:
  - `docs/DATA-MODEL.md` §4 `knowledgeExtractionOutputs` 의 nodes/edges sub-schema 명시 + 신뢰도 정책 박스
  - `src/entities/knowledge-output/model/confidence.ts` 신설 — clampConfidence / getConfidenceTier / isAutoApprovable / requiresExplicitReview + 임계값 상수 (HIGH=0.85, MEDIUM=0.6)
  - mapper.ts 가 clampConfidence 사용해 fail-safe (Infinity / NaN / 비숫자 → 0)
  - 두 단계 re-export
  - 검수 UI (T-5) 에 confidence 칩 표시 — T-5 작업에서 import
- **검증 방법**: vitest — clamp / tier / 자동 승인·검수 강제 14 케이스.
- **의존**: 없음 (T-4 와 병행 권장)
- **추정 분량**: 0.5일
- **상태**: ✅ done

### 4.3 분량 합계 / 권장 순서

총 합계: **9 일** (1 person, 직렬 기준). 의존 그래프상 부분 병렬 가능.

권장 순서 (직렬):
1. **T-1** (1d) — 다른 모든 task 의 기반
2. **T-2** (0.5d) — 빠르게 끝낼 수 있고 T-4 진입 조건
3. **T-7** (0.5d) — 검수 UI 들어가기 전에 schema 굳히기
4. **T-3** (0.5d) — 입력 계약 (T-4 prompt 에 영향)
5. **T-4** (2~3d) — 핵심 워커
6. **T-5** (2d) — 검수
7. **T-6** (1.5d) — 시각화

### 4.4 dev 진입 준비 상태

- task 분해: ✅ 7 개, 각 1~3 일
- 의존 그래프: ✅
- 첫 task (T-1) 자체 완결성: ✅ (schema 만 박는 것)
- 추정 분량: ✅ 합계 9 일

→ **단계 = `dev` 로 전환 가능**. 다음 fire 부터 T-1 부터 실제 코드 작성.

### 4.5 C-1 통합 / 측정 task (T-1~T-7 완료 후 발견된 gap)

T-1~T-7 만으로는 C-1 phase 가 닫히지 않는다. 실제 사용자가 ontology 추출을 트리거하고, 결과를 보고, 측정 데이터를 모을 수 있어야 cutover 임계값 (정확도 ≥ 80% / 단가 ≤ $0.05 / 검수 cycle ≤ 24h) 평가 가능.

#### T-8 — `extractorVersion` 선택기

- **brief**: 기존 enqueue 흐름은 client 기본값이 `gemini-v1`. 운영자가 `ontology-v1` 을 명시적으로 고를 수 있는 selector 추가.
- **영향**: knowledge document 액션 영역 (분석 시작 버튼 옆) 또는 `/diagnostics/migrate` 같은 운영 페이지에 토글 / dropdown.
- **검증**: enqueue 후 `knowledgeExtractionJobs.extractorVersion === "ontology-v1"` 확인.
- **추정**: 0.5일.
- **상태**: ✅ done

#### T-9 — `/ontology` 진입점 (navigation)

- **brief**: 새 라우트가 nav 에서 발견되지 않으면 무용지물. OperationsNav (데스크톱 운영 surface) 에 "온톨로지" 탭 추가. BottomTabBar 추가는 "두 번째 척추" 비전 정합 평가 후 별도 결정.
- **영향**: `src/widgets/operations-nav/ui/OperationsNav.tsx` ITEMS 배열 + `NavItem.id` union 확장.
- **검증**: e2e 또는 RTL — nav 클릭 시 `/ontology` 이동.
- **추정**: 0.25일.
- **상태**: ✅ done

#### T-10 — 운영 runbook (docs)

- **brief**: 한국어 spec md 1 개로 ontology 추출 → 검수 → 트리 표시까지 처음부터 끝까지 하는 절차서. ANTHROPIC_API_KEY 시크릿 등록 / `extractorVersion=ontology-v1` 선택 / 검수 / `/ontology` 확인 / 측정 기록 양식.
- **영향**: 새 docs `docs/superpowers/runbooks/2026-04-27-ontology-c1-runbook.md`. 측정 기록을 위한 spreadsheet 양식 정의 (실제 시트는 진안이 별도로 만들 것).
- **검증**: 진안 검토.
- **추정**: 0.5일.
- **상태**: ✅ done

#### T-11 — C-1 측정 (실데이터, 진안 작업)

- **brief**: 진안의 실제 spec 10 개를 통과시켜 정확도 / 비용 / 검수 시간 측정.
- **상태**: 사용자 작업 — 루프 영역 밖. T-10 runbook 이 완성되어야 진행 가능.
- **측정 방식 결정 (2026-04-29 Fire 3)**: **수동 (옵션 B)**. in-app 측정 대시보드를 만들지 않는다. 이유:
  1. 측정은 **샘플 10 개의 1 회성 평가** — 실시간 streaming 지표가 아님. 대시보드는 over-engineering.
  2. 정확도는 **사람의 판단** (승인/거절 비율) — Firestore 의 `applyReviewActionCore` 가 분모를 기록하지만 분자는 진안의 정성 평가가 필요.
  3. 비용은 **LLM provider 청구서** — Anthropic console 에서 직접 확인 (in-app 으로 노출하면 secret 누출 위험).
  4. 검수 cycle 시간은 **Firestore timestamps** (`approvedAt - candidateAt`) 로 spreadsheet 추출 가능 — 대시보드 없이도 Run-once 분석 가능.
- **runbook**: [`docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md`](../notes/2026-04-27-ontology-c1-runbook.md) — Anthropic secret 등록부터 spreadsheet 양식까지 절차서. 진안이 직접 실행.

#### T-12 — canonical node ID 매핑 + stub placeholder

- **brief**: [`2026-04-27-ontology-id-resolution.md`](./2026-04-27-ontology-id-resolution.md) §1·§2 결정 구현. frontmatter `id` 우선 매핑 + 미존재 target 의 stub 노드 자동 생성.
- **영향 범위**:
  - 새 `src/shared/lib/ontology-canonicalize/` (types + canonicalize.ts: 5 함수)
  - `src/entities/ontology-class/model/defaults.ts` + `scripts/seed-ontology-tbox.mjs` + `functions/ontology-extract.js` DEFAULT 에 `unknown` 6 번째 시드
  - DATA-MODEL.md `knowledgeApprovedNodes` 에 `isStub` / `pendingType` / `pendingFromId` 필드 추가
- **검증**: vitest unit (canonical 매핑 / 충돌 감지 / stub 생성·병합)
- **의존**: T-1, T-3, T-4 (완료)
- **추정**: 1일
- **상태**: ✅ done
  - ✅ T-12a — pure 모듈 (5 함수) + `unknown` 시드 3 곳 + DATA-MODEL 갱신. vitest 18.
  - ✅ T-12b — `functions/ontology-extract.js` 에 canonical mirror 4 함수 추가. `extractOntology` 가 frontmatter relates 처리: 매칭되면 정상 edge (원본 type 보존, confidence 1.0), 미매칭이면 stub 생성 + edge `related_to` 강등 + warnings surface. canonicalIds 결과도 output 에 포함 (approval flow 용). node:test 19, vitest 35.

#### T-13 — stub promote / dismiss 검수 UI

- **brief**: 검수 큐에서 stub 노드 별도 섹션 + promote (kind 선택) / dismiss 액션.
- **영향 범위**:
  - `functions/index.js` — `promoteStubNodeCore` + `dismissStubNodeCore` core + onCall wrapper
  - `KnowledgeReviewWorkspacePage` 에 stub 섹션
  - client API entity (`src/entities/knowledge-graph/api/`) 에 callable 추가
- **검증**: e2e — stub 생성 → promote → 정상 노드 변환 (emulator)
- **의존**: T-12
- **추정**: 1.5일
- **상태**: ✅ done
  - ✅ T-13a — Cloud Functions: `promoteStubNodeCore` + `dismissStubNodeCore` + `onCall` 래퍼.
  - ✅ T-13b — `src/entities/knowledge-graph/api/` 에 `subscribeStubNodes` (isStub=true Firestore 구독, account-scoped 필터) + `promoteStubNode` / `dismissStubNode` callable wrapper + `StubNode` / `Promote*Result` / `Dismiss*Result` 타입.
  - ✅ T-13c — `src/widgets/ontology-stub-list/OntologyStubList` 위젯 신설 (stub row + kind picker 토글 + dismiss confirm). RTL 8 케이스. `KnowledgeReviewWorkspacePage` 에 wire (stub state + handlers + 섹션 — stubs.length > 0 일 때만 노출, full-width Card). vitest 215, node:test 19 = 234 통과.

#### T-14 — 다국어 alias matching (조건부)

- **brief**: T-11 측정에서 alias 누락이 정확도 손실의 ≥ 5% 를 차지하면 진행. 그 외 보류.
- **상태**: T-11 결과 의존

---

## 5. 반복 로그 (iteration log)

매 fire 끝에 한 줄.

| 시각 | 단계 | 한 일 |
|---|---|---|
| 2026-04-27 (init) | research | 루프용 문서 골격 작성. 보류 스펙 (2026-04-17) 참조 링크. 다음 fire 부터 §1 연구 채우기. |
| 2026-04-27 fire-1 | research | §1.1 정의 채움 — W3C OWL2 / Wikipedia / SEP 발췌 + 토폴로지 vs 온톨로지 비교 표 + 지식 그래프 (TBox/ABox) 관계 정리. 다음 fire: §1.2 산업 사례 (Notion / Roam / Obsidian / Logseq / GraphRAG). |
| 2026-04-27 fire-2 | research | §1.2 산업 사례 4 진영 분류 (자유 그래프 / 사용자 schema / LLM 자동 / 학술) + 각각 받아갈/버릴 점. §1.3 자동 추출 3 단계 (NER → RE → Linking) + LLM 패러다임 5 종 (schema-guided / induced / multi-turn / decomposed / constrained) + Firebase stack 가능성 매트릭스 + 최소 슬라이스 제안. 다음 fire: §1.4 우리 시스템 현재 상태 깊이 + §1.5 보류 스펙 재해석. 충분히 무르익으면 단계 = options. |
| 2026-04-27 fire-3 | research | §1.4 현재 상태 정밀 (살아 있는 / 정의만 된 / schema 발췌 / 빠진 6 조각 / 정적 export 호환). §1.5 보류 스펙 (1008줄) 의 받아갈·버릴·수정할 11 항목 결정 — 4-layer / 5 노드 / `kind` enum 화 / 관계 5→7 확장 / frontmatter / 신뢰도 / 페르소나 폐기 등. 데이터 substrate 는 v2 foundation 이 이미 가져갔고 런타임·UX·추출이 비어 있음을 확인. 다음 fire 에서 단계 = `options` 전환 예정. |
| 2026-04-27 fire-4 | research → **options** | 단계 전환. §2 옵션 A/B/C 깊게 채움 — 각 옵션 장단점·복잡도·리스크·마이그레이션·비용 8 축 보강. C 옵션은 4 phase cutover 기준 명문화 (정확도 80% / 검수 24h 등). 12 축 비교 표 + 1y/5y 시나리오 분석. 결정 hint: A 는 비전 미달성 보장, B 는 비전 달성 가능하나 단기 리스크, C 는 A 안전성 + B 정합 단 cutover 결단 의지 필요. 다음 fire: §3 결정 단계 — C 채택 + cutover 기준 숫자 못 박기. 결정 솔리드하면 §4 task 분해까지 같은 fire 에 진행. |
| 2026-04-27 fire-5 | options → decision → tasks → **dev** | 3 단계 연속 전환. §3 결정 = 옵션 C 채택 (단계적 흡수). why-not-A (비전 미달성), why-not-B (단기 리스크), why-C (정합 + 안전 + foundation 활용). C-1→C-2→C-3→C-4 cutover 임계값 숫자로 못 박음 (정확도 ≥ 80% / 단가 ≤ $0.05/page / 검수 cycle ≤ 24h / 만족도 ≥ 80% / 마이그 완료율 ≥ 95% / 3개월 결단 회의 강제). §4 PR 단위 7 task 카드 (T-1 ~ T-7) — 각 1~3 일 분량, 의존 그래프, 합계 9일, 권장 순서. **dev 시작 — T-1a 완료**: DATA-MODEL.md 에 `ontologyClasses` / `ontologyRelations` 컬렉션 schema 정의 + 5 클래스 + 7 관계 seed 표. 다음 fire: T-1b (firestore.rules) → T-1c (entities) → T-1d (seed script). |
| 2026-04-27 fire-6 | dev | T-1b ✅ `firestore.rules` 에 ontologyClasses / ontologyRelations 추가 (read=public, write=admin) + 헤더 코멘트 갱신. T-1c1 ✅ entities 두 디렉토리 생성: ontology-class (types + defaults + 5 클래스 시드), ontology-relation (types + defaults + 7 관계 시드 + isRelationApplicable + isOntologyRelationId 헬퍼). vitest 13 테스트 통과 (관계 카테고리 분류 / symmetric / transitive / source-target 제약 검증). pre-existing project test TS 에러는 본 변경 무관 (stash 검증). 다음 fire: T-1c2 (mapper + api), 끝나면 T-1d (seed 스크립트). |
| 2026-04-27 fire-7 | dev | **T-1 완료**. T-1c2 ✅ mapper.ts 두 entity 에 추가 (Firestore Timestamp ↔ Date, 카테고리 fallback, string 배열 필터링) + ontology-class/api/ + ontology-relation/api/ (subscribe / upsert / seedDefault…IfEmpty). T-1d ✅ scripts/seed-ontology-tbox.mjs 작성 — Firebase Admin SDK, batch write, 빈 컬렉션만 시드, emulator·production 둘 다 호환. mapper round-trip 테스트 4 케이스 추가 → vitest 총 17 통과. node --check 통과, ontology 관련 lint·tsc 에러 없음. 다음 fire: T-2 (knowledgeApprovedEdges.type enum 5→7 확장 — contains, belongs_to 추가). |
| 2026-04-27 fire-8 | dev | **T-2 완료**. DATA-MODEL.md §4 knowledgeApprovedEdges.type 5종→7종 갱신 (contains, belongs_to 추가) + knowledge-backend-contract-v1.md ExtractionOutput edge type 동기화. types.ts 에 `KnowledgeEdgeType` union + `KNOWLEDGE_EDGE_TYPES` const + `isKnowledgeEdgeType` guard 추가. re-export 두 단계 (model/index, entity/index). edge-types.test.ts 7 케이스 추가 — TBox seed 와 enum 1:1 정합 검증, guard truthy/falsy. vitest 23/23 통과. 다음 fire: T-7 (extraction outputs confidence 필드) 또는 T-3 (frontmatter 명세) 중 빠른 것부터. |
| 2026-04-27 fire-9 | dev | **T-7 완료**. DATA-MODEL.md `knowledgeExtractionOutputs` 의 nodes/edges sub-schema 명시 + 보류 스펙 §6.3 신뢰도 정책 박스 (high ≥ 0.85 / medium 0.60~0.84 / low < 0.60). `src/entities/knowledge-output/model/confidence.ts` 신설 — clampConfidence (fail-safe: Infinity/NaN/non-number → 0 — 자동 승인 게이트 오작동 방지) / getConfidenceTier / isAutoApprovable / requiresExplicitReview + HIGH/MEDIUM 임계값 상수. mapper 가 clampConfidence 사용. 두 단계 re-export. confidence.test.ts 14 케이스 (clamp / tier / 임계값 inclusive 경계 / 자동 승인·검수 강제). vitest 15/15. 다음 fire: T-3 (md frontmatter 계약 명세 docs) 또는 T-4 (추출 워커 skeleton). |
| 2026-04-27 fire-10 | dev | **T-3 완료**. 새 spec 문서 `2026-04-27-ontology-frontmatter-contract.md` 8 절 작성. 처리 등급 A/B/C 와 신뢰도 상한 매핑 (A=1.0 자동 승인 가능 / B=0.84 medium / C=0.59 자동 반영 금지). frontmatter 명세 — 필수 5 (`id`/`kind`/`project`/`title`/`version`) + 권장 4 (`domain`/`status`/`aliases`/`tags`) + element 전용 `elementType` 9 종 + 명시 관계 `relates[]` (신뢰도 1.0, schema 제약 위반 시 0.5 강등). 권장 본문 섹션 9 종 (요약·문제·역할·입력·출력·구성 요소·관계·의사결정·오픈 이슈) — 표준 이름 사용 시 신뢰도 +0.05. 완전 예시 3 (A·B·C). JSON Schema (워커 검증용, `additionalProperties: true`). 진화 정책 + 미해결 문제 3 (id 충돌 / placeholder node / 다국어 정규화) 명시 — T-4 에서 결정. 다음 fire: T-4 (추출 워커 skeleton — Cloud Function + LLM client + prompt template + JSON validate). 2~3일 분량이라 여러 fire 에 걸침. |
| 2026-04-27 fire-11 | dev | **T-4a 완료** (T-4 진행 중). `src/shared/lib/ontology-frontmatter/` 신설 — types.ts (8 type) + parse.ts (한글 손글씨 YAML-subset 파서, js-yaml 추가 없이) + index.ts. parseOntologyDocument(md) → { frontmatter, body, grade A/B/C, warnings }. 파서가 인식하는 것: top-level scalar / 인라인 배열 (`tags: [a,b]`) / 블록 배열 (`aliases:\n  - foo`) / relates 블록 (`relates:\n  - type: ... \n    target: ...`). 검증 — id kebab-case 패턴, kind/status/elementType/edge type enum, version 정수, relates self-reference. 등급 산정: 필수 5 + 권장 4 + (kind=element 면 elementType 까지) ⇒ A, 필수만 ⇒ B, 필수 누락 / frontmatter X ⇒ C. parse.test.ts 19 케이스 (등급 A·B·C 각각 / 검증 경고 / inline array 호환 / element+elementType 등급 A) 통과. 다음 fire: T-4b (extraction output JSON schema validator) + T-4c (prompt template). |
| 2026-04-27 fire-12 | dev | **T-4b + T-4c 완료** (T-4 진행 중). `src/shared/lib/ontology-extraction/` 신설. **T-4b validate-output.ts** — LLM JSON 검증기. 부분 검증 정책 (한 노드 invalid 여도 다른 노드는 살림, edge 가 살아남은 노드 참조 안 하면 invalid). type guard chain (kind enum / 7 edge type / projectIds string[] / confidence [0,1] strict / evidence excerpt 1~240자 / tempId 중복 차단 / self-loop 차단 / elementType 9 종 enum). 부분 vs strict 두 모드 — mapper read 경로는 fail-safe clamp (T-7), 워커 출력 경로는 strict validate. **T-4c build-prompt.ts** — schema-guided prompt builder. system/user 메시지 두 개 반환 + grade-based confidence cap (A=1.0 / B=0.84 / C=0.59). TBox 5 클래스 + 7 관계가 prompt 에 들어가서 LLM 이 schema-guided extraction 가능. frontmatter facts 를 user 메시지 앞부분에 ground truth 로 박음 — `relates` 는 confidence 1.0 으로 처리하라고 명시. evidence 필수 (excerpt ≤ 240자), self-loop 금지, projectIds 발명 금지 등 6 제약. validate-output.test.ts 16 + build-prompt.test.ts 12 = vitest 28 통과. 다음 fire: T-4d (Cloud Function trigger + LLM client wrapper) — 외부 API egress 가 필요해 functions/ 디렉토리 / Anthropic SDK 도입 검토. |
| 2026-04-27 fire-13 | dev | **T-4d (LLM client wrapper) 진행**. 발견: 기존 `functions/index.js` + `functions/extract-gemini.js` 가 이미 Gemini 로 다른 ontology (5 종 다른 edge type) 를 가동 중. 신규 워커는 충돌 없게 **`call-llm.ts` 별도 모듈** 로 분리 — Anthropic Claude Messages API fetch wrapper. `callClaude({apiKey, system, user, model, maxTokens, timeoutMs, baseUrl, fetch})` → `{text, usage{inputTokens, outputTokens, estimatedCostUsd}, latencyMs, model, stopReason}`. AbortController 타임아웃, `LlmCallError` typed (auth/rate_limit/server_error/timeout/invalid_response/network), 모델별 단가표 (sonnet-4-6 / opus-4-7 / haiku-4-5) 로 비용 추정 — C-1 cutover 단가 ≤ $0.05/page 추적의 1차 데이터. 멀티 블록 content join, 401/403→auth, 429→rate_limit, 5xx→server_error, AbortError→timeout, 일반 fetch 실패→network. call-llm.test.ts 15 케이스 (happy path / 4 status 매핑 / abort / network / cost / shape 검증) 통과. functions/ 트리거 wiring 은 별도 fire 에서 (기존 Gemini 흐름과 분리된 신규 trigger). 다음 fire: functions/ 측 ontology-extract 모듈 (.js, T-4c 의 prompt + T-4b 의 validate 를 mirror) + 새 trigger discriminator. |
| 2026-04-27 fire-14 | dev | **T-4d 완료** (functions/ JS mirror 작성). `functions/ontology-extract.js` 신설 — 540 LOC, T-4a/b/c/d (TS canonical) 의 ESM JS mirror. parseOntologyDocument / buildExtractionPrompt / validateExtractionOutput / callClaude + 통합 오케스트레이터 `extractOntology({ markdown, classes, relations, apiKey, extractorVersion, callLlmFn })` 신설. 핵심 동작: parseOntologyDocument → buildExtractionPrompt (with TBox + grade-based confidence cap) → callLlm → JSON parse (markdown fence strip) → validateExtractionOutput → confidence cap enforce. firebase-functions logger 는 dynamic import 로 미뤄 functions/node_modules 없는 환경에서도 import 가능 (테스트·typecheck 호환). `functions/ontology-extract.test.mjs` (Node:test 10 케이스): grade A/C 분류, prompt cap, validate happy + invalid kind drop, callClaude auth error, 풀 파이프라인 mock LLM, grade C confidence cap (LLM 이 0.95 라 해도 0.59 로 강제), markdown fence strip, JSON parse 실패시 LlmCallError. 모두 통과. 기존 functions/index.js Gemini 경로 무수정. 다음 fire: T-4e — index.js 의 processExtractionJobCore 에 extractorVersion 디스크리미네이터 추가 (ontology- 접두면 신규 경로) + emulator integration test. |
| 2026-04-27 fire-15 | dev | **T-4 완전 완료**. (1) `ontology-extract.js` 에 DEFAULT_ONTOLOGY_CLASSES (5) / DEFAULT_ONTOLOGY_RELATIONS (7) seed + `buildOntologyOutputRecord` 추가 — Firestore `knowledgeExtractionOutputs` shape (provider='anthropic', grade, usage, latencyMs, validationErrorCount). (2) `functions/index.js` 에 `ANTHROPIC_API_KEY` defineSecret + `isOntologyExtractorVersion()` discriminator + `loadOntologyTBox()` (Firestore live fetch 우선, 빈 컬렉션 / 에러 시 seed fallback) 추가. (3) `processExtractionJobCore` 의 추출 분기: `extractorVersion.startsWith('ontology-')` → 신규 Anthropic 경로 (no fallback — 명시적 실패), 아니면 기존 Gemini → stub fallback. (4) processExtractionJob trigger 의 secrets 에 ANTHROPIC_API_KEY 추가. integration smoke 4 케이스 추가 (seed 정합 / buildOntologyOutputRecord null vs string accountId / 풀 파이프라인 STRICT_DOC + DEFAULT TBox + mock LLM + record 빌드). vitest 106 + node:test 14 = **120 테스트 통과**. node --check syntax OK. 다음 fire: T-5 (검수 UI v0) — `/review/knowledge` 라우트에 candidate list / 승인·거절 흐름. |
| 2026-04-27 fire-16 | dev | **T-5a + T-5b 완료** (T-5 진행 중). 발견: 기존 `KnowledgeReviewWorkspacePage` (1004 LOC) 가 이미 approve flow / candidate list / confidence badge 까지 가동 중. 신규 ontology 출력만 surface 하면 됨. **T-5a**: `KnowledgeOutput` type 에 optional `grade` / `usage` / `latencyMs` / `validationErrorCount` 추가 + mapper 가 graceful 하게 (legacy gemini 출력은 모두 undefined). 무효 grade ('Z') / 비숫자 latencyMs / NaN validationErrorCount 모두 ignore. mapper.test.ts 18 케이스. **T-5b**: 새 widget `src/widgets/ontology-output-badges/` — provider / grade (색상: A 인디고 / B 무채 / C 호박) / confidence cap / token i/o / cost (`<$0.001` fallback) / latency / drop count (validationErrorCount > 0 일 때 빨간 칩). RTL 8 케이스 통과. layout='row'/'compact', data-grade/data-provider attribute 로 상위 page 가 hook 가능. 다음 fire: T-5c — `KnowledgeReviewWorkspacePage` 에 widget wire (output card 헤더에 한 줄). |
| 2026-04-27 fire-17 | dev | **T-5c 완료 → T-5 ✅**. `KnowledgeReviewWorkspacePage` 의 "항목 후보" Card 헤더 (CardDescription 다음, 본문 위) 에 `<OntologyOutputBadges output={latestOutput} layout="row" />` wire. import 추가: `@/widgets/ontology-output-badges`. legacy Gemini 출력은 grade/usage 가 undefined 라 provider 칩만 표시 → 검수 UX 무회귀. ontology 출력은 grade·cap·token·cost·latency 칩 풀 표시. FSD 경계 (views → widgets) OK. tsc / lint / vitest 26 통과. T-5 (2일 분량) sub-task 3 모두 완료. 다음 task: T-6 (`/ontology` view v0 — 트리 시각화. 1.5일 분량 — 새 라우트 + 새 view + tree component). |
| 2026-04-27 fire-18 | dev | **T-6a + T-6b 완료** (T-6 진행 중). **T-6a**: `src/shared/lib/ontology-tree/` — 순수 트리 빌더. KnowledgeGraphNode + KnowledgeGraphEdge → `OntologyTreeBuildResult { roots, orphans, warnings }`. document 제외 / contains 정방향, belongs_to 역방향으로 parent 매핑 / cycle 감지 후 root 승격 + warning / 다중 부모 첫번째만 keep / 결정론적 정렬 (kind project>domain>capability>element 우선, title alphabetical 후순). countTreeNodes + flattenTree 헬퍼. vitest 15 (happy path 6 + belongs_to 1 + 4 error / 2 empty / 2 sorting). **T-6b**: `src/widgets/ontology-tree-view/OntologyTreeView` — depth × 16px 인덴트 + chevron expand/collapse 토글 + kind 칩 한글 (프로젝트 인디고 / 도메인·역량·요소 무채) + onSelect / emptyHint / orphan 섹션 (호박 톤) / warnings details (붉은 톤). collapsed Set 으로 토글 상태 관리. role=tree/treeitem/group + aria-expanded. RTL 10 (basic render 3 + expand/collapse 2 + onSelect 1 + empty 2 + orphans/warnings 2). 다음 fire: T-6c — `app/ontology/page.tsx` + `src/views/ontology-view/` 라우트·페이지 + `subscribeKnowledgeProjectInsight` wire (이미 존재하는 API 재사용). |
| 2026-04-27 fire-19 | dev | **T-6c 완료 → T-6 ✅**. 발견: 기존 `subscribeKnowledgeProjectInsight` 는 projectId 필터 필수. `/ontology` 는 전역 view 라 새 API 필요. **추가**: `subscribeKnowledgePublicGraph(accountId, callback, onError)` — `knowledgePublicNodes/Edges/Meta` 를 account-scoped 로 전부 구독, `onSnapshot` 3 개 합성 + 부분 업데이트 합치기. **신규 view**: `src/views/ontology-view/OntologyViewPage` — `useSearchParams` + `resolveAccountId` 으로 account 선정 / subscribe / `useMemo` 로 buildOntologyTree → `OntologyTreeView`. 헤더 (eyebrow "Ontology" + 한글 제목 + 설명) + 통계 4 카드 (트리 노드 / 총 관계 / 근거 문서 / 발행 시점) + OperationsNav (데스크톱) + 에러·로딩 상태 처리. **신규 route**: `app/ontology/page.tsx` (Suspense + metadata title "온톨로지"). **boundary 위반 정리** (T-4 잔불 + 신규): `validate-output.ts` 의 `KNOWLEDGE_EDGE_TYPES` 값 import 제거 → 로컬 `ONTOLOGY_EDGE_TYPES` const inline (mirror, schema 동일성 주석 명시). `build-prompt.test.ts` 의 `DEFAULT_ONTOLOGY_*` 값 import 제거 → 로컬 fixture inline. types.ts 의 unused KnowledgeGraphEdge 제거. tsc 클린 / vitest 68 / lint (관련 파일 0 error, setState-in-effect 경고는 codebase 공통 패턴이라 허용). T-6 (1.5일 분량) 3 sub-task 모두 완료. 다음 단계: T-3 까진 모두 완료. T-1~T-7 (모든 7 task) 종료 → C-1 phase 준비 완료. |
| 2026-04-27 fire-20 | dev | **T-8 + T-9 + T-10 완료 → C-1 통합 closure**. (1) **T-9** OperationsNav 의 ITEMS 배열에 `ontology` 5번째 탭 추가 (NavItem id union 확장). 데스크톱 운영 nav 어디서나 `/ontology` 진입 가능. (2) **T-8** `KnowledgeDocumentDetailPage` 에 `ExtractorVersionToggle` (Gemini / Ontology radiogroup) 추가. state `extractorVersion` 기본 'gemini-v1' → 무회귀. enqueue 시 선택된 값 전달. (3) **T-10** `docs/superpowers/notes/2026-04-27-ontology-c1-runbook.md` 신설 — 7 절 + 측정 양식 표. §0 사전 준비 (Anthropic secret + TBox seed + rules deploy), §2 추출 1 회, §3 검수 cycle + 정확도 계산, §4 공개·트리 확인, §5 10 문서 측정 기록 양식, §6 자주 일어나는 문제 5 종, §7 다음 단계. tsc / vitest 172 통과. C-1 phase deliverable + 통합 + runbook 모두 완성. **이제 진안 작업 (T-11): 한국어 spec 10 개로 측정 → §3.3 임계값 평가**. 루프 영역 밖이라 자율 진행 어려움. 다음 fire 부터: 측정 결과를 받기 전까지는 spec 정합성 검증 / 추가 문서 정비 / 미해결 (T-3 §8) 결정 등을 진행하거나, 사용자 지시 대기.|
| 2026-04-27 fire-21 | tasks | **T-3 §8 미해결 3 항목 결정 종결 + T-12/T-13/T-14 분해**. 새 spec `2026-04-27-ontology-id-resolution.md` (180줄, 6 절) 작성: §1 canonical = `<kind>:<id>` (frontmatter id 우선, 없으면 legacy slug, kind 충돌 시 검수 큐 보고), §2 placeholder = stub 노드 (`kind: unknown` + edge 강등 `related_to` + 검수 promote/dismiss), §3 다국어 = v0 normalizeKey 만 / 양방향 한·영 매칭은 측정 (T-14) 후 결정. ontologyClasses 6번째 시드 (`unknown`) + knowledgeApprovedNodes 신규 필드 (isStub / pendingType / pendingFromId) 안내. T-3 frontmatter 계약 §8 의 3 미해결 항목 모두 ~~취소선~~ + 결정 문서 링크. §4 에 T-12 / T-13 / T-14 task 카드 추가 (총 11 task: T-1~T-10 ✅ + T-11 사용자 + T-12·T-13 todo + T-14 조건부). 다음 fire: T-12 dev (canonical mapping 모듈) — 사용자 측정 결과 기다리지 않고 진행 가능. |
| 2026-04-27 fire-27 | dev | **OntologyTreeView onSelect 통합 — 노드 상세 패널 추가**. 사용자가 트리 row 클릭 시 화면 우측 (md+) / 하단 (mobile) 에 노출되는 NodeDetailPanel 신설. 표시 항목: kind 한글 라벨 + title (break-keep) + summary + 연결 프로젝트 + 근거 수 + canonical id (mono). project kind 면 "공개 상세 페이지 →" CTA, unknown (stub) 이면 "검수 큐에서 promote/dismiss" 안내. ESC 로 닫힘 + 우상단 X 버튼. 모바일은 BottomTabBar 위 (`bottom-[calc(56px+env(safe-area-inset-bottom))]`) 에 시트, md+ 는 right rail (top-24 right-6 w-360px). e2e 회귀: 빈 상태에서 detail 패널 노출 안 됨 검증 케이스 추가. vitest 100 / pnpm build OK / tsc 클린. 사용자가 노드 클릭 후 → 어디로 갈지 (project 상세) / stub 인 경우 → 어떻게 처리할지 명확. |
| 2026-04-27 fire-26 | dev | **UX walkthrough + 회귀 방지 + production build 검증** (자율 task 모두 종결 후 마지막 폴리시). 사용자 "UI/UX 점검 + 사람처럼 써보면서 체크" 지시로 Playwright 모바일 (390) + 데스크톱 (1280) walkthrough. 7 이슈 발견 정정: (1) 모바일 BottomTabBar 에 ontology 진입점 없음 → "문서" 탭 matchPrefixes 에 /ontology 추가. (2) /knowledge hub 에 ontology 카드 없음 → SummaryCard 4번째 추가 (Network icon, "승인된 그래프 트리", "온톨로지 열기" CTA). (3) 빈 상태 next-action CTA 없음 → "검수 큐 열기 →" pill 추가 (빈 상태일 때만). (4) "발행 시점 —" 모호 → "아직 없음". (5) 모바일 mono 텍스트 wrap 어색 → whitespace-nowrap. (6) /ontology 에서 nav active 표시 없음 → 1번 fix 로 해결. (7) hub 카드 description 한글 글자 단위 wrap (`계` / `층`) → 짧은 문장. **production build** 확인: `pnpm build` OK, /ontology ○ Static, 6015 static pages 생성 정적 export 호환 회귀 없음. **e2e smoke** 추가: tests/e2e/ontology-ui.spec.ts 5 케이스 (desktop nav 진입 / desktop 헤더+CTA / mobile bottom-tab active / mobile hub 카드 / mobile mono nowrap). vitest 180/180, tsc 클린. **자율 가능한 모든 작업 종결** — 남은 건 진안의 T-11 측정 (한국어 spec 10 개로 정확도/단가/검수시간) 만. 루프 자율 모드 converged. |
| 2026-04-27 fire-25 | dev | **T-13b + T-13c 완료 → T-13 ✅** (사용자 "남은거 바로 전부다 구현해줘 루프돌지말고" 지시로 한 fire 에 일괄). **T-13b** entity API: `src/entities/knowledge-graph/api/` 에 `StubNode` 타입 + `fromFirestoreStubNode` mapper (isStub=true 필터링, accountId 누락 graceful) + `subscribeStubNodes(accountId, callback)` (knowledgeApprovedNodes where isStub==true onSnapshot, account-scoped) + `promoteStubNode`, `dismissStubNode` httpsCallable wrapper + 4 result/input 타입 export. **T-13c** widget + 페이지 wire: 새 widget `src/widgets/ontology-stub-list/OntologyStubList` (props: stubs, busyNodeId, onPromote, onDismiss). 빈 상태 + 미해결 stub 카운트 배너 (호박톤) + StubRow 컴포넌트 (title + pendingFromId → pendingType (한글 라벨) → stub.id 한 줄 + 근거 문서 수). 액션: promote 버튼 → KindPicker (5 종 한글 토글) → onPromote(nodeId, kind), dismiss 버튼 → window.confirm → onDismiss(nodeId). RTL 8 케이스 (empty / render / 카운트 / promote flow + cancel + busy / dismiss flow + cancel). 페이지 통합: `KnowledgeReviewWorkspacePage` 에 stubs state + busyStubNodeId state + `useEffect` subscribeStubNodes + `handlePromoteStub` / `handleDismissStub` (에러 surface) + 섹션 (stubs.length > 0 일 때 candidates 위 full-width Card). 합계 vitest 215 + node:test 19 = **234 테스트 통과**, tsc / lint 클린. **T-13 (1.5일 분량) 완료**. T-14 (다국어 alias matching) 는 T-11 측정 결과 의존이라 보류. ontology design loop 의 자율 가능한 모든 task (T-1~T-10, T-12, T-13) 완료. |
| 2026-04-27 fire-24 | dev | **T-13a 완료** (T-13 진행 중). `functions/index.js` 에 stub 관리 Cloud Functions 추가. **promoteStubNodeCore({ nodeId, newKind, accountId, requestedBy })**: stub read + isStub=true 검증 / 새 canonical `<newKind>:<idFromStub>` 계산 / 기존 같은 id 다른 kind 노드와 충돌 시 already-exists 거절 / 영향 받는 edges (from 또는 to == 옛 stub id) 모두 모음 / from=pendingFromId & to=oldStubId & type='related_to' 인 frontmatter edge 는 stub.pendingType 으로 복원 / batch (새 노드 set + 옛 stub 삭제 + edges update + promote_stub approval event). **dismissStubNodeCore**: stub + 참조 edges 모두 batch delete + dismiss_stub approval event. 두 onCall wrapper 추가 (admin 권한 체크). HttpsError typed (unauthenticated / permission-denied / invalid-argument / not-found / failed-precondition / already-exists). node --check syntax OK. emulator integration 검증은 T-13c 단계에서. 다음 fire: T-13b — client API entity 에 callable 추가 + stub list (where isStub == true) 구독. |
| 2026-04-27 fire-23 | dev | **T-12b 완료 → T-12 ✅**. `functions/ontology-extract.js` 에 canonical mirror 4 함수 (`normalizeSlug` / `resolveCanonicalNodeId` / `createStubPlaceholder` / `mergeStubPlaceholders`) 추가 — TS canonical 의 ESM JS 미러. `extractOntology` 오케스트레이터에 frontmatter relates 처리 통합: extracted 노드 tempId set 으로 매칭 → 정상 edge (원본 type / confidence 1.0 / 'frontmatter-declared' warning), 미매칭 → `createStubPlaceholder` (id-resolution.md §2 정책) + edge `related_to` 강등 + warnings 에 surface. id 누락 (등급 C) 시 relates 처리 skip + warning. canonicalIds 결과 (sourceTempId + canonicalId + source 'frontmatter-id'/'legacy-slug' + conflictWarning) 를 output 에 포함 — approval flow 가 직접 사용해 legacy buildCanonicalNodeId 우회 가능. node:test 5 신규 케이스 추가 (canonical mirror smoke / 매칭 시 정상 edge / 미매칭 stub + 강등 / id 없을 때 skip / canonicalIds source 분류) → 19/19. vitest 35/35. tsc 클린. T-12 (1일 분량) 완료. 다음 fire: T-13 (stub promote/dismiss UI) — KnowledgeReviewWorkspacePage 의 stub 섹션 + 새 Cloud Function `promoteStubNode`/`dismissStubNode`. |
| 2026-04-27 fire-22 | tasks → **dev** | **T-12a 완료** (T-12 진행 중). 단계 전환 (tasks→dev) 조건 충족 — T-12 PR 단위 1일 + 의존 충족 + 자체 완결. **T-12a 작업**: (1) pure 모듈 `src/shared/lib/ontology-canonicalize/` 신설 — `normalizeSlug` (한글 보존, 영문 lowercase, 그 외 하이픈) + `resolveCanonicalNodeId` (frontmatter id 우선, 충돌 시 conflictWarning, 누락 시 legacy `<kind>:<projectScope>:<titleSlug>`) + `detectCanonicalConflicts` (같은 id 다른 kind 검출) + `createStubPlaceholder` (`unknown:<targetId>`, isStub=true, pendingType/pendingFromId 보존) + `mergeStubPlaceholders` (evidenceIds 누적·dedupe). (2) ontologyClasses 6번째 `unknown` 시드 — defaults.ts (TS) + seed-ontology-tbox.mjs (admin script) + functions/ontology-extract.js DEFAULT 셋 모두 동기. (3) DATA-MODEL.md knowledgeApprovedNodes 표에 isStub / pendingType / pendingFromId 필드 + unknown kind 노트 추가. canonicalize.test.ts 18 케이스 (normalizeSlug 6 / canonical id 5 / conflicts 2 / stub 5). vitest 18/18 통과, tsc 클린. 다음 fire: T-12b — extractOntology 오케스트레이터에 frontmatter relates 처리 + stub 후보 자동 생성 + warnings 에 conflict surface. |
