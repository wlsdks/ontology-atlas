---
name: design-council
description: Convene the Atlas Design Council — eight standing designers (design-lead 위계 · design-system 체계 · design-interaction 상호작용 · design-motion 모션 · design-infoviz 도해 · design-workbench 작업대 · design-responsive 반응형 · design-handoff 핸드오프) who critique a UI change from their own craft, then design-guardian decides and applies. Use before or after meaningful UI, visual, interaction, motion, graph-readability, responsive, or macOS-workbench work — and whenever the owner asks to "bring in a designer". Only the seats a change actually touches are convened; 위계 and 체계 always attend. Skip for copy-only typo fixes and pure build plumbing.
---

# /design-council — eight designers, one verdict, applied

## Why this exists

`docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md` has always carried an eight-role
Design Council and a seven-seat Atlas Designer Bench. It also said, in its own
words:

> *"They are lenses, not separate agents **unless a tool explicitly provides
> them**."*

No tool ever provided them. So the bench was prose, the same way the PO Council
was prose — and this repo's recurring lesson is that **문서에만 있는 규격은
지켜지지 않는다.** This skill provides them.

The eight seats are the documented bench, one agent each. Nothing invented,
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
| `design-responsive` | 반응형 | Responsive & Touch Designer | 폭으로 터치 추정, rect 없는 반응형 판정 |
| `design-handoff` | 핸드오프 | Agent Handoff Designer | 숨은 명령, MCP 전용 핸드오프, 사실과 분리된 복사 |

**`design-guardian` is not a seat — it is the accountable decider.** The bench
critiques and prescribes; the guardian produces the single verdict and is the
only one that may edit code. This mirrors the PO Council, where
Accountable Value Owner is deliberately not an agent.

## Which seats to convene

Convening all eight for a label change is the process theater the design OS
warns about. **위계 and 체계 always attend** — one names the attention winner,
the other turns whatever is decided into tokens and tests. Add the rest by what
the change actually touches:

| Change touches | Add these seats |
|---|---|
| selection · hover · focus · drag · keyboard · modal | 상호작용 |
| transition · timing · camera · animation | 모션 |
| graph · chart · legend · colour · density | 도해 |
| window chrome · 14인치 첫 뷰포트 · 창 생명주기 · 설치 앱 | 작업대 |
| 브레이크포인트 · 터치 타깃 · safe-area · 확대/reflow · 태블릿 · 패널 접힘 | 반응형 |
| what the screen leaves behind for an agent | 핸드오프 |
| a new or removed surface | all eight |

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

**측정 자리는 자기 계기를 반드시 실행한다** — 호출자가 요청하지 않아도. 「모션」은
`/motion-verify`(macOS 녹화 → 프레임 → 곡선), 「반응형」은 `/responsive-sweep`
(밴드 매트릭스 rect 실측), 그리고 구현이 끝난 화면이면 `/design-audit`(겹침 ·
치수 편차 · 토큰 이탈을 재는 마지막 관문). 계기 없는 판정은 무효다.

A seat that could not open the real thing must say so and withhold its verdict.
Reading a patch and judging craft from it is the failure this protocol replaces.

### Round 2 — cross-critique (one round)

Send every seat the others' positions. Each restates the **strongest** opposing
point in its own words, then concedes or refutes. Conceding must change the
verdict. One round only.

### 라운드 1 — 리터럴 실행 템플릿

**선택한 자리 전부를 한 메시지에서 동시에 launch 한다** (병렬 · 상호 참조 없음).
아래 다섯 칸만 채운다. 문장을 새로 짓지 않는다 — 즉흥 브리프가 같은 소집을 두 번
다르게 만드는 원인이다.

```
[결정] <요청자의 표현 그대로. 문제로 미리 번역하지 않는다 — 그 번역은 PO 카운슬의 일이다>
[근거 경로] <이 결정이 닿는 파일·문서·라우트>
[기존 패스] <심사 대상 PO 패스를 원문 그대로. 없으면 "없음">
[열어야 할 실물] <URL · 명령 · vault 경로. 전 자리가 실물을 연다 — diff 판정 금지.
                  「모션」은 `/motion-verify`, 「반응형」은 `/responsive-sweep`,
                  구현 완료 화면이면 `/design-audit` 을 **요청 없이** 실행한다>
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

## 사람에게 — 평문 요약 (평결 블록보다 **먼저**, 5줄 이내)

카운슬 어휘는 **다음 에이전트와 결정 원장**을 위한 것이지 소유자를 위한 것이
아니다. 그런데 지금까지 평결 블록을 그대로 소유자에게 전달해 왔다.

실측(2026-07-29): 발자국 커스터마이즈 평결을 그대로 옮겼더니 소유자가 되물었다 —
*"뭔 서명?"*. 그 순간 요약은 요약이 아니라 **번역이 필요한 또 하나의 문서**였다.
읽는 쪽이 사전을 먼저 배워야 하는 보고는 보고가 아니다.

그래서 모든 카운슬 산출물은 이 절로 **시작한다**:

```md
### 먼저 — 세 줄

- **정한 것**: <한 문장. 무엇이 어떻게 바뀌는가>
- **네 말과 다르게 한 것**: <있으면 한 줄씩 + 이유 한 문장. 없으면 "없음">
- **네가 할 일**: <대개 "없음 — 써 보고 거슬리면 말해줘". 진짜 필요할 때만 그것을 쓴다>
```

**이 절 안에서 쓰지 않는 말** — 자리 이름(위계 · 체계 · 상호작용 · 모션 · 도해 ·
작업대 · 반응형 · 핸드오프 · 근거 · 결 · 지킴이 · 해자 · 지렛대) · 루브릭 · 점수 ·
`N/24` · 판정 · 평결 · 소집 · 반증 조건 · 서명 · 슬라이스 · appetite · 트리거 ·
attention winner · 라운드.

그 말들이 **틀린 것은 아니다** — 아래 평결 블록에서는 정확히 그 단어들이어야 한다.
다만 이 절의 독자는 프로토콜을 실행하는 쪽이 아니라 **결과를 받는 사람**이고, 그
사람에게 필요한 정보는 셋뿐이다: 뭐가 바뀌나, 내가 말한 것과 뭐가 다른가, 내가
뭘 해야 하나.

**"네 말과 다르게 한 것" 은 생략할 수 없다.** 요청보다 좁히거나 넓혔으면 그 줄이
반드시 있다. 그 줄이 없는 축소는 축소가 아니라 **조용한 무시**이고, 소유자가
나중에 화면에서 발견하게 된다.

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

- **Isolate the run if edits are in flight.** These agents have `Bash`, so "read-only" is a
  instruction and not a constraint — and concurrent agents share the working directory — a `git checkout`
  from one moves everyone. Prefer worktree isolation.
- **Eight agents with browser and web access is not a routine gesture.** Convene
  by the table above, not by reflex.
- `tests/contract/design-council.contract.test.ts` fails the build if a bench
  seat loses its agent, if `design-guardian` is mistakenly listed as a seat, or
  if this skill and its mirror drift apart.
