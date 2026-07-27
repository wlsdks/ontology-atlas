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

```
[다른 자리들의 평결 블록]
[너에게 온 질의 — 있으면]
규칙: 가장 강한 반대 논점을 네 말로 재진술하라. 약하게 요약한 뒤 이기는 것은
반칙이다. 수용하거나 반박하라. 수용했으면 판정을 바꿔라 — 안 바뀌는 판정은
심사가 아니라 알리바이다. 1회로 끝난다.
다른 자리 중 **네가 옳다고 보는 지점 하나**를 이름으로 대라 — 1라운드에서는
서로를 못 봤으므로 이 칸은 여기서만 채울 수 있다.
출력: 갱신된 판정 1줄 + 재진술 + 수용/반박 + (있으면) 질의 응답. 15줄 이하.
```

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

## Output — the Council Verdict block

Paste this into the PR body, the plan, or the working update:

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
