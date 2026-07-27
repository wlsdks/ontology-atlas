---
name: design-council
description: Convene the Atlas Design Council — seven standing designers (design-lead 위계 · design-system 체계 · design-interaction 상호작용 · design-motion 모션 · design-infoviz 도해 · design-workbench 작업대 · design-handoff 핸드오프) who critique a UI change from their own craft, then design-guardian decides and applies. Use before or after meaningful UI, visual, interaction, motion, graph-readability, responsive, or macOS-workbench work — and whenever the owner asks to "bring in a designer". Only the seats a change actually touches are convened; 위계 and 체계 always attend. Skip for copy-only typo fixes and pure build plumbing.
---

# /design-council — seven designers, one verdict, applied

## Why this exists

`docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` has always carried an eight-role
Design Council and a seven-seat Atlas Designer Bench. It also said, in its own
words:

> *"They are lenses, not separate agents **unless a tool explicitly provides
> them**."*

No tool ever provided them. So the bench was prose, the same way the PO Council
was prose — and this repo's recurring lesson is that **문서에만 있는 규격은
지켜지지 않는다.** This skill provides them.

The seven seats are the documented bench, one agent each. Nothing invented,
nothing dropped.

## The bench

| Agent | 이름 | Bench seat | Rejects |
|---|---|---|---|
| `design-lead` | 위계 | Lead Product Designer | 막연한 폴리시, 과업이 더 명확해지지 않는 새 크롬 |
| `design-system` | 체계 | Design Systems Engineer | 취향에만 기댄 간격, 일회성 사이즈, 룰 없는 규격 |
| `design-interaction` | 상호작용 | Interaction Designer | 드래그로만 발견되는 기능, 사라지는 클릭 상태, 모달 모호성 |
| `design-motion` | 모션 | Motion / Action Designer | 튀는 카메라, 장식적 애니메이션, 패널 잰크 |
| `design-infoviz` | 도해 | Information Visualization Designer | 장식적 색, 타입 의미 없는 관계선 |
| `design-workbench` | 작업대 | macOS Workbench Designer | 브라우저 전용 증명, 비좁은 풀스크린 |
| `design-handoff` | 핸드오프 | Agent Handoff Designer | 숨은 명령, MCP 전용 핸드오프, 사실과 분리된 복사 |

**`design-guardian` is not a seat — it is the accountable decider.** The bench
critiques and prescribes; the guardian produces the single verdict and is the
only one of the eight that may edit code. This mirrors the PO Council, where
Accountable Value Owner is deliberately not an agent.

## Which seats to convene

Convening all seven for a label change is the process theater the design OS
warns about. **위계 and 체계 always attend** — one names the attention winner,
the other turns whatever is decided into tokens and tests. Add the rest by what
the change actually touches:

| Change touches | Add these seats |
|---|---|
| selection · hover · focus · drag · keyboard · modal | 상호작용 |
| transition · timing · camera · animation | 모션 |
| graph · chart · legend · colour · density | 도해 |
| window chrome · panel width · responsive · desktop app | 작업대 |
| what the screen leaves behind for an agent | 핸드오프 |
| a new or removed surface | all seven |

If you are unsure whether a seat applies, convene it. The failure mode this
protocol exists to prevent is a blind spot, not an extra opinion.

## Protocol

### Round 1 — independent critique (parallel, no cross-talk)

Launch the selected seats **in one message** so they cannot anchor on each
other. Every seat gets:

- the change, and the user moment it claims to serve
- the repo paths, and **a built, running surface to open** — not a diff.
  `design-lead`, `design-interaction`, `design-workbench` must screenshot;
  `design-motion` must record frames; `design-infoviz` must measure contrast;
  `design-handoff` must run the command it claims exists.
- explicit permission to research the web

A seat that could not open the real thing must say so and withhold its verdict.
Reading a patch and judging craft from it is the failure this protocol replaces.

### Round 2 — cross-critique (one round)

Send every seat the others' positions. Each restates the **strongest** opposing
point in its own words, then concedes or refutes. Conceding must change the
verdict. One round only.

### Round 3 — the guardian's verdict

`design-guardian` receives all positions and produces the single verdict, then
applies it in code. Rules:

- **Do not average the seats into a bigger feature.** The design OS already
  says this. A good pass usually *removes* something.
- **If the council cannot name a surface to remove, dim, collapse, or align,
  the pass failed.** This is the OS's own rejection rule and it is the sharpest
  one — addition-only critique is not critique.
- When seats disagree, choose **the smallest change that clarifies the
  ontology-reading moment in the installed app.**

## Output — Council Verdict block

The design OS's Council Output Contract requires five lines before
implementation. Keep them, and add the bench's own verdict format:

```md
## Design Council Verdict — <change>

**Seats convened**: 위계 · 체계 · <…> — **why these**: <what the change touches>

Primary moment: <user moment this surface serves>
Attention stack: base=[…] support=[…] focus=[…] blocking=[…] utility=[…]
Graph fact: <typed ontology fact that must stay readable>
Responsive rule: <what happens at 14-inch fullscreen and at <lg>
Proof: <screenshots · frames · installed-app evidence · tests>

| 자리 | 판정 | 핵심 처방 |
|---|---|---|
| 위계 | … | attention winner=… / 강등=… |
| 체계 | … | 토큰 + lint 셀렉터 + 계약 테스트 |
| … | … | … |

**Removed / dimmed / collapsed / aligned**: <required — a pass that adds only has failed>

**The decisive disagreement**: <the one fork the decision turns on>

**Verdict (design-guardian)**: Do not design / Investigate first /
Shape a design slice / Build and verify

**Recorded dissent**: <strongest losing argument> — **falsifier**: <what we would
observe if it was right>
```

## Non-negotiables every seat inherits

- **공개 발행 원칙만 인용한다.** Apple HIG · Rams · Tufte · Bertin ·
  Cleveland & McGill · Shneiderman · Munzner · Norman · Nielsen · Disney 12 ·
  Material motion · Carbon · Fluent · W3C · WCAG · Toss 공개 발표.
- **타사 자산 모방 절대 금지.** Reference products are things to *observe a
  principle in*, never to copy — no assets, no wording, no styling, no palettes.
  `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` 의 Reference Permission Test 를
  통과한 것만 인용한다.
- **실존 디자이너의 대사를 지어내지 않는다.** "잡스라면 이렇게 말했을 것"은 근거가
  아니라 창작이다.
- **디자인 시스템이 먼저다.** 어떤 결정이든 결국 값이 되어 코드에 남는다. 그 값이
  램프에 없으면 `design-system` 이 램프 등록 + lint 룰 + 계약 테스트를 같은 PR 로
  요구한다. **룰 없는 규격은 지켜지지 않는다.**
- **헌장이 외부 원칙보다 우선한다.** `.claude/rules/design.md` ·
  `.claude/rules/forbidden.md` · `docs/DESIGN-SYSTEM.md` 와 충돌하면 헌장이 이긴다.
  굽혀야 하면 **명시적 요청**으로 올린다 — 일방적으로 굽히지 않는다.
- **막을 때는 대안을 댄다.** 어느 자리든 "반려"로 끝내면 자리 값을 못 한 것이다.

## Notes for the caller

- **Isolate the run if edits are in flight.** These agents are read-only by tool
  grant, but concurrent agents share the working directory — a `git checkout`
  from one moves everyone. Prefer worktree isolation.
- **Seven agents with browser and web access is not a routine gesture.** Convene
  by the table above, not by reflex.
- `tests/contract/design-council.contract.test.ts` fails the build if a bench
  seat loses its agent, if `design-guardian` is mistakenly listed as a seat, or
  if this skill and its mirror drift apart.
