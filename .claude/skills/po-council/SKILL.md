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

이 스킬은 두 벌로 존재하고 바이트 동일한데, 그 상대 경로는 **양쪽에서 각자의
트리로 풀린다** — 그래서 도구 이름을 적을 필요가 없고, 적으면 안 된다.
`pnpm agents:check` 의 `agent-copy` 가 두 벌을 바이트로 묶고 한쪽에만 있는 파일도
실패로 잡는다. **자리를 새로 만들면 양쪽 트리에 같이 넣는다. 셋째 사본은 만들지
않는다** — 사본이 셋이면 어긋나는 쪽이 기본값이 된다.

**부르는 법은 네 능력이 정한다:**

- **서브에이전트를 병렬로 띄울 수 있으면** 1라운드를 **한 메시지에서 다섯 동시에**
  띄운다. 이 프로토콜이 병렬을 요구하는 이유는 다섯이 서로를 못 봐야 하기 때문이다.
- **못 띄우면** 다섯 파일을 **직접 열어** 각 브리프를 그대로 따르고 **순차로**
  수행한다. 순차는 **1라운드 독립성을 잃는다** — 뒤 자리가 앞 자리의 결론을 이미 본
  상태에서 판정한다. 그 손실을 **숨기지 말고 평결 블록에 적는다**: *"순차 수행 —
  1라운드 독립성 없음"*. 적히지 않은 손실은 병렬로 얻은 결과와 구별되지 않는다.

## 상시 대립쌍 — 마찰은 우연이 아니라 설계다

행마다 서명자 하나라는 규칙은 **누락을 막았지만 마찰도 같이 막았다.** 영토를
나눠 주면 다섯은 서로를 만날 이유가 없다. 실측이 그 결과다 — 원장 7회 · 좌석
판정 35건에서 **평균 쌍별 일치율 65.7%**(우연 기대 36.8%), **7회 중 2회 만장일치**.
Hollenbeck et al.(De Dreu & Weingart 2003 인용): *"권고가 **비상관이거나 음의
상관**인 구성원이 단위로서 더 가치 있다 — 높은 양의 상관(따라서 중복)인 구성원보다."*

그래서 **어느 쌍이 왜 부딪히는지를 여기 명명한다.** 명명하지 않으면 갈릴 때마다
새로 발견되고, 발견되지 않으면 그냥 한쪽이 조용히 이긴다.

| 쌍 | 축 | 왜 정의상 반대편인가 |
|---|---|---|
| **지킴이 ↔ 해자** | 더하기 vs 빼기 | 지킴이는 *"타입 있는 사실을 숨기고 산문으로 대체하면 온톨로지 가치는 음수"*, 해자의 delight 첫 등록기는 *"시원함 — 재료는 **빼기**"*. 표면을 줄이자는 제안은 **항상** 이 둘 사이를 지난다 |
| **근거 ↔ 결** | 관측 vs 취향 | 근거는 관측 없는 문제 정의를 통과시키지 않고, 결은 *"되돌리기 싸고 실패 비용이 낮으면 취향이 충분한 근거"*라고 주장할 책임이 있다. 둘 다 자기 브리프에 상대를 명시적으로 적어 뒀다 |
| **지렛대 ↔ 나머지 넷** | 지금 vs 옳음 | 넷이 "이게 옳다"에 수렴해도 지렛대는 *"그래서 지금인가"*를 따로 묻는다. 넷과 일치하면 그 자리는 일을 안 한 것이다 |

**소집자는 1라운드 브리프에 이 표를 싣지 않는다** — 실으면 다섯이 자기 배역을
연기한다(Nemeth 2001: 할당된 반대는 초기 입장의 **인지적 보강**을 낳는다).
대신 **2라운드에서 갈린 쌍이 위 표에 있으면 그 축의 이름을 붙여** 평결에 적는다.
구조적 대립인지 우연인지가 그때 갈린다.

## 산출물 의존 — 다섯이 병렬 개인이 되지 않게

Hackman 의 real team 요건은 경계 + **상호의존**이다. 1라운드가 상호 참조 0인
것은 설계상 옳지만(오염되지 않은 기준선), 그 뒤로도 **좌석 간 산출물 의존이
0이면** 이건 팀이 아니라 병렬 개인 다섯이다. 최소 둘을 묶는다:

- **지렛대의 appetite 는 결의 Verification 비용을 인용한다.** "반나절"이라고
  쓰려면 그 반나절 안에 **무엇으로 증명할지**가 결의 판정과 맞아야 한다. 실물을
  열어야 하는 변경에 실물 검증 시간을 안 넣은 appetite 는 미완이다.
- **해자의 「대신 뺄 것」은 지킴이의 판정을 인용한다.** 무엇을 빼자고 할 때 그것이
  타입 있는 사실을 숨기는지는 **지킴이가 서명하는 행**이다. 인용 없이 빼자고 하면
  그건 제안이 아니라 취향이다.

두 의존은 **2라운드에서 확인한다**(1라운드는 서로를 못 본다). 인용이 없으면
소집자가 평결에 *"의존 미이행"* 으로 적는다 — 벌이 아니라 **다음 소집이 읽을
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

**선택한 자리 전부를 한 메시지에서 동시에 launch 한다** (병렬 · 상호 참조 없음).
아래 다섯 칸만 채운다. 문장을 새로 짓지 않는다 — 즉흥 브리프가 같은 소집을 두 번
다르게 만드는 원인이다.

```
[결정] <요청자의 표현 그대로. 문제로 미리 번역하지 않는다 — 그 번역은 「해자」의 일이다>
[근거 경로] <이 결정이 닿는 파일·문서·라우트>
[기존 패스] <심사 대상 PO 패스를 원문 그대로. 없으면 "없음">
[열어야 할 실물] <URL · 명령 · vault 경로. 「결」은 빌드를 열고, 「지킴이」는 vault 를
                  조회하고, 「해자」는 경쟁 지형을 확인하고, 「지렛대」는 하류를 실측한다>
[출력] 네 파일의 출력 형식 그대로. 질의는 최대 1건.
```

### 라운드 2 — 리터럴 재개 템플릿

**새로 launch 하지 않는다.** 라운드 1 에이전트에게 `SendMessage` 로 재개한다 —
컨텍스트가 남아 있어 다시 브리핑할 필요가 없고, 그게 이 프로토콜에서 가장 큰
비용 절감이다. 본문은 **평결 블록만** 싣는다(전사 금지):

**평결 블록의 제시 순서를 매번 바꾼다.** 순서만 바꿔도 승자가 뒤집힌다 —
Wang et al.(arXiv:2305.17926) 실측 80건 중 66건. 고정 순서로 다섯에게 같은
목록을 보내면 그건 심사가 아니라 위치 편향의 5중 반복이다.

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

**왜 「바꿔라」가 아니라 「무엇을 새로 알았는지 적어라」인가.** 종전 규칙은
*"수용했으면 판정을 바꿔라"* 였는데, 그건 **변경 자체를 미덕으로 만들어 순응을
보상한다.** FlipFlop(arXiv:2311.08596, 10모델×7과업): 도전받으면 평균 **46%가
답을 뒤집고 정확도가 17%p 떨어진다.** Hao et al.(arXiv:2606.00820): 동조로 인한
flip 의 **57~77%가 정답→오답**이고, **내용 없는 추론도** 저항하던 에이전트의
20~39%에서 오답 채택을 유발했다 — 말투가 논증을 이긴다.

**자기반박 항의 대가를 미리 안다.** 모든 자리의 출력이 길어지고, *"새로 안 것"*
을 못 대면 판정이 유지되므로 **2라운드가 아무것도 안 바꾸는 회차가 늘어난다.**
그건 결함이 아니라 **정직한 표시**다 — 종전엔 그 회차도 판정이 움직였고, 우리는
그게 학습인지 순응인지 구별할 수 없었다.

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

`docs/DECISIONS.md` 가 결정과 **그때 진 반대 의견**을 담는다. 이 스킬은 원장을
양쪽으로 쓴다:

**소집 전 (읽기)** — 같은 표면 · 같은 질문에 대한 **선행 결정이 있는지 먼저
본다.** 있으면 1라운드 브리프에 그 기록을 원문으로 싣고, 각 자리는 판정에서
그것을 ① 여전히 유효하다고 인용하거나 ② 명시적으로 뒤집는다(이유와 함께).
**조용히 다시 결정하는 것**이 원장이 막으려는 일이다.

**반증 조건 점검** — 선행 기록의 `반증 조건` 이 **이미 관측됐는지** 확인한다.
관측됐으면 그때 진 쪽이 이긴 것이고, 이번 소집은 그 사실에서 시작한다.

**소집 후 (쓰기)** — 평결 블록을 `docs/DECISIONS.md` 최상단에 **덧붙인다**.
지난 기록은 고치지 않는다 — 판단이 바뀌었으면 새 기록을 쓰고 옛 기록을
`뒤집힘 (→ 링크)` 으로 표시한다. 기록 없는 소집은 **끝나지 않은 소집**이다.

## 카운슬 간 질의 (PO ↔ 디자인)

두 카운슬은 침묵하는 사일로가 아니다. 단 소통은 **경계 있는 질의** 하나뿐이다 —
회의가 아니라 질문이다.

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

**종료**: 답은 1회, 재질문 없음. 수용해 판정을 갱신하거나, 수용하지 않으면
**기록된 반대 + 반증 조건**으로 남는다. 어느 쪽이든 거기서 끝난다.

**승격 — 양쪽이 다 필수인 결정**(새 표면 신설/제거): 질의로 때우지 않는다.
**PO 카운슬을 먼저** 돌리고 그 평결 블록을 디자인 카운슬 1라운드 브리프에 원문
그대로 넣는다. 순차이지 병합이 아니다 — 한 세션에 합치면 관점들이 서로의
컨텍스트를 오염시켜 병렬 독립성이 죽는다.

## 사람에게 — 소유자에게 가는 답은 **처음부터 끝까지** 평문이다

카운슬 어휘는 **다음 에이전트와 결정 원장**을 위한 것이지 소유자를 위한 것이
아니다. 그런데 지금까지 평결 블록을 그대로 소유자에게 전달해 왔다.

실측(2026-07-29): 발자국 커스터마이즈 평결을 그대로 옮겼더니 소유자가 되물었다 —
*"뭔 서명?"*. 그 순간 요약은 요약이 아니라 **번역이 필요한 또 하나의 문서**였다.
읽는 쪽이 사전을 먼저 배워야 하는 보고는 보고가 아니다.

**실측(2026-08-03) — 이 규칙은 이미 있었는데 지켜지지 않았다.** 소집자는 세 줄
요약을 맨 앞에 정확히 썼고, **그 바로 아래 평결 블록을 통째로 붙였다.** 소유자의
답은 *"뭔말이야? 이해 가능하게 대답해줘야지"* 였고, 더 쉽게 다시 쓴 뒤에도
*"더 쉽게 설명해줘"* 가 한 번 더 왔다. 세 줄은 요약이 아니라 **회의록 앞에 얹은
표지**였던 것이다. 구멍은 종전 제목 「평결 블록보다 **먼저**」다 — *먼저 쓰라*는
말은 **뒤에 붙여도 된다**는 말로 읽힌다. 그래서 셋으로 나눠 못 박는다.

**① 평결 블록의 목적지는 대화창이 아니다.** 그것은 `docs/DECISIONS.md` · PR 본문 ·
플랜 파일로 간다. **소유자에게 보내는 답에는 붙이지 않는다.** 원하면 소유자가
요청한다 — 요청 없이 붙은 평결 블록은 보고가 아니라 전사(轉寫)다.

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

**세 줄로 부족하면 더 써도 된다 — 단 같은 말투로.** 길이가 문제였던 적은 없고
어휘가 문제였다. 근거를 대야 하면 **숫자와 실물로** 댄다("연결 154개 중 152개가
그냥 계층이다"), 자리 이름과 점수로 대지 않는다. 비유가 정확하면 비유가 낫다.

**소유자에게 가는 답 어디에도 쓰지 않는 말** — 자리 이름(위계 · 체계 · 상호작용 ·
모션 · 도해 · 작업대 · 반응형 · 핸드오프 · 근거 · 결 · 지킴이 · 해자 · 지렛대) ·
루브릭 · 점수 · `N/24` · 판정 · 평결 · 소집 · 반증 조건 · 서명 · 슬라이스 ·
appetite · 트리거 · attention winner · 라운드.

그 말들이 **틀린 것은 아니다** — 원장과 PR 본문에서는 정확히 그 단어들이어야 한다.
다만 그 독자는 프로토콜을 실행하는 쪽이고, 소유자에게 필요한 정보는 셋뿐이다:
뭐가 바뀌나, 내가 말한 것과 뭐가 다른가, 내가 뭘 해야 하나.

**"네 말과 다르게 한 것" 은 생략할 수 없다.** 요청보다 좁히거나 넓혔으면 그 줄이
반드시 있다. 그 줄이 없는 축소는 축소가 아니라 **조용한 무시**이고, 소유자가
나중에 화면에서 발견하게 된다.

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
