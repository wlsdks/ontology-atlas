# DECISIONS — 카운슬 결정 원장

> 이 파일은 **결정과 그때 진 반대 의견**을 남긴다. `docs/CHANGELOG.md` 는 *무엇이
> 언제 바뀌었나*를 답하고, 이 파일은 ***왜 그렇게 정했고, 무엇을 걸었나***를 답한다.
>
> 최신이 위. 기록은 **덧붙이기만 한다** — 지난 기록을 고치지 않는다. 판단이
> 바뀌었으면 새 기록을 쓰고 옛 기록을 `뒤집힘` 으로 표시한다. 틀린 기록도 자산이다.

## 이 원장의 계약 (읽지 않으면 존재 이유가 없다)

1. **소집 전에 읽는다.** 카운슬을 열기 전(그리고 단독 PO 패스를 쓰기 전) 같은
   표면 · 같은 질문에 대한 **선행 결정이 있는지 먼저 본다.** 있으면 새 패스는
   그것을 ① 여전히 유효하다고 인용하거나 ② 명시적으로 뒤집는다. 조용히 다시
   결정하는 것이 이 원장이 막으려는 일이다.
2. **반증 조건은 살아 있다.** 각 기록의 `반증 조건` 은 "이 반대가 옳았다면 무엇이
   관측될 것인가"다. **그 관측이 실제로 나타나면 진 쪽이 이긴 것이고**, 재검토를
   연다. 반대 의견을 적어만 두고 안 읽으면 그건 체크리스트지 카운슬이 아니다.
3. **재검토 트리거는 기한이 아니라 조건이다.** `재검토` 칸에 날짜를 쓸 수도 있지만,
   더 나은 것은 **관측 가능한 조건**이다("첫 10명이 설치한 뒤", "npm 다운로드가
   100 넘으면").
4. **뒤집기는 기록한다.** 소유자가 카운슬 권고를 뒤집으면 그것도 기록이다 —
   조용히 흡수하지 않는다. 뒤집힌 권고가 나중에 옳았던 것으로 판명되는 것이 이
   원장에서 가장 값진 데이터다.

## 기록 형식

```md
## YYYY-MM-DD — <결정 한 줄>

**소집**: <카운슬/자리 — 또는 "단독 패스"> · **트리거**: <왜 소집했나>
**루브릭**: N/24 (치명적 0: 없음/<행>)
**결정**: <제안 중 하나, 또는 그보다 작은 것>
**적용 규칙**: <최소 슬라이스 / 헌장 우선 / 합집합 금지 / 제거 요구>
**서명**: <accountable — 사람 이름>

**기록된 반대**: <가장 강한 패배 논점, 누구 것인지>
**반증 조건**: <이 반대가 옳았다면 무엇이 관측되겠는가>
**재검토**: <관측 가능한 조건 또는 날짜>

**상태**: 유효 / 뒤집힘(→ 링크) / 반증됨(관측: …)
```

---

## 2026-08-04 — import 후보의 첫 출력은 180개 목록이 아니라 승인 가능한 관계 질문 한 건이다

### 먼저 — 세 줄

- **정한 것**: 기존 `infer_imports`가 정확한 근거를 가진 관계 후보 한 건과 다음 읽기만
  돌려주고, 사람의 명시적 승인 뒤에만 이유가 붙은 화살표를 기록한다.
- **네 말과 다르게 한 것**: 새 MCP 도구·승인 UI·관계 단위 source receipt는 한 번에
  만들지 않는다. 먼저 현재 도구로 질문부터 저장·지도 검증까지 한 번 완주한다.
- **네가 할 일**: 없음 — 구현과 임시 볼트 검증 뒤 실제 dogfood 후보는 근거와 이유를
  따로 보여 주고 승인받는다.

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 독립 출력을 공유하지 않는 파동으로 실행했다. ·
**트리거**: 공개 MCP 응답 계약 변경 + 소유자의 직접 요청(*“import를 읽어서 이 둘
의존 관계 맞죠? 하고 물어보고, OK 하면 지도에 화살표를 그린다. 자동으로 안 쓴다”*). ·
**루브릭**: 24/24 (Problem insight 4 · User moment 4 · Differentiation 4 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음).

**선행 결정 관계**: 바로 아래 「import는 의존성의 증거이지 스스로 승인되는 온톨로지
관계가 아니다」와 「영향의 첫 답은 숫자가 아니라 근거 자격이다」는 모두 유효하다.
이번 기록은 자동 승격 금지를 뒤집지 않고, 그 결정 뒤에 남은
`후보 → 두 개념 읽기 → 의미 이유 → 사람 승인 → 한 건 쓰기` 단절만 닫는다.

**결정 (accountable: stark)**: 기존 33개 도구를 유지한다. `infer_imports`에 호환 가능한
compact review mode와 stateless cursor를 추가하고, 그 모드는
`nextRelationReview:v1` 한 건만 반환한다. packet은 summary count, stable review id,
`from`/`to`, import count, 최대 5개의 정확한 file receipt,
`rationale_review_required`, `writeAllowed:false`, literal
`get_concepts({slugs:[from,to],body:"full"})`와 schema-only `relation_check` 읽기,
중단 조건을 포함한다. 정렬은 결정적 검토 순서일 뿐 의미 확률이나 confidence가 아니다.
승인 전 `proposedAction`·write args·자동 rationale은 절대 내지 않는다.
이 계약은 packet 안에서만 유효한 척하지 않는다. 후속 `relation_check`도 신규
`depends_on`에는 `proposedAction:null`과 `approvalGate.writeAllowed:false`를 내어
schema compatibility가 의미 승인으로 둘어쓰이지 않게 한다.

에이전트는 두 개념과 exact source direction을 읽고 “A의 어떤 관찰 가능한 능력이 B
없이는 성립하지 않는가”를 설명할 수 있을 때만 `(from,to,type,why)`가 명시된 질문 한
건을 사람에게 묻는다. 명시적 yes 뒤에만 기존 `add_relation` 한 건을 실행한다. 새
`depends_on` write는 nonblank `why` 없이는 실패 닫되, 기존 rationale 없는 관계는
삭제하지 않고 계속 `review_required`로 읽는다. CLI도 승인 전 후보를
`depends_on` 화살표로 부르지 않고 import/code-use 근거로 표시하며 batch land 암시를
제거한다.

**적용 규칙**: IN — compact mode + cursor, 한 후보 5 KiB 이하, exact receipt와 두 read
handoff, stop condition, 신규 dependency의 rationale write gate, CLI 미승인 표기 교정,
source stdio와 앱 번들 stdio의 동일 계약. OUT — 새 MCP tool/route/panel, 내부 vault-only
에이전트의 repo scan, MCP Elicitation, LLM ranking/종합 confidence, 자동 endpoint/rationale/
write, batch 승인, 거절 영속 로그, 관계 단위 source receipt, impact의 `sourceBacked`
승격. appetite는 구현 0.5일 + 검증 0.5일, 총 1일이다. 검증만 0.5일을 넘기면 구현을
넓히지 않고 `Shape a slice`로 되돌린다.

**검증 계약**: source와 bundled stdio가 fixture repo에서 5 KiB 이하 한 후보와 cursor를
동일하게 반환하고 승인 전 파일 변경 0건이어야 한다. `get_concepts` + `relation_check`
뒤 사람이 승인한 fixture에서만 한 relation을 쓰고, 같은 Markdown write에
`dependencies`와 `relation_notes`가 남아야 한다. 이후 validate/compile/impact가
`declared_with_rationale`를 보고하고, 같은 임시 vault를 연 설치 앱에 새 화살표가 보여야
한다. 실제 dogfood vault에는 소유자의 관계별 승인 전 아무것도 쓰지 않는다.

**기록된 반대**: 현재 server instructions와 후보별 `review.next`만으로도 유능한 FDE는
두 호출 안에 같은 질문을 만들 수 있다. compact cursor는 흔한 review queue이며 승인·
거절의 장기 연속성도 해결하지 못하므로 공개 schema 유지비만 늘릴 수 있다.
**반증 조건**: 서로 다른 세 실제 repo의 fresh Atlas-only FDE 중 두 회 이상이 현 계약
그대로 10초·두 호출 안에 방향·파일 근거·의미 이유를 갖춘 질문을 만들거나, 새 packet
뒤에도 두 회 이상 full 응답을 다시 요구하거나, 두 fresh trial에서 재탐색이 줄지 않고
승인된 `why` 관계가 한 건도 늘지 않으면 반대가 옳다. 그때 queue 투자를 멈추고 CLI
표기만 남긴다. 반대로 승인 뒤 후보·근거·why 연속성이 두 경로 이상에서 끊길 때만
client capability가 있는 MCP Elicitation을 재검토한다.
**재검토**: source stdio·설치 앱 bundle·서로 다른 외부 field trial 중 위 관측이 생길 때.

**상태**: 유효

## 2026-08-04 — 영향의 첫 답은 숫자가 아니라 근거 자격이다

**소집**: 기존 PO 카운슬 결정의 두 번째 실행 단위 + chief 디자인 방향 4안 비교 ·
**트리거**: 같은 154개 관계가 MCP에서는 구조 152개까지 영향으로 합쳐지고 앱에서는
확정 랭킹으로 보이던 교차 표면 불일치.
**선행 결정 관계**: 바로 아래 「import는 의존성의 증거이지 스스로 승인되는 온톨로지
관계가 아니다」의 둘째 PR 계약을 실행한다.
**결정**: MCP/CLI/UI 모두 `depends_on` 전용으로 통일한다. `impact`/`blast_radius`에
구조 타입을 넣는 것은 거부하고 구조는 `reachability`/`subgraph`로 보낸다.
컴파일된 dependency edge에는 `relation_notes`의 rationale을 보존한다. 영향 응답은
선언/이유/검토필요/source-backed 수와 `unknown` completeness를 함께 반환하며,
관계 단위 source receipt가 없는 현재 risk는 `unknown`이다. UI는 새 탭을 만들지 않는
「상태 우선 카드」를 택해 같은 자리에 판정 가능 여부를 먼저 놓는다.
**서명**: stark (소유자)

**기록된 반대**: 확정 랭킹을 약화하면 초기 제품이 덜 유능해 보이고 사용자가 구조
탐색으로 되돌아가 같은 질문을 반복할 수 있다.
**반증 조건**: 세 번의 서로 다른 실사용에서 unknown 다음 행동을 찾지 못하거나,
구조 링크를 열어 인과 답으로 반복 사용하면 별도 비인과 보조 섹션을 검토한다.
구조를 risk 산식에 다시 합치지는 않는다.
**재검토**: dogfood + Rust + Python source-hidden field trial 재실행 뒤.

**상태**: 유효

## 2026-08-04 — import는 의존성의 증거이지 스스로 승인되는 온톨로지 관계가 아니다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드 + chief 판정 · **트리거**: dogfood 154개 관계 중 152개가
containment이고 실제 `depends_on`은 2개뿐인데, `blast_radius`가 구조 경로까지
영향으로 합쳐 확실한 답처럼 반환했다. Rust/Python source-hidden field trial도 같은
질문에서 source-backed impact를 만들지 못했다.
**루브릭**: 23/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음)
**선행 결정 관계**: 2026-08-03 「typed CQ가 불완전한 프로젝트 의미를 완성으로
오인하지 않는다」와 2026-07-30 Python/Rust field-trial 기록의 `unknown` 원칙을
유지한다. import가 구현 근거일 뿐 자동 의미 관계가 아니라는 기존 계약도 유지하고,
그와 모순되던 CLI 자동 적용 경로를 제거한다.
**결정**: 두 PR을 순서대로 낸다. 첫째, `infer_imports`의 module edge마다 최대 5개의
정확한 파일 근거를 붙이고 `rationale_review_required`로 반환한다. `proposedAction`,
`infer-imports --apply`, bootstrap/index의 import endpoint 및 `depends_on` 자동 쓰기를
차단한다. 둘째, MCP·CLI·앱의 impact/blast 의미를 통일해 containment를 영향·위험에서
제외하고 구조 탐색은 reachability/subgraph로 보낸다. 선언된 dependency는 보이되
source receipt·방향·이유·사람 승인이 모두 없으면 source-backed completeness와 risk는
`unknown`이다.
**적용 규칙**: frontmatter `depends_on`은 인간이 승인한 선언으로 존중한다. `why`가
없으면 숨기지 않고 `reviewRequired`, 있으면 `declaredWithRationale`다. 둘 다 현재
source receipt가 없는 한 `sourceBacked`라고 부르지 않는다. import 후보를 쓰려면
양쪽 개념, 정확한 방향, 근거 파일, 의미적 이유를 검토하고 사람에게 묻고 한 건씩
`why`와 함께 기록한다. Sourcegraph가 compiler-accurate navigation을 코드 사실의
영역으로, GitHub가 manifest/lockfile 기반 dependency graph를 명시적 근거 계약으로
구분하는 것과 같은 경계다. 추가 속성을 가진 관계는 W3C PROV-O의 qualified
relationship 원칙처럼 선언과 근거 상태를 분리한다.
**서명**: stark (소유자)

**기록된 반대**: 구조 edge를 impact에서 모두 빼고 근거가 부족한 결과를 unknown으로
두면 초기에 recall과 즉시 유용성이 떨어져, 사용자가 “아무 답도 못 한다”고 느낄 수
있다(po-leverage).
**반증 조건**: 사람이 승인한 실제 영향 관계가 반복해서 unknown에 갇히거나, 세 번의
서로 다른 field trial에서 structural-only 경로가 유일한 유용한 인과 witness였음이
관측되면 구조 신호를 별도의 비인과 보조 섹션으로 재도입한다. 영향·위험 판정에는
합치지 않는다.
**재검토**: dogfood + Rust + Python source-hidden trial에서 같은 질문을 재실행한 뒤.

**상태**: 유효

원칙 근거: [Sourcegraph code navigation](https://sourcegraph.com/docs/code-navigation) ·
[GitHub dependency graph](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-graph) ·
[W3C PROV-O qualified relationships](https://www.w3.org/TR/prov-o/)

## 2026-08-04 — 의미 수리의 첫 읽기는 파생 지시가 아니라 실행 가능한 20개 단위 호출이다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드 · **트리거**: source-hidden FDE dogfood가 선행 결정의
`project_and_all_review_targets`를 실제 27개 slug로 복원했지만, 공개
`get_concepts(body:"full")` 상한 20 때문에 제공된 첫 호출이 실행 불가능했다.
**루브릭**: 23/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음)
**선행 결정 관계**: 2026-08-03 「의미 수리는 더 긴 인수인계가 아니라 첫 행동에
걸린 증거 분리 패킷이다」의 반증 조건이 실제로 관측됐다. 분류·사람 승인·근거 분리
원칙은 유지하되, 4 KiB 상한과 실행 전에 slug를 스스로 materialize하라는 부분만
명시적으로 뒤집는다.
**결정**: `meaningRepair:v1.workflow[0]`은
`[projectSlug, ...sorted(domainSlugs), ...sorted(capabilitySlugs)]`의 정확한 중복 제거
합집합을 만들고, 공개 도구 상한과 같은 최대 20개씩 잘라 literal
`get_concepts({slugs:[...], body:"full"})` 호출로 제공한다. 현재 dogfood의 27개
대상은 20+7 두 호출이다. `derivation`은 감사 가능한 산출 규칙으로 step에 남지만
실행 인자 자리는 차지하지 않는다. `witnessCapabilities`는 도메인 판단의 typed
evidence이므로 줄이지 않는다.
**적용 규칙**: 새 MCP tool·tool signature·vault schema·UI·workflow executor는 만들지
않는다. CLI result contract와 설치 MCP verifier가 정확한 합집합, 순서, 중복·누락
없음, 호출별 1..20개, `body:"full"`, private coordinate 부재를 실패 닫힘으로 검증한다.
패킷 상한은 5 KiB로 한 번만 올리고 실제 byte 수를 gate로 둔다. 사람의 의미 승인,
충돌 방지 write, validate/compile/finalize 순서는 바꾸지 않는다.
**서명**: stark (소유자)

**기록된 반대**: concrete slug를 응답에 담는 방식은 vault가 커질수록 배치 수와
payload가 함께 커진다. 5 KiB를 넘거나 첫 읽기 배치가 계속 늘어나면 materialized
workflow 자체가 확장 한계이며, 그때 typed evidence를 삭제하거나 상한을 다시 올리는
것은 문제를 숨길 뿐이다.
**반증 조건**: 정상적인 단일 프로젝트 수리 패킷이 5 KiB를 넘거나, 첫 읽기가 3개
이상 배치가 되어 FDE의 첫 결정 비용을 다시 키우거나, literal 호출을 그대로 실행한
source-hidden FDE가 누락·중복·도구 거부를 관측하면 반대가 옳다. 그때 pagination 또는
별도 bounded review-read 계약을 새 PO 결정으로 설계한다.
**재검토**: 위 세 조건 중 하나를 dogfood·설치 앱 번들·외부 field trial에서 관측할 때.

**상태**: 유효

## 2026-08-03 — 의미 수리는 더 긴 인수인계가 아니라 첫 행동에 걸린 증거 분리 패킷이다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드 · **트리거**: 설치 앱의 fresh MCP `agent_brief`가 source
`verified_current/current`와 competency `partial`을 함께 알고도 top-level
`nextActions`를 비워 두어, FDE가 이미 계산된 graph/source 근거를 다시 탐색해야 했다.
**루브릭**: 23/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음)
**선행 결정 관계**: 같은 날 「CQ quantifier integrity」와 「fresh MCP source
currentness」 결정은 모두 유효하고 반증 조건도 관측되지 않았다. 이번 결정은 그 두
판정이 정확히 만든 `partial`을 사람이 승인 가능한 다음 행동으로 잇되, 선행 결정의
Goodhart 경고대로 containment나 path 존재를 의미 완성으로 승격하지 않는다.
**결정**: 기존 `agent_brief`의 `nextActions[0]`에 `review_competency_repair`를 두고,
그 행동이 compact `meaningRepair:v1` 읽기 전용 패킷을 가리킨다. 패킷은 현재 선언,
typed containment가 만든 **structural review candidate**, current source receipt가 만든
**source-path candidate**, 아직 미해결인 대상을 서로 다른 집합으로 보고한다. 현재
dogfood에서는 abilities가 선언 1/6 · 추가 구조 후보 5 · 구조 미해결 0이고, evidence가
선언 2/20 · 추가 source-path 후보 9 · 미해결 9다. 후보는 사람이 의미를 승인하기 전
`answered`가 아니며, canonical path 존재도 body의 행동 주장을 자동 증명하지 않는다.
**적용 규칙**: 1 working day 상한의 최소 슬라이스. 기존 project scope/docs/compiled
edges/source receipt/inventory만 투영하고 새 I/O·MCP tool·CLI·UI·vault schema·자동
write/finalize·system prompt 전면 개편은 만들지 않는다. 응답 증가분은 4 KiB 이하이고
private root/raw source inventory는 내보내지 않는다. 첫 행동 뒤에는 기존
`get_concepts/get_concept → 명시적 사람 승인 → patch_concept(expected_mtime) →
validate_vault → compile_ontology → 재읽기 → finalize_project_meaning` 순서와 source
non-current, hash/fingerprint 변화, limited/truncated, validation/compile 오류, 충돌,
미해결 evidence를 answered로 올리려는 시도를 stop condition으로 준다.
**서명**: stark (소유자)

**기록된 반대**: 설치 MCP 응답은 이미 약 75 KiB이고 handoff prompt만 약 22 KiB다.
상세 repair 목록을 더하면 실제 첫 행동이 다시 묻히며, counts + unresolved slugs만 든
얇은 action으로도 같은 결정을 만들 수 있다면 별도 패킷은 과잉이다.
**반증 조건**: fresh source-hidden FDE가 패킷만 받고도 5회 이하 추가 조회·2분 이내에
6/6을 구조 검토 후보로만, 11/20을 current source-path 후보로만, evidence 9건을
미해결로 복원하지 못하거나 후보를 자동 승인하거나, 패킷 증가분이 4 KiB를 넘거나,
첫 행동보다 generic health/readiness를 따라 멈추면 반대가 옳다. 그때 packet detail을
count/slugs-only action으로 줄이고, 그래도 attention이 실패하면 aggregate readiness를
별도 결정으로 재검토한다.
**재검토**: source stdio·설치 앱 번들·fresh source-hidden dogfood 중 하나가 위
반증을 관측할 때.

**상태**: 유효

**구현·실측 결과**: 실제 dogfood 패킷은 3,533 bytes이고 private source coordinate는
0건이었다. 분류는 abilities 선언 1 · 후보 5 · 미해결 0, evidence 선언 2 · 후보 9 ·
미해결 9로 재현됐다. 최초 source-hidden FDE는 candidate-only 읽기 목록이 기존 선언·
미해결·domain 입력을 빠뜨린다고 거부했다. 이를 중복 slug 나열 대신
`project_and_all_review_targets` 결정적 인자 파생으로 고친 뒤, 두 번째 fresh FDE가
project 1 + domain 6 + capability 20 = 27개 대상을 정확히 복원하고 사람 판단까지
1회 read로 도달했으며 자동 승인·사전 쓰기 0건으로 승인했다. 잘못된 파생 토큰,
action 후순위, path-only 증거 승격, private root 누출은 각각 gate probe에서 RED였다.
소스 MCP 33/33, 내부 curator 26/26, 최신 `/Applications/Ontology Atlas.app`의 WebView
실행과 내장 stdio MCP가 같은 첫 행동·counts·3,533-byte 계약을 통과했다.

## 2026-08-03 — 새 MCP 인수인계가 사람의 소스 연결을 스스로 재검증한다

**소집**: 단독 PO 패스 · **트리거**: 설치 앱에서 source를 연결·재측정한 뒤 실제
stdio MCP로 `finalize_project_meaning`하고 새 프로세스의 `agent_brief`를 읽은 결과,
저장 영수증은 `verified_current`인데 현재성은 항상 `unavailable`이라 다음 행동
`verify_source_currentness`를 에이전트가 실행할 수 없었다.
**루브릭**: 24/24 (Problem insight 4 · User moment 4 · Differentiation 4 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음)
**선행 결정 관계**: 2026-08-02 「source receipt read-back은 현재 graph/source
inventory와 재비교」 결정은 유효하다. 이번 기록은 source 재비교가 앱 프로세스에만
있어서 fresh handoff가 끝나지 못한 반증을 관측하고 그 미완성 경로를 닫는다.
**결정**: 사람이 설치 앱에서 명시적으로 연결한 private root에 한해 새 MCP 프로세스도
앱과 동일한 bounded inventory fingerprint를 로컬에서 재현한다. kind·source ID·revision·
fingerprint가 모두 영수증과 같을 때만 `current`, 하나라도 다르면 `review_required /
source_changed`다. 권한·파일시스템·Git 실패는 영수증을 지우거나 current로 추정하지 않고
`unavailable`로 실패 닫는다. private root와 raw inventory는 MCP 응답에 절대 내보내지
않는다. 공개 도구·vault schema·UI는 추가하지 않는다.
**적용 규칙**: 기존 receipt reader 완성만 하는 최소 슬라이스. TDD로 matching Git,
changed Git, changed folder, private-root 비노출을 고정하고, gate-probe로 재검증과 stale
분기를 각각 제거했을 때 RED인지 확인한다. 설치 앱이 만든 실제 receipt와 Node probe의
fingerprint byte parity를 확인한 뒤 fresh stdio MCP 인수인계로 재현한다.
**서명**: stark (소유자)

**기록된 반대**: MCP가 private source를 다시 읽기 시작하면 큰 저장소에서 매 인수인계의
I/O 비용이 커지고, 앱만 소스를 읽는 기존 privacy 경계가 흐려질 수 있다.
**반증 조건**: bounded probe가 일반 저장소에서 handoff를 눈에 띄게 지연시키거나, 응답·
로그·오류 중 하나에 absolute root/raw inventory가 노출되거나, 앱과 MCP fingerprint가
같은 파일 상태에서 달라지면 반대가 옳다. 그때 자동 재검증을 철회하고 별도 명시적
local verification action 또는 공유 native probe로 바꾼다.
**재검토**: 실제 외부 저장소 field trial에서 위 관측이 생길 때.
## 2026-08-04 — 값 층 라운드 3: 남은 77을 전수 분류하니 «단일 구멍»이 아니라 «겹친 구멍»이었다 — 축 0개, 방언 판정 1건(404 표준 버튼), 회수 5

**소집**: 디자인 카운슬 「체계」석 단독 (소집 사유: `control-class.ts`·`app/globals.css` 램프 목록 소집 규칙 — 단, 이번 라운드는 그 파일들을 **안 고쳤다**. 고치지 않은 것 자체가 판정이다) · **트리거**: 컨트롤 래칫 113 정체. 값-층-밖 3부류(git 크롬 15 · shared/ui 10 · 공방 절대배치 11 = 36, 병렬 등재 진행)를 뺀 **77의 전수 분류** 지시
**결정**:
① **전수 분류가 본체다.** 77을 자리별로 갈랐다(부류표 전문은 PR 본문, 요약은 래칫 머리말 108 행): 값-층-밖 재판정 25(크롬 토큰 계약 10 · 스크림/전면 오버레이 5 · 설정 시트 계약 문자열 고정 4 · 오류/404 표준 버튼 자리 6) + 값 층 구멍 52. 핵심 관측은 구멍의 **동시성**이다 — 52 중 대부분이 2개 이상의 구멍(예: 「panel 인디고」+「인셋·타입 결합」, 「모노 방언」+「보더 없는 pill」)에 동시에 걸려, 어떤 단일 축을 신설해도 그 축 «혼자» 여는 자리가 0~1이다. 소비처 0~1 축은 만들지 않는다(fixedHeight 를 죽인 기준). **그래서 이 라운드는 축·모양·톤·토큰을 하나도 만들지 않았다.**
② **404 두 파일(로케일+루트)의 세 출구는 방언이었다.** 구조가 정확히 표준 버튼 3변형(채움/윤곽/고스트)인데 rounded-full·text-body·opacity-호버로 재작성돼 있었고, 주 CTA 잉크가 채운 인디고 위 `--color-text-primary`(실측 합성 **4.42:1, AA 미달** — `button.tsx` 머리말이 이미 측정해 둔 그 값)였다. 관문(DownloadPage)·업데이트 토스트가 이미 `<Button>` 소비처이므로 규격은 Button 쪽이다. 4개 `<button>` 을 `<Button primary/ghost>` 로, 가운데 `<Link>` 를 `buttonVariants({variant:'outline'})` 로 채택. 픽셀 전수는 PR 표(반경 9999→12 · 타입 12.5→14 · 잉크 #f7f8f8→#fff = 4.42→4.70 AA 통과 · px 16→18 · 호버 opacity→표면).
③ **바이트-온리 둘**: 트레일 「모두 지우기」 → `segment`/md(클래스 대조 픽셀 0), reach 스텝 칩 `rounded-[4px]`+eslint-disable → `rounded-micro`(disable 사유가 `--radius-micro` 등재로 소멸).
④ **다음 라운드 입력으로 등재(안 만든 것도 결론이다)**: 값-층-밖 25는 래칫 머리말 등재 확장 후보로 병렬 PR 뒤에 잇고, 겹친 구멍 52의 부류·전수(panel 보더/인디고 6 · 다행/그리드 10 · 모노 대문자 마이크로 CTA 5 · 인셋 바닥/비대칭 5 · 타입 상속 5 · 40px/틴트 채움 계열 3 · 단발 모양 13+)는 PR 본문 표가 정본. 특히 「모노 대문자 마이크로 CTA」는 3라운드 연속이라 다음 판정 1순위이되, 축(voice)이 아니라 부품일 가능성부터 본다(규칙 1).
**적용 규칙**: 최소 슬라이스(픽셀이 움직인 곳은 404 두 파일뿐, 자리별 표 PR 본문) / 제거 요구 없음
**서명**: 체계석 (design-system) — 코드 적용 포함, 소유자 머지로 확정

**기록된 반대(자기 기각 포함)**: 「404 뒤로/홈 출구는 의도적으로 조용한(11px·3차 잉크) 위계였다 — Button ghost/outline 채택은 셋을 전부 510 무게·14px 로 올려 위계를 평평하게 만든다」. 기각 근거: Button 의 3변형은 위계를 잉크가 아니라 **표면 처리**(채움>윤곽>투명)로 나르는 것이 설계이고, 관문의 실소비처가 그 문법을 이미 증명한다. 잉크 위계를 지키자고 방언을 존치하면 AA 미달 잉크와 opacity 호버도 함께 존치된다.
**반증 조건**: ① 404 에서 「출구 셋이 다 똑같이 세 보인다/어디를 눌러야 할지 모르겠다」는 소유자·사용자 관측이 나오면 반대가 옳았던 것 — 그때는 ghost 를 `controlClass link`(label·3차 잉크·min-h-11)로 내리는 재판정을 연다. ② 다음 라운드 재전수에서 겹친 구멍이 풀리며(선행 축 하나가 열리며) 단일 축의 회수량이 5+ 로 올라서면 「축 0개」 판정을 그 축에 한해 뒤집는다.
**재검토**: 위 관측 발생 시, 또는 값-층-밖 등재 병렬 PR 머지 후 다음 라운드 소집 시.

**상태**: 유효

## 2026-08-03 — 죽은 프리미티브 둘을 지운다. `↗` 허용 열은 남기되, 게이트가 소비처 없이 서게 고친다

**소집**: 단독 패스(기계적 정리 + 게이트 구조 정정) · **트리거**: 소유자 지시 *"완벽하게 디자인 시스템화해줘 문제없게하고"* · 래칫 원장이 세 라운드 연속 「렌더되지 않는 죽은 프리미티브 4」를 이월
**결정**: `src/shared/ui/{link,chip}-list-editor.tsx` 와 각 단위 테스트를 **삭제**하고 `shared/ui/index.ts` 의 공개 export 둘을 지운다. 근거는 선례와 동일 — `Card`/`Badge`/`DetailCard` 셋이 프로덕션 소비처 0으로 삭제됐고(`control-class.ts` 머리말), 이 둘은 증상까지 같다(램프 밖 `rounded-2xl` 16px). 래칫 기준선 **123 → 119**, 정확히 그 4건이고 래칫이 스스로 잡았다.

**그런데 그냥 지우면 다른 게이트가 빨개졌다.** `link-list-editor` 는 이 저장소에서 `data-external-link-marker` 를 쓰는 **유일한 `.tsx`** 였고, `label-decoration.contract.test.ts` 의 한 줄(`expect(declared.length).toBeGreaterThan(0)`)이 그 사실에 기대고 있었다. 프로덕션에서 `target="_blank"` 를 쓰는 파일 13개 중 표식을 쓰는 것은 **0개** — 즉 **아무도 렌더하지 않는 컴포넌트가 규칙의 허용 조항을 떠받치고** 있었다.

두 갈래 중 **(b) 허용 열 유지 + 게이트 수정**을 골랐다. (a) 「아무도 안 쓰는 예외는 예외가 아니다 — `↗` 열을 없앤다」를 **기각한 이유 셋**: ① 죽은 것은 *컴포넌트*(유지비 있는 자산)였지 *규칙의 조항*(정규식 이스케이프 4줄)이 아니다 ② 라벨 **앞** `↗` 는 새 창으로 나가기 전 경고이고 **WCAG G201** 이 명시적으로 권하는 기법이다 — 죽은 코드 청소의 부산물로 접근성 조항을 영구 폐기하는 것은 슬라이스 밖의 결정이다 ③ 없애면 다음 사람이 옳은 것(외부 링크 경고)을 쓸 때 게이트가 그를 반려하고, **규칙을 고치기 가장 나쁜 순간에** 규칙을 고치게 된다.

**진단이 핵심이다 — 공회전 방지의 대상을 틀렸다.** 비어 있으면 안 되는 집합은 **「스캔한 파일」**(이미 `files.length > 100` 으로 잠겨 있다)이지 **「예외를 쓴 파일」**이 아니다. 소비처 0인 조건부 규칙은 고장난 게이트가 아니라 **첫 사례를 기다리는 규칙**이다. 그래서 판정을 `externalMarkerSitsOnExternalLink(source)` 한 함수로 뽑고, 스캔과 프로브가 **같은 함수**를 쓰게 했다. 프로브 3방향: 앱 내부 `<Link>` 에 표식 → 빨강 · `target="_blank"` 에 표식 → 통과 · 표식 없는 파일 → 대상 아님.

**적용 규칙**: 제거 요구 / 최소 슬라이스(허용 열의 *정책*은 손대지 않고 게이트의 *공회전 방지 대상*만 옮겼다 — 화면 픽셀 이동 0, i18n 키 0개 삭제)
**서명**: stark (소유자) — 소유자 지시로 실행, 머지로 확정

**기록된 반대**: 「아무도 안 쓰는 허용 열은 규격이 아니라 오정보다 — `design.md` 가 죽은 토큰 둘(`--pad-card`/`--pad-panel`)을 지울 때 쓴 바로 그 논거(*"아무도 안 쓰는 토큰은 규격이 아니라 오정보다"*)가 여기에도 걸린다. 조항을 없애면 게이트가 더 단순해지고 판정할 것도 하나 준다.」
**반증 조건**: ① `data-external-link-marker` 를 **우회 수단**으로 쓴 커밋이 한 건이라도 나오면(외부 링크가 아닌 자리에 붙이거나, 라벨 **뒤**에 두려고 붙이면) 허용 열의 비용이 이득을 넘긴 것이고 (a)로 간다 ② 반대로 2027-02-03 까지 프로덕션 소비처가 **여전히 0**이고 그동안 외부 링크 작업이 여러 번 있었는데 아무도 표식을 필요로 하지 않았다면, 그것도 조항이 죽었다는 관측이다.
**재검토**: 위 두 관측 중 하나가 발생했을 때. ②는 날짜가 아니라 「그 사이 외부 링크 표면이 실제로 추가됐는가」가 조건이다.

**상태**: 유효

## 2026-08-03 — 타일 치수는 하나다: `--docs-header-tile-size`(34) 삭제, 정사각 아이콘 타일은 전부 36

**소집**: 단독 패스 · **트리거**: 같은 역할(정사각 아이콘 타일)에 값 둘 — `/ko/docs` 헤더 34px vs `/ko/topology` 크롬 36px, 각각 coarse 승격 규칙까지 따로
**결정**: `--docs-header-tile-size` 를 **삭제**하고 `DocsHeaderTile` 이 `--chrome-tile-size`(36px)를 읽게 한다. coarse 승격 블록의 중복 선언도 함께 삭제 — 이제 상속된다.

**등재를 먼저 읽었다(지시대로), 그리고 등재가 34 를 정당화하지 않았다.** 사다리 표의 34 행은 *"크롬 잠금 — 그 표면이 소유한 치수다"* 로 **기록만** 하고 있었고, `docs/DECISIONS.md` 어디에도 34 를 고른 기록이 없다. 근거를 따라가면 `DocsHeaderTile` 주석 한 줄이 나온다: *"`ChromeTile` 은 `--chrome-tile-size`(**44px**)를 하드 고정해 헤더의 밀도 요구(34px)에 맞지 않는다."* — 그런데 크롬 타일은 **2026-07-23 에 36px 로 내려왔다**(소유자 3차 보고 *"딱봐도 크다"*, 같은 파일 `app/globals.css` 의 `44 → 36` 주석). **34 의 유일한 근거가 그날 사라졌고 아무도 34 를 다시 유도하지 않았다.** 34 는 설계값이 아니라 **44px 시대의 화석**이다.

**픽셀 실측 (1440×900, `/ko/docs?slug=capabilities/account-closure`)** — 자리별 before → after:

| 자리 | before | after | 비고 |
|---|---:|---:|---|
| 헤더 타일 「문서 목록 접기」 | 34×34 @ y=5 | 36×36 @ y=4 | 44px 밴드 안, 위아래 여백 5 → 4 |
| 헤더 타일 「검색 · 명령 · 태그 (⌘K)」 | 34×34 @ y=5 | 36×36 @ y=4 | 〃 |
| 헤더 타일 「문서함 점검 보기」 | 34×34 @ y=5 | 36×36 @ y=4 | 〃 |
| 헤더 밴드 높이 | 44 | 44 | **이동 0** — 타일이 밴드를 안 밀었다 |
| 왼쪽 그룹 컨테이너 | 34 | 36 | 타일이 최고 원소라 같이 2px |
| 오른쪽 그룹 컨테이너 | 38 | 38 | vault pill(38)이 최고 원소라 **이동 0** |
| vault pill 「샘플로컬」 | 38 | 38 | 이 변경 대상 아님 |
| vault 칩 「샘플문서 112개」 | 32 | 32 | 〃 |
| 반경(3 타일 전부) | 6px | 6px | `--chrome-radius-inner` 그대로 |
| coarse 포인터 승격 | max(34, 44) = 44 | max(36, 44) = 44 | **값 동일**, 규칙만 둘 → 하나 |

곁가지 실측 하나를 남긴다(이 PR 범위 밖): 오른쪽 그룹의 vault pill 이 **38px** 로, 높이 어휘(24·28·32·36·40·44) 밖이다. 즉 이 헤더는 이 변경 뒤에도 36/38/32 세 높이를 갖는다 — 다만 셋 중 둘이 어휘 안이 됐고(전에는 34/38/32 로 하나뿐), 38 은 다음 라운드의 입력이다.

**게이트를 함께 넣었다** — 34 가 태어난 날 아무 게이트도 안 울렸기 때문이다. `tests/contract/control-height-ladder-scope.contract.test.ts` 가 `app/globals.css` 의 **모든** `--*-tile-size`/`--*-tile-height` 선언의 기본 px 를 높이 어휘와 대조한다(`max()`·`calc(× 스케일)` 형태는 기본 px 를 꺼내 판정, 폭 토큰은 대상 아님). 프로브 5방향 전부 확인.

**적용 규칙**: 제거 요구(새 토큰 0개 — 남은 하나는 이미 있던 것) / 헌장 우선(「스케일 고정 계약」의 36px 이 워크벤치 크롬 치수의 단일 출처)
**서명**: stark (소유자) — 소유자 지시로 실행, 머지로 확정

**기록된 반의견**: 「문서함 헤더는 지도 크롬보다 **밀도가 중요한 표면**이다(문서 목록·탭·pill 이 한 밴드에 몰린다). 2px 은 작아 보이지만 밴드가 44px 이라 여백이 5 → 4 로 20% 준다. 두 값이 맞다면 그것을 등재하면 되지, 수렴이 항상 옳은 것은 아니다.」 — 기각 근거: 밴드 높이가 안 움직였고(실측), 오른쪽 그룹은 이미 38px 원소를 갖고 있어 36 이 그 그룹의 최고 원소도 아니다. 그리고 34 를 등재하려면 **34 를 유도한 근거**가 필요한데, 있는 것은 44px 시대의 문장뿐이다.
**반증 조건**: 문서함 헤더가 좁은 폭에서 **두 줄로 접히는** 자리가 관측되면(현재 `flex-wrap` 이라 가능하다) 2px 이 원인일 수 있고, 그때는 값이 아니라 그 밴드의 폭 예산을 먼저 본다 — 그래도 안 되면 34 의 재등재가 아니라 **밴드 자체의 규격**을 다시 짠다. 또는 소유자가 실물에서 *"문서함 헤더가 커졌다"* 를 지적하면 그것이 관측이다.
## 2026-08-03 — 「규격을 바꾸려면 「체계」를 부른다」에 게이트를 단다: 판정은 파일 이름이 아니라 규격 센서스

**소집**: 단독 패스 (규칙 감사 후속 — 소유자 지시 *"완벽하게 디자인 시스템화해줘 문제없게하고"*) · **트리거**: 규칙 감사 실측 — `.claude/rules/design.md` 의 규칙 3(규격 변경 시 「체계」 소집)이 **강제 없는 문서 규칙**이었고, 값 층 램프를 넓힌 최근 커밋 5건 중 자기 원장 기록이 있는 것은 1건뿐이었다. `pnpm decisions:check` 는 라우트 신설/제거와 MCP/CLI 공개 계약만 봐서 디자인 규격은 통과했다.
**결정**: `decisions:check` 에 **세 번째 트리거 「규격 변경」**을 더한다. 단 판정은 «트리거 파일이 diff 에 있는가» 가 아니라 **규격 센서스의 차이**로 한다 — cva 축·선택지·기본값, 램프 토큰(타입·행간·반경·그림자·컨트롤 높이·팔레트 뿌리)의 이름과 값, export 되는 프리미티브 이름, `design.md` 「스케일 고정 계약」 절의 수치·토큰. 클래스 문자열·주석·공백·선언 순서는 세지 않는다. 트리거 파일 목록은 `.claude/rules/design.md` 한 곳에만 두고 게이트가 **거기서 읽는다**(코드에 복제본 0). 구현 `scripts/lib/design-spec-census.mjs` · 계약 `tests/contract/design-spec-ledger.contract.test.ts`.
**적용 규칙**: 룰을 켜기 전에 전수 측정 / 합집합 금지(색 전체가 아니라 팔레트 뿌리만) / 제거 요구 없음
**서명**: 소유자 (지시 이행, 머지로 확정)

**소급 실측 (켜기 전 전수)**: 최근 300 커밋(first-parent) 중 트리거 파일을 만진 것 **79**. 그중 규격이 실제로 움직인 것 **16**(오탐 억제 63건 = 80%). 16 중 원장 동반 6 · 미동반 10. 최근 100 커밋으로 좁히면 만진 것 23 · 걸리는 것 9 · 원장 없는 것 **6** — 한 PR 로 감당 가능한 규모다. (이미 머지된 과거 커밋은 소급 대상이 아니다; 게이트는 merge-base 이후만 본다.)

**기록된 반대**: 「`--color-*` 전체를 램프로 봐야 한다 — 색은 design.md 가 명시한 램프 다섯 중 하나다」. 기각 근거: globals.css 의 `--color-*` 는 200개가 넘고 대부분이 **한 표면 전용 알파 사다리**라, 전수를 세면 색 하나 조정마다 원장을 요구하게 되고 그건 이 저장소가 `shadow-[` 통째 금지에서 이미 겪은 소음 실패(lint 144 → 548)로 곧장 간다. 색 헌장은 이미 `forbidden.md` + `accentTintPairingSelectors` lint + `contrast-ratchet` 이 지키고 있고, 여기서 세는 것은 **hue 를 정의하는 뿌리**(바탕 3 · 글자 4 · 인디고 3 · 신호 4)로 좁혔다.
**반증 조건**: 새 hue 나 새 알파 계열이 **뿌리 토큰을 건드리지 않고** 표면 전용 토큰만으로 들어와 헌장을 우회하는 사례가 관측되면 — 그때는 색 센서스를 계열(prefix) 단위 «집합의 증감»으로 넓힌다(값 변경은 여전히 제외). 반대로, 이 게이트가 켜진 뒤 원장에 «오탐이라 한 줄 남김» 기록이 반복해서 쌓이면 좁힘이 부족한 것이므로 센서스를 더 좁힌다.
## 2026-08-03 — 값 층의 반복 구멍 셋을 메운다: 마이크로 티어(반경 `micro` + 칩 `xs`) · 기본 보더 다수 정합 · `tone: 'success'` 글자 역할 재지정

**소집**: 디자인 카운슬 「체계」석 단독 (소집 사유: `control-class.ts` · `app/globals.css` 램프 — 목록 소집 규칙) · **트리거**: 컨트롤 정규화가 123에서 멈췄고, 래칫 원장이 「자리가 없어서」를 부류·전수로 누적 보고 + 규칙 감사(PR #890)가 게이트 부재를 실측
**결정**: 셋 다 새 축이 아니라 **원장이 반복해서 센 값**의 등재·정정이다.
① **`--radius-micro`(4px)** — 램프가 3단이던 동안 4px 반경이 96곳(`rounded-sm` 59 + 무접미 `rounded` 37) 살아 있었다. 96번 반복되는 값은 명시 예외가 아니라 빠진 스텝이다. 전량 기계 치환(픽셀 이동 0) 후 eslint 셀렉터(`rounded-sm`·무접미 `rounded`)를 켰다 — 켤 때 위반 0, lint 총계 96→93. 등록 세트: globals.css + `cn.ts` `RADIUS_RAMP_STEPS`(tailwind-merge radius 그룹) + 계약 `RADIUS_STEPS`.
② **칩 `size: 'xs'`** — 「sm 아래 한 칸이 없다」가 원장에 세 라운드 연속(전수 14 · 9파일). 값은 실측 최빈: `min-h-6`(24 바닥 유지 — WCAG 2.5.8 아래 단은 만들지 않는다) · `px-1.5 py-0.5` · caption · 반경 micro. **칩 밖 모양의 `xs` 는 `sm` 별칭**(소비처 0 값 발명 금지 — 계약이 별칭을 단언). `segment/sm` 은 소비처 0인 채 한 라운드를 돈 값(px-2/caption)이라 실측 최빈(px-1 py-0.5/label)으로 재정의.
③ **칩·필 기본 보더 divider(0.08)→border-soft(0.06)** — 칩 반경 원소의 손 보더 전수 74:18 로 램프 기본이 소수파였고, 정규화 때마다 보더가 조용히 진해졌다(원장 「잔여 라운드」 구멍 2). ④ **`tone: 'success'` → `--color-success-text-a94`** — 신호색이던 동안 소비처 0(#884 기준). danger 와 역할 정합. 이주 6곳(래칫 123→117), 게이트: 계약 신설 5종 + named-off-ramp per-family 래칫(규칙 감사의 「게이트 거짓말」 정정 — eslint 주석도 정직하게 갱신). 프로브 전부 빨강 확인.
**적용 규칙**: 최소 슬라이스(96건 치환은 바이트-온리·픽셀 0 / 픽셀이 움직인 곳은 이주 6곳뿐, 자리별 표는 PR 본문) / 제거 요구 없음
**서명**: 체계석 (design-system) — 코드 적용 포함, 소유자 머지로 확정

**기록된 반대(체계석 자기 기각 포함)**:
- 「마이크로 태그를 위해 `xs` 대신 chip/sm 인셋을 내리자」 — 기각: sm 은 실소비처가 있는 단이라 내리면 그 전부가 움직인다. 소비처 0 단(segment/sm)만 재정의했다.
- 「`rounded-sm` 96곳을 자리마다 6px(chip)로 승격하자」 — 기각: 표본 검수 결과 4px 는 드리프트가 아니라 마이크로 스케일의 정체성이었다(reach 스텝 칩의 eslint-disable 사유가 그 증언). 값을 먼저 이름 있게 만들고(identical-first), 자리별 승격은 후속 판정으로.
- 「`--docs-header-tile-size`(34)를 36으로 수렴하자」(소집문 B3) — **보류**: `DocsHeaderTile` 주석이 34px 를 문서화된 밀도 처방(design-prescription ③-2)으로 인용한다. 선행 처방을 읽지 않고 수렴하면 조용한 뒤집기다 — 그 처방 원문 확인과 함께 별도 판정.
**반증 조건**: ① 마이크로 태그가 24px 로 서며 자기 줄(팝오버 밀도)을 깨는 관측이 나오면 xs 의 바닥이 아니라 그 자리의 행간 예산을 본다 — 24 바닥 자체는 WCAG 이라 무죄다. ② `rounded-micro` 등재 후에도 4px 신규 유입이 eslint-disable 로 반복되면 micro 가 스텝이 아니라 «예외의 이름»이 된 것 — 그때는 소비처를 chip 으로 승격하고 micro 를 지우는 재판정. ③ chip/pill 보더 0.06 이 「경계가 안 보인다」로 보고되면 다수(74)가 아니라 맥락(어두운 팝오버 위)이 규격이었다는 뜻 — scope 축처럼 바탕별 보더 판정을 연다.
**재검토**: 위 관측 발생 시. 기한 없음.

**상태**: 유효

## 2026-08-03 — 높이 사다리 2차 정정: 복원은 칩·필에서 멈춰 있었다 — 가로 모양 전 조합에 명시 플로어

**소집**: 디자인 카운슬 「체계」석 단독 (소집 사유: `control-class.ts` 크기 축 — 목록 소집 규칙) · **트리거**: 잔여 정규화 전수가 「#884(높이 사다리 복원)가 절반만 닿았다」를 보고
**결정**: 모양 6×크기 3 전수(소비처 210 호출, 정적 해석 잔여 0) 결과 — 소집문이 지목한 두 결함은 결함이 아니었고(칩·필 `md`=`lg`=32 는 같은 날 소유자 확정 + 3곳 등재 유효 · 소비처 26곳, 칩 40px 단은 수요 0), 진짜 미달은 다른 네 조합이었다: segment/sm **22px**(WCAG 2.5.8 바닥 미달 · 소비처 0) · row/lg **42px**(어휘 밖 · 소비처 0) · card/sm **30px**(어휘 밖 · 15곳) · card/md **34px**(크롬 잠금 단 우연 점유 · 5곳). 처방: 가로 한 줄 모양(chip·pill·segment·row·card) **전 조합에 명시 `min-h-*` 플로어** — 위 넷만 24/44/32/36 으로 올라서고(카드 사다리 32/36/40, +4 등차) 나머지 조합은 플로어=자연높이라 픽셀 이동 0. 새 토큰 0개(모든 플로어가 기존 토큰 파싱값). 게이트를 조합별 단언에서 **부류 게이트**로 승격: 전 조합 명시 높이 + 토큰 파생 어휘(24·28·32·36·40·44) 멤버십 + `min-h-[...]` arbitrary 차단. 프로브 3방향(플로어 삭제 · 어휘 밖 스텝 · arbitrary 우회) 모두 빨강 확인.
**적용 규칙**: 최소 슬라이스(움직인 픽셀은 한 줄짜리 card 15곳 +2px 뿐(card/sm 10곳 30→32 · card/md 5곳 34→36; 나머지 card/sm 5곳은 자체 min-h-11/14 또는 자연 34 로 이동 0) — 자리별 전수 표는 PR 본문) / 제거 요구(소비처 0 단 둘은 삭제 대신 사다리 정렬 — cva 크기 축은 모양 간 공유 타입이라 한 모양만 단을 빼면 22px 무단 출력이 남는다)
**서명**: 체계석 (design-system) — 코드 적용 포함, 소유자 머지로 확정

**기록된 반대**: 「chip/pill 은 크기 축이 세 단인데 높이는 두 종 — 축이 이름값을 못 한다. 사다리(28/32/40)에 맞춰야 한다」(소집문). 기각 근거: ① `lg`=32 는 2026-08-03 소유자 확정으로 원장·정본 표·소스 주석에 이미 등재 ② `lg` 는 글자(label→body)와 인셋을 키우는 실재하는 단(소비처 26곳) ③ 3토큰(28/32/40)은 사다리의 부분집합이지 사다리 전체가 아니다 — 정본 어휘는 24·28·32·36·40·44 7단(34 는 크롬 잠금).
**반증 조건**: chip/pill `lg` 소비처에서 「md 와 구분이 안 된다」는 소유자/사용자 관측이 나오거나, 32 초과 높이의 칩 수요(새 소비처)가 실제로 등장하면 — 그때는 `lg` 를 40 으로 올리는 재판정을 연다. 반대로, 이번에 세운 플로어 탓에 한 줄 card 가 두 줄로 접히는 회귀가 관측되면 플로어 값이 아니라 그 자리의 폭 예산을 본다(`min-h` 는 자라게만 두므로 사다리 자체는 무죄다).
**재검토**: 위 관측 발생 시. 기한 없음.

**상태**: 유효

## 2026-08-03 — 온톨로지 구축의 첫 최고수준 기준은 「더 긴 프롬프트」가 아니라 CQ의 `each`를 거짓 통과시키지 않는 자격 판정이다

### 먼저 — 세 줄

- **정한 것**: 자기 볼트에서 이미 재현된 의미 자격의 거짓 통과부터 닫고, 같은 실패를 MCP·내부 에이전트·새 인수인계 과정에서 다시 시험한다.
- **네 말과 다르게 한 것**: 시스템 프롬프트 전면 재작성과 MCP 도구 증설은 먼저 하지 않는다 — 현재 실패는 도구 부족이 아니라 기존 판정기가 불완전한 근거를 완전 답변으로 서명하는 데서 재현됐다.
- **네가 할 일**: 없음 — 소유자가 장기 목표와 첫 슬라이스를 승인했다.

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 3인→2인 두 파동을 사용했고 2라운드 전까지
다른 자리의 출력을 공유하지 않았다. · **트리거**: 제품 방향 + 온톨로지/MCP/내부
에이전트 구축 계약 + 소유자 직접 요청 (*"dogfooding하면서 이 아틀라스의 온톨로지
구축 실력을 최고수준급으로"*, *"시스템 프롬프트 수준이 엄청나야 ... MCP도구는
최고수준"*).
**루브릭**: 22/24 (Problem insight 4 · User moment 4 · Differentiation 4 ·
Ontology value 4 · Agent value 4 · Verification 2, 치명적 0: 없음).

**선행 결정 관계**: 2026-07-31 「팬아웃 상한이 아니라 노드 자격 게이트」와
2026-08-02 「typed competency witness + visible gap」·「source-hidden field trial」은
모두 유효하다. 이번 기록은 그 계약을 넓히기 전에, 기존 competency evaluator가 질문의
범위를 실제로 지키는지 dogfood한 결과다. 고정 노드 수·kind별 상한·종합 confidence는
다시 만들지 않는다.

**결정적 실측**: `docs/ontology`는 71 nodes · 154 relations · source path 55/55 ·
validator issue 0이고 MCP stdio verifier도 33/33 도구를 통과한다. 동시에 explicit-project
`agent_brief`의 `meaningAssessment`는 source `not_measured`, 다섯 질문 `unassessed`,
전체 `invalid`다. 더 직접적인 결함은 project Markdown 안에 있다. `abilities`는
*"inside each domain"*을 묻지만 6개 domain 중 `agent-integration` 하나와 capability
2개만 witness로 두고 `answered`다. `evidence`는 *"for each ability"*를 묻지만 전체
20개 capability 중 같은 2개만 다루고 `answered`다. 현재 evaluator는 질문별 필요한
witness **종류의 배열이 비어 있지 않은지**만 검사한다(`length > 0`). 대상 집합의
의무 coverage는 검사하지 않는다. 구조 health는 맞지만 이를 의미 자격으로 읽으면
거짓 양성이다.

| PO | 1라운드 → 2라운드 | 소유 행/처방 |
|---|---|---|
| 근거 | Investigate → **Shape** | 재현된 1/6·2/20을 correctness defect로 수용; target/obligation RED 후 고정 dogfood |
| 결 | Investigate → **Shape** | 같은 fixture를 MCP proposal·내부 proposal/apply·fresh receipt에서 검사; appetite 2일 |
| 지킴이 | Shape → Investigate | 내부 prompt/tool 불일치와 semantic bypass 때문에 shared shadow proof를 구현 전 조건으로 둠 |
| 해자 | Investigate → **Shape** | `answered`만 quantifier 충족을 요구하고 partial/visible-gap은 보존; 새 도구·UI 없음 |
| 지렛대 | Investigate → **Shape** | 결의 2일 검증비를 상한으로 채택; 세 표면 중 하나라도 불일치하면 조사로 복귀 |

**갈린 지점**: 같은 구체적 false-green 앞에서 ① 먼저 evaluator를 고칠지 ② 내부
에이전트가 다른 도구·적용 경로를 쓰는 만큼 shared shadow proof부터 할지였다. 합집합을
만들지 않고 **자격 판정 한 조각**을 본체로 고르되, 동일 fixture의 세 경로 RED를
구현보다 먼저 두었다. 내부 에이전트는 계속 vault-only curator이고 MCP coding agent는
source-backed builder다. 두 표면에 같은 거대 프롬프트나 같은 도구 수를 강요하지 않는다;
공유하는 것은 결과 계약과 거짓 통과 금지다.

**결정 (accountable: stark)**: `Construction Qualification v2 — CQ
quantifier integrity`를 첫 슬라이스로 권고한다. 기존 다섯 CQ마다 질문이 지칭하는
`targetSet`과 `obligations`를 결정적으로 파생하고 `covered`·`uncovered`를 보고한다.
`answered`는 의무가 모두 해소됐을 때만 유지한다. 일부만 증명됐거나 정당한 미확인이
있으면 write 자체를 거짓으로 막지 않고 기존 `partial`/`visible-gap`과 typed witness를
보존한다. operability 33/33과 construction qualification은 별도 판정으로 남긴다.

**적용 규칙**: 최소 슬라이스 · 합집합 금지 · appetite 최대 2일. IN — 현재 dogfood의
1/6·2/20 RED, 순수 quantifier-aware evaluator, MCP proposal validation·내부 proposal/apply·
fresh-process receipt의 적용 가능한 동일 판정 fixture, current stdio MCP → vault-only audit →
source-hidden 재채점. OUT — 새 public MCP tool·kind·vault schema·UI, system prompt 전면
재작성, 범용 source index/AST, provider/model 행렬, RDF/OWL/SHACL 포맷 도입, 종합 점수.
반나절 안에 RED를 재현하지 못하거나 public schema 변경이 필요하거나 세 경로가 같은
판정을 낼 수 없거나 기존 Rust/Python path·claim 정확도가 한 건이라도 후퇴하거나 2일을
넘으면 구현을 멈추고 `Investigate first`로 복귀한다.

**기록된 반대**: 질문의 `each`를 현재 project containment 전체로 곧장 해석하면,
의도적으로 성장 중인 작은 온톨로지까지 형식적 완전성 게임으로 몰 수 있다. 모든
capability를 한 답에 열거하는 것이 실제 handoff utility보다 우선되는 Goodhart 규칙이
될 수 있다.
**반증 조건**: honest `partial`/`visible-gap` proposal이 write 불가로 바뀌거나, 기존
Python 11/12·Rust 16/16 claim/path 기준이 후퇴하거나, source-hidden 인수인계 질문의
정확도는 그대로인데 노드·witness 열거량만 증가하면 반대가 옳다. 그때 universal target
coverage를 철회하고 project-specific motivating scenario/CQ obligation으로 좁힌다.
**재검토**: 첫 구현 RED→GREEN과 같은 dogfood chain 재실행 직후.
**서명**: stark (소유자 — 최고 수준의 사용자 친화적 온톨로지 시스템을 장기 목표로
승인하고, 개방형 포맷을 유지한 채 쉬움·의미 정확도·누적 운용 품질로 FDE가 자발적으로
Atlas를 계속 선택하게 한다.)

**구현·재검토 결과**: 첫 슬라이스를 구현했다. proposal 판정과 fresh receipt 판정은
`abilities`의 project-scope domain 전부, `evidence`의 capability 전부를 결정적 target
set으로 만들고 strict subset을 `incomplete-competency-coverage`로 거절한다. 내부
vault-only curator는 competency 답을 읽고 gap을 밝힐 수 있지만 생성·수정은 tool
executor와 proposal applier 두 문에서 막고 source-backed MCP builder로 보낸다. 이
경계는 prompt 문구만의 약속이 아니다. 구현 전에는 proposal 2건·fresh receipt 1건·
내부 write/apply 2건이 모두 거짓 통과했고, 게이트를 잠시 제거한 프로브에서 같은 다섯
RED가 다시 났으며 복원 후 GREEN이었다. 실제 `contains` containment도 별도 제거
프로브로 RED를 확인했다. MCP 단위 회귀는 **539/539**, 실제 stdio verifier와 dogfood
verify는 **33/33**이다. 이 과정에서 Python import-boundary fixture의 capability에
canonical `path`가 없던 약한 증거가 새 게이트에 잡혔고, 증거를 바로잡은 뒤 기존
Python 테스트가 복구됐다.

현재 자기 볼트 재측정은 구조 health **71 nodes · 154/154 resolved edges · source path
55/55 · issue 0**을 유지하면서, 문제의 두 답을 정직하게 `partial`로 내린다.
`abilities`는 6개 target 중 1개 covered/5개 uncovered, `evidence`는 20개 중 2개
covered/18개 uncovered다. source를 보지 못하게 한 새 에이전트가 볼트만 27회 집중
조회해 여섯 고정 질문을 다시 답하는 데 약 500초가 걸렸고 결과는 **complete 3 ·
partial 3 · unanswered 0 (9/12)**였다. 6 domains와 20 capabilities는 모두 복원했지만,
20 capability 중 9개는 frontmatter canonical `path`가 없고, qualification chain에서
vault-agent/project-source-evidence를 잇는 typed dependency도 부족하다고 정확히
남겼다. source를 보지 않았으므로 body의 구현 주장을 코드 사실로 승격하지 않았다.

**첫 재검토 판정**: 기록된 반증은 관측되지 않았다. honest partial은 여전히 보존·쓰기
가능했고 Python 기준은 회복됐으며, 단순 witness 열거량만 늘린 것이 아니라 source-hidden
handoff가 남은 증거 경계를 구체적으로 분리했다. 다만 project source가 아직 unbound라
`agent_brief.meaningAssessment`가 `invalid`이고 다섯 CQ가 `unassessed`인 사실은 그대로다.
다음 슬라이스는 새 도구나 노드 수가 아니라, 9개 capability의 canonical evidence와
source binding/qualification을 사용자가 가장 짧은 동선으로 닫는 문제에서 다시 PO
패스를 시작한다.

**상태**: 유효

## 2026-08-03 — 「기본값은 패딩이 높이를 정한다」를 뒤집는다: 컨트롤 높이는 사다리가 정하고 `fixedHeight` 축은 없앤다

**소집**: 「체계」(design-system) 판정 + 소유자 확정 · **트리거**: `.claude/rules/design.md`
「규격을 바꾸려면 「체계」를 부른다」 목록에 `src/shared/ui/control-class.ts` 와
`app/globals.css` 의 램프가 둘 다 걸린다.
**서명**: stark (소유자)

**무엇을 뒤집었나** — 같은 날 오전에 선 두 가지를 **명시적으로** 뒤집는다:

1. `tests/contract/control-class.contract.test.ts` 의 단언 *"기본값은 패딩이 높이를
   정한다"*(`expect(controlClass({ shape: 'chip' })).not.toMatch(/\bh-\d/)`). 그
   근거는 *"칩 143개 중 명시 높이는 38개뿐이라 강제하면 70%의 키가 바뀐다"* 였다.
2. 같은 날 추가된 **`fixedHeight` 축**(그리고 그 3단 확장). 근거는 *"칩 램프가
   30/34 를 내는데 계약이 32 를 못박아 어느 조합으로도 2px 이 남는다"* 였다.

**왜** — 그 진단이 한 칸 얕았다. 이 앱에는 컨트롤 높이의 단일 진실원
`--control-h-{sm,md,lg}` = 28/32/40 이 **2026-07-25 부터 이미 있었는데**(소비처 7파일),
값 층을 지으면서 그것을 찾지 않고 패딩+행간+보더의 합을 램프라고 불렀다. 그 합이
낸 값이 칩 24/30/34 · 필 20/22/30 이고, **30 · 34 · 22 · 20 은 이 앱의 높이
어휘(24 · 28 · 32 · 36 · 40 · 44) 어디에도 없다.** 남은 2px 은 램프 값이 틀렸다는
**신호**였지 축이 필요하다는 신호가 아니었다 — 「체계」석 문장 그대로:

> *"그 축은 값이 틀렸다는 **증상**이지 필요한 축이 아니다 — 값을 고치면 축이 죽는다."*

화면에 나온 대가: 칩 크기를 50종에서 3종으로 줄였는데 **한 화면에 컨트롤 높이가
9종**(`/ko/docs` 11종 · `/ko/topology` 9종 · `/ko/projects` 6종, 합산 13종).

**결정** — 값을 고치고 축을 지운다.

- `chip`/`pill` 의 `md`·`lg` 가 `min-h-8`(= `--control-h-md`, 32px)에 선다. 하드
  `h-8` 이 아닌 이유는 하드 높이가 줄바꿈한 칩을 **잘라 내용을 숨기기** 때문이다.
- `sm` 은 24px(WCAG 2.5.8 최소 타깃)에 남는다. 필의 `sm` 은 실측 20px 이라 24로
  **올렸다** — 바닥 아래였다.
- `fixedHeight` 축과 그 12개 compound 를 삭제한다. 소비처 19곳 중 **18곳이 픽셀
  이동 0**, 1곳(`ShortcutSheet` 의 세그먼트 탭 28px)만 24로 내려간다.
- **새 토큰 0개.** 32 는 이미 있던 `--control-h-md` 다.
- `docs/DESIGN-SYSTEM.md` 에 「컨트롤 높이 사다리」 절을 신설한다(24·28·32·34·36·40·44).
  이 표가 없어서 30/34 가 태어났다.

**적용 규칙**: 헌장 우선(단일 진실원) · 제거 요구(축 하나를 없애지 않으면 값 수정만으로는
같은 일이 반복된다)

**기록된 반대** — *"칩 143개 중 명시 높이는 38개뿐이다. 높이를 강제하면 70%의 키가
바뀐다"*(값 층을 지은 쪽, 2026-08-03 오전). 이 반대는 **부분적으로 옳았고 실측으로
좁혀졌다**: 실제 이동은 칩 `md` +2px(24곳) · 칩 `lg` −2px(14곳) · 필 `lg` +2px(3곳)
으로 ±2px 안이지만, **필 `md` 는 +10px(3곳) · 필 `sm` 은 +4px(9곳)** 로 예상 밖이었다.
소유자가 근거로 삼은 「전 소비처 ±2px」는 칩 램프에서만 참이었고, 필 램프는 `py-0.5`
라서 다른 곳에 서 있었다. **숨기지 않고 PR 본문 표에 그대로 적는다.**

**반증 조건** — ① 32px 로 올라간 컨트롤이 **줄바꿈해서** 높이가 32를 넘는 자리가
관측되면(`min-h` 는 자라게 두므로 사다리가 깨지는 게 아니라 «칩이 두 줄이 됐다»가
관측된다) 그 자리는 `sm` 이거나 칩이 아니다. ② 필 `md` +10px 이 밀도 결함으로
보고되면(3곳: `DocsSidebarBody` · `SearchPalette` · `DocsQuickDrawer`) 필의 `md` 는
칩과 같은 단이 아니라는 뜻이고, 그때는 **축이 아니라 `pill` 의 크기 램프**를 다시
연다. ③ 이 정리 후에도 한 화면의 고유 컨트롤 높이가 8종 이상이면, 남은 원인은 값
층이 아니라 **크롬 토큰**(34/36/44/가변)이고 다음 라운드는 거기서 시작한다.

**아직 흡수 안 된 것 (규칙 4 — 세고 멈춘다)** — 그 축의 근거로 원장에 적혀 있던
33군데는 **오늘도 흡수되지 않았고, 그 축이 흡수한 적도 없다**:

| 근거로 적혔던 것 | 원장 수 | 오늘 실측 | 축이 실제로 받은 수 |
|---|---:|---|---:|
| 「28px 칩 스텝이 없다」 | 18 | `h-7`/`min-h-7` **14줄**. 그중 **8은 `h-7 w-7` 정사각**이라 칩이 아니라 `icon`/`md`(28px)가 이미 덮는다. 라벨을 가진 진짜 28px 칩은 **3**(`StudioCompass` · `DoNextTab` · `DownloadPage`), 나머지 3은 `<input>`·비-누름 배지 | **0** |
| 「크롬 토큰이 치수를 소유한다」 | 15 | 36/44/가변(`--git-row-h` · `--overlay-close-size` …). 사다리의 **다른 단**이지 칩 단이 아니다 | **0** (원장 자신이 「일부 메움 ◐」로 적었다) |

즉 `fixedHeight` 의 `sm` 단은 한 라운드를 다 돌고 소비처 **1개**, `lg` 단은 **0개**
였다. 축을 지워서 잃는 것은 그 1개뿐이고, 33군데는 축이 있었을 때도 밖에 있었다.
**남은 3(진짜 28px 칩)은 억지로 24/32 에 뭉개지 않는다** — 다음 판정의 입력으로
남긴다.

**재검토**: 위 반증 ②가 관측되거나, `/design-system-audit` 이 한 화면 고유 높이
8종 이상을 다시 보고할 때.

## 2026-08-03 — README는 실제 화면을 먼저 증명하고, 기술 계약은 짧은 경계와 권위 가이드로 나눈다

### 먼저 — 세 줄

- **정한 것**: 기존 설치 앱 Journey를 README의 주 증거로 보존하고, 첫 화면을
  `제품 약속 → macOS/Windows beta 선택 → 미서명 경고 → 실제 지도` 순서로 둔다.
- **네 말과 다르게 한 것**: 이미지는 더 만들지 않았다. 부족했던 것은 자산 수가
  아니라 기존 이미지 앞뒤의 정보 위계였고, 새 촬영보다 중복 산문을 덜어냈다.
- **네가 할 일**: 없음 — 공개 렌더와 릴리스 경로까지 검증했다.

**소집**: PO 카운슬 5석 전원 2라운드 · 디자인 방향 3안 · 디자인 카운슬 위계/체계
2라운드 · **트리거**: 낯선 사람이 처음 읽는 공개 문구와 README 시각 위계 변경 ·
**루브릭**: 20/24 (Problem insight 3 · User moment 4 · Differentiation 3 ·
Ontology value 3 · Agent value 4 · Verification 3, 치명적 0: 없음)

**선행 결정**: 2026-08-03 「README의 최근 변경 증명은 전체 설치 앱 프레임과 부모
맥락을 보존한다」, 2026-08-02 「README는 공개 품질 계약, 내부 문서는 규칙 권위
지도를 맡는다」, 2026-08-01 「Windows x64는 공개 미서명 베타」를 모두 유지한다.
이미지·품질 경계·경고를 걷지 않고, 그 사이에서 중복되던 구현 설명만 줄인다.

**방향**: A 현행 장문 · B 이미지 우선+단계적 공개 · C 사람/에이전트/기여자 분기 중
**B를 선택**했다. C의 persona 분기 카드는 섞지 않는다.

**결정**:

1. macOS와 `Windows x64 beta`를 첫 다운로드 행에 함께 두고, 버전 고정 EXE가 아닌
   현재 자산·서명 상태·경고를 소유하는 안정적인 다운로드 페이지로 보낸다.
2. Windows가 미서명이고 SmartScreen 경고와 관리형 PC 차단 가능성이 있다는 사실을
   CTA 바로 다음에 둔다. Status에서도 배포 계약으로 한 번 더 말한다.
3. 기존 Journey 이미지와 typed 캡션은 모두 보존한다. SDK 이행사, 긴 CLI 전사,
   관계표·라우트 목록·검증 런북은 MCP/CLI/relations/development guide로 넘긴다.
4. UID/slug/path, no graph cap, typed relations, local-first, app/web/MCP/CLI 경계,
   no npm과 source fallback은 README 본문에 남긴다.
5. 4열 비교표는 Journey와 agent workflow 뒤로 내린다. 다운로드만 굵은 첫 행,
   보조 탐색은 보통 굵기의 둘째 행으로 분리하며 새 스타일·토큰·자산은 만들지 않는다.

**검증**: README는 732줄·5,527단어에서 505줄·3,701단어로 줄었고 기존 공개 캡처
8장을 유지했다. GitHub 브랜치 렌더에서 390×844는 Windows 경고 y≈436–493,
지도 y≈512–715로 전체가 보였고, 1512×900은 경고 y≈376–388 뒤 지도가 y≈405부터
약 495px 보였다. 현재 prerelease의 Windows EXE·SHA256과 hosted download verifier,
문서 링크 및 focused docs/MCP 계약 검사를 확인한다.

**기록된 반대**: 기술 산문을 크게 덜면 Atlas가 typed ontology와 agent-native meaning
layer가 아니라 예쁜 그래프 앱처럼 보일 수 있다. 비교표를 뒤로 미루면 기술 평가자가
차별화 근거를 늦게 만난다는 비용도 있다.
**반증 조건**: fresh reader가 Journey 뒤에도 UID/slug/path의 역할, typed relation,
사람과 에이전트가 같은 로컬 폴더를 읽고 쓴다는 사실을 답하지 못하거나, Windows
경고가 다운로드보다 늦게 읽히면 반대가 옳다. 그때 장문을 복구하지 말고 해당 이미지
캡션 또는 핵심 계약에 빠진 typed fact 하나를 복원한다.
**재검토**: README 이미지가 현재 앱 동작과 어긋난 사례, Windows 경고 누락, 또는
fresh-context 오해가 한 건이라도 관측될 때.

**적용 규칙**: 최소 슬라이스 · 합집합 금지 · 제거 요구 · 안정 URL · 공개 경고
**서명**: accountable — owner (jinan)
**상태**: 유효

---

## 2026-08-03 — 같은 것을 여섯 이름으로 부르던 화면을 「폴더」 하나로 · 잠긴 기능을 고장으로 읽게 하던 신호를 연결 상태에 묶는다

**소집**: PO 카운슬 5석 전원 · **트리거 2건 동시** — ① 솔로 패스 **16/24**(통과선 18
미만) ② *낯선 사람이 처음 읽는 문구*. 소유자가 설치 앱을 쓰다 남긴 일곱 마디에서
출발했고, 그 마디를 **문제로 미리 번역하지 않고 원문 그대로** 다섯 자리에 넘겼다.

**선행 결정 점검** — 2026-08-02 「첫 실행 카드: 계기를 캡션으로 강등하고 리드를 주목
승자로」(PR #831, PO 5석, 13/24) **유효하며 뒤집지 않는다.** 이번 소집은 그 기록이
**명시적으로 미뤄 둔 자리**를 집는다: 그 슬라이스의 no-go 목록에 `dismiss/reopen
의미론`이 있었고, 워크스루 후속 ③이 *"탭으로 만든 상태에 탭 자신이 없다"* 로 이미
등재해 뒀다. 「결」이 그 슬라이스의 개선이 **아직 살아 있음**을 실측으로 재확인했다
(최대 활자 14px 리드 · 하단 꼬리 1.5% · 상태 신호 2).

**반증 조건 점검** — 과장하지 않는다. 반증 ②(근거, *신규 5인 중 2인 이상*)는 **관측
안 됨**(n=1, 소유자는 신규 방문자가 아니다). 반증 ①(지킴이, *정적 예시를 질의된
사실로 오해*)은 **인접 관측이나 적중은 아니다** — 소유자가 오해한 대상은 관계 캡션이
아니라 샘플 소스 탭이었다. 지킴이 본인이 그렇게 판정했고, *"같은 실패 계열의 두 번째
증거"* 로만 기록해 다음 재검토(1.0 안정판 컷) 때 두 사례를 함께 올리기로 했다.

| PO | 판정 (2R) | 소유 행 |
|---|---|---|
| 근거 | Shape a slice — 안건 5 보류 **철회**, 안건 1 **폐기** | Problem insight **3** · User moment **3** |
| 결 | Build and verify — 자기 처방 **철회**, 해자 안 채택 | Verification **4** |
| 지킴이 | Build and verify (어휘 3건) | Ontology value **3** · Agent value **2** |
| 해자 | Shape a slice — 병합 **철회** | Differentiation **2** |
| 지렛대 | Shape a slice — 5·6 no-go **철회** | appetite 반나절 → **1일** |

**루브릭 합계**: **17/24** (통과선 18 · 치명적 0: 없음). 18 미만이라는 사실이 소집을
정당화했고, 그래서 결정은 **뺄셈과 재배치**로 닫혔다 — 새 표면 0, 새 토큰 0.

**갈린 지점**: 두 AI 액션 타일이 **하나의 의도와 그 폴백**(해자)인가 **런타임이 다른
두 문**(지킴이)인가. 「결」이 **검증 가능성**으로 갈랐다 — 지킴이 주장은 아티팩트에서
확인된다(`onAskAgent` 는 `llmBridgeAvailable` 일 때만 주입되므로, 웹에서 병합하면
**에이전트 핸드오프가 0이 된다**). 해자 주장은 *누가 무엇을 더 쓰는지*에 대한 사용량
주장이고 관측이 0이라, 근거가 그은 경계의 바깥이다. **해자는 재진술 후 병합을
철회했다.** 다만 해자의 **자격 기준**은 묶는 규칙으로 살아남았다.

**실측 (「결」, 액션 영역 322px · gap 4px)**:

| 안 | 칸 폭 | 최장 라벨 |
|---|---|---|
| 현행 7칸 | 42.6px | **4줄** |
| 라벨만 축약 | 42.6px | 3줄 — 천장만 내려가고 **구조는 불변** |
| 상단 3칸 | **104px** | 2줄 (히트폭 2.4배) |
| 하단 2칸 | **159px** | 1줄 |

`items-stretch` 가 행 높이를 최댓값에 맞추므로 **주목 승자를 중요도가 아니라 글자 수가
정하고 있었다.** 그리고 이건 1회 관측이 아니다 — `TopologyV2DetailPanel.tsx:440-452`
주석이 **6칸 시점에 이 붕괴를 예견**했고, 그 예견을 읽을 수 있는 상태에서 7번째가
추가됐다(PR #862).

**적용한 규칙**
- **합집합 금지** — 다섯의 처방을 합치지 않았다. 채택된 것은 「결」의 실측을 뼈대로
  해자의 **자격 기준**만 얹은 것이고, 해자의 라벨 개명과 결의 라벨 축약은 **둘 다
  들어가지 않았다.** 어느 제안보다도 작다.
- **소유자 확정 3건이 appetite 를 갈랐다** — ① 어휘는 **폴더로 통일, 볼트 은퇴**
  ② 안건 6은 **부착이 보이는 생성**(좌표 모델 없음) ③ 「이어서 새로 만들기」는
  **도메인 노드만**. ②가 며칠짜리를 반나절로 만들었다(지렛대 재견적: 월드↔스크린
  변환 0 · 드래그 0 · 반응형 신규 0 · e2e 재작성 0).
- **원장 입장 하나가 뒤집혔다** — 2026-07-20 「첫 실행 대화상자는 "온톨로지"를 절대
  쓰지 않는다」를 소유자가 뒤집었다(*"온톨로지 시스템인데 그게 없으면 안 되지?"*).
  지킴이가 **이롭다고 판정하되 경계를 걸었다**: 그릇은 **폴더**, 그 안에서 Atlas 가
  만드는 것은 **온톨로지**. 둘을 같은 자리에서 교체 가능하게 섞으면 5중 혼란이 6중이
  된다. `.claude/rules/design.md` 의 어휘 규율을 이 경계로 개정한다.

**결정 (accountable: 소유자, 2026-08-03 서명)**

**IN** ① 어휘 스윕 — 「볼트」19 + 「마크다운 폴더」20 → **폴더**(ko·en 같은 커밋)
② 라틴 `markdown` 2건 정정 ③ 「지금은 샘플」 신호를 **카드 수명이 아니라 연결 상태
수명**에 묶기 ④ 액션 타일 **3층**(노드에 하는 일 3 · 지도를 바꾸는 일 2 · 에이전트 2)
+ `items-stretch`→`items-start` ⑤ 안건 6 환원형 — **1일차는 토스트 링크만**, 잔존
시에만 부착 표시 + 생성 후 포커스 ⑥ 안건 7 규칙 채택 → 「작업공간」 칩 제거

**OUT** 캔버스 좌표 배치 · 드롭 제스처 · 확대 전이 모션 · e2e testid 재작성 ·
`globals.css`/새 토큰 · **타일 제거** · **타일 병합** · 「문서함」 어휘 통일(다음 회차)

**appetite**: 1일

**채택한 규칙 (안건 7)**: **지도 위 칩은 지도를 바꿀 때만 그 자리에 설 자격이 있다.**
「문서함 빠른 보기」 칩은 드로어를 열 뿐 지도를 안 바꾸므로 LNB 의 것이다. 지렛대가
지적했듯 이건 **재발견**이다 — 2026-08-02 에 「변경점 N개」가 같은 이유로 이미
지워졌고, 규칙이 없어서 매번 한 개씩 손으로 발견하고 있었다.

**종결된 안건**: 「볼트를 한 번이라도 연결하면 이 패널이 안 뜨게」는 **이미 구현돼
있었다** — `use-first-run-sample-mode-settled.ts` 의 `neverConnected =
vault.recentVaults.length === 0`, PR #839(2026-08-02 17:18). 그 코드 주석이 소유자의
**당시 요청 원문을 이미 인용**하고 있다. 지렛대가 영수증으로 닫았고 근거가 「보류」를
**폐기**로 바꿨다. 코드 작업 0.

**기록된 반대 ①** (해자): *"두 타일이 「AI에게 —」라는 같은 접두어로 **목적지를
감춘다.** 「Claude Code 에 넘기기」/「여기서 물어보기」로 목적지를 이름에 넣어라."*
— 채택하지 않았다(3층 묶음이 이미 구분을 신호하고, 합집합 금지).
**반증 조건 ①**: 3층으로 나눈 뒤에도 사용자가 「복사」를 누르고 **어디로 갔는지 묻는**
장면이 나오면 해자가 옳다 — 그때 고칠 것은 배치가 아니라 **이름**이다.
**재검토**: 첫 외부 사용자 3인 관찰 시.

**기록된 반대 ②** (근거, 해자가 2R 에서 승복): *"모션이 문제였는지 위치가 문제였는지
아직 모른다. 해법이 먼저 도착했고 문제는 아직 없다."* — 해자가 *"내 환원은 관측이
아니라 추론이었고 나는 그것을 관측처럼 썼다"* 며 수용했고, **싼 시험을 슬라이스 밖이
아니라 앞에 넣는** 형태로 채택됐다.
**반증 조건 ②**: 1일차 토스트 링크(「지도에서 보기」)를 눌러 보고도 *"무엇에 붙었는지
모르겠다"* 가 나오면 부착 표시가 필요했던 것이고, 나오지 않으면 나머지 날은 반납한다.
**재검토**: 슬라이스 1일차 종료 시점.

**기록된 반대 ③** (해자, 선행 기록의 반대 ③을 **형태를 바꿔 다시 세움**): 원문
(*"굵은 리드를 유지하는 한 이 카드는 Obsidian 첫 실행의 재배치다"*)은 **해자 본인이
폐기했다** — *"반증 조건을 「펼침율·MCP 도달」로 걸었는데 이 제품은 신뢰 헌장상
텔레메트리가 0이다. **관측 채널이 없는 반증 조건은 반증 조건이 아니다.**"* 새 형태:
*"차별화는 첫 실행 카드의 첫 문장에서 이기고 지지 않는다. **지도가 타입 붙은 의미의
쓰기 표면이라는 사실**에서 이긴다."*
**반증 조건 ③**: 소유자 또는 첫 외부 사용자가 **카드의 문장을 인용하며** 불만을
말하는 장면이 나오면 해자가 틀렸고 리드 교체가 실제 안건이다.
**재검토**: 첫 외부 사용자 3인 관찰 시.

**경쟁 지형 (해자 실측)**: (a) 타입 스키마 + (b) 디스크 위 평문 마크다운 + (c) **쓰기
표면인 그래프 캔버스** 셋을 다 가진 출시품을 찾지 못했다. Obsidian 의 「그래프 뷰에서
노트 만들기」 요청은 **2020-08-09 등록, 6년째 미출시**이고 이유는 게으름이 아니라
**구조**다 — 무타입 위키링크에서 파생된 그래프라 생성 제스처를 열어도 **물어볼 필드가
없다.** Atlas 는 kind 4종과 나침반 4방위가 있어 질문이 성립한다. Basic Memory 는 GUI
가 없어 Obsidian 캔버스 파일을 만들어 남의 화면을 빌리고, Miro/tldraw 계열은 무타입이라
거기선 x/y 가 곧 데이터다(우리와 데이터 모델이 반대).

**다음 회차로 예약**: 「문서함」 어휘 통일 · 부착 표시 + 생성 후 포커스(반증 ② 결과에
따라) · 모션 라운드(그 뒤에도 잔존할 때만, `design-motion`+`design-workbench`+
`design-interaction` 소집) · 정적 매니페스트의 `createdBy` 부재(선홍 링이 샘플 모드에서
렌더 불가한 원인 — 지킴이가 온톨로지 부채로 등재).

**상태**: 유효

---

## 2026-08-03 — README의 최근 변경 증명은 전체 설치 앱 프레임과 부모 맥락을 보존한다

**소집**: 디자인 카운슬 — 위계 · 체계 · 도해 · 작업대, 독립 검토 뒤 최종 판정 ·
**트리거**: README에 설치 앱의 Recent 렌즈를 공개 증거로 추가하는 시각 변경

**Primary moment**: FDE가 노드를 하나씩 열기 전에 이번 주 무엇이 바뀌었고 어느
project/domain 맥락에 속하는지 판단한다.

**Attention stack**: base = 물러난 전체 graph · support = 부모 체인과 Recent/7d
controls · focus = 최근 노드의 cyan dashed ring과 INDEX 결과 · blocking = 없음 ·
utility = 설치 앱 chrome.

**결정**: 3248×2122 Retina PNG를 Journey 3의 선택 노드 설명과 Footprints 사이에
full-width로 둔다. 내부 graph/INDEX/app chrome을 자르거나 새 overlay·marketing
color·token을 만들지 않는다. 오래된 노드는 시각적으로 물러나게 두고, INDEX가
최근 노드와 project/domain 부모 체인을 함께 보존하는 장면을 사용한다. Recent는
local Markdown file mtime에서 파생되며, 화면의 `7`은 촬영용 storefront fixture
결과이지 graph·fan-out·제품 상한이 아니다. 캡션과 alt text가 이 사실을 명시한다.

**검증**: `/Applications/Ontology Atlas.app`에서 촬영 전용 로컬
`samples/storefront` 복사본을 열어 Recent 7d를 실동작시킨 뒤 native capture했다.
문서 링크 검사가 PNG 참조를 확인하고 GitHub 렌더에서 full-width 배치를 확인한다.

**기록된 반대**: 전체 프레임은 설치 앱과 작업대 맥락을 정직하게 보여주지만,
README 축소 배율에서는 recent ring이 작아져 복잡한 예쁜 graph로만 읽힐 수 있다.
그래서 내부 crop 대신 full-width 배치와 명시적 캡션으로 해결한다.
**반증 조건**: 독자가 `7`을 제품 상한으로 해석하거나 Recent가 무엇을 강조하는지
캡션 없이 식별하지 못하면 이 이미지와 설명은 실패한 것이다.
**재검토**: GitHub README 렌더에서 위 오해가 관측되거나 marker가 판독되지 않을 때.

**상태**: 유효

## 2026-08-02 — README는 공개 품질 계약, 내부 문서는 규칙 권위 지도를 맡는다

### 먼저 — 세 줄

- **정한 것**: README에는 변하지 않는 온톨로지 품질 약속만 짧게 공개하고,
  `docs/ONTOLOGY-QUALITY.md`는 규칙 사본이 아니라 코드·스킬·테스트의 권위 지도만
  맡는다.
- **다르게 한 것**: Python 분석의 현재 수치를 README에 복제하지 않는다. bounded
  evidence packet이 graph 상한이 아니라는 범주만 공개하고 정확한 값은 analyzer와
  MCP 계약이 소유한다.
- **네가 할 일**: 없음 — 계약 오류를 먼저 고친 뒤 전체 README 미디어 재촬영은
  별도 슬라이스에서 설치 앱으로 검증한다.

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 서로의 의견을 보지 않는 파동으로 실행했다. ·
**트리거**: 공개 README의 온톨로지 정책·형식·제품 표면 주장이 현행 writer와
surface 계약에 어긋났고, 소유자가 프로젝트 문서와 README에 기준을 남길지 물었다. ·
**루브릭**: 20/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 1, 치명적 0: 없음). Verification은
변경 전 실물이 없어서 1이며, 구현 뒤 GitHub 렌더·문서 gate·fresh-context 해석으로
증명한다.

## PO Council Verdict — public contract + authority map

| PO | 판정 | 소유 행 점수 |
|---|---|---|
| 근거 | Build and verify | Problem insight 4 · User moment 4 |
| 결 | Build and verify — correctness first | Verification 1 |
| 지킴이 | Shape a slice | Ontology value 4 · Agent value 4 |
| 해자 | Shape a slice | Differentiation 3 |
| 지렛대 | Build and verify | appetite: 최대 반나절 |

**선행 결정 관계**: 같은 날 「노드 총량에는 상한이 없고, 직접 연결 폭은 자격을
묻는 신호다」와 「UID는 영구 정체성, slug는 현재 주소」를 그대로 공개 계약에
올린다. Python 12/4/2는 그 결정이 이미 분리한 processing bound이므로 README에서
다시 숫자 규범처럼 강조하지 않는다.

**The decisive disagreement**: 새 품질 문서가 흩어진 정본을 찾게 하는가, 아니면
또 하나의 정본을 만드는가. 새 파일은 만든다. 단 각 규칙의 문구와 수치를 다시
소유하지 않고 `질문 → 분류 → canonical source/symbol → verification`만 연결한다.
사람용 설명은 기존 `docs/guide/what-becomes-a-node.md`, 형식은
`docs/ONTOLOGY-ATLAS-SPEC.md`, 값과 실행은 코드, 이유와 반증은 이 원장에 남는다.

**Decision (accountable: owner)**:

1. README는 no total cap, contextual fan-out, legitimate hub, earned bridge,
   packet bound≠graph bound, UID/slug/path, external-trial isolation만 요약한다.
2. README의 필수 UID 누락·raw `elements:` path·오래된 kind/count/release/surface
   주장과 깨진 브랜드 자산을 같은 correctness 슬라이스에서 고친다.
3. SPEC의 path-style element slug 허용과 guide의 raw path relation 예시를 현행
   flat role slug + `path:` evidence 계약으로 맞춘다.
4. raw HTML 문서 자산은 존재 여부를 기계가 판단할 수 있으므로 docs link gate에
   포함하고 실제 깨진 README로 red, 교정 후 green을 증명한다.
5. 전체 README IA·스크린샷·영상 재촬영은 이 슬라이스의 사실 계약을 먼저 합친 뒤
   설치 앱 Computer Use 증거로 별도 진행한다. 외부 trial 산출물은 반입하지 않는다.

**기록된 반대**: authority map도 손으로 쓴 파일이므로 다음 threshold/schema 변경 때
가장 먼저 낡고, README에서 현재 analyzer 수치를 숨기면 FDE가 boundedness를 감사하기
어렵다. **반증 조건**: 다음 기여자가 map만 보고 정확한 소유 파일·검증을 찾지 못하거나,
다음 analyzer 변경 뒤 map/README가 수동 값 사본 때문에 어긋나거나, fresh FDE가
processing bound를 graph cap으로 다시 해석하면 반대가 옳다. 그때 문구를 더 늘리지
말고 코드에서 생성한 current-limits reference로 옮기거나 authority map을 제거한다.

**상태**: 유효.

## 2026-08-02 — 노드 총량에는 상한이 없고, 직접 연결 폭은 자격을 묻는 신호다

**소집**: 소유자 직접 정정 · **트리거**: Python field trial의 “20개 이하” 표현이
프로젝트 전체 노드 상한처럼 읽혔다. 소유자의 원래 질문은 한 노드에 직접 연결된
이웃/자식의 폭이 대체로 10~20보다 작지 않겠느냐는 품질 질문이었다.

**결정**: vault 전체와 project 전체의 노드 수에는 상한이 없다. 노드 수는 관측값이지
목표·통과 조건이 아니다. `ontology-bootstrap`의 `20+ curated nodes`는 mature vault를
`ontology-sync`로 보내는 **workflow routing threshold**일 뿐 저장·표현 제한이 아니다.
Python 분석의 12개 자동 후보, 4개 exact 선택, 2개 risk 예약도 한 번의 evidence packet
폭을 제한할 뿐 graph 크기를 제한하지 않는다.

직접 fan-out은 2026-07-31 결정의 규격을 그대로 따른다. bootstrap 폴백
`domain→capability 6~10(중심 8)`, `capability→element 5~7(중심 6)`과 live p90은
hard cap이 아니라 review trigger다. 참조가 해소되고 역할이 배타적이며 provenance가
분명한 project/domain hub는 넓을 수 있다. Bridge는 숫자를 줄이기 위해 만들지 않고,
공유 행동을 한 문장으로 정의할 수 있고 다른 형제와 배타적이며 실제 자식을 재부모화할
때만 정당하다. 지도에서 12개 초과 자식을 접는 density gate는 label-collision을 다루는
렌더링 규칙으로, ontology 품질 규칙과 독립이다.

**기록된 반대**: 총량·직접 폭을 막지 않으면 에이전트가 다시 의미 없는 평면 목록을
늘릴 수 있다. **반증 조건**: 참조 해소·역할 배타성·provenance gate를 모두 통과한
실노드 부모가 20+ 직접 자식으로 자라고 사람과 에이전트 모두 그 목록을 다루지 못하는
사례가 관측되면 kind별 고정 상한이 아니라 degree 기반 review signal과 bridge 제안을
재검토한다.

**상태**: 유효 (소유자 정정).

---

## 2026-08-02 — Python source-hidden field trial이 고정 수용선을 통과한다

**소집**: field-trial 결과 기록 · **트리거**: 아래 두 Python 선택 규격의 고정
source-hidden 반증 시험 완료.

**결과**: 같은 MIT Python 저장소와 같은 여섯 질문, fresh `gpt-5.6-sol/high`
builder·handoff 조건에서 기준선 `P/P/U/U/P/P = 4/12`가 evaluator 기준
`A/A/A/A/A/P = 11/12`로 올랐다. handoff agent는 Q5를 `partial`로 표시했지만,
고정 anchor는 exact `udsoncan/client.py`와 supporting capability/dependency evidence가
있으면 `answered`다. source-hidden root에서 파일을 열 수 없다는 사실은 path drift가
아니므로 감점하지 않았다.

필수 플래그는 `exact_client_entrypoint=true`, `security_owner=true`,
`service_transport_boundary=true`, `source_backed_impact=false`다. Q6는
`udsoncan/services/SecurityAccess.py` owner와 같은 capability의 review candidates를
찾되 security-specific dependency edge가 없다고 정직하게 `partial`로 남겼다. 전체
인용 경로 12/12가 source checkout에 존재했고, mission·client/service/connection import,
Request/Response/BaseService class, SecurityAccess request/response 역할을 source로
대조했다. hallucinated path와 unsupported confident claim은 0이다.

Builder가 만든 의미 graph는 project 1·domain 1·capability 3·element 8이며, 이는
시험 결과의 관측값이지 제품 상한이나 권장 총량이 아니다. starter 5개를 포함한 trial
vault는 18개 노드였다. `finalize_project_meaning`은 `source_receipt_unavailable`로
receipt를 쓰지 못했고 `pattern_walk`는 schema의 `seed` 대신 runtime `slug`를 요구했다.
둘은 trial 성공에 숨겨 합치지 않고 후속 MCP operability 결함으로 남긴다.

**기록된 반대**: risk basename 휴리스틱은 이 저장소의 질문에 맞춘 과적합일 수 있다.
**반증 조건**: 서로 다른 외부 Python trial 두 곳에서 예약된 risk endpoint가 FDE의
변경·영향 질문과 무관하거나, 더 중요한 direct boundary를 밀어내 Q1·Q2·Q5가 후퇴하면
휴리스틱을 철회하고 source-symbol evidence row로 대체한다.

**상태**: 조건부 통과 — 한 저장소 수용선 통과, 외부 다양성 검증은 남음.

---

## 2026-08-02 — Python 위험 소유 경계는 12개 후보 안에서 최대 2자리를 예약한다

**소집**: 단독 패스 · **트리거**: 바로 아래 「모델이 최대 4개 선택」 규격을 적용한
두 번째 fresh builder도 `client.py`·`Request.py`·`Response.py`·`connections.py`를
선택했지만 긴 import payload 안의 `SecurityAccess.py`를 다시 놓쳤다. 모델에게 선택권만
주는 것으로는 짧은 evidence packet 밖의 risk owner를 안정적으로 회복하지 못한다는
반증이 관측됐다. · **루브릭**: 24/24 (치명적 0: 없음).

**결정**: 자동 element 후보 총상한은 12로 유지한다. 직접 module/package 경계를
기본으로 하되, 실제 static import endpoint 중 basename이 security, authentication,
authorization, permission, credential, policy, encryption 역할을 명시하는 exact file은
우선순위순 최대 2개 자리를 예약한다. 같은 flat slug가 여러 경로를 가리키면 제외하며,
후보 수가 늘어나는 만큼 낮은 direct boundary가 빠진다. 즉 12+2가 아니라 **12 안의 2**다.

이름 휴리스틱은 implementation element의 탐색 가시성에만 쓴다. domain/capability,
행동 계약, 영향 관계는 자동 생성하지 않는다. `ontology-bootstrap`은 노출된 risk endpoint를
선택하거나 빠뜨린 이유를 visible gap으로 남겨야 하며, exact `depends_on`은 여전히 관측한
file-edge 방향만 통과한다.

**기록된 반대**: 이름에 security가 들어간 파일이 반드시 핵심 위험 소유자는 아니며,
일반 라이브러리에서는 두 자리가 더 중요한 direct boundary를 밀어낼 수 있다.
**반증 조건**: fixed trial이 `security_owner`를 회복하지 못하거나, 서로 다른 외부 Python
trial 두 곳에서 예약된 risk endpoint가 FDE 질문과 무관하거나, 빠진 direct boundary 때문에
기존 Q1·Q2·Q5가 후퇴하면 이름 휴리스틱을 제거하고 별도 source-symbol evidence row로
대체한다.

**상태**: 재시험 대기.

---

## 2026-08-02 — 정확한 Python import endpoint는 모델이 최대 4개만 선택한다

**소집**: 단독 패스 · **트리거**: 바로 아래 결정의 field-trial 반증 조건이 실제로
발생했다. 첫 재시험은 source-hidden 점수가 4/12에서 7~8/12로 올랐고 정확한
`client.py` 시작점도 회복했지만, `services/`로 접힌 `SecurityAccess.py` 소유 경로를
답하지 못해 필수 `security_owner` gate를 실패했다. · **루브릭**: 24/24 (치명적 0:
없음). 새 MCP tool·입력 shape·vault schema는 추가하지 않는다.

**결정**: 자동 후보는 최대 12개 직접 module/package 경계로 유지한다. 대신 외부 LLM이
`infer_imports`에서 이미 관측한 정확한 file endpoint 가운데 실행 시작점, 외부/transport
경계, security/policy/risk 구현, 공유 request/response/schema처럼 서로 다른 탐색 질문을
답하는 파일을 **최대 4개**까지 complete proposal의 element로 선택할 수 있다. 네 칸을
채우는 것이 목표가 아니며, 의미가 겹치면 더 적게 고른다. Atlas validator는 선택 경로가
실제 import endpoint인지, 저장소 내부에 존재하는지, 상한을 넘지 않는지, 제안한
`depends_on` 방향이 exact file edge와 일치하는지를 write plan 전에 검사한다.

선택 endpoint는 여전히 구조 근거다. domain/capability나 행동 의미로 자동 승격하지 않고,
프론티어 모델은 경로가 증명하는 범위와 아직 source excerpt가 필요한 행동 주장을 구분한다.
따라서 전체 service family를 30개 노드로 복제하지 않으면서도 FDE에게 필요한 정확한
변경 시작점과 위험 경계를 보존한다.

**기록된 반대**: 모델에게 세부 파일 선택권을 열면 중요해 보이는 이름을 과대평가하거나
네 개를 의례적으로 채울 수 있다. **반증 조건**: 같은 fixed source-hidden trial에서
`security_owner`와 exact client entrypoint를 함께 회복하지 못하거나, 선택 endpoint 중
source-checkable 역할 주장이 하나라도 거짓이거나, 서로 다른 탐색 질문을 답하지 않는
endpoint가 네 자리를 의례적으로 채우면 이 선택 규격을 철회하고 source-symbol 의미
추출을 별도 evidence 계약으로 설계한다. 전체 vault/project 노드 수에는 상한이 없다.

**상태**: 재시험 대기.

---

## 2026-08-02 — Python impact 근거는 import 참여 경계만 element 후보로 올린다

**소집**: 단독 패스 · **트리거**: 앞선 Python 결정이 연 Slice 2의 source-hidden
impact 공백. 새 tool·입력 시그니처·vault schema는 만들지 않고 기존 공개 응답의
증거 연결을 완성한다. · **루브릭**: 24/24 (치명적 0: 없음).

**선행 결정 관계**: 바로 아래 「Python cold-start는 의미 ingress와 import impact를
두 계약으로 나눈다」는 유효하다. 그 기록의 반증 조건대로 Slice 1 뒤에도
source-hidden agent가 실제 import 없이는 request/response 소유와 service/transport
영향을 답하지 못했으므로 승인된 Slice 2의 남은 단절을 닫는다.

**결정**: `analyze_repo_structure`는 최상위 Python package 전체를 파일 노드로
복제하지 않는다. 대신 `infer_imports`가 관측한 module edge의 양 끝에 실제로 참여한
직접 module/package 경계만 degree와 import 수로 정렬해 최대 12개 element/path
후보로 노출한다. 사용되지 않은 파일은 제외하고, 여러 package가 같은 flat slug로
접히면 추측하지 않고 제외하며, 상한 밖 후보 수는 `skipped`에 남긴다.

Import endpoint는 domain/capability나 확정 관계가 아니다. 외부 LLM은 bounded
semantic evidence와 이 구현 근거를 함께 읽어 의미 후보를 만들고, 사람의 승인 전에는
아무것도 쓰지 않는다. 다만 admitted Python element 경로를 근거로 제안한
`depends_on`은 실제 관측된 import 방향과 일치해야 하며, 반대 방향이나 존재하지 않는
관계는 proposal validation에서 fail closed한다. package 내부 symlink 부모를 통한
repository escape도 source evidence로 인정하지 않는다.

**기록된 반대**: module import는 조건부 import·re-export·내부 구현 세부를 포함하므로
중요도가 높은 경계라고 해서 곧 안정적인 온톨로지 element는 아니다.
**반증 조건**: 같은 Python source-hidden field trial이 4/12 기준선에서 6/12 이상으로
오르지 않거나, 정확 경로·security owner·source-backed impact 중 필수 근거를 회복하지
못하면 이 선정 규칙은 가치가 증명되지 않은 것이다. 전체 vault/project 노드 수에는
상한이 없고, direct degree 품질은 별도 graph-quality 질문이다.

**상태**: 유효.

---

## 2026-08-02 — Python cold-start는 의미 ingress와 import impact를 두 계약으로 나눈다

### 먼저 — 세 줄

- **정한 것**: 먼저 실제 실패가 증명한 `README.rst`·정적 `setup.py`·최상위
  Python package만 기존 분석 packet에 넣고, 그 field trial이 남긴 impact 공백을
  근거로 `.py` import 계약을 별도 연다.
- **다르게 한 것**: 요청에 함께 있던 `README.adoc`·`pyproject.toml`·`.py` import를
  한 변경의 성공으로 묶지 않는다. 앞의 둘은 아직 실측되지 않았고, import는 의미
  근거 수집과 다른 정확도·축약 계약을 요구한다.
- **네가 할 일**: 없음 — 두 단계 모두 독립 RED와 source-hidden handoff로 판정한다.

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 서로의 의견을 보지 않는 파동으로 실행했다. ·
**트리거**: `index_project`·`analyze_repo_structure`·`infer_imports` 공개 응답의
의미 사정거리 변경, 그리고 2026-08-02 「Rust package 계약」의 비-Rust 재검토
조건 관측. · **루브릭**: 23/24 (Problem insight 4 · User moment 4 ·
Differentiation 3 · Ontology value 4 · Agent value 4 · Verification 4,
치명적 0: 없음).

**선행 결정 관계**: 2026-08-01 「도구의 시야가 곧 볼트의 사정거리」와
2026-08-02 「Rust package 계약은 bounded 근거 한 행」의 원칙은 유효하다. 후자의
재검토 조건인 “두 번째 비-Rust field trial에서 같은 citation 공백”은 관측됐다.
명확한 목적·예제·package 설명과 최상위 package가 있는 MIT Python 저장소에서
source MCP가 files 0 · semantic evidence 0을 반환했고, Atlas-only builder는 쓰기를
거부했다. 저장소 정보 부족이 아니라 입력 사정거리 결함이다.

## PO Council Verdict — bounded Python construction ingress

| PO | 판정 | 소유 행 점수 |
|---|---|---|
| 근거 | 두 단계 Build | Problem insight 4 · User moment 4 |
| 결 | 두 단계 Build | Verification 4 |
| 지킴이 | 두 단계 Build | Ontology value 4 · Agent value 4 |
| 해자 | Build and verify | Differentiation 3 |
| 지렛대 | 두 단계 Build | 1차 최대 6시간 · 2차 최대 4시간 |

**The decisive disagreement**: 251개 Python import가 모두 사라지는 것을 첫 변경에서
함께 고칠 것인가. 함께 고치지 않는다. 현재 write 거부의 직접 원인은 의미 문서·
package 계약·정본 package 경로가 packet 밖인 것이고, import graph는 file fact를
의미 `depends_on`으로 오해하지 않게 하는 별도 축약·정확도 계약이 필요하다. 먼저
ingress만 고친 독립 handoff가 impact를 여전히 못 답할 때 그 실패가 2차 RED다.

**Decision (accountable: owner)**:

1. **Slice 1 — 관측된 ingress**: root-contained·크기 제한 `README.rst`에서 제목과
   bounded semantic evidence를 추출한다. RST의 일반 문서 절은 domain/capability로
   자동 승격하지 않는다. root `setup.py`는 절대 실행·import하지 않고 `setup(...)`의
   허용된 정적 literal만 하나의 `package-contract` evidence row로 읽는다. 계산식·
   함수 호출·동적 값은 unknown으로 남긴다. 최상위 `__init__.py` package는 element와
   repo-relative canonical path 후보일 뿐 business capability가 아니다.
2. **Slice 1 OUT**: `README.adoc`, `pyproject.toml`, `.py` import, namespace package,
   workspace 재귀, 새 tool/kind/schema/인자, 문서 절의 의미 노드 자동 생성.
3. **Slice 1 proof**: 같은 유형의 fresh Atlas-only run이 5분 안에 비제로 mission·
   package/path evidence를 얻고, cited path 100% · unsupported claim 0 · 파일별 노드
   0을 지킨다. 기존 Markdown·Cargo·TS/JS 결과와 bundled MCP가 회귀하지 않는다.
4. **Slice 2 opening condition**: Slice 1 source-hidden handoff에서 impact가 유일한
   주요 공백으로 남고, 실제 정적 Python import가 그 질문의 witness임을 source로
   확인하면 `.py` internal import inference를 별도 최대 4시간으로 연다. file edge는
   관측 근거이며 domain/capability 또는 semantic `depends_on`으로 자동 승격하지 않는다.

**Recorded dissent**: ingress만 먼저 고치면 사용자가 요청한 code impact가 계속 비어
“Python 지원”이 반쪽짜리로 남는다. **falsifier**: Slice 1 뒤 write와 canonical path는
회복하지만 source-hidden agent가 정적 import 조사 없이는 impact 질문을 답하지 못하면
이 반대가 옳고 Slice 2를 즉시 연다. 반대로 의미 ingress만으로 질문이 해결되면 내장
Python source index는 Atlas의 해자가 아니라 불필요한 범위였다.

**상태**: 유효.

---

## 2026-08-02 — 필수 UID는 vault format v2이며 공식 migration 경로가 함께 간다

### 먼저 — 세 줄

- **정한 것**: 모든 `kind:` 노드의 필수 UID는 additive v1 확장이 아니라 명시적인
  vault format v2 breaking 계약이다.
- **다르게 한 것**: first-party 일회 스크립트만 남기지 않고 canonical
  `pnpm vault:migrate` inventory·dry-run·dirty guard에 UID 변환을 등록한다.
- **네가 할 일**: UID 없는 vault가 있다면 먼저 dry-run 결과를 보고 `--write`한다.

**선행 결정 관계**: 바로 아래 「UID는 노드의 영구 정체성」 결정을 폐기하지 않고,
그 결정이 빠뜨린 배포·호환성 경계를 닫는다. `docs/ONTOLOGY-ATLAS-SPEC.md`의 v1
additive-only 정책을 조용히 어기는 대신 문서 자체를 v2.0-rc로 올린다.

**Decision (accountable: owner)**:

1. 공식 ID는 `2026-08-02-add-node-uids`다. `--list`에 나타나고 dry-run이 기본이며
   `--write`만 기록한다.
2. write 전에 vault 전체 primary/merged UID claim을 검증하고, malformed·duplicate면
   첫 바이트를 쓰기 전에 실패한다. git vault의 commit 안 된 Markdown은 기존 dirty
   guard가 막고 `--force`만 의식적으로 우회한다.
3. 기존 `scripts/migrate-node-uids.mjs`는 first-party 호환 wrapper로만 남고 같은
   migration 구현에 위임한다.
4. 스타터와 공개 가이드의 완전한 frontmatter 예시는 v2 규격을 따라야 한다. 새 노드는
   파일 복사보다 Studio·MCP·CLI writer로 만들고, writer가 fresh UID를 발급한다.

**Recorded dissent**: 외부 사용자가 아직 없다면 v2 명명과 migration runner 등록은
실제 데이터 복구보다 절차 비용일 수 있다. **falsifier**: v1 형식 vault가 단 하나도
남지 않고 독립 변환 경로도 한 번도 실행되지 않으며, v2 표기가 사용자 이해만 낮추는
관찰이 나오면 다음 RFC에서 migration 호환층을 제거한다.

**상태**: 유효.

---

## 2026-08-02 — UID는 노드의 영구 정체성이고 slug는 사람이 읽는 현재 주소다

### 먼저 — 세 줄

- **정한 것**: 모든 `kind:` 노드는 로컬에서 발급한 불변 UUIDv4 `uid`와 변경 가능한
  `slug`를 함께 가진다. UID는 조회·인계·export·계보를, slug는 파일·관계·URL을 맡는다.
- **네 말과 다르게 한 것**: UID를 지도 번호나 URL·관계의 새 키로 쓰지 않는다. 사람이
  읽는 표면은 계속 title/slug이고, 이번 변경은 영구 정체성 kernel까지만 닫는다.
- **네가 할 일**: 없음 — 기존 first-party vault는 명시적 migration으로 한 번 변환하고,
  이후 생성 경로가 UID를 자동 발급한다.

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 같은 brief를 서로 보지 않는 파동으로 실행했다. ·
**트리거**: vault schema, MCP/CLI selector·출력, interop export의 공개 계약 변경. ·
**루브릭**: 19/24 (Problem insight 2 · User moment 2 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음). 실제 사용 실패는
아직 가설이지만, rename 전후 slug URN 단절은 synthetic journey로 재현·반증 가능하다.

**선행 결정 관계**: 2026-08-01 「슬러그는 평평한 식별자다」는 폐기하지 않는다.
그 결정이 지키는 것은 사람이 읽는 **주소의 유일성과 평면성**이다. 이번 결정은
그 주소가 바뀌어도 같은 개념임을 증명하는 별도 영구 정체성을 추가해 `slug=identity`
라는 표현만 `slug=current address`로 좁힌다.

## PO Council Verdict — immutable node UID + readable slug

| PO | 판정 | 소유 행 점수 |
|---|---|---|
| 근거 | Build and verify | Problem insight 2 · User moment 2 |
| 결 | Shape a slice | Verification 4 |
| 지킴이 | Build and verify | Ontology value 4 · Agent value 4 |
| 해자 | Build and verify | Differentiation 3 |
| 지렛대 | Build and verify | appetite: 최대 3 focused days |

**The decisive disagreement**: UID가 실제 정체성이라면 URL·relation·React graph id도
즉시 UID로 바꿔야 하는가. 바꾸지 않는다. 그 셋은 사람이 읽고 편집하는 현재 주소의
표면이며, 전면 재키잉은 검증된 rename/export 문제보다 훨씬 넓다. 대신 exact resolver,
handoff, compiler index, interop export가 UID를 사용해 이번 슬라이스만으로도 정체성
연속성을 실제로 증명한다.

**Decision (accountable: owner)**: Build and verify. 적용 규칙은 다음과 같다.

1. **형식과 발급**: `uid`는 모든 `kind:` 노드(`vault-readme` 포함)에 필수인
   lowercase UUIDv4다. `crypto.randomUUID()`로 로컬에서 발급하며 순차 번호·중앙
   allocator·slug/title/path 파생값을 쓰지 않는다. 생성 후 generic patch로 변경·삭제할
   수 없고, 같은 vault에서 primary/merged UID 전체가 유일해야 한다.
2. **사람 표면**: `slug`는 vault-relative 파일 주소이자 Markdown relation/wikilink,
   `<kind>:<slug>` URL, 사람이 입력하는 CLI 주소다. 기존 flat-slug 게이트는 그대로다.
   title은 표시 이름, path는 구현 근거 위치다. UID를 기본 지도 라벨·배지·버튼으로
   노출하지 않는다.
3. **생성·가져오기**: MCP single/batch add, CLI add/import/bootstrap/absorb/init,
   앱 starter·Studio 등 모든 노드 생성문이 UID를 발급한다. 고정 starter UID 복사는
   금지한다. Import는 유효한 UID를 보존하고, 없으면 발급하며, 다른 현존 노드와
   충돌하면 자동 재발급·덮어쓰기 없이 거부한다. 새 개체로 복사하려는 사람은 source
   UID를 제거해 명시적으로 새 정체성을 요청한다.
4. **수명주기**: rename/reclassify는 UID를 보존한다. merge는 target UID를 살리고
   source의 primary/기존 merged UID를 target의 `merged_uids`에 canonical set으로
   보존해 과거 UID가 survivor로 해소되게 한다. delete는 별도 tombstone을 만들지
   않으며 삭제된 UID는 해소되지 않고 재사용하지 않는다.
5. **런타임**: compiler node는 `{uid, slug}`를 내고 `uidToSlug`·`slugToUid` index를
   파생한다. MCP의 exact node selector는 UID 또는 slug를 받아 canonical `{uid, slug}`를
   반환한다. UID와 slug를 함께 받는 미래 표면은 서로 다른 노드로 해소될 때 반드시
   fail closed한다. relation은 디스크에 slug를 저장하고 런타임에서 UID로 해소한다.
6. **Interop·인계**: JSON-LD `@id`와 GraphML node id는 `urn:uuid:<uid>`를 사용하고
   slug/kind/title은 읽을 수 있는 속성으로 유지한다. agent handoff와 장기 provenance는
   `{uid, slug}`를 함께 운반한다. 이번 슬라이스는 UID exact lookup·rename·merge·export
   연속성을 보장하지만 slug-only URL의 rename 연속성은 약속하지 않는다.
7. **마이그레이션과 검증**: 폴더를 여는 read path는 조용히 UID를 쓰지 않는다.
   first-party dogfood/sample/fixture는 missing-only 명시적 migration으로 변환한다.
   missing·malformed·duplicate·primary-vs-merged 충돌은 hard error다. 새 gate는 각 결함을
   주입해 red가 되는지 `/gate-probe`로 증명한다.

**Recorded dissent**: 실제 사용자·에이전트의 반복 rename 실패가 없고 alias만으로도
현재 문제를 풀 수 있으므로 영구 UID는 미래를 위한 스키마 비용일 수 있다.
**falsifier**: rename 전 handoff/export를 재사용하는 합성 journey에서 slug alias만으로
UID와 같은 정확 조회·snapshot 동일성·import 구분을 모두 얻고, UID가 추가 복구율이나
계보 증거를 전혀 만들지 못한다.
**revisit**: UID migration 뒤 첫 20개 rename/merge handoff dogfood에서 UID resolver가
한 번도 사용되지 않거나 slug-only alias와 결과가 완전히 같을 때.

**Slice**: IN UID schema/generator/gates · 모든 생성 ingress · compiler/resolver ·
MCP/CLI exact lookup/output · rename/reclassify/merge · UID interop · first-party migration ·
가이드/문서 · bundled MCP dogfood. OUT relation/wikilink·URL·React ID 재키잉 · delete
tombstone ledger · UID 관리 UI/상시 표시 · 순차 `#12` · 외부 OSS 결과 병합.

**상태**: 유효.

---

## 2026-08-02 — 프로젝트 inspector는 내부 인계어 대신 사용자가 얻는 결과를 말한다

### 먼저 — 세 줄

- **정한 것**: `AI 인계문 복사`를 `AI에게 줄 프로젝트 정보 복사`로 바꾸고, 같은
  표면의 명사 조각과 내부 관계어를 결과형 한국어로 함께 정리한다.
- **네 말과 다르게 한 것**: 모든 `인계` 기능을 넓히지는 않는다. 복사 payload와
  MCP/CLI 계약은 그대로 두고, 실제로 보이는 topology/project 용어만 고친다.
- **네가 할 일**: 없음 — 설치 앱에서 새 문구와 복사 완료 안내를 다시 확인한다.

**소집**: 디자인 카운슬 3자리(위계·체계·핸드오프) + design-guardian 단일 결정.
설치 앱의 copy-only 용어 변경이라 layout/window chrome은 바꾸지 않아 작업대 자리는
소집하지 않았다. · **트리거**: 소유자가 설치 앱 project compact inspector에서
`AI 인계문 복사`와 주변 문구가 이상하다고 스크린샷으로 직접 관측했다.

**선행 결정 관계**: 2026-08-02 「프로젝트 inspector의 건강한 빈틈 문장과 중복
행동을 걷어낸다」가 sticky footer의 단일 복사 행동을 `AI 인계문 복사`로 정했다.
행동 하나만 남기는 구조는 유지하지만 그 문구는 이번 실사용 관측으로 즉시 뒤집는다.

## Design Council Verdict — project inspector plain-language vocabulary

**Seats convened**: 위계 · 체계 · 핸드오프 — **why these**: attention hierarchy,
공용 i18n 어휘, 실제 clipboard/agent next action이 함께 걸린 copy-only 변경.

Primary moment: 프로젝트의 코드 상태와 관계를 읽고 AI 대화로 이어갈 정보를 복사한다.
Attention stack: base=project facts · support=source kind/time/currentness ·
focus=copy action · blocking=none · utility=edit/filter actions.
Graph fact: project contains children, evidence documents, and categorical source receipt remain
distinct typed facts; wording may not collapse them into a confidence score.
Responsive rule: 기존 compact footer와 4-action geometry를 유지하고 문구만 교체한다.
Proof: owner screenshot · installed app 1512×949 Computer Use · Korean render/i18n tests ·
copy payload and toast replay.

| 자리 | 판정 | 핵심 처방 |
|---|---|---|
| 위계 | Build and verify | attention winner는 footer copy; 명사 조각·내부어 강등 |
| 체계 | Build and verify | 관계=명사군, 행동=대상+결과; 공용 i18n/render 계약 |
| 핸드오프 | Build and verify | payload 범위보다 큰 `인계` 약속 제거; 복사와 AI 대화 분리 |

**Removed / dimmed / collapsed / aligned**: `인계문`·`패킷`·`담는 것`·`속한 곳`·
`기대는 곳`·`이것만 보기`·`전체 상세`를 보이는 topology/project 표면에서 제거한다.
관계 수치는 `하위 항목`·`상위 항목`·`근거 문서`, 행동은 `문서 열기`·`관계 편집`·
`AI에게 물어보기`·`자세히 보기`로 정렬한다. 일반 노드 복사는 `AI에게 줄 항목 정보
복사`, project source action은 `AI에게 줄 프로젝트 정보 복사`로 문맥을 보존한다.

**The decisive disagreement**: 한 공용 CTA로 짧게 통일할지, 실제 payload 대상을
node/project별로 말할지. design-guardian은 이미 분리된 i18n 키를 이용하는 후자를
선택한다. 전송하지 않는 동작이므로 `보낼`은 쓰지 않는다.

**Verdict (design-guardian)**: Build and verify. 구조·payload·typed marker·token은
그대로 두고 보이는 한국어와 완료 안내만 고친다.

**Recorded dissent**: `AI에게 줄 내용 복사` 하나가 더 짧고 모든 노드에 재사용돼
compact footer 폭과 번역 유지비를 줄인다.
**falsifier**: 14인치 설치 앱에서 문맥별 문구가 실제로 줄바꿈되거나, 사용자가 같은
복사 행동을 서로 다른 기능으로 오인하는 첫 walkthrough. 그때 payload 대상을 숨기기
전에 짧은 공용 `AI에게 줄 정보 복사`로 수렴한다.

---

## 2026-08-02 — competency read-back은 Markdown 정본과 post-write receipt를 새 프로세스에서 다시 결합한다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 슬롯 한계로 3인→2인 파동을 사용했고 2라운드 전에는
다른 자리의 출력을 공유하지 않았다. · **트리거**: 새 MCP write 계약과 기존
`agent_brief` 공개 출력 변경 가능성. **루브릭**: 구현 전 17/24 (Problem insight 3 ·
User moment 3 · Differentiation 3 · Ontology value 4 · Agent value 4 ·
Verification 0, 치명적 0: Verification). 실제 restart proof 전에는 공개 등록을
승인하지 않는다.

**선행 결정 관계**: 바로 아래 「의미 평가는 구조 readiness와 분리한 순수 계약부터
연다」는 유효하다. 그 기록이 OUT으로 둔 sidecar persistence와 public MCP field를
이번에 한꺼번에 여는 것이 아니라, 저장된 ontology에서 typed competency를 다시 읽는
최소 commit point부터 증명한다. 「프로젝트의 현재 source 근거는 하나의 receipt로
사람과 agent에게 보인다」의 0/1 source cardinality·private root 비노출·현재성 분리도
그대로 유지한다.

**관측**: `meaningAssessment:v1`은 순수 함수이고 현재 `agent_brief`는 source receipt만
결합한다. `buildWritePlan`은 승인된 다섯 typed competency answer를 사람이 읽는
project Markdown의 `## Competency answers`로 이미 보존하지만, version/evaluator·
graph hash·source fingerprint를 묶어 새 MCP 프로세스가 다시 검증하는 reader가 없다.
dogfood project 본문에도 아직 그 section이 없어서 구조 `ready 100/100`과 source
53/53만으로는 의미 질문의 현재 답·gap을 복원할 수 없다. 반복 재분석 행동 자체는
아직 관측되지 않았으므로 사람 UI 필요성이나 숫자 분석률로 확대하지 않는다.

**결정 (accountable: 소유자)**: 첫 commit point는 project Markdown을 답·typed
witness·gap의 유일한 사람이 편집 가능한 정본으로 유지한다. 모든 concept/relation
write와 `validate_vault`·project compile이 성공한 뒤에만 내부 finalize가 evaluator
version·project body digest·현재 graph hash·source fingerprint·measuredAt을 local
sidecar receipt로 원자 기록한다. sidecar에는 raw answer, raw body, overall status,
absolute root, private remote를 복제하지 않는다. read-back은 Markdown과 receipt 및
현재 graph/source inventory를 다시 대조해 `meaningAssessment:v1`을 매번 파생하며,
legacy/missing·malformed·digest mismatch·ghost witness·graph/source drift를 절대
`verified_current`로 승격하지 않는다.

**공개 등록 게이트**: 먼저 internal helper와 synthetic temporary vault로
write → validate → compile → finalize → MCP 종료 → 새 MCP process `agent_brief`
read-back을 RED→GREEN으로 증명한다. 이어 body 외부 편집, relation/witness 삭제,
future/malformed receipt, source-hidden, private path leak, finalize 실패 주입에서
fail-closed와 부분 commit 0을 증명한다. 이 증거로 결 자리의 Verification이 4가 되기
전에는 새 MCP tool과 `agent_brief.meaningAssessment`를 registry에 넣지 않는다.

**적용 규칙**: 최대 2일 · 합집합 금지. IN — versioned Markdown serializer/parser,
post-write finalize core, body digest·graph/source provenance receipt, current inventory
재검증, fresh-process integration proof, proof 뒤 전용 finalize MCP tool 1개와 기존
`agent_brief`의 categorical field 1개. OUT — 지도/UI, percentage·combined confidence,
새 CLI command, `analyze_repo_structure`의 side effect, watcher, multi-root, 범용
AST/source-role scanner, Ollama routing, 외부 field-trial 결과물 반입, legacy 자동 migration.

**기록된 반대**: versioned Markdown parser만으로도 다음 세션이 답과 witness를 복원할
수 있는데 별도 finalize receipt를 요구하면 사람이 Markdown을 고친 뒤 stale 상태와
추가 마찰만 만든다.
**반증 조건**: 두 독립 MCP 프로세스가 receipt 없이 project Markdown만으로 같은
typed CQ와 current graph/source provenance를 손실 없이 복원하고, 부분 graph write나
동시 외부 편집 뒤에도 false current를 만들지 않는다면 finalize 계약은 불필요하다.
**재검토**: fresh-process proof에서 finalize가 없을 때도 위 조건이 성립하거나,
finalize 누락이 정상 handoff를 반복적으로 막는 첫 관측 시.

**상태**: 유효.

## 2026-08-02 — 의미 평가는 구조 readiness와 분리한 순수 계약부터 연다

**소집**: PO 카운슬 5자리 조사 판정 + 독립 코드 경로 조사 2건. · **트리거**:
project inspector의 source receipt 다음 단계로 분석률·신뢰도를 검토했지만, 현재
`agent_brief`의 100점/healthy가 의미 근거 없이도 성립하는 구조적 false green이
재현됐다. **루브릭**: 판정 보류(Investigate first — 공개 제품 구현 승인 아님).

**선행 결정 관계**: 아래 「프로젝트의 현재 source 근거는 하나의 receipt로 사람과
agent에게 보인다」의 `verified_current`를 path 존재와 graph shape만으로 주지 않는다는
규칙은 유효하다. 이번 기록은 그 규칙을 공개 UI/MCP에 연결하기 전에 어떤 최소
판정 계약으로 거짓 양성을 닫을지 정한다.

**결정 (accountable: 소유자)**: 첫 단위는 cross-runtime 순수 파생 계약
`meaningAssessment:v1`과 가상 fixture만 만든다. 구조 readiness, 고정 evaluator와
graph hash에 묶인 다섯 competency question receipt의 raw typed witness·미해소 목록,
source receipt의 상태·현재성·opaque ID·revision·fingerprint·측정 시각을 검증 입력으로
받는다. 결과에는 raw witness를 복사하지 않고 categorical 상태와 inventory contract·
graph hash·source fingerprint provenance만 남긴다. 모든 competency가 answered이고
계약상 필수 typed witness가 현재 inventory에서
해소됐으며, source가 `verified_current`+`current`이고 두 receipt의 graph provenance가
일치할 때만 전체 상태를
`verified_current`로 낸다. 구조가 ready여도 competency gap이 있으면
`needs_evidence`, graph/source가 바뀌었거나 source를 현재 재확인할 수 없으면
`review_required`로 닫는다. 결과에는 percentage, combined confidence, node/file
분모를 넣지 않는다.

**검증 계약**: synthetic positive, 실제 `agent_brief`가 100/100 ready로 판정하는
최소 containment graph의 semantic false-green, stale graph/source,
source-hidden 네 fixture를 RED→GREEN으로 고정한다. false-green은 절대
`verified_current`가 아니어야 하고, positive만 통과해야 하며, 모든 결과는 evaluator·
graph·source receipt·competency contract provenance를 가져야 한다. fixture와 구현에는
외부 field-trial의 node·relation·문구를 반입하지 않는다.

**적용 규칙**: IN — 순수 계약, 단일 competency contract 정본, 결정적 categorical
output, 네 synthetic fixture. OUT — sidecar persistence, project inspector, CLI/MCP
public field, 숫자 점수, 기존 receipt 상태 변경, source-role scanner 확대. 저장된
ontology에서 typed competency를 다시 읽는 계약을 별도로 결정하기 전에는 공개 표면에
연결하지 않는다.

**기록된 반대**: source-hidden에서도 마지막 verified receipt를 그대로
`verified_current`로 유지하고 currentness만 `unavailable`로 병기하면 과도한 강등을
피할 수 있다.
**반증 조건**: `review_required + unavailable`이 실제 handoff에서 이미 검증된 근거의
사용을 반복적으로 막고, 소비자가 상태와 현재성을 함께 읽어도 오판하지 않는다는
walkthrough 근거가 생기면 전체 상태 승격 규칙을 재검토한다. **재검토**: typed CQ
read-back 계약과 source-hidden agent walkthrough가 모두 존재할 때.

**상태**: 유효.

---

## 2026-08-02 — 프로젝트 inspector의 건강한 빈틈 문장과 중복 행동을 걷어낸다

**소집**: 디자인 카운슬 5자리(위계·체계·상호작용·작업대·핸드오프) +
design-guardian 단일 결정. · **트리거**: 1512 설치 앱의 project inspector에서
소유자가 `확인된 최상위 빈틈 없음`이라는 문장과 여섯 개 동등 행동이 어지럽고
구분되지 않는다고 직접 관측했다.

**선행 결정 관계**: 바로 아래 source receipt 결정의 반증 조건이 관측됐다.
receipt가 관계 사실보다 먼저 이기고 다음 행동이 중복되면 rail을 줄이기로 했던
약속을 실행한다. receipt를 project inspector의 기존 슬롯에 두고 별도 카드·점수·
대시보드를 만들지 않는 본래 결정은 유지한다.

**결정 (accountable: design-guardian)**: 조건부 승인, Build and verify. compact
receipt는 `코드 근거` heading 아래 상태/출처와 측정 시각/현재성을 두 행으로
묶고, 기존 hairline으로 inline 행동과 분리한다. `topGap:null`은 typed marker에는
`none`으로 보존하되 건강한 부재를 화면 한 행으로 쓰지 않는다. 실제 gap만
`다음 확인: ...`으로 보인다. `use_current_evidence`일 때는 inline `AI 요약 복사`를
없애고 sticky footer의 실제 clipboard 행동 `AI 인계문 복사` 하나만 남긴다.
project receipt가 열린 compact inspector에서는 `경로`도 inline에서 걷어내되
기존 context menu 경로는 유지한다. 따라서 설치 앱의 첫 project 읽기 행동은
문서·관계 편집·AI 요청·이것만 보기 네 개가 된다. 새 token이나 motion은 만들지
않고 기존 divider, spacing, type, neutral/indigo/status token만 재사용한다.

**검증 계약**: component는 heading, 건강한 gap 비노출, 실제 gap 노출, receipt와
action의 구획, current handoff 중복 제거, inline action count를 잠근다. 설치 앱은
1512에서 receipt·action·footer 교집합 0, action 최소 폭, footer 도달 가능성과
복사 성공 toast를 측정하고 1920/2560에서 같은 정보 순서를 확인한다.

**기록된 반대**: project도 inline `경로`를 유지한 다섯 행동이 ontology 탐색의
발견 가능성을 더 잘 보존하며, 네 행동으로 줄이면 context menu를 모르는 사용자가
경로 분석을 찾지 못할 수 있다.
**반증 조건**: project를 고른 사용자가 경로 분석을 시작하려고 inspector를
반복 탐색하거나 context menu에서 경로를 찾지 못하는 walkthrough가 관측되면,
행동을 다시 늘리기 전에 관계 편집 또는 영역 전개의 우선순위와 교체 여부를
재검토한다. **재검토**: 설치 앱 walkthrough 2회 또는 해당 문의 첫 1건.

**상태**: 유효.

---

## 2026-08-02 — source receipt는 새 카드가 아니라 프로젝트 inspector의 기존 위계를 치환한다

**소집**: 디자인 카운슬 6자리(위계·체계·상호작용·도해·작업대·핸드오프),
독립 1라운드 + 상호 비평 1라운드. 모든 자리가 설치 앱 또는 실제
`agent_brief`를 열었고, 설치 앱을 열지 못한 핸드오프 자리는 화면 판정을 유보한
채 명령 계약만 처방했다. · **트리거**: Topology의 선택 프로젝트 inspector,
native folder picker, MCP/CLI handoff를 함께 바꾸는 시각·상호작용 결정.

**선행 결정 관계**: 바로 아래 「프로젝트의 현재 source 근거는 하나의 receipt로
사람과 agent에게 보인다」는 유효하다. PO 결정이 무엇을 한 사실로 만들지 정했고,
이번 결정은 그 사실이 이미 밀도 높은 작업대에서 어떤 위계와 상태 전이로 보여야
하는지 정한다.

**실물 관측**: `/Applications/Ontology Atlas.app`의 `/ko/topology`, 1512×949,
프로젝트 `음악 스트리밍` 선택 상태에서 우측 inspector는 `3일 전 바뀜`, 관계·문서
집계, 동등한 여섯 행동, `담는 것` 6행, sticky `전체 상세`를 한 위계로 쌓는다.
source binding·측정 revision·top gap은 없다. 별도 receipt 카드나 네 행을 그대로
추가하면 첫 viewport의 그래프 사실과 다음 행동을 밀어낸다. 반대로 실제
`agent_brief`는 graph readiness 100을 내지만 project source receipt 필드가 없어,
사람과 agent의 상태 순서를 맞출 계약도 아직 없다.

**결정 (accountable: design-guardian 대행)**: 조건부 승인, Build and verify.
project 선택에서만 기존 슬롯을 치환한다. 현재 meta는 label+icon의 categorical
source 상태와 `measuredAt`, 중복 stats 자리는 최대 두 줄의 `topGap`, sticky
footer의 유일한 primary는 receipt `nextAction`이 된다. `전체 상세`와 나머지 행동은
utility로 강등한다. 기존 `3일 전 바뀜`은 `개념 문서 · 3일 전`처럼 주어를 붙여
source 측정 시각과 분리한다. 1512 이하에서는 `담는 것 N · 근거 M` 집계만 남기고
project의 개별 관계 목록을 기본 접는다. 다른 kind의 inspector는 바꾸지 않는다.

새 panel/card/dashboard, progress·donut·`x/y`·confidence, 지도 노드의 추가 ring/glow,
새 agent CTA는 만들지 않는다. 기존 neutral/indigo/status token만 재사용하며 color만으로
상태를 뜻하지 않는다. compact inspector·전체 상세·MCP `agent_brief`·CLI는 같은
versioned receipt를 `status → measuredAt → topGap → nextAction` 순서와 의미로 읽고,
절대 경로와 private remote를 표시하거나 복사하지 않는다. graph readiness와 source
상태는 서로 대체하지 않는다.

**상호작용 계약**: folder 선택 취소는 무변경이다. 새 선택은 canonicalize와 receipt
생성·검증이 모두 성공한 뒤에만 binding+receipt를 원자 교체한다. 교체 실패는 이전
binding/receipt·route·project selection을 보존하고 실패만 `aria-live=polite`로
알린다. 성공·취소·실패 뒤 focus는 호출한 source 버튼 또는 갱신된 상태 heading으로
돌아온다. 측정 중에도 이전 receipt를 지우지 않는다. 연결 해제와 확인 modal은 첫
슬라이스에서 만들지 않는다.

**검증 계약**: component/contract는 receipt contract version, 상태, top gap,
next action, currentness, binding cardinality와 UI↔`agent_brief` parity를 fail-closed로
검증한다. 설치 앱은 1512×949와 외부 1920/2560에서 project selected 상태의 겹침 0,
footer 도달, 목록 접힘, raw path 비노출을 증명한다. native picker는 성공·취소·실패의
원자 교체·이전 receipt 보존·focus return을 증명한다. 기존 token만 쓰므로 새 lint
gate는 만들지 않는다.

**기록된 반대**: 이 조밀한 inspector에서 source receipt가 attention winner가 되면
관계와 근거 문서라는 온톨로지 본체가 utility로 밀리고, source 측정 기능이 아직
약한 상태에서는 큰 `needs_evidence` CTA만 반복하는 진단 UI가 될 수 있다. 별도
UI보다 bounded source-role evidence를 먼저 넓혀야 한다는 반대도 여기에 포함된다.
**반증 조건**: 1512 설치 앱에서 사용자가 첫 viewport 안에 project 관계 사실 또는
receipt next action 중 하나를 보려 스크롤해야 하거나, 두 외부 trial에서 top gap이
같은 막연한 문구만 반복하고 handoff 정확도를 바꾸지 못하면 이 반대가 옳다. 그때
receipt 노출을 더 키우지 않고 rail을 축소한 뒤 source-role evidence부터 보강한다.
**재검토**: 설치 앱 1512·1920·2560 proof와 두 외부 trial 재측정 직후.

**상태**: 유효.

---

## 2026-08-02 — 프로젝트의 현재 source 근거는 하나의 receipt로 사람과 agent에게 보인다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 3인→2인 두 파동으로 원 관측을 독립 검토했고, 2라운드에는
다섯 판정을 모두 공유했다. · **트리거**: project↔source 로컬 계약, MCP 분석
receipt, agent handoff, Topology의 신뢰 상태를 함께 바꾸는 공개 제품 결정.
**루브릭**: 22/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 3, 치명적 0: 없음).

**선행 결정 관계**: 같은 날 「`canWrite`는 competency 답의 witness와 visible
gap을 함께 보존한다」와 2026-07-31 「팬아웃 상한이 아니라 노드 자격 게이트」는
유효하다. 전자는 현재 proposal 안의 답을 정직하게 만들었고, 후자는 10·20 같은
고정 node 수를 품질 기준으로 쓰지 못하게 했다. 이번 결정은 둘을 project의 실제
source revision과 묶어 다음 사람과 agent가 같은 현재성 판정을 읽게 한다.

**관측**: 현재 MCP의 `REPO_ROOT`는 프로세스 전역이고 root 변경에는 재시작이
필요하다. `index_project(rootPath)`는 명시 폴더를 읽을 수 있지만 그 선택과 결과를
project별로 보존하지 않는다. map/project 표면은 node·relation·document 수를
보여주며, MCP와 web의 readiness는 node 수·관계 수·graph health·hub를 합산한다.
dogfood vault는 이 휴리스틱에서 `ready 100/100`이지만 source 의미 정확도를
측정한 값은 아니다.

두 외부 field trial이 서로 다른 거짓 안심을 재현했다. 첫 trial은 6 concept·5
relation을 저장하고도 source-hidden 6문항 중 1개만 완전 답변했으며 canonical
entrypoint 하나가 틀렸다. 두 번째 비-Rust Go trial은 6분 16초 동안 위험 표시된
README claim을 현재 source 역할로 독립 확인하지 못해 `canWrite:false`, 의미 node·
relation write 0으로 정직하게 닫혔다. 그러나 남은 5 starter node·7 relation은
compiler issue 0·unresolved edge 0으로 깨끗했고, source-hidden 인수자는 109.54초 뒤
6문항 전부를 `unknown`으로 판정했다. source claim은 0개라 hallucination 비율은
`0/0 = 100%`가 아니라 `not_applicable`이다. 구조 health만으로는 두 경우를
구분할 수 없다.

**근거 원칙**: competency question은 온톨로지가 목적에 필요한 정보를 답할 수
있는지 묻는 litmus test다([Stanford Ontology Development 101](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf)).
품질 차원은 구체 indicator를 관측하는 절차와 측정 provenance를 가져야 한다
([W3C DQV](https://www.w3.org/TR/vocab-dqv/),
[W3C PROV-O](https://www.w3.org/TR/prov-o/)). Atlas는 이 원칙을 RDF 도입 요구로
읽지 않고, 측정 대상·revision·시간·생성 계약을 receipt에 남기는 제품 계약으로
적용한다. 구조 적합 여부와 상세 위반을 분리하는 형태도 SHACL validation report의
원칙을 차용한다([W3C SHACL](https://www.w3.org/TR/shacl/)).

**갈린 지점**: 근거 자리는 기존 `index_project`의 read-only report가 두 trial을
먼저 구분해야 false green을 싸게 막는다고 했다. 다른 네 자리는 binding 없는
report가 임의 root를 더 정밀하게 측정하고, 사람 판단과 다음 agent 행동을 바꾸지
못하는 숨은 진단 파일이 된다고 반박했다. 2라운드에서 근거 자리도 이 반박을
수용해 최소 수직 loop로 판정을 바꿨다. 결 자리는 처음 `근거 확인 x/14`를
제안했으나, 현재 5 CQ·14 witness obligation·source-hidden 6문항의 서로 다른
분모가 허위 정밀도로 보일 수 있다는 지킴이·해자 반론을 받아 첫 UI 수치를
보류했다.

**결정 (accountable: 소유자)**: 한 project의 **활성 분석 source는 0개 또는
1개**다. folder를 고르면 Git worktree 안에서는 canonical worktree root와 HEAD·
dirty/content fingerprint를, Git 밖에서는 canonical folder root와 bounded inventory
fingerprint를 쓴다. 여러 project가 같은 monorepo root를 공유할 수 있지만, 한
project가 여러 독립 root를 합치는 aggregate mode는 v1에서 제외한다. source가 없는
legacy/conceptual project는 계속 유효하고 `not_measured`; 둘 이상의 활성 binding,
사라진 root, 깨진 receipt는 `invalid`다. 절대 경로와 private remote는 Markdown에
쓰지 않고 vault의 gitignored `.ontology-atlas/` local sidecar에만 둔다.

하나의 공용 receipt 생성기가 `projectSlug` · opaque source identity · source
revision/fingerprint · ontology `graphHash` · `measuredAt` · contract version ·
versioned CQ witness/gap · scan diagnostics · validation findings를 만든다. 현재 상태는
그 receipt와 현 source/graph를 다시 대조해 `not_measured` · `needs_evidence` ·
`review_required` · `invalid` · `verified_current` 중 하나로 파생한다.
`verified_current`는 path 존재와 graph shape만으로 주지 않고, 필수 witness가 현재
source 역할을 지지할 때만 허용한다. map의 선택된 project 상세와 `agent_brief`는
상태를 다시 계산하지 않고 같은 receipt의 사람용 한 줄·최상위 gap·다음 bounded
action을 읽는다. web이 local root의 현재성을 다시 확인할 수 없으면 마지막 결과와
`현재성 확인 불가`를 분리해 열화한다.

**적용 규칙**: 최소 수직 슬라이스 · 합집합 금지 · appetite 2일. IN — project
하나의 folder picker와 Git/non-Git canonicalization, 활성 binding 0/1/2 fail-closed
fixture, local sidecar 한 계약, 공용 versioned receipt, source/graph stale 판정,
map project 상세의 categorical 상태·측정 시각·top gap·next action, 같은 receipt를
읽는 MCP `agent_brief`, legacy unbound/web degraded/monorepo shared-root fixture,
설치 앱과 source-hidden handoff 재검증. OUT — 첫 UI의 `x/y`, combined confidence,
node/file/relation quality denominator, multi-root aggregate, 새 dashboard/route,
주기 watcher, 자동 graph write, 범용 AST/import/symbol graph, 모든 언어 scanner 확대.
현재 obligation 수와 충족 수는 receipt 안에서 versioning하되 여러 언어 trial에서
분모가 안정되기 전에는 사용자 신뢰 숫자로 승격하지 않는다.

**기록된 반대**: report-only부터 만들면 의미 계산을 싸게 검증하고 binding·app·
handoff를 동시에 건드리는 운영 부담을 줄일 수 있다. 더 근본적으로, 동일한 제한된
evidence packet을 만든 agent가 자기 witness를 다시 채점하면 더 정교한 false green을
만들 수 있으므로 UI를 붙이기 전에 bounded source-role evidence가 먼저일 수 있다.
**반증 조건**: 정확히 binding된 Trial A의 잘못된 canonical path가
`verified_current`를 받거나 Trial B가 top gap·next action 없이 `needs_evidence`만
반복하고, source-hidden handoff의 답변/거절 정확도가 개선되지 않으면 이 반대가
옳다. 그때 UI 확장을 멈추고 반복된 unknown 역할만 수집하는 bounded source-role
evidence와 report gate를 다음 최소 슬라이스로 연다. **재검토**: 두 trial의 fresh
receipt와 source-hidden 6문항 재채점 직후. 두 개 이상의 실제 project가 active-root
전환으로 해결되지 않는 multi-root evidence를 요구해도 cardinality를 재검토한다.

**상태**: 유효.

---

## 2026-08-02 — `canWrite`는 competency 답의 witness와 visible gap을 함께 보존한다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 동시 에이전트 슬롯 한계로 3인→2인 두 파동을 사용했고,
2라운드 전까지 다른 자리의 출력을 공유하지 않았다. · **트리거**: 공개 MCP
입력·출력 의미 계약 변경 + 선행 `canWrite` 결정의 반증 조건 관측.
**루브릭**: 22/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 3, 치명적 0: 없음).

**선행 결정 관계**: 같은 날 「`canWrite`는 승인된 전체 그래프의 deterministic
write plan만 통과시킨다」와 2026-07-31 「팬아웃 상한이 아니라 노드 자격 게이트」는
둘 다 유효하다. 전자는 검증한 그래프와 쓰는 그래프의 동일성을 해결했고, 후자는
10·20 같은 수를 품질 상한으로 쓰는 것을 금지했다. 다만 전자의 기록된 반증 조건,
즉 exact plan으로 전체 그래프를 저장해도 code entrypoint와 impact handoff가
개선되지 않는 경우가 이번 다음 field trial에서 그대로 관측됐다.

**관측**: 낯선 저장소를 Atlas MCP만으로 분석한 builder는 6개 의미 concept와
5개 relation을 손실 없이 저장했고 `canWrite:true`, findings 0을 받았다. 그러나
source-hidden 인수자는 사전에 고정한 6문항 중 1개만 완전히 답하고 5개를 부분
답변했다. 저장된 capability는 BibTeX·YAML·query 전체의 canonical path를
`src/types`라고 했지만 실제 공개 진입점은 `src/io.rs`, 핵심 collection model은
`src/lib.rs`, BibLaTeX 변환은 `src/interop.rs`, query는 selector 모듈에 나뉜다.
dependency relation이 없는데도 impact competency는 비어 있지 않은 문자열 하나로
통과했다. 현재 validator가 증명한 것은 답 문자열의 존재이지, 답을 지지하는
concept·typed relation·evidence·path의 존재가 아니다.

**갈린 지점**: 1라운드의 근거·결·해자는 bounded source-role evidence를 먼저
늘려야 잘못된 canonical path를 바로잡을 수 있다고 했고, 지킴이·지렛대는 먼저
typed competency answer로 거짓 완전 통과를 없애야 실제 evidence 공백을 측정할 수
있다고 했다. 반박에서 전자는 source packet부터 넓히면 Atlas가 열등한 source index를
복제하고 원인별 수요를 모른 채 payload만 키운다는 주장을 수용해 판정을
`typed-CQ-only`로 바꿨다.

**결정 (accountable: 소유자)**: 기존 다섯 competency answer를 단순 문자열에서
`answer` · `status` · 실제 graph/evidence `witnesses`를 가진 구조로 바꾼다.
`answered`는 해당 질문이 요구하는 concept·typed relation·evidence·canonical path
witness가 proposal 안에서 해소될 때만 허용한다. 일부만 증명되거나 증명할 수 없으면
`partial` 또는 `visible-gap`으로 남기고, 그 gap은 finding과 deterministic
`writePlan`, persisted project body까지 손실 없이 보존한다. 따라서 honest gap이
있는 proposal은 승인·쓰기 가능할 수 있지만 findings 0이나 완전 답변으로 표시되지
않는다. `canWrite`는 계속 boolean evidence-readiness gate이며 사람 승인·원자성·
완전성을 뜻하지 않는다.

**적용 규칙**: 최소 슬라이스 · 합집합 금지. IN — 기존 5문항의 typed metadata,
answer/status/witness input schema, witness endpoint/source/path 해소, 질문별 최소 witness,
partial/visible-gap warning, exact plan과 project body 보존, 현 field trial의 거짓
canonical/impact proposal RED, fresh MCP-only rebuild와 source-hidden 재시험. OUT —
semantic evidence packet 확대, source/AST/import index, 새 MCP 도구·kind, 고정 노드
수·kind별 상한, 자동 bridge, UI, 자동 write, Ollama tool routing. appetite — 최대
2일; 둘째 날 안에 거짓 통과 RED와 exact unknown handoff를 재현하지 못하면 확장하지
않고 중단한다.

**기록된 반대**: 현재 packet은 README와 Cargo contract 중심이어서 typed witness만
추가해도 `src/types`가 그 역할의 정본인지 기계가 판별할 수 없다. source-role
evidence를 동시에 추가하지 않으면 형식만 복잡해지고 handoff의 정확도는 그대로일 수
있다. **반증 조건**: typed CQ가 현 거짓 canonical path·근거 없는 impact를
`answered`에서 내리지 못하거나, 내린 뒤에도 fresh source-hidden handoff가 gap을
숨기거나 잘못된 시작점을 확정하면 이 반대가 옳다. 그때 다음 슬라이스는 반복된
unknown이 요구한 역할만 수집하는 bounded source-role evidence다. **재검토**: 동일
scratch repo의 fresh MCP rebuild와 source-hidden 6문항 재채점 직후.

**상태**: 유효.

---

## 2026-08-02 — init의 vault와 repo root는 같은 canonical 좌표계에서 계산한다

**소집**: 단독 패스 · **트리거**: 실제 field trial에서 CLI가 생성한 MCP 설정이
존재하지 않는 repo root를 가리켜 첫 agent 연결이 멈춤.
**루브릭**: 23/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음).

**선행 결정 관계**: 2026-08-01 「인수인계 시험이 찾아낸 셋」의 두 번째 결정,
즉 근거 없는 `OATLAS_REPO_ROOT`로 코드 drift를 재지 않는다는 원칙은 유효하다.
이번 결함은 같은 실재 폴더를 macOS의 `/tmp`와 `/private/tmp` 두 표기로 섞어
init 자체가 근거 없는 경로를 만들어 낸 하류 위반이다.

**관측**: source checkout의 CLI를 `/private/tmp/.../repo`에서 실행하면서 vault
인자만 `/tmp/.../ontology` 절대 경로로 주자, 두 경로를 그대로 `relative()`에
넣은 설정은 vault에서 해석될 때 `/private/private/tmp/.../repo`를 가리켰다.
실제 MCP session은 명시적 `rootPath`로만 복구됐고 자동 repo 분석·path 검증은
첫 호출에서 멈췄다. 같은 현상을 임의 symlink 별칭 fixture로 재현한 RED는
`ENOENT ... /private/private`를 반환했다.

**결정**: scaffold가 끝나 vault와 cwd가 모두 실재한 뒤 두 디렉터리를
`realpath`로 canonicalize하고, vault-local·cwd-local 설정의 상대 경로와 global
Codex 등록 명령을 그 한 좌표계에서 계산한다. 설정 키, 파일 위치, 기존 파일 보존
정책, MCP 도구/CLI 명령은 바꾸지 않는다.

**적용 규칙**: 최소 슬라이스. IN — `init` 경로 계산, symlink alias 통합 회귀,
실제 `/tmp` dogfood. OUT — `agent-setup` 재설계, symlink 생성/제거, 설정 덮어쓰기,
새 fallback 경로 또는 UI.

**서명**: owner

**기록된 반대**: `/tmp`는 macOS 특수 사례이므로 문서화만 하고 사용자가 절대
canonical path를 넣게 해도 된다. **반증 조건**: canonicalization 때문에 실제
symlink 위치를 의도적으로 보존해야 하는 vault가 다른 repo를 가리키거나, 기존
상대 경로 init fixture가 달라진다. **재검토**: symlink vault를 source checkout
밖의 별도 repo root로 의도적으로 운영한 사례가 보고될 때.

**상태**: 유효.

---

## 2026-08-02 — `canWrite`는 승인된 전체 그래프의 deterministic write plan만 통과시킨다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 실행 환경은 root 포함 동시 4슬롯이라 같은 브리프를 3인→2인
두 파동으로 보냈고 자리 간 출력은 2라운드 전까지 공유하지 않았다. ·
**트리거**: `analyze_repo_structure.proposal`의 공개 MCP 입력·출력 계약 변경.
**루브릭**: 23/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 4, 치명적 0: 없음).

**선행 결정 관계**: 2026-08-02 「Rust package 계약은 노드가 아니라 bounded
`package-contract` 근거 한 행」 결정은 유효하다. 그 결정은 evidence packet의
정본 근거를 늘렸지만, 사용자가 승인한 전체 의미 그래프가 검증과 쓰기 사이에서
같은 객체로 보존되는지는 다루지 않았다. 이번 두 번째 field trial은 근거 수집보다
하류인 approval→validation→write 경계의 별도 결함을 관측했다.

**관측**: 낯선 저장소의 실제 MCP-only bootstrap에서 승인안은 6개 concept와
7개 typed relation을 제시했지만 validator의 공개 schema는 project·domain·
capability 4개만 받을 수 있었다. `canWrite:true`, findings 0이 나온 뒤 agent는
검증 가능한 4개만 썼고 element 2개와 relation 7개를 모두 제외했다. 쓰기 입력을
손으로 다시 만들면서 이미 검증된 capability의 `domain`도 잃었다. 결과는 의미
관계 0개, capability 구현 근거 0/2, `health: needs_attention`이었고, source-hidden
handoff는 6개 질문 중 1개를 답하지 못하고 3개를 부분 답변했다. 이는 agent의
복사 실수만이 아니다. 현재 schema로는 승인된 element와 relation을 완전한
proposal로 표현하거나 검증할 수 없다.

**갈린 지점**: 다섯 자리 모두 Build에 동의했지만 검증-적용 동일성 자체는
Terraform식 plan/apply를 포함한 신뢰 가능한 도구의 기본 계약이지 Atlas의 해자가
아니라는 반론을 수용해 Differentiation을 3점으로 낮췄다. 또한 `writePlan`이
원자 transaction이나 쓰기 성공을 보장한다는 오해가 더 강한 거짓 신호가 될 수
있다고 봤다. 반박 뒤 전원은 `canWrite`를 evidence-ready exact input plan으로만
한정하고 실제 batch 결과를 별도로 확인하는 데 합의했다.

**결정 (accountable: 소유자)**: `analyze_repo_structure.proposal`은 승인 대상
전체(project·domain·capability·element·typed relation)를 한 번에 검증한다.
성공할 때만 기존 `add_concepts`와 `add_relations`의 실제 행 형식과 동일한
deterministic `writePlan`을 반환한다. capability·element의 `domain`과 정본
`path`, concept의 definition·evidence·confidence·boundary/uncertainty, relation의
endpoint·type·why를 손실 없이 보존한다. 선택 승인은 선택된 subset 전체를 다시
검증한다. concept batch에 실패 행이 하나라도 있으면 relation batch를 실행하지
않는다. relation source는 evidence/confidence를 본문에 보존할 proposed concept여야
한다. 기존 node를 source로 확장하는 일은 별도 patch workflow로 남긴다.
`canWrite`는 사람의 승인, 원자성, 실제 write 성공을 뜻하지 않는다.

**적용 규칙**: 최소 슬라이스 · 합집합 금지. IN — all-kind duplicate slug,
element citation/domain/path, relation duplicate/endpoint/type/rationale 검증,
deterministic concept body, batch `why` 배선, 실패 시 `writePlan` 미반환,
bootstrap skill의 exact-plan 전달, 실제 6 concept·7 relation MCP replay와
health/path/source-hidden handoff 재검증. OUT — 새 MCP 도구·kind·UI, 자동 write,
approval token, 원자 transaction/rollback, import 추론, starter 삭제, 범용 workflow
engine. appetite — 최대 2일; 첫날 contract red-green, 둘째날 real MCP/handoff.

**기록된 반대** (근거·지킴이, 가장 강함): 현행 skill만 정확히 고친 fresh MCP
run 두 번이 승인된 전체 그래프를 보존한다면 한 번의 agent 복사 실수를 공개 schema
확장으로 고정하는 것은 과잉 처방이다. 전체 그래프 저장 후에도 source-hidden
handoff가 개선되지 않으면 병목은 validator가 아니라 source evidence 부족이다.
**반증 조건**: 현행 공개 계약의 대조 run이 전체 승인 집합을 두 번 연속 손실 없이
저장하거나, 새 exact plan으로 전체 그래프를 저장해도 handoff의 code entrypoint와
impact 답변이 개선되지 않거나, writer가 plan의 rationale/evidence를 다시 버린다.
**재검토**: 같은 scratch trial의 실제 MCP replay와 source-hidden handoff 직후.

**상태**: 유효.

---

## 2026-08-02 — Rust package 계약은 노드가 아니라 bounded `package-contract` 근거 한 행이다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드. 실행 환경은 root 포함 동시 4슬롯이라 같은 브리프를 3인→2인
두 파동으로 보냈고 자리 간 출력은 2라운드 전까지 공유하지 않았다. ·
**트리거**: `index_project` / `analyze_repo_structure`의 공개 MCP 응답 의미 계약 변경.
**루브릭**: 22/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 3, 치명적 0: 없음).

**선행 결정 관계**: 2026-08-01 「도구의 시야가 곧 볼트의 사정거리」 결정은
유효하다. 당시 root 독립 패키지 누락이 에이전트 온톨로지의 침묵하는 구멍이
됐고, 이번에는 낯선 Rust 저장소의 정본 package manifest가 같은 방식으로
evidence packet 밖에 남았다. 선행 결정을 뒤집지 않고 새 실측 범위로 확장한다.

**관측**: MCP-only field trial의 builder가 feature capability 근거로
`Cargo.toml`을 제출하자 proposal validator가 `unknown-citation`으로 거절했다.
builder는 `README.md`로 후퇴해 11개 의미 노드와 7/7 path 정확도는 지켰지만,
source-hidden 인수자는 package-manifest 구현 세부를 unknown으로 남겼다.
Cargo 공식 계약에서 root `Cargo.toml`은 package manifest이고 `[features]`는
조건부 컴파일과 optional dependency를 정의한다. 문제는 Rust 구조를 더 많이
노드로 만드는 것이 아니라 shipped configuration contract를 정본 provenance로
인용할 수 없다는 데 있다.

**갈린 지점**: 다섯 자리 모두 Build에 동의했지만, 한 저장소 관측을 범용 manifest
전략으로 과잉 일반화하고 raw TOML·comment·악성 문자열을 semantic evidence로
승격할 위험을 가장 강하게 제기했다. 반박 뒤 전원은 단순 seed 추가가 아니라
root package manifest 하나의 allowlist 구조만 정규화하고 4시간 안전 종료 조건을
두는 더 작은 안으로 좁혔다.

**결정 (accountable: 소유자)**: repository root의 `Cargo.toml`이 실제
`[package]`를 가진 경우, 제한된 package 식별·설명 필드와 `[features]`의
이름·매핑만 `role: package-contract`인 bounded `semanticEvidence` 한 행으로
제공한다. 이 행은 citation 후보이지 domain/capability/element 제안이 아니다.
feature 이름별 노드는 0개 추가한다.

**적용 규칙**: 최소 슬라이스 · 합집합 금지. IN — root containment, 파일 크기
상한, comment/raw prose 배제, `[package]`·`[features]` allowlist,
`unknown-citation → canWrite` red-green, mission/architecture evidence 비밀림,
malformed·oversized·hostile·virtual-workspace fail-closed, 실제 scratch MCP와
vault-only handoff 재검증. OUT — Rust import graph, workspace member 재귀,
dependency/target/profile/build-script 해석, 범용 manifest framework,
starter 삭제, UI, vault schema, 새 MCP 인자. appetite — 최대 4시간; 안전 경계
하나라도 같은 슬라이스에서 증명하지 못하면 `Investigate first`로 되돌린다.

**기록된 반대** (전원 반박에서 수용한 가장 강한 논점): 한 Rust 저장소의 partial
handoff 하나를 고치다 TOML parser·workspace 탐색·dependency graph까지 떠안으면
작은 evidence admission이 검증되지 않은 manifest subsystem으로 커지고,
mission evidence와 10–20개 의미 모델을 오히려 훼손한다.
**반증 조건**: 새 행이 기존 mission/architecture evidence를 packet 밖으로 밀거나,
raw/comment 지시를 신뢰하거나, manifest/feature별 노드를 늘리거나, 두 번째
field trial 전 workspace/member/general parser 확장이 필요해진다.
**재검토**: 두 번째 비-Rust 또는 virtual-workspace field trial에서 같은 citation
공백이 관측될 때만 범용 manifest/workspace 지원을 새 결정으로 연다.

**상태**: 유효.

---

## 2026-08-02 — capability 구현 근거는 `elements:`가 아니라 정본 `path:` 하나로 연다

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대), 독립 1라운드 +
상호 반박 1라운드 · **트리거**: vault 스키마와 MCP/CLI 공개 계약 변경.
**루브릭**: 22/24 (Problem insight 4 · User moment 4 · Differentiation 3 ·
Ontology value 4 · Agent value 4 · Verification 3, 치명적 0: 없음).

**선행 결정 관계**: 2026-07-31 「경로는 의미 슬롯이 아니라 근거」와
`elements:` 원시 경로를 `path-shaped-reference`로 잡는 자격 게이트는 그대로
유효하다. 2026-08-01 `capability_without_evidence` 기록 중 “원시 경로를
`elements:`에 넣어도 된다”는 처방만 뒤집는다. 실제 maintenance가 그 처방을
내린 직후 write gate가 같은 값을 범주 오류로 경고하는 왕복 모순이 반증 조건을
충족했다. 쓰기를 막지 않는 원칙은 유지한다.

**관측**: self-vault의 capability 19개 중 9개가 구현 근거 없음으로 남았고,
field trial 기준선에도 8개가 있었다. `maintenance_plan`은 파일 경로를
`elements:`에 넣으라고 했지만 `write-path-gate.test.mjs`는 그 입력을
`path-shaped-reference`로 고정한다. 반면 write gate와 path-drift 소비자는 이미
비어 있지 않은 `path:`를 비그래프 구현 위치로 읽는다. self-vault 9건은 모두
정본 파일 또는 디렉터리 하나로 첫 진입점을 표현할 수 있었다.

**갈린 지점**: 1라운드에서 근거·지렛대는 기존 `path:` 재사용을, 결·지킴이·해자는
`evidence: string[]` 신설을 택했다. 반박 뒤 결·지킴이·해자는 관측되지 않은 복수
루트를 위해 공개 필드와 하류 소비자를 늘리는 것은 과설계라고 수용해 `path:`로
바꿨다. 근거는 관계와 근거의 의미 분리를 더 선명하게 지켜야 한다며
`evidence: string[]`로 반대로 이동했다.

**결정 (accountable: 소유자)**: capability의 `path:`를 “이 행동의 구현을 여는
저장소 상대 정본 파일 또는 디렉터리 하나”로 정식화한다. `elements:`에는 해소되는
element slug만 둔다. element는 파일이 독립된 역할을 한 문장으로 벌었을 때만
승격하며, maintenance를 비우기 위한 파일 미러 노드는 만들지 않는다.

**적용 규칙**: 최소 슬라이스 · 합집합 금지. IN — kind schema/MCP 작성 지시,
write gate와 maintenance의 공통 근거 술어, path drift, 세 파서 계약,
self-vault 9건 이관, MCP/CLI-only 왕복 dogfood. OUT — `evidence: []`, 구조화
provenance, 복수 경로, UI, 자동 element 생성, 외부 vault 자동 migration.
appetite — 1일.

**기록된 반대** (근거, 가장 강함): `path:`는 element 하나의 위치라는 기존 뜻이
있어 capability 주장에 대한 근거 집합까지 맡기면 또 다른 의미 과적재가 된다.
별도 `evidence: string[]`가 object relation과 literal evidence를 더 정직하게
분리한다. **반증 조건**: capability 하나가 서로 포함되지 않는 복수 구현 루트를
필요로 하며 정본 `path:`만 받은 MCP-only 에이전트가 소스를 다시 탐색하거나 구현을
누락하는 사례가 두 vault에서 관측된다. **재검토**: 다음 두 차례 field trial 또는
위 실패의 첫 재현 중 빠른 쪽.

**상태**: 유효

---

## 2026-08-02 — 로컬 에이전트는 3회 근거 수집 뒤 답을 강제하고 60초에 닫는다

**소집**: 단독 PO 패스 · **트리거**: 소유자 직접 지시 — MCP·Ollama
에이전트가 의미 기반 온톨로지를 잘 짓는지 실물 dogfood 하고, 30개씩
쏟아지는 이상 구조와 시스템 프롬프트를 재검토하라는 요청. **루브릭**: 21/24
(치명적 0: 없음).

**선행 결정 관계**: 2026-07-31 「팬아웃 상한이 아닌 노드 자격 게이트」는
그대로 유효하다. 이번 실측은 10·20 상한을 만들 근거가 아니라, 하나의
로컬 모델이 목록을 실제 노드로 착각하는 경로를 더 명확히 보였다. 2026-08-01
「네 번째 연결은 문이다」의 재검토 조건(첫 실제 로컬 볼트 작업)이 충족됐다.

**관측**: 설치 앱 + `gemma4:12b` + Ollama 0.32.5에서 구조 감사는 3회
왕복에 63.009초 + 12.832초 + 43.370초(합 119.211초), 67,264자를 전송했다.
다음 결과는 30개 capability 목록만 읽고 실제 부모를 하나도 읽지 않은 채
중간 결론을 냈고, `[[slug]]` 인용이 없어 화면에서 근거 없음으로 강등됐다.
같은 18,888자·15도구 요청의 `list_kinds` 선택은 Ollama 기본 사고 모드
29.885초, `reasoning_effort: low` 3.610초였고 두 응답의 tool call은 같았다.
그러나 복잡한 실제 감사에 low 만 적용한 재실행은 첫 왕복 59.692초,
총 7왕복·291.450초·217,491자였다. 프롬프트 보강으로 실제 부모를
`get_concepts`로 읽기는 했지만 6회 도구 턴을 소진했고, 도구 없는 마무리가
117.310초 동안 reasoning 만 내고 사용자 답을 내지 못했다. 같은 복잡한
첫 요청을 `reasoning_effort:none + tool_choice:required`로 주면 0.632초에 같은
`list_kinds` tool call을 냈다. 조건부 정책을 설치 앱에 반영한 세 번째 실행은
25.383 + 44.266 + 10.375 + 3.892 + 3.507 + 3.203초의 6회 읽기와
21.222초의 마무리(합 111.848초)까지 줄었지만, 모델이 「최대 3회」 지시를
무시하고 한 번에 한 도구만 불렀으며 마무리 본문도 비워 똑같이 답하지 못했다.
강제 합성을 넣은 네 번째 실행에서는 첫 읽기 21.703초 뒤 두 번째 요청이
기존 Rust 상한 180초를 모두 쓰고 timeout 됐다. 화면은 이를 일반 연결 실패로
표시했다. Ollama는 그동안 GPU에서 실행 중이었고 감사 로그도 정확히
180.016초·`outcome:error`를 기록했으므로 연결 단절이 아니라 생성 지연이다.
모든 턴의 사고를 끈 다섯 번째 실행은 24.330초 뒤 `tool_choice:required`를
무시하고 실제 도구 없이 「조사하겠다」는 계획만 반환했다. 같은 모델에 특정
함수 `list_kinds`를 지정한 OpenAI 호환 요청은 1초 안에 실제 tool call을 냈다.
이름 지정 도구와 3회 회수를 반영한 여섯 번째 `gemma4:12b` 실행은 첫 도구를
2.060초에 실제로 불렀고 6개 의심 노드까지 읽었지만, 최종 합성이 60.015초에
timeout 됐다. 같은 설치 앱에서 `qwen3:8b`는 13.920 + 1.414 + 2.653초의
세 읽기와 34.009초의 합성을 끝냈다. 그러나 개별 본문을 읽기 전에 목록 세 번을
써 `elements/billing` 같은 검증하지 않은 예를 말했고 화면에서 근거 없음으로
강등됐다. 빠른 답과 좋은 답은 별도 게이트다. 이후 qwen은 이름 지정
`tool_choice`를 받고도 허용된 15개 중 `list_kinds`를 골라 계약을 무시했다.
필수 턴의 도구 목록 자체를 하나로 줄이자 `list_kinds`(5.824초) →
`list_concepts({kind:"capability"})`(2.484초)까지는 정확히 수행했다. 그러나
본문 묶음 읽기만 허용한 세 번째 요청은 6.161초 뒤 `get_concepts` 없이 끝났다.
앱은 30개 목록을 읽은 사실만 표시하고 답을 「읽은 근거 없음」으로 강등했다.
작은 로컬 모델의 도구 준수는 API 지원 선언과 별도 품질 게이트다.

설치 앱 검증에서도 거짓 양성이 하나 나왔다. Next 정적 청크 URL은 코드가
바뀌어도 같을 수 있고, 로컬 Tauri 빌드는 기존 실행 바이너리를 재사용할 수
있으며 WebKit 자산 캐시도 설치 사이에 남았다. 실제 감사 로그가 새 정책과 다른
도구 순서를 기록해 발견했다. 실행 바이너리 재링크와 WebKit의
`NetworkCache`/`CacheStorage` 제거 전에는 새 앱을 검증했다는 증거가 아니었다.

**결정**:

1. 주소로 연결한 OpenAI 호환 러너는 모든 왕복의 `reasoning_effort`를
   `none`으로 둔다. 반드시 읽기를 시작해야 하는 첫 왕복에는
   막연한 `required`가 아니라 특정 읽기 도구를 지정하고, 그 턴에 제공하는
   도구 목록도 하나로 줄인다. 화면에서 개념을 보고 있으면 `get_concept`다.
   전체 지도는 `list_kinds`로 방향을 고른 뒤 `list_concepts`로 후보를 고르고,
   `get_concepts`로 실제 본문을 묶어 읽는다. census는 방향 선택일 뿐 판정
   근거가 아니다. `required`와 이름 지정만으로는 실제 설치 모델의 도구
   이탈·생략을 막지 못했다.
   `low`를 중간 판단에만 남긴 설치 앱 실험도
   180초 timeout을 냈으므로 사고 시간이 곧 판단 품질이라는 가정을 버린다.
   품질은 실제 노드 읽기·정확한 인용·결함 재현으로만 판정한다. 세 번의 도구
   왕복 뒤에는 어댑터가 도구를
   회수하고, 검증한 근거만으로 지금 답하라는 명시적 사용자 메시지와 `none`을
   보낸다. 프롬프트의 턴 제한은 지시이고 실행기의 회수는 계약이다.
2. 앱 시스템 프롬프트의 `element` 정의를 「파일」에서 「구현 역할」로
   바꾼다. 파일 경로는 역할의 근거이지 노드 생성 이유가 아니다.
3. 구조 감사에서 census/list는 의심 대상을 고르는 데만 쓴다. 팬아웃·중복·
   브리지를 판정하기 전 `get_concept(s)`로 실제 부모와 해소된 이웃을 읽고,
   독립적인 읽기는 한 응답에 묶는다. 최대 3회 증거 수집 턴 뒤에는 검증한
   범위만 답하고, 나머지는 넓은 문제 없음이 아니라 감사 미완료로 보고한다.
4. 로컬 러너의 한 왕복 상한은 60초, 명명 원격 제공자는 기존 180초로 분리한다.
   로컬 timeout은 일반 연결 실패로 숨기지 않고, 질문을 좁히거나 더 빠른 모델을
   고르라는 별도 안내로 표시한다.
5. 로컬 macOS 배포는 `.app` 폴더만 지우지 않는다. 정적 자산을 내장하는 Tauri
   실행 바이너리를 매번 재링크하고, 앱 종료 뒤 WebKit의 두 자산 캐시만 지운다.
   IndexedDB·LocalStorage를 포함한 WebsiteData는 보존한다.

**근거 범위**: [Ollama OpenAI 호환 문서](https://docs.ollama.com/api/openai-compatibility)는
`reasoning_effort`, `tool_choice`, tools를 현재 지원한다. 온톨로지 품질은 노드 수 자체가 아니라
요구·질문 충족과 모델링 피트폴로 판정한다. OOPS! 카탈로그는 다의성·동의어
중복·고립 요소·영역 정보 누락을 피트폴로 다루지만 보편적 자식 수 상한은
두지 않는다. [LLMs4OL](https://arxiv.org/abs/2307.16648)의 결과처럼 기본
제로샷 LLM을 온톨로지 판정자로 믿지 않고 도구·근거·검증으로 감싼다.

**기록된 반대**: `reasoning_effort` 는 Ollama에서 유효해도 모든 OpenAI 호환
러너가 받는 필드라고 보장할 수 없다. 또 사고를 모두 끄면 어려운 중복·브리지
판단의 품질이 떨어질 수 있다.

**반증 조건**: 지원 모델이 `reasoning_effort` 또는 이름 지정 `tool_choice` 미지원
필드로 첫 왕복을 400 거절하거나, 동일 구조 감사에서 조건부 정책이 기본보다
실제 부모 읽기·인용·결함 재현을 열화하면 반대가 옳았다. 전자는 연결 검증의
러너 capability 판정+필드 강등, 후자는 조건부 정책 철회로 돌아간다. 정상적인
로컬 응답이 반복해서 60~180초 구간에서만 완성되면 60초 상한도 다시 조정한다.

**재검토**: 실제 본문 읽기를 생략한 로컬 응답을 실행기가 재시도/실패로 다루는
다음 슬라이스 뒤, 또는 Ollama 외 로컬 호환 러너 첫 연결 뒤. **서명**: stark.
**상태**: 유효.

---

## 2026-08-02 (2) — 「AI 가 디자인한 것 같다」를 지문 여섯으로 번역하고, 복도 하나를 지운다

**소집 근거**: 소유자 직접 — *"이것도 파란색 배경에 뭔가 너무 ai가 디자인한것같이 생겼거든? 아예 리디자인 가능할까?"*
— **소집한 자리**: 디자인 5석(위계 · 체계 · 상호작용 · 작업대 · 핸드오프) · **이유**: 한 시트의 위계·값 규칙·선택 문법·설치 앱 계약·에이전트 핸드오프가 동시에 닿았다. **모션 · 반응형 · 도해는 부르지 않았다** — 이 화면에 전이·브레이크포인트·데이터 마크가 없다. 비용 통제는 chief 소유다.
**선행 결정 관계**: 2026-08-02 (1) 기록의 **OUT 항목이던 A-3(복도 판 제거 + LNB 승격)를 이번에 이행**한다. 새 결정이 아니라 미뤄둔 것의 집행이다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 위계 | **반려**(현행) · 재설계 승인 | 「이 화면의 일」 = *내가 쓰는 도구 하나를 골라 이 폴더에 붙이고, 붙었는지 확인한다* · **단계는 셋이 아니라 하나**(컨트롤 있는 단계 1개) · 강등 6건 |
| 체계 | 조건부 | 보더 4단 실측 · quarantine 앰버 48건/9파일(이 파일이 15건 최대 소비처) · `--color-indigo-a24` 24건/19파일, `Button` 프리미티브 경유 **0건** |
| 상호작용 | 조건부 | **전폭 블록 넷이 맞다**(세그먼트 반려) · `primary` 하드코딩이 결함 · focus-visible 링 토큰 부재 · 안심 문단이 선택 뒤에 있다 |
| 작업대 | 조건부 | 14인치 창 계약 **안전**(여유 289px) · 클라이언트 감지 **가능**(이미 절반 존재, 결함은 배선 누락) · home 스코프는 헌장 밖 |
| 핸드오프 | 조건부 | 계약 **실재**(`mcp-verify` 라이브 32도구) · ②재시작은 **참** · **③이 거짓 약속** |

**루브릭 합계**: 19/24 (통과선 18 · 치명적 0: 없음)

**갈린 지점 둘 — chief 가 규칙으로 풀었다**

1. **버튼 넷의 형태.** 위계석 「넷을 한 고르개(세그먼트)로」 vs 상호작용석 「전폭 블록 넷이 맞다, 세그먼트는 틀리다」.
   **적용 규칙: 최소 슬라이스 → 상호작용석 채택.** 근거: 네 버튼은 **서로 다른 파일에 쓴다**(`.mcp.json` / `.codex/config.toml` / `.cursor/mcp.json` / `.agents/mcp_config.json`). 한 사람이 Claude Code **와** Codex 를 둘 다 붙이는 것이 정상 시나리오이고, 배타적 단일선택 위젯은 **그 기능을 숨긴다**. 위계석의 목표(넷이 동등하게 읽힌다)는 **채움 해제만으로 달성**되므로 세그먼트는 목표에 불필요하다. 기능 은폐는 되돌릴 수 없는 손실이라 형태 논거가 이를 이기지 못한다.

2. **감지 신호를 지금 배선할 것인가.** 작업대석 「이미 있는 파일 존재 신호로 이번에」 vs 상호작용석 「지금 배선하면 안 된다」.
   **적용 규칙: 최소 슬라이스 → 상호작용석 채택.** 상호작용석 원문: *"신뢰도가 확정되기 전에 없는 신호를 있는 척 배선하면 「명시적 거짓」(#828 이 이미 잡은 부류)을 새로 만드는 꼴이다. 지금 할 수 있는 최소 조치는 하드코딩을 없애 넷을 동등하게 만드는 것뿐."* 작업대석 자신도 같은 위험을 반대 논점으로 적었다 — 파일 존재는 「지금 쓰는 도구」가 아니라 **「예전에 한 번 쓴 도구」**를 가리킬 수 있다.

3. **카드 크롬을 이번에 걷을 것인가.** 위계석 「미루자」 vs 체계석 「동반 필수」 — **충돌이 아니었다.** 재보니 서로 다른 크기를 말하고 있었다: 위계석이 미룬 것은 **카피 통합**(두 표면 × 두 로케일), 체계석이 하자는 것은 **컴포넌트 교체**(`StepCard` → `StepRow`, 소비처 3곳, 카피 불변). 그 선에서 갈랐다 — 합집합이 아니라 분할이다.

---

### chief 가 틀렸던 것 — 셋

첫 브리프에서 「AI 같다」를 지문 여섯으로 번역해 넘겼다. **그중 둘이 틀렸고 자리들이 정정했다.**

1. **지문 1 「선택지가 아니라 목록인데 버튼이 크다」 — 기각됨.** 위 갈림 1 참조. 전폭 블록 넷이 옳다.
2. **지문 5 「앰버 배지가 헤더와 다툰다」 — 정정됨.** 위계석 실측: 배지(y=195, 9.5px)는 시트 헤더(y=130, 14px)와 다투지 않는다. 패널 제목(y=196, 11px)과 같은 눈높이이고 그보다 **작다**. 진짜 결함은 「다툼」이 아니라 **같은 사실의 3회 중복**이었다(「누락」 → 「0/3개 준비됨」 → 526px 아래 「0/3 준비됨」).
3. **「오른쪽 여백 188px」 — 재현 안 됨.** 위계석 실측: 팝오버는 880 폭 중앙 정렬(좌 316 / 우 316)이고 드릴인 여백은 좌 49 / 우 27(22px 어긋남). **더 강한 사실이 대체했다** — 드릴인하면 LNB 180px 가 통째로 사라지고 878px 을 802px 한 칼럼이 쓴다. 그 자리는 이미 비어 있었다.

**교훈**: 소유자의 감각어("AI 같다")를 지문으로 번역하는 것은 chief 의 일이 맞다. 다만 그 번역은 **가설이지 판정이 아니다** — 자리가 실측으로 기각할 수 있게 "틀리면 정정하라"를 명시적으로 붙여야 한다. 이번엔 붙였고 둘이 기각됐다. 안 붙였으면 chief 의 오독이 처방이 됐다.

---

### 기록된 반대 (반증 조건 포함)

**1. 위계석 — 채움 해제가 틀릴 수 있다.**
> *"Claude Code 를 채운 건 위계 오류가 아니라 옳은 베팅이다. 사용자 대다수가 Claude Code 라면 70% 를 맞히는 기본값이 모두에게 읽기를 시키는 동등한 넷보다 낫다."*
**반증 조건**: 5초 노출 3인 테스트 또는 실사용에서 **Claude Code 사용자 비율 ≥70%** 가 관측되면 채움이 자기 값을 한다. **그때의 처방은 「넷 다 평평」으로 되돌리는 것이 아니라 「기본이라고 말하기」다** — 채워진 것에 「대부분 여기서 시작해요」를 붙여 **탈락 셋이 아니라 기본 하나**로 읽히게 한다. 색만 다르면 사용자는 「추천」이 아니라 「탈락」으로 오독한다.
**오늘의 정직한 위치**: 사용자 0명 · 근거 0 → **기본 없음**.

**2. 위계석 — 번호를 없애면 진도감이 사라진다.**
**반증 조건**: 재설계 후 처음 보는 사람이 버튼을 누르고 **「된 건가? 이제 뭐 하지?」**를 물으면 번호는 장식이 아니라 하중을 받고 있었던 것이다. 복구는 번호 원이 아니라 **눌린 버튼의 done 상태가 다음 문장을 말하게** 하는 것.

**3. 작업대석 — 파일 존재는 「지금 쓰는 도구」가 아니다.**
**반증 조건**: 볼트 10개 이상 표본에서 「가장 최근 exists 파일」과 「가장 최근 `heartbeat.agent`」가 **30% 이상 불일치**하면 exists 단독 배선은 기각이고, heartbeat 를 우선 신호·exists 를 보조로 바꾼다.

**4. 체계석 — 이번 교체가 26건 반려 때와 같은 것 아닌가.**
**반증 조건**: `StepCard` → `StepRow` 교체가 소비처 3곳 + import 1곳을 넘어 **다른 컴포넌트로 번지면**(예: `settings-primitives.tsx` 의 다른 카드류까지 손대야 컴파일되면) 이 반대가 옳았던 것이고 범위를 좁혀야 한다.

**5. 핸드오프석 — 설정 서브뷰는 부차 경로다.**
> *"지도 시트가 이미 실제 heartbeat 확인을 제공하고 그것이 주 연결 경로다. 설정 서브뷰에 같은 배선을 중복 투자할 값어치가 낮을 수 있다."*
**반증 조건**: 「설정 → AI 에이전트」가 사용자의 **첫 연결 시도 경로**로 지도 시트와 동등하거나 더 많이 쓰인다는 신호(톱니바퀴가 초심자에게 더 익숙한 진입점)가 나오면 배선은 필수가 된다. 그전까지는 **문구를 사실로 낮추는 것**으로 충분하다 — 이번에 그렇게 했다.

**재검토**: 첫 외부 사용자가 자기 도구를 붙여 본 뒤 — 1·3·5 가 그 자리에서 갈린다.

---

### 슬라이스

**IN (#835)**
- **S1** 복도 판 제거 + LNB 6→7행 + 개명. 실측: 오른쪽 칸 빈칸 **85.1% → 43.4%**, 잉크 92px → 349.5px, 드릴인 전환 2→0, 뒤로가기 1→0, LNB **드릴인 중 소실 → 상시**, 「AI」로 시작하는 이름 **3 → 0**. 14인치: LNB 300px / 가용 617px, 여유 317px, 행 높이 분산 0, 잘림·겹침 0.
- **S2** 강등 셋 — `>_` 글리프 버튼당 1→**0**, 네 버튼 배경 **전부 동일**(치수 분산 0 유지), 「누락」 배지 1→0. `primary` prop **자체를 제거**해 넘길 경로를 없앴다.
- **S3** 구조 교체 — 보더 중첩 **4단 → 3단**(`StepCard` → `StepRow` 승격), 격리 앰버 도색 **4 → 0**, focus-visible 링 **없음 → 인디고 토큰**, `--color-indigo-a24` **1 → 0**. 잉여가 된 격리 토큰 3개 삭제.
- **추가** ③단계의 거짓 약속을 사실로 낮춤(새 i18n 키 0).

**OUT (다음 묶음, 근거 포함)**
- **카피 통합** — 설정의 「연결 파일 0/3 준비됨」과 지도 시트의 「아직 연결 전이에요」가 **같은 상태를 다르게 말한다**. 두 표면 × 두 로케일이라 S1·S2 착지 후 한 번에. 지금 하면 세 번 그린다.
- **③단계 heartbeat 배선** — `useLocalVault()` 가 `agentActivityStatus` 를 **이미 들고 있어** 비용은 작지만 카피 통합과 한 묶음.
- **`--settings-content-measure` 삭제** — 실측으로 no-op 확정(칸 폭 658px = 토큰 값). **#833 이 넣은 것이라 이 브랜치 베이스에 아직 없어 지울 대상이 없었다.** #833 머지 후 후속.
- **타입 방언 확장**(9.5 → 11px) — `ROOT_SHEET_FILES` 계약을 건드리고 **룰 켜기 전 전수 측정 선행**(55건 중 몇 건이 첫 화면인지)이 필요하다. 절차 없이 끼우면 소음.
- **웹 CLI 안내 과잉 차단** — 「고급 · 자세한 검증」이 `publicPackagesReady`(번들 서버 실행 가능 여부) 뒤에 있는데 CLI 는 소스 체크아웃 하나로 돈다. **게이트 이름이 잘못된 것을 잡고 있다.**
- **세그먼트 전환**(영구 기각) · `recommendedClientId` 배선 · home 스코프 감지 · `ProjectDrawer`/`LiveActivityIndicator` 앰버 17건 · `--color-indigo-a24` 나머지 18곳 · raw rgba 리터럴 2곳 · 패널 내부 h3 「AI 에이전트 설정」(카피 통합 묶음, 다음 패스 1순위)

**appetite** — 1 PR, 반나절

**제거/강등** — 복도 판 전체 · `>_` ×4 · `primary` prop · 「누락」 배지 · `StepCard` 함수 · 격리 앰버 토큰 3개

**게이트** — 신규 4종(`step-card-retired` · `agent-client-buttons-use-shared-button` · 「넷은 같은 무게다」 2종 · eslint `color-amber-docs-` 경로 금지) **전부 `/gate-probe` 로 빨개짐 확인**. 앰버 룰은 **켜기 전 전수 측정**(해당 경로 위반 0) 후 켰다. `lint` 159 warning / 0 error, baseline 대비 증가 0.

**머지 순서** — #833 → #835 → `feat/vault-character` 리베이스. 충돌 지점: `nav.settingsMenu.section` 행 집합, `groupAgent`·`agentTitle`·`agentBody`·`agentBackLabel`·`agentStatusReady`·`agentStatusRepair` 삭제, `settings.ai.rowLabel/rowBody/chip*` 삭제, `scripts/validate-messages.test.mjs` 고정 문장 블록 2곳.

**서명 (accountable: 소유자)**: 대기 — **개명 A안**(「내 에이전트 연결」 / 「앱 안 에이전트」)으로 넣었다. 뒤집으려면 `messages/{ko,en}.json` 두 줄만 고치면 된다(코드 무관). **설치 앱 실측은 대기 중** — 번들 MCP 바이너리를 만들지 못해 앱을 싸지 못했고, 데스크톱 분기는 Tauri 브리지 스텁으로 렌더시켜 확인했다.

---

## 2026-08-02 — AI 연결·에이전트 턴: 화면이 사실과 다른 것을 말한 자리 넷을 끊는다 (반복 지적 2건 포함)

**소집 근거**: 소유자 직접 지시 3회 — *"저 설정창 디자인 변경해달라고 했는데 왜 안했지.. 다시 해봐줘 UI/UX 디자인 모션 전문가 모셔서 지금당장"* · *"에이전트 뭔가 너무 별로인것같아보이지 않아? 선택지 이런것도 없고.. 자동으로 해주는것도 없는것같고?"* · *"이거 ai연결 팝업창이 너무 가로가 길다니까?"*(「니까」 = 반복 지적 표시)
— **소집한 자리**: 디자인 6석(위계 · 체계 · 상호작용 · 모션 · 작업대 · 핸드오프) + PO 1석(지킴이 단발) · **이유**: 세 표면(설정 AI 연결 · 에이전트 입력 칸 · 에이전트 턴)이 닿았고, 자동 발견은 신뢰 헌장 판정이 필요했다. PO 5인 전원은 소집하지 않았다 — 지킴이가 「제안→적용은 새 표면 신설이 아니라 기존 표면 결함」으로 판정해 트리거가 서지 않았다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 위계 | C 반려 · A/B 조건부 | 「이 화면의 일」 3문장 · 주목 승자 3개 전부 실물에서 지고 있음 · 스케일 대비 1.14×(위계 없음) · 복도 판 제거 |
| 체계 | 조건부 | `Select` 는 일회성 버그 아닌 **프리미티브 결함** · 테두리 문법 통일은 전수 26건이라 **반려**(한 PR 로 못 치움) · 문자수 렌더 제거 |
| 상호작용 | 조건부 | 잘린 글자는 렌더링이 아니라 **스크롤 위치 계산 버그** · 경고를 두 갈래로 · 선택지 셋 중 「후속 질문」 하나만 |
| 모션 | B 반려 · A 조건부 · **C 판정 무효** | 입력 칸 전이 **부재**(420프레임 1상태) · 스크롤 9px 순간이동(줄높이 20px 비배수) · 드롭다운 닫힘 98%가 1프레임 |
| 작업대 | 조건부 | 설치 앱 실측 · 자동 발견 **가능**(새 IPC 불필요) · **웹 CORS 안 막힘**(실측이 예상을 뒤집음) · `agent-loop.ts:225` 조기 종료 무통보 |
| 핸드오프 | 조건부 | 쓰기 배관 건강(계약 33/33) · 결함은 **번역 누락** · 「무엇을 읽었나」는 계기가 아니라 **근거** |
| 지킴이(PO) | Build and verify | 자동 발견 **헌장 안** · 선은 「찾기 클릭 시에만」 · Agent value **0/4 명시 선언** |

**루브릭 합계**: 20/24 (통과선 18 · 치명적 0: 없음)

**갈린 지점**: **화면이 사실과 다른 것을 말할 때, 고칠 쪽이 문구인가 판정 로직인가.** 「읽은 근거 없이 답했어요」는 문구가 정직했고 판정이 틀렸다(`citation.ts:53` 이 인용 표기 `[[slug]]` 개수만 셈 — 도구 4회·1,336자를 읽은 턴에 강등). 「웹에서는 안 됩니다」는 조건절이 참인데 인상이 거짓이었다(Ollama 기본값이 이미 CORS 를 허용 — 실측 `/v1/models` 200, `/v1/chat/completions` 200). **둘 다 문구가 아니라 그 아래를 고쳤다.**

**적용한 규칙**:
- **합집합 금지** ×2 — ① 문자수 처방이 체계석(렌더 제거) vs 핸드오프석(`title` 강등)으로 갈렸다. 둘 다 「데이터는 지우지 않는다」에 합의했고 남은 차이에서 **더 작은 쪽**을 골랐다. ② chief 브리프가 상호작용석 칩 + 작업대석 notice 를 **둘 다** 실어 한 화면에 경고가 셋이 됐다 — **브리프가 합집합이었다.** 두 줄로 접었고 타입 코드는 데이터 층에 남겼다.
- **최소 슬라이스** — 드롭다운 우선순위 갈림(위계석 S6 vs 상호작용석·작업대석 심각)에서 후자 채택. 근거는 미관이 아니라 **기능 도달 불가 + 접근성 위반**(7개 중 1개만 클릭 가능, 스크린리더는 7개를 다 안내 → 키보드 사용자와 마우스 사용자가 다른 세상을 본다).
- **제거 요구** — 각 자리가 제거·강등 대상을 최소 1개씩 냈다. 순증 0.

**권고 (chief)**: 두 PR 로 나눠 이행. **#832**(입력 칸 + 턴 신호) · **#833**(문구 + 폭 + 목록 + 퇴장).
**서명 (accountable: 소유자)**: 대기

---

### chief 가 틀렸던 것 — 기록에 남긴다

첫 브리핑에서 rc.6 백로그의 「AI 시트 폭 846 → 520px」을 **원장에서 못 찾았다는 이유로 인용 불가 처리**했고, 구현 지시에 *"시트 폭 880×640 은 손대지 마라"* 라고 썼다. **그것이 이번 반복 지적(3번째 트리거)의 직접 원인이다.**

846 은 지어낸 수가 아니었다 — 위계석 실측: `도크 880 − 보더 2 − 패딩 32 = 산문 칼럼 846px`. 백로그는 **도크 폭이 아니라 산문 칼럼 폭**을 재고 있었다. 원장에 없다는 사실과 관측이 틀렸다는 것은 다른 명제인데 후자로 취급했다.

**교훈**: 기록되지 않은 평결은 *인용*할 수 없을 뿐 *관측*까지 무효는 아니다. 다음 소집은 「원장에 없음」을 **재측정 지시**로 바꿔야지 기각으로 쓰면 안 된다.

---

### 기록된 반대 (자리별 · 전부 반증 조건 포함)

**1. 모션석 — 자기 처방을 자기가 공격했다.**
> *"자람 전이 자체가 사족이다. 입력 칸은 최고빈도 표면이고 내 헌장이 그 예산을 `0~--motion-fast` 로 못박는다. `--motion-base`(180ms)는 내가 내 규칙을 어긴 것이다."*
**반증 조건**: 자람을 켠 뒤 **「타자가 무겁다」는 보고**가 나오면 반대가 옳았다. 그때 답은 임의로 깎는 것이 아니라 `--motion-fast`(120ms)로 **한 단 내리는 것**이고, 그래도 무거우면 전이를 제거한다. **소유자가 호소한 잘린 글자를 실제로 없애는 것은 자람이 아니라 스크롤 배수 정렬**이므로 이 반대가 이겨도 증상은 안 돌아온다.

**2. 상호작용석 — 드롭다운을 뒤로 미루면.**
> *"지금 안 고치면 사용자는 `gemma4:12b` 하나로 영원히 갇힌다."*
**반증 조건**: 채택됐으므로 이 반대는 이겼다. 반대 방향의 반증 — 포털 전환 후 다른 표면에서 팝오버 위치 회귀가 관측되면 프리미티브 전환이 성급했던 것이다.

**3. 작업대석 — 웹 CORS 관측의 수명.**
> *"「웹에서 Ollama 가 CORS 를 막지 않는다」는 이 기계의 이 순간의 기본값일 뿐이다. Ollama 가 `OLLAMA_ORIGINS` 기본값을 강화하면(보안 커뮤니티가 이미 요구해 온 방향) 이 관측은 뒤집힌다."*
**반증 조건**: Ollama 릴리스가 기본 오리진 정책을 좁히면 관측이 뒤집힌다. **그래서 문구를 「CORS 때문에 안 된다」가 아니라 「이 러너의 CORS 설정과 무관하게, 이 앱이 웹에는 전송 경로를 두지 않기로 선택했다」로 썼다** — 기본값이 바뀌어도 참인 문장이다. 웹 게이트를 여는 조건은 **po-steward 판정 대기**(질문 3, 미도착 — 도착 시 후속 기록).

**4. 지킴이 — 코드 존재가 동작 증명은 아니다.**
> *"쓰기 파이프라인이 코드상 있다고 해서 사용자 경험상 작동하는 건 아니다. 코드 존재만으로 「신설 아님」을 단정하는 건 이르다."*
**반증 조건 → 관측됨.** 작업대석 실측에서 **도구 호출은 실제로 발생했고**(`list_kinds`, `list_concepts` 감사 로그·화면 양쪽 확인) 카드도 정상 렌더됐다. 실패는 다른 곳이었다 — `agent-loop.ts:225` 가 4번째 왕복의 도구 0회를 상한 6라운드 중 3라운드에서 「정상 종료」로 접수. **원장 2026-08-01 이 예고한 처방(네이티브 `/api/tags` 의 `capabilities` 로 도구 지원 판정)은 이 실패에 안 맞는다** — 모델은 이미 도구를 썼다.

**5. 위계석 — 「다음 한 걸음」 승자 지명의 위험.**
> *"도구를 못 부르는 로컬 모델에서는 화면에서 가장 강한 자리가 매 턴 「아무것도 안 했어요」로 채워진다. 가장 강한 계급에 실패를 상주시키는 설계다."*
**반증 조건**: 로컬 러너에서 **3턴 연속 도구 호출 0건**이 관측되면 승자 지명이 틀린 것이다. 그때 이겨야 하는 것은 「다음 한 걸음」이 아니라 **「이 모델은 도구를 못 불러요 · 바꾸기」**이고 승자 자리는 모델 교체가 가져간다.

**6. 구현자(#832) — 칩 개수 상한 없음.**
**반증 조건**: 한 턴에 **10개 이상 노드를 읽어 칩 줄이 답보다 길어지는 화면**이 관측되면 「N개 더」 접기를 넣는다. 데이터 없이 접기 규칙부터 만드는 것은 순서 역전이라 이번엔 안 넣었다.

**재검토**: 소유자가 로컬 러너로 볼트 작업을 한 번 끝낸 뒤 — 위 1·5·6 의 관측이 그 자리에서 갈린다.

---

### 슬라이스

**IN (#832)** — `input.select()` 제거 + `scrollTop` 줄높이 배수 정렬(잘림 0 실측) · 자람 2~6행(58→138px) · `demoted` 판정 2갈래 + `readSlugs` 칩 기계 보정 · `no-tool-call` 타입 코드 · 문자수 `title` 강등 · 원시 마크다운 스트립
**IN (#833)** — 웹 강등 문구 원인 순서 반전(ko·en) · `Select` 포털 + 충돌 회피(가시 14.8%→100%, 클릭 가능 1/7→6/6) · 퇴장 80ms `select-unpop`(`usePanelPresence` 재사용) · `--settings-content-measure: 658px`(루트 얼굴 유도값) · 산문 520px 캡 · `ai-what-it-unlocks` 9.5→11px

**OUT (다음 묶음)** — 자동 발견 「찾기」 · 주소 칸 강등 · **A-3(복도 판 제거 + LNB 2행)**. 셋이 한 흐름이다. `--settings-content-measure` 는 A-3 와 forward-compatible(그 칸이 이미 658px 이라 캡이 no-op 이 된다).
**OUT (영구)** — `--connect-measure` 신설(같은 값 `--git-setup-measure` 가 이미 존재) · 시트 폭 880×640 변경(소유자 2026-07-29 고정값 — **행 폭을 묶었지 시트를 줄이지 않았다**) · 테두리 문법 전역 통일(전수 26건, 한 PR 로 못 치움 — 진짜 이상치 1건만) · `NEXT:` 마커를 순수 읽기 턴까지 확장 · 웹 `bridgeAvailable` 게이트 개방
**appetite** — 2 PR, 하루

**제거/강등** — 「이 턴 N자」 상시 노출(한 라운드 고정비 18,934자라 사용자 데이터 크기가 아니다) · 원시 마크다운 · 주소 칸의 컨트롤 지위(다음 묶음) · 복도 판 60% 공백(다음 묶음) · 셰브런 단독 이징 · `.ai-row-disclosure` 를 팝오버 배치 기준으로 쓰던 것

**게이트** — 신설 11건 전부 `/gate-probe` 로 되돌려 빨개짐 확인(#832 6/6 · #833 5/5). #833 은 추가로 **구 빌드에 새 계약을 걸어** `WebView never measured the model list box` 로 빨개지는 것까지 확인 — 탐지기가 빈 집합 위에서 돌지 않는다.

## 2026-08-02 — 첫 실행 카드: 「지금은 샘플」을 네 번 말하는 화면에서 가장 센 잉크가 샘플의 크기였다 — 계기를 캡션으로 강등하고 리드를 주목 승자로

**소집 근거**: PO 카운슬 필수 목록 2건 동시 — ① *낯선 사람이 처음 읽는 문구* ② *북극성 경로(링크 → 앱 → 5분 안에 에이전트가 내 볼트 노드를 인용)의 첫 관문*. 소유자 요청 원문은 *"이 부분도 개선좀 해볼까? 디자인?"* 이었고, 「디자인」이라는 말이 소집을 면제하지 않는다.
**소집한 자리**: PO 5석 전원 · **이유**: 이 표면은 여섯 루브릭 행 전부에 닿는다(첫인상=근거/결, 볼트·에이전트 접점=지킴이, 포지셔닝 첫 접점=해자, 561줄 컴포넌트의 결합=지렛대).
**디자인 벤치는 소집하지 않았다** — 「결」이 이미 실물에서 주목 스택·치수·대비를 실측해 위계석이 할 판정을 수치로 내놨고, 체계석이 지킬 것(새 토큰 0 · 램프 안)은 슬라이스 경계로 못박혔다. 여기서 8석을 여는 것은 조정이 아니라 관료층이다. 디자인 게이트는 `design-guardian` 이 단독으로 졌다.

**선행 결정 점검** — 이 카드 전용 기록은 **없었다**(이 기록이 처음이다). 인접 기록 둘을 인용하고 **둘 다 유효한 채로 둔다**:
- 2026-07-30 「`/` 는 웹 방문자에게 관문」(`isGatewaySurface()`) — 유효. 이 카드는 `/topology` 의 **두 번째 화면**이라는 사실이 이번 소집의 전제가 됐다(근거).
- 2026-07-26 `design.md` 「정의의 진실원은 투어 1단계와 「?」 시트 **둘**」 — 유효하며 **위반 아님으로 판정**. 소집 브리프의 「용어사전이 세 번째 자리가 됐다」는 의심을 「결」이 실측으로 기각했다: 카드의 3행은 `searchWidgets.shortcuts.glossary` **동일 키 재렌더**이고 `GLOSSARY_TERMS` 가 `ontology` 키를 의도적으로 제외하고 있어 새 카피가 0이다. 드리프트가 구조적으로 불가능하다.
- 2026-08-01 「CI 는 볼트 노드 수를 세지 않는다」 — 유효. 계기를 강등하면서도 숫자의 출처를 `topologyCanonicalCensus` 파생으로 유지한 이유가 이것이다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 근거 | Investigate first → (2R) 행동 주장은 유예, 산출물 내재 결함은 지금 | Problem insight **1** · User moment **2**. 첫 프레임은 카드가 아니라 400ms 자동 시트(선택지 3) · 동시 노출은 최대 7이고 등가도 동시도 아니라 Hick 전제 불성립 · Esc 이중타로 카드가 세션 영구 dismiss 되는 경로 실측 · 이 표면 실방문자 미상 |
| 결 | Shape a slice | Verification **4**. 실측: 카드 최대 활자 19px mono(샘플 수치, 최고 휘도) vs 나머지 ≤12.5px · 주목 스택 ①샘플수치 ②CTA ③리드로 목표와 1·3 뒤집힘 · 하단 공백 25.4%(풀스크린 환산 ≈38%) · 상태 신호 **4** · 탭이 `role="tab"` 인데 이미 선택된 탭도 카드를 접음 · 문자열 4건 |
| 지킴이 | Shape a slice | Ontology value **3** · Agent value **2**. 「온보딩이라 N/A」 면제 주장 **기각** · 수치는 실제 census 파생(장식 아님)이나 출처 잉크가 뒤집힘 · CLI 접기의 명령이 라벨 약속과 과녁이 다르고 `agent-setup` 한 링크 앞에서 사슬이 끊김 · 용어사전 3행 삭제 불가(rank17 회귀) |
| 해자 | Shape a slice (원문대로면 반려) | Differentiation **1** (재성형 시 3). `firstRunStarter` 33키에 「에이전트」·「MCP」·「AI」 **0회**(앱 전체 179곳) · 굵은 리드는 Obsidian 이 2020년부터 팔던 문장이고 버튼 구성도 Obsidian 첫 실행과 구조적으로 동일 · Basic Memory 가 에이전트 훅을 먼저 실행 중 |
| 지렛대 | Shape a slice | appetite **1일(실작업 4~6h)**. 진짜 구속 조건은 이 카드가 아니라 1.0 안정판 부재(rc.5 최신, 2주 153뷰/61유니크) · no-go: `globals.css`·`HomePage.tsx`·어포던스 증감·400ms 시트·dismiss/reopen 의미론·e2e testid 15종 |

**루브릭 합계**: **13/24** (통과선 18 · 치명적 0: 없음). 18 미만이라는 사실 자체가 카운슬을 정당화했고, 그래서 이번 결정은 「크게 짓기」가 아니라 **뺄셈**으로 닫혔다.

**갈린 지점**: 이 카드의 결함이 **잉크의 배분**인가 **문장의 내용**인가. 결은 "뼈대는 옳고 틀린 것은 잉크 배분"이라 했고, 해자는 "잉크를 옮겨도 문장이 그대로면 차별화는 안 움직인다 — 이건 Obsidian 첫 실행의 재배치"라 했다. 근거는 제3의 축에서 둘 다에 제동을 걸었다 — "이 표면의 실방문자가 미상인데 누구의 첫인상을 고치는가".

**적용한 규칙**:
- **합집합 금지** — 결(잉크 5처방) + 해자(카피 3키) + 지킴이(엣지 노출)의 **합집합을 만들지 않았다.** 채택된 것은 결의 처방을 뼈대로 하고, 해자에게서 **1문장만**, 지킴이에게서 **배선 없는 정적 예시만** 가져온 것 — 어느 제안보다도 작다.
- **최소 슬라이스** — 온톨로지-에이전트 워크플로를 가장 잘 개선하는 가장 작은 조각으로 **계기 강등** 하나를 중심에 놓았다. 주목 승자를 리드로 되돌리는 단일 성공 조건.
- **제거 요구** — 디자인 패스가 제거 대상을 댔다: `MeterCell` 3분할 계기 블록과 그 `text-[19px]` + `eslint-disable` 이 함께 삭제됐고, 상태 신호가 4→2 로 줄었다. 아무것도 못 지운 패스였다면 실패로 처리했을 것이다.
- **헌장 우선** — 새 토큰 0 · `app/globals.css` 미수정 · 용어사전 3행 보존(rank17) · 숫자 출처는 census 파생 유지(2026-08-01 기록).

**권고 (chief)**: 결의 처방을 뼈대로 한 **하루짜리 뺄셈 슬라이스**. ① 계기 3분할 블록 → 탭 아래 캡션 1행(출처는 census 파생 유지) ② 관계 예시 1개를 **정적 카피로만**(HomePage 배선 no-go) ③ 상태 신호 4→2 ④ 굵은 리드는 **이해 우선으로 유지**하고 회색 뒤에 에이전트 1문장 ⑤ 하단 참조 블록 `mt-auto` ⑥ 탭 자멸 수정(이미 선택된 탭은 접지 않음, semantics 를 선택 컨트롤로) ⑦ 문자열 4건 ⑧ CLI 접기는 **라벨의 거짓만 제거**(명령은 손대지 않음) ⑨ dogfood 노드 갱신.

**서명 (accountable: 소유자 → 조정자에게 위임, 2026-08-02)**: **승인.** 확인 항목 둘 다 답이 왔고 **둘 다 기본값이 유지됐다** — 즉 이 PR 의 내용은 바뀌지 않는다. 아래는 원래 열려 있던 두 항목과 그 답이다.
1. **「디자인?」이 보임새인가 읽힘새인가.** 기본값: 둘 다이되 보임새 먼저. → **답: 보임새(앞쪽)가 맞다. 기본값 유지.** 근거 셋이 제시됐다: ① 소유자가 **문장을 인용하지 않았다** — 문구가 문제일 때는 늘 그 문장을 짚었는데(「곧」 배지 · 「연결할 수 없어요」 · 「전체 문서」) 이번엔 **패널 전체**를 가리켰고, 그것이 "무엇이 잘못됐는지 이름 붙일 수 없다"는 뜻이며 위계 결함의 지문이다. ② 실측이 그 인상을 설명한다(19px 샘플 수치가 주목 1위 · 하단 25% 빈 꼬리). ③ 굵은 리드 교체는 **포지셔닝**이지 이 슬라이스의 일이 아니고, 소집이 스스로 「1일 · 어포던스 증감 0」으로 묶었다.
   **그러므로 이번 범위는 회색 뒤 1문장까지다.** 굵은 리드 교체의 **후속 조건**: 신규 5인 모더레이티드 세션(반대 ② 참조)이 관측 채널로 예정돼 있으므로, 그 세션에서 해자의 반증 형태가 관측되면 그때 굵은 리드를 에이전트 훅으로 교체한다. 세션 전에는 바꾸지 않는다.
2. **「개발자라면 —」 접기의 약속이 「내 리포」인가 「atlas 체크아웃 구경」인가.** 기본값: 이번엔 문구를 명령이 실제로 하는 일에 맞춘다(거짓 제거). → **답: 의도는 「내 리포」다. 다만 이번 PR 에서 고치지 않는다 — 라벨을 명령에 맞춘 처리가 지금은 옳다(거짓말을 먼저 없애는 것이 순서다).**
   근거: **Atlas 가 자기를 bootstrap 하는 것은 사용자에게 아무 값이 없다** — 옆 탭의 dogfood 샘플이 이미 그것을 공짜로 준다. 쐐기는 *"내 코드베이스에서 내 지도가 자란다"* 뿐이고 해자 자리가 그것을 정확히 짚었다(Differentiation 1/4 의 실질). 지킴이는 같은 다리가 북극성이 요구하는 `agent-setup` 한 링크 앞에서 끊긴다는 것도 실측했다.

**후속 1건 등재 — CLI 다리의 과녁을 바꾼다** (이 기록의 결정이 **아니라** 다음 결정의 예약이다):
- **내용**: 「개발자라면 —」 접기의 명령이 상대경로로 atlas 체크아웃 자신을 bootstrap 한다. 라벨은 이번에 명령 쪽으로 좁혔으나 **의도는 반대이며, 명령을 고치는 것이 옳은 방향이다.**
- **선례는 CLI 안에 이미 있다**: `cli/src/index.mjs:500` 이 `bootstrap . --vault <cwdVaultArg>` 형태를 힌트로 출력한다(같은 파일 496행의 `analyze`, 570행의 `runBootstrap` 도 같은 꼴). 즉 「내 리포」 문법은 발명이 아니라 **이미 있는 것을 카드가 잃어버린 것**이다.
- **후속 작업 조건**(반증 조건이 아니다 — 이건 틀렸는지를 묻는 항목이 아니라 언제 하느냐의 항목이다): CLI 공개 계약 변경이므로 ① 별도 PO 패스 또는 소집이 선행하고 ② `pnpm decisions:check` 가 강제하는 자리라 같은 PR 에 원장 기록이 붙어야 한다. 이번 슬라이스에 섞지 않는다.

**기록된 반대 ①** (지킴이): *"집계 3개보다 실제 엣지 1개(`주문 —depends→ 배송`)가 「관계」가 무엇인지 더 가르친다. 카드는 관계를 세기만 하고 하나도 보여주지 않는다."* — 2라운드에서 지킴이는 계기 강등을 골라 이 제안을 **철회**했고, 이번 슬라이스는 **정적 예시 카피**로만 부분 수용했다(배선 no-go). 즉 살아있는 사실 1개는 여전히 없다.
**반증 조건 ①**: 소유자 또는 신규 방문자가 강등된 캡션을 읽고도 「관계가 뭔지」를 여전히 못 말하거나, 정적 예시를 **질의된 사실로 오해**하는 장면이 나오면 지킴이가 옳았다 — 그때 고칠 것은 캡션의 크기가 아니라 **살아있는 엣지 하나를 배선하는 것**이다.
**재검토**: 1.0 안정판 컷 직전, 또는 첫 외부 사용자 5인 관찰 시.

**기록된 반대 ②** (근거): *"「선택지가 결정을 미루게 한다」는 이 저장소에서 관측된 적이 없다. 신뢰 헌장상 텔레메트리가 0이라 관측 채널 자체가 없고, 이 표면의 실방문자 수는 미상이며 0에 가까울 수 있다. 이 카드는 7개 라운드의 퇴적층이고 요소마다 관측 영수증이 있는데 합산 상태를 재판정한 기록만 없다."* — 채택하지 않은 부분: 구조 변경을 5인 모더레이티드 세션 이후로 미루자는 조항. 산출물 내재 결함(주목 스택 역전·탭 자멸·문자열 4건)은 사용자 관측 없이 판정 가능하다고 보고 지금 고쳤다.
**반증 조건 ②**: 신규 5인 세션에서 **2인 이상**이 바뀐 카드 앞에서 60초+ 무클릭이거나 "뭘 하면 되죠?"를 소리 내어 묻거나, 폴더를 열려던 사람이 「시작 안내 다시 열기」(11px 3차 텍스트)를 못 찾으면 근거가 옳았다 — 그때는 잉크 재배분이 아니라 **구조**를 손대야 하고, 그 전에 세션을 먼저 돌린다.
**재검토**: 소유자가 5인 세션을 잡는 시점. 안 잡히면 1.0 이후 첫 외부 피드백 3건이 모인 때.

**기록된 반대 ③** (해자): *"굵은 리드를 유지하는 한 이 카드는 Obsidian 첫 실행의 재배치다. 회색 뒤 1문장은 타협이지 해결이 아니다."*
**반증 조건 ③**: 카피 교체 없이 잉크만 재배분한 뒤에도 「개발자라면 —」 펼침율이나 MCP 연결 도달이 움직이지 않으면 해자가 옳았다(해자 본인이 제시한 반증 형태다). 그때는 굵은 리드를 에이전트 훅으로 교체한다.
**재검토**: 소유자 확인 항목 1의 답이 오는 즉시.

**슬라이스**: IN — `src/features/first-run-starter/**`(className·순서·간격) · `messages/ko.json`+`en.json` 의 `firstRunStarter`(같은 커밋) · `tests/e2e/web-surface-smoke.spec.ts` 의 census 마커 이전 · `docs/ontology/capabilities/first-run-starter.md` · OUT — `app/globals.css`·새 토큰 · `HomePage.tsx` · 어포던스 증감 · 400ms 자동 시트 · dismiss/reopen 의미론 · e2e testid 15종 · 컴포넌트 분리 리팩터링 · appetite 1일.
**제거/강등**: `MeterCell` 3분할 계기 블록 삭제(그 `text-[19px]` + `eslint-disable` 동반 삭제) · 상태 신호 4→2 · 리드의 중복 「읽기 전용」 절 삭제 · 중복 게이트 1개 폐기(소스 스캔 테스트 — eslint 가 이미 error 로 막고 있어 통과만 하는 게이트였다).

**실측 전후** (`design-guardian`, `.qa-scratch/first-run/` 캡처 전후 쌍):

| | before | after |
|---|---|---|
| 카드 최대 활자 | 19px mono semibold — **샘플 수치** | 14px semibold — **리드** |
| 주목 스택 | ①샘플수치 ②CTA ③리드 | **①리드 ②CTA ③앰버 샘플 신호** |
| 하단 꼬리 공백 | 186px / 25.4% (풀스크린 ≈38%) | 14px / 1.9% (풀스크린 1.5%) |
| 상태 신호 | 4 | 2 |
| 램프 밖 크기 | `text-[19px]` 1건 + `eslint-disable` | 0 |

**게이트** (`/gate-probe` 로 전부 되돌려 빨개짐 확인): 유닛 5종(⌘O 양방향 · 재클릭 무동작 · tablist 아님 · 캡션 census · 에이전트 절) → 결함 복원 시 7 failed. 웹 스모크의 census 마커는 **`MeterCell` 마크업에 매여 있다가 계기 강등으로 그대로 빨개졌다** — 컴포넌트보다 오래 산 마커이고 2026-08 에 릴리스를 잃은 그 실패 모드다. `first-run-starter-sample-scale` 을 가리키게 옮겼다.

**PR**: #831

**워크스루 후속** (`/user-walkthrough`, 갈래② 기획/임원, 재빌드 대상 · 캡처 `.qa-scratch/first-run/walkthrough-b2-*` 24장): 이번 슬라이스의 단일 성공 조건은 **사람 여정에서도 확인됐다** — 카드 안에서 굵은 리드가 실제로 첫 독해였다. 강등된 census 캡션은 죽은 줄이 아니라 **불활성 줄**이었다(한 번 읽고 다시 참조 안 함) — 「지금은 샘플」 배지가 이미 그 일을 하므로 무해. 새 에이전트 문장은 **저비용 소음**으로 읽혔다(「Claude Code」를 모르는 고유명사로 읽고 버림) — 회색 강등 덕에 막지는 않으나 내부 언어 누출이다. 이탈 0.

이 슬라이스 **밖에서** 이름 붙은 마찰 다섯을 후속으로 등록한다(고치지 않았다 — 전부 no-go 경계 밖이거나 다른 표면이다): ① 투어 7/7 의 주 버튼이 「저는 개발자예요」라 갈래②가 즉시 자기를 배제한다 — 신규 패턴 **「다른 문 앞의 주 버튼」** ② 「쉬운 말로 보기 켜기」가 켜면 자기를 지우고(되돌리기 불명) 라벨이 약속한 범위(「보기」)가 실제 범위(범례·상태줄 문자열 둘)보다 넓다 — 신규 패턴 **「자기를 지우는 토글」** ③ 탭으로 만든 상태에 탭 자신이 없다(귀환이 「시작 안내 다시 열기」 3차 텍스트 경유인데 그 라벨은 뒤에 탭이 있다고 말하지 않는다) — dismiss/reopen 의미론이 이번 no-go 라 손대지 않았다 ④ 검색 팔레트 설명 열이 ko 화면에서 전부 영어 — 반쪽 번역 ⑤ 투어 4/7 「밝게 남아 있는 점」이 지시 대상 불명(상자 안 대체 버튼이 자동 회복시켜 이탈은 없음). ①②④는 각각 다른 표면이라 별건이다.

**관측된 사실 — 이 게이트는 이번 소집을 보지 못했다**: `pnpm decisions:check` 가 이 변경에 **`no council trigger in this change ✓`** 를 반환했다. 게이트의 사정거리는 **라우트 증감과 MCP/CLI 공개 계약 변경뿐**이라, PO 5석이 실제로 소집됐는지는 아무도 보지 않는다. 이 기록이 남은 것은 헌장이 시켜서지 무엇이 강제해서가 아니다. **「통과만 하는 게이트는 게이트가 없는 것과 구별되지 않는다」**(`gate-probe` 의 전제)가 이 게이트 자신에게 적용되는 자리다. **지금 고치지 않는다** — 이번 슬라이스 밖이고, 어떻게 고칠지는 다음 사람의 판단이다. 사실만 남긴다.

**상태**: 유효 (서명 완료 · 확인 항목 2건 모두 기본값 유지 · 후속 2건 등재: CLI 다리 과녁 · `decisions:check` 사정거리)

---

## 2026-08-01 (소유자 서명) — 시연은 주소로 갈리지 않는다: `/` 와 `/download` 가 같은 것을 보여준다

**소집**: 단독 패스 · **트리거**: 소유자 직접 지시 — *"근데 다운로드 페이지 들어가니까
왜 사용 영상이 없지?"* → *"/는 영상이 나오고 download는 안나오고 이러면 안됨! 그냥
통일해.. 헷갈리게하지말고 둘 다 영상 나오게 download는 결국 홍보 페이지랑 같잖아"*.
**선행 결정 관계**: 2026-07-29 (밤) 「시연 영상은 첫 페이지로 간다」를 **명시적으로
뒤집는다** — 배치 절반만. 그 기록이 카운슬에서 지켜 낸 **촬영 원칙 둘**(공유 표면을
찍지 않는다 · 웹이 원리적으로 못 하는 것을 보여준다)은 그대로 유효하다.

**관측**

배치를 주소로 가른 것은 코드 한 줄(`showDemo = pathname === '/'`)이었고, 그 갈림을
아는 시험이 **하나도 없었다**. 실측(rc.5 빌드, 1512×982):

| 주소 | `demo-stage` | `<video>` | 탭 |
|---|---|---|---|
| `/ko/` | 있음 | 2 | 2 |
| `/ko/download/` | **없음** | **0** | **0** |

같은 뷰가 두 주소에 사는데 하나는 이 제품이 움직이는 것을 보여 주고 하나는 안
보여 준다. 링크로 `/download` 에 도착한 사람은 **한 번도 못 본 채 설치 버튼만
본다** — 그게 정확히 소유자가 잡은 화면이다.

**결정**

1. **시연 절은 두 주소 모두에 있다.** `showDemo` 를 없앤다. 무대 바닥도 조건부를
   잃고 `44rem` 하나가 된다 — 낮춰 잡던 이유("이 주소엔 시연이 없다")가 사라졌다.
2. **막고 있던 게이트는 지우지 않고 사정거리를 좁힌다.** `/download` 의
   「첫 화면이 스크롤 없이 끝난다」는 시연 절이 `/` 에만 있던 시절의 **그릇**이었다.
   그 게이트가 실제로 잡은 회귀는 *"접힌 것이 하필 설치 3단이었다"* 이므로, 시험을
   **「설치 3단이 접히지 않는다」**(끝까지 스크롤 → 세 단이 전부 뷰포트 안 · 조상
   `overflow:hidden` 이 자르지 않음)로 바꿨다. 앞선 코드 주석이 뒤집는 방법으로
   남겨 둔 순서를 그대로 따랐다.
3. **통일 자체를 게이트에 박는다.** 같은 시험이 두 주소 모두에서 `demo-stage` 가
   보이는지 먼저 단언한다. 이게 없으면 시험이 **조용히 무의미해진다** — 시연이
   사라지면 페이지가 짧아져 설치 3단은 저절로 접힘 위에 오고, 아무것도 안 재면서
   초록이 된다.

**기록된 반대 (2026-07-29 카운슬의 근거)**: `/download` 는 링크로 도착해 **설치만
하려는** 사람의 한 화면 페이지이고, 홍보 자산이 그 목적을 흐린다. 그 근거는
지금도 말이 되지만 소유자가 `/download` 의 **일 자체를 재정의**했다 — 설치 창구가
아니라 홍보 페이지다.
**반증 조건**: `/download` 도착 후 설치 버튼까지의 도달률이 떨어지거나(영상이
설치를 밀어냄), 스크롤 없이 이탈하는 비율이 오르면 카운슬이 옳았던 것이고, 그때는
**영상을 설치 띠 아래로 내리는** 쪽으로 되돌린다(주소로 다시 가르는 것이 아니라).

**상태**: 유효

---

## 2026-08-01 — 「작업이 끝났다」는 조용해짐으로 판정한다: 임계값 5분, 알림은 **작업 단위로만**

**소집**: 단독 패스 · **트리거**: 소유자 직접 지시 (*"화면은 에이전트나 mcp가 작업중이라는걸 어떻게든 표현 가능해야하고 … 벨을 만들지만 그 표현할 내용을 손보면"*).
**선행 결정 관계**: 2026-08-01 「도구 호출 로그는 그리지 않는다」를 **인용하며 유효**로 둔다 — 알림 목록에서 도구 호출을 뺀 근거가 그 판정이다.

**관측 (임계값을 감이 아니라 분포에서 골랐다)**

실측 활동 로그 두 벌(98줄 · 쓰기 간격 96개)의 분포:
`p50 1.9s · p90 23.2s · p95 48.5s · p98 133.9s · p99 329.5s · max 1733.3s`, 간격의
80.2%가 4초 이하. 꼬리에 두 종류가 섞여 있다 — **작업 중의 침묵**(에이전트가 읽고
생각하는 동안. 로그에는 쓰기 성공만 남으므로 그 구간은 한 줄도 안 남는다)과
**작업 사이의 침묵**. 관측된 최대 「작업 중 침묵」은 133.9초다.

임계값별로 두 로그가 몇 조각이 되는지: 60s → 7작업 · 120s → 6 · **300s → 4(로그당 2)** ·
600s → 3. 한 실험(53줄 · 11분 40초)만 놓고 보면 줄 단위 알림은 53개, 작업 단위는 2개다.

**결정**

1. **`AGENT_TASK_IDLE_MS = 5분`.** 근거 셋: ① 관측된 최대 작업 중 침묵(133.9초)의
   2.24배 — 실측한 어떤 것보다 두 배 오래 생각해도 한 작업으로 남는다.
   ② `AGENT_ACTIVITY_STALE_AFTER_MS`(heartbeat 낡음 5분)와 같은 값 — 「이 에이전트는
   이제 없다」가 제품 안에서 두 숫자를 갖지 않는다. ③ 오차 비용이 비대칭이고 유계다:
   길어서 틀리면 끝 알림이 최대 5분 늦을 뿐, 짧아서 틀리면 한 작업이 알림 여러 개로
   쪼개진다(배지가 늘 빨간불이면 배지는 뜻을 잃는다).
2. **알림은 다섯 갈래뿐** — 작업 시작 · 작업 끝(요약과 함께) · 도메인 생성/소멸 ·
   브릿지 끼어듦 · 볼트 문제. 노드 하나·관계 하나는 지도가 이미 밝게 보여주므로 넣지
   않고, 도구 호출은 위 선행 판정이 반려했다.
3. **뼈대 사건의 진실원은 활동 로그가 아니라 매니페스트다.** 로그로 도메인 생성을
   잡으려 했으나 실측 98줄에서 **한 건도 안 잡혔다** — 도메인은 거의 항상 배치
   (`add_concepts`)로 태어나고 배치의 target 은 `(batch)` 다. 매니페스트 스냅숏 diff 는
   배치·수기 편집을 가리지 않는다.
4. **알림함은 라우트가 아니라 팝오버다.** 지도를 떠나 지도에 관한 소식을 읽게 만들면
   그 소식의 값이 사라진다. 지속적인 기록의 목적지는 이미 `/git` 과 볼트 안
   `activity.jsonl` 이고, 이 팝오버는 그리로 가는 짧은 창이다(라우트 0개 추가).
5. **자리는 지도 우하단 판독 스택**(범례·첫 실행 판독·프레임 계기의 집). 상단 중앙
   상태 열이 갈래로는 맞았지만 **1024 에서 안 들어간다** — 그 열은 INDEX 오른끝(388px)에서
   69px 떨어져 있는데 이 칩이 194px 이라 32px 겹쳤고(실측), 우상단 유틸 레인도 28px 만
   남았다. 저 열의 칩 넷은 사용자가 만든 **일시** 상태라 그 여유를 알고 쓰는 것이고
   이건 **상시**다. 우하단은 좌우 경쟁자가 없고, 토스트가 이미 그 스택의 실제 rect 를
   읽어 비켜선다(`resolveToastBottomOffsetForStack`).
6. **「연결됨」이라고 쓰지 않는다.** Atlas 는 에이전트에 연결하지 않고 폴더를 볼 뿐이라
   그 말은 거짓이다. 「마지막 작업 N분 전」은 언제 말해도 참이다.

**진 반대 의견**: *"5분은 너무 길다 — 끝났는지 5분을 기다려야 안다."* 맞는 지적이고,
그 대가를 알고 치른다. 되받은 근거는 **「끝」의 값이 즉시성이 아니라 요약**이라는 것이다
(「추가 34 · 편집 2 · 삭제 4」는 늦게 와도 값이 그대로지만, 잘못 갈린 요약은 값이 0이다).
즉시성이 필요한 신호는 「작업 중」 표시가 2분 창으로 이미 담당한다.

**반증 조건**: ① 사용자가 한 작업이 알림 여러 개로 갈렸다고 보고하면 임계값이 짧은
것이다(→ 재측정 후 상향). ② 「끝났는데 알림이 안 온다」가 반복되면 5분이 긴 것이다
(→ 하향, 단 재측정 근거와 함께). ③ 배치가 아닌 개별 쓰기가 지배적인 로그가 관측되면
3번의 근거가 약해진다 — 그때는 로그만으로도 뼈대 사건을 잡을 수 있다.

**재검토**: 활동 로그 표본이 다섯 벌 이상 쌓였을 때 분포 재측정.

**상태**: 유효.
## 2026-08-01 — 인수인계 시험이 찾아낸 셋: 본문은 opt-in 으로 전부 주고, 안 준 것은 말하고, 증거 없는 능력은 막지 말고 보이게 한다

**소집**: 단독 패스 · **트리거**: 낯선 오픈소스 저장소에 빈 볼트를 붙여 실제 MCP
에이전트로 구축한 뒤(15분 30초 / 50노드 / 126관계 / 인용 경로 13-13), **소스를
감추고 볼트만 넘겨받은 두 번째 에이전트**에게 질문한 실측. 공개 계약(MCP 도구
시그니처)이 바뀌므로 `decisions:check` 대상.

**루브릭**: 20/24 (치명적 0: 없음). 근거 행이 가장 강하다 — 세 결함 모두 우리가
추측한 것이 아니라 **인수인계 에이전트가 자기 입으로 못 했다고 말한 것**이다.

**결정** (셋, 각각 최소 슬라이스):

1. **`get_concept({ body: 'full' })`** — 기본은 그대로 발췌, 전체 본문은 opt-in.
   그리고 **모든 응답에 `bodyInfo`** 를 실어 원본 길이·돌려준 길이·잘림 여부를
   말한다. 잘렸을 때만 나머지를 받는 정확한 호출을 `hint` 로 붙인다.
   같은 병이 있던 `get_concepts`(같은 파라미터, full 은 20행 상한) ·
   `find_evidence`(`excerptTruncated`/`bodyHint`) · `list_concepts({summary})`
   (`summaryTruncated`/`summaryHint`) 도 같이 고친다. `query_ontology` 는
   본문을 다루지 않아 해당 없음(확인함).
2. **저장소 루트에 근거가 없으면 코드 경로를 재지 않는다.** CLI 가
   `OATLAS_REPO_ROOT` 미지정 시 자기 `process.cwd()` 를 대신 실어 서버의
   볼트-우선 탐색을 무력화하고 있었다 — 그래서 `health` 가 남의 볼트를 *우리*
   저장소에 대고 재서 `warn:13` 을 냈고 `validate` 는 같은 볼트에 clean 이었다.
   추측을 걷고, 근거 없을 때는 `pathDrift.checked=false` 로 **안 봤다고 말한다**.
   두 명령의 문구도 각각 자기 검사 범위를 말한다.
3. **`capability_without_evidence`** — `elements:` 가 아예 비어 있는 능력을
   `maintenance_plan` 에 `review`/`info` 로 싣고, 생성 시점에 쓰기 게이트가 한 번
   더 말한다. **거부하지 않는다.**

**적용 규칙**: 최소 슬라이스 · 헌장 우선(구축 규격 5번 "절차는 쓰기를 막지
않는다") · 새 표면 0(새 도구를 만들지 않고 기존 `maintenance_plan` 에 붙였다).

**서명**: stark

**기록된 반대 (가장 강한 패배 논점)**: *"증거 없는 능력은 거부해야 한다 — 보고만
하면 아무도 안 읽고 8개는 계속 8개로 남는다."* 기각한 이유는 정직한 저작 순서가
「행동을 먼저 이름 짓고 파일을 나중에 붙인다」이고, 거부는 그 순서를 불가능하게
만들어 에이전트가 도구를 우회하게 하기 때문이다. 두 번째 반대: *"`bodyInfo` 를
모든 응답에 붙이면 페이로드가 는다."* — 잘리지 않았을 때는 4개 필드뿐이고
`hint`/`omittedChars` 는 잘렸을 때만 실린다.

**반증 조건**: (1) 다음 field trial 에서 인수인계 에이전트가 여전히 "본문에 더
있을 수 있는데 못 봤다" 로 답하면 opt-in 이 부족했던 것이고 기본값을 바꿔야
한다. (2) `capability_without_evidence` 가 볼트마다 능력의 절반 이상을 물면
신호가 아니라 소음이므로 술어를 좁혀야 한다 — 실측 기준선은 이 저장소 자기
볼트 9건, 시험 볼트 8건이다. (3) 근거 없는 저장소 루트를 건너뛴 탓에 **진짜**
코드 drift 를 놓친 사례가 나오면, 건너뛰는 대신 물어보는 설계로 가야 한다.

**재검토**: 다음 `/ontology-field-trial` 실행 직후 — 기준선은
`.claude/skills/ontology-field-trial/BASELINE.md`.
## 2026-08-01 — 웹의 「연결 불가」는 거짓이었다: 브라우저가 모르는 값을 **아는 사람에게 묻는다**

**소집**: 단독 패스 · **트리거**: 소유자 실측 — 배포된 웹에서 「AI 에이전트 연결」을 눌렀더니 「이 화면에서는 연결할 수 없어요」가 뜨고, 유일한 대안 링크가 사람을 `/docs/?slug=AGENT-GRAPH-WORKFLOW` 한가운데로 떨궜다(*"지금은 좀 불편하다"*).
**선행 결정 관계**: `.claude/rules/surfaces.md` 「웹 동등물은 짓지 않는다」의 두 항목을 **둘 다 유효로 인용한다.** 웹 BYOK 는 그대로 영구 기각(이 변경은 MCP 에이전트 연결이지 LLM 호출이 아니다). 「웹에서 `.mcp.json` 등 에이전트 설정 **쓰기**」도 그대로 안 한다 — 브라우저는 여전히 파일을 쓰지 않는다. 뒤집는 것 없음. **읽는 법만 좁힌다.**

**관측 (현상과 문제를 가른다)**

- **현상**: 웹 방문자가 연결 시트에서 막힌다.
- **문제**: 카드가 **능력의 범위를 실제보다 좁게** 말했다. MCP 는 Atlas 에 붙는 게 아니라 **폴더에 붙는다** — 에이전트(Claude Code/Codex/Cursor)가 자기 세션에서 서버를 띄우고 그 서버가 디스크의 볼트를 읽고 쓴다. Atlas 는 같은 폴더를 보는 또 하나의 독자일 뿐이라, **웹 사용자도 연결된다**(소유자가 같은 날 앱 없이 터미널로 세 번 붙였고 볼트가 61·89·50 노드까지 자랐다). 못 하는 것은 **Atlas 가 설정 파일을 대신 써 주는 것** 하나다.
- 이 저장소 규율이 정확히 이 형태를 금지한다: 강등 카드는 왜 안 되는지 + 어디서 되는지를 말해야 하고, **사실이 아닌 축소**는 「곧 됩니다」와 같은 부류다.

**결정**: 강등 카드를 **자동 저장 불가**로 정정하고, 그 아래에 **그 자리에서 끝나는 길**을 붙인다. 브라우저가 구조적으로 모르는 값(볼트 절대 경로 · Atlas 체크아웃 절대 경로)을 **사람에게 묻고**, 그 값으로 도구별 설정과 `agent-setup` 한 줄을 화면에서 만들어 준다. 전송 0 · 저장 0 — 순수 함수와 로컬 상태뿐이고 경로는 화면 밖으로 나가지 않는다.

**적용 규칙**: 최소 슬라이스 (새 라우트 0 · 새 표면 0 · 기존 강등 카드 자리 안) · 헌장 우선 (웹 BYOK 부활 없음, 백엔드 없음) · 제거 요구 (문서 링크를 **주 경로에서 내린다**)

**서명**: stark (소유자 지시)

**기록된 반대** (가장 강한 패배 논점): *"경로 두 개를 손으로 붙여넣게 하는 것은 앱의 원클릭 대비 초라하고, 체크아웃까지 요구하면 진입 장벽이 오히려 커 보인다 — 차라리 앱으로 몰아야 전환이 는다."*
→ 기각 근거: 웹의 1번 일은 **관문**이고(surfaces.md), 앱을 못 까는 인구(Windows·리눅스 Chromium)에게 유일한 길을 막다른 카드로 두는 것은 관문의 품질을 2류로 내린다. 앱이 더 쉽다는 안내는 **남긴다**(버튼 한 번) — 웹이 막혔다고 말하지 않을 뿐이다.

**반증 조건**: 이 반대가 옳았다면 — ① 웹 시트에서 경로 칸이 채워지는 일이 사실상 없고(복사 버튼이 잠긴 채로 끝나고) ② `/download/` 전환은 종전과 같거나 오히려 줄어든다. 그러면 「그 자리에서 끝난다」는 전제가 틀린 것이고, 답은 카드를 되돌리는 것이 아니라 **체크아웃 요구 자체**(배포 채널 둘)를 다시 여는 것이다.

**재검토**: 웹에서 연결한 사용자 제보가 한 건이라도 나오면(성공이든 실패든) 그 경로 실패 유형으로 다시 본다. 또는 Windows 앱이 로드맵에 오르는 시점.

**상태**: 유효

---

## 2026-08-01 — 쇼핑몰 샘플 재생성 보고: 브릿지 규격은 **구축이 아니라 수리**의 도구다 (실전 첫 검증)

**소집**: 단독 패스 · **트리거**: 2026-07-31 「온톨로지 구축 규격」이 요구한 재생성 보고 (*"손보정 0건 보고 — 있었다면 위치+이유=규격 구멍 목록"*), 쇼핑몰 샘플 몫.
**선행 결정 관계**: 2026-07-31 「구축 규격」과 2026-08-01 「슬러그는 평평한 식별자다」를 **인용하며 유효**로 둔다. 뒤집는 것 없음.

**관측 (규격의 실전 첫 브릿지 검증)**

도그푸드 재생성은 최대 팬아웃이 5라 방아쇠가 한 번도 안 걸렸고, 그래서
**브릿지 규칙(구축 규격 4단계)은 코드가 아니라 문장으로만 존재했다.** 쇼핑몰은
자연히 넓어지는 도메인이라 그 첫 시험대였다. 결과:

1. **팬아웃 방아쇠는 걸렸다.** `capabilities/payment-authorize` 가 결제 수단
   8개를 자식으로 들고 있었고(트리거 6), `domains/catalog` · `domains/order` 가
   역량 8개로 트리거에 닿았다.
2. **브릿지는 2개 만들었다** — `capabilities/wallet-payment`(간편결제) ·
   `capabilities/carrier-integration`(택배사 연동). 둘 다 조건 넷을 통과했다:
   행동의 이름이고, 한 문장으로 쓸 수 있고, 형제(카드/계좌이체/가상계좌 ·
   출고지시/배송조회/반품회수)와 안 겹치고, **실제로 자식을 옮겨 붙였다**
   (카카오·네이버·토스페이 3개 / CJ·한진·우체국 3개).
3. **그런데 하나는 방아쇠 아래에서 만들었다.** 택배사 3개는 부모의 자식이
   5개라 트리거(6)에 닿지 않았다. 그래도 (a) 테스트를 물었더니 실패했다 —
   가게 입장에서 CJ 와 한진은 **바꿔 써도 하는 일이 같다**. 규격 자신의 문장
   (*"Count is the wrong target"*)대로 **수가 아니라 테스트를 따랐다.**

**결론 (이게 이 기록의 값이다)**: **브릿지는 0에서 짓는 도구가 아니다.**
규격을 따라 한 노드씩 지으면 3단계 (a) 가 먼저 걸려 "형제를 patch 하라"로
끝나므로, 4단계가 요구하는 「(a) 가 이미 실패하는 자식 3+」이라는 조건이
**애초에 만들어지지 않는다.** 브릿지가 필요해지는 유일한 경로는 ① 이미 자란
볼트를 수리할 때, ② `add_concepts` 배치가 형제를 한꺼번에 낳았을 때다. 이번에
두 브릿지가 나온 것도 "결제 수단 전부" · "택배사 전부"를 **한 묶음으로 놓고 본
뒤** 판정했기 때문이다.

**손보정 2건 (= 규격의 구멍 후보)**

1. **`depends_on` 이 웹에서 안 보인다.** 스키마
   (`VAULT_KIND_SCHEMA[*].optional` · `preferredOrder`)는 `depends_on` 을
   권장 키로 적는데, 웹 파생(`derive-ontology-from-vault.ts`)은 `dependencies`
   **만** 읽는다. 스키마가 권하는 대로 쓰면 지도에 의존 엣지가 한 개도 안
   그려진다. 샘플은 `dependencies` 로 썼다.
2. **도메인이 자기 요소를 되받아야 한다.** `element.domain:` 만 쓰면 컴파일러가
   `missing_domain_containment` 를 요소 수만큼(54건) 낸다. 도메인 쪽에도
   `elements:` 를 채워야 health 가 깨끗해진다 — 규격 문장에는 이 왕복이 없다.

**로케일 (소유자 판단 필요)**: 모든 노드가 `display_ko` · `display_en` 을
둘 다 가진다(누락 0). `title` 은 영어 정본이다 — `deriveProjectsFromVault` 가
`fm.title` 을 그대로 그려서, 한국어 title 은 `/en/projects` 에 한국어를
노출한다(이 재생성의 출발점이 된 결함). **`description` 과 본문에는 로케일
분기가 없다** — `description` 은 영어 한 문장, **본문은 영어 문단 + 한국어 문단
병기**로 갔다. 어느 언어 사용자도 막히지 않지만, 한국어 사용자는 카드에서 영어
설명을 본다.

**기록된 반대**: 본문 병기는 문서 길이를 두 배로 만들고 `/docs` 목차를 두 벌로
보이게 한다. 대안은 `description_<locale>` 키를 스키마에 추가하고 본문도 로케일
분기하는 것인데, 그건 샘플 하나를 위해 볼트 스키마를 넓히는 일이다.
**반증 조건**: 사용자(또는 소유자)가 `/ko` 에서 영어 설명을 결함으로 지목하거나,
`/docs` 목차가 병기 때문에 읽기 어렵다는 관측이 나오면 진 쪽이 이긴 것이다 —
그때는 `description_<locale>` 를 스키마에 올린다.
**재검토**: 첫 외부 사용자가 `/ko` 에서 샘플을 열어 본 뒤.

## 2026-08-01 — 네 번째 연결은 벤더가 아니라 **문**이다: 키 없는 「주소로 연결」 갈래를 열어 Ollama·LM Studio·llama.cpp 를 한 자리로 흡수한다

**소집**: 단독 패스 (소유자 직접 지시) · **트리거**: 소유자 — *"에이전트(채팅)모드도 ollama 나 오픈소스들도 연결 가능하게 해줘! 지금 나는 ollama 쓰고있는데 … 이것도 설정에서"*
**루브릭**: 21/24 (치명적 0: 없음)
**선행 결정 관계**: 새 결정이 아니라 **이미 허용된 것의 구현**이다 — `.claude/rules/local-first.md` v9 가 *"LLM 연결(BYOK / localhost)은 opt-in + 전송 범위 UI 명시 + 로컬 감사 로그 조건으로 허용"* 이라고 이미 적어 뒀고, 세 조건을 전부 구현했다. 동시에 `src-tauri/src/secrets.rs` 의 **「명명 벤더 3 동결」은 유지**된다(테스트 `the_named_vendor_list_stays_frozen_at_three` 무수정 통과).

**결정**: Ollama 를 **네 번째 명명 벤더로 넣지 않는다.** 그 자리의 조건은 「Bearer 호환으로 흡수 불가한 전용 인증 + 수요 증거」 둘 다인데 Ollama 는 ①을 못 채운다(OpenAI 호환 엔드포인트를 그대로 연다). 대신 `secrets.rs` 가 롱테일용으로 **이미 예고해 둔** *"사용자가 주소를 직접 적는 갈래"* 를 실제로 연다 — provider id `local`, base URL 사용자 입력, 키 0.

**적용 규칙**: 최소 슬라이스 · 헌장 우선

- **엔드포인트는 OpenAI 호환(`/v1/chat/completions` · `/v1/models`)**, Ollama 네이티브(`/api/chat` · `/api/tags`)가 아니다. 네이티브를 고르면 러너마다 어댑터가 하나씩 늘고, 그건 명명 벤더 동결이 피하려던 바로 그 롱테일이다. 호환을 고르면 LM Studio·llama.cpp server·vLLM·LocalAI 가 **같은 문 하나**로 들어온다 — 그것이 소유자가 말한 "오픈소스들도" 의 실질이다.
- **키 없는 경로는 타입으로 연다.** `Target::{Vendor{secret}, Address{base_url}}` — 명명 벤더 키가 사용자가 적은 주소로 나가는 조합이 **표현 불가능**하다(런타임 게이트는 IPC 커맨드에 따로).
- **평문 http 는 루프백에서만.** 밖으로 나가려면 https. URL 안의 userinfo·쿼리·따옴표는 거절한다.
- **전송 범위 문구는 루프백일 때만 "이 컴퓨터 밖으로 안 나간다" 고 말한다** — 사용자가 https 로 다른 기계를 가리킬 수 있고, 참이 아닌 자리에 그 문장을 쓰면 이 제품의 신뢰 서사가 거짓말이 된다.
- **모델은 타이핑이 아니라 목록에서 고른다.** [연결 확인] 한 번이 「살아 있나 · 호환되나 · 뭘 고를 수 있나」 셋을 한 요청·한 감사 줄로 답한다.

**이 갈래가 이 제품에 특별히 맞는 이유**: `llm.rs` 는 감사 줄의 목적지를 제공자 이름이 아니라 **호스트**로 남긴다. 로컬 러너를 쓰면 `host:"localhost:11434"` 가 찍히므로 **「아무 데도 안 나갔다」가 주장이 아니라 기록이 된다.** 실측(2026-08-01, 소유자 기계): verify·chat 두 줄 모두 `provider:"local"`, `host:"localhost:11434"`.

**기록된 반대 (가장 강한 패배 논점)**: 호환 층은 **러너 버전에 달렸다.** 도구 호출(`tools`/`tool_calls`)은 호환 API 에 늦게 붙었고 러너·모델마다 완성도가 다르다 — 볼트 에이전트는 도구 호출이 본체이므로, 도구를 못 쓰는 로컬 모델을 고른 사용자는 "연결은 됐는데 아무것도 안 한다" 를 만날 수 있다. 네이티브 API 를 썼다면 최소한 Ollama 에서는 그 층이 더 안정적이었을 것.
**반증 조건**: 로컬 러너로 연결한 사용자가 **도구 호출 실패**로 첫 왕복을 못 넘긴 사례가 관측되면 반대가 옳았던 것 — 그때의 처방은 네이티브 어댑터 추가가 아니라 **연결 확인이 모델의 도구 지원 여부까지 판정**하는 것이다(Ollama 네이티브 `/api/tags` 의 `capabilities` 에 `tools` 가 있다. 호환 목록에는 없다 — 그 한 필드 때문에 네이티브를 **보조로만** 부르는 것은 정당하다).
**재검토**: 소유자가 로컬 러너로 실제 볼트 작업을 한 번 끝낸 뒤 — 도구 왕복이 몇 번째에서 끊겼는지가 위 반증 조건의 관측이다.

**서명 (accountable)**: stark
**상태**: 유효

## 2026-08-01 — CI 는 볼트 노드 수를 세지 않는다 — 손으로 맞춰야 유지되는 수 게이트를 전부 걷고, 런타임에 계산되는 단언만 남긴다

**소집**: 단독 패스 (소유자 직접 지시) · **트리거**: 소유자 — *"아예 CI점검에서 이런거 있으면 제거해 노드수 측정이라거나"* / *"이건 매번 바뀐다고"* / *"게이트중에 이런 불필요한건 다 제거해줘.. 맨날 너무 오래걸려 쓸데없는것때문에"*
**선행 결정 관계**: 2026-07-31 「dogfood 볼트 전면 재생성」의 직접적 청구서다. 볼트를 0에서 다시 짓자 노드 수·kind 센서스·파일명·슬러그를 핀한 게이트가 한꺼번에 빨개졌고, **틀린 것은 볼트가 아니라 게이트였다.**

**결정**: CI 는 도그푸드 볼트의 노드/관계/파일 수를 **측정하지 않는다.** 수를 알고 싶은 사람은 명령을 돌린다(`node cli/src/index.mjs overview`).

**판별 기준 (이 선으로 잘랐다)**

| | 성격 | 처분 |
|---|---|---|
| 사람이 **손으로 숫자를 맞춰 줘야** 유지되는 단언 — 볼트에 노드 하나만 더해도 빨개진다 | 잡일 장치 | **걷는다** |
| **런타임에 같은 출처에서 그 자리에서 계산**되는 단언 — 아무도 손댈 일이 없다 | 정합성 | 남긴다 |
| 숫자와 무관한 계약 (라우트·토큰·파서 드리프트·공개 MCP/CLI 인벤토리) | 계약 | 손대지 않는다 |

**걷어낸 것과 각각 잃은 것**

- `tests/contract/dogfood-node-count.contract.test.ts` (삭제) — 화면 카피(`mapEntry.demoNote`)가 낡은 노드 수를 말하면 잡던 게이트. **잃은 것**: 그 문장에 틀린 수가 들어가도 CI 가 침묵한다.
- `src/shared/lib/launch-docs-current.test.ts` 의 「문서가 노드 수를 말한다면 볼트와 같다」 + `STALE_PATTERNS` 의 노드/관계 수 3항목. **잃은 것**: README·런치 문서의 낡은 노드 수를 CI 가 더는 잡지 않는다. (남긴 항목은 **공개 계약의 수**인 MCP 도구 인벤토리와, 오히려 동결을 *막는* 테스트 수 금지 규칙이다.)
- `scripts/check-package-contracts.test.mjs` 의 verify README 게이트에서 **계산으로 만든 단언 전부** — 노드 수·kind 센서스·파일 수·그래프 해시·프로젝트/이웃 슬러그·모듈 엣지 요약. **잃은 것**: `mcp/README.md` 트랜스크립트의 수가 실제 볼트와 일치하는지 확인하지 않는다. 대신 트랜스크립트에서 **수를 걷어내고**(`<N>` / `<slug>`) 그 자리표시자를 리터럴로 pin 했다 — 누가 실행 결과를 다시 붙여 넣으면 걸린다. 이 게이트가 실제로 태운 비용은 기록에 남아 있다(자기개선 원장 iter 39–40: 결함 0건, 두 iteration 소모, `564 files / 453 edges` → `569 / 454`).
- `scripts/check-package-contracts.test.mjs` 의 self-ontology README census 계산 블록. **잃은 것**: README 가 「총 N 노드」를 적으면 참인지 보던 조건부 검사. 남은 것은 「census 는 명령으로 답하는가」와 「이게 우리 볼트의 README 인가」.
- `src/views/download/ui/DownloadPage.test.tsx` 의 `expect(graph.nodes.length).not.toBe(DOGFOOD_CENSUS.concepts)`. 이건 수 측정이 아니라 **결함을 요구하는 게이트**였다 — 두 수가 달랐던 이유는 옛 볼트에 「파일 없이 이름만 불린」 파생 노드가 있었기 때문이고, 규격대로 재생성한 지금은 모든 노드가 자기 문서를 가져 정당하게 같아질 수 있다. 남겨 두면 그 결함을 되살려야 초록이 된다.
- `scripts/check-desktop-readiness.mjs` 의 「두 볼트 문서의 정확한 문장」 핀 (`capabilities/desktop-app-distribution.md` · `domains/onboarding-ux.md` — 둘 다 재생성으로 사라짐). **처방**: 파일명도 문장도 고정하지 않고 **볼트 전체에서 「데스크톱 앱 설치 결정」 개념의 존재**를 본다. 게이트 자신이 적어 둔 지시(*"Point this gate at the surface that replaced it, or drop the check"*)를 따랐다. **잃은 것**: 특정 문장의 보존을 강제하지 않으므로, 개념은 있는데 프레이밍이 흐려지는 경우는 못 잡는다.
- `scripts/desktop-smoke.mjs` 의 볼트 표본을 `ontology/README.md` 로 교체. 이건 「번들에 볼트가 실렸는가」라 목적이 정당하고, **재생성에도 살아남는 파일**로 조준만 옮겼다. 잃은 것 없음.

**남긴 것과 근거**

- **다운로드 페이지의 캡션 == 그 캡션이 설명하는 그래프** (`DownloadPage.test.tsx`). 두 수가 `useStageGraph()` 한 훅에서 나오므로 유지 비용이 0 이고, "지도가 자기 자신을 정확히 센다"는 이 제품의 주장 자체다.
- **공개 계약의 수** — CLI 명령 수, MCP 도구 수와 read/write 분할. 의도적으로 바꿀 때만 바뀌므로 문서가 따라오는 것이 맞다.
- **웹 스모크의 「파싱된 노드 수 == 화면 수」** (`.claude/rules/surfaces.md`). 같은 실행 안에서 두 값을 비교하는 정합성 항등식이다.
- 라우트·토큰·파서 드리프트 계약은 애초에 이 지시의 대상이 아니다.

**기록된 반대**: *"수가 틀린 카피는 신뢰 비용이다."* 이 저장소는 실제로 그 비용을 냈다 — README 가 영문 절 98, 한국어 절 97 을 동시에 들고 초록이던 날이 있었고(2026-07-30), 화면 카피가 97 인데 볼트가 98 이던 날도 있었다. 게이트를 걷으면 그 상태가 다시 가능해진다.
**반증 조건**: **틀린 수가 사용자에게 노출된 사례가 관측되면** 이 반대가 옳았던 것이다 — 화면 카피·README·런치 자산 중 어디든, 실제 볼트와 다른 노드/관계 수가 발견되면 재상정한다. 그때의 복구는 옛 게이트의 부활이 아니라 **그 문장을 런타임 계산으로 옮기는 것**이 먼저다(다운로드 캡션이 이미 그 형태다).
**재검토**: 위 관측이 나타나는 즉시. 기한 없음.

**적용한 규칙**: **제거 요구** — 게이트를 지울 때 무엇을 잃는지 항목별로 적는다("불필요해 보여서"는 이유가 아니다) · **헌장 우선** — 「문서는 노드 수를 적지 않는다」는 이미 `AGENTS.md` 의 규율이었고, 게이트들이 그 규율을 거스르고 있었다.

**상태**: 유효

---

## 2026-08-01 — Windows x64는 공개 미서명 베타로 내되, 경고와 네이티브 증명을 다운로드의 일부로 만든다

**현상**: Windows 11 실기기가 없는 상태에서도 x64 설치 파일을 공개할 수 있는지,
그리고 긴 SmartScreen 경고를 다운로드 화면 어디에 둘지가 문제로 올라왔다. 기존
결정은 Windows가 서명된 설치 파일과 설치 검증이라는 macOS와 같은 문턱을 넘을 때까지
`준비 중`으로 두는 것이었다. 소유자는 베타 단계의 수요를 먼저 관측하기 위해
**미서명이라는 비용을 명시적으로 안고 공개**하기로 했다.

**결정**:

1. `v1.0.0-rc.5`부터 Windows x64 NSIS `.exe`를 공개 베타 자산으로 제공한다.
   Authenticode 서명이 없다는 사실은 숨기지 않고, 릴리스 잡도 실제 상태가
   `NotSigned`인지 역으로 검사한다. 서명된 척하는 복사와 산출물이 어긋나면 실패다.
2. 공개 전 네이티브 `windows-2022` 잡이 JavaScript/Rust 의존성 감사, Microsoft
   Defender 사용자 지정 검사, NSIS 무인 설치, 설치 앱 10초 실행, 번들된
   `ontology-atlas-mcp.exe`의 초기화·도구 목록·볼트 읽기를 통과해야 한다. 이 증거는
   **Windows 11의 실제 SmartScreen 화면을 검증했다는 뜻이 아니다**. 그 UI 증거는
   실기기 없이 주장하지 않는다.
3. 다운로드 화면은 한 plate 안을 `macOS`와 `Windows x64 베타` 두 플랫폼 절로
   구분한다. 같은 힘의 카드 두 장이나 filled-indigo CTA 두 개를 만들지 않는다.
   Windows의 정적 경고는 CTA 바로 앞에 두고 `aria-describedby`로 묶는다. 문구는
   코드 미서명, Microsoft Defender SmartScreen의 알 수 없는 게시자 경고, 관리되는
   회사 PC의 실행 차단 가능성을 모두 말한다. 브라우저 경로는 설치가 막힌 사람의
   낮은 무게 차선으로 남기되 작은 산문 링크로 숨기지 않고 `설치 없이 웹버전으로
   먼저 보기` outline 버튼으로 둔다. 판 바닥의 저장소 출구도 작은 `소스 코드 보기`
   대신 중간 높이의 `GitHub로 이동하기` 버튼으로 목적지를 직접 말한다.
4. 390px에서는 경고가 버튼보다 먼저 완전히 읽히고 Windows CTA는 폭 100%, 높이
   44px 이상이어야 한다. 768px 이상에서도 경고와 CTA를 한 가로줄에 넣지 않는다.
   하단 시연 영상의 계약은 건드리지 않는다: `/`에서만 보이고 `/download`에서는
   설치 결정이 한 화면에 오도록 숨겨지는 기존 구조를 유지한다.
5. 공개 자산 이름은 `ontology-atlas_<version>_windows_x64-setup.exe` 하나와 그
   `.sha256` 하나다. 생성 release facts는 GitHub Release의 URL·크기·해시에서만
   만들어지고, `/download`는 그 URL·크기만 표시하며 자리표시자 수치를 쓰지 않는다.

**PO 판정과 소유자 override**: 독립 PO 좌석들은 첫 Windows 배포를 초대형 미서명
베타로 제한하라고 권고했다. 공개 미서명 배포가 SmartScreen 마찰과 첫인상 불신을
수요 신호에 섞는다는 이유다. 소유자는 그 비용을 알고도 공개 다운로드로 검증할
표본을 먼저 얻는 쪽을 선택했다. 이 기록은 독립 판정을 지우지 않고 최종 권한과
책임의 위치를 남긴다.

**디자인 판정**: 조건부 승인. 위계 승자는 방문자의 플랫폼에 맞는 다운로드 CTA
하나이며, 플랫폼 제목·간격·구분선으로 경계를 만든다. 새 토큰은 만들지 않고 기존
amber warning 토큰과 기존 버튼 변형을 사용한다. 정적 경고는 `alert`나 모션을 쓰지
않는다. 실패 기준은 가로 overflow, 막힌 hit-test, 경고 뒤 CTA 순서 역전, 44px 미만
터치 타깃, 경고의 footer/disclosure 은폐다.

**후속 소유자 확정 (2026-08-01)**: 실제 렌더를 본 뒤 Windows 절 안의 웹 CTA를
다시 바닥 출구 행으로 옮겼다. Windows 절은 경고와 EXE만 답하고, 출구 행은 큰
`GitHub로 이동하기`를 왼쪽, 같은 44px 높이의 `웹버전으로 보기`를 오른쪽에 둔다.
390px에서는 둘이 세로로 쌓이고 그 이상에서는 한 행이다. 앞선 `설치 없이 웹버전으로
먼저 보기` 위치·문구는 이 후속 판정으로 대체되며, 페이지 출구와 플랫폼 선택을
섞지 않는 것이 이유다.

**가장 강한 반대**: 공개 미서명 베타는 Windows 사용자의 실제 관심보다
SmartScreen/알 수 없는 게시자 마찰을 더 크게 측정하고, 첫 접점의 신뢰를 소비한다.
초대형 베타가 설치 성공률과 제품 가치를 더 깨끗하게 분리해 측정한다는 주장.

**반증 조건**: 첫 20회 Windows 자산 다운로드에서 설치 완료 후 볼트 열기와 MCP
연결 사례가 관측되고, 반복적인 보안 경고 문의나 관리 PC 차단이 주된 실패로
쌓이지 않으면 위 반대는 과장된 것으로 본다. 반대로 동일 경고/차단 문의가 반복되거나
다운로드 뒤 설치 완료 증거가 거의 없으면 공개 링크를 확대하지 말고 서명 또는
초대형 배포로 돌아간다.

**재검토**: 첫 20회 Windows 다운로드, 동일 보안/설치 차단 제보 3건, 또는 Windows
코드 서명 인증서 확보 중 먼저 오는 시점.

**서명 (accountable)**: owner override — jinan
**상태**: 유효

---

## 2026-07-31 — 사람이 만든 노드 표기: 소급 출처는 존재하지 않는다 — 쓰기 시점 `created_by` 스탬프가 첫 슬라이스, 새 표면 0, 화면 라벨은 저작이 아니라 작업 상태로

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대) — chief 주재, 2라운드 · **트리거**: 공개 계약(frontmatter 스키마 + MCP 응답) 변경 + 소유자 직접 요청 (*"사람이 직접 온톨로지 만드는 건 별도로 화면에 표기해 줄 수 있어? … 사람이 만든 것만 모아보기 … 별도 LNB 탭이 좋으려나? 아니면 캔버스 상단 버튼?"*)
**선행 결정 관계**: 같은 날 「온톨로지 구축 규격」 결정이 `mcp/src/vault.mjs` 쓰기 원시 함수를 재편한다(PR1) — 이 슬라이스는 같은 지점에 스탬프를 배선하므로 먼저 머지되는 쪽 기준으로 다른 쪽이 리베이스한다.

**결정적 실측 (지킴이)**: `docs/ontology/.ontology-atlas/activity.jsonl` 은 98노드에 4줄, 전부 `agent:"codex"` — 「로그 없음=사람」 파생은 94/98 을 허위로 사람 저작 표기한다. git blame 은 더 나쁘다: git user 가 단일 사람(stark)이고 에이전트가 MCP 로 쓴 frontmatter 도 사람이 커밋하므로 98/98 이 사람 저작이 된다. **소급 추론으로는 출처가 존재하지 않는다 — 쓰기 시점 스탬프만이 사실을 만든다**(호출 경로 자체가 사실이라 위조 불가). 근거석은 이 한 숫자로 자신의 R1 처방(로그 계측)을 폐기했다. 결의 추가 실측: 내부 채팅 패널은 웹 UI 지만 실제 저작자는 에이전트고 그 "적용"은 `appendActivityEntry` 를 호출하지 않는다 — 「MCP=agent/나머지=human」 표면 휴리스틱은 성립하지 않으며, 스탬프는 표면이 아니라 **경로의 실제 행위자**를 적는다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 근거 | Build | `created_by` 선행 — 「모아보기」는 선택자가 먼저 존재해야 성립. 단 단독 상한 인정 |
| 결 | Build | 다섯째 경로(내부 채팅 패널) 실측 — 스탬프는 표면 아닌 행위자 기준. 패널 "적용"은 저작이 아니라 승인 |
| 지킴이 | Shape a slice | `reviewed_by` 본체론(패배, 반대 ①로 보존) · activity.jsonl 4줄 실측 · 부재=unknown 불변 조건 |
| 해자 | Build | Differentiation 2/4 — 「누가 썼나」는 커먼디티(Notion Created by 등), 3점은 `reviewed_by` 가 `get_concept` 제약으로 소비될 때 · 화면 1차 라벨 반대(반대 ②로 보존) |
| 지렛대 | Shape a slice | appetite 반나절 — 스탬프+스키마+질의 필터만, UI 0 · `reviewed_by` 는 슬라이스 2 |

**루브릭 합계**: 19/24 (통과선 18 · 치명적 0: 없음 · Differentiation 2 는 명시 상한 — 개방 조건은 슬라이스 2)

**갈린 지점**: `created_by` 먼저(근거·해자) vs `reviewed_by` 먼저(지킴이·지렛대). 시험은 소유자 원 요청 「사람이 만든 것만 모아보기」에 실제로 답하는가였다 — `reviewed_by` 단독은 이 질문에 선택자를 주지 않는다(검수 결과는 검수 대상 집합이 먼저 있어야 쓰인다). `created_by` 채택.

**적용한 규칙**: **합집합 금지** — 「둘 다 얇게」 기각, 결정은 `created_by` 하나 · **최소 슬라이스** — 쓰기 시점 스탬프 + 스키마 통과 + 질의 필터만, 소급 백필 0 · UI 0 · 새 표면 0(LNB 탭 · 캔버스 상단 버튼 모두 만들지 않음 — 전 좌석 합의).

**권고 (chief)**: 슬라이스 1 = 선택 필드 `created_by`(`human` | `agent:<name>`, activity.jsonl 과 동일 신원 출처). 스탬프는 경로가 증명하는 곳만: MCP 쓰기 도구=agent · 웹 공방 컴포저=human · 내부 채팅 패널 적용=agent(초안 저작자 기준) · CLI=미지(생략). `patch_concept` 는 기존 값 보존, 부재는 영원히 unknown(human 추론 절대 금지). `get_concept`/`list_concepts` 에 그대로 실리고 질의 필터로 「모아보기」가 MCP 에서 즉시 성립. 화면 표기는 슬라이스 2(디자인 게이트 경유, 라벨은 저작 주체가 아니라 작업 상태로). 슬라이스 3 후보 = `reviewed_by`/`reviewed_at`(PROV-O 차용)가 에이전트 쓰기 전 제약으로 소비되는 흐름.
**서명 (accountable: 소유자)**: 대기

**기록된 반대 ①** (지킴이·지렛대): *"「누가 썼나」는 커먼디티고 이 제품 고유의 복리는 「사람이 확인했나」가 에이전트 쓰기 전 제약으로 소비될 때 생긴다 — `created_by` 는 만들지 말고 `reviewed_by` 만"* — **반증 조건**: `created_by` 가 쌓인 뒤에도 그것을 선택자로 쓰는 질의(사람 저작 모아보기 · 검수 대상 선별)가 실세션에서 관측되지 않으면 이 반대가 옳았던 것이다 — **재검토**: 슬라이스 2 착수 시점.
**기록된 반대 ②** (해자): *"화면에 「사람이 만든 것」 저작 라벨을 1차로 쓰지 마라 — 2026-05-03 VS Code `git.addAICoAuthor` 롤백은 출처 라벨이 공/과로 읽혀 반발을 만든 전례다. 데이터는 `created_by`, 라벨은 작업 상태로"* — 슬라이스 2 의 설계 제약으로 **채택된 반대** — **반증 조건**: 작업 상태 라벨로 내보낸 뒤에도 사용자가 저작 주체 명시를 계속 요구하면 재론; 반대로 저작 라벨을 1차로 노출한 뒤 스탬프 회피나 라벨 끄기 요구가 관측되면 이 반대가 확증된 것이다 — **재검토**: 화면 표기 슬라이스 설계 시.

**슬라이스**: IN — 스키마 필드 + 경로별 스탬프 + 질의 필터 + 계약 테스트 + `mcp/README.md` · OUT — 소급 백필 · UI 라벨/탭/버튼 · `reviewed_by`(후속) · CLI 자동 행위자 판별 · appetite — 반나절.
**제거/강등**: 새 LNB 탭 · 캔버스 상단 버튼(소유자 제안 두 형태 모두 — 데이터 없이 표면부터 만드는 순서 역전) · 「로그 없음=사람」 파생 · git blame 파생 · R1 로그 계측안(근거석 자진 폐기).

**상태**: 유효

---

## 2026-08-01 — [확장] 브릿지 노드를 규격의 1급 개념으로 — 이름 없는 절차에 이름과 자격 조건을 붙인다

**소집 근거**: 소유자 직접 요구 (*"노드가 수십 개씩 확산되면 이상하지? 브릿지 노드 같은 걸 고민해야 한다 … 구축 시스템 프롬프트가 매우 좋아야 한다? 도구도 그렇고"*) — **소집한 자리**: 없음. 기존 결정의 연장이다: `CONSTRUCTION_RULES_EN` step 4(공유 행동을 명명해 add_concept 1회 + 자식 재부모화)가 이미 정확히 이 행위를 지시하는데 **대상의 이름이 없어** LLM 이 「이런 노드를 만들어도 된다」를 개념으로 집지 못했다. chief 단독 조정, 구현 판정 2건은 기준과 함께 구현자 위임.

**정의 — 자격 조건 4가 붙지 않은 브릿지 권장은 빈 버킷 승인이다** (카운슬 전체가 합의한 Goodhart 함정과 정면 충돌하므로, 이름과 자격은 반드시 함께 간다):
1. 브릿지는 자식들이 **공유하는 행동을 명명**한다 — 「그룹 A/B」처럼 자리만 나누면 브릿지가 아니다.
2. 그 행동을 **한 문장으로 쓸 수 있어야** 만든다(step 4 기존 조건 승계).
3. 브릿지 자신도 **다른 형제와 의미 배타적**이어야 한다.
4. 만든 뒤 자식이 **실제로 재부모화**돼야 한다 — 빈 채로 남으면 그게 빈 버킷이다.

**코드 방어**: 자식 0개(해소 기준)이거나 본문이 스타터 템플릿 그대로인 브릿지는 결정론적으로 잡혀야 한다 — 기존 「존재를 벌었나」 부류 감사에 걸리는지 확인하고 안 걸리면 배선(프롬프트만으로는 비프론티어에서 샌다 — 기존 강등 원칙 그대로).

**정한 경계**:
- **kind 신설 반대** — 4-kind 위계는 제품의 뼈대고 스키마 enum 이 고정한다. 지도가 브릿지를 판별해야 한다면 **구조적 파생**(예: capability 이면서 자식이 전부 element 이고 자신이 다른 capability 의 자식) 우선, frontmatter 플래그는 위조·손편집 드리프트 표면이라 파생 불가가 증명될 때만.
- **원샷 브릿지 도구(add_concept+patch_concept N 을 한 호출로)는 이번에 만들지 않는다** — 새 MCP 도구는 공개 계약 확장이다. 재상정 조건: 캘리브레이션에서 약한 모델이 다단 절차를 완주 못 하는 것이 관측되면.
- **시각 표현**은 별도 디자인 사안 — 소유자 후보 중 glow·붉은 테두리는 헌장 금지(glow 명문 예외 1건뿐, 적색은 error 전용). 데이터 쪽 산출은 판별 가능성 결론까지.
- 순서: **볼트 재생성보다 먼저** — 브릿지 개념 없이 재생성하면 다시 만들어야 한다.

**위임한 판정 2건 (기준 포함, 구현자)**: ⓐ 브릿지 안내가 `add_concept` description 인가 서버 안내문인가 — 바이트 예산 실측으로 판정 ⓑ 밀집 경고의 다음-할-일 문구를 「브릿지를 만들라」로 구체화 — step 4 와 문장 중복 없이.

**반증 조건**: ① 자격 조건 4가 프롬프트에 있는데도 빈 브릿지가 생성되는 세션 관측 → 코드 방어 승격 ② 다단 절차 완주 실패 관측 → 원샷 도구 재상정(별도 원장 기록으로) — **재검토**: 볼트 재생성 캘리브레이션 결과.

**상태**: 유효

---

## 2026-07-31 — [정정] 구축 규격에 «연구된 권장 범위»를 채운다: 부트스트랩 트리거 8(domain→capability)·6(capability→element), 살아있는 볼트 p90 우선 — 그리고 dogfood 볼트는 수리가 아니라 전면 재생성한다

**소집 근거**: 소유자 정정 2건(직전 레코드의 서명 범위 초과) — **소집한 자리**: 근거(po-evidence) 단발 호출 · **이유**: 「어떻게 아는가」와 서술/규범 구분이 걸린 문헌 조사. 카운슬 재소집 아님 — 직전 레코드의 본체(자격 게이트·하드 캡 없음·advisory 원칙)는 그대로 유효하고, 이 기록은 그 위 두 곳을 정정·확장한다.

**소유자 정정 ① (권고 일부 뒤집음)**: *"개수가 몇 개가 적절할지 … 온톨로지 논문들 다 찾아보라고 한 거야. 좀 정해 놓으면 훨씬 낫잖?"* — 카운슬이 기각한 것은 통과/실패 **하드 캡**이고, 소유자가 요청한 것은 0에서 시작하는 사용자를 위한 **연구된 권장 범위**다. 둘은 다른데 chief 의 브리핑이 하나로 묶어 전달했다. 「상한 없음」 결론의 조사가 부족했다는 점은 지킴이 스스로 인정(*"N&M 2001 단독 + OntoQA/OQuaRE 서술 메트릭의 규범 과대 해석"*).

**소유자 정정 ② (직전 레코드 OUT 항목 뒤집음)**: *"dogfood 데이터를 신규 기반으로 전부 다 수정 … 기존 거 다 지우고 … 예시 쇼핑몰 데이터도"* — 직전 슬라이스가 OUT 으로 두었던 「전면 볼트 재작성」을 소유자가 명시적으로 IN 으로 뒤집었다. 92 파일럿 수리 → **전면 재생성, 0에서**: 기존 `docs/ontology/` 를 통째로 지우고(브랜치에서, 지우기 전 커밋), **새 규격의 시스템 프롬프트를 따르는 에이전트가 이 저장소를 읽고 다시 만든다**(기존 진입점 `/ontology-bootstrap`·`analyze_repo_structure` 활용). 손보정 금지 — 손보정이 필요했다면 그 지점이 규격의 구멍이고, 고칠 것은 볼트가 아니라 규격 문장이다. 이 재생성이 곧 비프론티어 캘리브레이션 세션이다. 분포가 권장 범위를 벗어나면 규격을 고치고 재생성을 반복한다. 쇼핑몰 샘플 소스도 같은 절차. `created_by` 는 human 약 10(사람 판단이 성립 조건인 노드: 도메인 경계·프로젝트 정의·방향)·나머지 `agent:*`, 선정 근거를 문서에 남긴다 — #801 의 「소급 추론 금지」는 기존 볼트 얘기고, 새로 만드는 볼트는 값이 사실이다. 순서는 소유자 명시: **규격 확정(값+PR1~3) → 재생성**. 재생성 자체가 규격의 첫 검증이다 — 새 볼트 분포가 권장 범위를 벗어나면 규격이 틀린 것이다.

**근거 조사 결과 (2026-07-31, 출처는 직접 열어 확인)**:
- **권장(트리거) 범위**: `domain→capability` **6~10, 중심 8** · `capability→element` **5~7, 중심 6** · `project→domain` 은 표본 무의미로 규격에 넣지 않음. 서술 통계에서의 승격이며 승격 근거는 실측 분포다 — schema.org `Thing` 직속 11(15년 프로덕션 루트 폭), 우리 볼트 비허브 domain 중앙값 4, 유일한 건강 사례 `topology-kind-legibility`(element 7개 전부 실노드 해소).
- **적용 형태**: 볼트 자신의 p90 이 1순위(해당 kind 부모 10개 이상일 때), 부트스트랩 값은 그 전까지의 폴백. 하드 캡 아님 — 트리거 시 요구하는 것은 「형제와 겹치지 않는 한 문장」이지 개수 축소가 아니다.
- **발화 조건 강등 (비프론티어 대응)**: 밀집 부모 경고는 참조 해소율 <70% 또는 bulk-provenance 동반 시에만 발화 — 전부 해소된 넓은 부모(schema.org `CreativeWork` 직속 67, 정당한 대팬아웃)는 트리거하지 않는다. 「공유 접두사」는 필수 사전 필터에서 격하 — 방향이 양쪽 다 틀리는 신호로 실측됨(`topology-kind-color-*` ×4 는 정당, cli 92는 접두사 0 겹침인데 결함).
- **직전 레코드의 사실 정정 2건**: ⑴ "OQuaRE 의 NOCOnto 는 권고 임계값 자체가 없다" 는 부정확 — 밴드는 있으나 SE 관행 차용이고 전문가 신뢰도가 갈린다(Duque-Ramos 2013 · PLOS ONE 2014). "무규범"도 "1급 규범"도 과단순화. ⑵ Miller 7±2 는 재인(recognition) 과제에 적용되지 않아 이 규격의 근거로 쓰지 않는다(Larson & Czerwinski 1998 의 함의는 오히려 「라벨 질이 좋으면 폭은 문제 아님」).
- **실측 추가**: `capabilities/elements[]` 234건 중 노드 해소 38건(16%) — cli 의 92는 유일 사례가 아니라 극단값이고, 대다수 capability 는 element 문서 없이 코드 경로만 가리킨다. `denseParentActionMessage()` 는 p90 인자를 받도록 짜여 있으나 호출부 0건(배선 미완 스텁)이었다.

**적용한 규칙**: 최소 슬라이스(새 응답 스키마 0 — 기존 게이트·`postWriteMaintenance`·상수 블록 확장만) · 합집합 금지(접두사 신호를 살리는 절충 대신 격하).

**권고 (chief)**: 위 값을 `schema.mjs` `BOOTSTRAP_FANOUT_TRIGGER`(8/6) + `MIN_PARENTS_FOR_LIVE_PERCENTILE`(10) 로 심고 dense-parent 트리거를 배선(PR1 후속, 같은 브랜치) → PR2/PR3 텍스트 파생 → **재생성 스테이지**: 전면 — 부분 존치 판정은 소유자가 명시 철회(*"기존 데이터를 아예 지우고 새로 만들어야지 처음부터, 지금 우리가 세팅할 시스템 프롬프트 기반으로"*). 판정 기준: 새 볼트 분포가 권장 범위 안 · `elements:` 에 파일 경로 0건(그건 evidence) · vault:validate/package:check/docs-vault:check 통과 · 내용이 실제 코드와 정합 · **손보정 0건 보고**(있었다면 위치+이유=규격 구멍 목록). 쇼핑몰 샘플은 생성물 직접 편집 금지, 소스에서 재생성. 캘리브레이션 시나리오에 CreativeWork 형(넓지만 정당) 케이스 필수 포함.
**서명 (accountable: 소유자)**: 승인 — 정정 자체가 소유자 발화다. 잔여 확인 1건: 부트스트랩 값 8/6 자체는 근거의 승격 판단이므로 재생성 결과가 나오면 실측으로 재검한다.

**기록된 반대 / 반증 조건**: ⑴ 8/6 이 틀렸다면 — 규격 가동 후 신규 볼트들의 실측 중앙값이 8/6 근방이 아니라 뚜렷이 다른 값에 수렴하는 것이 관측된다 → 그 실측값으로 상수 교체 (**재검토**: 재생성 스테이지 완료 + 첫 성장 리포트). ⑵ 발화 조건 강등이 틀렸다면 — 참조가 전부 해소됐는데도 사람·에이전트가 다루지 못하는 20+ 자식 부모가 관측된다 → 직전 레코드 지킴이 반대의 반증 조건과 합류, 개수 기반 신호 재상정. ⑶ 텍스트 지시가 비프론티어에서 실패한다면 — 트리거 후에도 에이전트가 「distinct role」 문장 없이 형제를 계속 추가하는 세션 관측 → 해당 규칙을 코드 방어로 강등.

**슬라이스**: IN — 값 배선(PR1 후속)·PR2·PR3·재생성 스테이지(dogfood+쇼핑몰, `created_by` 포함) · OUT — 하드 캡(불변)·`project→domain` 트리거·볼트 노드 수 문서 고정(#800 에서 걷어낸 게이트 부활 금지) · appetite — 값 배선 반나절, 재생성은 규격 확정 후 별도 산정.

**상태**: 유효

---

## 2026-07-31 — 온톨로지 구축 규격: 「팬아웃 상한」이 아니라 「노드 자격 게이트」 — 92는 자식이 아니라 미해소 문자열이었다. 규격은 값·로직·텍스트 3정본, LLM 텍스트는 영어 단일 정본에서 두 경로(MCP·내부 채팅)로 파생

**소집**: PO 카운슬 5인 전원(근거·결·지킴이·해자·지렛대) — chief 주재, 2라운드 반박 + 최종 산출 3건 · **트리거**: 공개 계약(MCP/CLI/스키마) 변경 + 「무엇이 좋은 온톨로지인가」 방향 결정 + 소유자 직접 요청 (*"하위에 60개씩은 말이 안 된다 — 도구가 기가 막히게 구성하게 해야 하고, 규격이 정해져 코드 방어와 시스템 프롬프트 양쪽에 녹아야 하며, 비프론티어 LLM 에서도 성립해야 한다"*).
**선행 결정 관계**: 2026-07-31 「3D 분할 장치 반려」의 `DENSITY_GATE_THRESHOLD=12` 는 렌더 기하 상수로 **그대로 유효**하되 이번 결정과 독립 — 12를 「표현·모델의 독립 수렴」이라 부르는 서사는 금지한다(`density-gate.ts` 주석 스스로 라벨 충돌 기하 실측이라 말한다 — 결·해자 일치). chief 가 지목한 긴장 ⓐ/ⓑ는 **둘 다 기각**: 렌더러는 92를 접은 것이 아니라 애초에 그린 적이 없다.

**결정적 실측 (해자, 카운슬 전체가 수용)**: `cli-developer-entry` 의 `elements:` 92건은 자식 노드가 아니라 **볼트에 존재하지 않는 파일 경로 문자열**이다 — 92/92 미해소(볼트 전체 element 노드는 41개). `find_backlinks`·`find_path`·`contains` BFS 어디에도 안 잡히고 지도에 그려진 적도 없다. validator 의 `dangling-graph-reference` 이슈 코드는 **이미 존재**하는데 아무도 안 보고 있었다. 팬아웃 상한은 이 결함을 정의상 0건 잡는다 — 92는 상한 위반이 아니라 **범주 오류**(의미 슬롯에 파일시스템 엔트리)다. 성장 경로도 실측됨(지킴이): 92는 대부분 `patch_concept` 로 자랐는데 경고 파이프라인은 최초 생성(`add_concept`)에만 있다 — `patch_concept`(무경고)·`add_relation`(제3의 쓰기 경로)이 구멍이다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 근거 | Shape a slice | Problem insight 3 · User moment 3 — 국소 결함(허브 소수)이지 전볼트 결함 아님(중앙값 3 건강); 고정 상한은 근거 약함; inputSchema description 준수율 > 시스템 프롬프트(IFEval-FC), 스키마 강제 100% vs 텍스트 지시 5~10% 실패 |
| 결 | Shape a slice | Verification 1(구현 전) — 채널은 경고 문자열이 아니라 실행 가능한 액션(`postWriteMaintenance`+다음 도구 호출 지목); 발화는 문턱 돌파 1회+배수만; 영어 프롬프트 실문자열 초안 + Goodhart 방지 문구 + 비프론티어 캘리브레이션 설계 작성 |
| 지킴이 | Shape a slice (핵심 서브슬라이스는 Build 급) | Ontology value 4 · Agent value 4 — patch_concept/add_relation 경고 구멍 실측; 규격 규칙표(code-block/code-warn/prompt-only 분류); 볼트 수리 최종안(1R 형제 분할안 철회 → evidence 강등+추출 수용); SPEC §6 이슈 코드 추가는 공개 계약 확장 아님 |
| 해자 | Shape a slice | Differentiation 3 — 92/92 미해소 실측; 「노드 자격 게이트」로 슬라이스 교체; 경쟁 지형(Zep 하드캡=스키마 캡·LlamaIndex strict=type 어휘만·GraphRAG 사후 계층·Palantir 수치 가이드 없음) — 구축 시점 자격 검사는 공백; 프롬프트만이면 하루짜리 복제, 3층이 닫히면 해자 |
| 지렛대 | Shape a slice | appetite: PR 6개 — 정본 3분할(값=schema.mjs 상수·로직=vault.mjs 쓰기 원시 함수·텍스트=construction-spec.mjs 신설) + 파생 지도·게이트 목록·순서 |

**루브릭 합계**: 18/24 (통과선 18 · 치명적 0: 없음. Verification 1 은 구현 전 상태 — 캘리브레이션 세션이 구현 PR 의 통과 조건으로 명기됨)

**소유자 다섯 질문에 대한 답**:
1. **근거** — N&M 2001 「2~12」는 오늘 규범 권위가 아니다: 동료심사 없는 tech report 이고, OntoQA 의 fan-outness/IR 은 결함 지표가 아니라 서술 지표, OQuaRE 의 NOCOnto 는 권고 임계값 자체가 없으며, OOPS! 693개 온톨로지 실증 카탈로그에 「직속 자식 과다」 피트폴이 **없다**(있는 건 정반대 P17 과잉 특수화). schema.org 는 `Thing` 직속 ~9와 `CreativeWork` 직속 75가 15년째 공존 — **잘 만든 온톨로지의 팬아웃 분포 자체가 롱테일**(뿌리 좁고 허브 넓음, Wheeldon & Counsell 멱법칙과 동형)이고 우리 볼트(중앙값 3·허브 소수)와 같은 모양이다. **분포는 이상하지 않다. 허브의 내용물이 이상했다.**
2. **상한** — 두지 않는다. 어느 층에도 고정 개수 상한·kind 별 상한 없음. 강행은 자격 검사(참조 해소·범주 오류·층 배치)이고 전부 **경고+액션**(`missing-expected-field` advisory 선례 유지 — 거부는 grandfather 추적 토끼굴+배치 부분 실패 왕복으로 에이전트 루프를 끊는다). 자동 추출 배치는 개별 경고 skip + 종료 후 1회 요약(기존 패턴).
3. **도구가 잘 만들게** — 3층 방어, 정본 3분할: ⑴ **로직 정본** `mcp/src/vault.mjs` 쓰기 원시 함수 1곳(add/patch/add_relation 전 경로가 상속) — 그래프 배열 참조가 실노드로 해소되는지 쓰기 순간 검사, 미해소면 두 갈래 액션 제시(①`add_concept` 로 승격 ②evidence 로 강등), path-shaped-title(경로형 제목→"이건 evidence 다") · bulk-provenance(한 기계 배치 출생 형제 N개→접기 제안) 포함 ⑵ **값 정본** `mcp/src/schema.mjs` 상수 블록(CLI 미러는 기존 게이트가 동기) ⑶ **텍스트 정본** `mcp/src/construction-spec.mjs` 신설 — 영어 절차형(IF/THEN) 규칙 문자열 export → `SERVER_INSTRUCTIONS`·`add_concept` description/inputSchema·내부 API-key 에이전트 채팅 시스템 프롬프트 3곳에 **interpolate 파생, 사본 0**. 절차화 불가 규칙(형제 배타성 등 판단형)은 프롬프트에 남기지 않고 도구 계산 신호로 강등 — 비프론티어 대응의 핵심. 숫자는 목표치가 아니라 트리거("keep under N" 형태 금지 — Goodhart). 발화는 문턱 돌파 1회+배수만.
4. **볼트 수리** — `cli-developer-entry`(92): 형제 capability 5개 분할안 **폐기**(잘못된 참조 92개를 살린 채 지표만 통과시키는 게이밍), 미해소 92건을 evidence 로 강등하고 **진짜 element 개념 8~12개만 추출**(지킴이 최종안). `views`(54): 36개 element 를 capability 경유로 재배선, 정당한 domain 직결 예외는 목록으로 명시 유지. 순서: 92 파일럿 → 결과 검증(validate_vault dangling 0 + get_concept 이 실노드만 반환) → views. 이 수리가 규격의 첫 증명(dogfood).
5. **합성 볼트** — 분포는 결함이 아니므로 «고쳐진 건강한 볼트»로 바꾸지 않는다. 실측 롱테일 유지(이미 멱법칙 반영), 92급 허브는 스트레스 기준선으로 유지. PR4(볼트 수리) 후 실측 재도출 예약 — 그 전 재피팅은 이중 계산 순환.

**갈린 지점**: 92의 수리법 — 지킴이 1R 「형제 capability 5개 신설+`broader`」 vs 해자 「미해소 참조 강등+진짜 개념 추출」. 해자의 92/92 미해소 실측이 승부를 정리했고(분할은 버킷 게이밍), 지킴이가 반박 라운드에서 수용해 판정을 바꿨다.

**적용한 규칙**: **합집합 금지**(다섯 처방을 합치지 않음 — 해자의 자격 게이트를 슬라이스의 본체로 채택하고 팬아웃 상한은 어느 형태로도 버림) · **최소 슬라이스**(기존 `dangling-graph-reference` 이슈 코드·`postWriteMaintenance` 큐·vault.mjs 단일 배선 지점·근접중복 warning 문장 템플릿 재사용 — 새 응답 스키마 0·새 에러 코드 0) · **헌장 우선**(경고+액션이지 거부 아님, 텔레메트리 0 유지 — 준수 검증은 실세션 트랜스크립트로).

**권고 (chief)** — 지렛대의 PR 순서 채택:
PR1 `vault.mjs` 자격 게이트+경고 배선(patch/add_relation 구멍 포함)+`schema.mjs` 상수 → PR2 `construction-spec.mjs` 영어 텍스트 정본+SERVER_INSTRUCTIONS·description 파생+계약 테스트(문자열 포함 검사 수준) → PR3 내부 API-key 채팅 시스템 프롬프트 파생 → PR4 볼트 92 파일럿(강등+추출) → PR5 views 재배선 → PR6 synth-vault 실측 재도출+SPEC §6 문서화. 각 구현 PR 의 통과 조건에 결의 캘리브레이션 세션 1회(프론티어+비프론티어 — 준수율 급락 규칙은 코드 방어로 강등). CLI `--help` 는 포인터 한 줄(복제 아닌 참조). AGENTS.md 에는 규칙 복제 안 함(32KiB).
**서명 (accountable: 소유자)**: 승인 (2026-07-31, 실행 지시로) — ① 92는 「강등+추출」, ② 「고정 상한 없음: 자격 게이트가 본체」 둘 다 소유자가 명시 확인 (*"「12개 상한」은 철회됐다 — 그걸 만들지 마라 … 규격의 본체는 노드 자격 게이트다"*). 미결 질의(경고 발화 빈도)는 소유자 답 없음 → 결의 기본값(문턱 돌파 1회+배수)으로 구현하고 캘리브레이션 세션에서 재검한다.

**기록된 반대** (지킴이 1R, 가장 강함): *"N&M 2~12 는 여전히 유효한 규범이고(OntoQA·OQuaRE 가 branching factor 를 1급 메트릭으로 유지, schema.org Thing 9·GO 3·SNOMED top 19), 대형 온톨로지도 한 부모 밑을 평면으로 넓히지 않는다 — 개수 자체에 경고가 있어야 한다"* — **반증 조건**: 자격 게이트(참조 해소·범주 오류·provenance) 전부 가동된 뒤에도 **실노드로만 이루어진 부모가 20+ 자식으로 자라며 그 목록을 사람도 에이전트도 다루지 못하는 사례**가 관측되면 개수 기반 신호를 재상정한다 — **재검토**: PR4·PR5 완료 후 첫 성장/유지보수 리포트.

**슬라이스**: IN — PR1~6(위 순서) · OUT — 고정 팬아웃 상한(모든 층) · kind 별 상한 · 하드 거부 · 전면 볼트 재작성(98→~50 merge 축소 포함 — 파일럿 결과가 답) · `/ontology/studio` 쓰기 경로(독립 코드, 다음 라운드) · AGENTS.md 규칙 복제 · appetite — PR 6개, 각 반나절~1일.
**제거/강등**: 팬아웃 상한 아이디어 자체 · 지킴이 1R 형제 capability 5개 신설안 · 「12 독립 수렴」 서사(렌더 기하 상수로만 존치).

**출처 (주요)**: [N&M Ontology 101](https://protege.stanford.edu/publications/ontology_development/ontology101.pdf) · [schema.org CreativeWork](https://schema.org/CreativeWork) · [OntoQA](https://www.semanticscholar.org/paper/e93140d7bc70667f31ebf16387dbd0e86d0fa4eb) · [OQuaRE](https://github.com/tecnomod-um/oquare) · [OOPS! 카탈로그](https://oops.linkeddata.es/catalogue.jsp) · [멱법칙 클래스 관계 arXiv cs/0305037](https://arxiv.org/pdf/cs/0305037) · [Zep entity types](https://help.getzep.com/customizing-graph-structure) · [LlamaIndex SchemaLLMPathExtractor](https://docs.llamaindex.ai/en/stable/examples/property_graph/property_graph_advanced/) · [GraphRAG community detection](https://www.mintlify.com/microsoft/graphrag/concepts/community-detection) · [Palantir ontology best practices](https://www.palantir.com/docs/foundry/ontology/ontology-best-practices) · IFEval-FC(arXiv 2509.18420) · LLM-KG survey(arXiv 2510.20345)

**상태**: 유효 (승인 — 실행 개시, PR1 부터 순서 고정)

---


## 2026-07-31 — 드래그 140ms 의 처방: 후보 ② 「제한을 진짜로」 채택 — 단 진범의 78%는 FA2 가 아니라 separation 이었고, Barnes-Hut 은 이미 켜져 있었다

**소집 근거**: 소유자 위임 판정("셋 중 무엇인가") + 최고빈도 표면(노드 드래그)의 확정 결함 —
**소집한 자리**: 모션 1석 단발 · **이유**: 갈린 지점이 "드래그 중 FA2 를 빼면 촉각이 죽는가" 하나뿐이고
그것은 모션 소관. **미소집**: PO 전석(가치 질문 없음 — 표면/공개 계약/방향 불변의 결함 수리) ·
디자인 타석(터치 지점이 드래그 물성 단일).
**원장 확인**: ① 2026-07-29 「배경 원점 재정의」— 모션석이 "드래그 질량(릴리즈 정착 720ms)"를 우와
목적지로 기지명 = 릴리즈 정착 방향 기승인. ② 2026-07-28 `/download` 기록된 반대 ③ 의 반증 조건
("지도가 버벅인다")이 이번 실측(드래그 중 rAF work 139.9ms · 소유자 실기 136.8ms · LONGTASK 상시)으로
**부분 관측됨** — 그 기록의 처방 "엔진 포기가 아니라 비용 구조 수선"이 이번 출발점이다.
**루브릭 합계**: 해당 없음 (버그 수리 — PO 미소집 사유 위)

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 모션 | ② 조건부 채택 (전제 2건 정정) | V8 마이크로벤치 분해(합 132ms, 브라우저 실측 139.9ms 와 5% 이내 재구성): `relaxNodeSeparation` 전 노드 3000 O(N²)×2회 = **109.3ms(78%)** · FA2 3 iters(BH on) = 22.7ms(16%) · freeze 0.5ms. **후보 ③은 no-op** — `force-layout.ts:89` `barnesHutOptimize: true` 가 최초 커밋(c12310d09)부터 켜져 있었다. **후보 ①은 수리가 아님** — 139.9→~117ms 로 롱태스크 잔존 + tug 는 드래그 Δ의 순수 함수라 가역(소성 0·이웃 상호작용 0·질량 차 0: 1홉 0.45/2홉 0.15/τ 0.15s 고정) + 릴리즈 시 tug 되감김(안쪽 ≈1200px/s)과 FA2 정착(바깥쪽)의 **속도 부호 반전**이 정면 발현. 이웃 궤적의 호(arc)는 FA2 만 만든다 — 드래그 중 FA2 를 끄면 물성이 평행이동으로 퇴화 |

**갈린 지점**: 자리 간 갈림 없음(1석). 갈림은 **브리프의 전제와 코드 사이** — "FA2 가 범인, BH 는 꺼짐"
이라는 전제가 실측·git 이력으로 기각됐고, 선택의 실익은 "FA2 를 어떻게 하나"가 아니라 **"제한을 warm
블록 전체(FA2 + separation)로 넓히는가"** 로 재정의됐다.

**적용한 규칙**: 최소 슬라이스(증상을 실제로 0 으로 만드는 가장 작은 조각 — ①은 더 작아 보이나 117ms
를 남기므로 수리가 아니라 미봉) · 헌장 우선(중단 시 속도 연속성 · 경로 물성 — ① 반려의 물성 근거) ·
제거 요구(제거 대상 = 화면 밖 ~2750 노드에 매 프레임 지불하던 계산과 유령 토큰 — 애니메이션이 아니라
낭비를 제거).

**권고 (chief)**: 후보 ②를 warm 블록 전체로 확장 적용, 1패스:
1. **sub-sim** — 그랩 시 1회 구축(affected 1+2홉 ∪ 3홉 경계 링, 링은 매 tick 후 원좌표 재스탬프),
   반복수 `forceIterationsForDt` 유지(단 order>800 이면 1 클램프), 종료 시 메인 sim 커밋 후 폐기.
   구축 비용 실측 M=1250 에서 0.77ms(드래그당 1회 — `dragAffectedSetRef` 는 이미 그랩 시 고정).
2. **separation** — `relaxNodeSeparation(nodes, { …, moveableIds })` **필수 인자**로 시그니처 변경
   (생략=전체가 표현 불가능하게) + 균일 그리드(셀=2·r_max·1.35) 실측 109.3→0.92ms.
   `tick(iterations, restrictToIds)` 의 `?` 도 뗀다 — "생략하면 전 그래프"가 이 사고의 문법적 뿌리.
3. **릴리즈 이음새** — 릴리즈 프레임에 tug offset 을 sim 좌표에 가산 커밋 후 clear: 위치 델타 0px ·
   속도 부호 반전 0회 · 소성 획득. 결계 위반 하드컷 경로는 배타 계약으로 정당, 유지.
4. **토큰/문서 드리프트 정정** — `--topology-motion-drag-settle`(720ms, design.md·globals.css:768 주석에만
   존재) vs 실재 `--topology-v2-node-release-settle-ms`(900) : 이름 하나·값 하나로 확정하고 두 문서 동시
   정정. `INTERACTION_DPR_CAP` 주석의 "드래그 중 2.2ms"는 팬 경로 측정치 — 노드 드래그 근거 인용 금지.
5. **게이트** — G1 시그니처=타입 게이트 · G2 `tests/contract/drag-frame-scope.contract.test.ts`(넘겨받은
   노드 수 단언 + 정지 노드 좌표 해시 바이트 동일) · G3 `barnesHutOptimize===true` 계약 고정(이 값이 무게이트라
   "안 켜져 있다"는 가설이 살아남았다) · G4 정착 토큰 테스트 · G5 `perf-node-drag.mjs --assert-max-work`
   (로컬 판정용, CI 는 G2 가 진다) · G6 구현 후 `/motion-verify` S1~S5(끌기 궤적 곡률>0 · 릴리즈 델타 0 ·
   재잡기 · reduced-motion swap · synth=31 대조).
**성공 숫자** (120Hz · synth=3000): rAF work **p95 ≤4.0ms / max ≤6.0ms** · 3000:31 work 비 **≤5배**(현 155배) ·
드래그 중 롱태스크(≥50ms) **0건** · 릴리즈 위치 델타 **0px**·속도 부호 반전 **0회** · 정착 속도 단조 감소 ·
1홉 추종 지연 150±30ms, 변위 Δ×0.45×falloff ±10%. WKWebView(Tauri) 재검증은 같은 숫자로.

**서명 (accountable: 소유자)**: 위임 — 소유자가 판정을 chief 에 위임(2026-07-31, 요청자 경유). 뒤집으면 기록.

**기록된 반대**: 후보 ① (브리프 제안 — 드래그 중 FA2 완전 오프, dragTug 단독 + 릴리즈 정착만 FA2.
가장 단순하고 sub-sim 유지비 0) — **반증 조건**: ② 구현 후 S1 실측에서 이웃 궤적 곡률이 지각 불가
수준이거나(호가 있으나 마나였다는 뜻), sub-sim 경계 링 유지비가 새 결함(클러스터 표류 · 재잡기 파손)을
낳으면 ①이 옳았다 — 그때 쓸 보상 파라미터(질량 factor=base×1/(1+0.35·log₂(1+deg)) clamp[0.15,0.45] ·
τ 거리/차수 스케일 clamp[0.15,0.30] · 릴리즈 커밋)는 모션석 보고에 보존돼 있다. — **재검토**: ② 구현 +
motion-verify S1~S5 실측 1회 후.

**슬라이스**: IN — 권고 1~5 전부(1패스) · OUT — dragTug 질량/τ 스케일(① 보상안, 반증 시에만) ·
저감쇠 오버슛 도입 · separation 대칭 push 재설계. appetite — 수리 1패스.
**제거/강등**: 화면 밖 ~2750 노드 프레임당 계산(측정된 제거 대상) · 유령 토큰
`--topology-motion-drag-settle` 이름 하나.

**상태**: 유효 (위임 서명 — 소유자 뒤집기 시 기록)

---

## 2026-07-31 — 3D 는 「분할 장치」로도 반려 — 밀집의 뿌리는 펼침 무게이트 + 군중의 서열 채널 0개

**소집**: 디자인 카운슬 4석(도해·위계·상호작용·체계) — chief 주재 · **트리거**: 소유자
실측 제보(`?synth` 지도 — 노드 ~150 중 이름표 2 · 동일 사각형 · 엣지 수프 · 칩 `+61`
일괄 펼침, *"이렇게 구분도 안되게 많은데.. 이건 뭔가 개선방안 없나?"*)가 앞선 3D
축 심사 라운드(원장 미기록 — 대화에만 존재)의 전제 "2D 가 이미 그 일을 한다"를
흔들어 재상정. 재상정 질문: **3차원이 밀집을 더하는 게 아니라 푸는 데 — 한 평면의
개수를 나누는 데 — 쓰일 수 있는가.**
**루브릭**: 해당 없음 — PO 재소집 없는 디자인 재상정(소유자 직접 요청 개선).

| 자리 | 판정 | 소유 처방 |
|---|---|---|
| 도해 | 3D 기각 · 펼침 캡 승인 | 축별 분할 재채점(아래) · 형제 마크 대비 1:1 실측 · "2D 부호화 채널(크기·라벨)이 먼저" |
| 위계 | 3D 기각 · 캡은 3순위 | 1순위 「드러난 노드는 이름을 갖는다」(라벨 수용량 되먹임) · 강등 3건 지목 |
| 상호작용 | 3D 기각 · 캡 선결 | 형제 자동 접힘(동시 ≤2) · 초과분은 INDEX 딥링크 · "전체 접기" 안전판 부재 보고 |
| 체계 | ③2.5D·④자유3D 반려 · ①재귀 게이트 승인 | **뿌리 진단**: `DENSITY_GATE_THRESHOLD=12` 게이트가 펼침에는 재귀 적용되지 않음 — 계약의 구멍이지 2D 의 한계가 아님 |

**축별 분할 능력 재채점** (도해석 — "표현에 좋은 축과 분할에 좋은 축이 다르다"):
kind **0/3** (색뿐 아니라 **반경이 이미 kind 를 나름** — 이중 중복, 군중은 전원 같은
kind 라 분리 효과 0. 앞 라운드보다 더 낮게 재확정) · 의존깊이 **0~1** (리프 균일) ·
시간 **1~2 조건부** (데이터에 시간 분산이 있을 때만) · 완성도 **2~3 조건부** (유일한
tier-독립 축 — 단 실 vault 에 필드 실재·분산 검증 선행). 순위는 뒤집혔으나(완성도
최하→최상) **어느 축도 오늘의 3D 를 정당화하지 않는다.**

**결정** (4/4 일치 + 갈린 지점은 아래):
1. **3D 반려 재확정, 사정거리를 좁혀서** — "표현으로도 분할로도 오늘 값이 없다."
   자유 회전·지구본 반려(위계: 원근이 유일하게 작동하는 서열 채널인 반경 램프를
   파괴 — 앞 element 가 뒤 project 보다 커 보임 · 상호작용: 드래그=팬 점유라 모드
   모호성 · 체계: attention layer 계약이 카메라 각도에 종속). 직교+고정 시점 2.5D 도
   이번 결함(같은 kind 형제 폭발)의 축을 겨냥하지 않아 무효 — `?tilt=` 와 같은 계열.
   ⚠️ 위계석 확인: `?tilt=` 는 **미구현**(grep 0건) — 승계할 부채 없음.
2. **이번 슬라이스 = 체계석 처방**: 밀도 게이트를 펼침에 **재귀 적용** — 펼침은 상위
   K(DOI 랭킹, `rankEgoNeighborsByDOI` 재사용)만 드러내고 나머지는 중첩 칩. 상한은
   새 상수가 아니라 기존 `DENSITY_GATE_THRESHOLD=12` 재사용. 게이트: `density-gate.test.ts`
   순수 함수 계약(61자식 → ≤12 + 중첩 칩, 재귀 동일) + `onVisibleCountChange` 총량 훅 테스트.
3. **후속 슬라이스 순서 기록** (이번 결정 아님 — 각 자리 소유): ⓐ 위계 1순위 「드러난
   노드는 이름을 갖는다」 — 배치 크기를 `greedyPlaceLabels` 실제 수용량에 되먹임, 계약
   테스트(hittable 노드 중 라벨 미배치 0건) ⓑ 위계 2순위 element 크기=연결도(backlinks,
   기존 `radiusMagnitudeK` 캡 재사용) ⓒ 상호작용 형제 자동 접힘 + "전체 접기" 안전판.

**적용한 규칙**: **최소 슬라이스**(재귀 게이트 — 기존 순수 함수·칩 문법의 확장, 새
토큰·새 크롬·새 모드 0) · **합집합 금지**(4석 처방을 합쳐 결정하지 않음 — 가장 작은
하나만 이번 결정, 나머지는 후속으로 자리 소유 명기) · **제거 요구**(강등 3건 아래) ·
**헌장 우선**(모드 불증식 — 3D 토글은 label-lod 의 "no discrete mode flip" 불변식 위반).

**제거/강등** (위계석): ① `CLUSTER_CHIP_LABEL_PRIORITY` 2→4 이하 + 부모당 칩 1개
(현재 펼침·접기 2개) + 무리 bbox 밖 앵커 — 숫자 칩이 모든 이름을 억누르는 잉크 역전
② 펼친 무리 안 `contains` 엣지 dim/제거 — 링 근접성이 이미 말한 중복 잉크 ③ element
라벨 대비 3.71:1 — 4.5:1 로 올리거나 ≤2:1 로 내림, 반쯤 읽히는 글자 금지.

**갈린 지점**: 상한의 값과 형태 — 체계·도해 **12**(기존 상수 재사용, 이원화 방지) vs
상호작용 **8** + 초과분 INDEX 딥링크 vs 위계 **고정 숫자 아님**(프레임별 라벨 수용량).
12 채택 근거는 최소 슬라이스(새 상수·새 배선 0).

**지구본 판정**: 구면은 트리 위계 데이터에 무정당 — 소집자의 "절반이 뒤로 넘어간다"
는 맞다(도해). 소유자의 욕구는 위상이 아니라 **규모의 실감**(위계) — 비3D 충족:
ⓐ 군중을 덩어리(집합 윤곽+개수)로 ⓑ 크기 분산이 점밭을 지형으로 만듦 ⓒ 데모 광은
관문 클립의 몫 — 팔 장면은 지구본이 아니라 *"이름 없는 150 → 접혀서 12 → 열면 전부
이름을 가진 채"* (이 클립을 찍으려면 라벨 계약이 선행 — 데모 욕구와 위계 수리가 같은 방향).

**수렴 기록** (소집자 요청): 3D 논의는 두 라운드 연속 2D 로 수렴했다. **종결 조건을
명시하고 닫는다** — 재상정은 ① 완성도류 tier-독립 필드가 실 vault 에 실재+분산함이
검증되고 ② 배치가 층간 (x,y) 재사용을 막음을 증명할 때만. 그 전의 3D 제안은 이 기록
인용으로 닫는다.

**권고 (chief)**: 결정 2 를 이번 슬라이스로 구현(소집자의 "펼침 개수 제한 먼저" 방향
확인 — 단 상한은 **재귀**여야 하고 값은 12). 후속 ⓐⓑⓒ 순서 승계.
**서명 (accountable: 소유자)**: 대기

**기록된 반대 ①** (위계석, 가장 강함): *펼침 상한은 위생이지 답이 아니다 — 상한 3
작업본 실측에서 노드 150→72 로 줄어도 이름 비율 13.3%, 밝은 잉크 증가 0.000%. 소유자
문장은 "많다"가 아니라 "구분이 안 된다"이고, 그 답은 라벨 계약이다.*
**반증 조건**: 재귀 게이트 출시 후에도 소유자가 "구분 안 된다"를 다시 제보하거나
펼친 군중의 라벨 비율이 유의미하게 오르지 않으면 — 위계석 순서가 옳았던 것. 후속 ⓐ 를
즉시 다음 슬라이스로 앞당긴다.
**기록된 반대 ②** (상호작용석): *초과분 접근은 중첩 칩이 아니라 INDEX 패널 딥링크여야
— 중첩 페이지네이션은 같은 문제를 한 단계 뒤로 미룰 뿐.* **반증 조건**: 중첩 `+N` 칩을
연타하며 특정 노드를 사냥하는 사용이 관측되면.
**재검토**: 재귀 게이트 머지 후 소유자가 같은 `?synth` 화면을 다시 펼쳐 볼 때.

**슬라이스**: IN 재귀 밀도 게이트(+테스트 2) · OUT 3D 전부 · 라벨 계약(ⓐ 후속) ·
크기=연결도(ⓑ 후속) · 자동 접힘(ⓒ 후속) · appetite 반나절.

**부수 관측** (이 결정 밖, 수리 대상으로 넘김): `?synth` 에서 INDEX 는 기본 샘플
볼트("온라인 쇼핑몰"), 캔버스는 합성 볼트를 그림 — 같은 화면의 두 표면이 다른 볼트를
말함(상호작용·위계 동시 관측) · "전체 접기" 안전판 부재 · 접기 칩 히트 타깃 협소 ·
element 라벨 WCAG 미달 3.71:1 · `MAX_EXPANDED_PARENTS=3` 이 미커밋 작업본에 이미 존재.

**상태**: 유효 (선행 3D 라운드는 원장 미기록이었음 — 이 기록이 그 결론까지 소급 수록)

---

## 2026-07-31 — 지시문은 **다 싣지 않고 필요할 때 싣는다**: AGENTS.md 32KiB 아래 · rules 73KB→13.6KB 조건부 · 강행 규칙은 훅으로

**소집**: 임시 감사 4갈래(줄당 심사 · 2026-07 관행 조사 · 에이전트/스킬/docs 심사 · 반증 감사) 를 chief(fable)가 주재 · **트리거**: 소유자 지시(하네스 정비) + **Codex 상한 초과 실측**
**루브릭**: 해당 없음 — 제품 표면 결정이 아니라 에이전트 컨텍스트 계약의 정비
**결정**: 아래 셋. 규칙 문장은 **하나도 지우지 않는다** — 자리를 옮기고 실리는 조건을 바꾼다.
**적용 규칙**: 최소 슬라이스(게이트가 이미 지키는 것의 산문만 줄인다) · 합집합 금지(다이어트와 path-scoped 재구성을 **둘 다** 하지 않고 작은 쪽 먼저)
**서명**: 소유자 — 대기

**무엇이 관측됐나 (이 기록의 출발점)**

`AGENTS.md` 가 39,617B 였다. Codex 는 `project_doc_max_bytes`(기본 32,768B)
초과분을 **경고 없이, 문장 중간에서** 버린다 — 실측 절단선이 `modifie|d` 에
떨어졌고, 그 뒤가 통째로 Codex 에게 존재하지 않았다: 볼트 쓰기 루프 전체
(`add_concept`·`add_relation`·`rename_concept`·`merge_concepts`·`patch_concept`),
frontmatter 스키마 표, 프로젝트 포함 관계 모델. **에이전트가 볼트를 신선하게
유지한다는 것이 이 제품의 정체성인데, 두 에이전트 중 하나에게는 쓰는 법이
안 보였다.**

더 중요한 것은 **아무도 몰랐다**는 점이다. `agent-files` CLI 가 이 초과를
`agents-md-over-codex-cap` 으로 exit 1 과 함께 이미 보고하고 있었는데, 어느
워크플로에도 물려 있지 않았다. 같은 CLI 가 보고하던 `skill-copy-diverged` 3건
(`.claude/skills` 에만 들어간 `?guides=off` 지시 — 그 상태로 Codex 가 감사
스킬을 돌리면 첫 방문 스크림에 덮인 화면을 잰다)도 같은 이유로 썩어 있었다.
**게이트가 있는데 안 켜져 있으면 게이트가 없는 것과 같다.**

**결정 ① — `AGENTS.md` 는 32KiB 아래를 유지한다 (39,617 → 29,280B)**

자른 기준은 Claude Code `/doctor` 의 공식 트림 정책이다: *"cuts content Claude
can derive from the codebase — directory layouts, dependency lists, architecture
overviews — and keeps pitfalls, rationale, and conventions that differ from tool
defaults."* Folder map · Tech stack · Quick start · Routes 를 그 기준으로 다시
썼다 — 지운 것은 파일에서 읽히는 것이고, 남긴 것은 읽어도 안 나오는 것이다
(`output: 'export'` 라 서버 런타임이 없다, 그래프 렌더러가 우리 것이다, 셋업
단계가 없다, `/` 는 묻는 사람이 정한다).

`pnpm agents:check` 를 CI 에 걸었고 **상한을 넘기 전에** 경고하는 구간(여유
10% 미만)을 더했다. 이분법이면 사람은 절벽을 밟고 나서야 알고, 여유가 수백
바이트일 때 정상적인 한 문단 추가가 CI 를 빨갛게 만들면 다음 단계는 정리가
아니라 우회다.

**결정 ② — `.claude/rules/` 는 셋만 상주하고 다섯은 조건부다 (73,368 → 13,662B)**

공식 `paths:` frontmatter 를 쓴다. 상주/조건부의 판별 기준은 **"파일을 열기
전에 필요한가"** — 조건부 규칙은 매칭 파일을 *읽을 때* 실리므로, 그 전에 내려야
하는 판단은 조건부로 두면 늦는다. `npm publish` 를 실행할지(`forbidden`),
백엔드를 도입할지(`local-first`), 어떻게 커밋할지(`git`)는 아무 파일도 안 읽고
결정된다.

`design.md` 31KB 를 조건부로 내려도 「절대 금지」층은 안 사라진다 — 보라→핑크
그라디언트·glassmorphism·glow pulse·scale hover 가 `forbidden.md`(상주)에 이미
있다. 다만 감사에서 **금지 8종 중 하나(토폴로지 클릭 → 풀스크린 모달)만
`forbidden.md` 에 없다**는 것이 나와 등재했다. 나머지는 값 규칙이라 lint 가
잡는데 이것은 상호작용 설계라 못 잡는다.

이 방식에는 새 침묵 실패가 딸려 온다: **아무 파일도 안 맞는 글롭을 쓰면 그
규칙은 영원히 안 실린다.** 파일도 있고 YAML 도 유효하고 에러도 안 난다.
첫 적용에서 실제로 `i18n/**` 이 0개였고(실 위치 `src/i18n`), `src/**` 가 덮어서
증상이 없었다 — 안 덮었으면 아키텍처 규칙 전체가 조용히 빠졌을 것이다.
`tests/contract/rules-path-scope.contract.test.ts` 가 **"이 글롭이 오늘 이
저장소에서 무언가를 맞추는가"** 를 재고, 상주 목록도 `ALWAYS_LOADED` 로 잠갔다.

**결정 ③ — 되돌릴 수 없는 규칙은 산문이 아니라 훅이다**

공식 문서: *"Claude treats them as context, not enforced configuration. To block
an action regardless of what Claude decides, use a PreToolUse hook instead."*
`git.md` 가 이미 금지하던 둘을 훅으로 옮겼다 — `block-unsafe-git.sh`
(`--no-verify` · force push · main 직접 push · `reset --hard`)와
`block-generated-edit.sh`(생성물 JSON 손 편집). 후자는 **실측 사고 전례가 기록된**
규칙이었다(*"충돌 마커를 손으로 지우다 JSON 안에 남겨 타입 검사가 깨진 전례"*).
규칙은 있었고 사고는 났다.

**감사가 잡은 것 — 이 기록에 남겨야 할 실패**

반증 감사가 개편 자체보다 위험한 것을 찾았다. **`src/shared/lib/cn.test.ts` 는
`cn.ts` 주석과 `design.md` 가 이름으로 지목한 가드인데, 스텝 7개를 손으로 적어
두고 그것만 돌고 있었다.** 그 사이 `hero-lg` 가 램프에 추가됐고 목록에는 안
들어갔다 — **가드가 지킨다고 적힌 바로 그 사고(2026-07-23 크롬 16px: 스텝 추가
후 등록 누락)가 그 파일 안에서 이미 일어나 있었다.** `globals.css` 파생형으로
다시 썼다.

교훈으로 남긴다: **문서가 "가드 있음"이라고 말하는 자리는 다음 감사자도 안
본다.** 하드코딩 목록은 "검사한 것만 검사한다".

같은 감사가 실행자(나)의 주장 둘도 반증했다 — 커밋 메시지의 절감 수치가 두
커밋 몫을 하나가 가로챈 것이었고, "볼트 쓰기 루프가 **잘렸다**"는 서술은 부정확
했다(그 절들은 지워진 적 없다 — Codex 에서 **안 실렸을 뿐**이다). 기록해 둔다.

**기록된 반대 ①** (관행 조사석): *부분 다이어트로는 부족하다 — 85KB 도 여전히
크고, 공식 절감 전략은 처음부터 조건부 로드다.*
**반증 조건**: 다이어트 이후에도 lint/계약 테스트가 잡는 신규 위반 유입 빈도가
줄지 않거나, rules 에 명시된 규칙을 에이전트가 어기는 사고가 재발하면 — 그때
부분 조정이 아니라 전면 재구성으로 간다.
**재검토**: 이 개편 머지 후 2주

**기록된 반대 ②** (실행자 자기공격, 감사에서 **기각**): *Routes 17행을 어느
도구도 자동 로드하지 않는 `docs/ARCHITECTURE.md` 로 넘긴 것은 계약 유기다.*
기각 근거: 조건부 `rules/architecture.md`(`src/**`·`app/**`)가 라우트 목록과
계약 주석을 들고 있고 새 라우트 작업은 그 글롭에 걸린다 + `decisions:check` 가
라우트 증감에 원장을 강제한다.
**반증 조건**: 라우트 추가 PR 이 두 사본(영문 ARCHITECTURE.md / 한글 rules) 중
하나와 어긋난 채 머지되는 것이 **1회라도 관측되면** 정합 게이트를 신설한다.
**재검토**: 다음 라우트 추가 시

**상태**: 유효

---

## 2026-07-31 — 가이드를 여섯 장으로 가른다 (`/guide/[segment]`) + 읽는 표면은 화면 가운데에 선다

**소집**: 단독 패스 · **트리거**: 새 표면(`/guide/[segment]`). 소유자 직결 결정.
**선행 기록 인용**: 2026-07-30 「관문에 읽을거리 둘」 — **여전히 유효하고, 이번은
그 안의 분화다.** 그 기록이 정한 것(볼트 문서를 그린다 · `docs` 가 아니라 `guide` ·
잘랐으면 잘랐다고 말한다)은 하나도 뒤집지 않는다. 바뀐 것은 **한 장이 여섯 장이
된 것**뿐이다.
**루브릭**: 선행 기록의 16/24 를 승계 — 판정 근거(볼트 렌더 · 이름 충돌 회피)가
그대로이고 이번 변경이 그 근거를 건드리지 않는다.
**결정**: 가이드를 여섯 장으로 가르고 `/guide/[segment]` 를 낸다. 순서·슬러그·번역
키의 단일 진실원은 `views/gateway-doc/model/guide-pages.ts` 의 `GUIDE_PAGES` 하나다.
**적용 규칙**: 최소 슬라이스 — 새 콘텐츠 저장소를 만들지 않고 볼트 문서를 그대로
쓴다. `/guide` 는 리다이렉트하지 않고 첫 장을 그 자리에서 그린다(공유되는 주소의
URL 이 바뀌면 링크를 받은 사람이 자기가 뭘 눌렀는지 모른다).
**서명**: 소유자 (*"니가 분석해서 가이드좀 여러개로 분리해서 만들어줘"*)

**곁들여 결정한 것 둘** (표면 신설은 아니지만 같은 화면의 규율이라 여기 남긴다):

1. **읽는 표면은 산문 기둥을 화면 정중앙에 세운다.** 관문의 「모든 원소가 같은 x」
   (2026-07-29 평결 ③)를 여기 적용한 것은 **사정거리 밖 적용**이었다 — 그 평결이
   존재하는 이유는 랜딩의 오른쪽에 지도가 있어서인데 읽는 페이지의 오른쪽에는
   아무것도 없다. 1920 에서 1053px 이 빈 채로 남았다. 차례가 생긴 뒤에도 같은
   쏠림이 재발해(본문이 오른쪽 열의 왼쪽에 붙음) 차례와 **같은 폭의 빈 자리**를
   오른쪽에 뒀다. 실측 어긋남 0px.
2. **관문 크롬에서 「지도로 돌아가기」를 없앤다.** 설치 전 방문자에게 워크벤치를
   권할 이유가 없고, 볼트가 있는 사람은 애초에 `/` 에서 지도로 간다.
   `map-destination-route` 감시 목록에서도 지웠다 — 그 게이트의 명제는 "지도를
   약속한 컨트롤은 지도로 간다" 이지 "그 컨트롤이 존재한다" 가 아니다.

**기록된 반대**(근거석 자리, 내가 대신 적는다): **여섯 장이 한 장보다 낫다는
근거가 아직 없다.** 분할의 출발은 방문자 이탈 데이터가 아니라 다른 제품(Orca)의
문서 레이아웃이었다. 한 장짜리 긴 문서는 `Cmd+F` 로 한 번에 뒤질 수 있는데
여섯 장은 그것을 잃는다.
**반증 조건**: 가이드 방문자가 첫 장에서만 이탈하고 2장 이상 여는 비율이 낮으면
반대가 옳았다 — 그때 되돌릴 것은 분할이 아니라 **차례의 라벨**(각 장이 무엇을
답하는지 제목이 말하고 있는가)이다.
**재검토**: 방문 데이터가 2주치 쌓였을 때.

**상태**: 유효

---

## 2026-07-30 — 관문에 읽을거리 둘을 낸다: `/guide` · `/changelog` — 손으로 쓴 마케팅 페이지가 아니라 **볼트 문서를 그린다**

**소집**: 단독 패스(`/po-pass`) · **트리거**: 라우트 신설 — 규정상 카운슬 필수
소집 대상이었으나 **소유자가 직결로 결정**했다(원장 규칙 "한 사람이 책임지고
결정한다"). 소유자 지시: *"docs말고 guide로 진행하자 그럼 이미 docs는
쓰고있으니까"*, *"이 프로젝트 가이드를 진짜로 만들자"*.
**루브릭**: 16/24 (치명적 0: 없음 — 단, **볼트 렌더를 전제로 한 점수**다.
손으로 쓴 마케팅 페이지였다면 온톨로지·에이전트 가치가 각각 0 이라 9/24 였다)
**결정**: 볼트 안 마크다운(`docs/GUIDE.md` · `docs/CHANGELOG.md`)을 그리는 라우트
둘 + 관문 크롬의 링크 둘 + X 자리(비활성).
**적용 규칙**: 최소 슬라이스 — 새 콘텐츠 저장소를 만들지 않고 이미 리뷰받는
파일에 주소를 붙인다.
**서명**: 소유자 (*"좋아.. 그럼 만들자!"*)

**`docs` 가 아니라 `guide` 인 이유**: `/docs` 는 **이미 문서함**(볼트 피커·편집기)
이다. 상단 내비에 "Docs" 를 걸면 문서를 기대한 방문자가 폴더를 고르라는 워크벤치에
떨어진다. 이름 충돌을 라우트 단에서 피했다.

**왜 볼트 문서를 그리나 (이 결정의 핵심)**: 손으로 쓴 사본을 따로 두면 반드시
한쪽만 고쳐지고, 그때 방문자가 보는 쪽이 낡은 쪽이다. 그리고 이 선택이 dogfood 를
주장에서 **관측 가능한 사실**로 바꾼다 — 사이트의 읽을거리가 Atlas 볼트의
문서이고, 같은 파일을 앱에서 열 수도 에이전트가 MCP 로 읽을 수도 있다.

**변경 내역은 자른다 — 그리고 잘랐다고 말한다**: 전문이 **318KB**다. 최근 12절만
그리고, 접은 개수와 원문 위치를 화면이 함께 말한다. 조용한 절단은 "이게 전부"라고
말하는 것과 같다(`surfaces.md` 「강등에는 왜 + 어디로가 함께 온다」의 같은 얼굴).

**X 는 자리만 만들고 비활성이다**: 계정은 실재하고 URL 만 아직 없다. `X_HANDLE`
상수가 비면 크롬이 비활성으로 그리고, 채우면 링크가 된다 — 컴포넌트는 안 건드린다.
⚠️ 이 패턴을 **존재하지 않는 채널의 자리**를 미리 그리는 데 쓰면 그때는
`"곧 공개" 는 거짓말이다` 조항 위반이다.

**기록된 반대**(근거석 자리에서, 내가 대신 적는다): **제2 관측 채널이 없다.** 이
변경의 출발은 방문자 문의나 이탈 로그가 아니라 소유자가 다른 제품의 내비를 본
것이다. 14일 순방문 35명, 다운로드 전환 미관측 상태에서 읽을거리가 병목이라는
증거는 아직 없다. 병목이 헤드라인이나 신뢰 신호 쪽이면 이 두 페이지는 아무것도
바꾸지 못한다.
**반증 조건**: 배포 후에도 다운로드 전환이 0 이고, `/guide`·`/changelog` 방문이
관문 방문의 5% 미만이면 반대가 옳았다 — 그때 고칠 것은 이 페이지들의 내용이 아니라
**관문이 무엇을 약속하는가**다.
**재검토**: 방문 데이터가 2주치 쌓였을 때, 또는 첫 외부 사용자 피드백이 왔을 때.

**상태**: 유효

---

## 2026-07-30 — 클립 A 재정의: 「기능 소개 투어」 — 터미널·타이핑 조항 소멸 + 도구 버튼 순서는 `AGENT_CLIENTS` 파생으로

**소집**: 없음 (소유자 직접 지시 2건)
**트리거**: ① *"클로드 코드에 연결된것까지 보여줄 필요는 없어 그냥 기능들
소개하는 영상이잖아"* ② *"버튼 순서 결함 고치고 앱 재빌드하고 클립도 다시
찍으면 되는거 아냐?"*

**결정 ①** — 클립 A 는 「터미널(Claude Code 연결·기동) + 사람 손 타이핑」이
아니라 **기능 소개 투어**다(지도 노드 포커스 → 문서함 → 공방 → 인사이트 →
프로젝트 → 지도 귀환). 이로써:

- 2026-07-29 「시나리오」 기록의 클립 A 정의 중 **터미널·타이핑 절은 소멸**한다.
  타이핑이 없으므로 *"사람 손 타이핑(자동화 금지)"* 조항은 사정거리 밖 —
  조항 자체가 틀렸던 게 아니라 **대상이 사라졌다**. 커서 이동 자동화는 같은 날
  「커서 규율 오버라이드」 기록이 이미 서명했다.
- 같은 기록의 **촬영 순서 강제(②)의 근거였던 배타성**(A 는 `.mcp.json` 필요 ·
  B 는 불가)도 약해진다 — A 가 연결 상태를 *보여줄 필요*는 없어졌다. 다만
  B(연결) → A(기능) 순서는 서사상 여전히 자연스러워 유지한다.

**결정 ②** — 연결 시트의 도구 버튼 열이 JSX 하드코딩(Claude Code → Cursor →
Antigravity → Codex)으로 `AGENT_CLIENTS`(Claude Code → Codex → Cursor →
Antigravity)와 **한 시트 안에서 두 순서**를 갖던 결함(「하나의 목록, 두 진실」
부류)은 렌더 순서를 그 배열에서 **파생**시켜 수선하고, 계약 테스트
(`AgentClientButtons.test.tsx`)로 잠근다. 수선은 앱 재빌드·재설치를 요구하고,
이미 성공한 클립 B 테이크가 옛 순서를 보여주게 되므로 **클립 B 는 재촬영한다**
— 소유자가 그 비용을 알고 서명했다.

**서명**: 진안 (원문 인용 2건)

**기록된 반대**: 없음 — 다만 촬영 실무 기록 하나를 남긴다: 클립 A 테이크 1·2 의
실패 원인은 대본이 아니라 **frontmost 계약**이었다(비활성 앱에는 `cliclick`
클릭이 전달도 활성화도 되지 않는다 — 이동/호버만 배경 창에 닿는다). 또한
verify-app 재기동은 incognito WebView 저장소라 **첫 방문 안내(스크림+전면
blocker)가 매 기동 재무장**되어 클릭을 삼킨다. 촬영 전 목적지 투어를 걷어내고
비트마다 클릭 직전 재활성화하는 것이 처방이다.
**반증 조건**: 결정 ① 이 틀렸다면 — 시연을 본 방문자가 "에이전트와 뭘 하는
건지 모르겠다"는 반응을 보인다(클립 B 혼자서는 연결 가치를 못 전한다는 관측).
**재검토**: 시연 영상 공개 후 첫 사용자 피드백.

**상태**: 유효

---

## 2026-07-30 — `/` 는 **언어만 판정한다**: 라우트 복원 제거, 관문이 웹의 메인 얼굴

**소집**: 단독 패스 · **트리거**: 소유자가 `/` 를 열었더니 `/ko/topology/` 가 나와
*"이 페이지 아직도 redirect 되네?"* 를 **결함으로 보고**했다. 코드는 설계대로 돌고
있었다 — 그 브라우저에 마지막 라우트 기억이 있었을 뿐이다.
**결정**: `LocaleRedirect` 의 라우트 복원 제거. `/` → `/{ko|en}/` 만.
**서명**: 소유자 (*"그래 그렇게 해줘"*)

**선행 결정 인용 — 유효, 이번은 그 위의 한 겹.** 2026-07-30 「root-first-open 뒤집기」
가 `/` 를 얼굴로 만들었고 그 판정은 그대로다. 그때 손대지 않은 것이 **복원**이었다.

**왜 복원이 관문에서 악덕인가.** 앱에서는 미덕이다(작업하던 자리로 복귀). 관문에서는
사이트의 얼굴이 방문자의 과거에 따라 달라지고, 그래서 **소유자조차 자기 첫인상을 볼
수 없다.** 링크를 공유해도 보내는 사람이 받는 사람이 볼 화면을 모른다. 결함이 아닌데
결함처럼 보이는 화면은 결함이다 — 이 기록의 트리거가 그 증거다.

**앱이 잃는 것은 없다.** 앱에서 `/` 는 볼트가 있어 지도로 간다(`isGatewaySurface()`).

**정해진 주소 모델** (혼란의 원인이 "일 하나에 주소 둘"이었다):

| 주소 | 일 |
|---|---|
| `/` | 언어 판정만 |
| `/{locale}/` | **홍보 겸 다운로드 얼굴**(볼트 없는 웹) · 볼트 있으면·앱이면 지도 |
| `/{locale}/download/` | 같은 얼굴의 명시 딥링크(빵부스러기 + 지도 복귀) |
| `/{locale}/topology/` | 지도 |

**로케일을 URL 에 남기는 이유** (소유자 질의: 페이지 안 토글로 대신하면 안 되나).
next-intl 이 모든 라우트에 접두사를 붙이므로 한 페이지만 예외로 두는 것은 URL 계약을
깨는 일이다. 그리고 홍보 표면에서는 URL 로케일이 **유리하다**: 공유 링크가 언어를
싣고(토글은 잘못된 언어가 한 번 깜빡인 뒤 바뀐다), 검색엔진이 두 언어를 각각 색인한다.

**기록된 반대**: 재방문자에게 복원은 실제로 편했다. 매 진입마다 지도를 다시 찾아가는
비용이 생긴다.
**반증 조건**: 재방문자가 매 진입마다 지도를 다시 찾아가는 것이 관측되면 반대가 옳았다.
그때 되살리는 것은 복원이 아니라 **관문에서 지도로 가는 길**이다 — 얼굴이 사람마다
달라지는 대가는 다시 치르지 않는다.
**게이트**: `src/shared/ui/locale-redirect.test.tsx` — 옛 계약 테스트를 지우지 않고
**뒤집어 남겼다**(기억이 있어도 관문으로 간다). 다음 사람이 "복원이 편하겠다"고
생각했을 때 왜 없는지 그 자리에서 읽는다.

**상태**: 유효

## 2026-07-30 — 전역 스코프는 **선택지로 넣고 기본값은 뒤집지 않는다**; 볼트 밖은 앱이 쓰지 않고 그 도구가 쓴다

**소집**: 단독 패스 + 공식 문서 실측 조사 · **트리거**: 소유자 관측 — *"전역 설정들
가능하게 해주면 되는거 아냐? 대부분 에이전트 연결할때 프로젝트별 보다는 전역으로
할텐데?"*
**결정**: 「적용 범위: 이 폴더 / 이 컴퓨터 전체」 세그먼트 하나(새 표면 0). **전역은
앱이 쓰지 않고**, 볼트 절대 경로가 이미 박힌 명령/스니펫을 준다. 기본값은 **프로젝트**,
한 번 고르면 기억한다(sticky).
**적용 규칙**: 최소 슬라이스 · 제거 요구 충족(고급 표의 중복 `~/.cursor/mcp.json` 행
삭제) · 규칙 하나가 예외 넷보다 지켜진다
**서명**: 소유자 (*"전역으로 하는게 맞으면 그렇게해도됨 명령 복사로 하는게 맞는지
일단 다른 서비스는 어떻게 제공하는지를 먼저 알아봐줘"* — 조사 후 판단을 위임)

**선행 결정 인용 — 여전히 유효하다.** `src-tauri/src/agent_setup.rs` 의
`resolve_config_root` 가 *"홈 설정 `~/.claude.json` 까지 가지 않는다 — 사용자 홈의
전역 설정을 앱이 건드리는 것은 「쓰기는 명시 승인」 원칙에 비해 사정거리가 너무
넓다"* 고 적어 뒀다. 이번 패스는 그것을 **뒤집지 않고 인용**한다. 소유자 요청은
"전역을 쓸 수 있게" 였고, 그것은 앱이 홈을 쓰지 않고도 충족된다.

**조사가 결정을 정했다** (MCP 서버 벤더 공식 문서 12곳,
`.qa-scratch/mcp-install-ux-survey-2026-07-30.md`):

| | |
|---|---|
| 복사할 CLI 명령 제공 | **12/12** |
| `~/.claude.json` 직접 편집 안내 | **0/12** |
| 제3자 설치 관리자가 Claude 설정을 직접 씀 | 1/12 (그것도 프로젝트 파일) |
| 전역/user 를 **기본**으로 미는 곳 | **0/12** |
| 백업·병합·잠금 전략을 문서화한 곳 | **0/12** |

마지막 행이 결정적이다 — **「안전한 직접 쓰기」 선례가 업계에 없다.** 그리고
`~/.claude.json` 은 공식 문서상 MCP 엔트리와 **런타임에 갱신되는 per-project
토글**(`enabledMcpServers`/`disabledMcpServers`)이 동거하는 상태 저장소라,
제3자 쓰기는 lost-update 다. 원클릭이 「성공처럼 보이는 실패」가 된다.

**도구별로 다르게 하지 않은 이유**: `~/.cursor/mcp.json` 은 제3자(딥링크)가 쓰는
관행이 있어 "Cursor 는 우리가 쓰고 Claude 는 명령" 도 가능했다. 기각 — ① 사용자가
왜 다른지 알 수 없고 ② Rust 보안 경계를 홈까지 넓혀야 한다. 규칙 하나로 갔다:
**볼트/리포 안은 앱이 쓴다, 볼트 밖은 그 도구가 쓴다.**

**기록된 반대 (소유자 관측)**: *"대부분 전역으로 할 것"* — 이 관측이 맞다면 기본값이
프로젝트인 것은 대다수에게 한 번의 추가 클릭이다. 이 논점을 **선택지로는 전부
수용하고 기본값으로는 기각**했다. 근거: 벤더 12곳 중 전역 기본 0곳, 그리고 되돌릴 수
있는 쪽(볼트 안 = `git diff`·`git checkout`)이 기본이어야 한다. 관측은 **기억**으로
존중한다.

**반증 조건**: 설치 사용자가 연결할 때 **전역을 고르는 비율이 프로젝트를 넘고**, 그
전환에서 이탈(세그먼트를 바꾼 뒤 아무 것도 복사하지 않음)이 관측되면 소유자 관측이
옳았던 것이고 기본값을 전역으로 뒤집는다 — 상수 하나다
(`agent-scope-preference.ts` 의 `FALLBACK`). 그 경우 감사 문장도 함께 고쳐야 한다.

**두 번째 반증 조건**: Claude Code 가 `~/.claude.json` 을 **읽기 전용 설정과 런타임
상태로 분리**하거나, 벤더 중 한 곳이라도 직접 쓰기 + 병합/잠금 전략을 공식화하면
`--scope user` 명령 복사를 원클릭으로 승격한다. 그때의 형태는 A(직접 쓰기)가 아니라
**Claude Code 플러그인**일 가능성이 높다 — Sentry·Slack·Figma·Cloudflare 가 이미
그쪽으로 이동했다(5/12).

**게이트**: `tests/contract/agent-global-scope.contract.test.ts` — 앱의 쓰기 뿌리가
홈으로 갈 수 있게 되면 실패(`resolve_config_root` 에 홈 해석이 생기면 걸린다), 전역
패널이 쓰기 명령을 부르면 실패, 경로가 홈 상대 표기가 아니면 실패, 상실 문장이 한
로케일에서 빠지면 실패, 기본값이 뒤집히면 실패. 프로브로 확인(고의 위반 2건 → 2건
빨감).

**재검토**: 첫 10명 설치 후 스코프 선택 분포. 그전에는 안 만진다.

**상태**: 유효

## 2026-07-30 — 시연 촬영: 소유자가 **커서 규율을 오버라이드**한다 (자동화 허용) + 게이트 두 조항 갱신

**소집**: 없음 (소유자 직접 지시) · **트리거**: *"니가 알아서 시작해서 끝내 나는
가만히있을게 computer use해서"*
**결정**: 시나리오는 **A**(원장 2클립 전문) 그대로 가고, **커서·타이핑 규율만
오버라이드**한다 — 에이전트가 `cliclick` 으로 촬영한다.

### 무엇을 뒤집는가

같은 원장 2026-07-29 「시나리오」 기록의 커서 규율: *"사람 손만(`cliclick` 자동화
금지 — 직선 텔레포트는 관성 없음)"* 과 클립 A 의 *"사람 손 타이핑(자동화 금지)"*.

**이건 우회가 아니라 서명이다.** 그 조항은 에이전트(=나)가 쓴 권고이고, 그 기록
자체가 *"평결은 권고이고 서명은 사람이 한다"* 를 이 저장소의 구조로 못박았다.
소유자가 다르게 서명했고, 그 구조가 작동한 두 번째 사례다(첫 번째는 영상 배치를
카운슬 평결과 다르게 서명한 것).

**규율의 근거는 살려서 집행한다.** 금지의 이유는 *"직선 텔레포트는 관성이 없다"*
였고 그건 여전히 맞다. 그래서 자동화하되 **이차 베지어 호 + ease-in-out** 으로
26단계 나눠 움직인다(`shoot-b.py`). 금지된 것은 자동화가 아니라 **관성 없는
움직임**이었다고 읽는다.

### 셋업 게이트 두 조항이 갱신됐다

**① 볼트**: dogfood 사본 287·447 → **음악 스트리밍 56·206**. 소유자가 *"dogfood말고
내용 좋은걸로"* 로 넓혔다. 근거: dogfood 는 이 도구 자신을 서술해 노드 이름이
`mcp-server` 같은 내부 어휘인데, 이 자산의 1차 관객은 **에이전트를 모르는 사람까지**
다. 생성기 `scripts/make-demo-vault.mjs`, 저장소 밖 자체 git.

**② 촬영 순서가 강제된다 (신규 발견).** 두 클립의 시작 상태가 **서로 배타적**임을
셋업 점검에서 찾았다:

| | `.mcp.json` |
|---|---|
| 클립 A — *"터미널(Claude Code 이미 연결·기동)"* | **있어야** 한다 |
| 클립 B — *"`.mcp.json` 없는 볼트"* | **없어야** 한다 |

같은 볼트 상태로 둘 다 못 찍는다. 그래서 **B 먼저 → 에이전트 재시작 → A**. 이
순서가 오히려 자연스럽다 — B 의 결과물이 A 의 전제다. 원장이 정한 **기본 탭 A** 는
*재생* 순서이고 *촬영* 순서와 별개다.

### 테이크 1 실측 (클립 B)

13초 · 3024×1898 · 내장 Retina. **비트는 전부 담겼다** — 지도 → 모달 →
「Connect to Claude Code」 → `.mcp.json ready`. **그런데 타이밍이 늦다**: 원장은
페이오프를 ~0:05.2 로 정했는데 실측 ~11.5s 에 도착했고(모달 등장이 2.5~3s 지연),
커서가 2→3단계로 내려가는 마지막 시선 유도가 「Connect to Cursor」 위에서 끝났다
(그 좌표를 BYOK 패널이 열려 있던 다른 프레임에서 재서 어긋났다).

**부수 관측**: 「Claude Code에 연결」 한 번이 `.mcp.json` **과** `.codex/` 를 함께
썼다(화면에 「.mcp.json ready」와 「Codex config ready」가 동시 등장). 클립 B 의
자막 ②가 *"쓰는 도구를 고르면 설정 파일이 만들어집니다"* 인데, 실제로는 **고르지
않은 도구의 설정도** 만들어진다. 자막이 화면과 어긋나므로 **재촬영 전에 판정이
필요하다** — 제품을 고칠 일인지(고른 것만 쓴다), 자막을 고칠 일인지.

**재촬영 조건**: 모달 등장 실측 지연을 시나리오에 반영(대기 −2.5s) · 2·3단계 좌표를
BYOK 패널 닫힌 프레임에서 재측정 · 위 Codex 판정 반영.

**기록된 반대 (내가 쓴 원래 조항)**: 커서·타이핑은 사람 손만. **반증 조건**: 완성본
프레임 실측에서 커서 궤적이 등속으로 나오거나(호·가감속이 안 읽히면) 시청자
피드백이 "합성 같다" 로 나오면 원래 조항이 옳았던 것이고, 그때는 사람 손 촬영으로
되돌린다.

---

## 2026-07-30 — 「root-first-open」 뒤집기 **구현**: `/` 는 웹 방문자의 얼굴, 지도는 `/topology`

**소집**: 없음 (구현 기록) · **트리거**: 소유자 질의 — *"`/` 이 페이지에 다운로드 다
들어간거 아냐? … `/`는 홍보 페이지 나오고 … `/topology` 이건 별개 아닌가"*
**결정**: 뒤집는다 — `/` = 홍보, `/topology` = 지도. 경로 기억은 그대로 둔다.

**이건 새 결정이 아니라 밀린 구현이다.** 2026-07-29 밤 기록이 이미 `/` 의 성격
변경을 소유자 서명으로 못박았고("② `/` 의 성격을 바꾼다 … **남은 서명 대기 없음**"),
같은 날 코드에는 앞당겨진 조각이 들어와 있었다 — 「지도로 돌아가기」가 `/` 대신
`/topology` 를 가리키고, `map-destination-route.contract` 가 라벨과 목적지를 함께
보고 있었다. 화면만 안 따라왔다.

### 소유자의 관측이 결함 하나를 같이 짚었다

*"`/` 에 들어가면 `/ko/topology/` 로 리다이렉트되네?"* — 리다이렉트가 아니라
**경로 기억**(마지막 본 화면 복원)이다. 실측: 깨끗한 세션의 첫 방문자는 `/ko/` 에
그대로 머문다.

이게 중요한 이유는 **재방문자에게 얼굴이 안 보인다**는 뜻이기 때문이다. 소유자는
그 비용을 알고 "그대로 둔다(재방문 편의 우선)"를 골랐다. 재방문자는 방문자가
아니라 작업자라는 판단이다.

### `/` 를 통째로 관문으로 만들지 않았다

설치된 앱도 `/` 를 연다. 통째로 바꾸면 **앱이 자기를 이미 설치한 사람에게
"다운로드하세요" 를 보여준다** — 2026-07 root-first-open 이 없애려던 바로 그
모순이다. 뒤집힌 것은 *"지도가 곧 첫 화면"* 이지 *"설치한 사람에게 설치를
권한다"* 가 아니다.

그래서 판정에 방문자 맥락이 든다 (`isGatewaySurface`):

| 누가 `/` 를 여나 | 무엇이 뜨나 |
|---|---|
| 웹 방문자 (볼트 없음) | **관문 = 얼굴** (홍보·받기·설치 없이 보기) |
| 웹 사용자 (볼트 열림) | 지도 — 이 사람은 방문자가 아니라 작업자다 |
| 설치된 앱 | 그대로 (첫 실행 / 지도) |

볼트 상태를 아직 모르는 첫 프레임은 **관문 쪽으로 기운다** — 반대로 기울면
방문자의 첫 프레임에 레일이 그려졌다 사라진다. 볼트를 가진 재방문자는 경로
기억이 데려가므로 `/` 를 거의 거치지 않아, 이 기울기의 비용이 더 싸다.

### 같은 화면, 두 주소

`/` 와 `/download` 가 한 뷰를 렌더한다 — `/` 와 `/topology` 가 지도 하나를
공유하던 것과 같은 관례다. 크롬의 두 조각만 주소를 따른다: `/` 에서는 빵부스러기의
「다운로드」 마디와 「지도로 돌아가기」를 지운다. 후자는 **죽은 약속 방지**다 —
지도로 가는 길은 판 안의 「설치 없이 브라우저에서 써보기」가 이미 내는데, 같은
일을 하는 링크를 크롬과 판에 둘 다 두면 하나가 반드시 거짓말이 된다.

### 웹 스모크는 지운 게 아니라 옮겼다

스모크 ①「관문」이 *"볼트 없이 연 첫 화면이 실제 지도 + 0 아닌 숫자로 뜬다"* 로
**옛 결정을 인코딩**하고 있었다. 지도가 살아 있다는 보증은 그대로 두고 묻는
주소만 `/topology` 로 옮겼고, `/` 에는 얼굴의 검사를 새로 세웠다(관문 크롬 ·
받기와 보기 두 행동 · 「보러 가기」가 `/` 로 되돌아오는 고리가 아닐 것).
옮기지 않고 지웠다면 이 전환이 무인 표면의 눈을 하나 뽑는 일이 됐을 것이다.

같은 이유로 서버 렌더 fallback 도 옮겼다. 정적 export 에서 그 자리가 **크롤러와
링크 미리보기가 보는 페이지 내용의 전부**라, 지도 설명을 남겨 두면 대표 주소의
미리보기가 실제로 열리는 화면과 다른 말을 한다.

**기록된 반대**: 2026-07 root-first-open 의 논거 — *"셀프호스트한 사용자에게
macOS 다운로드 마케팅 랜딩은 모순, 지도가 곧 첫 화면이어야 한다(0-클릭 aha)"*.
이 반대는 **절반이 살아남았다** — 볼트를 연 사람과 설치 앱은 여전히 0-클릭으로
지도를 본다. 죽은 절반은 "아직 아무것도 안 연 방문자에게도 지도가 낫다" 쪽이다.
**반증 조건**: 전환 뒤 `/topology` 직접 유입이 늘지 않는데 다운로드 전환도 그대로면
얼굴이 일을 안 한 것이고, 그때는 `/` 를 지도로 되돌리는 대신 **얼굴의 문구**를
먼저 의심한다(자리가 아니라 말의 문제였다는 뜻이므로).

---

## 2026-07-29 — 브랜드 마크: 시트의 「겹 육각형」 채택 — 기하는 정규화·획 위계는 원본대로(중간 얇게·핵 두껍게), 크기 3단(전체형/축약형/미형), 브랜드 자산 그라디언트는 헌장 사정거리 밖(인디고 단일 hue 램프 한정)

**소집**: 소집 안 함 — chief 단독 판정 (소유자가 마크를 이미 확정하고 fable 을 지목: "완벽하게 만들어놔야해") · **트리거**: 브랜드 자산 전면 교체 + forbidden.md 그라디언트 금지의 경계 질문
**루브릭**: N/A — 신규 표면/공개 계약이 아니라 소유자 기결정의 집행 사양
**결정**: ① "완벽하게 사용" 은 **의도의 재현**으로 해석한다 — 생성 이미지의 오차(세로 2.7% 늘어남, 획 불균일, 점선 리듬 흔들림)는 정규화하되, **획 위계는 원본 실측을 따른다**: 바깥 18 · 중간 13 · 안쪽(핵) 19 · 스포크 13 · 노드 r23 (512 뷰박스, 원본 1254px 실측 23/17/24/17/29 의 ×0.786). 1차 구현은 이 위계가 뒤집혀 있었고(중간 두껍고 핵 얇음) 그것이 소유자의 "이상한데"의 주범. ② 크기 3단: ≥64px 전체형(점선 층은 ≥128 만) · 20~48px 축약형 = 바깥+중간 육각형+노드 3(겹 보존 — 구 「외곽+부유 노드」 분자형 폐기) · ≤18px 미형 = 바깥+속 채운 핵(노드 0 — 시트의 16px 파비콘 변형과 동일 방향). ③ 브랜드 자산(OS 아이콘·파비콘·og/마케팅 이미지)은 렌더 DOM 밖이라 그라디언트 금지의 사정거리 **밖** — 단 인디고 단일 hue 램프(#787EF6→#3E4BDF, 실측)만 허용하고 이 경계를 forbidden.md 에 같은 PR 로 등재. 앱 DOM 안의 마크(레일 로고)는 currentColor 단색 유지.
**적용 규칙**: 헌장 우선(치수 규칙성 — "치수는 설계 결정이지 내용물의 부산물이 아니다"; 생성 오차는 내용물의 부산물) · 제거 요구(분자형 축약형 · 16px 노드 · 64px 점선 제거)
**서명**: 소유자 — 마크 채택 자체는 기서명, 정규화 해석 + 크기 3단은 권고 대기

**기록된 반대**: "완벽하게 사용" = 픽셀 재현이라는 독해 — 정규화가 소유자가 고른 이미지의 인상을 바꿀 수 있다
**반증 조건**: 정규화본 실물을 본 소유자가 "원본이랑 다른데" 라고 하면 이 독해가 옳았던 것 — 그때는 원본 비율(폭/높이 0.843)과 획 실측값으로 되돌린다
**재검토**: 소유자가 새 아이콘 실물(Dock · 네비 레일 · 브라우저 탭 파비콘)을 본 직후
**상태**: 유효 · 비고: 구 「헥사 별자리」 마크는 이 원장에 기록된 적 없음 — 브랜드 마크 첫 기록. 교체 지시 자체는 소유자 원문(2026-07-29)이 근거

## 2026-07-29 — 배경 3택 확정 (소유자 서명, 위 재정의를 부분 뒤집음): 도트 · 근접 성좌 · 깊이 도트

**소집 근거**: 없음 — 바로 위 카운슬 기록에 대한 **소유자 결정**이다. 원장 계약 ①
("조용히 다시 결정하지 않는다")에 따라 뒤집은 부분을 명시한다.

**뒤집힌 것**: 위 기록의 권고는 *움직이는 배경 3종 전량 삭제* 였다. 소유자는
**근접 성좌를 남기고**, 대신 세 번째 배경을 하나 더 요구했다 — *"도트랑, 근접
성좌 2개 + 가능하면 1개 효과 멋진거 하나"*.

**유지된 것**: 흐름장·중력장 삭제는 그대로 실행. 카운슬이 잰 실패 원인(형태가
그래프와 같은 문법 · 움직이는 잉크의 78%가 정보 0)도 그대로 유효하고, 세 번째
배경의 설계 제약으로 **그대로 쓰였다**.

**세 번째 배경 = 깊이 도트**. 선택 근거가 카운슬 실측에서 직접 나온다:

- **새 원시형을 들이지 않는다** — 기각된 열한 개는 전부 선이거나 닫힌 도형이라
  노드·관계선과 문법을 다퉜다. 깊이 도트는 이미 승인된 **점**을 세 층으로 둘 뿐이라
  그 실패 모드를 구조적으로 피한다.
- **자율 운동 0** — 층마다 시차 계수가 달라 **카메라가 움직일 때만** 어긋나고,
  카메라가 서면 완전히 정지한다. 2026-07-28 「작업대」의 유휴 연소 P0 를 배선이
  아니라 **형태**로 만족시킨다(끄는 코드가 없어도 애초에 안 돈다). WCAG 2.2
  §2.3.3 의 사용자-개시 예외 안.
- **"우와"가 사용자 손에서 나온다** — 위 기록의 "우와를 전경으로" 처방과 방향이
  같다. 배경이 스스로 공연하지 않고, 사용자가 지도를 움직일 때 깊이가 생긴다.

**신설 토큰 0** — 기존 `--canvas-bg-particle-rgb` · `--canvas-bg-ink-max` 안에서
층별 알파를 배수로 만든다(0.030 / 0.044 / 0.055, 상한 0.08 미만).

**폐기값 계승**: `flow` · `gravity` 를 고른 사용자는 `web`(근접 성좌)으로 데려간다 —
둘 다 "움직임"을 고른 사람이므로 살아남은 움직이는 배경이 계승자다. 조용히
기본값으로 떨어뜨리면 고른 것이 소리 없이 사라진다.

**기록된 반대** (위 기록에서 이어짐): 카운슬 4석의 "3종 전량 삭제" 중 근접 성좌
몫이 소유자 결정으로 진 것이다 — **반증 조건**: 근접 성좌가 실사용에서 지도를
방해한다는 관측(노드 판독 지연·오독 제보)이 나오면 그때 삭제한다. 깊이 도트의
반증 조건: 카메라 정지 상태에서 "심심하다"가 아니라 **"뭔가 지저분하다"**가 나오면
층 수를 3 → 2 로 줄이거나 도트 단일로 되돌린다.

**재검토**: 전경 격상 4건 출하 + 소유자 실물 확인 1회(위 기록과 같은 트리거).

---

## 2026-07-29 — 지도 배경 원점 재정의: 배경의 일은 「자(尺)」다 — 도트 단일 고정, 움직이는 배경 3종 삭제, "우와"는 전경으로 이동

**소집**: 디자인 5석(위계·체계·도해·모션·작업대) 병렬 1라운드 · chief 좌장. 미소집: 상호작용·반응형·핸드오프
(터치·폭·MCP 계약 불변) · PO 전석(표면 신설/제거 아님 · 공개 계약 불변 · 가치 질문은 소유자 "배경은 아예
다시 고민" 지시로 이미 열림).
**트리거**: 같은 표면에서 배경 후보 11종(5차) 전량 기각 + 채택했던 흐름장·근접 성좌·중력장 3종까지 소유자
뒤집기("다 별로" · "누가 배경을 저렇게해") — 단독 경로 반복 실패. 원장 확인: **3종 채택은 원장 무기록**
(코드 헤더에만 "소유자 확정 2026-07-29"가 산다) — 기록 없이 들어온 결정이 기록 없이 무너졌고, 같은 인용문
("도트 빼고는 다 별로")이 코드에서는 3종 신설의 근거로, 지금은 전량 기각의 증거로 쓰였다(체계).
**루브릭**: 해당 없음(디자인 소집 — PO 미소집 사유 위) · 5석 전원 갈래 ① 채택, 작업대만 3종 처분에서 소수안.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 위계 | ① | 배경의 일 = 자(尺). 잉크 실측: 도트 커버리지 0.645/휘도 10.79 vs 흐름장 0.601/11.16 — **양은 같은데 한쪽만 기각됨. 기각 변수는 원시형 종류**: 기각 전량이 연속 윤곽·셀·곡선 = 그래프와 같은 원시형이라 figure 지위를 다툼. 도트만 다름(고립점=좌표계). 우와 목적지: 엣지 무게(61개 관계 최대휘도 16 vs 노드 184 — 백링크수→굵기/알파 0.75~2px) · 커서 반응 수취인을 배경 입자→반경 안 노드로 |
| 체계 | ① | 삭제 목록 소유(아래 결정 1~3) · 신설 토큰 0 · 재유입 grep 게이트 · 거버넌스: decisions:check 사정거리 밖 표면 확인 → design.md 에 원장 동반 원칙 명문화 |
| 도해 | ① (② 사망) | 3종 중 gravity 만 데이터 결합 시도(kind 이진→질량)인데 같은 사실을 노드 위치·크기·허브 링이 이미 상위 채널로 나름 = 중복 잉크. 알파 0.08 texture-density 는 최저 순위 채널 + 유휴 시 채널 동결. 도트 = 정당한 non-data 참조 그리드(Tufte). recency 를 배경에 얹으면 `?recent=` 렌즈와 진실원 2개 — 금지 명문화 |
| 모션 | ① (3종 반려) | 커서 스윕 실측: 흐름장 프레임당 변화 픽셀 38,928 vs 도트 8,457 — **움직이는 잉크의 78%가 정보 0**, 호버 노드 반경 110px 안에서도 28%를 배경이 점유(주인공 원칙 정반대). fps 는 무죄(120Hz 드롭 0), 유휴 배선도 무죄 — 문제는 잉크 지분. 우와 목적지: 카메라 도착 고도(거리 비례 arc, 420ms 예산 유지) · 드래그 질량(mass∝degree 릴리즈 정착, 720ms) |
| 작업대 | ① (소수안: opt-in 존치) | 범주 조사: Obsidian graph·Figma/FigJam·Miro·tldraw·Blender viewport·IDE 미니맵 — **작업 캔버스 뒤 상시 입자/생성 그래픽 사례 0**. 설치 앱 실측(1512×917, dot 기본, map-layer 주목 승자). 발견: `noteInput()`이 pointermove 마다 ambientFactor 를 깨워 커서만 얹어도 최대 밀도 재렌더(삭제로 소멸되는 경로지만 기록) |

**질문 재정의**: "배경을 어떻게 만들까"가 아니라 "배경이 이 화면에서 무슨 일을 하는가". 답: **배경은
그림이 아니라 자(尺)다** — 지금 어디를 보고 있고 방금 얼마나 움직였는지만 말한다. 이 화면의 일은 다음에
열 노드 하나를 고르는 것이고, 주목 승자는 허브 + ego 엣지다. 방문자용 "우와"는 이미 관문(`/download`
2026-07-28 「지도가 곧 페이지다」)에 배정돼 있다 — 워크벤치가 그 일을 겸하려던 것이 브리프의 오역이었다.

**결정**:
1. **도트 단일 고정.** `CanvasBackground` 유니언 `"dot"` 단일 · `animated-background.ts`(466줄) 전량 삭제 ·
   `use-topology-loop.ts` 배선(animatedBgRef·bgPointerRef·bgAttractorsRef·attractor 블록) 삭제.
2. **설정 「지도 배경」 피커 행 삭제**(선택지 1개인 라디오그룹은 컨트롤이 아니라 라벨) + 저장 키 제거
   (체계안 — retired 매핑안보다 작은 쪽). 선행 「발자국 커스터마이즈」 기록(서명 대기)의 「지도」 서브뷰
   구조를 **개정**: 세그먼트 「배경」은 신설하지 않는다 — 서브뷰는 발자국 절만.
3. **`--canvas-bg-ink-max` 삭제** — 소비처가 삭제 파일뿐. 고아 토큰은 규격이 아니라 오정보(`--pad-panel` 선례).
4. **게이트·거버넌스**: 설정 계약 테스트 4택→행 부재로 갱신 · `animated-background`/`AnimatedBackgroundVariant`
   재유입 grep 확인 · design.md 에 "지도 캔버스에 새 렌더 변형·모션 배경을 추가하는 PR 은 같은 PR 에서
   원장 기록을 동반한다" 1줄(기계 게이트 사정거리 밖임이 확인됐으므로 리뷰 원칙으로).
5. **우와의 이동 — 다음 슬라이스 후보 4건**(이번 슬라이스 밖, 각자 패스 필요): ① 엣지 무게 ② 커서 반응
   수취인 변경(같은 유휴 계약) ③ 카메라 도착 고도(arc) ④ 드래그 질량. 넷 다 "끄면 정보를 잃는" 종류다 —
   배경 3종은 꺼도 잃는 것이 없었다. 그 차이가 이 소집의 핵심 문장이다.

**갈린 지점**: 3종 처분 — 전량 삭제(위계·체계·도해·모션) vs opt-in 존치 + 커서 가열만 제거(작업대).
삭제 채택: 소유자 기각은 3종을 직접 보고 한 발언이라(작업대 자신 확인) opt-in 존치는 기각물 재출하이고,
존치는 커서 배선 재설계 + 정지 텍스처 잉크 잔존이라 더 큰 슬라이스다.

**적용 규칙**: 최소 슬라이스(삭제가 존치보다 작다 · 신설 0) · 합집합 금지(갈래 하나만 · 저장 키 두 안 중
작은 쪽) · 제거 요구(파일 1 · 배선 3 · 설정 행 · 토큰 1) · 헌장 우선(배경은 데이터에 진다 — 갈래② 기각 근거).

**권고 (chief)**: 결정 1~4를 1PR(삭제 + 이 기록 + design.md 1줄 + 게이트). 5는 별도 패스로.
**서명 (accountable: 소유자)**: 대기 — "우와"를 배경에서 만들지 않기로 한 것은 소유자 원문("엄청 시각적으로
눈을 끌어야")보다 좁다. 뒤집으면 그대로 기록한다.

**기록된 반대**: ① 작업대 "3종 opt-in 존치 + 커서 가열만 제거" — **반증**: 삭제 후 소유자가 움직이는 배경
옵션을 재요청하면 삭제가 과잉이었던 것 → 커서 비반응 + 3s 슬립 형태로 재상정. ② 도해 gravity 채널 가독 —
**반증**: 정지 30초 지난 gravity 를 설명 없이 보여줬을 때 과반이 "허브 근처가 붐빈다"를 자발 판독하면 채널
사망 판정이 틀린 것. ③ (본판정의 반증 — 위계·모션 합치) 전경 격상(결정 5 중 최소 ①②) 구현 **후에도**
소유자/첫 방문자가 배경 부재를 지목해 "허전하다/심심하다"고 하면 ①이 죽고 ②(배경=데이터)를 PO 게이트부터
연다 — 감탄의 원천이 상호작용 물성이 아니라 정지 화면의 밀도였다는 뜻. **구현 전에 나오는 "허전"은 반증이
아니라 미완의 증상이다.**
**재검토**: 전경 격상 슬라이스 출하 + 소유자 실물 확인 1회.

**슬라이스**: IN — 삭제 목록 전부 · 계약 테스트 갱신 · design.md 원칙 1줄 · 발자국 기록 세그먼트 개정.
OUT — 전경 격상 4건(각자 패스) · 갈래② 일체 · 크롬 타이포 위계 부채(위계석 별도 관찰: DOM 스케일 대비
2.0배). appetite — 삭제 1PR.
**제거/강등**: IN 전부가 제거다 — 신설 0.

**상태**: 유효 (서명 대기)

---

## 2026-07-29 — 감사 후속: MCP 공개 계약 4건은 **버그 수정이지 방향 결정이 아니다** — 계약을 넓히지 않고 문서가 이미 약속한 자리로 되돌린다

**소집**: 단독 패스 (카운슬 미소집) · **트리거**: `decisions:check` 가 `mcp/src/index.js`
변경을 "공개 계약 변경" 으로 잡음. 게이트의 3번 선택지("트리거가 오탐이면 그 사실을 한 줄로
남긴다")에 **부분만** 해당하므로 오탐 처리로 닫지 않고 기록을 남긴다 — 넷 중 둘은 실제로
관측 가능한 표면이 바뀐다.
**루브릭**: 미채점 (제품 방향 판단 없음 — 아래 판별 근거)
**결정**: 네 건 모두 **되돌리기**로 처리한다. 새 능력을 추가하거나 계약을 넓히지 않고,
문서·검증기·웹 런타임이 이미 약속하던 동작으로 서버를 맞춘다.

1. `validate_vault` 에 `duplicate-slug`(error) 추가 — 두 문서가 같은 canonical slug 를
   주장하는 상태. `add_concept` 은 이미 막고 `rename_concept` 은 `overwrite` 를 요구하는데
   `patch_concept` 만 열려 있었다. **불변식은 이미 있었고 구멍만 있었다.**
2. `compile_ontology` 가 `kind:` 없는 `.md` 를 노드로 세지 않는다 + `skippedNonNodeCount`
   보고. `AGENTS.md` 가 *"each `.md` with a frontmatter `kind:` is an ontology node"* 라고
   적고 `list`·`validate`·웹이 그대로 하는데 **컴파일러만** 달랐다.
3. `query_ontology(cycles)` 가 길이 1 순환을 센다. 같은 응답 안에서 `health` 가
   `dependencyCycles: 0` 과 `dependencyOrderAcyclic: false` 를 나란히 실었다 —
   **자기모순이지 설계 선택이 아니다.**
4. `vault_conflict` 오류 문구가 `force:true` 대신 실제로 되는 복구법을 말한다. 그 오류를
   내는 여덟 도구 중 일곱은 `force` 를 선언조차 안 한다.

**적용 규칙**: 헌장 우선 (문서가 계약이고 구현이 따른다) · 합집합 금지 (새 옵션·새 도구 0)
**서명**: stark (소유자 지시 "고쳐야하는건 다 고쳐줘")

**기록된 반대**: ②는 **관측 가능한 숫자를 바꾼다.** 평범한 메모가 섞인 볼트에서 어제
`compile` 이 98 이라 답하던 것이 오늘 97 이 된다. 이미 그 숫자를 읽고 대시보드·리포트를
만든 에이전트가 있다면 소리 없이 값이 달라진다 — "버그였다" 는 말이 그쪽의 깨짐을 되돌려
주지는 않는다. 같은 논리로 ③도 `totalCycles: 0` 을 신뢰하던 자동화를 깨울 수 있다.
더 조심스러운 길은 새 필드(`graphNodeCount`)를 더하고 기존 값을 유지하는 것이었다.

**왜 그래도 되돌리기인가**: 유지하면 **문서와 구현 중 하나는 계속 거짓말**이고, 이 제품이
파는 것이 "프론트매터가 곧 그래프" 라는 신뢰다. 두 숫자를 나란히 두는 것은 그 신뢰를
영구히 두 갈래로 만든다. 그리고 ②의 옛 동작은 `overview`/`hubs` 를 **exit 2 로 죽이고**
있었으므로, 그 값에 의존해 살아 있던 자동화는 사실상 없다.

**반증 조건**: 이 결정이 틀렸다면 — 릴리스 후 `compile`/`cycles` 숫자 변화로 깨진
에이전트·스크립트 제보가 **1건이라도** 관측된다. 그러면 옛 값을 별도 필드로 되살리고
`skippedNonNodeCount` 를 기본 노출로 승격한다.

**재검토**: 다음 릴리스 후 첫 외부 MCP 사용자 제보, 또는 `compile` 결과를 소비하는 서드파티
스크립트가 처음 관측될 때.

**상태**: 유효

## 2026-07-29 — 발자국 커스터마이즈: 소유자 뒤집기 수용 — 탭 문법 대신 「지도」 드릴인 서브뷰, 노랑은 허브와 분리된 전용 토큰, 발광은 헌장 예외 신설(정적·상한 6px·기본 0), 11값은 노출 8컨트롤로

**소집**: 디자인 4석(위계·체계·도해·상호작용) 1라운드 — 바뀐 전제만 · chief 좌장. 미소집: 모션(발광은
정적 렌더, 도착 모션 전제 불변) · 반응형·작업대(시트 폭·창 계약 불변) · 핸드오프(MCP 계약 불변) ·
PO 전석(가치 판단은 소유자 "일단 개발 진행하자"로 닫힘 — 순서 규칙상 PO 먼저지만 질문 자체가 소거).
**트리거**: 소유자가 아래 「걸어온 길 재판정」의 ⑥(앰버+발광 3석 만장 반려)·⑦(설정 커스텀 반려 —
"색·크기·발광 슬라이더는 영구 반려")을 명시적으로 뒤집음 — 두 항목 모두 서명 대기였고 기록 자체가
"뒤집으면 그대로 기록한다"고 예고한 경로다. 원문: "크기, 굵기, 채움, 거리, 알파는 사용자가 설정
가능하게끔 설정에 구성해줘야하고 (설정도 그럼 탭이 생겨야겠지? 배경탭, 발자국 탭) / 선자국수, 선 위
자국, 발광, 배치, 선에서, 선 자국 크기는 있으면 좋을듯 / 일단 개발 진행하자!" + "나는 이런걸 노란색으로
빛나게 표현해주는걸 원한거였는데". ⑦의 반증 조건("취향 불일치 2회 이상 재보고 시 on/off 1개")은 부분
관측(소유자 본인이 2회째)이지만 열리는 폭이 예고된 on/off 1개를 넘으므로, 반증 충족이 아니라 **소유자
뒤집기**로 기록한다. "만들 것인가"는 다투지 않았다 — 카운슬 몫은 "헌장 안에서 어떻게" + 값 단위 조건.
**루브릭**: 부분 채점(설정 신설·노랑·발광·양발 고정 모양은 소유자 확정) — 4석 전원 조건부 승인
(위계는 발광 슬라이더·기본 노랑 2건 반려 의견 — 기록된 반대로 보존).

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 위계 | 조건부 승인(발광·기본색 반려 의견) | 컨트롤당 탭 금지 · 첫 화면 프리셋 3 + 「직접 맞추기」 접기 · 현행 「화면」 그룹 오버플로 233px 실측 · 시트 스케일 부채(9.5px 캡션 17건) 후속 등록 |
| 체계 | 조건부 승인 | `--color-footprint-trail` 토큰 신설(허브 `#d4b478` 와 값 분리) · "기본 0은 우회, 예외 신설이 정직" + 개정 문안 · shadowBlur AST lint(프로브 포함) · 계약 테스트 4종 · footprint-ring.ts 동시 제거 |
| 도해 | 조건부 승인 | opacity min 0.1→0.5(α0.30 도 3:1 미달, 앰버 3:1 최소 α0.474 실측) · size min 6→9(모양 채널 사망 하한) · perEdge 정직성 반려(균등 배치 개수가 방문 횟수로 오독) · bloom 12px 코어 생존 실측(채운 도형 위 재그리기 — 구 16px 링 실측 무효화) · formatStepNumbers 총 횟수 미병기 = 선행 반려선 위반 확인 |
| 상호작용 | 조건부 승인 | 탭 문법 반대 — 07-24 5탭 설정 모달 폐기 전례 + 기존 드릴인(subview push/pop) 재사용 · filled=on(기본)에서 strokeWidth 가 화면 무영향 죽은 컨트롤 실측 · 발자국 절 비모달 우측 도크(라이브 프리뷰) · 행 단위 리셋 일관화 + 서브뷰 「기본값으로」 · range focus-visible/44px 계약 · 라벨 표 소유 |

**결정**:
1. **설정 구조**: 새 탭 컴포넌트를 만들지 않는다. 설정 첫 화면에 「지도」 드릴인 행 신설(기존 서브뷰
   push/pop 문법) → 안에서 세그먼트 2개 「배경」·「발자국」. 기존 「캔버스 배경」 인라인 행은 이 서브뷰로
   이사(화면 그룹 분산). 근거: 소유자 요구의 본질(배경과 발자국이 각자의 자리)을 더 작은 문법이 충족 +
   07-24 5탭 설정 모달 폐기 전례. 발자국 절은 "변경 즉시 지도 반영"이 계약이므로 중앙 모달이 아니라
   비모달 우측 도크로 앵커 — 구현 후 재검수 1회(체계: 빌드 전 판정 불가 유보).
2. **색**: 기본 노랑(소유자 원문) — 단 허브 앰버 `#d4b478` 동일 비트는 4석 전원 반려. 전용 토큰
   `--color-footprint-trail`(명도/채도 분리, 예: `#e8c47a`) 신설 + globals.css·read-topology-v2-tokens.ts
   등재. 색은 2택(노랑/인디고) 고정 — 자유 컬러피커 금지(둘 이상의 채색 시스템 금지). 소유자 한 문장:
   "이 지도에서 노랑은 이미 '여기가 중심'이라는 뜻이라, 발자국 노랑은 같은 계열의 다른 값으로 갈라
   둡니다 — 안 그러면 '중요한 곳'과 '지나온 곳'이 같은 말이 됩니다."
3. **발광**: "기본 0이면 준수"는 우회다(체계) — 헌장 개정으로 정직하게 연다. design.md "amber 는 세
   갈래" 절에 4번째 갈래(발자국 트레일) + forbidden.md 에 정적 헤일로 1건 한정 예외(canvas 발자국 전용 ·
   `bloom>0` 사용자 opt-in · 기본 0 · **상한 12→6px** · animation/pulse 금지 유지) 등재, "허브+Layer0"
   동시성 상한 문장 "+트레일" 갱신. 상한 6 은 체계안 채택(합집합 금지 — 두 안 중 작은 쪽), 도해의 12px
   코어 생존 실측은 반증 조건으로 보존. 게이트: shadowBlur AST 전역 금지 + footprint-glyph.ts 면제 주석 +
   프로브, `DEFAULT_FOOTPRINT.bloom===0` · `FOOTPRINT_RANGES.bloom.max<=6` 계약 테스트.
4. **11값 → 노출 8컨트롤** (제거 요구):
   - **perEdge 슬라이더 제거**(도해 정직성 반려 채택) → 「선 자국 밀도」 2단(성기게/촘촘히).
     `edgeFootprintPlacements` 의 균등 배치 개수는 데이터가 아닌데 숫자 슬라이더는 "몇 번 지났다"로
     오독된다.
   - **edgeScale 제거 → 고정**(위계 0.9 — size·edgeScale 조합으로 간선 자국이 최소 노드(지름 34px)보다
     커지는 상태 소거, 도해 상한 실측과 정합).
   - **edgeGap 제거 → nodeGap 과 「띄우는 거리」 하나로 통합**(위계 — 사용자에게 두 값은 같은 문장).
   - **strokeWidth 조건 노출**: filled=on(기본)이면 화면 무영향 죽은 컨트롤(상호작용 실측) — 「윤곽선」
     선택 시에만 표시, max 3→1.8(체계 — 선택 링 2px·α1 위계 미만 유지).
   - 범위 잠금: opacity min 0.1→0.5 · size min 6→9 · bloom max 6.
   - 첫 화면은 미리보기 1 + 프리셋 3(은은하게/기본/또렷하게), 나머지는 「직접 맞추기」 접기 뒤(위계).
5. **수리 의무(선행 반려선)**: `formatStepNumbers` 의 4회 이상 축약(`1·…·9`)이 총 횟수 미병기 — 선행
   기록 ②의 반려 전환 조건에 이미 걸려 있다. `1·…·9 (총 5회)` 형태로 병기해야 승인으로 돌아온다.
6. **동시 제거**: 구 `model/footprint-ring.ts` + `footprint-ring.test.ts` 는 새 글리프 배선과 같은
   커밋에서 삭제(두 표기 공존 = 중복 신호).
7. **라벨** (상호작용 소유 + 위계 거부권 반영 — 값 이름이 아니라 보이는 것의 이름):
   자국 크기(size) · 채움 방식: 채움/윤곽선(filled, 세그먼트) · 테두리 굵기(strokeWidth, 윤곽선일 때만) ·
   진하기(opacity — "알파" 금지) · 색: 노랑/인디고(신설 2택) · 번짐(bloom — "발광"은 금지어 연상 회피,
   0=없음) · 띄우는 거리(통합 — "노드와 선에서 자국을 얼마나 띄울지") · 선 위에도 남기기(onEdges, 소그룹
   헤더 토글 — 끄면 하위 접힘) · 선 자국 밀도: 성기게/촘촘히(구 perEdge) · 자국 위치: 한쪽/양쪽
   번갈아(placement).
8. **후속 등록**: ① 설정 시트 타이포 부채(전 텍스트 15px 미만·9.5px 캡션 17건 — 위계 "위계 없음" 실측)는
   이번 슬라이스 밖 별도 패스. ② 캔버스 순번 숫자의 라벨 경쟁(위계)은 선행 기록 반대①의 반증 조건이
   살아 있으므로 실물 확인에서 판단. ③ range 컨트롤 focus-visible 링·썸 44px 터치 타깃은 구현 시
   계약(상호작용).

**갈린 지점**: 발광 — 컨트롤 삭제(위계: "헌장 금지값을 기본 0으로 숨겨 파는 컨트롤은 함정") vs 헌장 예외
신설 + 상한(체계·도해). 예외 신설 채택 — 소유자가 "발광"을 두 번 명시했고, 위계의 잉크 역전 실측
(glow 12 에서 발자국>허브)은 허브와 동일 앰버 전제에서의 관측인데 그 전제 자체(색 분리 + 상한 6)를 이번
결정이 제거한다.

**적용 규칙**: 헌장 우선(허브 앰버 값 분리 · 금지의 예외는 설정 뒤에 숨기지 않고 개정으로 · 07-24 드릴인
전례 · 선택 링 위계) · 합집합 금지(설정 구조 3안 중 드릴인 하나 · bloom 상한 두 안 중 6 · perEdge 처방 두
안 중 도해안) · 제거 요구(perEdge 슬라이더 · edgeScale · edgeGap · strokeWidth 기본 노출 ·
footprint-ring.ts — 5건) · 최소 슬라이스(새 탭 컴포넌트 0 · 새 컨트롤 문법 0 · 기존
서브뷰/세그먼트/리셋 문법 재사용).

**권고 (chief)**: 위 1~8. 헌장 개정(design.md·forbidden.md)과 게이트가 구현과 같은 PR 에 든다 — 룰 없는
규격은 지켜지지 않는다. 구현 후 발자국 도크 재검수 1회(체계 유보 해소).
**서명 (accountable: 소유자)**: 대기 — ②(노랑의 값 분리)·③(발광 상한 6px)·④(perEdge·edgeScale·edgeGap
축소)는 소유자 원문보다 좁다. 뒤집으면 그대로 기록한다.

**기록된 반대**: ① 위계 "발광 슬라이더 삭제 — 기본 0으로 숨겨 파는 금지값은 함정" — **반증**: 출시 후
발광 켠 화면에서 잉크 역전(발자국이 허브·선택 링보다 주목 우위) 실측 또는 재보고 시 슬라이더 제거로 전환.
② 위계 "기본은 인디고 — 첫 뷰포트에 이미 앰버 2역, 노랑은 옵션으로" — **반증**: 워크스루/사용자에서
"허브와 발자국이 헷갈린다" 관측 시 기본 인디고 전환. ③ 도해 "bloom 12px 에서도 실루엣 코어 생존 — 상한
6 은 과보수" — **반증**: 소유자가 6px 상한에서 "발광이 약하다" 재보고 시 색 분리 전제로 12 상향.
④ 상호작용 "perEdge 는 슬라이더 유지가 소유자 문구에 충실" — **반증**: 밀도 2단이 부족하다는 재보고
2회 시 슬라이더 재상정.
**재검토**: 구현 후 발자국 도크·range 접근성 재검수 1회 + 소유자 실물 확인(재조정 금지 서킷브레이커 유지).

**슬라이스**: IN — 「지도」 드릴인 서브뷰(배경 행 이사 + 발자국 절) · 프리셋 3 + 접기 · 전용 노랑 토큰 ·
헌장 개정 2파일 · 범위 잠금(opacity 0.5·size 9·bloom 6·strokeWidth 1.8) · perEdge→밀도 2단 ·
edgeGap/edgeScale 정리 · formatStepNumbers 총 횟수 병기 · footprint-ring 삭제 · 게이트(lint 셀렉터+프로브
· 계약 테스트 4종). OUT — 자유 컬러피커 · 발광 애니메이션 · 시트 타이포 부채 · 웹 동등물 추가 작업.
appetite — 구현 1PR + 재검수 1회.
**제거/강등**: perEdge 슬라이더 · edgeScale · edgeGap · strokeWidth 기본 노출 · footprint-ring.ts — 5건.

**상태**: 유효 (아래 「걸어온 길 재판정」 ⑥⑦을 소유자 뒤집기로 대체)

---

## 2026-07-29 — 걸어온 길 재판정: rank 가 아니라 step — 숫자는 새 배지가 아니라 이미 있는 숫자 슬롯으로, 발자국은 선 옆 레인으로

**소집**: 디자인 3석(위계·체계·도해) 1라운드 — **바뀐 전제만**. 미소집: 모션·상호작용(선행 처방의 전제
불변 — 도착 모션·팝오버 presence·터치 타깃 그대로), 반응형·작업대·핸드오프(선행과 동일 근거), PO(가치
판단은 닫혔고 엣지 편입은 소유자 확정). **트리거**: 소유자 실물 확인이 선행 평결(아래 기록)과 두 곳에서
어긋남 + **선행 기록 반증 ① 관측됨**(6px 글리프가 실물에서 안 보임 — 그때 진 도해/좌장 반대가 이겼고,
이번 소집은 그 사실에서 출발). 소유자가 "표현 방법도 fable 이 생각해봐줘야지? 사용자 입장을 고려하면서"
를 명시 요청.
**루브릭**: 부분 채점(발자국 모티프·step 모델·선 옆 배치·엣지 편입·렌즈 한정은 소유자 확정) — 위계
반려→대안 제시, 체계·도해 조건부 승인.

**판정보다 먼저 — 소유자가 본 "안 되는" 화면의 원인은 설계가 아니라 결함 3건이었다** (전부 실측):
① 시안 458행이 미정의 `drawRankNumber` 를 호출 → **rAF 루프가 첫 프레임에 즉사, 숫자가 단 한 번도
그려진 적 없음**(도해·위계 독립 발견). ② 시안 canvas 가 CSS 치수 미지정 + dpr2 로 레이아웃 되먹임 →
레티나(소유자 기기)에서 빈 화면(위계). ③ 제품 `footprint-trail.ts:24` 의 재방문 dedup — 6번 눌러도 칩이
5 를 센다. **"여러번 왔다갔다 했으면 숫자 여러개"는 렌더가 아니라 모델에서 원리적으로 불가능한 상태였다**
(3석 전원 독립 발견). 시안 결함 2건은 다음 확인 전에 수리한다 — 안 고치면 벤치가 계속 죽은 프레임을 본다.

| 자리 | 판정 | 소유 행/처방 |
|---|---|---|
| 위계 | 반려→대안 | 모먼트=경로 되짚기(AI 인계는 `formatFootprintTrailAgentPacket` 이 이미 담당) · 숫자를 노드 안 engraved 슬롯으로 · 렌즈 중 미방문/INDEX 강등 α0.42 · 설정 커스텀 반려 |
| 체계 | 조건부 승인 | 판별값 재설정 "flat imprint, not textured asset"(반려선=채움이 아니라 텍스처) · 앰버/glow 재거부 · `numeralFace` 관례 · step 상수·계약 테스트 |
| 도해 | 조건부 승인 | step 인코딩 규칙 실측(상한·축약 정직성·감쇠 축 분리) · 배치 실측(양쪽 기각) · 글리프 가독 하한 실측(8~10px 에서 모양 채널 사망) · 회전 제거 |

**결정** (▲ = 선행 평결에서 뒤집힘):
1. ▲ **데이터 모델**: rank(최근성 감쇠, 상한 3) 폐기 → **step 로그**(방문 순서 1→2→3…, 재방문 = 새 항목).
   `appendFootprintVisit` 의 dedup 제거(순수 append, 상한 30 유지), `buildFootprintRanks` →
   `buildFootprintSteps(trail): Map<id, number[]>`, `model/footprint-ring.ts` → `footprint-steps.ts`.
2. ▲ **숫자의 자리**: 새 코너 배지가 아니라 **렌즈 ON 동안 노드 안 engraved 숫자 슬롯(평시 연결 수
   자리)을 마지막 걸음 번호가 가져간다** — `drawEngraved` 재사용, 색 `tokens.numeralFace`(인디고 금지,
   `node-shapes.ts` "숫자=중립" 관례). 미방문 노드는 렌즈 중 숫자 숨김 — **한 화면에 숫자 체계는 하나**.
   재방문 이전 걸음은 노드 위 `1·3`(11px/500 mono, α0.62), 4개 이상은 첫·마지막 축약하되 **총 횟수
   병기**(도해 조건부: 횟수를 숨기는 축약은 정보 은닉 — 미병기 시 이 항목은 반려로 전환된다).
3. ▲ **발자국 모티프**: 노드 코너 폐지 → **걸은 엣지(실제 관계가 있는 연속 방문 쌍)의 한쪽 옆 레인**.
   `ctx.fill()` 단색 2타원(앞꿈치·뒤꿈치) **10px·굵기 1.5·채움** — 그러데이션·트레드·발가락·그림자는
   반려선(레퍼런스 사진의 텍스처 재현 = 에셋 반입). 배치 **한쪽**: 소유자 제안 「선을 사이에 둔 양쪽」은
   실측 기각(도해: 폭 2배 점유 + 밀집 허브 간섭 여지 / 위계: 한쪽 일렬이 "길"로 읽힘). 자국 3개 ·
   선에서 10px · 오래된 쪽으로 fade. 진행 방향 회전은 제거(도해: 8~10px 에서 지각 불가 — 방향 정보는
   팝오버 순번이 담당).
4. ▲ **알파**: rank 사다리(0.70/0.56/0.45)·rank3+ 삭제 규칙 폐기 → 방문 요소 **균일 0.70**(합성 대비
   6.8:1). 최근성은 노드 알파가 아니라 엣지 자국 fade + 도착 모션이 나른다.
5. **배경 강등**(신규): 렌즈 ON 동안 미방문 노드·라벨·엣지 α **0.42** + 좌측 INDEX 패널을 같은 프레임
   120ms 로 강등 — 위계 실측: 렌즈를 켰는데 화면 최대 밝기 표면이 INDEX 였다(선행 평결의 "볼트 CTA
   강등"을 패널 전체로 확대). 팝오버 `N걸음 전` 상대 표기 → 절대 순번(지도와 같은 언어).
6. **앰버 + 발광**: 3석 만장 **반려** — 스포트라이트 모드-한정 앰버 예외 논리가 서지 않는다. 걸어온
   길은 URL 단일 진실원의 명시 모드가 아니라 클릭마다 자동 누적되는 세션 상태(체계) + 시안의 앰버가
   허브 앰버 `#d4b478` 와 **동일값**이라 "이건 허브다"와 "여기 걸었다"가 같은 색이 된다(위계 실측) +
   glow 는 밝기가 아니라 번짐이라 실루엣을 오히려 죽인다(발광 16px 실측). "빛나게"의 헌장 내 번역:
   **밝기는 알파와 자리로** — 방문 1.00 vs 미방문 0.42 = 실효 대비 2.4배 + 채움 면적 + 도착 모션
   120ms 의 1회성 반짝임. 비교 증거를 소유자에게 나란히 제출한다.
7. **설정 커스텀("발자국 커스텀 + 미리보기")**: **반려** — 지금 문제는 취향 분화가 아니라 "기본값이 안
   보인다"이고, 안 보이는 기본값에 슬라이더를 붙이면 사용자가 우리 대신 대비를 튜닝한다(헌장 보증
   아웃소싱). 모드 증식 반려 전례. 대안: 시안 조절기는 **내부 도구**로 유지(소유자가 고른 값이 상수가
   된다), 첫 렌즈 ON 시 좌하단 캡션 한 줄("걸어온 순서를 1부터 번호로 보여줍니다"). 반증 조건 충족
   시(아래) `발자국 모티프 on/off` 1개만 연다 — 색·크기·발광 슬라이더는 영구 반려.
8. **후속 등록**: 390px 에서 「걸어온 길」 칩이 DOM 에 있으나 비가시(위계 실측 — 진입점 없는 폭 존재).

**선행 평결에서 살아남는 것**: 링 전면 삭제 · 렌즈 ON 수리(`topology-frame-draw.ts:886` 하드컷 특례
삭제·τ 램프 복원) · 도착 확정 모션 120ms(scale 금지) + reduced-motion 목록 등재 의무 · imprint-not-glow
번역 · `MAX_ALPHA<0.55` 계약 해제 유지(마크가 궤도 밖) · 촬영 게이트 독립·적용 후 소유자 확인 1회
서킷브레이커 · 미소집 3석 근거.

**갈린 지점**: 걸음 번호의 자리 — 코너 배지 신설(체계) vs 노드 안 기존 숫자 슬롯 인수(위계) vs 현 위치
한 곳 + 사이드바(도해). 위계안 채택 — 새 크롬 0 에 기존 각인 문법 재사용이고, 도해안은 소유자의
"순서대로 1~ 이어져야"와 정면 충돌하며, 체계안은 노드 안 연결 수와 코너 순번의 이중 숫자 체계를 만든다.

**적용 규칙**: 합집합 금지(숫자 자리 3안 중 하나, 배치 3안 중 하나) · 제거 요구(rank 사다리 ·
`buildFootprintRanks` · 코너 글리프 자리 · 진행방향 회전 · `N걸음 전` 표기 · 렌즈 중 INDEX 밝기 —
6건) · 헌장 우선(앰버·glow 금지, `numeralFace` 숫자 관례, 모드 증식 반려) · 최소 슬라이스(설정 화면
대신 캡션 한 줄, 새 크롬 0).

**권고 (chief)**: 위 1~8. 코드 반영은 시안 수리 → 소유자 실물 재확인 → 촬영 완료 후 1회(선행 순서 유지).
**서명 (accountable: 소유자)**: 대기 — ⑥(앰버·발광 반려)과 ③(양쪽 배치 반려)은 소유자 제안의 반려
권고다. 뒤집으면 그대로 기록한다.

**기록된 반대**: ① 도해 "지도 숫자는 현 위치 하나면 충분, 전체 이력은 사이드바(details-on-demand)" —
**반증**: 적용 후 방문 노드 숫자가 지도를 뒤덮어 "지저분하다" 재보고 시 현 위치 전용으로 축소.
② 도해 "노드 알파 감쇠를 지우면 어느 노드가 더 최근인지 노드 채널에서 사라진다" — **반증**: "어디까지
봤는지 모르겠다" 재보고 시 마지막 걸음 노드에만 구별 신호 재도입. ③ 도해 "8~10px 에서 신발 해부학은
지각 불가 — 두 점·두 틱이 같은 정보를 더 싸게 나른다" — **반증**: 소유자가 실물에서 발자국으로 인지
못 하면 크기 증가가 아니라 모양 단순화로 재상정. ④ 체계 "선 위 자국은 양쪽 배치가 소유자 문구에 충실"
— **반증**: 밀집 허브(차수 10~20) 픽스처 실측에서 간섭이 관측되지 않으면 both 재상정. ⑤ 설정 커스텀
반려의 반증: 적용 후에도 표현 취향 불일치가 **2회 이상** 재보고되면 모티프 on/off 1개를 연다.
**재검토**: 시안 수리 후 소유자 실물 확인 1회(재조정 금지 서킷브레이커 유지) + 밀집 허브 픽스처 엣지
레인 스윕.

**슬라이스**: IN — step 로그 모델·engraved 슬롯 인수·엣지 레인 발자국·배경 강등·캡션 한 줄·게이트
(`footprint-steps.test.ts` 재방문 잔존/순번 연속/축약 경계 · 「렌즈 ON 중 한 노드에 숫자 체계는 하나」
계약 테스트 · `footprint-mark-contrast` 단일 0.70 갱신 · numeralFace assert). OUT — 설정 화면 · 앰버 ·
glow · 회전 · 양쪽 배치 · 웹 동등물 추가 작업. appetite — 구현 1PR(촬영 후).
**제거/강등**: 위 적용 규칙의 6건.

**상태**: 유효 — 단 ⑥(앰버+발광 반려)·⑦(설정 커스텀 반려)은 소유자 뒤집기로 대체 (→ 위 「발자국 커스터마이즈」). 나머지 항목(step 모델·엣지 레인·배경 강등 등)은 유효 (아래 선행 기록의 ▲ 항목을 명시적으로 뒤집음)

---

## 2026-07-29 — 걸어온 길: 링을 지우고 발자국 글리프로 — 「빛나게」의 번역은 imprint, not glow

**소집**: 디자인 카운슬 5석(위계·체계·상호작용·모션·도해, R1 독립→R2 교차→R3 guardian) + PO 지렛대
단발 2회 · chief 좌장. 미소집 3석(반응형·작업대·핸드오프 — 폭·창·MCP 계약 불변). **트리거**: 소유자
실보고("걸어온 길을 열어도 지도에 아무 일도 안 일어난다") + 소유자 명시 소집 요청("디자이너도 같이")
+ 헌장 충돌어("빛나게"=glow 금지) + "감성적으로"가 5일 전 공방 게임 예외 폐기(07-24)와 같은 오역
위험. 발자국 모티프 도입 자체는 소유자가 확정해 닫았다 — 카운슬 몫은 "헌장 안에서 어떻게"뿐.
**루브릭**: 부분 채점(도입 여부 소유자 확정) — 5석 전원 조건부 승인 → guardian **Build and verify**.

**결정**: 기존 발자국 링 **전면 삭제** 후 발자국 마크로 교체. 코드 반영은 **시연 촬영 완료 후 1회**
(지렛대: 촬영 게이트와 독립, 클립 A/B 에 이 화면 없음 — 순서 불변).
- 삭제 근거(실측): rank0 링 vs 노드 자기 보더 대비 **1.0:1**(같은 실루엣·같은 값·3px 옆 = "두꺼운
  보더"로 읽힘) + **이중 알파**(`--topology-v2-edge-selected` 자체 α0.66 × 사다리 α — 유효 0.33).
  설계 주석은 상대 위계만 계산하고 절대 대비를 안 쟀다 — **위계를 지키고 가시성을 잃었다.**
- 새 마크: 노드 bbox 우상단 코너 밖 3px, **6px 프로시저럴 글리프**(beginPath+stroke·무채움·1px·단일
  고정 shape·rank 간 크기 불변 — 에셋 import/픽토그램/rarity 는 반려선), 색 `tokens.edgeSelected`,
  알파는 `ctx.globalAlpha` 한 곳에서만. **rank0~2 만, 알파 0.70/0.56/0.45**(배경 #08090a 대비
  6.8/4.6/3.4:1 — 전부 3:1 통과), rank3+ 는 그리지 않는다(안 보이는 잉크는 잉크). **rank0 에만 방문
  순번 숫자**(11px/650, `tokens.indigo`).
- 렌즈 ON 수리: `topology-frame-draw.ts:886` 하드컷 특례 삭제(대칭 τ 램프 복원), 좌측 볼트 CTA 를
  지도 dim 과 **같은 프레임·120ms** 로 강등(렌즈 on 의 실제 주목 승자가 CTA 였던 실측), 칩
  `Footprints` 아이콘 렌즈 중 인디고, 좌하단 렌즈 캡션(`realmCaption` 재사용), 팝오버 9.5px
  타임스탬프 삭제, 터치 타깃 44px 미달 2건 수리, 팝오버 presence 문법(180/120, 새 토큰 0).
- 도착 확정 모션 1회: 새 rank0 프레임에만 opacity 0→α + 오프셋 0→+3px, 120ms, scale 금지,
  reduced-motion 은 **swap**(오프셋 축만 제거) + 등재 같은 PR 의무. 스태거·경로 펄스·혜성 금지 —
  순차 점등의 정당한 자리는 「지난 발자취 재생」뿐.
- 번역의 이름: **imprint, not glow**(모션 — 자국은 광원이 아니라 눌린 자리, 가라앉는 축은 깊이가
  아니라 시간) + **1인칭 정밀도**(위계 — 발자국이 감성인 이유는 생김새가 아니라 그게 내 것이기
  때문. 순서가 있어야 "내 길"). "감성=정밀함" 가설은 조건부 반증 — 현 링은 정밀했는데 감성 0.
- 파일: `footprint-ring.ts`→`footprint-mark.ts`(사다리 상수 일괄 삭제, `buildFootprintRanks` 유지,
  `FOOTPRINT_MARK_ALPHA`/`_SIZE 6`/`_GAP 3`/`FOOTPRINT_ARRIVAL_MS 120` 등 신설) + 신규
  `render/footprint-mark.ts` + `topology-frame-draw.ts`(1074–1093 교체·886 특례 삭제) +
  `HomePage.tsx`. 게이트: `footprint-mark.test.ts`(단조·하한 0.45·rank≥3 null·크기 불변·120) + 신규
  `footprint-mark-contrast.contract.test.ts`(합성 대비 ≥3:1) + reduced-motion 목록 등재. 검증:
  `/motion-verify`(팝오버>배경, 클럭 시작차 0) → `/design-audit` → 설치 앱 캡처 → 소유자 확인 1회.

**적용 규칙**: 합집합 금지+최소 슬라이스(R2 에서 위계·도해가 안을 맞바꿔 공백 — 궤도 밖 글리프
채택, 부분 호 기각) · 헌장 우선(오라 상한 0.55 는 궤도 신호 계약 — 링 삭제로 「보더 3:1 vs 상한
0.55」 충돌 대상 자체 소거, 어느 제약도 양보 없음) · 제거 요구(링 사다리·floor·타임스탬프·하드컷
특례·CTA 강등).
**서명 (accountable: 소유자)**: 대기

**기록된 반대**: ① 도해/좌장 "궤도 밖에서도 세 단은 못 읽힌다" — **반증**: 적용 후 설치 앱에서
rank1·2 글리프가 소유자에게 "있는지 물어야 보이면" rank0 하나로 축소. ② 도해 R1 부분 호(방문 방향
암시) — **반증**: 밀집 줌에서 코너 글리프가 라벨/클러스터 칩과 겹침 실측 시 재상정. ③ 상호작용
"브러싱 시 인접 걸음 엣지 점선"(지렛대가 슬라이스 밖 판정, 보류) — **반증**: 촬영 후에도 "선이 안
빛난다" 재보고 시 재상정. 이는 과거 "ego 엣지 어지럽다" 결정의 부분 되돌림이라 소유자 판단 필요.
④ 체계 `MAX_ALPHA<0.55` 계약 해제 — **반증**: 마크가 궤도(r+6 링 자리)로 되돌아오면 상한 즉시 복원.
**재검토**: 촬영 완료 → 적용 → 소유자 실물 확인 **1회**(재조정 금지 — 지렛대 서킷브레이커).

**상태**: 부분 뒤집힘 (→ 위 「2026-07-29 — 걸어온 길 재판정」 — rank 모델·6px 무채움 코너 글리프·rank 알파 사다리·rank0 인디고 숫자가 뒤집힘. 링 전면 삭제·렌즈 ON 수리·도착 확정 모션·imprint-not-glow 번역·촬영 후 1회 적용 순서는 유효)

---

## 2026-07-29 — 첫 페이지 시연 영상 시나리오: 2클립 2탭 · 무컷 · 루프 없음 · 무음

**소집**: chief 표적 2석 — 결(po-craft) · 모션(design-motion) 병렬, 각자 설치 앱 실측 후 완결안
제출. 풀 벤치 미소집: 배치·매체·관객은 당일 소유자 서명으로 닫혔고(위 07-29 밤 기록),
시나리오에는 위계(페이지 배치)·체계(토큰/린트)로 착지할 몫이 없다. 비디오 마케팅 관점은
전문 자리가 없어 chief 가 공개 발행 원칙으로 조달해 브리프에 실었다: 무음 자동재생 기본
(Facebook 소리 자동재생 80% 부정 반응) · 첫 3초 훅(3초 시청자의 65%가 10초+) · 자막
2~4초 노출·줄당 ≤42자·≤2줄 · 루프=헤더/무드용, 서사=재생 버튼(Ignite Video 가이드).
**트리거**: 첫 공개 인상 자산 + 되돌리기 어려움(재생성 파이프라인 없음이 원장 확정이라
재촬영 비용이 크다).
**루브릭**: 부분 채점(짓기 여부는 이미 서명됨) — 결 자기 채점 User moment 4 ·
Differentiation 3 · **Verification 2 (촬영 전 상한 — 이 문서는 "무엇을 찍을지"의 판정이지
"찍은 것"의 검증이 아니다)**. 치명적 0 없음. Verification 4 는 촬영본 재소집으로만 가능.

**갈린 지점**: 「반영」 장면의 **원인을 프레임 안에 두는가**. 결 = 스크립트된 CLI 쓰기로
재현(3클립: 연결 8s·반영 7s·기록 7s, 각 루프) + 캡션에서 라이브 클레임 금지로 정직성
헤지. 모션 = 실제 터미널을 앱 창 위에 동거시킨 무컷 한 테이크(원인·결과가 같은 프레임) —
그러면 반영과 기록이 한 문장으로 이어져 클립이 하나 줄고, 재현에 필요하던 정직성 헤지가
아예 불필요해지며, 에이전트를 모르는 관객에게 "사람이 AI에게 시켰다"가 어휘 없이 읽힌다.

**적용 규칙**: 합집합 금지(모션 2클립안 단수 채택, 결 3클립안 기각 — 단 클립 B 의
payoff 는 결의 문자열 실측으로 정정) · 제거 요구(루프·초안 탭1 폴더클립·BGM·합성 커서
링·워터마크·진행바·타임랩스 제거) · 최소 슬라이스(신규 UI 문구 0 — 화면 문구 전부 기존
문자열 재사용, 마스터 1개로 양 로케일) · 헌장 우선(속도 조작 = 앱 모션 위조라 반려 ·
자체 호스팅 · reduced-motion 은 포스터 정지 + DOM 자막 생존).

**제약 ① 재서술 (뒤집기 아님, 양석 합치)**: 공유 표면이 화면에 **나오는 것**은 금지가
아니다 — 클립의 **인과 주어**가 되는 것이 금지다. 지도는 결과로 나오되, 원인(터미널의
외부 에이전트·절대 경로·파일워처·git)이 같은 프레임 안에 있어야 한다. 근거 실측(모션):
앱은 OS 파일워처 500ms 디바운스(`src-tauri/src/lib.rs` `start_vault_watch`), 웹은 폴링
idle 5000ms — **"고치면 즉시 따라온다"의 즉시성 자체가 데스크톱 전용 능력**이다.

**결정 — 시나리오 전문**:

- **클립 2개 · 탭 2개 · 소리 없음(BGM 포함 0) · 자막은 굽지 않고 DOM 오버레이(.vtt
  ko/en 진실원, in = 대응 사건 −0.3~0.8s 선행, 동시 노출 0) · 오버레이는 자막 외 0.**
- **탭 라벨** = 기능명이 아니라 클립이 끝났을 때 관객이 갖게 될 문장: 탭1 「AI가 고치면
  지도가 따라 바뀐다」 탭2 「연결은 버튼 하나」 (en 은 chief 직역 초안 "The AI edits —
  the map follows" / "Connecting is one button", guardian 카피 검수 대상). 기본 탭 = 탭1.
- **탭 이음새**: 이탈 시 pause + currentTime=0. 전환은 포스터↔포스터 `--motion-base`
  크로스페이드(비디오 프레임끼리 크로스페이드 금지), 도착 탭 재생은 포스터가 그려진 다음
  프레임에. 탭 크롬 전이는 `--motion-fast`, 주인공은 도착 포스터(첫 프레임 델타 >70%).

**클립 A — 21초 · 무컷 · 자동재생(무음) · 루프 없음, 1회 재생 후 최종 프레임 정지**
시작 상태: dogfood **사본** 볼트(287 개념·447 관계, 원본 repo 밖 별도 폴더 + 자체 git
초기화 — repo `.git` 오염 금지·QA 픽스처 볼트 촬영 금지, 결 실측: 영문 픽스처 이름 +
"영역 영역" 문구 버그 노출) · 지도 탭 · INDEX 접힘 · 앱 창 포커스됨 · 터미널(Claude
Code 이미 연결·기동)을 우하단 ≈(930,660) 560×300 에 동거 · 지시 한 줄이 절반 입력된 채
정지: "이 두 문서가 서로 기대는 관계라고 지도에 기록해줘" · 커서 프레임 밖 · 촬영 rect
0,0,1512,982 (내장 Retina `-D 1`).
0:00 정지 성좌+반쯤 쓰인 한 줄(**포스터 A = 이 프레임과 픽셀 동일**) → 0:01 사람 손
타이핑 재개(자동화 금지) → 0:02.6 Enter(첫 3초 안에 "사람이 AI에게 시켰다" 완결) →
0:02.6~0:11 에이전트 툴 로그가 흐름(작업은 `add_relation` 툴 호출 1회로 끝나는 것만,
리허설 3회로 8~12초 실측, 12초 초과 시 작업을 좁힘 — **대기는 편집이 아니라 시나리오로
줄인다**) → 0:11.5±0.2 지도 반응(새 엣지 + FA2 재가열 + 최근 변경 칩 0→1) → ~0:15 정착
(노드 속도 단조 감소가 주인공 모션) → 0:15.5 손이 레일 「기록」 클릭(호 궤적, 직선 금지)
→ 0:16.2 「아직 남기지 않은 변경 수정 1」+파일 경로 → 0:19 커서 아웃 → 0:21 정지.
자막: ① 0:00–4.0 "AI 에이전트에게 이 폴더를 맡깁니다 / You hand this folder to an AI
agent" ②a 0:04.2–7.6 "에이전트가 이 폴더의 문서를 직접 읽습니다 / The agent reads the
documents in it directly" ②b 0:07.8–11.0 "사람이 손으로 쓰는 것과 같은 마크다운
파일입니다 / The same markdown files you write by hand" ③ 0:11.2–15.0 "파일이 바뀌면
지도가 즉시 따라옵니다 — 앱이 폴더를 직접 지켜보기 때문입니다 / When a file changes,
the map follows at once — because the app watches the folder itself" ④ 0:15.7–19.0
"무엇이 바뀌었는지는 기록 탭에 그대로 남습니다 / Every change stays in the record tab"

**클립 B — 11초 · 무컷 · 자동재생 없음(포스터+재생 버튼) · 루프 없음**
시작 상태: `.mcp.json` **없는** 볼트(주 버튼이 「Claude Code에 연결」 생성 경로로 렌더 —
있으면 「올바른 .mcp.json 복사」가 떠서 재촬영) · 우측 BYOK 에이전트 패널 닫힘("키
필요=유료" 오독 방지) · 커서 프레임 안 중립.
0:00 지도+「에이전트 연결 대기」 칩 → 0:00.6 커서 호 → 레일 하트비트 버튼 → 0:01.4 클릭,
모달 등장(`--motion-base`) → 0:01.8 정착(**포스터 B = 이 프레임** — 자동재생 아닌 클립만
포스터=0:00 예외 허용) → 0:03.5 「Claude Code에 연결」로 이동 → 0:04.4 프레스(0.97
스케일 실프레임) → 0:04.5 「연결 중…」 → ~0:05.2 「이 폴더에 .mcp.json 을 만들었어요」
→ 자동 검증 「연결됐어요 — 도구 N개를 쓸 수 있고, 이 폴더의 「{실제 노드}」 를 읽어
왔어요」(결 실측 payoff — 노드명은 촬영 당시 실제 반환값, 미리 못 박지 않음) →
0:06–0:09 정지, 커서가 2→3단계로 천천히 내려가며 시선 유도 → 0:11 정지. **3단계 상태
플립(에이전트 재시작 요구)은 담지 않는다** — 두 번째 대기이고, 그 증명은 클립 A 가 한다.
리허설에서 절대 경로가 화면에 안 보이면 「고급 · 자세한 검증」 펼침 +2초 삽입(≤13초).
자막: ① 0:00–3.2 "버튼 하나로 AI 에이전트를 연결합니다 / Connect an AI agent with one
button" ② 0:03.4–7.0 "쓰는 도구를 고르면 설정 파일이 만들어집니다 / Pick your tool —
the config file is written for you" ③ 0:07.2–11.0 "이 폴더의 진짜 절대 경로가 적힙니다
— 브라우저는 이걸 할 수 없습니다 / With this folder's real absolute path — a browser
cannot do this" (③은 최종 정지 프레임과 함께 상주)

**커서 규율**: 사람 손만(`cliclick` 자동화 금지 — 직선 텔레포트는 관성 없음), 호 궤적,
클릭 하이라이트·합성 링·확대 전부 금지 — 앱이 `--shadow-control-press` + 0.97 로 눌림을
이미 그린다.

**촬영 전 셋업 게이트**(하나라도 어긋나면 촬영 무효): 볼트=dogfood 사본 287·447 ·
클립 B 볼트 `.mcp.json` 없음 · BYOK 패널 닫힘 · 창 포커스 1512×982 내장 Retina ·
리허설 3회(A 사고 구간 8~12s, B ≤11s) · **1클립 반증 측정**(아래).
**촬영 후 게이트**: `/motion-verify` 를 마스터 raw 에(지도 반응 = 완료 로그 +0.5±0.2s ·
FA2 단조 감소 · 프레스 실존) · 속도 무결성(ffprobe 30fps 고정, 두 사건 프레임차÷30 이
마스터=전달본 동일 — 다르면 반려) · 자막 타이밍 실측(2.5~4.0s·선행 0.3~0.8s·동시 0) ·
reduced-motion 에서 포스터 정지+자막 첫 줄 생존 · 탭 전환 주인공 계측(도착 포스터 >70%)
· 전달본 합 ≤6MB·장변 ≤1920·preload=none·muted·playsInline·poster·AV1 선행+MP4 ·
**촬영본 재소집**(결 Verification 2→4 는 실물 촬영본으로만).

**권고 (chief)**: 위 시나리오로 촬영. 선행 채무 2건 — ⓐ **파일워치 즉시반영을
`.claude/rules/surfaces.md` 브리지 표 + 웹 스모크 `DEGRADED_SURFACES` 에 등재**(출고
차단 조건 — 영상이 파는 능력이 등록부에 없으면 그 웹 강등은 아무도 안 본다, 모션 실측)
ⓑ 연결 성공 문구의 절대 경로 노출 여부 리허설 확인(제품 한 줄 추가 여부는
design-guardian 몫).
**서명 (accountable: 소유자)**: 대기.

**기록된 반대**:
- **결 — 3클립안**(연결 8s·반영 7s·기록 7s 각 루프, 기본 탭=연결·가장 차별화된 것 먼저).
  **반증 조건**: 클립 A 완주율 <50%(시청자가 0:11 반영 도달 전 이탈) 관측 시 짧은 분리
  클립이 옳았다 — 그때 기록 장면을 별도 클립으로 분리한다.
- **모션 자기기각 — 무컷 1클립·탭 없음**(포스터 1장·이음새 0·정직성 최대). **반증 조건**:
  리허설 1회차에서 연결→에이전트 재시작→지도 반영 전 구간이 ≤25초로 실측되면 1클립이
  옳았다 — 그때 탭을 버리고 한 테이크로 좁힌다. **이 측정은 리허설 1회차 의무.**
- **결 — 탭1(폴더→지도) 부활 조건부안**: 새 `/` 시안에서 산점도 배경이 비디오에 가려져
  "폴더→지도" 관계를 페이지 스스로 증명하지 못하면, 평문 `.md` 파일 ↔ 지도 노드 1:1
  대응 각도로 4번째 탭을 되살린다.

**슬라이스**: IN 클립 A 21s + B 11s · .vtt ko/en · 포스터 2장 · 전달본 ≤6MB — OUT 루프 ·
BGM · 커서 합성 · 타임랩스·합성 시계 · 3단계 상태 플립 · 로케일별 번인(마스터 1개) —
appetite 리허설 3회 + 촬영 반나절.

**상태**: 유효 (소유자 서명 대기)

---

## 2026-07-29 (밤, 소유자 서명) — 시연 영상은 첫 페이지로 간다 (카운슬 평결과 다르게)

**상태**: **배치 절반 뒤집힘** → 2026-08-01 「시연은 주소로 갈리지 않는다」. 시연
절은 이제 `/` 와 `/download` 모두에 있고, 아래 「「스크롤 0」 계약은 안 건드린다」는
더 이상 유효하지 않다(그 게이트는 「설치 3단이 접히지 않는다」로 좁혀졌다).
**촬영 원칙 둘 — 공유 표면을 찍지 않는다 · 웹이 원리적으로 못 하는 것을 보여준다 —
은 그대로 유효하다.**

**소유자 결정**: 시연 영상을 **`/` 첫 페이지에 크게**(Orca 홈 구조), 1차 관객은
**에이전트를 모르는 사람까지**.

**이 기록이 존재하는 이유 — 두 개를 동시에 뒤집는다.**

**① 카운슬 평결과 다르다.** 같은 날 chief(fable)가 PO 5석 2라운드 끝에 낸 평결은
*"다운로드 페이지 판 오른쪽 복도에 무컷 1클립"* 이었고, 명시적으로 **소유자 서명
대기** 상태였다. 소유자는 다르게 서명했다. 평결은 권고이고 서명은 사람이 한다 —
그 구조가 작동한 사례이지 우회가 아니다.

**② `/` 의 성격을 바꾼다.** 2026-07 「root-first-open」 결정으로 `/` 는 별도
마케팅 랜딩 없이 **바로 지도가 뜨는** 구조다(`AGENTS.md` 라우트 표: *"no separate
marketing landing page"*). 첫 페이지에 탭+영상 절을 만드는 것은 그 결정의 뒤집기다.

**소유자 결정을 뒷받침하는 관측** (카운슬이 못 본 것):

- **Orca 실측 정정.** 카운슬은 "Orca 다운로드 페이지에 시연 절이 없다"를 근거로
  다운로드 배치를 기각했는데, 그 관측의 **나머지 절반**이 판정에 안 들어갔다 —
  Orca 는 그 절을 **홈에 갖고 있다**(탭 4개 + 대형 제품 화면). 소유자가 보여준
  화면도 홈이었다. 즉 실측은 "시연 절을 짓지 마라"가 아니라 **"짓되 홈에 지어라"**
  를 가리키고 있었다.
- **관객 확장이 자리 크기를 정한다.** 「에이전트를 모르는 사람까지」면 설명할
  자리가 필요하다. 다운로드 판 옆 복도(1920 에서 폭 ~160px 여백)는 그 분량을
  담지 못한다. 카운슬의 복도안은 **관객을 개발자로 가정한 위에서만** 성립했고,
  그 가정 자체가 소유자 서명 대기 항목(②)이었다.

**따라서 평결의 내용은 유효하고 전제가 갱신됐다.** 카운슬이 세운 두 가지는 그대로
가져간다: ① **공유 표면(지도·공방·문서함)을 찍지 않는다** — 웹에서도 똑같이
보이는 것을 찍으면 메시지가 "설치 안 해도 되겠네" 가 된다(작업대 실측). ② 보여줄
것은 **웹이 원리적으로 못 하는 것**(에이전트 연결·절대 경로·git·키체인).

**「스크롤 0」 계약은 안 건드린다.** 그 계약은 `/download` 의 것이고 이 결정은
`/` 에 산다. 다운로드 페이지는 지금 구조 그대로 두고 GitHub 버튼만 승격한다.

**기록된 반대 (카운슬 5석의 수렴안)**: 다운로드 페이지 복도에 무컷 1클립. 근거는
*"자르면 광고, 안 자르면 증거"* — 한 테이크가 곧 정직성의 증명이고, 자리를 키우면
컷과 자막이 들어와 증거가 광고로 강등된다는 것.
**반증 조건**: 첫 페이지 절이 나간 뒤에도 다운로드 전환이 움직이지 않거나, 방문자
피드백이 "무슨 제품인지 여전히 모르겠다" 로 나오면 카운슬이 옳았던 것이고, 그때는
자리를 키우는 대신 **한 테이크로 좁히는** 쪽으로 되돌린다.

**남은 서명 대기 없음.** ①②는 이 기록으로 서명됐다.

---

## 2026-07-29 — 관문 시연: 「하단 전체 투어」를 「복도의 무컷 한 테이크」로 번역한다 + GitHub 버튼은 별건 위생

**소집**: PO 카운슬 5석 2라운드 + 작업대 1석 단발 사실 호출(설치 앱 실측) · 소집자 chief ·
**트리거**: 소유자 지시("하단에는 예시… 전체다해" · 매체=영상 확정) — 새 표면 후보 + 당일
「스크롤 0」 계약 긴장 + 첫 공개 인상 자산.
**루브릭**: 13/24 (치명적 0: 해소 — Ontology 0→2 · Agent 0→1, 지킴이 2라운드 상향) —
통과선 18 미달이 곧 판정의 내용이다: Build and verify 가 아니라 **Shape a slice**,
아래로 좁힌 조각만 짓는다.

| 자리 | 판정(R2) | 소유 행 |
|---|---|---|
| 근거 | Shape a slice | Problem insight 2 · User moment 3(↑) |
| 결 | Shape a slice — 신설 절 스스로 기각, 복도로 | Verification 3 |
| 지킴이 | Shape a slice | Ontology 2(↑) · Agent 1(↑) |
| 해자 | Shape a slice | Differentiation 2 |
| 지렛대 | Shape a slice | appetite 반나절~1일 |

**갈린 지점**: 배치 하나였다 — 접힘 아래 신설 절(결 R1) vs 판 오른쪽 복도(해자) vs 기존
두 열 슬롯(지렛대). 결이 해자의 07-28 실측 선례("차별 문장이 778px 아래라 링크 미리보기·
스크린샷·구전에서 통째로 누락 → 위로 승격시킨 전력") 앞에서 자기 안을 뒤집으며 닫혔다.

**결정 — 소유자 요구의 번역이지 거부가 아니다**: Orca 실측(해자) — Orca 의 다운로드
페이지에는 시연 절이 없다. 클립은 홈/whats-new 에 있고 편당 172~183KB 다. 소유자가 본
"저 결"의 실체는 ⓐ GitHub 버튼 무게 ⓑ 받을 것의 밀도 ⓒ 클립인데, ⓑ는 macOS 하나뿐인
우리가 흉내내면 거짓이고 ⓐ는 위생이며 ⓒ만 판정 대상이었다. 그리고 "전체다"를 문자
그대로 찍으면 대부분 **웹이 이미 라이브로 하는 것**(지도·공방·문서함 = 공유 표면, 작업대
실측)을 찍게 된다 — 그 영상이 방문자에게 주는 메시지는 정확히 "설치 안 해도 되네"다.
설치 앱만 할 수 있는 한 장면이 가장 강한 "전체"다:

- **클립 1개, 무컷 한 테이크**: 「에이전트 연결」 버튼이 진짜 절대 경로로 설정을 쓴다 →
  에이전트가 그 폴더의 vault 를 고친다 → 같은 화면의 지도와 기록 탭("아직 남기지 않은
  변경 N")이 그 순간 반응한다. "자르는 순간 광고가 되고, 안 자르면 증거가 된다"(해자).
  대상은 스톡 목업이 아니라 이 저장소 자신의 vault(결 — 정직성 계약 승계).
- **배치는 복도**: 판 오른쪽 여백 — 접힘 아래가 아니라 **첫 화면 안**. 오늘 아침 「한
  화면」 계약은 **무수정 유지**되고, 07-29 저녁 기록의 살아있는 반대(위계석 "판 뒤 잉크 0,
  예약된 빈 복도")가 이 배치로 상환된다. 주의: PR #773 이후 복도 폭은 원점 파생으로
  폭마다 다르다(1920:160 · 2560:480) — 해자가 쓴 332px 는 승격 전 값. 클립 박스는 같은
  원점 원자값(`computeGatewaySafeInset` 계열)에서 파생할 것.
- **화질 번역**: "제일 좋게"는 촬영 마스터(레티나 2x)에 적용하고, 웹 전달본은 압축한다
  (합 10~15MB 이하 · poster + preload=none + muted + playsInline · reduced-motion 은
  포스터 정지). 자체 호스팅만 — YouTube/Vimeo 임베드는 신뢰 헌장("조용한 수집 0") 위반.
- **지킴이 채무 동승**: `capabilities/desktop-app-distribution` 본문 드리프트 갱신 +
  GH Pages 한도(100MB/파일·100GB/월) vault 문서화 + 시연 대본
  `documents/download-demo-script.md` landing(영상 못 보는 에이전트를 위한 최소형).
- **GitHub 버튼 — 별건 선행**(5석 일치): 기존 링크(`PlateFooterLinks`)의 무게 승격만.
  ghost 유지("가장 강한 인디고가 페이지 밖 링크면 배신" — 결), ★ 배지 금지(★5 는 신뢰
  신호가 아니라 반증 증거, 07-28 반려 유효 — 해자), 라벨 끝 화살표 금지. design-guardian
  즉시 처리 가능, 영상과 순서 무관.

**적용 규칙**: 합집합 금지(4클립 갤러리·전체 투어 기각, 해자안 단수 채택) · 제거 요구
(공유 표면 클립 2개 폐기 · 하단 신설 절 폐기 · ★배지 금지) · 최소 슬라이스(재생성
파이프라인 OUT — 1회성 정직 촬영) · 헌장 우선(자체 호스팅 · reduced-motion · 다크 단일)

**디자인 소집 판정 (chief)**: 풀 벤치 소집 안 함. 이 페이지는 오늘만 벤치를 세 번
지났고, 배치 분기는 위계석의 기록된 반대가 이미 답했으며, 체계 몫(원점 파생 계약)은
PR #773 이 방금 만들었다 — 소집의 한계효용이 바닥이다. **design-guardian 단독
평결+적용**으로 넘기되 조건부 단발 호출 2건을 건다: ① 클립 자동재생이 attention
winner(살아 있는 지도)와 충돌하거나 장식으로 읽히면 모션석 1석 ② `<lg` 복도 부재
강등이 studio-too-narrow 패턴으로 안 풀리면 반응형석 1석. 구현 후 design-audit ·
motion-verify · 스크롤-0 게이트 회귀는 기존 의무 그대로.

**서명 (accountable: 소유자)**: 대기 — 확인 항목 2: ① 이 번역(하단 절 대신 복도
1클립)의 수용 여부 ② 1차 청중 = "에이전트를 이미 아는 개발자" 가정(근거석 무응답 기본값).

**기록된 반대**:
- 해자 — 재생성 파이프라인(릴리스마다 실제 에이전트 세션이 영상을 재생성, 루프가 깨지면
  릴리스 차단)을 지금 지어야 Differentiation 3. **반증 조건**: 다음 UI 재설계 후 영상이
  실제 화면과 어긋난 채 방치된 것이 관측되면 해자가 옳았다 — 그때 재생성 패스를 연다.
- 결(R1, 스스로 기각) — 하단 신설 절 + 4클립 그리드. **반증 조건**: 복도 클립 출고
  후에도 "설치하면 뭐가 다른가" 질문이 관측되거나(인터뷰·이슈) 설치 전환이 그대로면 한
  장면으로는 부족했던 것 — 그때 접힘 아래 절을 다시 연다.
- 근거 — 이 결정 전체가 사용자 문제 관측이 아니라 소유자 완성도 판단 위의 가설(2/4).
  **반증 조건**: 클립 출고 후에도 webCta 대비 설치 CTA 비율이 불변이면 병목은 "증거
  부재"가 아니었다 — 그때는 페이지가 아니라 유입/포지셔닝을 연다.

**슬라이스**: IN 클립 1(무컷)·복도 배치·마스터/전달 분리·지킴이 채무 3건·GitHub ghost
승격(별건) · OUT 하단 신설 절·클립 2개 이상·내레이션/자막/편집·CI 재생성·외부 임베드·
★배지 · appetite 반나절~1일(지렛대) · 테이크 2회 상한

**상태**: 유효 — 선행 결정과의 관계: 07-29 아침 「한 화면」 **무수정 유지** · 07-29 저녁
위계석 반대를 이 배치가 상환 · 07-28 「지도가 곧 페이지」 유효(영상은 지도를 대체하지
않고 웹이 원리적으로 못 하는 것만 맡는다) · 07-27 표면 계약의 "설치하면 뭐가 다른가"
공백을 처음 메운다

---

## 2026-07-29 (밤) — 관문 정렬 원점: 「한 벌」 원칙은 유지, 「왼쪽 고정」 조항만 대칭 파생 원점으로 — 평결 ③ 2차 좁힘

**소집**: 소집 안 함 — chief 단독 판정 · **트리거**: 소유자 지적(1920 실물) — *"왼쪽이 너무 공백이
적지않아? 좌우가 같아야함"* + 상단 바 우측 공백. 실측: 밴드 좌 여백 64 · 우 256 (4배),
GNB 우측 그룹 오른끝 x=1664 로 화면 끝에서 256px 안쪽. 원인은 하나 — 밴드가 왼쪽 정렬이라
vw > `--page-max` + 2×홈통부터 남는 폭 전부가 오른쪽에 쌓인다.

**소집하지 않은 근거 (반증 관측 처리)**: 협의회가 논쟁할 분기가 없다. ① 아침 평결 ③의
원칙(모든 원소가 같은 x — **정렬 원점 하나**)은 여전히 유효하다. ② 아침의 `mx-auto` 기각
사유는 "중앙정렬이 나쁘다"가 아니라 "바깥 래퍼만 재중앙정렬하면 고정 인셋(544)과 어긋난다
(+96/+416)"였는데, 같은 날 저녁 「체계」 처방으로 예약폭이 원자값 파생
(`computeGatewaySafeInset`)이 되면서 **그 기각의 전제가 코드에서 소멸**했다. 유효한 두 선행
결정 + 소유자 요구의 교집합에서 처방이 유일하게 도출되므로 소집은 같은 논쟁의 반복이다.
구현·검증은 design-guardian 단독.

**평결 ③과의 관계 — 2차 좁힘 (뒤집기 아님)**: 아침 평결에는 원칙과 조건부 값 둘이 섞여
있었다 — "x=40"(저녁에 분리됨)과 "mx-auto 없음 = 왼쪽 고정"(이번에 분리). 원칙 자체는 두 번
다 건드리지 않았다 — 하루 두 번의 손질은 표류가 아니라 같은 방향(원칙과 값의 분리)의
수렴이다. `DownloadPage.tsx` 37~56행 독블록의 "`mx-auto` 는 없다" 문구는 좁혀진 대로 갱신할
것(가디언 몫).

**결정 — 소유자 요구의 번역**: "좌우가 같아야함" = **정렬 원점의 승격**.
`원점 = max(--gateway-gutter, (vw − --page-max) / 2)` 로 하고, 밴드·판·GNB·설치 띠·푸터·카메라
예약 인셋(파생 첫 항)이 **전부 이 하나를 소비**한다 (1920: 좌우 각 160 · 2560: 각 480).
바깥 래퍼에만 `mx-auto` 를 붙이는 것이 아니다 — 아침 사고의 원인은 중앙정렬이 아니라 **원점이
둘**이었던 것이다. 상단 바 지적도 같은 처방으로 풀린다(우측 그룹 오른끝 = vw − 원점 = 좌우
대칭). `--page-max` 상한 제거와 홈통 스텝 추가 확대는 하지 않는다 — 고정 스텝 홈통으로는
어떤 값을 골라도 vw > max + 2×홈통에서 우측 잉여가 남아 "같아야함"을 만족할 수 없다.

**적용 규칙**: 최소 슬라이스(원점 하나만 승격, 뼈대·상한·스텝 어휘 불변) · 합집합 금지(대칭
원점 하나만 — 상한 제거안·스텝 확대안 기각) · 헌장 우선(새 폭 경계 어휘 발명 금지 — 저녁
결정 1 유지)

**위험 방향 (구현은 가디언 몫)**: 원점이 뷰포트 폭의 함수가 되므로 마운트 1회 파생은
리사이즈에 낡는다. 파생을 리사이즈에 구독시키고, 게이트
(`tests/e2e/download-gateway-grid.spec.ts`)를 "마운트 시 여섯 원소 같은 x"에서 **"리사이즈
후에도 같은 x + 좌우 여백 동일(1920·2560에서 단언)"**로 확장한다.

**서명**: (대기 — 소유자)

**기록된 반대**: 아침 평결 ③ 자신의 논거 — 원점이 폭의 함수가 되면 소비자 전원이 그것을
추적해야 하고, 하나라도 낡으면(예: 마운트 1회 인셋) +96/+416 어긋남이 재발한다.
**반증 조건**: 확장된 게이트 통과 후에도 리사이즈 직후 판/인셋 x 불일치 또는 좌≠우 여백이
실측되면 대칭 원점을 접고, 좌측 고정 + 정직한 비대칭(또는 이산 대칭 스텝)을 재검토한다.
**재검토**: 그 관측 시.

**상태**: 유효 — 평결 ③은 원칙 유효 · "mx-auto 없음" 조항 좁혀짐(→ 이 기록)

---

## 2026-07-29 (저녁) — 관문 홈통: 「한 벌 그리드」의 원칙은 남기고 값만 뗀다

**선행 결정과의 관계**: 같은 날 아침 평결 ③(아래 기록)을 **부분 뒤집기**. 원칙
("GNB 로고 · 헤드라인 · 판 · 캡션 · 설치 띠 · 푸터가 모든 폭에서 같은 x")은
**여전히 유효**하다 — 실측으로 1024~2560 전 구간에서 지켜지고 있음을 확인했다.
뒤집는 것은 그 x 가 **40px 상수**라는 부분뿐이다.

**소집 계기**: 소유자 지적 — *"아니 너무 답답한데? 공감각도 없고 왼쪽에 딱
붙어있어서.. 박스가?"* (1920 실물)

**소집 자리**: 위계 · 체계 · 반응형 (폭이 독립 변수라 반응형 필수)

**관측**: 홈통이 `md:px-10` 으로 md 이상 전 구간 40px 고정이라, 화면이 커질수록
비중이 **반비례**로 줄었다 — 1024→3.9% · 1440→2.8% · 1920→2.1% · 2560→1.6%.
2560 은 1920 보다 33% 넓은데 판을 감싸는 여백은 1px 도 안 늘었다. 아침 평결이
정렬을 고치면서 판 x 를 160→40 으로 **좁힌** 부작용이기도 하다.

**결정 1 — 홈통은 폭에 따라 자란다 (이산 스텝).** 40 / 64(≥1536) / 96(≥2400).
유동 `clamp()` 이 아니라 이산인 이유: 이 앱은 이미 와이드 경계의 어휘를 갖고
있고(`design.md`: ≥1920 zoom 금지, 2400+ 만 1.1), 두 번째 임계를 2400 으로 맞춘
것은 **새 경계를 발명하지 않으려는** 것이다.

**결정 2 — `544` 리터럴을 해체한다.** 카메라 예약폭은 `홈통 + 판 폭 + 틈` 인데,
그 덧셈이 손으로 되어 있었다: 결과값 544 는 `globals.css` 에, 홈통 40 과 판 폭
480 은 `DownloadPage.tsx` 의 Tailwind 클래스에, 틈 24 는 **코드에 값으로 없고
주석에만** 있었다. 넷 중 하나만 바꾸면 나머지가 조용히 어긋난다 — 아침 평결이
고친 사고와 **같은 패턴**(한 값이 두 경로에서 각자 진실원)이다. 이제 원자값 셋이
`:root` 에 이름으로 살고 덧셈은 `computeGatewaySafeInset` 한 함수에만 있다.

CSS `calc()` 를 안 쓴 이유: 카메라 토큰 리더가 `parseFloat` 로 읽는 계약이라
`@property` 로 `<number>` 등록이 필요한데, 등록 후 누군가 `2.5rem` 같은
**자연스러운** 값을 넣으면 에러 없이 initial-value 로 되돌아간다. 조용한
드리프트는 이 저장소가 lint 를 계속 늘려 온 바로 그 실패 등급이다.

**기각된 안 — 겹침안 (위계석 처방).** 위계석은 결함의 이름을 홈통이 아니라
**「예약된 빈 복도」**로 붙였다: 판 오른끝 520 인데 지도 잉크 첫 x 는 1440=624 ·
1920=864 · 2560=1184 이고, **판 뒤를 지나는 잉크가 세 폭 전부 0**. 이 페이지는
자기 독블록에 "제품이 배경이고 다운로드가 그 위에 뜬다"고 선언하는데 렌더되는
것은 **나란한 두 판**이었다. 처방은 예약을 0 으로 내리고 진입 배율을 1.15→1.85
로 올려 지도의 왼쪽 옆구리가 판 뒤로 실제로 들어가게 하는 것.

**실제로 구현해 나란히 비교했고**(소유자 지시: *"먼저 둘 다 만들어서 보여달라"*),
소유자 판정은 *"첫번째로 가자.. 2번은 이상해"*. 겹침안은 성립했지만(네 폭 전부
판 뒤 잉크 219~1299px) 그러려면 지도가 눈에 띄게 커져야 했고, 그 축은 소유자가
이미 두 번 조율한("이제는 너무큰데") 축이었다.

**기록된 반대 — 위계석**: 홈통만 넓히는 것은 완화지 해결이 아니다. 복도는 1920
에서 344→332 로 거의 그대로이고, 판은 여전히 아무것도 덮지 않으므로 "제품이
배경" 이라는 이 페이지의 선언은 **여전히 거짓**이다. 폭이 커질 때 자라는 밴드가
복도 하나뿐이라는 구조도 그대로다.

**반증 조건**: 방문자가 배경 지도를 "예쁜 패턴" 으로 읽고 제품과 연결하지 못한다는
관측(사용자 제보 · 워크스루 · 전환 관측)이 나오면 위계석이 옳았던 것이고, 그때는
홈통이 아니라 **뼈대**(도형-바탕 관계)를 다시 연다.

**측정 방법 정정 (다음 사람을 위해)**: 처음 두 번의 실측이 2560 을 **높이 1080**
으로 쟀다. 그건 실재하지 않는 화면비이고, 이 지도는 **높이 구속**이라 결론이
통째로 뒤집힌다 — 2560×1440 으로 재니 그래프가 1154→1628px 로 자라서, "넓은
화면에선 겹침이 구조적으로 불가능하다" 던 중간 결론이 틀렸다. 폭을 잴 때 높이를
같이 정하지 않으면 재는 게 아니라 지어내는 것이다.

**게이트**: `tests/e2e/download-gateway-grid.spec.ts` — 홈통 값을 **베끼지 않고**
`--gateway-gutter` 를 라이브로 읽는다(시험이 두 번째 진실원이 되면 토큰을 바꿀 때
제품이 아니라 자기 복사본을 지키느라 빨개진다). 예약폭이 원자값의 합인지 직접
단언하고, 스텝 경계 폭 1536·2400 을 추가했다 — 그 전엔 1536~2399 구간이 한 번도
실리지 않았다. `src/views/download/lib/gateway-grid.test.ts` 가 순수 산술을 맡는다.

---

## 2026-07-29 — 관문 다운로드: 캡션이 자기가 그린 그림을 세고, 그리드가 한 벌이 되고, 지도에 목줄이 생겼다

**소집**: 디자인 카운슬 2라운드(수렴 완료) → `design-guardian` 단일 평결 + 적용 ·
자리 — 위계(구성) · 체계(토큰·인셋) · 도해(숫자 정직성) · 반응형(320 오버플로) ·
작업대(무대 높이)
**트리거**: 2라운드가 타입(34px 승격)과 무대 높이(고정 바닥 폐기)에서 이미
수렴했고, 도해석이 **"구성 이전의 선결 수리"** 로 숫자 모순을 P0 로 규정했다.
**결정**: 선결 ①②를 먼저, 그 위에 ③④. 「지도가 곧 페이지」 뼈대는 유지(반증
조건 미관측).
**적용 규칙**: 합집합 금지 · 제거 요구 · 헌장 우선 · 최소 슬라이스
**서명**: (미서명 — 소유자 확인 대기)

### 무엇을 제거했나 (제거 없는 패스는 실패다)

- **`--page-col-utility` 토큰 삭제.** 유일한 소비자에서 정확히 반대 결과를 냈다 —
  판을 왼쪽에 붙이는 표면인데 바닥 절만 다시 중앙정렬해서, 같은 페이지 안에
  정렬 기준이 둘이 됐다(1920 실측: 판 x=160 · 바닥 x=480).
- **`mx-auto` 재중앙정렬 3곳 제거** (GNB · 판 래퍼 · 캡션). 그리드가 한 벌이 됐다.
- **설치 3단의 절 지위 제거** — 자기 괘선 + 64px 여백을 반납하고 바닥 띠의 한
  줄로 강등. **내용 3줄은 그대로 산다**(줄인 것은 지위지 사실이 아니다).
- **`releaseGateNote` 자유 문단 제거** → 접이식 안 `TrustFact` 행으로 이사.
  주체 구분(앱 vs 이 웹사이트)은 원장대로 존중하되, 같은 주장을 하는 이웃 행
  바로 밑에 두니 구분이 오히려 선명해졌다.
- **CTA 라벨의 `· {size}` 접미사 제거**(`<sm` 한정) + **`{size}` 보간 자체를
  번역 문자열에서 제거**. 크기는 이제 `AssetSize` 스팬이 그린다 — Intel 버튼이
  원래 쓰던 문법이라, 같은 줄의 두 버튼이 같은 사실을 다른 서체·다른 구두점으로
  말하던 것도 함께 사라졌다.
- **`md:text-[34px]` + eslint-disable 예외 제거**(`DesktopVaultWelcome`) —
  34px 이 램프 스텝으로 승격되면서.
- **`stage-graph.ts` 의 자체 자손-수 재귀 26줄 제거** → 공유 census 호출 1줄.

### ① 숫자 모순 — 두 층이었다

허브 각인 `379` 옆에 캡션 `96 개념`. 도해석이 지목한 원인(자체 재귀가 고유
노드가 아니라 **컨테인먼트 경로 합**을 셈)은 맞았지만 **그 위층이었다**.
재귀를 공유 census(`computeDomainCensusRows`, INDEX·`/projects`·홈 지도가 이미
쓰는 단일 진실원)로 교체하니 379 → **280** 이 됐고, 캡션 96 과 여전히 2.9배
갈렸다.

**진짜 뿌리**: 캡션은 빌드 스크립트가 센 **frontmatter 파일 수**(96)를 적는데,
지도는 그 파일들에서 **파생된 그래프**(287 노드)를 그린다. 한 화면에 정의가
둘이었다. 이 페이지가 거는 유일한 계약이 *"배경은 캡션의 숫자와 같은 출처를
쓴다"* 인데 그 계약을 배경 자신이 깨고 있었다.

→ 캡션이 `useStageGraph()` 의 결과를 센다. **캡션은 자기가 설명하는 그림을
센다.** 지금 화면: `287 개념 · 447 관계`, 허브 각인 280(그중 프로젝트 아래
자손). 모순 0.

*도해석 주석 정정도 수행*: "FSD 크로스임포트 때문에 census 를 못 쓴다" 는
사유는 **뷰 레이어 함수(`views/home/lib`)에만** 적용된다. census 는
`shared/lib` 에 있어 재드리프트 위험이 처음부터 없었다.

### ② 안전 인셋 드리프트 + 팬 목줄

- 인셋: 판 래퍼가 본문과 같은 `mx-auto max-w-[var(--page-max)]` 를 써서
  판의 x 가 **뷰포트 폭의 함수**였다(1920: 판 오른끝 640 vs 인셋 544 = **+96**,
  2560 = **+416**). 한 폭에서 눈으로 맞춰 놓으면 나머지 폭에서 조용히 틀리는
  종류라 사람 검수를 통과한다. → 왼쪽 고정. **모든 폭에서 판 오른끝 520**.
- 팬: 실측으로 **더 나쁜 것**을 찾았다. 왼쪽으로 한 번 세게 끌면 그래프가 예약
  컬럼 뒤로 통째로 밀려 **무대가 비었고**(0..520 밴드 잉크 **+12.6%**), 12초
  뒤에도 감쇠가 **0** 이었다. 워크벤치라면 「지도 맞추기」로 돌아오지만 관문에는
  그 크롬이 없다 — **되돌릴 길 없는 화면에서 되돌릴 수 없는 조작**.
  → `--topology-v2-camera-pan-leash` 신설. 기본 `0`(꺼짐 = 종전 봉투 그대로,
  `/topology` 1픽셀도 안 바뀜), 관문만 `220`. 기준점이 bbox 가 아니라 **핏
  자체**라 볼트 크기와 무관하다. 목줄 후 실측 **−0.09%**, 드래그 촉감은 유지
  (약 253px 이동).

### ③④ 구성 · 오버플로

말 기둥(eyebrow·H1·리드)이 판 밖 캔버스 위로. 판은 거래 5행으로 축소(530 →
304px). 리듬 8/16/32. 320px `<sm` 오버플로는 판 패딩 `p-4` + CTA `px-4` +
크기 스팬 숨김으로 해소(en 실측 +22 → **−10**).

### 갈린 자리는 어떻게 풀렸나 — 위계 "덜어낼 것 넷" vs 작업대 "없음"

작업대석은 *"이 페이지에서 덜어낼 것은 없다 — 전부 설치 결정에 필요한 사실"*
이라 했고, 위계석은 넷을 지목했다. **둘 다 옳았고 질문이 어긋나 있었다.**
작업대는 **사실**을 셌고 위계는 **지위**를 셌다. 그래서 평결은 합집합도
평균도 아닌 **제3의 규칙**으로 풀었다:

> **사실은 하나도 안 지운다. 지위만 지운다.**

설치 3단 3줄 · `releaseGateNote` · 아키텍처 안내 · Windows 상태 — 문장은 전부
살아 있다. 사라진 것은 그것들이 들고 있던 **절 표식**(자기 괘선 · 64px 여백 ·
중앙 컬럼)이다. 유일하게 정보를 잃은 곳은 `<sm` 의 파일 크기 하나이고, 그
대가는 명시적으로 치렀다 — **320px 폰에서는 macOS DMG 를 설치할 수 없다.**
크기는 설치를 결정하는 사람의 사실이고 그 사람은 데스크톱에 있으며, 접이식의
체크섬 행이 파일 이름을 여전히 전부 부른다.

**기록된 반대 (가장 강한 패배 논점)**: 작업대석 — *"판에서 헤드라인을 빼면
다운로드 카드가 맥락 없는 버튼 상자가 된다. 처음 온 사람은 판만 보고 무엇을
받는지 모른다."* 채택하지 않은 이유: 말 기둥이 판 **바로 위 같은 컬럼**에
같은 왼쪽 모서리·오른쪽 모서리(40/520)로 서므로 읽기 순서가 끊기지 않고,
판 안에는 여전히 `macOS 앱 · 오픈소스` 아이브로우가 가리키는 대상(Apple
Silicon/Intel · 최소 OS · 버전)이 전부 남는다.

**두 번째 반대**: 도해석 — *"잉크 대비를 3:1 로 승격해야 한다"* (②를 먼저 하고
재측정하라는 조건부 의견). 재측정 결과 **승격 불필요**: 캔버스 위 H1 **18.62:1**
(최악 픽셀 17.54), 리드 **6.09:1**(최악 5.74). 목줄이 그 최악값을 보장한다 —
어떤 노드도 그 밴드에 들어올 수 없기 때문이다.

**반증 조건**:
- 캡션의 `287 개념` 을 보고 방문자가 "이게 뭘 세는 숫자냐" 고 묻거나, README
  의 `97 nodes` 와 대조해 혼란을 제보하면 → **파생 그래프를 세는 결정이 틀렸다.**
  그때의 답은 캡션을 96 으로 되돌리는 것이 아니라 **지도가 그리는 것을 바꾸는
  것**이다(두 정의 중 하나를 고르는 문제이지 캡션 문구 문제가 아니다).
- 팬 목줄이 "지도가 뻑뻑하다 / 안 움직인다" 로 보고되면 → 220 이 너무 작다.
  값만 올린다(기제는 유지).
- `<sm` 에서 파일 크기를 찾는 문의가 나오면 → 크기 제거가 틀렸다. 사실줄로
  옮긴다.
- 1280×800 에서 31px 스크롤이 결함으로 보고되면 → 첫 화면 약속 폭을 넓혀야
  한다(현재 약속: 1440×900 이상 + 1512×850).

**재검토**: 첫 10명이 `/download` 를 열고 설치를 시도한 뒤.

**상태**: 유효

---

## 2026-07-28 — 관문 카운슬 4석: 스크롤 트랩 · 카메라 하드캡 · "이 페이지는 자기가 뭔지 말한 적이 없다"

**소집**: 소유자 직접 지시(*"디자인, 모션, 홍보 전문가 다 모셔봐.. 마케팅
전문가도"*) · 4석 — 위계(design-lead) · 모션(design-motion) · 해자(po-wedge) ·
체계(design-system). 카운슬 규율상 위계·체계는 상시 참석이다.
**트리거**: 소유자 실사용 불만 — *"옆에 그래프는 고정인데 드래그하면서 만져볼
수 있었으면"*, *"조금 더 커도 될듯? 비율 조절이 필요함"*.
**서명**: (미서명 — 소유자 확인 대기)

**가장 값진 발견은 소집 이유가 아니었다.** 모션석이 어포던스를 조사하다
**스크롤 트랩**을 실측했다: 캔버스가 뷰포트의 **62.1%** 인데 휠 핸들러가 어떤
가드보다 먼저 무조건 `preventDefault()` 를 불렀고 리스너는 `{passive:false}`
다. **랜딩에 착지한 방문자가 가장 먼저 하는 행동(스크롤)이 아무것도 하지 않고
지도만 줌됐다.** 접힘 아래에 판매 논증 전부가 있는데 거기 도달할 수 없었다.
`touch-action: none` 이라 폰에서는 더 나빴다.

버그가 아니라 **전제의 유출**이다 — 워크벤치에서는 지도가 화면 전체이고
스크롤할 페이지가 없으므로 그 줄이 옳다. 그 결정이 전제가 성립하지 않는
표면으로 샜다. 공방 폭 게이트에서 이미 이름 붙인 실패 패턴이다. 그래서 상수가
아니라 **계약**(`wheelIntent: 'zoom' | 'page-scroll'`)으로 올렸다. 게이트:
`tests/contract/wheel-intent.contract.test.ts` — 결함이 한 줄의 존재가 아니라
**두 줄의 순서**라 lint 가 원리적으로 못 본다.

**"고정처럼 보인다"의 원인은 어포던스가 아니라 밝기와 하드캡이었다** (위계석
실측):
- 지도 잉크의 **82.4%가 대비 1.5:1 미만**, 평균 1.49:1. 그 정도로 흐린 것은
  만질 물건으로 안 읽힌다.
- 무대 높이를 671→999px 로 늘려도 잉크 bbox 가 **1픽셀도 안 커졌다** —
  `--topology-v2-camera-scale-max`(2.6) 상한에 못 박혀 있었다. 소유자의 "더
  커도 될듯" 은 취향 주문이 아니라 **하드캡 보고**였다.

처방 후 실측: 잉크 bbox 438×409 → **1020×670**, 판 대비 0.79 → **3.0배**,
평균 대비 1.49 → 2.33, 프레임 위아래로 **넘쳐 잘린다**(= "이 지도는 화면보다
크다" 는 무모션 신호). 우측 공백 32.7% → 23.3%.

⚠️ **토큰 스코프에서 두 번 틀렸다.** ① 컨테이너 클래스로 걸었더니 색만 바뀌고
카메라는 그대로였다 — 캔버스 토큰 리더는 `document.documentElement` 를 읽고
전역 캐시한다. ② 루트 속성으로 바꿨는데도 안 먹었다 — React 가 **자식
effect 를 부모보다 먼저** 돌려서 지도가 속성이 걸리기 전에 토큰을 읽고 굳혔다.
`scoped` 게이트로 순서를 강제해 해결. 두 실패 다 "값은 맞는데 안 걸리는 층"의
사례라 주석으로 못박았다.

**해자석: 이 페이지는 자기가 뭔지 말한 적이 없었다.** 접힘 위 H1
`내 마크다운 폴더가, 이렇게 보입니다` 는 **뷰어 동사**라 Obsidian 이 무료로 더
크게 하는 범주를 주장했다. 그리고 경쟁자가 인쇄할 수 없는 유일한 문장
(`코드는 grep 으로 찾습니다. 왜 그런지는 어디서 찾나요?`)이 접힘 **아래**
778px 지점에 있었다 — 링크 미리보기·스크린샷·구전에 절대 안 실리는 자리.
승격했다.

⚠️ **코드에 박아 둔 제 주장이 반증됐다.** `TwoUsers` 주석이 *"사람+에이전트
두 열은 조사한 레퍼런스 어디에도 없다"* 고 적었는데, Basic Memory(★3,531)가
*"For you, your AI tools, and your team"* 을 랜딩 헤드라인으로 이미 인쇄해
두고 있다. 별 700배 차이. 틀린 경쟁 주장이 코드에 남으면 다음 사람이 그대로
믿는다.

**추가한 문장 하나**: *"앱을 지워도 폴더는 그대로 남습니다."* 페이지는
"어디로도 전송되지 않습니다"(유출)를 네 번 말하면서 "지워도 잃는 게 없습니다"
(고착)를 한 번도 안 했다. 무명 저장소의 바이너리를 들이는 사람이 실제로
계산하는 건 유출이 아니라 **"이거 망하면 내 데이터 어떻게 되나"** 이고, 그
질문에 답할 수 있다는 것 자체가 SaaS 경쟁자 전체에 대한 비대칭이다.

**GitHub 스타 배지는 반려했다** — 이 저장소는 ★5 다. 별은 주목의 지표이고 5는
신뢰 신호가 아니라 **반증 증거**다. 켜는 순간 방문자가 지금 모르는 사실을
알려 주는 꼴이다.

**위계석 삭제 목록 D4 는 부분 기각**: `releaseGateNote` 를 통째로 지우라고
했지만 그 문장은 **웹사이트**의 프라이버시 주장이라 판 안 칩(=**앱**의 주장)과
주체가 다르고, 2026-07-27 에 거짓 능력 주장을 걷어내며 한 번 정정된 이력이
있다. 중복이던 뒷절만 잘라내고 주장은 남겼다.

**기록된 반대 ①** (모션석): *"관문 방문자는 구조적으로 앰비언트 휴면(30초
지연)에 도달할 수 없고, 그 연소가 이 페이지에서 사는 것이 없다 — 각성 상태
캔버스 변화량이 초당 0.056% 라 혜성이 지각되지 않는다. 포스터에 워크벤치
요금을 내고 있다."*
**반증 조건 ①**: 저사양 기기 발열/버벅임 제보가 나오거나 관문 세션의 CPU 가
문제로 관측되면 옳았다 — `ambientSleepDelayMs` 프롭(3000ms)으로 처방한다.
**미적용** — 이번 패스 범위 밖으로 남긴다.

**기록된 반대 ②** (체계석): *"`stage-graph.ts` 는 홈 어댑터의 복제이고 이미
갈라졌다 — 허브 선정 가드가 없어 고립 그래프에서 근거 없는 앰버 링이 켜진다."*
→ **수용, 이번 패스에서 고쳤다**(가드 + self-loop 필터 + `stage-graph.test.ts`).
남은 권고(`selectSingleHubId` 공유 추출)는 별도 PR.

**미적용으로 남긴 처방** (트리거와 함께):
- 팬 경계 + 릴리즈 복귀 스프링(모션 P2) — "만져 보세요인데 돌아올 길이 없으면
  초대가 아니라 함정". 트리거: 다음 UI 패스.
- `role="img"` → 상호작용 role + `tabIndex` + 포커스 링(모션 P3).
- 모바일 세로 스택(위계 P6) — 390px 에서 판이 무대의 68.7% 를 덮는데 리드는
  "뒤에 보이는 지도" 라고 말한다. **없는 것을 가리키는 헤드라인**.
- `src/shared/ui/disclosure.tsx` 추출(체계) — 12지점 3가지 관용구 공존.
- `design.md` 에 관문 크롬 예외 한 줄 등재(체계).

**재검토**: 위 미적용 목록 중 P6(모바일)은 다음 패스에서 먼저 본다 — 유일하게
**거짓말하는 문구**가 걸린 항목이라 나머지와 등급이 다르다.

**상태**: 유효 (미적용 5건)

---

## 2026-07-28 — `/download` 재설계: **지도가 곧 페이지다**. 제품이 배경이고 다운로드가 그 위에 뜬다

**소집**: 단독 패스 (소유자 직접 지시 · 선택지 3안 중 소유자가 고름) ·
**트리거**: 소유자 실사용 불만 2연타 — *"이 다운로드 페이지 수준이 왜이래?
dmg 다운도 없고"*(레퍼런스로 onorca.dev 지목), 그리고 증분 개선안을 본 뒤
*"아예 새롭게 페이지 만들어줘야할듯? 예전 기억 하지말고 너무 비슷해서 별로인데"*.
**결정**: 뼈대를 바꾼다. 히어로 전체를 **무대**로 삼고 이 저장소 vault 의
실제 그래프(96 개념)를 전면에 깔고, 다운로드는 그 위에 뜨는 **불투명 판**
하나가 된다. 카드 나열을 버리고 위계는 여백 · 1px 괘선 · 타입 스케일이 진다.
**적용 규칙**: 헌장 우선(무채색 + 단일 인디고 · 반투명 금지 · 장식 마크 금지) ·
실물 검증(레퍼런스는 원칙만, 자산·문구 모방 0)
**서명**: (미서명 — 소유자 확인 대기)

**뒤집는 선행 결정 2건** (둘 다 같은 날, 둘 다 소유자 판정으로 기각):
① PR #730 「다운로드 화면 리메이크」(유틸리티 구조, 상자 17→5)
② 같은 날 「`/download` 는 관문형 랜딩이다」(GNB + 히어로가 주 CTA 를 쥔다)

②의 **구조는 살아남았다** — GNB, 히어로가 주 CTA 를 쥐는 것, 채운 인디고
1개는 그대로다. 기각된 것은 **조직 원리**다.

**왜 둘 다 실패했나**: 두 판이 공유한 전제가 *"제품은 **설명**하고 파일은
**제시**한다"* 였다. 그래서 둘 다 같은 무게의 상자를 쌓았고 소유자 판정도
두 번 같았다. 조사한 레퍼런스 8곳(Orca · Zed · Ghostty · OrbStack · Obsidian ·
Cursor · Tailscale · VS Code Insiders)이 **전부 같은 문법**이라, 그 문법
안에서 잘 만드는 것으로는 구분이 생기지 않는다 — 잘 만든 카드 나열의 상한이
"남들만큼" 이다. 그래서 문법을 바꿨다.

⚠️ **②의 핵심 전제도 틀렸다**: 그 기록은 *"`gh release list` 실측 결과 게시된
릴리스가 0건(태그 rc.1·rc.2 만 존재)"* 이라고 적었다. 실측하면 `v1.0.0-rc.2`
는 **게시된 릴리스**다(`publishedAt: 2026-07-28T01:44:03Z`, prerelease=true) —
서명·공증된 DMG 2종(aarch64 41.3MB · x64 45.3MB)과 각각의 `.sha256` 이 붙어
있고 **이미 6회 내려받혔다**. `gh release list` 가 기본값에서 프리릴리스를
접는 것을 "릴리스 없음" 으로 읽었다. 페이지가 "받을 것이 없다" 는 전제 위에
서 있었는데, 받을 것은 그때도 있었다.

**배경이 장식이면 이 재설계는 실패다.** 그래서 배경은 **제품 그 자체**다 —
`/` 가 쓰는 것과 같은 캔버스 엔진(`TopologyMapV2`)에 이 저장소의 dogfood
볼트를 먹여 마운트한다. 끌면 밀리고, 관성으로 정착하고, 노드를 누르면 초점이
잡히고, 접힌 무리(`+17`)를 누르면 펼쳐진다.

⚠️ **이 패스 안에서 한 번 틀렸다가 소유자 지시로 되돌렸다.** 처음엔 빌드
시점에 구운 **정적 SVG 초상**으로 갔다 — 논리는 "관문에 두 번째 워크벤치를
만들지 않는다" 였고, 런타임 비용 0 · 결정적 좌표 · 모션 0 이라는 이점도
실재했다. 하지만 소유자 판정은 *"우리 실제가 훨씬 예쁘고 … 우측에서
드래그하면 움직이게 하고싶음 실제처럼, 사용하는것처럼"* 이었고, 그게 옳다:
**이 페이지의 일이 파는 것이라면, 파는 물건을 실제로 만져 보게 하는 것보다
강한 논증이 없다.** 손으로 그린 닮은꼴은 아무리 다듬어도 진짜보다 못하고
방문자는 그 차이를 정확히 알아본다. 관문이 워크벤치가 되지 않게 하는 것은
**엔진을 안 쓰는 것**이 아니라 **크롬을 안 붙이는 것**이었다 — INDEX 패널도
데이터시트도 컨트롤 바도 없다.

정직성을 지키는 장치는 그대로 남았다:
- **출처 고정**(`useDogfoodInsight`). `useOntologyInsight` 는 세션의 샘플
  선택을 따라가므로, 그대로 쓰면 캡션이 "docs/ontology · 96 개념" 이라고
  적어 둔 채 스토어프론트 7 노드를 그린다(실측). 무대가 주장하는 것과 그리는
  것은 같은 볼트여야 한다.
- **죽은 어포던스 0.** 첫 마운트에서 클러스터 칩이 눌러도 아무 일이 없었다 —
  엔진은 누를 수 있게 그리는데 받는 쪽이 없었다. 펼침 상태를 배선했다.

**어댑터는 왜 새로 짰나**: 같은 일을 하는 `buildTopologyV2Graph` 가
`views/home/lib` 에 있지만 그건 다른 뷰의 내부다. FSD 동일 레이어 cross-import
에 걸리고 홈의 URL 상태까지 딸려 온다. 반대로 그걸 위젯으로 내리는 리팩터는
이 페이지가 필요로 하지 않는 것들(변경 펄스 · dusty · 관계 품질)까지 옮기며
**앱에서 가장 중요한 지도의 배선**을 건드린다. 그래서 이 화면이 실제로 쓰는
것만 `views/download/lib/stage-graph.ts` 에 담고, 의미 없는 필드는 꾸며내지
않고 중립값으로 뒀다.

**접힘 아래는 파는 자리다** (소유자 판정: *"이런 내용 설명이 다운로드에 왜
필요해.. 이 페이지는 서비스를 홍보해야지?"*). 직전 판의 「받아도 되는 이유」
(서명·공증·체크섬·`shasum`)는 **이미 사기로 마음먹은 사람을 위한 설치
안내서의 목차**이지, 이 물건이 뭔지도 모르는 사람에게 할 말이 아니다.
방문자가 세 번째로 읽는 문장이 `stapler validate 통과` 이면 그 페이지는 자기가
무엇을 파는지 말한 적이 없다. 그 자리는 이제 ① 한 문장 논지("코드는 grep 으로
찾습니다. 왜 그런지는 어디서 찾나요?") ② **사람 / 에이전트 두 열** — 같은
폴더를 둘이 1급으로 읽고 쓴다는, 레퍼런스 어디에도 없는 이 제품만의 문단 —
③ 설치 3단계가 갖는다.

**검증은 삭제하지 않고 각주로 내렸다.** 주장은 판 안의 칩 3개가, 증명은 푸터의
접이식이 진다. 지우면 이 제품이 남보다 더 주는 것(레퍼런스 8곳 중 체크섬을
내는 곳 0)을 스스로 버리는 것이고, 벽으로 세우면 파는 자리를 잡아먹는다.

**GNB 는 워크벤치 크롬 규격을 안 따른다** (소유자: *"세로 길이가 너무 좁고"*).
`--chrome-tile-size`(36px)는 지도 위에 떠서 화면을 양보해야 하는 **도구 막대**의
치수다. 관문의 상단 바는 도구가 아니라 이 사이트의 얼굴이라 같은 값을 쓰면
랜딩이 아니라 앱 크롬으로 읽힌다. 규격 위반이 아니라 **다른 계약**이다.
좁은 폭에서는 빵부스러기를 접어 한 줄을 지킨다(안 접으면 97px 두 줄이 무대를
먹는다 — 실측 390px).

**같은 패스에서 고친 결함 3건****같은 패스에서 고친 결함 3건** (설계가 아니라 거짓·고장):
- **`--allow-prerelease` 가 죽어 있었다.** 플래그를 파싱만 하고 구조 분해를
  안 해서 `ReferenceError`. RC 를 의도적으로 걸 수 있게 남겨 둔 **문이 실은
  벽이었다.**
- **한 화면, 두 버전.** 같은 카드에 배지 `v1.0.0-rc.3`(package.json)과 본문
  `v1.0.0-rc.2 는 아직 게시 전`(생성 모듈의 낡은 태그).
- **실행하면 실패하는 검증 명령.** 체크섬 목록은 `…rc.2_*.dmg` 인데 명령은
  `shasum -a 256 …rc.3_aarch64.dmg` — 존재하지 않는 파일이다. 신뢰를 벌겠다는
  절이 유일하게 실행 가능한 지시에서 틀렸다. 구 픽스처가 릴리스 태그를 항상
  `v${RELEASE_VERSION}` 로 둬서 두 출처가 갈라지는 순간을 재현할 수 없었다.

**레퍼런스에서 가져온 것 / 안 가져온 것**:
- 가져옴: 버튼 아래 한 줄에 버전 + **날짜** + 최소 OS + 릴리스 노트(8곳 공통).
  후보 채널을 숨기지 않고 이름 붙여 내거는 문법(VS Code Insiders).
- **안 가져옴 — 아키텍처 자동 판별.** `navigator.platform` 은 Apple Silicon
  에서도 `MacIntel` 을 돌려주고 deprecated 이며 Rosetta 아래서는 더 섞인다.
  실사한 8곳 중 자동 판별하는 곳이 **한 곳도 없다**(OrbStack · Cursor · Zed
  전부 두 갈래 병렬). 추측해서 한쪽만 내밀면 틀렸을 때 사용자가 열리지 않는
  앱을 받고 이유를 모른다.
- **우리가 더 주는 것**: 8곳 중 페이지에 체크섬을 내는 곳은 **0곳**. 그래서
  검증 절은 걷어낼 군더더기가 아니다 — 다만 결정을 가리면 안 되므로 주장(칩
  3개)은 판 안에, 증명은 설치 단계 아래로 나눴다.

**삭제한 것**: `miniature-layout.ts`(+테스트)와 `download.intro` 메시지 블록.
노드 8개짜리 도식은 진짜 엔진이 같은 볼트로 대체했고, 정직성 계약(범위 라벨)도
새 캡션이 이어받았다. 소비처 없는 모듈을 남기면 다음 사람이 둘 중 어느 것이
정본인지 모른다. (중간에 만들었던 정적 초상 생성기 `dogfoodVaultPortrait` 도
엔진으로 갈아타면서 통째로 걷어냈다 — 생성 데이터가 순 diff 0 으로 돌아왔다.)

**기록된 반대 ①** (#730 패스의 논점): *"랜딩으로 되돌리면 상자 17개의
비대함이 돌아온다."*
**반증 조건 ①**: 상자 수가 10개를 넘거나 페이지 높이가 2000px 을 넘으면
이 뒤집기가 틀렸다. 현재 실측(1440): 보더 가진 표면 = 판 1 + 체크섬 행 ·
가로 오버플로 0 · 채운 인디고 1.

**기록된 반대 ②** (po-leverage 성격): *"실측 다운로드 6회짜리 페이지를 세 번째
다시 그리는가. 구속 조건은 페이지가 아니라 정식 릴리스가 없다는 것이다."*
**반증 조건 ②**: 정식 v1.0.0 게시 후에도 방문 대비 다운로드가 붙지 않으면
이 반대가 옳았다 — 그때는 페이지가 아니라 유입과 릴리스를 연다.

**기록된 반대 ③** (design-workbench / 성능 성격): *"관문에 물리 엔진을 태우면
첫 화면이 무거워지고, 하이드레이션 전에는 무대가 빈 채로 남는다. 정적 초상은
그 둘이 다 없었다."*
**반증 조건 ③**: 관문의 첫 화면 지표가 눈에 띄게 나빠지거나(무대 등장 지연이
체감되면), 저사양 기기에서 지도가 버벅인다는 제보가 나오면 이 반대가 옳았다 —
그때의 답은 정적 초상으로 되돌리는 것이 아니라 **첫 프레임용 저비용 레이어를
엔진 뒤에 까는 것**이다. (`/` 가 이미 같은 엔진을 첫 화면에 태우고 있으므로
이 반대가 옳다면 `/` 도 같이 옳다 — 그때는 두 표면을 함께 고친다.)

**미결 — 소유자 결정 대기**: 지금 나가 있는 서명된 RC 를 페이지에 걸 것인가.
`release-state.test.ts` 가 `릴리스 태그 == package.json 버전` 을 요구해서
릴리스 사이의 평상시 상태(rc.3 개발 중 · rc.2 게시됨)를 계약이 금지한다.
이 가드는 **풀지 않았다** — 의도가 옳고 푸는 것은 소유자 결정이다.
(A) 정식 v1.0.0 을 낸다 → 가드 그대로, 후보 문구 불필요, 전부 켜진다.
(B) rc.3 을 내고 후보로 건다 → 이 패스가 만든 후보 문법이 그대로 쓰인다.
(C) 그대로 둔다 → 서명된 파일이 있는데 페이지는 계속 "아직 없습니다" 라고 한다.

**재검토**: (A)/(B) 중 하나가 실행된 직후 — 게시 상태의 페이지를 실측한다.

**상태**: 유효 (미결 항목 1건)

---

## 2026-07-29 — 스킬 md 는 편집기가 아니라 「사본 일치 뷰」로 답한다 (읽기 전용 · 데스크톱 한정)

**소집**: PO 카운슬 5석 (chief 배석) · **트리거**: 소유자 요청 "문서에서는 skill 들
(md) 관리도 가능하게" — 새 표면 신설 후보라 단독 패스 불가.
**루브릭**: 단독 패스 17/24 로 소집 임계(18 미만) 통과. 카운슬 라운드 2에서
Problem insight 1→2 (행 소유자 「근거」 서명 — 「결」은 3 을 주장했으나 서명은
행 소유자의 것). 치명적 0: 없음.
**결정**: 「해자」의 슬라이스 ① — **읽기 전용 「내 스킬 사본이 서로 일치하는가」
뷰**, 데스크톱 앱 한정. 편집기 신설은 폐기(「결」), 웹 배포는 구조적 불가로 제외.
**적용 규칙**: 최소 슬라이스 · 합집합 금지 · 헌장 우선(`surfaces.md` 웹 백필
의무 없음)
**서명 (accountable: stark)**: 서명함 (2026-07-29 — "그대로 진행해줘")

| 자리 | 판정 | 소유 행/기여 |
|---|---|---|
| 근거 | Investigate first (유지) | Problem insight 1→2. 핵심 발견: manifest walker (`build-local-manifest.ts` · `build-docs-vault.mjs`)가 `if (name.startsWith('.')) continue;` 로 dot 디렉터리를 걸러 `.claude/skills`·`.agents/skills` 는 manifest.docs 에 절대 안 들어온다 — `agent-files.ts`/`use-agent-files.ts` 의 skillCopy/atRefs 검사는 웹에서 영영 발화 못 하는 죽은 코드. 자신의 1라운드 "이미 절반 배포됨" 근거는 철회 |
| 결 | Shape a slice | 해자 슬라이스 ① 채택, 편집기 폐기. 지킴이 질의 답변: `.claude/` 는 FSA 로 원리적 도달 불가라 웹 일반화 불성립, 대다수 비개발자 vault 에 `.claude/` 없음 → 데스크톱 한정 |
| 지킴이 | 질의 제기 (2R 반박 미도착) | "이 한정이 제품 결정으로 정당한가" — 결의 답변이 반박 없이 성립. 스킬 md 의 `kind:` 승격은 반대: SKILL.md 의 frontmatter 는 에이전트 런타임이 소유한 외부 계약이라 우리 스키마를 얹으면 두 권위가 충돌한다 |
| 해자 | 슬라이스 ① 제안 (1R, 채택됨) | 제2 관측 채널: CLI `agent-files` 실측 — 11개 스킬 중 3개 `skill-copy-diverged`, motion-verify 의 `?guides=off` 규율이 Codex 사본에 부재 |
| 지렛대 | Shape a slice | appetite 1일 슬라이스. no-go: 웹 FSA 워크 변경 · 자동 병합 · 스킬 편집기/생성기 |

**갈린 지점**: 관측(Problem insight 2/4)이 슬라이스를 열 만큼 충분한가 —
「근거」는 "채널 둘 중 하나가 죽은 코드였다"로 Investigate first 를 유지했으나,
그 죽은-코드 발견이 겨눈 전제(웹 배포·편집기)를 「결」이 같은 라운드에서 제거해
남은 이름 있는 미지수가 없었다. 최소 슬라이스 규칙이 남은 관측된 해악(사본
어긋남)을 정확히 덮는 조각을 고른다.

**소유자 원문과의 거리 (정직 기록)**: 원문은 "문서에서 관리(편집)"인데 평결은
"데스크톱에서 읽기 전용 일치 확인"이다. 문서함(웹) 축은 축소가 아니라 구조적
불가(walker 의 dot-디렉터리 필터)다. **편집 축은 축소가 맞다** — 어떤 자리도
편집 통증의 관측을 내지 못했고, 관측된 해악은 어긋남이었다. 편집 절반은
기각이 아니라 미성형으로 소유자에게 반환한다. 부활 조건: 사용자/소유자가 스킬
md 를 외부 편집기로 고치러 앱을 이탈하는 패턴이 관측되면 편집 패스를 새로 연다.

**한정의 정당성 (심사 대상으로 기록)**: "이 저장소 dogfood 전용"은 이 결정의
가장 약한 판자다. 대상 인구의 정확한 정의는 "CLI `agent-setup` 이 만든 이중
사본(`.claude/`·`.agents/`)을 가진 저장소"이고 dogfood 는 그 첫 사례이자 오늘
유일한 관측이다. 인구가 정말 이 저장소 하나뿐이라면 올바른 집은 이미 존재하는
CLI `agent-files` 이고 이 뷰는 실패다 — 반증 조건에 건다.

**슬라이스**: IN — ① 데스크톱 앱의 읽기 전용 뷰 1개(후보 위치: 문서함 —
소유자 원문이 가리킨 자리): 스킬별 행에 이름 · 존재하는 사본
(`.claude/skills`/`.agents/skills`) · 판정 3값(일치 / 사본 어긋남 / 사본 없음)
② 데이터는 manifest 가 아니라 데스크톱 브리지(절대 경로)로 읽는다 — walker 의
dot-디렉터리 필터는 유지 ③ 판정 로직은 CLI `agent-files` 와 같은 계약(드리프트
방지 계약 테스트). OUT — 편집기 · diff 본문 뷰어 · 자동 동기화/수정 버튼 ·
웹 백필 · walker 변경. 고치는 행동은 화면 밖 핸드오프(CLI 한 줄)로 —
agent-native · human-sovereign: 사람은 판정하고 에이전트가 고친다.
appetite — PR 1개. 빌드 전 디자인 카운슬 별도 소집(순서 규칙: PO 먼저 ·
디자인 다음 — 위계·체계 기본 + 작업대·핸드오프).

**기록된 반대**: 「근거」의 Investigate first — "관측 채널 둘 중 하나는 죽은
코드였고 남은 하나는 이 저장소 단일의 CLI 실측이다. Problem insight 2/4 로
빌드를 여는 것은 한 저장소의 유지보수 통증을 제품 표면으로 승격하는 것일 수
있다."
**반증 조건**: 출하 후 ① dogfood 밖에서 이 뷰가 비어 있지 않은(이중 사본이
존재하는) vault 가 관측되지 않고 ② 뷰가 잡는 어긋남이 CLI `agent-files` 가
이미 잡던 집합과 동일하게 머무르면 — 뷰는 CLI 의 중복이었고, 「근거」가 옳았으며,
뷰를 제거하고 CLI 를 단일 답으로 되돌린다.
**재검토**: dogfood 4주 경과 또는 첫 외부 사용자 저장소에서 `agent-setup`
이중 사본 관측 시점 — 둘 중 먼저 오는 쪽.

**상태**: 유효 · 출하됨 (2026-07-29)

## 2026-07-28 — 폭발하는 그래프 질의는 예산과 함께 정직하게 자른다 (`cycles`)

**소집**: 단독 패스 · **트리거**: 공개 계약 변경(`query_ontology({operation:"cycles"})`
응답에 `searchBudget` · `expandedStates` · `exhaustive` · `truncatedByBudget` ·
`totalCyclesExact` · `evidence` 추가, `searchBudget` 인자 수용). 코드 품질
리뷰가 짚고 실측으로 확정된 결함에서 나왔다.
**루브릭**: 단독 패스 — 기존 결정의 **적용 확장**이라 새 채점을 하지 않는다
(치명적 0: 없음)
**결정**: `cycles` 에 `allPaths` 의 예산 문법을 **그대로 이식한다**. 새 기제를
만들지 않고, 응답 필드 이름·evidence 구조·`saferQuery` 형식을 맞춘다.
**적용 규칙**: 최소 슬라이스 · 선행 문법 재사용(두 번째 기제 금지) ·
조용한 절단 금지(`.claude/rules` 전반)
**서명**: stark (소유자 — "그 순서대로 진행해줘")

**왜 계약을 넓혔나**: 이 DFS 는 경로 열거라 지수인데, 유일한 조기 종료가
"사이클이 발견될 때"였다. 그래서 **사이클이 0인 그래프 — 사용자가 건강한지
확인하려고 부르는 바로 그 경우 — 가 가장 오래 돈다**(실측: 60노드·444엣지·
사이클 0 → 10.9초, MCP 는 단일 스레드 stdio 라 그동안 에이전트 표면 전체가
멈춘다). 예산만 넣고 끝내면 **예산에 걸린 "0개"를 에이전트가 "사이클 없음"으로
읽는다** — 그게 이 저장소가 이름으로 금지한 조용한 절단이다. 그래서 자르는
사실 자체를 응답에 실었다.

**기록된 반대**: "필드를 여섯 개 늘리는 것은 공개 표면 비용이다. `limit` 처럼
이미 있는 필드로 때우거나, 그냥 예산만 넣고 조용히 자르는 편이 응답이
가볍다." — 토큰 예산 관점의 반론.
**반증 조건**: 이 반대가 옳았다면 — ① 에이전트가 새 필드를 **한 번도 인용하지
않고** `totalCycles` 만 보고 판단하거나 ② 응답 크기 증가가 실제 컨텍스트
압박으로 관측된다. 둘 중 하나가 나타나면 필드를 접고 `evidence` 하나로
합친다.
**재검토**: 도그푸딩 세션에서 에이전트가 `cycles` 를 부른 기록이 10회 쌓였을 때,
그중 `totalCyclesExact`/`evidence` 를 인용한 비율을 본다.

**함께 바뀐 것(같은 계약면, 별도 결정 아님)**: `searchBudget` 인자 설명이
`all_paths` 전용에서 `cycles` 포함으로 넓어졌다 — 인자는 원래 있던 것이고
받는 곳이 하나 늘었을 뿐이다.

**상태**: 유효

## 2026-07-28 — `/download` 는 관문형 랜딩이다: 워크벤치 레일을 벗고, 주 CTA 를 히어로가 쥔다

**소집**: 단독 패스 (소유자 직접 지시) · **트리거**: 소유자 실사용 불만 —
"왜이렇게 안예쁨? 다운로드 버튼이 제대로 나온것같지도않고 이상한데",
그리고 "왼쪽 LNB 이런 구조보다 다르게 가야하지 않을까? 상단 GNB 나 아니면
하단 스크롤하면서 클릭해서 playground(웹)으로 이동하는 방식으로?"
**결정**: `/download` 를 **관문 라우트**로 분류한다. ① 좌측 레일(워크벤치
크롬)을 벗고 상단 GNB 를 쓴다 ② 페이지의 유일한 채운 인디고 CTA 를 히어로가
쥔다 ③ macOS 카드는 행동 없는 **사실 카드**로 남는다.
**적용 규칙**: 헌장 우선(`surfaces.md` — 웹의 1번 일은 관문) · 최소 슬라이스
**서명**: stark (소유자)

**뒤집는 선행 결정**: PR #730(2026-07-27) 「다운로드 화면 리메이크」. 그 패스는
이 화면의 일을 *"처음 온 사람이 지금 내 맥에 설치해도 되는지 판단하고, 맞으면
자기 기기에 맞는 파일을 헤매지 않고 받는다"* 로 정하고 랜딩 히어로를 통째로
걷어냈다(상자 17→5, 높이 2514→1478px).

⚠️ **그 결정은 원장에 없었다** — 커밋 본문에만 살아 있었다. 그래서 이 뒤집기는
"원장 항목을 뒤집는" 것이 아니라 **기록된 적 없는 결정을 뒤늦게 원장으로
끌어올리면서 동시에 갱신하는** 것이다. 표면의 일을 재정의하는 패스가 원장을
안 거치면, 다음 사람은 뒤집을 대상이 있는지조차 모른다. (같은 날의 원장 항목
「다운로드 페이지를 게시 여부 단일 상태로」는 **데이터 출처**에 관한 것이라
이 결정과 충돌하지 않는다 — 크기·체크섬·링크를 실제 릴리스에서만 받는 계약은
그대로 유효하고, 이번 변경은 그 데이터를 **어느 위계로 배치하는가**만 바꾼다.)

**왜 하루 만에 뒤집는가**: 그 결정의 **전제가 관측으로 깨졌다.** 정의된 직무는
"설치 판단 + 파일 받기"인데 `gh release list` 실측 결과 게시된 릴리스가
**0건**이다(태그 rc.1·rc.2 만 존재). 판단할 파일이 없으므로 페이지는 자기
직무를 수행할 수 없고, 그 상태에서 유틸리티 구조는 다음을 만들었다 —
실측(1512×950):

- 페이지의 유일한 채운 인디고가 「웹에서 지도 열기」였다. **다운로드 페이지의
  최강 컨트롤이 페이지 밖을 가리켰다.**
- 그 버튼이 「macOS」 라는 제목의 카드 **안**에 있어서, 카드의 제목과 카드의
  행동이 서로 다른 것을 말했다.
- 섹션 제목이 전부 14px(`text-body-lg`)이라 h1(30px) 과의 사이가 비었다 —
  7단 램프 중 3단만 썼고, 가장 중요한 카드의 제목이 부속 제목과 같은 크기였다.
- 좌측 레일이 아직 아무것도 안 연 방문자에게 목적지 6개를 세워 두고 있었다.
  `surfaces.md` 가 웹의 1번 일로 못박은 **관문**과 정면으로 어긋난다.

**기록된 반대 ①**: "#730 이 랜딩 히어로를 걷어낸 이유는 같은 무게 상자가
17개여서였다 — 랜딩으로 되돌리면 그 비대함이 돌아온다." (#730 패스의 논점)
**반증 조건 ①**: 상자 수가 다시 10개를 넘거나 페이지 높이가 2000px 을
넘으면 이 뒤집기가 틀린 것이다. 현재 실측: 채운 인디고 1 · 가로 오버플로 0 ·
위계 30/16/12.5.

**기록된 반대 ②**: "릴리스가 게시되면 원래 직무(설치 판단)가 되살아나므로,
그때 구조를 또 바꿔야 한다면 지금 바꾸는 것은 낭비다."
**반증 조건 ②**: 릴리스 게시 후 히어로 CTA 가 DMG 로 승격됐는데도 사용자가
파일을 못 찾으면 이 구조가 틀린 것이다. 그래서 `HeroActions` 는 게시 전/후에
**같은 자리**를 쓰고 내용만 바꾼다 — 구조 변경 없이 승자만 바뀐다.

**재검토**: 첫 릴리스가 게시된 직후, 그리고 방문자 10명이 그 상태의 페이지를
본 뒤. 다운로드 전환이 0이면 관문 정의가 아니라 **웹의 일 정의**를 다시 연다
(`surfaces.md` 의 반증 조건과 같은 문).

**상태**: 유효

---

## 2026-07-27 — 웹과 앱은 같은 화면을 약속하지 않는다: 한 코드베이스 · 능력 게이트 · 볼트 폴더 단일 진실원

**소집**: 소유자 직접 방향 지시("같지 않아도 될듯? 데이터만 같은걸 쓰게") + 단독
설계 패스(fable, `.qa-scratch/surfaces-and-conversation-2026-07-27.md`) ·
**트리거**: 웹↔앱 왕복 검증 부담 + 데스크톱 전용 능력(키체인·MCP 번들·업데이터·
git)의 연속 출하로 동등성 전제가 **이미** 무너져 있었음

**결정**: 표면 동등성 의무를 폐지한다. 앱 = 본거지(판단·에이전트 연결 허브),
웹 = **관문(1번 일)** + 앱 없는 환경의 차선 워크벤치(2번 일 — Chromium 한정).
단 **코드베이스는 가르지 않는다** — 한 빌드(`frontendDist: "../out"`) + 능력
브리지 4개 + 정직 강등이 분리의 구현이다. 표면을 넘어야 하는 데이터는 전부 볼트
폴더 안에 둔다(frontmatter + `.ontology-atlas/*.jsonl`). 웹 동등물 백필(웹
BYOK · 웹 MCP 설정 쓰기)은 **짓지 않는다**. 웹↔앱 왕복 검증은 폐지하고 웹 스모크
3종 + 데스크톱 실측 이원으로 교체한다.

**소유자 발언을 그대로 받지 않은 한 곳**: 소유자는 *"웹은 사실상 윈도우를 위한
거고"* 라 했지만 실측이 반대다 — 14일 순방문 35명이 **전원 웹**으로 들어왔고,
같은 날 소유자 자신이 게시 전 주인공을 `/`(웹 지도)로 잡았다(#730). Windows
사용자 관측은 0건이다. 그래서 웹의 **1번 일은 관문**이고 "윈도우를 위한 것"은
2번 일로 적었다. 순서를 뒤집으면 지금 유일한 유입 경로가 2류로 강등된다.
**Windows 앱이 나와도 웹은 사라지지 않는다** — 2번 일만 OS 별로 소멸한다.

**적용 규칙**: 최소 슬라이스(계약·게이트·문구만, 코드 분리 0) / 제거 요구(왕복
검증 · 백필 백로그) / 헌장 우선(강등은 숨김이 아니라 "왜 + 어디서"를 말한다)
**서명**: (소유자 확인 대기)

**기록된 반대 1** (웹 부패): *"소유자가 앱만 쓰는 순간 웹은 무인 표면이 된다.
유일한 유입 경로(14일 35명 전원 웹)가 조용히 썩는 구조를 스스로 만든다."*
**반증 조건 1**: 웹 스모크 게이트가 2주 연속 빨간 채 방치되거나, 방문자의
깨진-웹 제보가 나오면 — 스모크 3종이 부족했던 것. 웹 검증 범위를 재확장한다.

**기록된 반대 2** (정체성): *"'같은 제품인데 웹에선 안 된다'는 경험이 쌓이면
관문이 전환 장치가 아니라 실망 장치가 된다."*
**반증 조건 2**: 방문은 늘되 다운로드 전환이 계속 0이고 그 원인이 웹 기능 부재로
관측되면 — 강등 카드 문법이 아니라 **웹의 일 정의**를 재검토한다.

**재검토**: Windows 수요 관측(다운로드 페이지 Windows 대기에 대한 문의/반응 N건)
→ Windows 앱을 로드맵에 올릴지 판정. 그 전까지 웹이 Windows 의 공식 차선이다.

**이 결정이 같은 변경에서 실제로 한 일**: `.claude/rules/surfaces.md`(계약) ·
`docs/ARCHITECTURE.md` "Surface contract" · `docs/FEATURES.md` 능력 대조표 ·
`tests/e2e/web-surface-smoke.spec.ts`(스모크 3종) + `e2e.yml` 배선 ·
`.claude/rules/testing.md` 이원 검증 · `/download` 의 **틀린 문구 2건 정정**
(측정으로 반증: 웹은 Chromium 에서 실제로 폴더를 열고 고친다).

**상태**: 유효 (서명 대기)

---

## 2026-07-27 — AI 대화는 앱 안 「에이전트」 패널에 산다: 안 = 화면 동료, 밖 = 위임 일꾼, 웹 = 접점 없음

**소집**: 소유자 지시("3번은 fable이 설계") + 단독 설계 패스 · **트리거**: 앱이
MCP 를 품는 슬라이스가 "앱 안 대화가 왜 필요한가"의 전제를 바꿈

**결정**: 출하된 「에이전트」 패널(#694~#704)을 유지한다. 역할 경계 확정 —
**패널 = 화면을 같이 보는 동료**(화면 문맥 주입·제안-동의·인용 강제·세션 휘발,
3차 타겟의 유일한 AI 접점), **외부 에이전트 = 위임받는 일꾼**(코드 증거·긴 루프,
MCP 로 같은 볼트에 접속), **인계 = 볼트 + git + 복사 패킷**. 둘은 경쟁이 아니라
같은 사다리의 두 단이다. **웹은 AI 접점을 갖지 않는다** — 키 보관이 원리적으로
불가하므로(브라우저 저장소는 XSS 한 번, 벤더 헤더 이름이 곧 경고:
`…-dangerous-direct-browser-access`) 정직 강등 + 앱 받기를 유지한다. Windows 의
AI 공백은 웹 BYOK 가 아니라 **Windows 앱으로만** 갚는다. MCP 버튼과 패널의 연결
표면 통합은 앱-MCP 슬라이스 출하 후 별도 슬라이스.

**적용 규칙**: 합집합 금지(패널을 주 작업면으로 승격하지 않는다 — 지도가 주) /
헌장 우선(대화 보존 금지 · 무동의 전송 0 유지) / 제거 요구(#80 사다리의 S3
"답 배달 조사" 항목은 출하 후 kill criteria 관측으로 대체됐음을 명시)
**서명**: (소유자 확인 대기)

**기록된 반대 1** (중복 유지비): *"MCP 가 붙는 순간 패널은 열등한 중복이다.
1차 타겟은 패널을 안 열 것이고, 벤더 3사 API 추종 비용만 영구히 남는다."*
**반증 조건 1**: 출하 4주 감사 로그에서 `purpose:"agent"` 호출이 사실상 0 인데
MCP heartbeat 는 활발하면 — 패널의 실사용자가 없는 것. 패널을 **동결**(벤더
추가·기능 확장 중단)하고 3차 타겟 가설 자체를 재검토한다.

**기록된 반대 2** (Windows 방치): *"웹 무접점 원칙은 Windows 사용자를 AI 0 으로
방치한다 — '데이터만 같다'면서 정작 데이터를 다루는 AI 는 못 준다."*
**반증 조건 2**: Windows 유입·문의가 관측되기 시작하면 — 원칙을 바꾸는 게 아니라
Windows 앱을 승격한다(웹 BYOK 재검토는 벤더가 브라우저 직접 호출을 **공식 지원
경로**로 바꿀 때만).

**재검토**: 앱-MCP 버튼 출하 + 2주(연결 표면 통합 슬라이스 판정 시점), 또는
반증 조건 1 의 4주 관측.

**아직 데이터가 아니다 — 정직하게**: 패널은 출하 하루째다. 감사 로그의
`purpose:"agent"` 줄 수 · 첫 마디 칩 수락 같은 kill criteria 데이터가 아직
0줄이다. 위 결정은 **구조 논증이지 사용 증거가 아니다.**

**상태**: 유효 (서명 대기)

---

## 2026-07-27 — 앱이 MCP 를 품는다: 번들 stdio + 설정 자동 작성, npm 발행 계획 폐기

**소집**: 소유자 직접 방향 지시 + 단독 설계 패스.
**트리거**: 공개 배포 계약 변경 + 설치형 정체성 모순 — 앱을 설치해도 에이전트가
못 붙고, 그 안내는 100% 실패하는 `npx` 였다.

**뒤집는 기록**: 같은 날 PO 카운슬 5인의 **「npm 발행 먼저」 수렴**. 그 수렴을
`뒤집힘` 으로 표시한다. 원인은 카운슬 자체가 아니라 **소집자의 후보 정리**였다 —
"앱이 서버를 품는다"가 후보 목록에서 빠져 있었고, 없는 선택지는 아무도 고를 수
없다. 소집자 프레이밍 오류로 기록한다.

**결정**: 앱이 컴파일된 MCP 바이너리를 자기 번들에 싣고, 「에이전트 연결」 버튼이
클라이언트 설정을 대신 써 준다(stdio 유지). HTTP 전송은 보류. npm 은 발행 계획
폐기 + 게이트·문구 정리 — 단 `mcp/`·`cli/` 소스 디렉토리와 publish 가드 훅은
유지한다(CI·dogfood 40건이 소스 경로를 쓰므로 지울 것이 없고, 실수 방지 가치는
발행 계획과 무관하다).

**적용 규칙**: 최소 슬라이스 / 헌장 우선(포트 0 · 쓰기는 명시 버튼 · git diff 로
감사) / 제거 요구(자리표시자 · fail-closed 게이트 · 죽은 npx 문구).

**왜 npm 이 아닌가**: 발행이 더 싸다는 건 사실이다(명령 하나로 38개 파일의 안내가
참이 된다). 그러나 C 는 "앱 = 제품, 에이전트 = 동료 사용자"라는 정체성에서 배포
채널을 앱 밖으로 뺀다. A 는 **앱 설치가 곧 MCP 배포**가 되게 한다 — 다운로드
1회가 사람 표면과 에이전트 표면을 동시에 설치한다.

**구현 중 확정한 것** (설계가 미결로 남겼던 것):
- **repo 밖 vault**: vault 폴더 자체에 쓰고 "이 폴더를 프로젝트로 열라"고 말한다.
  홈 전역 설정(`~/.claude.json`)까지 가지 않는다 — 명시 승인 원칙에 비해
  사정거리가 너무 넓다.
- **quarantine + 외부 스폰**: 막는 것은 quarantine 이 아니라 **서명 품질**이다.
  공증된 중첩 바이너리는 quarantine xattr 을 달고도 외부 프로세스가 스폰하면
  실행됐고, ad-hoc·무서명은 stderr 한 줄 없이 SIGKILL 됐다. 릴리스 파이프라인이
  이미 Developer ID + 공증을 하므로 성립한다.
- **bun 런타임 호환**: 컴파일 바이너리가 32도구 전수 verify 스위트를 통과했다
  (git 서브프로세스 포함). Node SEA 폴백은 필요 없었다.

**서명**: (소유자 확인 대기)

**기록된 반대 1** (po-leverage 성격): *"다운로드 0 인데 1주짜리 배포 채널을 새로
짓는다. npm 발행은 명령 하나였고 38개 파일의 안내가 즉시 참이 됐다. 가장 싼
학습을 버리고 비싼 확신을 샀다."*
**반증 조건 1**: 버튼 출하 + 2주 안에 연결-검증 성공이 관측 0 이면 — 채널이
아니라 수요가 문제였던 것. 그때 npm 재개가 아니라 유입 문제로 돌아간다.

**기록된 반대 2** (생태계): *"MCP 디렉토리·레지스트리 생태계는 npm 배포를 관례로
가정한다. 앱 전용 배포는 발견성을 버린다."*
**반증 조건 2**: 외부 유입 로그에 MCP 레지스트리 경유가 관측되면 npm 발행을
재개한다. **제거는 가역이고 발행은 24h 후 비가역이므로 순서상 손해가 없다.**

**기록된 반대 3** (HTTP 지지): *"stdio 는 '켜져 있음' 상태가 없다 — 소유자가 본
경험의 핵심이 라이브 토글이었다면 이건 모조품이다."*
**반증 조건 3**: 자가 검증 + heartbeat 출하 후에도 "서버가 켜져 있는지
모르겠다"가 다시 제기되면 — 같은 바이너리에 `--http` 를 열고 승격한다(전송 배선
3줄 + 호스트 약 100줄).

**재검토**: 버튼 출하 + 2주 실측, 또는 Windows 표면이 로드맵에 오를 때.

**상태**: 초안 — 소유자 판단 대기.

## 2026-07-27 — 앱 내 업데이트를 짓는다 (같은 날 「짓지 않는다」를 소유자가 뒤집음)

**소집**: 소유자 직접 결정. 규칙상 치명적 0 은 카운슬을 부르지만, 이번엔 **소유자가
근거를 갖고 직접 뒤집었다** — 카운슬은 권고 기구이고 서명은 사람이 한다. 조용히
다시 결정하지 않기 위해 여기 남긴다.

**뒤집는 기록**: 같은 날 「앱 내 업데이트 알림은 아직 짓지 않는다 (6/24)」.

**그 기록의 무엇이 바뀌었나**: 문제 쪽은 **그대로다** — 다운로드는 여전히 0이고
"구버전에 머문다" 는 사건은 아직 일어날 수 없다. 바뀐 것은 **비용 쪽**이다.

- Apple Developer Program 가입이 완료되고 Developer ID 인증서가 발급됐다
  (2026-07-27, 만료 2031-07-28). 그 기록이 보류의 근거로 든 위험 —
  *"미서명 상태의 자기 교체는 앱이 안 열림으로 실패한다"* — 이 사라졌다
- Tauri 업데이터가 요구하는 minisign 키쌍은 **무료**이고 명령 하나다
- 즉 그 패스가 "지금은 비싸고 위험하다" 고 본 근거가 **하루 만에 둘 다 없어졌다**

**소유자 판단** (accountable: 진안): *"그럼 지금 바로 하자! 팝업창부터 예쁘게
만들어주고 업데이트 팝업"*. 근거는 앞선 기록에 이미 반대 의견으로 적혀 있던 것과
같다 — **업데이트 경로가 없는 앱은 첫 버그를 영원히 안고 가고, 사람이 붙은 뒤에
만들면 이미 구버전이 퍼진 뒤다.** 첫 릴리스 직전이라 지금 넣는 것이 가장 싸다.

**적용 규칙**: 최소 슬라이스. 알림과 갱신을 한 표면에 담되, 이 앱의 절제 헌장을
지킨다 — 게임 미학·glow·과장된 모션 없음. 업데이트는 사용자가 부른 것이 아니라
앱이 꺼낸 말이므로 **주목을 훔치지 않고 거절이 쉬워야 한다.**

**기록된 반대** (내 권고였다): 관측된 현상은 여전히 없다. 사용자 0명에서 만든
기능은 **첫 사용자가 겪는 방식을 추측으로 설계한다** — 얼마나 자주 확인할지,
거절을 기억할지, 실패했을 때 뭐라 말할지가 전부 가정이다. 그 가정들은 사람이
붙은 뒤에야 검증된다.

**반증 조건**: v1.0.1 을 냈을 때 ① 업데이트 알림을 본 사람이 실제로 갱신하면 이
결정이 옳았다 ② 반대로 알림이 무시되거나 "이거 왜 떠요" 가 나오면 내 반대가
옳았고, 그때는 빈도·문구·거절 기억 방식을 실측으로 다시 짠다.

**재검토**: 첫 업데이트(v1.0.0 → v1.0.1)가 실제로 배포된 직후.

**상태**: 유효 — 반증 대기.

---

## 2026-07-27 — 앱 내 업데이트 알림은 아직 짓지 않는다 (6/24, 치명적 0 셋)

**소집**: 단독 패스 (`/po-pass`). 규칙상 치명적 0 은 카운슬을 부르지만, 이 패스의
결론이 *짓지 말자*다 — 짓지 않기로 하는 데 카운슬을 여는 것은 PO OS 가 경고하는
process theater 다. **짓기로 방향이 바뀌면 그때 반드시 연다.**

**요청**: *"앱 내부에서 업데이트 띄워주는 팝업도 만들어야할듯한데 … 앱 쓰는
사람들이 버튼만 누르면 업데이트되도록"*

**관찰된 현상**: **없다.** 이것이 결론이다. 요청은 해법의 어휘("팝업")로 왔고,
그 뒤에 있어야 할 현상을 찾지 못했다. 실측(2026-07-27): 공개 릴리스 0건,
다운로드 **0회**, 이슈 1건. 앱을 설치한 사람이 0명이고 존재하는 버전이 하나뿐이라
"구버전에 머문다"는 사건 자체가 아직 일어날 수 없다.

**현상↔문제 판별**: 차이 [판정 불가 — 지울 현상이 없다] · 제2 관측 [**실패** —
구버전 사용률은 텔레메트리가 없어 못 보고(신뢰 헌장이 조용한 수집을 금지한다),
재신고·문의는 사용자가 0이라 0이다. 오늘 존재하는 두 번째 채널이 하나도 없다] ·
해법 독립 [**실패**]

**자가 채점**: Problem insight 0 · User moment 2 · Differentiation 0 ·
Ontology value 0 · Agent value 0 · Verification 4 = **6/24**
(치명적 0: Problem insight · Ontology value · Agent value)

**결정**: **Do not build (아직).** 표면을 순증시키면서 온톨로지 가치도 에이전트
가치도 0 이고, 무엇보다 **고칠 대상이 아직 존재하지 않는다.**

**적용 규칙**: 최소 슬라이스 — 관측되지 않은 문제에는 코드를 쓰지 않는다.

**기록된 반대** (진안의 요청이 곧 반대편이다): 업데이트 경로가 없는 앱은 첫
버그를 영원히 안고 간다. 사람이 붙은 뒤에 만들면 이미 구버전이 퍼진 뒤다. 즉
"관측 후에"는 필연적으로 **한 박자 늦는다**.

**반증 조건**: v1.0.0 이 실제로 받아진 뒤 ① v1.0.1 을 냈는데 구버전 문의·재신고가
들어오거나 ② "업데이트 어떻게 하냐"는 질문이 나오면 반대가 옳았고, 늦은 만큼의
비용이 실측된다. 반대로 사람들이 릴리스 페이지를 스스로 확인하고 재설치하면
이 결정이 옳다.

**재검토**: **선행 기록(미서명 릴리스)의 반증 조건과 같은 시점** — 첫 20 다운로드.
그 데이터가 이 질문에도 같이 답한다. 그때 패스를 다시 쓰면 6점이 아니라 제대로
나온다.

**구현 순서 (짓게 될 때)**: 자기 교체 없는 알림 → 인증서 확보 후 원버튼. Tauri
업데이터는 minisign 키쌍(Apple 인증서와 별개)을 요구하고, macOS 는 자기 교체한
번들에 quarantine 을 붙여 실행을 막은 전례가 있다(Apple 개발자 포럼 730314,
해결 없음). **미서명 상태의 자기 교체는 "앱이 안 열림"으로 실패한다.**

**상태**: 유효 — 반증 대기.

---

## 2026-07-27 — v1.0.0 을 미서명 DMG 로 내고, 대신 정직하게 안내한다

**소집**: 단독 패스 (`/po-pass`) — 소유자가 이미 결정한 사안이라 카운슬을 열지
않았다. 트리거("낯선 사람이 처음 읽는 문구")를 밟으므로 기록은 남긴다.

**관찰된 현상**: Apple Developer Program 미가입이라 Developer ID 인증서가 없고,
릴리스 워크플로는 서명·공증 secret 이 없으면 **의도적으로 실패**한다. v1.0.0 이
나갈 수 없다.

**사용자 문제**: macOS 앱을 받으러 온 사람이 받을 것이 없다. 그리고 서명 없이
내면 macOS Sequoia(15) 부터는 **우클릭 우회가 없어져서**, 첫 실행이 차단된 뒤
시스템 설정 → 개인정보 보호 및 보안 → 맨 아래 → "확인 없이 열기" 를 거쳐야 한다.

**현상↔문제 판별**: 차이 [통과 — 인증서가 생겨도 "설치 경로가 낯선 사람에게
막혀 있다"는 남는다] · 제2 관측 [설치 시도 후 이탈, "안 열려요" 문의] ·
해법 독립 [통과]

**결정**: **미서명으로 내되 페이지가 그 사실을 먼저 말한다.** 서명·공증을
"모든 공개 빌드가 통과한다"고 적어둔 신뢰 문구를 **지금 참인 것으로 교체**하고,
설치 경로에 Gatekeeper 단계를 명시한다. 체크섬은 그대로 게시한다 — 서명이 없을
때 무결성 확인 수단은 그것뿐이라 오히려 더 중요해진다.

**적용 규칙**: 최소 슬라이스 — 인증서를 기다리는 대신 오늘 참인 것만 말한다.

**서명 (accountable: 진안)**: 승인 — *"미서명으로 내고 정직하게 안내 이 방향으로
진행하자. 애플 인증은 나중에할게."*

**기록된 반대** (내 권고였다): 이 제품이 페이지에서 파는 것이 "검증 가능한
신뢰"이고 **첫 공개는 한 번뿐인 자원**이다. 받는 사람마다 시스템 설정을 거치게
하는 첫인상은 되돌릴 수 없고, 심미·신뢰 판단이 50ms 안에 굳는다는 근거가 그
비용을 키운다. 연 $99 와 하루~며칠이 그보다 싸다고 봤다.

**반증 조건**: 미서명 DMG 를 받은 사람들이 실제로 설치를 끝내면 반대가 틀렸다 —
설치 완료 대비 다운로드 비율, 그리고 "안 열린다"는 문의 건수로 관측한다. 반대로
다운로드는 붙는데 설치가 안 붙거나 Gatekeeper 문의가 반복되면 반대가 옳았다.

**재검토**: 첫 20 다운로드 시점, 또는 Apple Developer 가입이 끝나는 시점 중
빠른 쪽. 인증서가 생기면 이 결정은 자동으로 뒤집힌다 — 그때 페이지 문구도 함께
되돌린다.

**상태**: **뒤집힘 (2026-07-27, 같은 날).** 예고된 조건이 그대로 발생했다 —
Developer ID 인증서가 발급되어(만료 2031-07-28) 릴리스가 서명·공증 경로로
돌아왔다. 이 기록이 남겨 둔 미결 항목("페이지 문구도 함께 되돌린다")은
`/download` 리메이크에서 discharge 했다: 「아직 서명되지 않음」·「확인 없이
열기」 안내와 "서명이 없는 동안 체크섬이 유일한 확인 수단" 문구를 모두
걷어내고, 서명 주장을 `desktop:release-artifact` 체인에 묶어 드리프트를
테스트가 막게 했다.

**기록된 반대가 옳았다.** 이 패스에서 진 논점은 *"첫 공개는 한 번뿐인 자원이고,
받는 사람마다 시스템 설정을 거치게 하는 첫인상은 되돌릴 수 없다 — 연 $99 가 그보다
싸다"* 였다. 인증서는 결국 그 값에 하루 만에 확보됐고, 미서명 DMG 는 **한 번도
공개되지 않았다.** 반대가 옳았던 것이 실측으로 확인된 첫 기록이다.

**상태**: 유효 — 반증 대기.

---

## 2026-07-27 — 카운슬을 문서에서 호출 가능한 에이전트로 (PO 5인 · 디자인 8석 · chief)

**소집**: 없음 — **이 결정은 자기가 만든 게이트를 통과하지 않았다.**
**트리거**: 새 표면 신설(호출 가능한 카운슬 surface) + 방향 — 소집 필수 목록에
정확히 해당했다.

**결정**: PO OS 의 13개 렌즈를 5인에게, 디자인 OS 의 벤치 7석을 8석으로(반응형
합류) 각각 에이전트로 만들고, `chief` 를 두 카운슬 위에 놓았다. 루브릭 6개 행마다
서명자 한 명. 계약 테스트가 배선을 지킨다.

**서명**: 진안 (구두 승인 — "완벽에 가깝게 구성해서.. 여러명?")

**기록된 반대** (opus 적대적 검수): *"이 카운슬들을 만든 커밋 자체가 카운슬을
거치지 않았다. 저장소에 카운슬 기록이 하나도 없다. 짓는 쪽이 스스로를 채점하는
것을 막으려고 만든 층이, 짓는 쪽에 의해 채점됐다."* 같은 검수가 `chief` 삭제와
전체를 3분의 1로 축소할 것을 권고했다 — 근거: chief 의 유일한 정의적 제약("코드를
못 고친다")이 자기 `Bash`·`Agent` 권한과 모순되고, 아무 테스트도 chief 를 보지
않으며(실제로 자리 수 표기가 이미 드리프트했다), 무엇보다 **아무것도 소집을
강제하지 않는다** — 트리거 목록은 스킬 설명 안의 산문이고 테스트는 그 산문이
존재하는지만 확인한다.

**반증 조건**: 앞으로 8주 안에 이 원장에 **카운슬을 실제로 거친 기록이 3건 미만**
이면 반대가 옳았다 — 그때 이 층은 "잠긴 문 옆의 열린 창"이고, 축소하거나
`PreToolUse` 훅 같은 실제 강제로 바꿔야 한다. (이 저장소엔 이미 `npm publish` 를
실제로 막는 훅이 있다. 강제 수단이 없어서가 아니라 안 쓴 것이다.)

**재검토**: 기록 3건이 쌓였을 때, 또는 2026-09-21 중 빠른 쪽.

**상태**: 유효 — 반증 대기.

---

## 2026-07-27 — 다운로드 페이지를 게시 여부 단일 상태로, 앱 버전 v1.0.0

**소집**: 없음 (단독 패스) — **자기 게이트를 통과하지 못한 채 빌드했다.**
**루브릭**: **10/24** (통과선 18) · **치명적 0 두 개**: Ontology value · Agent value.
PO OS 는 그 두 행에 0 이 있으면 빌드 불가라고 명시한다.

**결정**: 크기 · 체크섬 · 다운로드 링크를 실제 GitHub Release 에서 생성되는
단일 모듈에서만 받게 하고, 자리표시자 6종을 없앴다. Windows 는 "준비 중"으로
명시. 버전 0.1.0 → 1.0.0. 릴리스 워크플로에 초안→승인→공개 게이트 추가.

**서명**: 진안 (머지 승인, PR #713)

**기록된 반대** (po-leverage): *"`/download` 는 구속 조건이 아니었다. 14일간 저장소
순 방문 28명, 외부 referrer 0건, npm 패키지 두 개 모두 미선점(E404) — 모든 설치
경로가 404 인데 페이지를 고쳤다. 완벽하게 고쳐도 금요일까지 Atlas 를 실행하는
사람은 0명 늘어난다."* po-evidence 는 별도로 `Do not build` 를 냈다.

**반증 조건**: 이 반대가 틀렸다면, v1.0.0 공개 후 다운로드 수가 페이지 유입 대비
유의미하게 붙는다. 옳았다면 npm 게시와 유입 채널이 열리기 전까지 다운로드는
0 근처에 머문다.

**재검토**: v1.0.0 공개 + 2주 뒤 `download_count` 대 `traffic/views` 실측.

**상태**: 유효 — 반증 대기. **후속 미결**: npm 이름 미선점, 데모 URL 이
"Loading this screen…" 142자로 서버 렌더되는 문제는 아직 살아 있다.

---

## 2026-07-27 — 모바일/태블릿과 반응형을 두 자리가 아니라 한 자리로

**소집**: 단독 리서치 + 소유자 결정
**결정**: 「반응형·터치」 한 자리가 pointer × viewport 매트릭스 전체를 소유한다.
「작업대」는 설치 앱 플랫폼(14인치 첫 뷰포트 · 창 생명주기 · 와이드 밀도)만 남는다.

**서명**: 진안 ("한 자리로 합치는거 좋아, 그렇게 가자")

**기록된 반대**: 소유자의 최초 요청은 **두 자리**였다("모바일, 태블릿 전문가도
당연히 있어야한다..! 반응형 전문가도 중요하고"). 리서치가 합치기를 권고한 근거 —
`responsive-sweep` 이 이미 둘을 한 패스로 돌고, 주 표면인 macOS 앱은 터치가
아니며, 두 자리는 "타깃을 키워라 / 밀도를 조여라"로 중재자 없이 충돌한다.

**반증 조건**: 네이티브 모바일 표면이나 스토어 적합성 요구가 생기면 합친 자리가
플랫폼 인증 업무를 감당하지 못한다 — 그때 분리가 옳았다.

**재검토**: 별도 모바일 표면이 로드맵에 오를 때.

**상태**: 유효.

---

## 2026-08-01 — 슬러그는 평평한 식별자다 — R15 「element slug 두 패턴」 폐기, 쓰기 관문이 경로형 슬러그를 거부하고, CLI add 도 저작 스탬프를 찍는다

**소집**: 단독 판정 (소유자 위임 — "판정하고 해결까지", 재생성 볼트 결함 재검) ·
**트리거**: 규격 문맥 0인 에이전트의 도그푸드 볼트 재생성이 「경로형 `elements[]`
참조 227 → 0」을 보고했으나, 실측 결과 그 성과는 **옮겨간 것**이었다 — 요소 43개
전부의 슬러그가 경로(`elements/src/views/home` 류)였고, 참조를 막는 관문은
있는데 슬러그를 재는 관문은 없었다.

**관측된 피해**: 웹 파생은 슬러그 꼬리(tail)를 노드 정체성으로 쓴다
(`derive-ontology-from-vault.ts` `deriveDocNode`). basename 이 같은
`elements/src/{entities,views,widgets}/docs-vault` 3개가 화면에서 1개로 접혀
컴파일 68 vs 화면 66, 관계 4개 소실. 컴파일러 스스로 `ambiguous-alias` 경고를
냈다 — 채택 즉시 시스템 자신의 경고를 울리는 관습은 지원되는 관습이 아니다.

**결정 (A — 슬러그는 평평한 식별자다)**:

1. **규격**: 도구가 만드는 노드의 슬러그는 `folderForKind(kind)` + 평평한 이름.
   위치는 `path:` 가 나른다 — 「경로는 개념의 증거이지 개념이 아니다」(2026-07-31
   구축 규격)를 정체성에 적용한 것. 근거 셋: ① 꼬리를 정체성/별칭으로 쓰는 표면이
   셋(웹 파생 · MCP unique-tail 해석 · 딥링크)이고 경로형 슬러그는 그 셋을 모두
   충돌시킨다 ② 슬러그 속 계층은 `domain:`/`elements:` 그래프의 중복 진실원이다
   (forbidden.md 의 이중 진실원 금지) ③ 재생성이 증명했듯 약한 모델은 제안문을
   그대로 따른다 — 고칠 곳은 제안 생성기와 관문이다.
2. **게이트 (hard error — 같은 변경에서)**: `flatSlugIssue(kind, slug)` 를
   `mcp/src/schema.mjs` + `cli/src/lib/schema.mjs` 미러에 두고
   (`FLAT_SLUG_CASES` 계약이 동일성 강제), 쓰기 문 전부에 배선 — MCP `writeDoc`
   (add_concept/add_concepts/absorb 상속) · `rename_concept` · `reclassify_concept` ·
   CLI `write-vault.writeDoc`(add/import 상속). 팬아웃 게이트의 「막지 않는다」
   원칙은 의미 판단용이고 이것은 형태 유효성(중복 슬러그 급)이라 막는다.
   **사용자 볼트 자체의 중첩(`services/auth/api`)은 소관 밖** — 스키마 폴더로
   시작하는 슬러그만 잰다. 로컬-퍼스트: 사용자 디스크 구조는 존중.
3. **유도원 수정** (이 판정에서 가장 값진 발견): 경로형 슬러그는 에이전트의
   창작이 아니라 **서버 자신의 제안**이었다. ① `analyze_repo_structure` 가
   `slug: elements/${relative(rootPath, subPath)}` 를 그대로 제안했고 볼트의
   43개 슬러그는 그 출력과 일치한다 ② `infer_imports` 의 `moduleOf` 가 같은
   path-style 로 "parity" 를 맞추고 있었다 ③ `mcp/README.md` R15 「Element
   slug — two valid patterns」이 path-style 을 문서로 축복했고 ④ CLI add 의
   hint 가 그 문서를 인용했다. 넷 다 수정 — 제안은 평평한 이름 + `path` 필드,
   basename 충돌 시 레이어 단수형 접미(`docs-vault-entity/-view/-widget`).
4. **볼트 수리**: 43개 전부 `rename_concept` 경유 평탄화, `pnpm docs-vault:build`
   재생성. 화면 68 == 컴파일 68, 관계 146 복원, `health` healthy.
5. **부수 발견 수리**: `redirectBacklinks` 의 tail-suffix 절이 **임의 문자열
   프론트매터 값**을 다시 쓰고 있었다 — 평탄화 rename 중 다른 노드의
   `path: src/entities/docs-vault` 가 `…/docs-vault-widget` 으로 오염(pathDrift
   3건 실측). 참조 슬롯(`domain:` + graph array 키)만 다시 쓰도록 축소 + 회귀
   테스트.

**함께 결정 (소유자 위임 지시 이행)**:

- **결함을 요구하던 게이트 3건 수술**: `derived-node-document` ·
  `graph-truth-parity` 계약이 번들 샘플에 *이름뿐인 노드 ≥1 · 중복 후보 고정
  11건 · 문서 없는 파생 노드 ≥1* 을 요구했다 — 규격을 지킨 볼트가 빨간불이
  되는 게이트는 결함을 보존한다. 「파생 노드가 존재하면 문서 노드라 부르지
  않는다」 조건부 + **합성 표본**(ghost 문서 1장)으로 바꿔 거짓말 차단은
  유지하고 결함 강제는 삭제 (`launch-docs-current` demoNote 수술과 같은 꼴).
- **`created_by` 두 문 정합 + 백필**: 2026-07-31 원장의 「CLI=미지(생략)」를
  **개정**한다 — 실측상 에이전트는 편한 문(CLI)을 골라 출처 없는 노드를 냈다.
  CLI `add` 도 MCP `add_concept` 과 같은 기본값(`agent:<heartbeat|unknown>`)을
  찍고, 사람은 `--created-by human` 으로 선언한다(heartbeat 신원 재사용, 새
  체계 0). 재생성 볼트 68개 전부 스탬프: **human 10** = 사람 판단이 성립
  조건인 노드 — 프로젝트 정의 1(`ontology-atlas`) + 도메인 경계 6 + 방향 약속
  capability 3(`vault-ontology`=프론트매터가 곧 그래프 ·
  `docs-vault-local`=로컬-퍼스트 · `vault-agent`=에이전트 네이티브 정체성);
  **agent:unknown 58** = 코드에서 유도 가능한 전부(재생성 에이전트 저작은
  사실이나 이름은 heartbeat 부재로 미상 — 모름은 모름으로). 소급 추론 금지
  (#801)는 기존 볼트 얘기고 새로 만든 볼트는 값이 사실이다(2026-07-31 원장
  재생성 지시가 이미 명시). 게이트:
  `tests/contract/dogfood-slug-provenance.contract.test.ts` (평면성 전수 +
  created_by 전수, 개수는 못 박지 않음).

**기록된 반대 (진 쪽 — B: 슬러그는 경로일 수 있다)**: 슬러그는 이미 볼트 상대
파일 경로이고(`slugToPath`), 로컬-퍼스트는 사용자 폴더 구조 존중을 약속한다 —
진짜 버그는 웹 파생의 **꼬리 접기**이며, 정체성을 전체 슬러그로 고치면 중첩된
사용자 볼트의 basename 충돌(예: `services/auth/api` vs `services/billing/api`)
까지 해결된다. A 는 이 읽기-경로 결함을 남긴다. — **반증 조건**: 실사용자
볼트에서 스키마 폴더 밖 중첩 + 꼬리 충돌로 화면 병합이 관측되면 B 의 파생
수리(전체 슬러그 정체성)가 A 와 무관하게 필요해진다. 그때 이 기록에서 시작한다
(현재는 `ambiguous-alias` 경고가 그 관측 채널이다).

**적용 규칙**: 헌장 우선(이중 진실원 금지 · 로컬-퍼스트) · 최소 슬라이스(파생
정체성 재설계 대신 쓰기 관문 + 생성기 수정) · 규격은 같은 변경에서 게이트로.

**서명 (accountable)**: stark (소유자 지시 "판정하고 해결까지 하라. 이슈 없도록")

**재검토**: 다음 볼트 재생성(쇼핑몰 샘플 포함) 때 새 볼트가 평평한 슬러그로
나오는지 — 유도원 수정의 직접 검증이다.

**상태**: 유효

---

## 2026-08-01 — 도구의 시야가 곧 볼트의 사정거리였다: analyze 가 최상위 패키지를 못 보고, 게이트 8건의 절반은 「결함 요구」가 아니라 「부재 탐지」였다

**소집**: 단독 판정 (같은 날 「슬러그는 평평한 식별자다」의 후속 — 코디네이터
재검이 세 번째 유도원을 발견) · **트리거**: 재생성 볼트에 `mcp/`·`cli/` 가
통째로 없었다 — `path:` 43개 전부 `src/`, 에이전트 표면(MCP 32 도구 · CLI 52
명령)이 제품 자신의 지도에 0. "agent-native, human-sovereign" 정체성의 절반이
백지였다.

**판정 ① — analyze 의 `src/` 한정은 의도가 아니라 결함이다.**
`analyze_repo_structure` 는 `src/` FSD 레이어와 `apps/`·`packages/` 워크스페이스
멤버만 걸었다(`WORKSPACE_FOLDERS = ['apps','packages']`). 이 저장소처럼 root
바로 아래 독립 패키지(`mcp/`, `cli/` — 각자 `package.json`)를 두는 배치는
어디에도 잡히지 않았고, **제안 도구의 누락은 침묵으로 전파돼** 규격 문맥 없는
에이전트의 볼트에서 그대로 구멍이 됐다. 슬러그를 경로로 만들던 그 도구가
이번엔 사정거리를 정한 것 — 같은 병의 세 번째 사례다. 수리: root 바로 아래
`package.json` 을 가진 디렉토리를 요소 후보로 제안(`detectRootPackages`,
판별자는 package.json — `scripts/`·`tests/` 는 독립 패키지가 아니라서 자연
제외). 게이트: `mcp/src/analyze.test.mjs` 사정거리 회귀 케이스.

**판정 ② — 실패 게이트 8건 재분류** (직전 보고의 「선재 결함 · 별도 판정」
분류를 뒤집는다 — 절반은 게이트가 옳았다):

| 게이트 | 분류 | 처방 |
|---|---|---|
| compile_ontology 옵션 문서 정렬 | **부재 탐지** | `capabilities/mcp-server` 복원으로 통과 |
| dogfood CLI 문서 fail-closed 정렬 | **부재 탐지** | `capabilities/cli-developer-entry` 복원으로 통과 |
| dogfood MCP 문서 workspace-brief 정렬 | **부재 탐지** | 〃 (mcp-server) |
| packed CLI 스모크 정렬 | **부재 탐지** | 〃 (cli-developer-entry 스모크 절) |
| dogfood CLI capability 카운트 비고정 | **부재 탐지** | 〃 + 근거 파일 목록을 body 로 (구 `elements:` 경로 92개 부활 금지) |
| dogfood MCP capability 정렬 | **부재 탐지** | 〃 (mcp-server) |
| MCP verify README census 정렬 | **혼합** — 목적(README 표본 == 재계산 진실)은 유지, 내부 핀은 구 형상 | `slug==='project'` → kind 로 탐색, smoke 슬러그 하드코딩 → verify 자신의 `buildGraphQuerySmokeArgs` 로 계산, 고정 6-kind 나열(`document:0` 요구) → 실재 kind 만. README 표본은 실측 verify 출력으로 재생성 |
| self-ontology README census | **구 형상 핀 + 규율 위반** | AGENTS.md 「no document writes the number — docs name the command」와 정면 충돌. 개정: 숫자는 조건부(말하면 참이어야), census 명령 표기 필수, 실재 진입점(`ontology-atlas.md` · 두 에이전트 표면) 지시 필수, 스타터 토이 문구 회귀 금지 |

**볼트 채움 — 규격의 두 번째 시험 결과**: `capabilities/mcp-server` ·
`capabilities/cli-developer-entry` 를 CLI `add`(평평한 슬러그 게이트 + 저작
스탬프 통과) + `relate`(preflight) 로 land. **maintenance queue 가 도메인
역링크 2건을 스스로 처방**했고 그대로 실행해 큐 0. 손보정은 둘: 복원 본문
속 낡은 「`elements/src/...` 제안」 서술 3곳(이날 규격 변경의 결과라 불가피),
구 `elements:` 경로 배열(27·92개)을 body 근거 절로 강등(경로는 증거이지
자식이 아니다). `scripts/`·`tests/` 노드는 **안 만든다** — 독립 패키지가
아니고, 의미는 그들이 게이트하는 capability 의 근거 줄에 이미 산다.
자기 볼트 README 는 스타터 템플릿에서 우리 프로젝트의 문서로 재작성
(census 는 숫자 대신 `node cli/src/index.mjs overview`).

**기록된 반대**: 두 capability 문서는 사실상 `cli/README`·`mcp/README` 의 세
번째 사본이고, 게이트가 pin 하는 문장 수십 개는 볼트 노드의 본문으로는 과하다
— 볼트 노드는 의미·경계·근거만 갖고 참조 문서는 링크해야 한다는 관점.
**반증 조건**: 이 두 문서의 정렬 게이트가 향후 3회 이상 「내용은 옳은데 문구
싱크」로만 깨지면 반대가 옳았던 것 — 그때 게이트를 링크+요약 계약으로 줄이고
본문을 얇게 한다. **재검토**: 다음 MCP 도구 추가/CLI 명령 추가 시.

**서명 (accountable)**: stark (코디네이터 위임 "이어서 처리하라")
**상태**: 유효

---

## 2026-08-01 — 문서 검사의 판별 기준: 기계가 만들 수 있는 것만 검사한다

**소집**: 단독 판정 (소유자 확정 · 웹 조사 근거) · **트리거**:
`scripts/check-package-contracts.test.mjs` 가 3,419줄 · 단언 2,126개로 자랐고,
실측 분류에서 **1,915개(90%)가 「README 에 이 문장이 있는가」** 였다. 나머지
150개(7%)만 코드에서 유도한 값과 대조했다.

**문제 (현상이 아니라)**: 산문 핀은 **잡아야 할 것을 못 잡고 개선을 막는다.**
도구 동작이 바뀌고 문서가 안 바뀌면 문장은 그대로라 통과한다. 반대로 문서를
더 나은 말로 고치면 빨개진다. 이 파일 자신이 「게이트가 틀리고 문서가 옳았다」는
주석을 최근 한 달에만 네 번 달았다(2026-07-31 CLAUDE.md 문구 핀 ·
2026-07-31 노드 수 핀 · 2026-08-01 self-ontology census · 2026-08-01 verify
README 형상). 그리고 같은 날 실물이 하나 더 나왔다 — 볼트 재생성으로
`docs/ontology/domains/onboarding-ux.md` 가 사라졌는데 그것을 인용하던 산문을
**1,915개 핀 중 아무것도 잡지 못했다**(사람이 손으로 찾았다).

**조사 (웹)**: 산문 핀을 CI 로 거는 오픈소스를 찾지 못했다. 실제로 쓰이는 것은
둘뿐이다.

- **싸고 넓은 그물** — 린트 · 포매팅 · **깨진 링크**. GitLab 의 `docs-lint
  markdown` / `docs-lint links`, OpenClaw 의 `check-docs`(= 포매팅 + 린트 +
  깨진 링크 **셋뿐**).
- **좁고 정확한 창** — **생성한 뒤 diff**. Kubernetes
  `hack/verify-generated-docs.sh`, GitLab `graphql-verify`, OpenClaw
  `pnpm config:docs:check`(`docs/.generated/config-baseline.counts.json` 대조),
  Hermes `skills-index-freshness.yml`.

GitLab 이 자기 CI 를 요약한 문장: *"primarily structural, lint, and link checks
— **not content assertions about specific prose requirements**"*.

**결정 — 판별 기준은 한 줄이다.**

> **기계가 만들 수 있는 것만 검사한다. 사람이 판단해서 쓴 문장은 검사하지 않는다.**

세 갈래로 구현했다.

1. **생성 후 diff** — `pnpm docs:surface:build` 가 **실행 중인 MCP 서버에
   `tools/list` 를 물어** `docs/.generated/mcp-surface.json` 을 쓴다(도구
   이름 · read/write 모드 · 인자 이름 · 필수 인자 + CLI 커맨드 인벤토리).
   `pnpm docs:surface:check` 가 재생성해 diff 하고, 덤으로 **등록된 이름이
   `mcp/README.md` · `cli/README.md` 에 나오는지** 본다. 정적 파싱이 아니라
   런타임 질의인 이유: 레지스트리는 5,000줄 파일 안에서 조립되고, 정적 파싱은
   조립 규칙이 바뀌는 순간 조용히 틀린 답을 준다. 생성물은 커밋한다(정렬 ·
   타임스탬프 0 — `docs/DEVELOPMENT-CHECKS.md` 「Generated manifest
   determinism」 선례).
   - **첫 실행이 바로 6건을 잡았다**: `absorb` · `agent-activity` ·
     `agent-files` · `export` · `index` · `moment` 이 `cli/README.md` 의 커맨드
     표에 **한 번도 등장한 적이 없었다.** 1,915개 핀이 못 잡던 바로 그 사고다.
2. **깨진 링크** — `pnpm docs:links`. 저장소 상대 링크 + **산문이 인용하는
   저장소 앵커 `.md` 경로**. 외부 URL 은 네트워크 의존이라 기본에서 빼고
   `pnpm docs:links:external` 로 분리했다(남의 서버가 죽었을 때 우리 게이트가
   빨개지면 안 된다).
   - **오늘 7건의 진짜 위반을 잡았다**: `AGENTS.md` 가 사라진
     `docs/ontology/project.md` 를 진입점으로 안내(#806 볼트 재생성의 잔해),
     `docs/CHANGELOG.md` 의 감사 문서 링크 경로 누락, `docs/audits/…` 의 상대
     경로 4건이 한 단계 모자람, `docs/archive/DATA-MODEL.md` 의 R10 에서 사라진
     규칙 문서 링크. 두 건은 거짓 양성이라 예시 표기를 볼트 상대형으로 고쳤다.
3. **산문 핀 철거** — 아래 「잃은 것」.

**범위 결정 (측정 후)**: 산문 경로 인용 검사는 **이력 문서에서 뺀다**
(`CHANGELOG.md` · `docs/DECISIONS.md` · `docs/archive|audits|superpowers|plans|prototypes/**`).
이력 문서는 사라진 파일을 이름으로 부르는 것이 **일**이다 — 변경 로그가
"`docs/GUIDE.md` 를 삭제했다" 고 쓰는 것은 부패가 아니라 기록이다. 실측: 이
제외가 없으면 이력에서만 24건이 떠서 현행 문서 3건을 덮는다. **링크는 빼지
않는다** — 눌렀을 때 열려야 하는 약속은 이력 문서에서도 약속이다.

**markdownlint 는 이번에 넣지 않는다 (전수 측정 후).** 기본 룰로
node_modules 를 제외하고 재면 **약 15,700건**이고, 상위 둘이 전체의 84% 다:
`MD013/line-length` 6,731 · `MD060/table-column-style` 6,423 (이 저장소는 한국어
장문과 compact 표를 의도적으로 쓴다). 그 둘을 꺼도 `MD032/blanks-around-lists`
741 · `MD022/blanks-around-headings` 597 등 ~2,500건이 남는다. **한 PR 로 치환
불가능**하고, 수백 건 warning 은 강제가 아니라 소음이며 기존 신호를 덮는다
(`.claude/rules/design.md` 「룰을 켜기 전 반드시 측정한다」). 깨진 링크
계열(`MD011` · `MD051` · `MD052`)만 좁혀 켜는 안도 재 봤으나 우리 문서에서
뜨는 것은 전부 거짓 양성이었다(코드 예시 속 `('-')[0]`, 한국어 앵커,
표처럼 쓴 `[전체][가이드]`) — `pnpm docs:links` 가 이미 더 정확하다.

**걷어낸 것과 잃은 것** (핀 1,915개 중 이번에 사라지는 것):

| 걷어낸 것 | 잃은 것 |
|---|---|
| `package.json` 스크립트 본문을 글자 그대로 복제한 `assert.equal` 약 150개 | 포커스 체크의 `--test-name-pattern` 을 누가 조용히 좁혀도 안 걸린다. 참조 무결성(`assertPnpmScriptsExist`)과 글롭 전수 검사는 남았다 |
| MCP/CLI README · CHANGELOG · FEATURES · DEVELOPMENT-CHECKS · ARCHITECTURE · 볼트 capability 문서의 문장 핀 (블록 20여 개) | 문서가 도구의 **동작**을 틀리게 서술해도 CI 는 침묵한다. 원래도 침묵했다 — 문장 핀은 문장이 안 바뀌면 통과하므로. 이제 대신 **이름 커버리지**와 **인자 목록 diff** 가 잡는다 |
| `scripts/smoke-packed-cli.mjs` · `cli/src/commands/mcp-verify.mjs` 의 소스 텍스트 핀 약 220개 | 그 스모크/래퍼의 구현이 바뀌어도 이 파일은 침묵한다. 두 대상의 **동작**은 `cli/src/integration.test.mjs` 가 실제로 실행해 검증한다(핀들이 그 테스트의 *이름*을 pin 하고 있었다 — 검증의 그림자였다) |
| `desktop:verify-topology-composer-blocking*` 스크립트 플래그 핀 8개 | 설치 앱 증명 스크립트에서 스크린샷 증거 플래그가 빠져도 안 걸린다 |
| `launch-docs-current.test.ts` 의 낡은 수 금지어 7개 (`12 tools` · `read 8 + write 4` …) | 문서가 현재 수와 낡은 수를 **동시에** 적으면 통과한다. 금지어 사전은 항목을 손으로 더해야 자라는 장치라 어느 쪽이든 썩었다 |
| 볼트 README 의 문장 핀 | (대체됨) 이제 **README 가 부르는 노드가 실재하는지** + **공개 계약의 수가 생성물과 같은지** 를 본다 |

**남긴 것과 근거**: ① 코드 유도 대조 — 관계/유지보수 enum 전수(엔진 배열에서
기대 문자열 생성), `tunedHealthScopeOutputSummary()` 등 계산된 요약, 도구
annotation 인구조사, `SERVER_VERSION`, `CLI_COMMAND_COUNT`, CLI↔MCP 관계 타입
동일성. ② 참조 무결성 — 문서의 `pnpm ...` 실재, `test:mcp:unit` 글롭 전수,
tarball `files` 도달성. ③ 실행 가능성 — help/`--check` 가 정말 도는가.
**새로 묶은 것**: `mcp/package.json` 의 description 이 적은 도구 수를 **생성된
레지스트리 표면과 대조**한다 — 런치 문서 게이트 전체가 그 문자열에서 수를
파생하고 있었는데, 사람이 쓴 문자열이라 레지스트리와 어긋나면 파생 게이트가
통째로 낡은 수를 진실로 삼아 조용히 통과했다.

**기록된 반대**: 산문 핀은 「문서가 도구를 정확히 설명하는가」를 지키려는
유일한 장치였고, 이름 커버리지는 *언급*만 볼 뿐 *설명의 정확성*은 안 본다 —
새 그물은 문서가 도구를 **틀리게** 설명하는 경우에 대해 종전보다 더 약하다는
관점. **반증 조건**: 앞으로 3개월 안에 「문서가 도구를 틀리게 설명해 사용자나
에이전트가 실제로 잘못된 호출/기대를 한 사례」가 관측되면 반대가 옳았던
것 — 그때는 산문 핀으로 되돌리지 말고 **인자/enum 대조의 사정거리를 넓힌다**
(생성물이 이미 인자 이름을 갖고 있으므로, 문서가 나열한 인자 목록을 그것과
대조하는 방향).

**재검토**: 다음 MCP 도구 추가 또는 CLI 명령 추가 시 — 그때 커버리지 게이트가
실제로 문서 누락을 잡는지 확인한다.

**서명 (accountable)**: stark
**상태**: 유효

## 2026-08-01 — 「범위를 넘긴 상태」를 부류로 잠근다: 선언된 범위 등록부, 그리고 `vaultScopeKey` 는 범위가 아니라는 명문화

**소집**: 단독 판정 (소유자 지시 · 앞선 사냥의 재현 기록) · **트리거**: 소유자가
앱에서 잡은 배너 하나(*"문서함에 이건 왜나오지?"*)가 증상이 아니라 **부류**였다.
같은 문법의 결함이 다섯 자리에서 재현됐다.

**부류의 이름**: **범위를 넘긴 상태** — 어떤 상태가 범위 X(볼트)에서만 뜻이
있는데, X 가 바뀌어도 살아남아 **거짓 판정의 입력**이 된다. 조용한 실패가 아니라
**화면이 사실이 아닌 것을 말하는** 실패다:

- 지도 `?p=` — 없는 노드를 선택으로 판정해 지도가 통째로 흐려지고(ego 포커스가
  실재를 안 본다), 「찾을 수 없다」 토스트는 슬러그당 한 번이라 A→B→A 는 완전히
  침묵했으며, 그 유령이 첫 방문 힌트를 localStorage 에 **영구** 소멸시켰다.
- `?pathFrom`/`?pathTo` — 이 볼트에 없는 노드 둘을 놓고 **「경로 없음」이라고
  단언**했다. 진실은 "둘 다 여기 없다" 인데 화면은 "둘 다 있고 안 이어져 있다"
  고 말했고, **「경로 패킷 복사」** 가 그 거짓을 에이전트에게 넘길 수 있었다.
- 변경 baseline · 알림 읽음 시각 — 볼트별 내용인데 전역 키 하나.

**결정**: ① 다섯을 고친다(주소는 볼트 정체성이 바뀌는 순간 걷어내고, 밖에서 온
링크는 정직하게 말한다 — 두 갈래를 가른다). ② **선언된 범위 등록부**를 게이트로
세운다(`tests/contract/scope-registry.contract.test.ts`): 모든 지도 쿼리 키와
모든 영속 저장 키를 한 줄씩 `global`/`vault-scoped` 로 태그하고, 미등록 키·죽은
줄·미보호 `vault-scoped` 를 실패로 만든다.

**왜 lint 가 아닌가**: 결함이 **키와 다른 파일에 사는 범위 사이의 관계**이고,
실패 상태가 리터럴을 남기지 않는다 — *없는* 정리 effect 는 AST 셀렉터에 보이지
않는다. `no-restricted-syntax` 는 한 파일의 AST 매칭이라 이 규격을 표현할 수
없다(`design.md` 「lint 가 못 보는 층은 계약 테스트가 맡는다」).

**⚠️ 명문화: `vaultScopeKey()` 만으로는 범위가 아니다.** 그 함수는 저장
namespace 용이라 샘플 둘(도그푸드 · 예시 쇼핑몰)을 `'server'` 하나로 뭉뚱그린다.
그것을 "볼트가 바뀌었나" 판정에 쓰면 **샘플↔샘플 전환이 변화로 안 잡혀서**,
게이트가 자기가 막으려던 결함을 **인증**한다. 그렇다고 `vaultScopeKey` 를 넓히지도
않는다 — 그건 핀·최근·열린 탭의 **저장 자리를 옮기는 일**이라 사용자의 기존
목록을 고아로 만든다. 그래서 동일성 판정 전용으로 `vaultIdentityScope`
(`local:<폴더>` | `sample:<샘플>`)를 따로 두고, 거친 범위는 **이미 배포된 네
자리에만** 얼려 둔다.

**켜기 전 전수 측정** (이 저장소 실측, origin/main 기준): 지도 쿼리 키 18개 중
볼트 종속 **9개**(`p`·`c`·`hub`·`pathFrom`·`pathTo`·`from`·`to`·`open`·`realm`
— 사냥의 7개에 옛 별칭 `from`/`to` 를 더한 값), 비테스트 키 리터럴 **59개**(저장
45 · 이벤트 11 · 옛 키 3), 그중 볼트 내용은 **10개**. 4개는 이미 거친 범위로
namespace 됨(얼어 있는 네 자리), 2개를 이 변경이 정확한 범위로 고쳤고, **4개는
알면서 남긴다**(`KNOWN_UNPROTECTED`, 각 줄에 이유 · 상한 래칫). 등록부는 URL 18줄
+ 저장 59줄 = **77줄**이다 — 사냥이 어림한 67줄보다 큰 이유는 ① 옛 별칭 두 개와
② 같은 namespace 를 쓰는 이벤트 이름 11개를 함께 등재했기 때문이다(스캐너가
리터럴만 보고는 저장과 이벤트를 못 가르므로, 빼면 사각지대가 생긴다).

**탐지기를 되돌려 확인했다.** 통과만으로는 살아 있다는 증거가 아니라서, 수리마다
되돌려 빨개지는지 쟀다 — 그 과정에서 **내 시험 하나가 가짜였다**: `mode=path` 와
끝점 둘을 같이 넣은 픽스처는 파서가 이미 `p` 를 null 로 내려서, 정리를 통째로
지워도 초록이었다. 픽스처를 선택 축과 경로 축으로 갈랐다. 같은 이유로 **소스에
범위 함수 *이름이 있는지* 보는 검사도 폐기**했다 — 훅 안에서 범위를 떼어냈는데
파일이 여전히 그 이름을 언급해 통과했다. 이제 각 키는 "볼트 A 에 쓴 값이 볼트
B 에서 안 보인다" 를 단언하는 **시험 파일을 지목**한다.

**브라우저 실측이 내 수리의 결함을 잡았다.** 첫 구현은 첫 마운트만 건너뛰었는데,
첫 렌더의 범위는 아직 `sample:...` 이라 **저장된 폴더가 복원되는 순간이 볼트
전환으로 오인**돼 사용자가 준 딥링크(`?p=`)를 지웠다. 볼트 소스가 정착한 뒤의
값만 세도록 고쳤다.

**기록된 반대**: 등록부는 **손으로 유지하는 표**라, 키가 늘 때마다 세금을 물리고
언젠가 형식적으로 채워질 것이라는 관점. 이벤트 이름까지 등재해 표가 더 커진 것도
그 관점을 강화한다. **반증 조건**: 앞으로 3개월 안에 「등록부에 줄은 있는데 태그가
틀려서 결함이 통과한」 사례가 관측되면 반대가 옳았던 것 — 그때는 표를 지우지 말고
**태그를 사람이 고르지 않게** 만든다(값의 모양으로 자동 분류하고, 사람은 예외만
적는 방향).

**재검토**: PR #827 이 머지될 때 — `KNOWN_UNPROTECTED` 에서 에디터 초안 줄이
빠지는지, 그리고 남은 세 줄(공방 초안 둘 · 최근 검색)이 여전히 「화면에 거짓이
안 뜬다」는 근거를 유지하는지 확인한다.

---

## 2026-08-01 — 시안의 확장 계측을 설정으로 이식하고, 오늘의 칩 어포던스를 「머리 위 막대」로 **교체**한다

**맥락**: `.qa-scratch/proto-expand.html` 은 접힌 묶음을 펼치는 방식을 **고르려고**
만든 계측 도구다. 어포던스 3안(뜬 알약 · 머리 위 막대 · 어깨 배지) · 확장 구조
3안(부챗살 · 고리 · 기둥) · 숫자 3개(한 번에 여는 개수 · 이름을 시도할 개수 ·
동시에 펼쳐 둘 부모)를 나란히 놓고 27조합을 실측했다. 소유자 지시: *"복원한거
기반으로 우리 소스코드에 적용하자! 좌측에 설정하는건 설정 팝업안에 LNB로 하나
추가되어야하고 말야"*.

**결정**:

1. **설정 LNB 에 「확장」 절을 신설한다** — `look` 묶음의 「지도 배경」과
   「발자국」 **사이**(소유자: *"발자국 위에 하나 넣어주면 될듯"*). 앞의 둘은
   지도가 무엇으로 그려지는가고, 확장은 그 위에서 무엇이 열리는가고, 발자국은
   다 그린 뒤 남는 흔적이다.
2. **기본 어포던스를 「머리 위 막대」로 한다** (소유자: *"기본값은 '머리 위 막대'
   어때?"*). **이것은 오늘 화면을 의도적으로 바꾸는 유일한 값이다.**
   - **사라지는 것**: 접힌 부모마다 상시로 떠 있던 `+N` 알약과 그 점선 목줄.
   - **대신 오는 것**: **고른 노드 바로 위**에 도킹된 `+N` 막대. 안 고르면
     아무것도 없다. 접힌 개수 자체는 노드 몸통의 각인 숫자가 계속 말한다.
   - **왜**: 알약은 셋 중 유일하게 **자리를 «찾아야»** 하는 컨트롤이다. 실측
     캡처(2026-08-01, 샘플 볼트 8도메인)에서 「마케팅」의 `+17` 은 자기 노드에서
     150px 아래로, 「상품」의 `+16` 은 화면 최상단으로 밀려나 있었다 — 화면이
     **누구의 버튼인지**를 더 이상 말하지 않는다. 막대는 탐색을 없앤다: 매번
     같은 자리에 있으면 눈이 찾지 않는다.
3. **나머지 넷의 기본값은 오늘 그대로다** — 확장 구조 `disc`(나선 원반) ·
   한 번에 여는 개수 24 · 이름을 시도할 개수 8 · 동시에 펼쳐 둘 부모 3.
   세 숫자는 **새 값이 아니라 이미 코드에 있던 상수**(`EGO_NEIGHBOR_LIMIT` ·
   `DISC_LABEL_TOP_K` · `MAX_EXPANDED_PARENTS`)이고, 이제 그 상수들이 설정의
   기본값을 **가져다 쓴다**(값이 두 곳에 적히지 않게 — Carbon).
4. **셋을 다 설정으로 내보낸다.** 「고르라고 만든 것」을 그대로 내보내면 *"우리가
   안 골랐다"* 가 제품에 남는데, 그 함정은 **기본값을 고르는 것**으로 피한다 —
   위 2번이 그 선택이다. 나머지 둘을 남기는 이유는 셋의 우열이 **밀도와 화면
   크기에 따라 실제로 갈리기** 때문이다(알약은 성긴 볼트에서 가장 잘 보이고,
   배지는 노드를 따라다녀 밀집에 강하고, 막대는 예측 가능하되 선택을 요구한다).
   관측이 쌓이면 선택지를 줄인다 — **늘리는 방향으로는 다시 열지 않는다.**

**시안과 다르게 한 것**:

- **「볼트 규모」(작음/실제/큼)는 옮기지 않았다.** 시안이 자기를 재려고 만든
  **시험 부하**지 제품 설정이 아니다 — 옮기면 사용자가 자기 데이터의 크기를
  «고르는» 컨트롤을 보게 된다. 게이트: `expand-settings.contract.test.ts`.
- **확장 구조에 네 번째 값 `disc`(나선 원반)를 더했다.** 시안의 셋 중 **어느
  것도 오늘 그려지는 것이 아니다**(오늘은 황금각 phyllotaxis 나선). `disc` 가
  없으면 이 설정에는 「오늘」을 고르는 자리가 없고, 그러면 절을 여는 것만으로
  화면이 바뀐다. **기본값이 화면을 바꾸는 것은 어포던스 한 항목까지다.**
- **막대에 글자가 없다.** 시안의 막대는 「N개 펼치기」·「접기」·진행 캡션을
  한국어로 그렸는데, 캔버스 렌더러에는 번역이 없어 그대로 옮기면 영어 사용자가
  한국어를 본다. 그래서 알약과 **같은 기호 어휘**(`+N` / `− N`)를 쓰고, 말은
  이미 있는 호버 툴팁(`onHoverCluster`)이 사용자의 언어로 한다. 시안이 재려던
  성질(«자리를 찾지 않는다» · «안 고르면 없다»)은 그대로다.
- **부챗살·고리·기둥은 기하만 옮겼다.** 시안은 자리를 **이름 폭까지 포함해서**
  잡았지만(`max(몸통 지름, 이름 폭)`), `model/layout.ts` 는 캔버스를 모르는 순수
  함수라 글자를 잴 수 없다. 이름은 계속 greedy 라벨 배치기와 「이름을 시도할
  개수」 예산이 맡는다 — 시안의 폭 실측을 그대로 옮긴 것이 **아니다**.

**게이트** (`tests/contract/expand-settings.contract.test.ts`, 29건):
설정을 안 건드린 사람이 실제로 「머리 위 막대」를 받는가(기록하는 가짜 ctx 로
**칠해진 사각형**을 잰다 — 밑변이 노드 머리 위, 가로 중심이 부모와 같음,
높이 24, 원 없음) · 셋이 서로 다른 형태·다른 자리·다른 높이를 내는가 ·
「뜬 알약」은 종전 지오메트리와 **바이트 동일**한가 · 배치 크기를 내리면 보이는
자식이 실제로 줄어드는가 · 상한을 내리면 더 일찍 LRU 축출이 일어나는가 ·
구조 넷이 서로 다른 좌표를 내는가 · `disc` 가 옵션 없는 호출과 같은가.
설정 표면은 `AppSettingsMenu.test.tsx`(LNB 4·2 · 아이콘 전원 · 시안 범위 그대로).

**기록된 반대**: 막대는 **안 고르면 존재하지 않는다.** 접힌 묶음이 있다는 사실은
노드 각인 숫자가 말하지만, *"눌러서 펼칠 수 있다"* 는 어포던스는 클릭 한 번
뒤에 있다 — 처음 오는 사람이 「확장」이라는 기능의 존재 자체를 못 볼 수 있다는
관점. 알약은 못생겼지만 **묻지 않아도 보였다**.

**반증 조건**: ① 사용자·워크스루에서 *"확장 버튼을 못 찾겠다"* / *"접힌 게
있는 줄 몰랐다"* 는 관측이 나오면 반대가 옳았던 것 — 그때 기본값을 「어깨 배지」로
옮긴다(노드에 도킹되면서도 상시 보이는 유일한 안이다). ② 반대로 세 어포던스 중
둘이 6개월 동안 아무도 안 고른 채로 남으면, 그건 «갈린다» 는 전제가 틀린 것이라
선택지를 하나로 줄인다.

**알려진 미해결**: 「어깨 배지」에서 **고른** 부모의 배지가 궤도의 「영역 전개」
버튼과 같은 우상단 자리를 다툰다(실측 캡처). 오늘도 *펼침* 배지에 이미 있는
겹침이라 이 변경이 만든 결함은 아니지만, 배지를 기본으로 올릴 때는 먼저 푼다.

**서명 (accountable)**: stark
**상태**: 유효

---

## 2026-08-02 — 확장 구조 기본값은 「부챗살」이고, 한 노드의 컨트롤은 서로 다른 방위를 쓴다

**맥락**: 하루 전 결정(2026-08-01)은 *"기본값이 화면을 바꾸는 것은 어포던스 한
항목까지"* 라며 확장 구조 기본값을 `disc`(종전 나선)로 뒀다. 소유자가 이를
뒤집었다 — **기본값 = 부챗살**. 그리고 그 결정 직후 디자인 검수가 시안
(`.qa-scratch/proto-expand.html`)과 구현을 같은 조건(1512×982 · 샘플 볼트 ·
같은 슬라이더 값)으로 나란히 재면서 세 가지를 더 잡았다.

**결정**:

1. **확장 구조 기본값을 `fan`(부챗살)으로 한다** (소유자). 이제 **기본값 둘**이
   화면을 바꾼다(막대 · 부챗살). 어제의 「한 항목까지」 원칙은 이 결정으로
   **명시적으로 완화**됐다 — 조용히 뒤집지 않고 여기 적는다.
   - **사라지는 것**: 임계(12) 초과 부모를 펼쳤을 때의 황금각 나선 원반.
   - **대신 오는 것**: 부모 바깥 방향으로 퍼지는 부채꼴. 이름이 옆으로 나란해
     붙을 자리가 늘어난다(실측: 이름 있는 마크 27% → 34%).
   - **`disc` 는 삭제하지 않는다.** 종전 화면으로 돌아갈 수 있는 유일한 값이고,
     아래 반증 조건이 관측되면 그리로 되돌린다. 게이트가 목록 잔류를 잠근다.
2. **부챗살의 호·층 간격을 26 → 34 로 올리고, 마지막 층을 가운데 정렬한다.**
   기본값으로 올리기 전에 겹침을 실측했더니 부챗살만 **마크 겹침 26쌍**이었다
   (나선·고리 0쌍, 부모 셋 펼침 48자식 기준). 원인은 값 하나다 — 자식 반지름은
   `magnitudeScale` 로 최대 1.4배까지 자라(역량 11 → 15.4) 나란히 서려면 30.8 이
   필요한데 나선의 26 을 그대로 썼고, `relaxCollisions` 는 **기본 반지름**만 보고
   밀어 그 초과분을 못 되돌린다. 34 로 올린 뒤 **0쌍**. 마지막 층을 쐐기 폭
   전체에 늘이던 식(`k/(take-1)`)은 남은 둘을 부챗살 양 끝으로 날려 «부채가 아니라
   부스러기» 로 읽히게 했고, 형제 도메인에 가장 먼저 닿는 자리이기도 했다 — 간격
   고정 + 가운데 정렬로 바꿨다. 기둥(`column`)도 같은 이유로 34 를 쓴다(18쌍 → 0쌍).
3. **한 노드의 컨트롤은 서로 다른 방위를 쓴다** — 막대=북 · 배지=**북서** ·
   궤도 「이것만 보기」 버튼=**동**. 어제 원장이 「알려진 미해결」로 등재한 배지·궤도
   겹침을 재 보니 **겹침이 아니라 차단**이었다: 배지 33.6×19 의 **80%(513px²)** 가
   버튼 밑에 들어갔고 `document.elementFromPoint(배지 중심)` 이 버튼의 `<circle>`
   을 돌려줬다 — 배지는 클릭해도 `?open=` 이 안 바뀐다(**한 번도 눌리지 않는
   컨트롤**). 삐져나온 끝 글자 하나가 `+17` 이 아니라 **「7」로 읽히는** 거짓 수까지
   있었다. 기본값인 막대도 우하단 모서리 80px²(판 면적 5%)가 물렸다.
   값 하나를 키워 이번 화면만 떼어 놓는 대신 방위를 갈랐다 — 반지름 7~42 × 줌
   0.85~1.5 전수에서 겹침 0 이고, 그 전수가 계약 테스트다.
4. **이름 상자를 좌우 3px 더 예약한다.** AABB 겹침 판정은 «닿는 것» 을 겹침으로
   안 세므로 두 이름이 0.7px 간격으로 서서 한 단어처럼 읽혔다(「카카오 알림톡」 +
   「적립금 원장」). 시안의 예약 상자가 `측정폭 + 6` 인 것과 같은 처방이다.
   대가: 촘촘한 자리에서 이름 한둘이 더 떨어진다(실측 16 → 14).
5. **딥링크도 「동시에 펼쳐 둘 부모」 상한을 받는다.** `?open=` 파싱은 설정을 모르는
   순수 함수라 기본값 3 만 쓴다 — 상한을 1 로 내려 둔 화면이 링크 하나로 부모 셋을
   펼쳤다(82노드, 상한대로면 51노드). 클릭 경로만 지키는 상한은 상한이 아니다.
6. **설정 「확장」 절의 세 숫자는 접혀서 시작한다.** 여섯 항목이 같은 무게의 상자
   셋으로 서면 이 절은 「고르는 자리」가 아니라 **목록**으로 읽힌다(실측: 형제 상자
   셋의 보더·radius·간격 12px 전부 동일). 결정은 둘이므로 그 둘만 펴 두고, 숫자는
   바로 아래 이웃 「발자국」이 이미 쓰는 문법(「직접 맞추기」)으로 접었다. 절 높이
   412 → 270px.

**시안 대조에서 정당하다고 판정한 차이**: 볼트 규모 미이식(시험 부하지 제품 설정이
아니다) · `disc` 추가(되돌릴 자리) · 부챗살이 «기하만»(순수 함수라 글자를 못 잰다 —
다만 위 2번으로 그 대가를 실측해 0쌍까지 좁혔다).

**시안으로 되돌리라고 판정한 차이 (미적용, rc.6 백로그)**: **막대의 글자.**
구현은 `+N`/`− N` 기호만 쓰고 이유를 *"캔버스 렌더러에 번역이 없다"* 로 적었는데,
그 전제가 사실이 아니다 — 캔버스는 이미 i18n 문자열을 그린다(결계 캡션
`wardingRing.caption`, HomePage 가 번역해 내려보낸다). 그래서 시안의
「N개 펼치기」·「접기」·진행 캡션을 못 옮길 구조적 이유는 없다. 지금 화면은 노드
안의 각인 숫자(`17`) 바로 위에 `+17` 이 서서 **같은 수를 두 번 말하고 동사는 한
번도 말하지 않는다**(호버 툴팁은 마우스에만 있다). 되돌리는 비용은 i18n 키 2개 +
프롭 배선 + CJK 폭 추정기(사각형이 히트·드로우·예약의 단일 출처라 결정론이어야
한다)이고, 그건 이 검수의 사정거리를 넘어 별도 슬라이스다.

**반증 조건**: ① 부챗살이 형제 도메인과 부딪히거나 화면 밖으로 나간다는 관측이
나오면(특히 도메인당 40개 이상 볼트 — 시안의 「실제」 부하) 되돌릴 곳은 `disc` 다.
② 「이름을 시도할 개수」를 올려도 이름 비율이 안 오르면 그건 배치가 아니라 라벨
예산의 문제다. ③ 배지·궤도 방위 배분은 세 번째 노드 컨트롤이 생기는 순간 다시
푼다 — 방위는 유한하고, 넷째가 오면 규칙이 아니라 레이아웃 문제가 된다.

**기록된 반대**: 부챗살은 나선보다 **면적을 넓게 쓴다**. 실측에서 화면 밖으로 나간
마크가 나선과 같은 3개였지만, 그건 이 볼트(도메인당 13~17자식)의 수치다. 자식이
수십 개인 볼트에서는 나선의 √ 성장이 유계라는 성질이 다시 이길 수 있다는 관점 —
그때 되돌릴 자리를 남겨 두는 것이 위 1번의 「disc 삭제 금지」다.

**서명 (accountable)**: stark
**상태**: 유효

---

## 2026-08-02 — 설정 시트는 「스케일 고정 계약」 밖이다. 그리고 안이 두 방언이었다

**맥락**: 소유자 지적 3건. ① *"뭔가 답답해 설정내부"* ② *"이는 버튼도 너무 작고?
뭔가 설정 자체가좀 작아"* (「확장」 절의 선택 버튼) ③ *"이 LNB버튼도 작고.. 전반적으로
크기개선좀 해야할듯?"*

**먼저 답한 질문 — 이 표면이 계약의 사정거리 안인가.** `design.md` 의 스케일 고정
계약(크롬 필/타일 36px · 크롬 라벨 11px · 레일 아이콘 20px)은 스스로 사정거리를
**워크벤치 크롬**으로 한정한다 — *"지도 위에 떠서 화면을 최대한 양보해야 하는 도구
막대"*. 2026-07-28 에 같은 논리로 관문 크롬(`GatewayNav`)을 뺐다(*"세로 길이가 너무
좁고"*).

설정 시트는 도구 막대가 아니다. 딤으로 뒤를 차단하는 **모달 목적지**이고(2026-07-30
결정), 곁눈질하는 표면이 아니라 결정하러 들어와 읽는 화면이다. 양보의 경제가 반대다.
**판정: 계약 밖(①).** 다만 그 선언은 오늘 화면을 바꾸지 않는다 — 실측해 보니 이
시트는 애초에 계약의 값을 하나도 안 쓰고 있었다(LNB 32px·아이콘 14px·본문 12.5px).
**계약이 틀린 게 아니라 이 표면에 규격이 없었다.**

**그래서 진짜 원인은 크기가 아니라 방언이었다** (절별 폰트 센서스, 1512×806):

| 절 | 12.5px | 11px | 9.5px |
|---|---|---|---|
| 화면 · 작업 공간 · AI 에이전트 | 10 / 5 / 4 | 5 / 1 / 3 | **0** |
| **확장** | **0** | 4 | **10** |
| 발자국 | 0 | 4 | 1 |
| 지도 배경 | 3 | 2 | 4 |

같은 시트, 같은 종류의 내용이 절에 따라 **램프 한 단이 통째로 밀려** 있었다. 아무도
정하지 않았다: `Slider`/`Choice` 는 `FootprintSettings` 의 **접힌 세부** 안에서 태어나
그 자리의 치수를 갖고 있었고, 공용 프리미티브로 승격되며 `ExpandSettings` 의 **주
결정 컨트롤**이 될 때 그 치수를 데려왔다. 결과가 **위계 역전** — 라디오 칩(9.5px/24px)
이 자기 라벨(11px)보다 작아 **누르는 것이 화면에서 가장 작은 글자**였고, 24px 은
WCAG 2.5.8(AA) 최소 타깃 24×24 에 여유 0으로 걸쳐 있었다(「고리」·「기둥」 폭 38.4px).

**결정**

1. **시트의 방언은 하나다** — 누르는 글자·행 라벨 `text-body`(12.5px), 설명·수치
   `text-label`(11px), `text-caption`(9.5px)은 **루트 시트에서 쓰지 않는다**. 근거는
   취향이 아니라 램프의 정의("마이크로 라벨·범례·타임스탬프"). 라디오 칩은
   32px/12.5px 로 — 이 시트의 다른 «값 하나 고르기» 인 `SegmentSwitch` 와 `AgentActivitySettings`
   의 알림 칩이 **이미 쓰던 값**이다(옳은 값은 이미 시트 안에 있었고 `Choice` 만 밖에 있었다).
2. **LNB 는 크롬에서 치수를 빌리지 않는다** — 32px/14px 아이콘(= 나브레일 타일 값)에서
   오른쪽 칸 `SettingsRow` 와 **같은 패딩**(`px-3 py-2` → 38px) + `text-body-lg`(14px)
   + 아이콘 16px 로. 시트가 열렸을 때 먼저 고르게 하는 자리라 오른쪽 행 라벨보다 한 단 위다.
3. **패널 높이 640 → 672.** 파생값이다: 최소 창 720 − 오버레이 거터(`p-3`) 2벌 = 672.
   그보다 크면 최소 창에서 자기가 선언한 거터를 먹는다. 폭 880 은 유지 — 넓히면 라벨과
   컨트롤 사이 빈 구간(실측 최대 541px)만 벌어진다.

**새 토큰 0개.** 관문 예외가 남긴 규율을 그대로 따랐다 — *"소비처가 하나뿐인데 변수를
만들면 참조 대상이 둘로 늘어 어디가 규격인지 흐려진다."* 값은 전부 기존 램프 스텝과
이 시트가 이미 쓰던 인셋에서 끌어왔다.

**실측 (전 → 후, 1512×806 · 다크)**

| | 전 | 후 |
|---|---|---|
| LNB 항목 높이 / 글자 / 아이콘 | 32px / 12.5px / 14px | 38px / 14px / 16px |
| 확장 선택 버튼 높이 / 글자 | 24px / 9.5px | 32px / 12.5px |
| 최소 버튼 폭(「고리」) | 38.4px | 47.6px |
| 「확장」 절 9.5px 원소 수 | 10 | 0 |
| 「화면」 절 세로 넘침 | 41px | 15px |
| 슬라이더 행 높이 편차 | 30px 단일 | 44px 단일(겹침 0) |
| 420px 뷰포트 가로 넘침 | 149px | 136px |

**게이트**: `tests/contract/settings-sheet-type-dialect.contract.test.ts` (8건). 켤 때
전수 측정 = 루트 6파일 위반 13건 → 치환 후 0건. **프로브 5회 전부 빨개짐** — 방언
되돌림 · 칩 24px 복귀 · LNB 크롬 치수 복귀 · 높이 640 복귀 · 높이 800(최소 창 초과).
공회전 차단 단언(파일을 실제로 읽었고 램프를 쓰는지) 포함.

**사정거리에서 뺀 것**: 드릴인 서브뷰 `VaultAgentSetupPanel`(55건) ·
`AiConnectionPanel`(27건). 루트 시트가 아니고, 그 `text-caption` 대부분은 램프 정의에
맞는 쓰임이다(`font-mono uppercase` 아이브로우 · 경로 코드 · 단계 번호 배지). 한 룰로
묶으면 82건짜리 소음이 되고 소음은 기존 신호를 덮는다.

**미해결로 남긴 것**: 420px 뷰포트에서 가로 136px 넘침(전 149px보다는 낫다). 구조적
원인은 **폭 180px 고정 LNB** + 슬라이더의 라벨 112px·수치 48px 고정 열이라, 좁은 폭에서
LNB 를 접을지가 별도 슬라이스다. LNB 세로 빈 칸도 57% → 49% 로 줄었을 뿐 여전히 절반이다.

**반증 조건**: ① 14px LNB 가 오른쪽 칸(12.5px)과 경쟁해 «어디로 갈까» 보다 «무엇을
바꿀까» 가 먼저 읽힌다는 관측이 나오면 LNB 를 12.5px 로 되돌리고 무게를 인셋으로만
준다. ② 「화면」 절이 계속 넘치면 그건 높이가 아니라 **그 절이 서로 다른 넷(언어·지도
상태·안내·에이전트 활동)을 들고 있다**는 신호다 — 다음 답은 픽셀이 아니라 절 쪼개기다.
③ 드릴인 서브뷰에서도 9.5px 이 «작다» 는 지적이 나오면 위 사정거리 제외가 틀린 것이고,
그때는 82건을 한 슬라이스로 치운다.

**기록된 반대**: 「확장」 절은 2026-08-02 앞선 감사가 412 → 270px 로 줄인 자리다(주목
승자를 둘로). 이번에 컨트롤을 키워 296px 로 되돌아갔다 — 그 감사의 목적(«고르는 자리»
로 읽히게)과 충돌하지 않는다고 판단한 근거는, 늘어난 26px 이 **접힌 세부를 다시 펼친
것이 아니라 남아 있는 두 결정의 컨트롤이 커진 것**이라는 점이다. 결정의 개수는 여전히
둘이다. 그래도 «절이 다시 자란다» 는 관측이 쌓이면 되돌릴 곳은 높이가 아니라
힌트 문장이다.

**서명 (accountable)**: stark
**상태**: 유효 (미해결 2건 — 420px 가로 넘침 · LNB 세로 빈 칸)

---

## 2026-08-02 — 막대를 막대로 만드는 것은 「글자 버튼」이고, 「걸어온 길」은 노드와 선까지 물들인다

**맥락**: 소유자가 설치된 화면에서 둘을 잡았다.

> *"머리위막대가 조금 다른듯한데 머리위 배지랑 다른게없는데?"*
> *"걸어온길 클릭했을때 화면인데 노드 선택되어서 빛나게 해줘야지? 노란색으로 선까지 다?"*

둘 다 «취향» 이 아니라 **약속된 것이 출하되지 않은 것**이다. 바로 위 원장
(2026-08-02, 확장 구조)이 첫째를 이미 「시안으로 되돌리라고 판정했으나 미적용
(rc.6 백로그)」으로 등재해 뒀고, 그 유예 사유(*"캔버스 렌더러에 번역이 없다"*)는
같은 항목이 스스로 **거짓이라고 적어 둔** 것이었다. 백로그가 아니라 결함이다.

**결정**:

1. **머리 위 막대는 동사가 든 글자 버튼이다.** 시안이 셋을 가르는 축은 자리만이
   아니다 — 뜬 알약은 «떨어진 빈 자리 + 점선», 어깨 배지는 «작은 원 + 호버로
   말함», 머리 위 막대는 «바로 위 + **글자** + 몇 개가 열릴지 숫자». 구현은 자리와
   선택 게이팅만 옮기고 그리는 것은 `+N` 뿐이라, 남은 것이 «노드 근처의 작은 마크»
   였다. 소유자의 판독이 정확하다.
   문구는 ko/en 둘 다: 「모두 펼치기」/「N개 펼치기」/「접기」 ·
   `Expand all`/`Expand {count}`/`Collapse`. 캔버스는 문자열을 만들지 않는다 —
   결계 캡션(`wardingRing.caption`)이 이미 쓰는 경로로 지도 화면이 번역해 내려보낸다.

2. **수는 그 수가 정보일 때만 말한다.** 노드 각인은 «여기 몇 개가 있나»(전체)이고
   막대는 «누르면 무슨 일이 나나»(이번에 열릴 개수)다. 서로 다른 사실이지만 한
   번에 다 열리는 흔한 경우엔 두 수가 같아진다 — 소유자가 본 화면이 정확히 그것
   (각인 `17` 위에 `+17`)이었다. 그래서 남은 것을 전부 열면 「모두 펼치기」(수
   없음), 나뉘면 「N개 펼치기」로 **각인과 다른 수**를 말한다(설정 「한 번에 여는
   개수」 4에서 실측: 각인 17 · 막대 「4개 펼치기」).

3. **판이 노드보다 넓어도 된다 — 어제의 「컨트롤이 데이터보다 크면 안 된다」를
   여기서만 완화한다.** 어제 판을 41.6px 로 조인 근거는 판이 **수 하나**만 말한다는
   전제였고, 그때는 옳았다(아무것도 더 말하지 않는 폭은 순수한 낭비다). 이제 판은
   문장을 말한다. Tufte 의 data-ink 는 절대 크기가 아니라 **정보당 잉크**의 규율이고,
   이 판은 **고른 노드에만** 있는 «부른 컨트롤» 이다(시안 `actionBarRect` 가 적어
   둔 «주인공은 자리를 차지한다»). 실측: 접힘 79px · 펼침 42px vs 도메인 노드 지름
   47.6px. **여전히 금지인 것은 빈 폭이다** — 알약의 선행 글리프 존(14px)처럼 그리는
   것이 없는 폭은 다시 안 들어온다. 계약도 «알약보다 좁다»에서 «글자 폭 + 패딩
   정확히»로 바꿨다(부등식으로 두면 빈 폭이 아니라 **언어**를 재게 된다 — 한국어에서
   이미 뒤집힌다).

4. **폭의 자는 하나이고 CJK 2셀을 안다.** 사각형을 만드는 자리에는 캔버스가 없고
   (히트테스트·라벨 예약도 같은 함수를 부른다) `ctx.measureText` 를 쓸 수 없다.
   결정론 추정기(`estimateCanvasTextWidth`)가 유일한 자이고 draw 는 재지 않는다.
   라틴 기준 `length × 상수` 를 그대로 쓰면 한글 폭을 40% 과소평가해(실측 600 12px:
   한글 음절 10.38px) 글자가 판 밖 — 즉 **히트 사각형 밖**으로 나간다. 계수는 실측에
   여유를 더해 **항상 실제보다 넓다**(좁으면 뚫고, 넓으면 여백이 조금 는다).

5. **못 붙는 컨트롤은 사라지지 않고 알약으로 남는다.** 배치 공개의 `+N 더보기` 칩과
   ego 의 「이웃 +N」 칩은 부모 id 가 합성 문자열이라 그래프에 그 노드가 없다. 도킹
   형태(막대·배지)가 기본이 된 #826 이후 이 둘은 **그려지지도 눌리지도 않았다** —
   「한 번에 여는 개수」를 낮춘 사람에게 나머지를 열 방법이 없었다는 뜻이다.
   `clusterControlForm` 에 `dockable` 을 넣어 알약으로 강등한다. 「뜬 알약」의 펼침
   배지는 이 폴백을 **안 받는다**(회귀 0 계약).

6. **「걸어온 길」 렌즈는 방문 노드와 밟은 관계선까지 트레일 색으로 올린다.**
   종전 렌즈는 방문 노드를 `"normal"` 로 **남기기만** 했고 모든 엣지를 dim 으로
   내렸다 — 그래서 「걸어온 길」인데 길이 안 보였다. 이제 방문 노드는 자기
   **stroke 채널의 색**이 트레일 잉크 쪽으로 옮겨가고, 연달아 밟은 쌍 중 **실재하는
   관계선**은 트레일 색으로 그려진다. 고른 노드는 받지 않는다(선택 링 > 발자국 위계).

   **왜 이 앰버 확장이 헌장 안인가** — 세 가지 다 값으로 증명된다:
   - **같은 잉크다.** 새 hue 를 열지 않고 `--color-footprint-trail`(사용자가 고른
     노랑/인디고 2택)을 그대로 쓴다. 허브 앰버와 값이 다르다는 것은 기존 계약
     테스트가 이미 잠갔다 — 「여기가 중심」과 「여기 걸었다」는 계속 다른 색이다.
   - **렌즈 한정이다.** 팝오버가 열려 있는 동안만이고 램프가 0 이면 잉크도 0 이다.
     선행 예외 둘(에이전트 포커스 링 · 최근 변경 스포트라이트)과 **같은 구조**라
     상시 앰버 확장이 아니다.
   - **glow 가 아니다.** 번짐(`ctx.shadowBlur`)은 `footprint-glyph.ts` 한 파일의
     opt-in·기본 0 예외로만 존재하고 그 밖으로 안 나간다. 소유자의 *"빛나게"* 를
     이 지도에서 정직하게 옮기면 **어두워진 장 위의 값·색 대비**다. 새 링(넷째 원)도
     새 궤도도 없다 — 노드가 이미 가진 stroke 하나의 색만 옮긴다.

7. **렌즈는 하드컷이 아니라 램프다.** 스포트라이트가 쓰는 지수 램프
   (`--topology-v2-focus-dim-tau`)를 그대로 재사용한다(신규 easing 0). 팝오버를
   닫아도 램프가 0 에 닿을 때까지 렌즈 집합을 계속 넘겨 트레일 잉크·배경 dim·칩
   후퇴가 **함께** 내려간다(모션 §「한 입력 = 한 사건」). 실측(90ms 프레임):
   켤 때 앰버 화소 3251 → 3855 → 3994, 끌 때 3994 → 1760 → 3251.

8. **렌즈 동안에는 확장 컨트롤도 물러난다.** 종전엔 방문 노드에 붙은 칩만 예외로
   남겼는데, 기본 어포던스가 막대가 되면서 그 예외가 **불투명한 판**이 되어 밟은
   관계선을 정확히 가로막았다(실측: 「주문」에 도착하는 트레일이 판 밑에서 끊겼다).
   예외를 하나 지우고 궤적을 주인공으로 둔다.

**판정하고 넘긴 것 — 선 위의 방향/순서**: 넣지 않는다. 순서는 이미 노드 옆
**순번**(1·6 …)이 나르고, 선 위의 발자국은 진행 방향으로 기울며 앞쪽이 진하다
(`edgeFootprintPlacements` 의 `fade`). 여기에 선 자체의 방향 채널을 더하면 같은
선 위에서 **관계의 방향**(depends 테이퍼)과 **걸음의 방향**이 두 화살표로 다투게
된다 — 한 채널에 한 사실이라는 규율을 깬다.

**판정하고 넘긴 것 — 안 방문한 것**: dim 그대로다. 궤적을 읽는 순간 장을 비우는
것이 이 렌즈의 존재 이유라, 안 밟은 관계까지 살려 두면 렌즈가 아무 일도 안 한 것이
된다.

**반증 조건**: ① 한국어보다 긴 어권(독일어 등)이 붙어 판이 형제 노드를 덮는다는
관측이 나오면 3번을 되돌리고 문구를 줄인다(「펼치기」 단독 = 53px). ② 렌즈 동안
트레일 앰버와 허브 앰버가 한 화면에서 혼동된다는 관측이 나오면 6번을 되돌리고
방문 노드 표기를 발자국 글리프만으로 되돌린다. ③ 5번의 알약 폴백이 고른 노드
둘레에 컨트롤 셋(막대 · ego 알약 · 더보기 알약)을 세우는 것이 «상자 수프» 로
읽힌다는 관측이 나오면, 시안처럼 **한 판 안의 두 칸**(「N개 더 펼치기 | 접기」)으로
합친다 — 그게 시안의 원안이고, 이번에 안 한 이유는 그것이 더 큰 변경이기 때문이지
더 나빠서가 아니다.

**기록된 반대 (진 쪽)**: *"막대는 노드 지름 안에 있어야 한다"* — 어제의 판정이고,
잉크 역전을 막는다는 점에서 여전히 옳은 방향이다. 진 이유는 그 규율이 **절대
치수**로 적혀 있었기 때문이다. 이 관점이 이겼다는 관측: 사용자가 판 때문에 형제
노드나 이름을 못 읽는다고 보고하는 것. 그러면 위 반증 조건 ①로 간다.

**서명 (accountable)**: stark
**상태**: 유효

## 2026-08-03 — `tone: 'accent'` 는 잉크가 아니라 표식이었다: 톤을 둘로 가른다

**맥락**: 값 층 정규화 라운드(PR #886)가 값 층 자신의 결함을 보고했다 —
`controlClass` 의 `accent` 톤이 글자 자리에 표식 인디고
(`--color-indigo-accent` #7170ff)를 낸다. 체계석 소집(디자인 카운슬 상설 규칙:
`control-class.ts` 를 고치면 부른다). 전수·대비는 전부 합성 실측이다
(`scripts/lib/contrast.mjs`, WCAG 2.2 §1.4.3).

**측정**: accent 톤 소비처 **전수 29곳**(객체 리터럴 16 + `Chip` 래퍼 JSX 13 —
처음 센서스는 앞의 16만 세었고, 래퍼 경유를 빠뜨렸다). 그중 **26곳이 인디고
틴트 채움/호버 채움(a08~a24 · line-a13) 또는 danger 틴트를 지고 있었고, 그
합성 위에서 #7170ff 는 3.49~4.42:1 로 AA(4.5) 미달**이다 — 노란 힌트만의
문제가 아니라 호버 `a24` 는 canvas 위에서도 4.13 이다. 설정 시트 인디고 칩
13곳 전부가 여기 포함된다(호버 `line-a13`/panel 4.12).

**결정 (갈래 ② — 톤을 가른다)**: `accent` 는 표식 인디고를 유지하되
라이선스를 **맨 어두운 바탕(canvas 5.18 · panel 4.96 · elevated 4.53)으로
좁히고**, 틴트를 지는 자리는 새 톤 `accentOnTint` =
`--color-indigo-text-soft`(전 표면 합성 6.46+)로 간다. 새 토큰 0 — 공방·지도
패널이 손으로 이미 쓰던 글자 인디고의 램프 등재다. `scope` 축과 같은 문법:
하나의 인디고가 두 바탕 위에서 두 해를 갖는다. 26곳 이관(잉크만 바뀌고 치수
변화 0), 잔류 3곳은 전부 맨 바탕 위 `link`.

**게이트**: ① `tests/contract/accent-ink-contrast.contract.test.ts` —
globals.css 실값으로 두 톤의 라이선스를 계산 + **accent 가 틴트 위에서 아직
실제로 깨진다**는 반대 단언(빈 집합 공회전 금지 — 토큰이 수렴해 이게 빨개지는
날이 두 톤을 접는 날이다) + 파일 상수 우회까지 보는 소스 스캔.
② eslint `accentTintPairingSelectors` — 같은 호출/원소 안의 리터럴 페어링,
전역 error, 켤 때 위반 0. 프로브: 잉크 되돌리기 · 페어링 되돌리기 각각 적색
확인.

**진 대안 (갈래 ①)**: accent 의 잉크 자체를 text-soft 로 바꾼다 — 한 번에 전
소비처가 AA 를 넘고 톤도 안 는다. 진 이유: 이 앱에는
`text-[color:var(--color-indigo-accent)]` 손글씨가 **99줄** 있고 전부 맨 바탕
위 링크·라벨 관용구다. 램프만 갈면 같은 화면에서 램프 링크(연한 인디고)와
손글씨 링크(선명한 인디고)가 두 방언이 된다 — Carbon 의 교훈("값이 두 곳에
적히면 드리프트")의 정반대 방향 재현이다. **이 관점이 이겼다는 관측이 될
반증**: 저 99줄이 다른 라운드에서 램프로 수렴 완료되는 날 — 그날은 갈래 ①을
다시 열어 두 톤을 하나로 접는 것이 맞다(반대 단언 게이트가 그 재평가를
기계적으로 요구한다).

**진 대안 (갈래 ③)**: 그대로 두고 소비처 제약만 문서화. 진 이유: 26/29 가
이미 실측 미달인 현상 유지라 「지금 그대로」가 이길 수 있는 조건(위반 소수 ·
광학 보정)이 성립하지 않는다.

**서명 (accountable)**: design-system 석 (소유자 서명 대기)
**상태**: 유효

## 2026-08-03 — quaternary 잉크는 「한 단 올라선 표면에서만 뚫리는 값」이었다: #787c84 → #82828a

**맥락**: 접근성 래칫 라운드(PR #896)가 부채 14건 중 6건을 갚고 남긴 8건이
전부 `--color-text-quaternary` 한 토큰으로 수렴했다(`/ko/ontology/insights/` 4
· `/ko/projects/` 4). 램프 값 변경이라 「체계」석 소집(`design.md` "규격을
바꾸려면 「체계」를 부른다"). 수치는 전부 `scripts/lib/contrast.mjs` 알파 합성
실측이다.

**측정**: ① 네 정지 표면 대비 — #787c84 는 canvas 4.76 · panel 4.55 ·
panel+overlay-1 **4.37** · elevated **4.16**. 캔버스/패널만 넘고 올라선
표면에서 AA(4.5) 미달. ② 소비처 전수 — `var(--color-text-quaternary)`
**584곳**(views 249 · widgets 237 · features 64 · shared 19 · entities 9 ·
app 오류표면 6; 브리핑의 652 는 과대집계였으나 결론 불변). 화면의 axe 위반은
8곳뿐이라 자리별 치환은 수를 내릴 뿐 나머지 576곳을 장전된 채 남긴다.
③ 위계 실측 — tertiary(#8a8f98) 대비 quaternary 의 panel 위 휘도 스텝비는
1.29 → **1.17** 로 줄지만, 이 저장소가 이미 수용한 같은 단의 선례
(`--topology-v2-panel-text-quaternary` #82828a vs tertiary #868690)의 스텝비
**1.06** 보다 넓다 — 램프 자신의 스텝 범위(1.06~2.22) 안이다. ④ 최소성 —
elevated 4.5 를 넘는 균일 무채 하한이 #828282(4.54)이므로 #82828a(4.57)는
사실상 최소 상향이다. 더 어두운 값은 없고, 더 밝은 값은 위계를 공짜로 판다.

**결정**: `--color-text-quaternary` 를 `#82828a` 로 상향. 네 정지 표면 전부
통과(canvas 5.23 · panel 5.00 · panel+overlay-1 4.81 · elevated 4.57). 무채
명도만 이동, 새 hue 0, 새 토큰 0. 부수 효과로 전역 램프와 지도 패널 램프의
quaternary 해가 **한 값으로 수렴**한다 — 2026-07 에 지도 패널이 같은 사유
(#55555d, 다크 패널 위 ~2.5:1)로 먼저 도착한 값이다. `prefers-contrast: more`
오버라이드(#8f95a0)는 여전히 더 밝아 고대비 방향 보존. **경계는 남는다**:
hover/선택 표면(overlay-2 합성)에서는 4.36 으로 여전히 미달이므로 「누를 수
있는 행 위의 글자는 tertiary 부터」(AtlasGitPanel 2026-08-02 규칙)는 값 상향
후에도 유효하다 — 주석의 수치만 재실측으로 갱신했다.

**게이트**: `tests/e2e/a11y-ratchet.spec.ts` `color-contrast` 8 → **0** ·
`tests/e2e/contrast-ratchet.spec.ts` `BASELINE_FAILING_COMBINATIONS` 2 → **0**.
기준선이 0 이 되면 탐지기가 빈 집합 위에서 놀 수 있다 — 그 가드는 이미 상주한다
(a11y: 라우트당 `passes ≥ 15` 채집 하한 · contrast: `measured > 50`). 프로브:
빌드 산출 CSS 의 값을 #787c84 로 되돌려 두 래칫이 실제로 적색이 되는 것을 확인.

**진 대안 ① (자리별 치환)**: 미달 8곳만 tertiary 로 올린다. 진 이유: 소비처
584 중 8 을 고치는 것은 수를 내리는 것이지 결함(값 자체가 올라선 표면에서
성립 안 함)을 고치는 게 아니다 — 다음 elevated 위 quaternary 가 그대로 다시
뚫린다. **이 관점이 이겼다는 관측이 될 반증**: 상향 후 quaternary 가 「너무
밝아 tertiary 와 구분이 안 된다」는 위계 결함 보고가 실제 화면에서 나오는 것
— 그러면 값을 되돌리고 「quaternary 는 canvas/panel 전용」이라는 표면 제약을
lint 로 강제하는 자리별 노선이 옳았던 것이다.

**진 대안 ② (지금 그대로 + 래칫 유지)**: 8건을 기준선으로 안고 간다. 진
이유: 「지금 그대로」가 이기는 조건(위반이 소수·광학 보정·강제 비용 과다)이
성립하지 않는다 — 위반이 규격(WCAG AA) 위반이고, 정정 비용이 값 한 줄이다.

**서명 (accountable)**: design-system 석 (소유자 서명 대기)
**상태**: 유효

---

## 2026-08-04 — 컨트롤 채택 래칫을 「등재된 값 층 밖」과 「아직 안 옮긴 부채」로 가른다

**현상**: `control-adoption-ratchet.contract.test.ts` 가 손으로 쓴 컨트롤 113
건을 **한 덩어리**로 셌다. 그 안에는 값 층(`controlClass()`)이 원리적으로 낼
수 없는 자리와, 「체계」가 부품을 더하면 열리는 자리가 같은 칸에 있었다. 그래서
**무엇이 진전인지 읽을 수 없었다** — 수가 안 줄면 게을렀던 것인지 못 옮기는
것인지 구별이 안 됐다.

**결정**: 수를 둘로 가른다. `OUTSIDE_VALUE_LAYER` 등록부(**등재 23**)와
**부채 90**. 부채만 줄어야 하는 수다. 등록부는 `DEGRADED_SURFACES`(웹 강등)·
`HARD_CUT_REGISTRY`(등장/퇴장)와 같은 형태 — 각 줄이 「이 자리는 왜 값 층
밖인가」를 주장하고 그 주장에 근거 문자열이 붙는다.

등재의 선은 **값 층이 className 을 낸다**는 사실이다: 크롬 토큰이 뷰포트
함수·포인터 승격으로 치수를 소유하는 자리(`chrome-token`), 치수가 JS 계산
`style` 에서 오는 무대 기하(`stage-geometry`), 값 층 자신의 프리미티브
(`value-layer-peer`) 셋만 등재한다. **「값 층에 그 모양이 아직 없다」는 등재
사유가 아니다** — 그건 부채다.

**들어온 주장 36 중 13 을 기각했다.** 「git 15 · shared/ui 10 · 공방 11」로
제시된 것을 자리마다 열어 보니 23 만 참이었다: `CommitDetail` 2(밑줄 탭 ·
깊은 인셋 — `--git-*` 토큰을 안 쓴다) · `ConceptEgoCard` 1 ·
`node-explanation-edit` 3 + `info-hint` 1(원형 아이콘 구멍 — `shared/ui` 에 살
뿐 프리미티브가 아니다) · `compact-copy-button` 1(누름 방언 하나만 밖) ·
공방 5(문장 속 3 · 점선 1 · 소유자 승인된 `rounded-2xl` 1). 전부 부채로 남겼다.
덧붙여 공방 11 의 근거로 제시된 「`studio-navigation.spec.ts` 가 그 치수를
계약으로 못박는다」는 **사실이 아니었다** — 그 스펙은 `studio-save`/
`studio-exit` 둘만 재고 그 둘은 11 안에 없다. 무대 세 자리는 근거를 실제
기하(`style={{left, top, width: layout.socket.w}}`)로 바꿔 등재했다.

**등록부는 허가 목록이 아니라 부채 목록이다.** 하드컷 등록부의 규율을 승계해
넷을 명시했다: ① 등재는 검증을 통과한 자리만 ② 파일을 등재해도 그 파일이
면제되지 않는다(줄은 파일이 아니라 **수**를 등재한다) ③ 근거가 사라지면 줄도
죽는다 ④ 등재가 도피처가 되면 이 라운드는 실패다.

**게이트**: 두 기준선 모두 **리터럴**이다 — 어제 하드컷 래칫에서
`BASELINE = REGISTRY.length` 라 「늘지 않는다」가 원리적으로 실패 불가였던
결함을 물려받지 않는다. 프로브 7종이 전부 적색을 냈다: 미등재 파일에 손
컨트롤 +1 · **등재된** 파일에 +1(면제 아님을 증명) · 등록부에서 줄 제거 ·
실측보다 많이 등재 · 근거 문자열 소실 · 기준선을 등록부에서 파생 · 스캔 경로
공집합. 크롬 토큰 검사에는 음성 대조군을 뒀다(`--control-h-md` 는 32px 하나라
반드시 거절 — 아니면 「크롬 토큰이라 못 옮긴다」가 무제한 면제가 된다).

**진 대안 ① (디렉터리 단위 등재)**: `atlas-git-panel/**` 처럼 경로로
등재하면 파일명 자동 수집의 편리함이 남는다. 진 이유: 그 순간 등록부가
**허가 목록**이 된다 — 등재된 디렉터리 안에서는 손 컨트롤이 무제한 늘어도
게이트가 침묵한다. 실제로 그 디렉터리 안의 `CommitDetail` 3건이 값 층의
구멍이었고 경로 등재는 그 셋을 조용히 삼켰을 것이다. **이 관점이 이겼다는
관측이 될 반증**: 파일별 수를 손으로 유지하는 비용이 실제로 라운드를
막는 것 — 등재된 파일에 정당한 새 자리가 생길 때마다 diff 가 나는데, 그
diff 가 「왜」를 안 적고 기계적으로 올라가기 시작하면 경로 등재가 옳았다.

**진 대안 ② (검증 안 한 후보까지 지금 등재)**: `SearchPalette` ·
`GlobalSearch` · `ShortcutSheet` · `DocsHeaderTile` · `AppNavRail` 도 같은
크롬 토큰 주장을 할 만하다. 진 이유: 규율 1 — 열어 보고 검증한 자리만
등재한다. 안 한 것이 부채 쪽에 있는 것은 **안전한 방향**의 오차이고, 부채
90 이 그만큼 낙관적이지 않다는 뜻이다. 다음 등재 라운드의 입력으로 적어 뒀다.

**서명 (accountable)**: 분류 라운드 (소유자 서명 대기)
**상태**: 유효

---

## 2026-08-04 — 공회전하던 게이트 셋을 소스 전수 위에 다시 세운다

**결정**: 하드컷 래칫의 입력을 **손으로 쓴 등록부에서 `src/`·`app/` 전수 스캔으로**
바꾼다. 컨트롤 래칫에 **앵커(`<Link>`·`<a>`)를 세 번째 수로** 신설한다. 접근성
래칫에 **열린 표면을 재는 두 번째 스펙**을 붙인다.

**현상**: 게이트 여덟 중 셋이 결함을 주입해도 무반응이었다(`/design-system-audit`,
PR #904). 이 라운드가 그 셋을 실측으로 재확인했다 — **결함 둘을 동시에 주입한
채 구 게이트 두 벌을 돌렸더니 20 passed**, 완전한 침묵이었다. 같은 결함에 새
게이트는 3 failed 다.

**문제**: 값이 아니라 **게이트 설계**였다. 셋 다 「탐지기 함수는 살아 있는데
아무도 그 함수에 제품을 먹이지 않는」 형태였다. ① 하드컷 등록부가 비어 「표면 0」이
제품이 아니라 **빈 목록에 대한 참**이었다 ② 컨트롤 래칫이 `<button>` 만 세서
손으로 규격을 쓴 앵커 **109곳**이 시야 밖이었다 ③ 접근성 래칫이 첫 화면만 재서
눌러야 나타나는 표면 **19개**를 한 번도 안 봤다.

### 전수 — 켜기 전에 셌다

| 게이트 | 전수 | 기준선 | 성격 |
|---|---:|---:|---|
| 하드컷 | **13** (인라인 11 · 명명 2) | 13 | 인라인 11은 구 게이트에게 **통째로 안 보이던 부류** |
| 앵커 컨트롤 | **109** (`<Link>` 85 · `<a>` 24) | 109 | 버튼 부채 85 와 **가르는 것**이 이 결정의 절반 |
| 열린 표면 접근성 | 위반 **7** / 표면 5 측정 | contrast 5 · target-size 2 | 닫힌 화면엔 존재하지도 않던 원소들 |
| 손글씨 accent×틴트 | **24 → 23** | 23 | 감사가 지목한 1건(`StepRow`, 4.27→8.39:1)만 갚음 |

**「전수로 바꾼다」가 곧 정답은 아니었다 — 오탐부터 쟀다.** 구 등록부 머리말이
경고한 그대로 접미사 계수는 과다 계상이다. 판별식 셋을 넣어 내렸다: **호출
자리만 본다**(「항상 렌더된다」가 구조적으로 제외) · **대안 가지가 무언가
그리면 «교체»**(「부모가 이미 애니메이션한다」 3자리가 기계적으로 걸러진다) ·
**못 눌리는 루트는 표면이 아니다**(호버 판독물 · 투어 앵커). 오탐률 약 40% →
11건 중 1건.

**오탐 넷이 탐지기 자신의 결함이었다**: 배럴을 실물 파일로 읽음(표면 5종) ·
기제 목록에 Radix 퇴장이 없음(`Tooltip`) · 호버 카드 2 · 투어 앵커. 반대로
**거짓 음성도 하나** 나왔다 — `DeltaPreviewModal` 이 「교체」로 오분류돼 통째로
빠져 있었고, 원인은 여는 태그를 중괄호 깊이 없이 끊어 `onSave={() => {` 의
`=>` 를 태그 끝으로 읽은 것이다. **컨트롤 래칫 머리말이 이미 적어 둔 함정을
그대로 다시 밟았다.**

### 왜 앵커를 버튼 부채에 더하지 않았나

더하면 194 가 되고, 그 수가 내려갈 때 **무엇이 옮겨졌는지 알 수 없다** — 이
파일이 2026-08-04 오전에 「113 한 덩어리」를 가른 그 이유와 같다. 작업 단위도
다르다: `<Link>` 는 `cn` 병합이 필수고(raw 변형은 base 의 `border-transparent`
가 소스 순서로 이긴다) 외부 앵커는 `↗` 표식 규칙까지 걸린다. 반대로 `<Link>` 와
`<a>` 는 **가르지 않았다** — 처방이 같은 것을 두 칸에 두면 눈금이 아니라 장부질이다.

**감사 보고의 77 이 아니라 실측 85 를 썼다.** 남이 센 수를 기준선에 적으면 첫
실행이 빨개지고, 그때 사람은 게이트가 아니라 수를 고친다.

### 색 판정은 하지 않았다

열린 표면이 낸 7건 중 5건이 잉크 램프 판정(`#7170ff` 가 틴트 위 3.9~4.1:1,
`#82828a` 가 오버레이 위 4.14~4.38:1)이고 2건은 겹침 레이아웃이다. **전부
「체계」의 소집 사안이라 값을 안 건드리고 래칫으로만 등재했다.** `#82828a` 3건은
`a11y-ratchet` 머리말이 이미 산문으로 적어 둔 한계이고, 이 게이트가 그것을
**처음으로 실제 화면에서 숫자로** 확인했다.

**게이트**: 기준선 넷이 전부 **리터럴**이다. 프로브가 전부 적색을 냈다 — 소유자가
심었던 인라인 오버레이 · 명명 표면 · 손 앵커 · 트리거가 표면을 못 여는 상태 ·
기준선 부풀리기. 반대 방향 프로브도 상주한다: **내용 교체 픽스처가 세어지면**
그 판별식이 죽은 것이고, 그때 게이트는 고칠 것 없는 자리에 나가는 길을 붙이라고
요구하기 시작한다.

**진 대안 ① (하드컷 0 을 요구)**: 13을 이 PR 에서 다 갚고 0 을 못박는다. 진
이유: 열세 자리가 각각 자기 렌더 게이트의 모델을 퇴장 창 동안 붙들어야 해서
(`useSurfaceSwap`/`useHeldValue` 가 자리마다 다르다) 기계적이지 않고, 픽셀이
바뀌므로 디자인 게이트의 일이다. **반증**: 13이 두 라운드 넘게 안 내려가면
래칫이 부채를 정당화하는 장치가 된 것이고, 그때는 0 을 못박고 빨간 채로 둔다.

**진 대안 ② (인라인 오버레이도 등록부로)**: 이름 없는 `<div>` 는 등록부에
줄로 적기 어려우니 명명 표면만 세자. 진 이유: **인라인이 11로 다수다.** 그쪽을
빼면 이 앱의 하드컷 대부분이 다시 안 보이고, 소유자가 심은 프로브가 정확히 그
모양이었다. **반증**: 인라인 탐지기의 오탐이 라운드마다 사람을 부르면 —
경계 사례(`HomePage:4619` 「Local」 표시 pill)가 그 후보다 — 그때 부류를 가른다.

**서명 (accountable)**: 게이트 라운드 (소유자 서명 대기)
## 2026-08-04 — 오버레이 반경을 `sheet`(18) 한 단으로 등재하고, 행간 이름 유틸리티를 래칫에 넣는다

**현상** (`/design-audit` PR #906, 1512px 실측): 오버레이 반경이 **여섯 값**
(설정 팝오버 12 · 문서 팔레트/퀵드로어 9 · 단축키/볼트 안내/검색 팔레트 22 ·
공방 진입 카드 16 · 퀵액션/제스처 힌트 18 · 드로어 히어로 20)이었고, 소스에는
모바일 `rounded-t-[28px]` 까지 있었다. 어제 드로어 한 열에서 없앤 병(16/18/20
이 세 가지 일을 하며 2px 차로 위계 실종)이 한 층 위에 그대로 있었다. 출처는
컴포넌트 토큰 2개 + eslint-disable 4개(하나는 「등재 대기」인 채 등재가 오지
않음) + 방향 접미 lint 사각. 그리고 세 램프 중 **행간만 게이트가 없었다** —
`leading-relaxed` 71 등 이름 유틸리티 208곳이 어떤 룰도 안 거쳤다.

**결정 ①**: 오버레이 단은 별도 어휘를 가질 자격이 있다 — 단, **한 단**이다.
`--radius-sheet: 18px` 등재(`rounded-sheet`, `RADIUS_RAMP_STEPS` 동기).
사정거리는 「떠서 아래를 가리는 큰 일시 표면」: 시트·팔레트·플로팅 힌트·모바일
바텀시트. 앵커 팝오버/메뉴는 card/panel, 소형 확인 다이얼로그는 panel,
**인플로우 콘텐츠는 크기와 무관하게 sheet 금지**. 18 인 이유: 현행 최빈값 +
램프 공비 연장(4→6→9→12→18, ≈1.5×) + panel 과 6px 차로 단이 읽힌다.
픽셀 이동: 22→18 넷(단축키·볼트 안내·에이전트 연결·검색 팔레트), 16→18 하나
(전역 검색, 보더 0.10→0.08 동반), 28→18 하나(드로어 모바일 상단), 20→12
(드로어 히어로 — **어제의 「히어로 20 = 시트 단 명시 예외」를 뒤집는다**,
인플로우 콘텐츠라 시트 자격이 없다), 16→12(공방 진입 카드 — 「등재 대기」의
답은 새 스텝이 아니라 panel), 7→6(INDEX 탭, 방향 사각 잔존물), 6→6(HubRail
`rounded-r-md`, 픽셀 0). 구 토큰 2개 폐지. eslint radius 셀렉터를 방향 접미
(`rounded-t-[Npx]`·`rounded-r-md`)까지 확장 — 켜기 전 전수 3건, 전부 같은
변경에서 치환, disable 0.

**결정 ②**: 행간 이름 유틸리티는 한 PR 로 못 치우는 규모(208곳: relaxed 71 ·
숫자꼴 103 · snug 17 · none 9 · tight 8)이고 치환이 기계적이지 않다(정본
「행간은 크기의 짝」— relaxed ×1.625 를 짝 스텝으로 옮기면 픽셀이 움직인다).
그래서 켜지 않고 **per-family 래칫**(`named-offramp-utility-ratchet`)에 실측
기준선으로 등재 — 재유입은 오늘부터 0, 상환은 per-site 판정 라운드로. 프로브:
위반 심기 → 적색 확인 → 제거.

**하지 않은 것**: ③ `border-white/35` 1건(첫 실행 kbd 캡 — 인디고 면 위 유일
raw 색 유틸리티. 소비처 1이라 토큰 신설 반려, raw `white/NN` 금지 룰과 함께
후속 판정) ④ 단축키 시트 17행 중 2행 40px(치수 규칙성 — 클램프는 의미 절단,
2행 예약은 15행이 대가를 내므로 반려. 처방은 문안 축약, i18n 소관 후속)
⑤ 공방 유산 arbitrary radius(StudioCompass 10/13/14/16, ~20건) · ProjectCard
16/18 · ProjectDetailPage 11px — lint 미커버 경로의 유산이라 별도 per-site
라운드(전수는 이 항목이 census 다).

**진 대안 ① (전부 panel 12 로 수렴, 새 단 0)**: 어휘 최소화. 진 이유: 어제의
드로어 판정이 「시트 단과 콘텐츠 단이 갈린다」를 근거로 16→12 를 확정했다 —
시트 단을 지우면 그 판정의 근거가 소급 소멸하고, 45rem 시트와 365px 콘텐츠
상자가 같은 반경이 된다(반복 다섯 손이 독립적으로 더 큰 값을 고른 실재 수요).
**반증 관측**: sheet 소비처가 늘지 않고 disable/우회가 다시 쌓이면 단이 아니라
취향이었던 것이다.

**진 대안 ② (22 유지 — 픽셀 무이동)**: 최다 픽셀 보존(22 가 3표면). 진 이유:
22 는 램프 공비 밖(12→22 는 1.83×)이고, 18 이 최빈값이며, 등재 당일에도 이미
18 소비처(퀵액션·제스처 힌트·ProjectCard md)가 더 많았다. **반증 관측**: 22→18
축소를 소유자가 화면에서 「싸 보인다」로 판정하면 값만 22 로 올리면 된다 —
단은 유지된다.

**서명 (accountable)**: 체계석 (design-system), 소유자 서명 대기
**상태**: 유효
