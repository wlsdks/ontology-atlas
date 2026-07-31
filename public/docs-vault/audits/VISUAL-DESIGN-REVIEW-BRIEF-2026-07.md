# Ontology Atlas — Visual Design Review Brief (2026-07)

> Status: exploratory review brief, not an approved redesign specification.
>
> Audience: Claude Code Fable, design-review agents, and the product owner.
>
> Purpose: preserve the evidence, agreements, disagreements, and open questions
> from a multi-perspective review so the next agent can challenge the diagnosis
> before proposing or implementing one bounded design slice.

---

## 1. How to use this document

This file should be given to the next agent as context, not as a list of
pre-approved changes.

The next agent should:

1. inspect the evidence and the shipped product state;
2. state which findings it agrees with, rejects, or reframes;
3. identify the one user moment with the highest product value;
4. propose the smallest coherent design slice;
5. stop for owner review before changing product files.

Do not ask an agent to "fix all 12 issues." Several findings may share one root
cause, and some recommendations are intentionally in tension.

---

## 2. Compact PO framing

- **Observed phenomenon:** In the captured Topology and Studio states, the
  product has a restrained, polished dark-workbench atmosphere, but reviewers
  struggled to read relation direction and type, distinguish the active
  selection from the project root, or understand the work outcome represented
  by the graph. Raw social captures also became illegible when mentally reduced
  to feed size.
- **User problem:** A first-time tech lead can recognize a sophisticated graph
  tool without yet understanding how it reduces onboarding time, change risk,
  stale-context risk, or agent handoff cost. A social viewer may stop for the
  aesthetic but still fail to remember or classify the product correctly.
- **Primary user moment:** A tech lead selects one product concept before a
  change and needs to understand its meaningful dependencies, implementation
  evidence, impact boundary, and agent handoff.
- **Current alternative:** Code search, architecture diagrams, large
  `CLAUDE.md`/`AGENTS.md` files, docs, and manual explanation across agent
  sessions.
- **Ontology value:** The UI should expose typed meaning, not merely graph
  volume: which relation exists, in which direction, with what evidence, and
  why it matters to the pending decision.
- **Agent value:** The same visible focus should produce a trustworthy handoff
  to a plain coding agent through Atlas MCP/CLI, with source evidence and a
  verification path.
- **Simplification:** Preserve the core map, focus transition, and local-first
  workbench. Prefer clarifying one relationship-inspection workflow over adding
  more dashboards, colors, panels, or decorative effects.
- **Verification direction:** Test relation-reading accuracy, selected-state
  recognition, task understanding, responsive/zoom resilience, agent handoff,
  and installed-app evidence. Do not treat a polished screenshot as sufficient
  proof.
- **Current PO verdict:** **Investigate first.** The screenshot evidence is
  strong enough to identify risks, but not strong enough to approve a broad
  redesign or decide the exact solution without an independent review and a
  bounded prototype.

Canonical product gates remain:

- `docs/PRODUCT-OWNER-OPERATING-SYSTEM.md`
- `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`
- `docs/DESIGN-SYSTEM.md`

---

## 3. Evidence reviewed

### Current-session captures

These are useful because they show the actual browser state reviewed in this
session. They are temporary local artifacts and should not become product
documentation or campaign assets.

- `.tmp/social-audit/01-topology-first-run.png`
- `.tmp/social-audit/02-topology-focus.png`
- `.tmp/social-audit/03-studio-enhance.png`

### Stable product captures

- `docs/assets/readme/topology-overview.png`
- `docs/assets/readme/topology-focus.png`
- `docs/assets/readme/workspace-docs.png`
- `docs/assets/readme/builder-context.png`
- `docs/assets/readme/graph-insights.png`
- `docs/assets/readme/atlas-workflow.gif`
- `docs/assets/readme/atlas-workflow.webm`

### Product surfaces to inspect live

- `/ko/topology/`
- `/ko/topology/?p=domain%3Aai-agent-partner`
- `/ko/ontology/studio/`
- `/ko/docs/`
- `/ko/ontology/edit/`
- `/ko/ontology/insights/`

Route selection for installed-app proof should follow the slice being reviewed;
do not assume an old hard-coded route is canonical.

---

## 4. Review method and limits

Five `gpt-5.6-sol` sub-agents reviewed the same evidence independently from
different roles:

1. senior product designer / design director;
2. SNS creative director / brand designer;
3. information-visualization, cognitive ergonomics, and accessibility reviewer;
4. global brand and art-direction reviewer;
5. 2–10 person development-team tech lead / B2B adoption reviewer.

The primary agent then consolidated repeated findings and preserved material
disagreements.

This is not user research and not proof of accessibility compliance. The
screenshots cannot prove keyboard behavior, screen-reader structure, actual
WCAG contrast, motion quality, installed-app behavior, task success, or
adoption. Scores below are directional review signals, not product metrics.

---

## 5. Consolidated diagnosis

> Ontology Atlas already has the visual ingredients for a distinctive product,
> but the current hierarchy makes its core value — meaningful, directional,
> evidence-backed relationships that a person and an agent can act on — harder
> to read than the surrounding atmosphere.

The product is not visually crude or obsolete. The risk is more specific:

- structure is visible, but relations are difficult to decode;
- state is visible, but the meaning of the state is ambiguous;
- graph scale is visible, but the work outcome is not;
- Studio is memorable, but its scoring rigor is not self-evident;
- local-first is suggested, but Git-backed trust is not visually proved;
- the social captures show a product screen, not a composed product story.

---

## 6. Prioritized findings

### 1. Relation direction and type are not reliably readable — Critical

Thin lines, intersections, low contrast, and insufficient directional encoding
show that connections exist without making the relationship easy to trace or
classify.

Questions for the next agent:

- Can a first-time user identify source, destination, and relation type without
  reading the inspector first?
- Should direction use arrowheads, source/destination marks, short direct
  labels, motion, or another redundant encoding?
- Which relations deserve to remain visible in the default state?

Do not solve this by adding more colors alone.

### 2. Graph volume is more prominent than graph insight — Critical

Counts such as `309 concepts` and `480 relations` prove scale but can also read
as maintenance debt. They do not prove freshness, quality, provenance, impact,
or decision value.

The next agent should consider whether the primary facts should instead include:

- impact boundary;
- evidence coverage;
- stale or unverified relations;
- last Git-backed update;
- agent-ready handoff state;
- the next verification path.

### 3. The first five seconds do not prove one work outcome — Critical

"A map of what the product is made of" describes the tool but does not show why
a tech lead should adopt it.

The review should pick one moment, for example:

- inspect impact before changing a capability;
- onboard into an unfamiliar domain with cited evidence;
- pass focused meaning to an agent;
- discover that a trusted relation or instruction has gone stale.

The screen should make that moment visible before it explains the whole product.

### 4. Information that must be read is too dim — High

The dark canvas and quiet periphery are not themselves defects. The problem is
that active relation lines, labels, selected state, and important results can
also recede into the background.

The next agent should define an explicit attention model:

- base map;
- persistent support;
- active focus;
- blocking task;
- transient feedback.

Only the active layer should dominate. Not every element needs higher contrast.

### 5. Project root, current selection, hover, and path state compete — High

In the focus capture, the gold `ontology-atlas` core can appear more important
than the selected `AI Agent Partner` domain.

The design system needs distinct, non-conflicting semantics for:

- project root;
- current selection;
- hover;
- path origin and destination;
- verified evidence;
- unresolved or stale meaning.

### 6. The focused Topology state currently carries the strongest product proof — High

The focus state already brings together:

- a selected concept;
- typed relationships;
- implementation evidence;
- a document path;
- relation editing;
- path exploration;
- agent handoff.

Several reviewers rated it as more trustworthy and product-specific than the
first-run overview or Studio. The next agent should challenge this conclusion,
but should not assume Studio is automatically the campaign or product hero
merely because it is more visually dramatic.

### 7. Local-first and Git-backed trust are implied rather than proved — High

Opening a Markdown folder is reassuring, but the reviewed screens do not make
the following contract sufficiently visible:

- plain `.md` source;
- Git diff and review path;
- recent author or agent change;
- dirty/clean state;
- provenance and freshness;
- no required account, backend, or upload.

The next agent should decide which of these facts belongs in the current
workflow and which belongs in documentation or campaign framing. Do not add a
trust badge that the product cannot prove.

### 8. Studio's game metaphor attracts attention but can weaken rigor — High

`LV.3 → LV.4`, `65% → 85%`, gems, slots, and "enhance" are memorable. They also
raise unanswered questions:

- What exactly determines the score?
- Which missing evidence or relation causes the deficit?
- What work becomes safer after the enhancement?
- Is meaning quality being reduced to an arbitrary game stat?

Potential reframing directions to investigate:

- equipment enhancement → relation restoration;
- level gain → evidence coverage or competency completion;
- gem → evidence mark, coordinate pin, or relation token;
- score increase → explicit resolved gap.

This is a question to investigate, not an instruction to remove Studio.

### 9. Topology and Studio need one semantic world, not just shared colors — High

Topology evokes a strategic map or star chart. Studio evokes an RPG enhancement
screen. The two can coexist only if they share a coherent underlying action:

> discover a meaningful path, identify a missing or weak fact, strengthen it
> with evidence, and return to a more trustworthy map.

Matching borders and colors will not resolve a conflicting product metaphor.

### 10. The dark negative space is potentially a premium asset — Preserve

The reviewers disagreed with the idea that the canvas should simply be filled.
The quiet field can distinguish Atlas from dense enterprise dashboards and
allow one meaning path to emerge.

The open question is whether the remaining form is strong enough to justify the
space. Preserve the space; strengthen the information that appears within it.

### 11. The gold central core is the strongest current brand seed — Opportunity

The gold hexagonal project core and radial meaning paths are among the few
repeatable shapes that can become identifiable without the wordmark.

Gold currently risks conflicting meanings:

- product center / authority in Topology;
- rarity / reward in Studio.

Investigate reserving it for verified meaning, center, or a decided path rather
than decorative reward. Do not expand gold usage until its semantic role is
clear.

### 12. Product UI and social creative are separate design problems — SNS Critical

A raw browser capture includes personal tabs, bookmarks, localhost chrome, wide
empty regions, and illegible interface detail. It can prove authenticity but
does not function as a composed launch asset.

Social creative should isolate one moment:

- one path becomes visible;
- one impact boundary is explained;
- one source document proves the relation;
- one agent handoff is generated;
- one missing relation is resolved.

This finding does not imply that the product UI should be redesigned solely to
look good in screenshots.

---

## 7. Material disagreements to preserve

### "The interface is too dark"

- **Weak version:** brighten the entire interface.
- **Stronger diagnosis:** only the information required for the current task is
  too dim.

### "The canvas is too empty"

- **Weak version:** fill unused space with more information.
- **Counter-position:** the negative space is a premium brand asset; strengthen
  the selected path instead of filling the field.

### "Studio is the strongest screen"

- **Attention argument:** Studio is the most immediately memorable.
- **Trust argument:** the focus screen better proves the actual product value,
  while unexplained scores can reduce professional trust.

### "The brand is generic"

- **Critique:** dark + indigo + glow is now category-standard AI/developer-tool
  styling.
- **Counter-position:** Atlas already has distinctive seeds — the gold core,
  path reveal, and relation slots — but they are not yet governed by a coherent
  semantic system.

### "Small text should be larger"

- **Weak version:** enlarge every label and metric.
- **Stronger diagnosis:** establish a larger difference between the primary
  fact and precision metadata; retain small instrumentation only where it
  remains readable and subordinate.

---

## 8. Preserve before redesigning

1. The central project core and radial topology model.
2. The focus transition where irrelevant context recedes and one meaningful
   path remains.
3. The relation token / slot idea as a direct-manipulation metaphor.
4. The restrained neutral palette and quiet canvas.
5. The visible path from concept to document, code evidence, and agent handoff.

---

## 9. Open questions for Fable

The next agent should answer these before selecting a solution:

1. Is the graph the primary work surface, or evidence supporting a focused
   decision?
2. What single user task should Topology prove in the first five seconds?
3. Can users correctly identify relation direction and type without the
   inspector?
4. Can users distinguish project root from current selection within ten
   seconds?
5. Which graph facts are valuable enough to remain visible by default?
6. Which trust facts belong inside the workbench: provenance, freshness, Git
   status, agent authorship, or verification state?
7. What does gold mean everywhere in the product?
8. Does Studio represent enhancement, restoration, validation, or completion?
9. Can Studio retain delight without making ontology quality feel arbitrary?
10. What semantic world connects Map, Focus, Docs, Builder, Studio, and agent
    handoff?
11. Which current visual element would remain recognizable if color and product
    name were removed?
12. Is the social problem best solved by product changes, campaign art
    direction, or both as separate slices?

---

## 10. Hypotheses worth testing

| Hypothesis | Cheap proof before implementation |
|---|---|
| Redundant direction/type encoding improves relation-reading accuracy | Compare current focus capture with a bounded prototype; ask unfamiliar reviewers to name source, destination, and type |
| A work-outcome headline improves product classification | Five-second test: ask what the product does and who it is for |
| Focus is a stronger product hero than overview or Studio | Blind rank the three states for trust, comprehension, and curiosity |
| Freshness/provenance facts reduce maintenance anxiety | Show scale-only versus evidence/freshness variants to tech leads |
| Studio can retain delight with a more rigorous metaphor | Compare RPG enhancement against relation restoration/evidence completion |
| The gold core can become an Atlas signature | Test recognition across Topology, social crop, icon, and motion frame without the wordmark |
| Quiet negative space improves attention when active data is legible | Compare filled-dashboard and focused-path variants at the same viewport |

Accessibility and resilience checks for any later implementation should include:

- measured contrast for active text, labels, controls, and graph lines;
- no color-only state or relation encoding;
- 200% text zoom and reflow;
- a 390px-wide sequential alternative rather than a miniature desktop graph;
- keyboard and screen-reader verification;
- motion reduction;
- installed macOS app proof at the slice's required viewport sizes.

---

## 11. Directional score range

These are review signals only:

| Dimension | Current directional range |
|---|---:|
| Visual atmosphere | 7/10 |
| Graph readability | 3–4/10 |
| Relation meaning | 3/10 |
| Information hierarchy | 5–5.5/10 |
| Brand memorability | 5–6/10 |
| Unique design potential | 8/10 |
| Art-direction consistency | 4.5–5/10 |
| First-five-second comprehension | 5–5.5/10 |
| Social curiosity/click potential | 6–7/10 |
| Social-to-install confidence | 4/10 |
| Team-adoption trust from these captures | 4/10 |

---

## 12. Recommended agent workflow

### Phase A — independent review

- No product-file changes.
- Inspect the live surfaces and evidence.
- Produce agreements, disagreements, root causes, and a ranked recommendation.
- End with a PO verdict and a design verdict.

### Phase B — shape one design slice

Only after owner feedback:

- choose one user moment;
- state one attention winner;
- name the ontology fact and agent handoff that must become clearer;
- identify surfaces to dim, collapse, remove, or align;
- prepare a bounded visual target or prototype;
- define responsive and accessibility contracts;
- define installed-app proof.

### Phase C — implement and verify

Only after the visual target and scope are accepted:

- use CodeGraph first for structural exploration when available;
- work test-first where behavior or contracts change;
- preserve local-first and MCP/CLI handoff contracts;
- verify focused checks before broad checks;
- inspect the real browser state and the installed macOS app when desktop
  behavior is affected;
- sync product documentation and ontology only when the shipped product meaning
  changes.

Do not bundle all review findings into one redesign PR.

---

## 13. Copy-ready prompt A — ask Fable for an independent opinion

```text
먼저 AGENTS.md와 docs/audits/VISUAL-DESIGN-REVIEW-BRIEF-2026-07.md를 끝까지 읽어라.
필요한 경우 아래 canonical 문서도 직접 확인해라.

- docs/PRODUCT-OWNER-OPERATING-SYSTEM.md
- docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md
- docs/DESIGN-SYSTEM.md

이번 단계의 목적은 구현이 아니라 독립적인 제품·디자인 판단이다.
아직 제품 파일을 수정하지 마라.

브리프의 결론을 정답으로 간주하지 말고 실제 캡처와 현재 실행 화면을 직접
확인한 뒤 다음을 수행해라.

1. 브리프의 진단 중 동의하는 것, 반대하는 것, 잘못 프레이밍된 것을 구분한다.
2. 문제를 증상과 근본 원인으로 나눈다.
3. 현재 화면에서 반드시 보존해야 할 시각·상호작용 자산을 정한다.
4. 2~10인 개발팀 테크리드가 처음 5초 안에 이해해야 할 단일 업무 결과를
   하나 선택한다.
5. 관계 방향·종류·근거·영향 경계·에이전트 인계가 실제로 읽히는지 평가한다.
6. Topology와 Studio의 공통 세계관 및 금색의 의미를 제안한다.
7. 제품 UI 문제와 SNS 크리에이티브 문제를 분리한다.
8. 가장 가치가 높은 디자인 슬라이스 후보를 최대 3개 제안하고, 각각의
   사용자 가치·범위·위험·검증 방법을 비교한다.
9. 마지막에 PO verdict와 Design verdict를 각각 내린다.

아직 코드나 문서를 수정하지 말고, 내가 선택할 수 있도록 판단과 후보만
보고해라. 취향이 아니라 관찰된 화면과 사용자 과업을 근거로 작성해라.
```

---

## 14. Copy-ready prompt B — implement one approved slice

Use this only after reviewing Prompt A's output and choosing one slice.

```text
AGENTS.md와 docs/audits/VISUAL-DESIGN-REVIEW-BRIEF-2026-07.md를 다시 읽어라.
이번에 승인된 디자인 슬라이스는 아래 한 가지다.

[여기에 승인한 슬라이스와 사용자 순간을 붙여넣기]

구현 전에 docs/PRODUCT-OWNER-OPERATING-SYSTEM.md의 compact PO pass와
docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md의 design gate를 작성해라.
관찰된 문제, primary user moment, attention winner, ontology fact,
agent-handoff value, responsive contract, accessibility contract, scope cut,
installed-app proof를 명시해라.

그 다음 현재 구현 구조를 CodeGraph로 먼저 확인하고, 기존 디자인 토큰과
상호작용 문법을 보존하면서 가장 작은 완결 슬라이스로 구현해라.

필수 원칙:

- 새로운 색·패널·장식을 기본 해법으로 사용하지 않는다.
- 관계의 방향과 종류를 색 하나에만 의존해 표현하지 않는다.
- 프로젝트 루트, 현재 선택, hover, path 상태를 혼동시키지 않는다.
- plain Markdown, Git-backed local-first, MCP/CLI agent handoff 계약을 숨기거나
  깨뜨리지 않는다.
- SNS용 크리에이티브와 제품 UI 변경을 한 슬라이스로 섞지 않는다.
- 구현 전후의 실제 사용자 결과를 비교할 수 있는 검증 기준을 만든다.
- 브라우저 캡처만으로 완료 처리하지 않는다. 데스크톱 동작에 영향이 있으면
  설치된 macOS 앱까지 검증한다.

focused verification부터 실행하고, 영향 범위가 요구할 때만 전체 검사로
확장해라. 완료 시 변경 파일, 검증 결과, 남은 불확실성, 다음에 하지 말아야
할 확장 범위를 보고해라.
```

---

## 15. Current recommendation

Give Fable **Prompt A first**. Compare its independent diagnosis with this
brief. Only then choose one candidate and use Prompt B.

The most promising starting area from the current evidence is not "make the
whole product prettier." It is a bounded relation-inspection slice where a tech
lead can select one concept and correctly understand relation direction,
evidence, impact, and agent handoff without losing the quiet Atlas character.
