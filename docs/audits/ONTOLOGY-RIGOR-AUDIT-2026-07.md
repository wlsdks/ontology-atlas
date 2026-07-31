# 온톨로지 표현적 적정성 감사 — 전문가 8인 (2026-07-24)

> **판정: `partial`** — "라벨 붙은 그래프를 넘어선, 이름값을 실제로 획득한 경량
> 온톨로지지만 미완성." 이 문서는 온톨로지 전문가 8인 패널이 "이 시스템이 제대로
> 된 온톨로지를 표현할 수 있는가"를 심사한 전체 기록이다. 실행 가능한 공백은
> `docs/plans/ONTOLOGY-STUDIO-PLAN.md` §1(스키마 심화)이 흡수한다. 이 문서는 근거·판정
> 원본을 durable 하게 보존한다.

## 심사단 (8 렌즈)
형식 온톨로지/지식표현(Gruber) · W3C 시맨틱웹(RDF/OWL/SKOS) · 기술논리(DL)/추론 ·
분류학/부분전체론(mereology) · 관계 semantics/온톨로지 속성 · 온톨로지 방법론/역량질문
(Grüninger-Fox·METHONTOLOGY·NeOn) · 엔터프라이즈/비즈니스 온톨로지(TOVE·역량모델링·DDD) ·
코드 지식그래프/소프트웨어 온톨로지(CPG·Glean·CodeQL). 제품 목표(agent-native·human-
sovereign·평문 마크다운·reasoner 없음) 대비 적정성으로 판단, **진짜 공백 vs 정당한 단순화**를 구분.

## 총평
typed 개념(kind)·방향성 typed 관계·엣지별 근거(relation_notes)·구현 접지(path)·결정론적
compile(graphHash)·git-native provenance를 갖춰 8인 중 3인이 목표 대비 adequate 판정. 다만
정의·경계·is-a·관계 domain/range가 durable 스키마가 아니라 코드 상수/body 산문에만 살아
성장 vault에서 개념이 표류하고(도그푸드 vault 도구 개수 31/25/32 3중 drift가 증명) 의미상 무효
엣지가 검증을 통과한다. **나열된 공백은 전부 평문 frontmatter로 메꿀 수 있다 = 잘못 설계가
아니라 미완성.**

## ✅ 제대로 표현 가능 (9)
1. 부분-전체(mereology) 계층: project⊃domain⊃capability⊃element를 단일 contains로 정규화 + projectIds BFS transitive closure (다수 인정).
2. 공유 파트/다중 부모: 한 element가 여러 부모에 소속돼도 트리 강제 붕괴 없이 DAG + edge-id dedup — mereologically 정확.
3. typed 관계 + 근거: relation_notes(why ≤300자)로 '근거 없는 엣지=마인드맵 선' 규율을 데이터로 강제 — 순수 RDF에 없는 엣지 provenance.
4. 구현 근거 접지: element의 path·capability 파일경로로 코드 연결(CPG/Glean식), R13이 CI에서 경로 존재 검증.
5. 안정 식별자 + 리네임: kind:slug canonical ID + folder-prefixed 해소 + alias, rename_concept 원자적 backlink 재작성.
6. 그래프 추론(reasoner 0): reachability·cycles·topological-order·blast-radius·components·centrality로 실사용 추론 결정론적 대체.
7. 결정론적 직렬화: compile의 graphHash + JSON-LD 1.1 export(urn:ontology-atlas:<kind>:<slug>)로 RDF 1.1 호환.
8. git-native 버저닝/감사: 모든 변경이 평문 frontmatter git diff — human-sovereign 충족.
9. 구축 방법론 내장: bootstrap/sync/extract/absorb 4 ingress가 NeOn 대응, proposalValidation이 canWrite 게이트로 정의·인용·CQ 커버리지 강제.

## ❌ 현재 표현 불가 (8) — 대부분 스튜디오 S2가 해결
1. 동종 노드 간 **is-a/종류 위계** — 모든 위계가 part-of로 강제, subsumption 축 통째 빔 (5인 합의).
2. 개념의 **정의·경계**(definition/includes/excludes) durable 필드 부재 → near-duplicate 양산.
3. **1급 비즈니스 엔티티**(actor·policy·regulation·KPI·risk) 타이핑 불가 — element/document로 강등.
4. **코드 도메인 세부 타입**(endpoint·schema·migration·job·fixture)이 전부 kind:element로 붕괴.
5. **연관 관계 의미 구분**(supersedes/complements/alternative/implements/tested-by) — related_to catch-all (4인 합의).
6. **역량질문(CQ)** frontmatter 미영속 — 인수기준이 일회성 부트스트랩으로 소비·폐기.
7. **관계별 신뢰도/주장자**(confidence·asserted_by) durable 부재 — 에이전트 추측 vs 사람 확정 구분 불가.
8. TBox/ABox·cardinality·disjointness·DL 함의 — **의도된 배제**(아래 정당한 단순화).

## ⚠️ 건전성 이슈 (모델이 실제로 뭉개거나 통과시키는 것)
- **관계 domain/range 미강제**: element depends_on project 같은 무효 엣지가 validate 통과 → reachability/blast_radius 오염. relation_check는 서술적(descriptive)일 뿐 처방 안 함.
- **contains 순환 미가드**: cycles 기본이 dependencies 전용 → project A⊃B⊃A·자기포함 등 mereological 모순이 무경고 성립.
- **evidence와 containment 술어 뭉갬**: capability elements[]가 개념 참조와 파일경로를 같은 배열·같은 contains로 담아 has-part와 is-grounded-by가 소실, mcp/src/index.js가 mangled 팬텀 노드로 민팅.
- **미해석 ref 조용한 팬텀 민팅**: 오타가 unknown:/slugified stub을 무에러 생성 → census/hubs/find_path 오염(validator는 warn하나 렌더 census엔 이미 포함).
- **related_to 방향/대칭 불일치**: 대칭 연관을 단방향 저장 → blast_radius/all_paths가 비대칭으로 오독.
- **노드 identity가 kind 내포**: 런타임 id가 capability:x라 element→capability 승격 시 id 변경 → rename 보호 backlink 끊김. base IRI 없어 export triple이 repo-local.
- **선언 vs 실현 어휘 drift**: KNOWLEDGE_EDGE_TYPES 7종 광고하나 derive는 좁은 집합만 실현(belongs_to/implements/uses 死타입).
- **capability 정의 혼동**: schema가 'one user-visible feature'로 규정 → BIZBOK 안정 역량과 배포 feature 뭉갬, '비즈니스 코어' 포지셔닝 약화.
- **TBox가 진실원 밖**: kind 집합·관계 vocab·containment 규칙이 코드 상수 → 사용자가 자기 도메인 스키마를 바꾸려면 TS를 고쳐야.

## 🟢 정당한 단순화 (과잉요구 방지 — 안 해도 됨)
OWL DL reasoner 배제(SKOS-light 명시 채택, 8인 전원 인정) · cardinality/disjointWith/SWRL·SHACL 공리
부재(kind 단일값이 disjointness 무료 보장) · class/instance(TBox/ABox) 미분리(SKOS도 동일 punt) ·
트리플스토어/reasoner/백엔드 미도입(human-sovereign 상충 = 정체성 위반) · DDD bounded-context 매핑 미지원
(현 청중엔 과도) · depends_on 다의성은 새 타입 증식보다 relation_notes로 · 사용자 정의 transitive/inverse
공리 엔진 부재(필요 추론은 절차적 커버) · cross-vault IRI 부재(단일 vault 로컬퍼스트라 현재 OK).

## 실행 가능한 공백 10 (→ 스튜디오 S2, 전부 평문 frontmatter·advisory·하위호환)
1. **is_a/broader** 관계 타입 (major) — contains와 구분되는 종류 축, export skos:broader/rdfs:subClassOf.
2. **definition/includes/excludes** 필드 (major) — 산문 정의 rot 봉합, missing-expected-field advisory.
3. **관계 domain/range 테이블** (major) — 무효 엣지 warning, 파생 지표 신뢰도 회복.
4. **related_to associative subtyping** (major) — supersedes/complements 등 닫힌 소어휘.
5. **evidence: 키로 코드경로 분리** (major) — file:<path> 노드, mangled 팬텀 제거.
6. **subkind:** advisory 소어휘 (major) — actor·policy·endpoint 등 1급 승격.
7. **contains 순환/비대칭 검사** (major) — 기존 cycles 재사용, 새 데이터 0.
8. **competency_questions** frontmatter (minor) — CQ 영속 + reachability로 커버리지 검증.
9. **unresolved-ref advisory + synthetic:true 태깅** (minor) — 팬텀 오염 격리.
10. **status/confidence + relation_meta provenance** (minor) — 추측 vs 확정 durable 구분.

## 상호운용 (RDF/SKOS export) 판정
RDF/JSON-LD export는 이미 현실이고 이 등급 KG 중 강한 편 — 모든 typed 엣지가 문자 그대로 S-P-O
triple, JSON-LD 1.1 + GraphML이 동일 URN 공유. 단 **canonical이 아닌 'structure-transfer' 등급**:
(1) 노드 id에 kind 박힘 + base IRI 없음 → globally stable IRI 근거 없음(vault 병합/rename가 URN 깨짐).
(2) 팬텀 unknown: 노드가 bogus subject로 export. (3) SKOS 표방하나 broader 미구현 → skos 매핑이 related에 그침.
(4) definition/CQ가 타입화 안 됨. **rank 2·5·9 + kind-독립 slug identity + optional base_iri를 메꾸면
canonical SKOS Concept Scheme export 도달 가능.**

## 로드맵 (단계·불변 원칙)
1. **건전성 먼저(S, 며칠)**: rank 7 순환 + rank 3 domain/range를 validate advisory로 — 즉시 난센스 엣지 표면화.
2. **정의 rot 봉합(S)**: rank 2 definition/includes/excludes + rank 8 CQ + rank 10 status/confidence (같은 additive 패턴).
3. **표현 축 확장(M)**: rank 1 is_a/broader + rank 4 related_to subtyping + rank 6 subkind.
4. **근거 분리 + 무결성(M)**: rank 5 evidence: file 노드 분리 + rank 9 synthetic 태깅.
5. **선택(수요 게이트 뒤)**: kind-독립 slug canonical identifier + optional base_iri → canonical SKOS export.
6. **capability 정의 문구 수정(S)** + **死어휘 정리(S)**: bodyTemplate '안정 역량'으로, belongs_to/implements/uses 실현 or 제거.
> **불변 원칙**: 모든 추가는 optional·advisory·평문 frontmatter — self-approving 계약·기존 vault 호환 유지.
> 트리플스토어·reasoner·백엔드 미도입. DL 표현력 요구 안 함 — SKOS Concept Scheme export로 외부 도구가
> 선택적 추론.

---
*관련: `docs/FOUNDATIONS.md`(인용 이론) · `docs/plans/ONTOLOGY-STUDIO-PLAN.md` §1(이 공백들의 구현 스키마).*
