---
name: po-council
description: Run the Atlas PO Council — five standing product owners (po-evidence · po-craft · po-steward · po-wedge · po-leverage) independently judge a product decision, then rebut each other, then one accountable decision is recorded with the dissent preserved. Use before expensive or hard-to-reverse product work — a new or removed surface/route, a public MCP/CLI contract change, direction/positioning/marketing copy, a first public release — or whenever a solo PO pass scores under 18/24 on the PO Quality Rubric. Skip for mechanical work (typos, dependency bumps, CI plumbing, test fixtures) — those are exempt from the PO gate entirely.
---

# /po-council — five product owners, one accountable decision

## Why this exists

`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` has always specified a 13-lens PO
Council, a 0–24 quality rubric with an 18+ threshold, and a five-level Chief PO
ladder. **None of it was ever enacted.** On 2026-07-27 a PO pass in this repo
wrote "없음" in the two rubric rows the document declares fatal (Ontology value,
Agent value), returned `Build and verify` anyway, and shipped. Nothing stopped
it, because the lenses were prose and prose does not run.

This skill is the enactment. The thirteen lenses are not discarded — they are
distributed across five agents that can actually be called, disagree, and sign
their scores.

> The repo's own recurring lesson: **문서에만 있는 규격은 지켜지지 않는다.**
> A council that cannot be invoked is a council that does not exist.

## The five, and what each one owns

**먼저 이 문서에서 반복해서 쓰는 말 다섯 개.** 뜻은 끝까지 바뀌지 않는다.

- **자리(seat)** — 카운슬에 앉는 에이전트 하나. 아래 표의 다섯 줄이 다섯 자리다.
- **렌즈(lens)** — `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` 가 정해 둔 심사 관점
  하나. 열세 개가 있고, 다섯 자리가 나눠 맡는다.
- **루브릭(rubric)** — 여섯 항목짜리 채점표. 항목마다 0점 · 2점 · 4점이 무슨
  뜻인지가 같은 문서에 적혀 있고, 합계는 24점 만점이다.
- **서명(sign)** — 한 항목에 점수를 매길 수 있는 자리는 딱 하나이고, 그 자리가
  자기 이름을 걸고 그 점수를 적는다는 뜻이다. 나머지 넷은 그 항목에 점수를 못 준다.
- **appetite** — "이 문제에 얼마까지 쓸 가치가 있나"로 미리 정해 두는 예산.
  "얼마나 걸릴까"(추정)가 아니라 **상한**이다.

| Agent | 이름 | PO OS lenses carried | Rubric row they sign |
|---|---|---|---|
| `po-evidence` | 근거 | Customer-Problem Editor · Discovery Lead · Outcome Guard | Problem insight · User moment |
| `po-craft` | 결 | Craft Steward · Experience Mapper | Verification |
| `po-steward` | 지킴이 | Ontology Steward · Local-First Guardian | Ontology value · Agent value |
| `po-wedge` | 해자 | Monopoly Strategist · DHM Strategist · First-Principles Skeptic | Differentiation |
| `po-leverage` | 지렛대 | Prioritization Analyst · Shaper | (appetite + slice boundary) |

The thirteenth lens — **Accountable Value Owner** — is deliberately not an
agent. It is the human owner. The
council does not vote and does not own the decision; it stress-tests it. One
person decides and signs.

**Every rubric row has exactly one owner.** That is the whole point: a row can
no longer be self-certified past by the person who wants to build.

### 자리 브리프는 어디 있고, 어떻게 부르나

**자리 브리프는 이 파일 기준 `../../agents/po-*.md` 다섯 개다.**

이 스킬 파일은 두 곳에 한 벌씩, 바이트까지 똑같이 존재한다. 위 상대 경로는
**어느 쪽에서 읽어도 그쪽 폴더의 자리 브리프를 가리킨다** — 그래서 도구 이름을
적을 필요가 없고, 적으면 안 된다. `pnpm agents:check` 의 `agent-copy` 검사가 두
벌이 같은지 보고, 한쪽에만 있는 파일도 실패로 잡는다. **자리를 새로 만들면 양쪽에
같이 넣는다. 셋째 사본은 만들지 않는다** — 사본이 셋이면 어긋난 사본이 생기는
쪽이 정상이 되어 버린다.

**부르는 법은 네 능력이 정한다:**

- **서브에이전트를 병렬로 띄울 수 있으면** 1라운드를 **한 메시지에서 다섯 동시에**
  띄운다. 동시에 띄우라는 이유는 하나다 — 다섯이 서로의 판정을 못 봐야 한다.
- **못 띄우면** 다섯 파일을 **직접 열어** 각 브리프를 그대로 따르고 **하나씩 차례로**
  수행한다. 차례로 하면 **1라운드 독립성을 잃는다** — 뒤에 하는 자리가 앞 자리의
  결론을 이미 본 채로 판정하게 된다. 그 사실을 **숨기지 말고 평결에 적는다**:
  *"순차 수행 — 1라운드 독립성 없음"*. 안 적으면 읽는 사람이 이 결과를 동시에
  띄워서 얻은 결과와 구별할 수 없다.

## 늘 부딪히는 두 자리 — 마찰은 우연이 아니라 일부러 넣은 것이다

항목마다 서명자가 하나라는 규칙은 **빠뜨림은 막았지만, 다섯이 서로 부딪힐 일도
같이 없앴다.** 각자 자기 항목만 채점하면 서로 의견이 겹칠 이유가 없어서다.
실제로 그렇게 나왔다 — 결정 원장 7회 · 자리 판정 35건에서 **두 자리씩 짝지어
봤을 때 판정이 같았던 비율이 평균 65.7%**(아무렇게나 찍어도 36.8%),
**7회 중 2회는 다섯이 전원 같은 판정**이었다. Hollenbeck et al.(De Dreu &
Weingart 2003 인용): *"권고가 **서로 무관하거나 반대 방향인** 구성원이 팀으로서
더 가치 있다 — 서로 비슷한(그래서 겹치는) 구성원보다."*

그래서 **어느 두 자리가 왜 부딪히는지를 여기 미리 적어 둔다.** 적어 두지 않으면
소집할 때마다 새로 알아내야 하고, 못 알아채면 한쪽 주장이 그냥 조용히 통과한다.
아래 표의 「갈리는 지점」은 그 둘이 무엇을 놓고 반대편에 서는지다.

| 두 자리 | 갈리는 지점 | 왜 정의상 반대편인가 |
|---|---|---|
| **지킴이 ↔ 해자** | 더하기 vs 빼기 | 지킴이는 *"타입 있는 사실을 숨기고 줄글로 대체하면 온톨로지 가치는 0보다 나쁘다"*고 보고, 해자는 사람이 도구를 원하게 되는 첫 경로로 *"시원함 — 재료는 **빼기**"*를 꼽는다. 화면에서 뭔가를 줄이자는 제안은 **항상** 이 둘 사이를 지난다 |
| **근거 ↔ 결** | 관측 vs 취향 | 근거는 관측되지 않은 문제 정의를 통과시키지 않고, 결은 *"되돌리기 싸고 실패해도 손해가 적으면 취향만으로도 충분한 근거"*라고 주장할 책임이 있다. 둘 다 자기 브리프에 상대를 대놓고 적어 뒀다 |
| **지렛대 ↔ 나머지 넷** | 지금 vs 옳음 | 넷이 "이게 옳다"로 모여도 지렛대는 *"그래서 지금 할 일인가"*를 따로 묻는다. 넷과 답이 똑같으면 그 자리는 일을 안 한 것이다 |

**소집자는 1라운드 브리프에 이 표를 싣지 않는다** — 실으면 다섯이 표에 적힌
역할을 연기한다(Nemeth 2001: 시켜서 하는 반대는 처음 생각을 **더 굳히는** 쪽으로
작동한다). 대신 **2라운드에서 갈린 두 자리가 위 표에 있으면 그 「갈리는 지점」의
이름을 붙여** 평결에 적는다. 구조적으로 갈린 것인지 우연인지가 그때 갈린다.

## 서로의 결과를 쓰게 만든다 — 다섯이 따로 일한 다섯 명이 되지 않게

Hackman 이 말한 진짜 팀의 조건은 경계가 있는 것 + **서로에게 기대는 것**이다.
1라운드에서 다섯이 서로를 전혀 안 보는 것은 설계상 옳다(서로 영향받지 않은
기준선을 얻는다). 그러나 그 뒤로도 **한 자리의 판정이 다른 자리의 판정을 전혀
쓰지 않으면** 이건 팀이 아니라 따로 일한 다섯 명이다. 최소 둘은 묶는다:

- **지렛대가 정한 appetite 는 결이 매긴 검증 비용을 인용한다.** "반나절"이라고
  쓰려면 그 반나절 안에 **무엇으로 증명할지**가 결의 판정과 맞아야 한다. 실물을
  열어봐야 하는 변경인데 실물 확인 시간을 안 넣은 appetite 는 아직 덜 된 것이다.
- **해자가 「대신 뺄 것」을 댈 때는 지킴이의 판정을 인용한다.** 무엇을 빼자고 할 때
  그게 타입 있는 사실을 가리는지 아닌지는 **지킴이가 서명하는 항목**이다. 인용
  없이 빼자고 하면 그건 제안이 아니라 취향이다.

이 둘은 **2라운드에서 확인한다**(1라운드에서는 서로를 못 본다). 인용이 없으면
소집자가 평결에 *"의존 미이행"* 이라고 적는다 — 벌이 아니라 **다음 소집이 읽을
기록**이다.

## When the council runs

**Required** when the decision is expensive or hard to reverse:

- a new user-facing surface/route, or removing one
- a public contract change — MCP tool signatures, CLI commands, vault schema
- product direction, positioning, or the words a stranger reads first
- a first public release, or anything that spends a one-shot reputational resource
- a solo PO pass that scores **under 18/24**, or has a **0** in problem insight,
  ontology value, agent value, or verification
- the owner asks for it

**Not required** for ordinary product work — write the solo PO pass, self-score,
and proceed if it clears 18+ with no fatal zero.

**Never** for mechanical work: typos, dependency bumps, CI plumbing, test
fixtures, lint config. These are already exempt from the PO gate; convening a
council on them is the process theater the PO OS warns about.

## Protocol

### Round 1 — independent positions (parallel, no cross-talk)

Launch all five agents **in one message** so they run concurrently and cannot
anchor on each other. Give every agent the same brief:

- the decision, stated as the requester stated it (do not pre-translate it —
  translating a solution-shaped request into a problem is `po-wedge`'s job)
- the repo paths that ground it
- any prior PO pass being critiqued, quoted verbatim
- explicit permission to research the web and to run read-only commands

Each returns its own structured verdict and its own rubric scores.

### Round 2 — rebuttal (one round, no more)

Send every agent the other four positions. Each must:

1. restate the **strongest** opposing argument in its own words — a weak
   restatement is a foul,
2. concede or refute it,
3. and **change its verdict if it conceded.** A verdict that never moves is an
   alibi, not a review.

One round only. A second round produces convergence theater, not new
information.

### 라운드 1 — 리터럴 실행 템플릿

**부르기로 한 자리 전부를 한 메시지에서 동시에 띄운다**(서로의 판정을 못 보게).
아래 다섯 칸만 채운다. 문장을 새로 짓지 않는다 — 그때그때 지어 쓴 브리프 때문에
같은 조건의 소집이 두 번 다르게 돌아간다.

```
[결정] <요청자의 표현 그대로. 문제로 미리 번역하지 않는다 — 그 번역은 「해자」의 일이다>
[근거 경로] <이 결정이 닿는 파일·문서·라우트>
[기존 패스] <심사 대상 PO 패스를 원문 그대로. 없으면 "없음">
[열어야 할 실물] <URL · 명령 · vault 경로. 「결」은 빌드를 열고, 「지킴이」는 vault 를
                  조회하고, 「해자」는 경쟁 지형을 확인하고, 「지렛대」는 하류를 실측한다>
[출력] 네 파일의 출력 형식 그대로. 질의는 최대 1건.
```

### 라운드 2 — 리터럴 재개 템플릿

**새로 띄우지 않는다.** 1라운드에 띄운 그 에이전트에게 `SendMessage` 로 이어
말한다 — 앞 대화가 그대로 남아 있어 다시 브리핑할 필요가 없고, 이 절차에서 가장
크게 아끼는 지점이 여기다. 본문에는 **평결 블록**(각 자리가 정해진 형식으로 내놓은
판정 한 덩어리)만 싣는다. 오간 대화를 통째로 옮기지 않는다.

**평결 블록을 나열하는 순서를 매번 바꾼다.** 순서만 바꿔도 어느 쪽이 이기는지가
뒤집힌다 — Wang et al.(arXiv:2305.17926) 실측 80건 중 66건. 다섯 모두에게 같은
순서로 보내면, 다섯이 다 같은 자리에 놓인 의견을 유리하게 본다. 심사가 아니라
같은 치우침을 다섯 번 반복하는 것이다.

```
[다른 자리들의 평결 블록 — 매번 다른 순서]
[너에게 온 질의 — 있으면]
규칙: 가장 강한 반대 논점을 네 말로 재진술하라. 약하게 요약한 뒤 이기는 것은
반칙이다. 수용하거나 반박하라. 1회로 끝난다.

**판정을 바꾸려면 「무엇을 새로 알았는가」를 한 줄로 적어라.** 그 줄을 못
쓰면 판정을 **유지**한다 — 그건 설득당한 것이지 배운 것이 아니다.

**그리고 네 판정에 반대되는 최강 논거를 네가 직접 하나 만들어라.** 아무도
안 냈어도 만든다. 못 만들면 그렇게 적어라.

다른 자리 중 **네가 옳다고 보는 지점 하나**를 이름으로 대라 — 1라운드에서는
서로를 못 봤으므로 이 칸은 여기서만 채울 수 있다.
출력: 갱신된 판정 1줄 + 재진술 + 수용/반박 + 자기반박 + (있으면) 질의 응답.
15줄 이하.
```

**왜 「바꿔라」가 아니라 「무엇을 새로 알았는지 적어라」인가.** 예전 규칙은
*"수용했으면 판정을 바꿔라"* 였다. 그러면 판정을 바꾼 것 자체가 잘한 일이 되고,
남의 말에 그냥 따라간 자리가 상을 받는다. FlipFlop(arXiv:2311.08596, 10모델×7과업):
반박당하면 평균 **46%가 답을 뒤집고 정확도가 17%p 떨어진다.**
Hao et al.(arXiv:2606.00820): 남을 따라가서 뒤집은 답의 **57~77%가 정답에서
오답으로** 간 것이었고, **근거가 하나도 없는 반박에도** 버티던 에이전트의
20~39%가 오답을 받아들였다 — 근거가 아니라 밀어붙이는 태도가 결과를 갈랐다.

**자기반박을 요구하면 무엇을 잃는지 미리 적어 둔다.** 모든 자리의 답이 길어지고,
*"새로 안 것"* 을 못 대면 판정을 유지하므로 **2라운드에서 아무것도 안 바뀌는
회차가 늘어난다.** 그건 고장이 아니라 **사실이 그대로 드러난 것**이다 — 예전에는
그런 회차에도 판정이 움직였고, 그게 배워서 바뀐 건지 그냥 따라간 건지 우리가
구별할 수 없었다.

### Round 3 — the accountable decision

The caller (not the council) records the decision. Rules:

- **Never average the opinions into a bigger feature.** This is already the PO
  OS's rule and it is the most common failure mode of committees. The decision
  must be one of the proposed options **or something smaller** — never the
  union of them.
- **When the lenses disagree, choose the smallest slice that best improves the
  ontology-to-agent workflow.**
- **Record the dissent with a falsifier.** The strongest losing argument is
  written down along with what we would observe if it turns out to be right.
  This is what makes the council worth more than a checklist: a dated,
  falsifiable disagreement you can return to.

## 결정 원장 — 소집 전에 읽고, 끝나면 남긴다

**결정 원장은 `docs/DECISIONS.md` 파일 하나다** — 지금까지 내린 결정과, 그때
졌던 반대 의견을 시간순으로 쌓아 둔 문서. 이 스킬은 그 파일을 읽기도 하고 쓰기도
한다:

**소집 전 (읽기)** — 같은 화면 · 같은 질문에 대해 **전에 내린 결정이 있는지 먼저
본다.** 있으면 1라운드 브리프에 그 기록을 원문 그대로 싣고, 각 자리는 판정에서
그것을 ① 여전히 유효하다고 인용하거나 ② 이유를 대고 뒤집는다.
**말없이 다시 결정하는 것**이 이 파일이 막으려는 일이다.

**반증 조건 점검** — 반증 조건이란, 그때 진 쪽이 사실은 옳았다면 나중에 무엇이
보일지를 미리 적어 둔 문장이다. 전에 적어 둔 그 문장이 **이미 실제로 보였는지**
확인한다. 보였으면 그때 진 쪽이 이긴 것이고, 이번 소집은 그 사실에서 시작한다.

**소집 후 (쓰기)** — 평결 블록을 `docs/DECISIONS.md` 최상단에 **덧붙인다**.
지난 기록은 고치지 않는다 — 판단이 바뀌었으면 새 기록을 쓰고 옛 기록을
`뒤집힘 (→ 링크)` 으로 표시한다. 기록 없는 소집은 **끝나지 않은 소집**이다.

## 카운슬 간 질의 (PO ↔ 디자인)

PO 카운슬과 디자인 카운슬은 서로 말을 섞지 않는 사이가 아니다. 다만 주고받을 수
있는 것은 **정해진 형식의 질문 하나**뿐이다 — 회의를 여는 게 아니다.

각 자리는 1라운드 의견 끝에 **질의 최대 1건**을 붙일 수 있다. 형식 고정:

> **질의 → [상대 자리]**
> **질문**: [한 문장, 답할 수 있는 형태]
> **걸린 판정**: [답에 따라 내 의견의 어느 부분이 뒤집히는지]
> **무응답 시 가정**: [답이 없으면 무엇을 전제하고 진행하는지]

걸린 판정이 없는 질의는 잡담이다 — 버려진다.

**라우팅** (chief 또는 소집자가 한다):
- 상대 카운슬이 같은 패스에 소집돼 있으면 → 2라운드 메시지에 질의를 동봉하고
  답(≤10줄)을 질의자의 2라운드 메시지에 붙인다. **왕복 0회 추가.**
- 소집돼 있지 않으면 → **지목된 자리 하나만** 최소 브리프로 호출한다. 카운슬
  전체를 부르지 않는다.

**종료**: 답은 1회, 다시 묻지 않는다. 답을 받아들여 판정을 고치거나, 받아들이지
않으면 **기록된 반대 + 반증 조건**으로 남긴다. 어느 쪽이든 거기서 끝난다.

**두 카운슬이 다 필요한 결정**(사용자가 보는 화면을 새로 만들거나 없애는 일):
질의 한 건으로 때우지 않는다. **PO 카운슬을 먼저** 돌리고, 그 평결 블록을 디자인
카운슬의 1라운드 브리프에 원문 그대로 넣는다. 차례로 도는 것이지 한꺼번에 합치는
게 아니다 — 한 세션에 섞으면 양쪽이 서로의 논의를 미리 보게 되어, 서로 모른 채
따로 판정한다는 조건이 깨진다.

## 사람에게 — 소유자에게 가는 답은 **처음부터 끝까지** 평문이다

카운슬에서 쓰는 말들은 **다음 에이전트와 결정 원장**을 위한 것이지 소유자를 위한
것이 아니다. 그런데 지금까지 평결 블록을 그대로 소유자에게 보내 왔다.

2026-07-29 에 실제로 이런 일이 있었다: 발자국 커스터마이즈 평결을 그대로 옮겨
보냈더니 소유자가 되물었다 — *"뭔 서명?"*. 그 순간 그 요약은 요약이 아니라
**읽으려면 먼저 뜻을 배워야 하는 문서 한 장**이었다. 읽는 사람이 용어부터
익혀야 하는 보고는 보고가 아니다.

**2026-08-03 — 이 규칙은 이미 적혀 있었는데 지켜지지 않았다.** 소집자는 세 줄
요약을 맨 앞에 정확히 썼고, **그 바로 아래에 평결 블록을 통째로 붙였다.** 소유자의
답은 *"뭔말이야? 이해 가능하게 대답해줘야지"* 였고, 더 쉽게 다시 쓴 뒤에도
*"더 쉽게 설명해줘"* 가 한 번 더 왔다. 세 줄이 요약 노릇을 한 게 아니라, 회의록을
그대로 붙여 놓고 그 앞에 세 줄만 얹은 꼴이었다. 구멍은 예전 제목 「평결 블록보다
**먼저**」에 있었다 — *먼저 쓰라*는 말은 **뒤에 붙여도 된다**는 말로 읽힌다.
그래서 셋으로 나눠 못 박는다.

**① 평결 블록이 갈 곳은 대화창이 아니다.** 그것은 `docs/DECISIONS.md` · PR 본문 ·
플랜 파일로 간다. **소유자에게 보내는 답에는 붙이지 않는다.** 필요하면 소유자가
달라고 한다 — 달라고 하지도 않았는데 붙인 평결 블록은 보고가 아니라 회의록을
그대로 옮긴 것이다.

**② 금지어는 답 전체에 적용된다.** 맨 앞 세 줄에만이 아니다. 아래 목록의 단어가
소유자에게 가는 답 **어디에든** 나오면 그 답은 아직 번역되지 않은 것이다.

**③ 되물음은 실패 신호다.** *"뭔말이야"* · *"더 쉽게"* · *"그게 무슨 뜻이야"* 가
오면 **앞에 요약을 한 겹 더 얹지 말고 처음부터 다시 쓴다.** 겹쳐 쓰는 것은 같은
문서를 두 번 읽게 만드는 것이다.

그래서 모든 카운슬 산출물은 이 절로 **시작하고, 소유자에게 가는 답은 여기서
끝난다**:

```md
### 먼저 — 세 줄

- **정한 것**: <한 문장. 무엇이 어떻게 바뀌는가>
- **네 말과 다르게 한 것**: <있으면 한 줄씩 + 이유 한 문장. 없으면 "없음">
- **네가 할 일**: <대개 "없음 — 써 보고 거슬리면 말해줘". 진짜 필요할 때만 그것을 쓴다>
```

**세 줄로 부족하면 더 써도 된다 — 단 같은 말투로.** 길어서 못 알아들은 적은 없다.
어려운 말 때문이었다. 근거를 대야 하면 **숫자와 실물로** 댄다("연결 154개 중
152개가 그냥 계층이다"), 자리 이름과 점수로 대지 않는다. 비유가 정확하면 비유가
낫다.

**소유자에게 가는 답 어디에도 쓰지 않는 말** — 자리 이름(위계 · 체계 · 상호작용 ·
모션 · 도해 · 작업대 · 반응형 · 핸드오프 · 근거 · 결 · 지킴이 · 해자 · 지렛대) ·
루브릭 · 점수 · `N/24` · 판정 · 평결 · 소집 · 반증 조건 · 서명 · 슬라이스 ·
appetite · 트리거 · attention winner · 라운드.

그 말들이 **틀린 것은 아니다** — 결정 원장과 PR 본문에서는 정확히 그 단어들이어야
한다. 다만 그쪽 글을 읽는 사람은 이 절차를 직접 돌리는 쪽이다. 소유자에게 필요한
것은 셋뿐이다: 뭐가 바뀌나, 내가 말한 것과 뭐가 다른가, 내가 뭘 해야 하나.

**"네 말과 다르게 한 것" 은 생략할 수 없다.** 소유자가 시킨 것보다 좁게 했거나
넓게 했으면 그 줄이 반드시 있어야 한다. 그 줄 없이 범위를 줄이면 그건 줄인 게
아니라 **말없이 무시한 것**이고, 소유자는 나중에 화면을 보다가 알게 된다.

## Output — the Council Verdict block

**이것은 파일로 가는 산출물이다 — 소유자에게 보내는 답이 아니다** (위 절 ①).
Paste this into `docs/DECISIONS.md`, the PR body, or the plan file:

```md
## PO Council Verdict — <decision>

**Convened because**: <trigger from the required list>

| PO | 판정 | 소유 행 점수 |
|---|---|---|
| 근거 | … | Problem insight N · User moment N |
| 결 | … | Verification N |
| 지킴이 | … | Ontology value N · Agent value N |
| 해자 | … | Differentiation N |
| 지렛대 | … | appetite: … |

**Rubric total**: N/24 (threshold 18, fatal zeros: none / <row>)

**The decisive disagreement**: <where they actually split, in one paragraph.
Not a summary of all five — the one fork the decision turns on.>

**Decision (accountable: <name>)**: <one of the proposals, or smaller>

**Recorded dissent**: <strongest losing argument> — **falsifier**: <what we
would observe if the dissenter was right> — **revisit**: <date or trigger>

**Slice**: IN … · OUT … · appetite …
```

## Failure modes this protocol is designed to prevent

| Failure | Guard |
|---|---|
| Self-certifying past a fatal rubric zero | The row has a named owner who signs it |
| Five agents agreeing because they saw each other first | Round 1 runs in parallel with no cross-talk |
| Committee compromise producing a bigger feature | Decision must be one proposal or smaller, never a union |
| A "review" where nobody's mind changes | Rebuttal requires conceding to change the verdict |
| Blockers with no path forward | Every agent is required to name what to do instead |
| Convergence theater | Exactly one rebuttal round |
| Council convened on trivia | Explicit "never" list; mechanical work stays exempt |

## Notes for the caller

- **Isolate them if they will touch the working tree.** These agents have `Bash`, so "read-only" is an
  instruction and not a constraint — and concurrent agents share the working directory —
  a `git checkout` from one of them will move everyone. Prefer worktree
  isolation when running the council alongside active edits.
- **Give them the real thing, not the diff.** `po-craft` is required to open the
  built surface; `po-steward` is required to query the vault. A brief that only
  contains a patch will produce a review of a patch.
- **They cost real tokens.** Five agents with web research is not a routine
  gesture — that is exactly why the trigger list is narrow.
