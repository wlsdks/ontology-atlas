# 온톨로지 스튜디오 — 상세 설계 & 실행 플랜 (2026-07-24)

> 세션에서 소유자와 확정한 방향의 **상세 설계 스펙**. 로드맵 테이블이 아니라
> 각 슬라이스의 실제 설계 결정(스키마 의미론·소켓 편집 UX·변동 원장 모델·게임
> 토큰 시스템·빌더 마이그레이션)까지 담아 구현이 깊이를 잃지 않게 한다.
> 근거: 온톨로지 전문가 8인 심사(genuineGaps 10) · 디자인 카운슬 · 사용성 8인 ·
> 소유자 확정 시안(`node-studio-game.html`·`node-studio-create.html`).

---

## 0. 정체성 · 원칙 · IA

**한 줄**: 노드를 게임 아이템처럼 **강화/구축**하는 몰입 저작 표면. 온톨로지 관계·의미 =
소켓에 끼우는 **보석**. 빈 소켓(is_a·정의)이 곧 채우고 싶은 **퀘스트** → 채우면 레벨업.

**IA (세 표면 분리)**
- **지도(topology)** = 읽기·탐색. (그대로)
- **스튜디오(신설 `/ontology/studio`)** = 쓰기·저작. 강화(기존 노드) + 만들기(새 노드).
- **에이전트(MCP)** = 대량 쓰기.
- **빌더(/ontology/edit) = 폐기** (S4). 지도가 공간 탐색을, 스튜디오가 관계 저작을 더 잘 함.
  **단, 빌더를 없애는 만큼 스튜디오가 조립·연결·미리보기를 전부 커버해야 폐기 가능**(소유자 계약).

**강화 ≠ 만들기 (둘 다 1급, 소유자 확정)**: 강화(Enhance)=이미 있는 온톨로지 *수정*(빈 소켓 채워
레벨업). 만들기(Create)=**새 온톨로지 노드 추가**(빈 노드에서 조립). "제일 중요한 추가"라 만들기를
S2로 승격. 강화만으로는 부족 — 만들기가 빌더의 조립·연결·미리보기를 대체한다.

**진입점**: LNB "스튜디오" · 지도/문서에서 노드 → "강화하기" · "노드 만들기" 버튼.

**게임 은유 차별 (소유자 확정)**: 강화 = *살아있는 아이템 편집(소켓에 보석 끼움)* ·
만들기 = *버튼으로 하나씩 조립(관계 카드 + 노드 피커)*.

---

## 1. 온톨로지 스키마 심화 (S2) — 전문가 10 공백을 평문 frontmatter로

전부 **additive · 하위호환(기존 vault 무변경) · reasoner 0 · git diff 감사 가능**.
`mcp/src/schema.mjs`(+ `cli` 미러) · `derive-ontology-from-vault.ts` · `validate` 3곳 동기.

### 1.1 신규 frontmatter 필드 (kind별)

| 필드 | 대상 kind | 의미 | 소켓/능력치 | 근거 |
|---|---|---|---|---|
| `broader: [slug]` | capability·element·domain | **is-a/상위 개념** (part-of와 구분되는 종류 축) | 골드 소켓 "새 축" | gap#1 |
| `definition: str` | domain·capability | 개념 정의 1~2문장 | 능력치 "정의 ✓" | gap#2 |
| `includes: []` / `excludes: []` | domain·capability | 경계(이 개념 안/밖) | 정의 소켓 세부 | gap#2 |
| `evidence: [path]` | capability·element | **코드 근거**(개념 참조와 분리) | 능력치 "근거 N" | gap#5 |
| `subkind: str` | element·capability | 1급 세분(actor·policy·endpoint·business-process…) advisory 소어휘 | 아이템 서브타입 뱃지 | gap#6 |
| `competency_questions: []` | project·domain | 이 온톨로지가 답해야 할 질문(인수기준) | (인사이트) | gap#8 |
| `status: proposed\|shared` · `confidence: high\|med\|low` | 노드 | 검증 vs 추측 구분 | 레어도/신뢰 마킹 | gap#10 |

관계 서브타입(gap#4): `relates`를 유지하되 `relates_meta: {slug: as}` 맵으로 파싱 →
`related_to` 엣지에 subtype(supersedes/complements/alternative/see_also) 라벨 승격.
관계 provenance(gap#10): `relation_meta: {ref: {why, asserted_by: agent|human, confidence, since}}`
(기존 `relation_notes` 일반화).

### 1.2 관계 domain/range 검증 테이블 (gap#3 — 건전성)

`schema.mjs`에 (fromKind → toKind) 허용표 선언, `validate_vault`·`relation_check`가 위반을 warning(선택 error):

```
contains:  project→domain, domain→capability, capability→element
broader:   같은 kind끼리 (capability→capability, element→element, domain→domain)
depends_on:capability→capability, element→element/capability
implements:element/capability → capability/domain
describes: document → any
grounds:   evidence(file) → capability/element   (gap#5 분리 엣지)
```
- element depends_on project, document 아닌 describes 등 무효 엣지를 write/validate 시점에 표면화.

### 1.3 파생·검증·건전성 (계산만, 데이터 0)

- **contains 순환/비대칭 검사**(gap#7): 기존 cycles 계산을 contains/belongs_to에도 적용 →
  `containment-cycle`(error) · `containment-antisymmetry`(warn) · kind 순서 역행 warn.
- **팬텀 노드 정직화**(gap#9): 미해석 ref → `unresolved-ref` advisory + 합성 노드 `synthetic:true`
  태그 → topology/insights/export 제외 또는 flag. add_relation preflight에도 dangling 경고.
- **SKOS/RDF export 매핑**: broader→`skos:broader`/`rdfs:subClassOf` · definition→`skos:definition` ·
  includes/excludes→`skos:scopeNote` · evidence→`prov:wasDerivedFrom`. interop 현실성 확보.
- **competency 검증**(gap#8): 각 CQ가 답 노드/경로 1개 이상 갖는지 기존 reachability 재사용.

### 1.4 마이그레이션

정본은 디스크. 신규 필드 없는 기존 노드는 그대로 유효(누락은 advisory warning일 뿐). 첫 derive 시
자동 반영, 별도 migration 스크립트 불필요(R11 `migrate-vault`에 선택 backfill 등록 가능).

---

## 2. 소켓/보석 시스템 — 편집 UX 심화

**보석 = 온톨로지 관계·의미 하나.** 관계 타입 = 보석 색(원칙: 지도 엣지 문법과 정합).

| 소켓 | 보석(관계) | 색 | 채움/빈 |
|---|---|---|---|
| 담는 것 | contains | 스틸 | 요소 있으면 장착 |
| 기대는 곳 | depends_on | 인디고 | |
| 상위 개념 | **broader (is-a)** | **골드(새 축)** | 대개 빈 소켓 → 퀘스트 |
| 비슷한 것 | relates(+subtype) | 바이올렛 | 선택 |
| 근거 | evidence(코드) | 능력치(소켓 아님) | |
| 정의·경계 | definition/includes/excludes | 능력치 "정의 ✓" | |

**보석 끼우기 흐름 (S2 쓰기)**:
1. 빈 소켓 "+ 넣기" → **노드 피커**(검색). 만들기 흐름은 이 피커가 기본.
2. 피커는 **domain/range 테이블로 후보 필터**(1.2) — 무효 대상은 애초에 안 뜸(건전성 UX화).
3. 선택 시 **근접중복 감지**(rank4 재사용) 경고.
4. 확정 → **변동 원장에 patch op 적재**(§3). 즉시 디스크 아님(원장 경유).
5. 게임 피드백: 보석이 소켓에 "철컥" 장착 + 능력치 델타 팝(+1) + 강화도/레벨 상승 애니.

**강화도/레벨 점수(순수 함수, 테스트)**: definition·evidence·각 관계 kind·broader 유무를 가중합 →
0~100% + Lv 티어. 채울수록 rarity 상승(indigo→gold hint).

---

## 3. 변동 원장 (S3) — 변동지점 기억 + 양방향 적용

**모델**: typed patch op 목록. 예:
`{op:'set-field', slug, field:'definition', value}` · `{op:'add-relation', from, to, type:'broader'}` ·
`{op:'add-evidence', slug, path}`. 각 op에 `expectedMtime` 동봉.

**단일 진실원 헌장 준수**: 원장은 **휘발성 스테이징**일 뿐, 두 번째 진실원 아님. 적용되면
디스크로 가고 원장 비워짐. 미적용 op는 세션/명시적 "대기" 목록.

**두 적용 경로 (소유자: "직접+위임 둘 다")**:
- **직접 적용** → `vault.saveDoc`/patch (File System Access) 로 디스크 쓰기. 쓰기 vault일 때만.
- **에이전트에게 맡기기** → 원장을 정확한 **MCP 지시 패킷**(`patch_concept(...)`/`add_relation(...)` 목록)으로
  export → 에이전트가 실행. 기존 핸드오프/복사 인프라 재사용.

**충돌**: `expected_mtime` 가드(patch_concept 기존 계약). stale면 rank7 충돌 배지 재사용.
**읽기전용 샘플**: dogfood/storefront엔 쓸 디스크 없음 → 직접 적용 비활성("폴더 열면 편집"),
에이전트 위임(패킷 export)만 활성. 이게 원장이 두 경로를 갖는 이유.

---

## 4. 게임 표면 토큰 · 모션 시스템 (헌장 예외)

**격리 원칙**: 게임 에너지(glow·그라디언트·아우라·파티클·레어도)는 **`--studio-*` 토큰으로만**,
**스튜디오 표면에서만**. 앱 크롬/타 라우트 누출 = 결함. design.md·forbidden.md·DESIGN-SYSTEM.md에
명문 예외(S1에서 문서화). design-guardian은 이 표면에선 게임 에너지를 반려하지 않음.

**토큰 카탈로그(초안)**: `--studio-aura-radius/-alpha` · `--studio-gem-{contains,depends,broader,relates}` ·
`--studio-rarity-{indigo,gold}` · `--studio-glow-{soft,strong}` · `--studio-particle-*` ·
`--studio-shimmer-*` · `--studio-levelup-*`.

**모션 카탈로그**: 아우라 pulse · 아이템 bob · 보석 장착 snap · 능력치 델타 팝 ·
강화하기 shimmer sweep · **레벨업 burst/섬광(강화 확정 시)** · 파티클 부상.
**reduced-motion**: 파티클/아우라 pulse/shimmer 정지, 정적 유지(계약).

---

## 5. 강화 vs 만들기 흐름 (두 모드)

- **강화(Enhance)**: 기존 노드 진입. 현재 강화도/레벨 표시, 장착 보석 + 빈 소켓. 빈 소켓 채워 레벨업.
  살아있는 아이템 편집. 시안: `node-studio-game.html`.
- **만들기(Create)**: 빈 노드에서 시작. 신원 폼(종류·이름·도메인·정의) + 근접중복 경고 +
  **관계 타입별 카드에 "+" 버튼으로 하나씩 조립**(노드 피커). 완성도 0→오름.
  시안: `node-studio-create.html`. 하단 미니 프리뷰로 "지금까지 이런 모양".

---

## 6. 빌더 폐기 (S4)

- **현 빌더 인벤토리**: `/ontology/edit` xyflow ERD 캔버스 · `?node=<slug>` 딥링크 리시버 ·
  md export · 상세 패널 "관계 편집" 타일이 여기로 딥링크.
- **마이그레이션**: "관계 편집"/`?node=` 딥링크를 **스튜디오로 이관**. md export는 스튜디오 또는
  기존 compile/export CLI 유지. e2e 스펙 스윕(삭제된 testid 대기 spec 제거). 라우트/AGENTS.md/
  FEATURES.md/아키텍처 문서 갱신. forbidden.md 라우트 목록에서 /ontology/edit 폐기 반영.
- **순서**: 스튜디오가 쓰기(강화+만들기)를 충분히 커버한 뒤 폐기 — S2·S3 이후.

---

## 7. 슬라이스별 실행 + 검증 계약

| S | 산출 | 검증 |
|---|---|---|
| **S1** ✅ | 헌장예외 문서 · `--studio-*` 토큰 · `/ontology/studio` + LNB · 실노드 관계→보석/소켓/능력치(읽기) · 강화도 점수 · 게임 퀄 폴리시(관계별 보석 모양·3D·모션) | tsc·vitest·eslint·build·브라우저 |
| **S2 (승격)** 🔨 | **만들기(Create) 모드 = 제일 중요** — 빈 노드 조립 폼(종류·이름·도메인·정의 + 관계 카드 "+" 버튼 + 노드 피커 + 근접중복 + **미리보기**) + **쓰기 토대**(add_concept·add_relation) + 변동 원장 + 직접/에이전트 적용. 강화와 같은 쓰기 인프라 공유 | 쓰기 시나리오·원장 op·미리보기 |
| **S3** | is_a/정의/경계 스키마(§1) + domain/range 검증 + 강화 표면 **소켓 끼우기 쓰기**(S2 쓰기 재사용) | 계약테스트·validate·4-way |
| **S4** | **빌더 폐기** — 스튜디오가 조립·연결·미리보기 전부 커버 확인 후 `/ontology/edit` 제거·딥링크 이관·e2e/문서 스윕 | e2e·route·build |
| **S5 (미래)** | **AI 에이전트 라이브 연동** — 에이전트가 MCP로 작업하는 과정이 스튜디오 화면에 실시간 반영(노드/보석이 라이브로 채워짐). vault watch/폴링 + 스튜디오 실시간 리렌더 | 라이브 동기·watch |

원칙: fable 계획 · opus 구현. 각 슬라이스 수확 시 **design-guardian 검수**(스튜디오는 게임 에너지 허용) +
**브라우저 검증** + **2연속 무결** 후 머지.

---

## 8. 교차 매핑 (다른 트랙이 여기로 흡수/병행)

- **리거 공백 10 → S2** (§1이 곧 그 해결).
- **디자인 작업목록 잔여 13**(#6·8·9·10·11·13·14·15·19·20·21·22) — 스튜디오와 **병행**.
  #23(merge/rename GUI) → **스튜디오 S3/S4 흡수**(같은 쓰기 표면).
- **사용성 quick-win**(미터 라벨·가이드투어 자동시작·kind hover 정의·빈상태 평문화·element src 클릭) — 별도 배치.
- **완료(이번 세션 13 PR)**: P0 샘플 볼트(#581)·인사이트/프로젝트 통일(#577)·docs 결함·census 정정·
  도메인 결합(#584)·order-1 디자인 배치(#586~#589)·이 플랜(#590).
