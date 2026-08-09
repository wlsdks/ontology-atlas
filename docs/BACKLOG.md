# Backlog — ontology-atlas

> **현재 실행 순서의 정본.** 사용자가 작업 ID를 지목하면 그 항목만 분해해
> 구현한다. 완료 표시는 아래 활성 트랙의 증거 표에 먼저 남기고, 기능의 현재
> 상태는 `docs/FEATURES.md`, 결정 이유는 `docs/DECISIONS.md`, 사용자 가시 변경은
> `docs/CHANGELOG.md`가 각각 맡는다.
>
> 변하는 숫자를 이 문서에 고정하지 않는다. 현재 dogfood census는
> `node cli/src/index.mjs overview`, 공개 MCP/CLI surface는
> `pnpm docs:surface:check`로 확인한다.

---

## 활성 실행 트랙 — 신뢰 계약 → 의미 계약 → Skills process (2026-08-09)

이 트랙은 2026-08-09 설치 앱 Codex Computer Use 감사와 서로 격리된
`gpt-5.6-sol` MCP/ontology/Skills 감사 결과를 현재 HEAD와 다시 대조해 만든다.
**이 절 하나만 상태를 관리한다.** `docs/plans/`에 같은 체크리스트를 복제하지
않는다.

### PO 패스 — 구현 전에 문서를 정본으로 만든다

**선행 기록**: 2026-08-09 `/skills`는 읽기 전용이며 vault write·`kind:` 승격·
위험 점수·스킬 편집을 하지 않는다는 결정은 유효하다. project meaning receipt는
구조·competency·source currentness를 분리한다는 결정도 유효하다. 다만 실제
field trial에서 proposal이 승인한 witness를 finalizer가 거절했고, 이 관측은
두 단계가 동일한 증거 의미를 공유한다는 전제를 반증했다.

**관찰된 현상**:

- analyzer proposal은 `canWrite:true`인데 같은 witness가 finalize에서 거절된다.
- fresh source-checkout config는 앱에서 `0/3`이 되고, 존재하지 않는 npm launch
  문자열은 valid가 될 수 있다.
- quick-start는 실패 code를 반환하면서도 성공·연결 완료 문구를 출력한다.
- Workshop은 같은 domain의 sibling을 `is_a` 추천으로 오도한다.
- Skills 상세는 3단 load chain만 보여 주며, 번호 절차·근거 line을 보존하지 않는다.

**사용자 문제**: 새 제품을 처음 연결하는 사람과 에이전트가 “설정이 실제로
실행 가능한가, 승인한 의미가 확정 가능한가, 추천 관계가 믿을 만한가, 다음
절차가 무엇인가”를 한 번에 판단하지 못한다. 그 결과 재시작·재작성·소스 재탐색과
source-hidden handoff 실패가 생긴다.

**현상↔문제 판별**: 차이 통과(결정·신뢰·handoff 손실이 남음) · 제2 관측 통과
(CLI exit/stdout 불일치, app readiness false positive/negative, finalize failure,
source-hidden answer loss) · 해법 독립 통과(컴포넌트나 parser 이름 없이도 성립).

**대상과 모먼트**: 처음 vault를 만드는 개발자/FDE, 현재 의미를 승인하는 사람,
그 vault 또는 Skill process를 넘겨받는 새 AI agent. **현재 대안**: raw Markdown,
source search, 수동 config 검사, 세션 대화 재설명. **온톨로지 가치**: concept·typed
relation·evidence witness·currentness의 의미를 writer와 reader가 동일하게 해석한다.
**에이전트 가치**: first contact부터 finalize와 handoff까지 다음 MCP/CLI 행동이
실행 가능한 상태로 남는다. **단순화**: 새 kind·새 topology mode·Skills vault
영속화 없이 기존 spine과 읽기 전용 표면을 강화한다. **검증**: Node 24 fresh
fixture, source-hidden evaluator, focused contract, 설치 앱, 실제 motion/perf proof.

| 항목 | 4점 기준 문장 | 점수 |
|---|---|---:|
| Problem insight | Names an observed phenomenon and the workflow damage | 4 |
| User moment | Specific audience, moment, trigger, and blocked decision | 4 |
| Differentiation | Deepens local-first ontology + agent-memory wedge | 4 |
| Ontology value | Clarifies concept, relation, evidence, provenance, impact, ownership, or update path | 4 |
| Agent value | Agent gets a better MCP/CLI/source-intelligence handoff or validation path | 4 |
| Verification | Runtime proof matches the affected surface, including installed macOS app when relevant | 4 |

**자가 채점**: **24/24** (치명적 0 없음). **판정**: `Shape a slice` — 아래 순서와
no-go를 고정한 뒤 한 항목씩 `Build and verify`한다. MCP/CLI 외부 약속, vault
schema, Projects taxonomy를 바꾸는 항목은 진입 시 `/po-council`과
`docs/DECISIONS.md` append가 필수다. UI/motion 항목은 PO 뒤 design gate를 통과한다.

### 2026-08-09 ontology-construction 재조사 checkpoint

`docs/FOUNDATIONS.md`의 최초 조사와 현재 구축 규칙을 공개 1차 문헌으로 다시
대조했다. Grüninger–Fox(CQ), OntoClean(`is_a`/subsumption), OQuaRE(다차원 품질),
SAMOD(시나리오+예시+질의 회귀), LOT/NeOn(요구→구현→유지보수), W3C
RDF/OWL/SHACL/PROV 경계, 2025~2026 LLM ontology/CQ 연구를 직접 확인했다.

**유지할 것**: observed/proposed/shared 분리, evidence tier, includes/excludes,
typed CQ witness, 사람 승인, deterministic write plan, post-write validation,
source-hidden handoff. **보강할 것**: 목적·authority부터 시작하는 전체 생명주기,
CQ owner/revision provenance, examples+counterexamples, semantic/structural/functional/
evidence/pragmatic/maintenance/interop를 분리한 판정, maker-independent qualification.
**정정할 것**: machine-readable만으로 formal semantics라 부르지 않으며 Atlas를
RDF/OWL/SKOS/SHACL 구현으로 소개하지 않는다. **적용 원칙**: LLM은 요구·모델의
초안과 repair를 가속하지만 자기 산출물의 승인자나 단독 evaluator가 아니다.

### 상태와 순서

상태는 `ready` · `in_progress` · `blocked(<ID>)` · `hold(<관측 조건>)` ·
`done(<commit>)`만 쓴다. 한 번에 `in_progress`는 하나다.

| 순서 | ID | 상태 | 한 문장 결과 |
|---:|---|---|---|
| 0 | D0 | done(D0 documentation commit) | 이 활성 트랙·결정·정본 포인터를 만들고 문서 gate를 통과했다. |
| 0.5 | D1 | done(D1 research commit) | ontology construction 문헌·표준을 재검증하고 품질 계약과 우선순위를 보강했다. |
| 1 | M1.1 | done(844104d73) | proposal과 finalizer가 같은 evidence witness 의미를 쓴다. |
| 2 | M1.2 | done(d375bada9) | 앱이 실제 실행 가능한 agent config만 ready로 판정한다. |
| 3 | M1.3 | done(761d555a4) | quick-start 실패가 성공처럼 보이지 않는다. |
| 4 | M1.4 | ready | 현재 MCP inventory가 runtime registry 한 곳에서 파생된다. |
| 5 | O1.2 | blocked(M1.4) | Atlas의 5-kind·관계·formal/RDF/OWL 경계를 정직하게 고정한다. |
| 6 | O1.1 | blocked(O1.2) | Workshop은 근거 없는 `is_a`를 추천하지 않는다. |
| 7 | O1.3 | blocked(O1.1) | 요구·CQ·예시·반례·다차원 품질 평가 계약을 고정한다. |
| 8 | M1.5 | blocked(O1.3) | MCP/skill/prompt가 같은 ontology-construction lifecycle을 강제한다. |
| 9 | O1.5 | blocked(M1.5) | 세 낯선 제품에서 독립 construction qualification을 통과한다. |
| 10 | U1.3 | blocked(O1.5) | 같은 ontology-construction을 기본/전문가 깊이로 쉽게 사용한다. |
| 11 | K1.1 | blocked(U1.3) | Skill 번호 절차를 손실 없이 source-bound rail로 읽는다. |
| 12 | K1.2 | blocked(K1.1) | 명시 문법만 branch/retry/stop/verify로 타입화한다. |
| 13 | K1.3 | blocked(K1.1) | 승인된 process packet을 digest와 함께 handoff한다. |
| 14 | U1.1 | blocked(O1.5) | Projects가 lifecycle 질문을 category/status로 두 번 묻지 않는다. |
| 15 | U1.2 | blocked(O1.1) | spotlight가 bounded motion 뒤 idle로 돌아간다. |
| gate | O1.4 | hold(O1.5 + repeated missing primitive) | missing primitive가 반복 입증될 때만 schema 확장을 상정한다. |

### 작업 카드와 완료 조건

#### D0 — 문서 정본과 실행 원장

- **IN**: 이 활성 트랙, decision ledger append, `PRODUCT-DIRECTION`의 현재 정본
  포인터 교정, 현재 surface 산문의 명백한 drift 제거.
- **OUT**: 제품 코드, schema, MCP prompt, UI, 생성된 수를 사람이 직접 맞추는 gate.
- **완료**: `pnpm docs:check`, `pnpm agents:check`, `pnpm checks:changed`가 green이고
  아래 증거 표에 HEAD·명령·결과를 기록한다.

#### D1 — ontology-construction foundation 재검증

- **IN**: 공개 1차 문헌 재검증, `FOUNDATIONS`의 formal/RDF/OWL/SHACL 경계 정정,
  construction lifecycle·품질 벡터·human-sovereign evaluator 계약, 실행 순서 재정렬.
- **OUT**: MCP/schema/skill/prompt/UI 구현, 새 kind, 표준 conformance 구현.
- **완료**: 모든 새 출처를 실제로 열었거나 공식 원문 메타데이터로 확인하고,
  실패한 fetch는 대체 원문으로 복구하거나 미사용으로 남긴다. 생성 docs와 문서 gate가
  green이며 이 원장에 결과를 남긴다.

#### M1.1 — proposal ↔ finalizer witness parity

- **사용자 변화**: 승인·작성한 ontology가 같은 근거를 잃지 않고 finalize되며,
  새 MCP process도 같은 categorical assessment를 읽는다.
- **범위**: proposal evidence resolver, source witness/receipt inventory,
  finalizer, app↔MCP mirror와 contract fixture.
- **금지**: finalizer를 무조건 완화, private absolute path 저장, `canWrite`를
  completeness 점수로 해석, project마다 임시 예외 추가.
- **RED**: analyzer-approved semantic document와 안전한 최상위 source path가 write
  후 현 finalizer에서 거절되는 축소 fixture.
- **완료**: proposal → unchanged writePlan → source connect → finalize → fresh-process
  `agent_brief`가 성공하고 private coordinate가 public handoff에 없다.
- **검증**: focused MCP unit/write/surface, app↔MCP source-witness contract,
  source-hidden handoff, 마지막 `pnpm checks:changed -- <changed paths>`.

#### M1.2 — executable agent-config readiness

- **사용자 변화**: source checkout과 app-bundled 설정은 ready, 죽은 npm launch와
  다른 vault 설정은 repair로 표시된다.
- **범위**: config parser/validator, CLI init·agent-setup templates, Settings readiness
  denominator, 실제 `mcp-verify` 연결.
- **금지**: 문자열 `ontology-atlas-mcp` 포함 여부만 검사, npm package 부활,
  `.mcp.json.example`을 실제 연결 파일로 가장하기.
- **완료**: source node entrypoint와 bundled binary fixture는 valid, `npx -y
  ontology-atlas-mcp`는 invalid, example 파일의 역할이 UI count와 일치한다.
- **검증**: validator negative/positive corpus, fresh CLI init roundtrip, 새로 빌드한
  설치 앱에서 Settings 상태와 실제 MCP first contact 대조.

#### M1.3 — quick-start terminal truth

- **사용자 변화**: scaffold 성공과 bootstrap/MCP 검증 실패를 구분해 읽고 바로
  복구할 수 있다.
- **완료**: 실패 fixture에서 nonzero exit와 함께 green `done`, `bootstrapped`,
  `MCP already wired`가 없고 “config written but unverified”와 복구 명령이 있다.
  성공 fixture의 짧은 3-step 흐름은 유지한다.
- **검증**: CLI entry integration RED/GREEN, packed/source parity.

#### M1.4 — current MCP inventory single source

- **사용자 변화**: 모든 first-contact 문구가 실제 사용 가능한 도구를 빠짐없이
  설명한다.
- **범위**: raw initialize instructions, current product docs, starter templates,
  generated docs surface.
- **금지**: 역사 기록의 당시 숫자 수정, 새 수를 여러 문서에 손 복사, 문장을
  literal pinning하는 테스트.
- **완료**: `tools/list` → generated manifest가 current claims를 만들고 initialize의
  header/list/count가 서로 일치한다.
- **검증**: raw stdio initialize+tools/list, MCP surface integration,
  `docs:surface:check`, starter locale tests.

#### O1.2 — Atlas meta-model truth boundary

- **사용자 변화**: 사람과 agent가 domain/capability/element/document를 같은
  판별법으로 만들고, Atlas가 하지 않는 RDF/OWL/process 추론을 기대하지 않는다.
- **범위**: `FOUNDATIONS`·`PRODUCT-DIRECTION`의 단일 정의, 5-kind includes/excludes와
  examples/counterexamples, relation direction/domain/range/inverse/world-assumption table,
  `is_a` subsumption 판별, bootstrap/field-trial/MCP prompt의 progressive-disclosure pointer.
- **금지**: “machine-readable = formal semantics”, RDF/OWL conformance 암시,
  `evidence`처럼 실제 relation enum에 없는 관계 주장, 같은 규칙의 다중 사본.
- **완료**: docs·schema templates·skill·prompt가 한 정본을 가리키며 adversarial
  concept fixtures가 folder/team/workflow를 domain/capability로 자동 승격하지 않고,
  same-domain·이름 유사성·폴더 중첩만으로 `is_a`를 만들지 않는다.

#### O1.1 — relation-specific Studio recommendation

- **사용자 변화**: 빈 UP socket은 관계 affordance로 남지만, sibling을 상위
  개념으로 권하지 않는다. 추천은 근거와 preflight가 있을 때만 붙는다.
- **범위**: Studio picker scoring/labels/create+enhance states와 relation-specific tests.
- **금지**: `is_a` 자체 제거, compass bearing 변경, same-domain을 subsumption 근거로
  사용, 추천을 다른 장식으로 숨기기.
- **완료**: same-domain sibling negative fixture가 green이고, neutral/recommended의
  접근성 이름과 시각 위계가 설치 앱에서 구분된다.
- **검증**: TDD+gate-probe, focused Vitest, user walkthrough, design audit, rebuilt app.

#### O1.3 — requirements, CQ, quality evaluation contract

- **사용자 변화**: C-level은 outcome/risk, 직원은 purpose/role/process gap, FDE는
  change/impact/verification, agent는 evidence/currentness/next safe action을 질문한다.
- **범위**: motivating scenario, CQ owner/revision provenance, 원자 CQ, expected answer,
  quantifier, witness, refusal/unknown, exemplar/counterexample, source-hidden evaluator,
  semantic·structural·functional·evidence/provenance·pragmatic·maintenance·interop 분리 판정,
  시간·비용·citation/claim accuracy 분리 지표.
- **금지**: 하나의 종합 점수, maker self-approval, node count를 품질로 사용.
- **완료**: 각 CQ에 사람 owner와 승인 이력이 있고, 한 판정축의 green이 다른 축의
  red를 가리지 않는다. 세 낯선 제품 qualification의 fixture·expected answer·claim
  ledger·판정 rubric이 재실행 가능하며 실패 원인을 evidence·prompt·UI·missing
  primitive로 분류한다.

#### M1.5 — ontology-construction lifecycle enforcement

- **사용자 변화**: fresh agent가 디렉터리 명사 수집이 아니라 목적→CQ→evidence→작은
  모델→semantic/structural test→source-hidden task→사람 승인→회귀 순서로 구축한다.
- **범위**: 기존 `construction-spec.mjs`·node eligibility·write gate·bootstrap skill·
  MCP instructions를 한 lifecycle로 파생하고, 단계별 artifact/diagnostic을 정의한다.
- **진입 조건**: 공개 MCP/prompt 계약 변경이므로 `/po-council`과 decision append.
- **금지**: 기존 3-layer 규칙 복제, LLM self-approval, UI로 실패 은폐, 새 kind 선행,
  source path를 개념으로 승격, 모든 단계를 한 opaque confidence로 접기.
- **완료**: Node 24 fresh fixture에서 단계 누락·authority 부재·unsupported `is_a`·
  maker-only evaluation이 fail-closed이고, accepted write plan만 vault에 쓰이며 이전 CQ가
  regression으로 재실행된다.

#### O1.5 — three-product independent construction qualification

- **사용자 변화**: FDE·직원·C-level·새 agent가 원본 소스 유무에 맞는 답과 다음 안전한
  행동을 얻고, 모르는 것은 모른다고 말하는 ontology를 받는다.
- **범위**: 서로 다른 세 낯선 제품, maker와 분리된 evaluator, source-visible construction
  + source-hidden handoff, 사용자군별 CQ, exact claim ledger, 시간/호출/지원된 주장 측정.
- **금지**: 같은 agent가 만들고 승인, node/edge 수로 합격, source-hidden evaluator에게
  source를 몰래 제공, unsupported claim을 partial과 합쳐 평균내기.
- **완료**: 세 제품 모두 structural valid에 더해 semantic·functional·evidence·pragmatic
  판정을 각각 통과한다. 실패한 축은 그대로 red이며 K1/U1로 넘어가지 않는다.

#### U1.3 — progressive-disclosure construction UX

- **사용자 변화**: 기본 사용자는 목적 확인·애매한 의미 선택·최종 승인만 하면 되고,
  evidence 탐색·CQ replay·validation·regression은 agent가 뒤에서 수행한다. 전문가 사용자는
  같은 결과에서 CQ·witness·source span/digest·examples/counterexamples·relation rationale·
  quality-axis 진단·write plan을 펼쳐 직접 검토하고 수정할 수 있다.
- **제품 계약**: 기본/전문가는 서로 다른 ontology나 validator가 아니라 **같은 artifact의
  두 disclosure depth**다. depth를 바꿔도 Markdown·receipt·판정 결과는 같으며, 기본 화면이
  red/unknown/conflict나 사람 승인을 숨기지 않는다. 자동화는 조사·제안·검증까지이고 accepted
  write plan 승인권은 사람에게 남는다.
- **열린 설계 질문**: 전역 Settings의 지속 모드, 화면별 `세부 보기`, 역할별 remembered
  preference 중 어느 것이 실제 전환 비용이 가장 낮은지는 구현 전에 `/design-directions`와
  기본 사용자/전문가 walkthrough로 비교한다. `일반인`처럼 숙련도를 낙인찍는 UI label은
  검증 없이 채택하지 않는다.
- **금지**: 두 schema/두 truth, expert-only correctness, 기본 모드의 silent auto-accept,
  중요한 failure를 초록 요약으로 접기, 디자인 시스템 밖 별도 component/token/ramp.
- **완료**: 처음 온 사용자가 내부 용어를 배우지 않고 construction을 끝내고, 전문가는
  raw Markdown으로 탈출하지 않아도 각 판정 근거를 추적·수정한다. 두 모드가 같은 receipt와
  diff를 만들며, design audit·responsive sweep·재빌드한 설치 앱 Codex Computer Use가 green이다.

#### K1.1 — Skills lossless happy-path rail

- **사용자 변화**: 기존 3단 load chain 아래에서 번호 절차를 원문 순서·line과
  함께 읽는다.
- **최소 IR**: `irVersion`, source path+digest, scanTruncated, diagnostics,
  stable stepId/ordinal/exactText/sourceSpan, resource exists/kind/backlinks.
- **금지**: 기본 transition edge, branch/retry 추측, ontology node/vault write,
  script content security scoring.
- **완료**: trial fixture 27/27 exact steps, unsupported/truncated Markdown fail-closed,
  load chain과 process rail이 시각·접근성상 다른 것임이 증명된다.

#### K1.2 — narrow semantic overlay

- **진입 조건**: K1.1 IR과 독립 gold corpus가 고정돼 있어야 한다.
- **허용**: exact syntactic marker와 literal guard/target이 있는 branch/retry/stop/
  verify만. derived fact마다 exact span+digest.
- **금지**: substring keyword, ambiguous default edge, `rollback deadline` terminal,
  `stop mutation` whole-process stop, 명사 `checksum`만으로 verify.
- **완료**: gold-reviewed admitted set precision 100%; 애매한 문장은 edge 대신
  diagnostic이고 false positive 0.

#### K1.3 — authorized source-hidden process packet

- **사용자 변화**: 사용자가 명시적으로 복사/내보낸 packet을 새 agent가 원본
  폴더 없이 읽고 exact steps와 diagnostics를 인용한다.
- **금지**: 자동 vault 저장, 무단 외부 전송, packet 부재를 process 없음으로 해석.
- **완료**: digest tamper fail-closed, authorized packet handoff의 supported claims
  100%, 미승인 vault-only handoff는 `process unavailable`을 정직하게 반환한다.

#### U1.1 — Projects taxonomy contract

- **진입 조건**: PO Council + decision ledger. 공개 frontmatter 호환과 실제 사용자
  분류 목적을 먼저 결정한다.
- **선택지**: category를 lifecycle과 독립된 structural grouping으로 정의하거나
  required category를 retire한다. status는 lifecycle 한 축만 소유한다.
- **완료**: old vault roundtrip, default ID 의미 중복 negative test, create/edit UI
  walkthrough. 자동 migration은 별도 승인 없이는 하지 않는다.

#### U1.2 — bounded spotlight motion

- **진입 조건**: design-motion 결정 — static 또는 token-defined one-shot.
- **금지**: spotlight가 켜진 동안 frame loop를 영구 active로 유지.
- **완료**: normal motion은 bounded interval 동안 phase가 변한 뒤 idle, reduced-motion
  rotation 0, pan/drag perf 회귀 0.
- **검증**: idle-gate contract, 실제 macOS recording/frame diff, map-perf.

#### O1.4 — schema expansion decision gate

지금 실행하는 구현 항목이 아니다. O1.5를 마친 뒤 최소 세 낯선 제품/조직과
사용자군별 독립 trial에서 현재 evidence와 개선된 prompt를 제공해도 동일 CQ가 반복 실패하고,
평가자가 원인을 outcome identity·actor-role participation·process ordering 같은
**missing primitive**로 합의할 때만 `/po-council`에 상정한다. 첫 후보는 새 root
kind 묶음이 아니라 qualified statement/provenance envelope다.

### 명시적으로 작업하지 않는 것

- relation rationale 유실: 현재 vault·handoff·focused roundtrip에서 재현되지
  않았다. 특정 consumer의 byte-level 재현 전에는 task가 아니다.
- workspace stale slug와 Insights evidence 문구: 현 HEAD의 구현·E2E가 이미 있다.
- Skill step ontology node, Skills 위험 점수/배지, SKILL.md 편집, 자동 vault 저장.
- OWL reasoner·일반 process ontology·outcome/role/process root kind 선행 추가.
- spotlight always-on repaint, 전면 UI redesign, Orca 제거.
- C-level Insights hierarchy: declared-knowledge walkthrough에서 같은 stall이 두 번
  재현될 때 discovery로만 재등록한다. U1.3의 기본/전문가 depth와 자동으로 합치지 않는다.

### 완료 증거 원장

`done`으로 바꾸기 전에 이 표 한 행을 채운다. 큰 로그를 붙이지 않고 HEAD/commit,
실패를 잡은 RED, focused checks, runtime/handoff proof, 남은 위험만 적는다.

| ID | commit/HEAD | RED | focused checks | runtime/handoff proof | residual risk |
|---|---|---|---|---|---|
| D0 | D0 documentation commit (this row) | stale plan authority + stale 33/14 current claim | `docs:check`; `agents:check`; `decisions:check`; `checks:changed` | docs-vault regenerated; generated surface confirmed 35 MCP (19 read + 16 write), 54 CLI | product code untouched; `AGENTS.md` has 606-byte cap headroom |
| D1 | D1 research commit (this row) | `formal=machine-readable`, RDF/OWL conformance 암시, lifecycle·quality-vector 부재 | `docs-vault:check`; `docs:check`; `agents:check`; `decisions:check`; `checks:changed` | 고전 방법론·W3C 표준·2025~2026 LLM/CQ 1차 출처를 교차 검증하고 정본/순서를 보강 | 구현은 M1.1부터; lifecycle의 공개 계약 반영은 M1.5 PO Council 뒤 |
| M1.1 | `844104d73` | analyzer가 승인한 `README.md` witness를 unchanged writePlan으로 저장한 뒤 finalizer가 `scope` unresolved로 거절 | MCP unit 32; app/MCP focused Vitest 17; contract 1,559; MCP integration 115; TypeScript·ESLint; gate-probe RED→GREEN | Node 24 실제 stdio proposal→write→connect→finalize→fresh `agent_brief`; scope resolved, 의도된 impact gap 유지, private root 노출 0; dogfood MCP 35/35 | exact `## Competency answers`의 `Evidence`/`Paths`만 파생하며 임의 본문 경로는 제외; UI 변경 없음; 다음은 M1.2 executable config truth |
| M1.2 | `d375bada9` | source/bundle 설정은 false, 죽은 `npx`는 true, Settings는 template까지 `3`으로 세고 CLI도 `npx`를 ready로 판정 | app/config/Settings 161; CLI integration 289; contract 1,559; desktop bridge 135; desktop check 274; i18n 16; TypeScript·ESLint; gate-probe RED→GREEN | Node 24 fresh init의 활성 config 4/4 + stdio MCP 35/35; 재빌드한 `/Applications/Ontology Atlas.app`에서 Codex Computer Use로 Settings 2/2와 두 행만 확인; bundled binary 35/35 | ready는 실행 shape·대상 파일·vault 좌표 계약이며 live session 자체는 별도 `mcp-verify`가 증명; 다음은 M1.3 terminal truth |
| M1.3 | `761d555a4` | bootstrap exit 2 뒤에도 green `quick start done`, `bootstrapped`, `MCP already wired`가 출력; 실제 tarball은 runtime import 누락으로 정상 quick-start도 exit 2 | quick-start source 7; CLI integration 290; package contract MCP 41/CLI 90 reachable; packed CLI success+failure; ESLint; gate-probe RED→GREEN | source와 새 tarball 설치본 모두 성공은 기존 3-step, 실패는 nonzero + `quick start incomplete` + written-but-unverified + 실행 가능한 diagnose/retry 명령; packed MCP 누락 runtime 파일 복구 | scaffold/config write는 보존하되 bootstrap·live MCP 준비로 승격하지 않음; 다음은 M1.4 runtime-derived inventory |

### 트랙 공통 종료 규칙

1. 시작 전에 이 표의 선행 ID가 `done`인지 확인한다.
2. 구현자는 자기 변경을 승인하지 않는다. source-hidden 또는 built-surface 평가는
   maker와 분리한다.
3. gate를 추가/수정하면 `/gate-probe`로 violation census→RED→GREEN을 증명한다.
4. UI는 관찰된 ontology workflow 문제를 해결할 때만 만든다. 시각 변경은 PO 뒤
   구조 선택이 있으면 `/design-directions`, 구현 전 `/design-build`, 구현 후
   `/design-audit` 순서를 지킨다. 값은 `DESIGN-SYSTEM.md`의 token/ramp와 기존 primitive가
   소유하며 raw 병렬 규격을 만들지 않는다. 영향에 따라 responsive/motion/map instrument를
   실행하고, desktop 영향은 설치 앱을 다시 빌드·실행해 Codex Computer Use로 검증한다.
5. 마지막 명령은 항상 변경 경로를 넘긴 `pnpm checks:changed -- <paths...>`다.
6. 완료 때 `docs/CHANGELOG.md`와 필요 시 dogfood ontology를 동기화하고, 이 표만
   상태 정본으로 갱신한다.

---

## 아래는 역사 백로그다

이 아래의 완료 기록·폐기 이유·당시 추천 순서는 삭제하지 않고 보존한다. 현재
작업 상태와 순서는 위 **활성 실행 트랙**만 따른다. 아래의 `추천 진행 순서`나
고정된 surface 수가 활성 트랙과 다르면 역사값이지 새 지시가 아니다.

## ✅ 완료 (R12-R14, 2026-05-04 ~ 2026-05-05)

### R14 (#155-#163, 2026-05-05) — AI agent ↔ vault 자동 sync + 웹 즉시 반영

| PR | 항목 | 결과 |
|---|---|---|
| #155 | vault polling 5s | ✅ visible-only `setInterval`, fingerprint diff |
| #156 | graph diff pulse | ✅ 새 노드 amber sine 5s on `/topology` |
| #157 | added toast | ✅ 모든 페이지 'Added: <slug>' |
| #158 | modified toast | ✅ slug 동일 + mtime 변화 'Edited: <slug>' |
| #159 | walkthrough 5 fix + topology↔ontology 회복 | ✅ /topology 1 노드 → 68 노드 112 엣지 |
| #160 | frontmatter schema 양식 (3 entry points 동기화) | ✅ `mcp/cli/src/lib/schema.mjs` single source |
| #161 | CLI `import` — 외부 .md 정규화 후 vault 정착 | ✅ cli 5 → 6 명령 |
| #162 | `/ontology-sync` skill + AGENTS read-while-coding 룰 | ✅ 명시 trigger 갈래 |
| #163 | SessionStart hook — vault census 자동 inject | ✅ 암시 trigger 갈래 |

### R13 (#43-#67, 2026-05-04) — AI agent quality 첫 측정 + VSCode plugin

| PR | 항목 | 결과 |
|---|---|---|
| #47 #48 | AI agent benchmark 7 task × 3 카테고리 cross-agent (Claude Code + Codex) | ✅ n=2, MCP 가치 measurable (CC: hallucination 9→0, Codex: tool calls -76%) |
| #45 | MCP `instructions` field (v0.7.1) | ✅ 매 세션 prompt 수준 안내 |
| #49-#67 | VSCode plugin v0.1.0 → v0.9.0 | ✅ status bar / backlinks / add concept / MCP connect — **R15 에서 plugin 자체 제거** (daily driver 가 AI-agent 터미널로 전환) |

### R12 (#27-#42, 2026-05-04) — developer-primary 결정 + CLI 5 명령 + dogfood graph 완전화

| 항목 | 결과 |
|---|---|
| Primary audience = developer + AI agent (PM drop) | ✅ PRODUCT-DIRECTION v3 |
| CLI 4 새 명령 (`list / validate / add / find`) | ✅ cli v0.2.0 |
| Cross-package contract 4-way (parser) / 3-way (validator) | ✅ 12fix×4 + 8fix×3 = 72 case |
| dogfood graph orphan 8 → 1 (의도적 1) | ✅ |

### R11 (2026-05-04) — vault tooling + parser contract + MCP graph-level write

| 항목 | 결과 |
|---|---|
| `pnpm vault:validate` / `vault:migrate` | ✅ |
| MCP v0.7.0 — 14 tools (8 read + 6 write, `rename_concept` / `merge_concepts` 추가) | ✅ |
| 3-way frontmatter parser contract | ✅ |
| MCP conflict guard (mtime 기반 silent overwrite 차단) | ✅ |

### Open questions 해소

- **Q1** — `/` 자동 vault 전환 → ✅ (a) 채택, useOntologyInsight 도입
- **Q2** — share-doc 시스템 제거 → ✅ commit d27e3d0
- **T30** MCP `find_path(from, to)` → ✅ R11 v0.7.0
- **T31** MCP `list_kinds` → ✅ R11 v0.7.0 (`list_domains` 는 `list_concepts({ kind: 'domain' })` 으로 cover)

---

## ~~결정 필요 (user input 후 unblock)~~ — Q3-Q8 자체 무효

`docs/archive/ONTOLOGY-MODEL-V2-DRAFT.md` 의 head 표 (2026-05-02 갱신) 가 답을 이미 확정:

- **Q1·Q2** — 해소 (mission v2 cleanup)
- **Q3-Q7** — 답 확정 (2026-05-02, user 추천 기본 채택)
- **Q8** — V1.4 자체 N/A (functions/ 폐기로 server-side action 사라짐) → 즉시 영향 0

V2 통합 자체도 `mission v2 default path 에서 invisible` 한 cloud 컬렉션 합병이라 ⏸ N/A. **R10b (firebase 영구 제거) 후 V1.x 진화 cloud-side 컨텍스트 자체 dead**. spec 은 *향후 서버 도입 결정 시 재활성* 위해 archive 보존.

---

## P0 — 즉시 실행 가능 (위험 낮음, 가치 큼)

### M1. 10-minute memory loop proof — *launch readiness gate*

- **목표**: fresh repo 에서 `init -> analyze/bootstrap -> MCP first-contact ->
  agent answer improvement -> sync proposal -> git diff review` 까지 10분 안에
  가치가 보여야 한다.
- **자동 게이트**: `pnpm smoke:memory-loop` 는 임시 TS repo 에서 `init ->
  bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile` 을
  실행한 뒤 새 feature 파일을 추가하고 `analyze_repo_structure` 가
  side-effect-free sync 후보를 제안하는지, git diff 가 그 코드 변화와 맞는지
  10분 예산 안에서 검증한다.
- **검증**: 신규/낯선 TS repo 1개를 골라 녹화 가능한 절차로 측정. 손으로
  ontology를 오래 작성해야 하면 실패.
- **성공 기준**: agent가 `workspace_brief` / `health` / `query_ontology` 기반으로
  구조를 더 빨리 파악하고, 작업 후 vault diff 제안이 실제 코드 변화와 맞는다.
- **현재 의미 검증 경계**: `finalize_project_meaning`이 현재 프로젝트의 다섯
  competency 답변을 versioned receipt로 고정하고, 이후 `agent_brief --project
  SLUG`가 구조·competency·source 차원을 다시 대조한다. receipt write 성공이나
  구조 readiness를 신뢰도 점수로 해석하지 않는다.
- **왜 P0**: 시장성은 ontology 자체가 아니라 agent memory 유지비 감소 루프에
  있다. 이 루프가 안 보이면 좋은 엔진이지만 제품은 아직 아니다.

### ~~T28. demo blueprint mission v2 정렬~~ — VOID

`src/shared/mocks/demo-blueprint.ts` 자체가 이미 제거됨 (어느 라운드에 사라졌는지 git log 미확인 — 이미 cleanup 완료). manifest.json 의 잔재 텍스트는 build-time generated docs 인용이라 직접 손볼 대상 아님.

### ~~T29. /docs/ first-time UX — dogfood vault hint~~ — DONE (2026-05-09)

`/docs/?intent=local` 이 vault picker 를 열면 `docs/ontology/` dogfood hint 를 바로 보여준다. E2E 로 first-time hint copy 를 고정.

### ~~F1. dogfood vscode-plugin capability 갱신~~ — VOID (R15)

R15 에서 vscode-plugin 자체 제거. capability `vscode-plugin-ide-entry` 도 삭제. 갱신 대상 자체 사라짐.

### ~~F2. VaultDiffToaster diff logic 단위 test~~ — DONE (2026-05-09)

`diffVaultManifest` 와 `planVaultDiffToasts` pure helper 로 분리 완료. added/modified
분류, mtime 단조 증가, null mtime skip, removed 무시, preview limit, overflow
toast 계획까지 14개 unit case 로 회귀 차단.

### C3. AI agent benchmark scale n=2 → n=5+ — *user-triggered*

- **현재**: R13 의 cross-agent (Claude Code + Codex) benchmark n=2. 강한 confirming evidence
- **상태**: R14 closeout 에서 `docs/benchmark/README.md` 에 "Current measurement status" + 재측정 가이드 (`pnpm benchmark --bypass` 등) 추가. 실제 측정은 user 가 explicit trigger
  - Codex 자동: `--dangerously-bypass-approvals-and-sandbox` 가 필요해 user 명시 승인
  - Claude Code self: 새 session 에서 manual walk
- **재측정 가치 시점**: vault 25 → 50 노드 도달 시점 (effect 가 scale 되는지 saturate 되는지)

---

## ~~P1 — V1.x 진화 (cloud-first 가정)~~ — 모두 N/A 또는 머지됨

R10b (firebase / functions / firestore 영구 제거) 후 cloud-side 진화 컨텍스트 자체 사라짐. archive spec 의 진행 상태표 (2026-05-02):

| Track | 상태 |
|---|---|
| V1.1 — Statement Qualifiers + Rank | ✅ 머지 (PR #10) |
| V1.5 — Relation Cardinality | ✅ 머지 (PR #23) |
| V1.2 — Literal Properties | 🟡 vault-adaptation (cloud collection 신설 안 함, frontmatter scalar 직접 편집 PR 진행 중) |
| V1.3 — Rich References | ⏸ N/A — cloud LLM 추출 흐름 폐기 |
| V1.4 — Action Type | ⏸ N/A — server-side action 게이트 폐기 |
| V2 — 통합 KnowledgeStatement | ⏸ N/A — cloud 컬렉션 invisible |

미래 cloud collab 단계 재도입 시 archive 로부터 재활성. 현재 P1 무.

---

## P3 — 인프라 / 회귀 차단

### T37. Playwright MCP routine QA

- 매 PR 또는 nightly 로 핵심 라우트 navigate + console error check
- needs: CI runner 가 Playwright MCP 실행 가능한가 확인
- est: 1-2 commit

### F3. .mcp.json git-tracked (✅ 이번 R14 closeout 에서 추가)

- 사용자가 git clone 후 Claude Code를 열면 당시 MCP surface가 자동 등록되었다.

### ~~T23. mode-aware e2e tests~~ — VOID (R10b)

R10b 에서 firebase 제거. cloud / static 모드 구분 자체가 사라짐.

### ~~T38. functions Firestore 컬렉션 archival~~ — VOID (R10b)
### ~~T24. knowledge-* 컬렉션 통합 검토~~ — VOID (R10b)

---

## P4 — Marginal value (defer)

### CHANGELOG batch cleanup
완료된 ✅ 항목들을 BACKLOG 에서 제거 + CHANGELOG 로 이동. 운영 작업, 가치 marginal.

### T12. NodeDetailPanel evidence excerpt modal
T20 (rich references) 후.

### T27. 큰 view 파일 정리
- `KnowledgeDocumentDetailPage` (이미 -300 줄 정리됨, 1100+ 줄 잔여) — defer

### T40. 물리(force) 조절 v2 재배선 — 실기능으로 원하면 부활
2026-07-21 "지도 조절" 패널 철거에서 함께 제거된 force 슬라이더(repel/linkDistance/
collide)는 v2 캔버스 loop 가 소비하지 않던 죽은 UI 였다. 만약 소유자가 레이아웃
물리 튜닝을 **실기능**으로 원하면, `useTopologyLoop` 의 ForceAtlas2 파라미터에 실제로
배선된 컨트롤로 새로 설계한다(구 UI 복원이 아니라 소비처부터 연결). depth/hubsOnly/
search 필터도 같은 원칙 — loop 가 읽는 실경로가 먼저.

---

## ~~P2 — Phase 4 (비개발자 surface 다듬기)~~ — DROPPED (R12 #33)

PRODUCT-DIRECTION v3 에서 PM-primary 결정 reverted.
> Primary audience = developer + their AI agent. PM-친화 surface = bonus, not target.

T33-36 는 *if-bonus* 로 격하. 사용자 explicit 요청 들어오면 재평가.

---

## 추천 진행 순서

P1 V1.x 진화가 모두 ✅/N/A 로 닫혔고, 현재 surface 는 macOS app · CLI · MCP · Website 로 재정렬 중이다. Website 는 promo/download/read-only demo, 실제 local vault 작업은 app/CLI/MCP 에 둔다. 현재는 *signal-driven* — user 명시 product call 또는 사용자 보고 들어오는 것 위주.

1. **P0 잔여 (C3 user-trigger)** — 사용자 시간 날 때 `pnpm benchmark --bypass` 실행
2. **T37** — 인프라 (Playwright MCP CI) — nightly QA 가치 검토
3. **V1.2 vault-adaptation** — frontmatter literal property (description / color / releasedAt) 빌더 인스펙터 직접 편집 — PR 진행 중이면 closure
4. **사용자 product call** — 비개발자 surface (R12 dropped) 재평가 / npm publish (cli · mcp) 등은 사용자 명시 트리거

## 참조 문서

- `docs/PRODUCT-DIRECTION.md` — mission v3 방향
- `docs/FEATURES.md` — 사용자가 *지금* 사용 가능한 기능 전수
- `docs/archive/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x 진화 spec (cloud 부분 N/A archive)
- `docs/CHANGELOG.md` — 시간순 사용자 가시 변화
- `mcp/README.md` — 현재 MCP 도구 surface와 등록 계약
- `docs/benchmark/` — AI agent quality 측정 매트릭스


## ~~계약 테스트 사전 부패 4건~~ — ✅ 해소 (2026-07-21, PR #457)

check-package-contracts 55/55 green. natural-exit regex 는 return 형태만
고정, naming 계약은 rail-rollout 현행 표면으로 갱신, verify census
트랜스크립트는 105 노드 실측 재생성, P6 가 깨뜨린 mcp/README add_relation
why 문서도 원위치. 같은 PR 에서 desktop verify 의 Sigma/Relief 사전 부패도
v2 캔버스 계약으로 복구 (#458, 설치 앱 proof green).

## 잔여 게이트 (다음 라운드)

- **P3c 호버 마이크로카드** — P3b 엣지 팝오버 사용 검증 후에만 (게이트 유지).
- **부트스트랩 다중 createDoc 리로드 합치기** — 도메인 파일화(D)로 도메인당
  1회 리로드가 생겼다. 체감 문제 보고 시 batch write + 단일 refresh 로.
