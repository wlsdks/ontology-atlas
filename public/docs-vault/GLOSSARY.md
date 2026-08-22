# Glossary

**This file is the single source of truth for the words this repository uses.**
English is canonical: comments, doc-blocks, and developer docs are written in
English so contributors outside Korea can read them. Korean equivalents are
listed for the maintainer and for the two Korean docs that stay Korean —
`docs/DECISIONS.md` and `docs/CHANGELOG.md`, both append-only historical records.

Stable path: `docs/GLOSSARY.md`. Do not move it. Code comments and docs point
here by path, and `pnpm docs:links` plus `pnpm docs:comment-refs` verify those
pointers still resolve.

---

## 1. Why this file exists

Two measurements, both taken 2026-08-22.

**One.** The owner read a screen and an explanation of it and said: *"이런거 니가
말하는거 보는 내가 알아들을수있는게 하나도없음!"* — "I can't understand a single
thing you're saying." A sweep of the 3,130 user-facing strings found **34**
written in code vocabulary (`frontmatter`, `엣지`, `핸들`, `파싱`, `렌더링`,
`쿼리`, `계약`, `인덱스`, `메타데이터`), plus an English screen instructing users
to run `pnpm folder:validate` — **a script that does not exist**.

**Two.** The same sweep found one thing carrying several names. Frontmatter
appeared on screen as 프론트매터 / 문서 상단 속성 / 문서 속성. CI checks were
게이트 / 가드 / 검사기 / 체커. Value lists were 램프 / 사다리 / 스케일.

Renaming **drifts unless one table decides it**, because each person picks a
different word. So the table is the source of truth, not the individual fixes.

---

## 2. Two audiences, two registers

| Where | Register |
|---|---|
| **User-facing strings** (`messages/*.json`) | Plain words a non-developer knows — §5 |
| **Code comments, doc-blocks, developer docs** | Precise technical English — §3–4. Do **not** simplify these. `gate` is exactly the right word; spelling it out every time only adds length |

A word can be correct in one register and wrong in the other. These are separate
problems and they get separate rules.

---

## 3. Domain vocabulary

What this product is made of. Most terms are already industry-standard; where we
chose among several possible words, the reason is given.

| Term | Meaning | Korean | Why this word |
|---|---|---|---|
| **vault** | The markdown folder the user picked. Its files *are* the graph | 볼트 | Obsidian established this word for "a local folder of markdown you own", and our users come from that world |
| **frontmatter** | The YAML block at the top of a markdown file | frontmatter | Standard across Jekyll, Hugo, Astro, Obsidian. Never transliterate it |
| **node** | One document in the vault, drawn as one mark on the map | 노드 | Graph-theory standard |
| **edge** | A typed relation between two nodes | 엣지 | Graph-theory standard. On screen say **connection** |
| **kind** | A node's type: `project`, `domain`, `capability`, `element`, `decision` | kind | It is the literal frontmatter key. Never say "type" in prose — `type` belongs to TypeScript |
| **slug** | A node's readable, mutable address | slug | Web standard |
| **uid** | A node's permanent UUIDv4 identity, minted once at creation | uid | Survives rename; `slug` does not |
| **ego graph** | A node plus its direct neighbours | ego | Standard in social-network analysis ("ego network") |
| **spine / circuit / element** | The map's three zoom tiers, outermost to innermost | 스파인 / 서킷 / 엘리먼트 | Repo-specific. Defined in `docs/TOPOLOGY-V2-DESIGN.md` |
| **dome** | The map's 3D projection mode | 돔 | Repo-specific |
| **ACP** | Agent Client Protocol — how a coding agent talks to the app | ACP | Upstream protocol name |

---

## 4. Engineering vocabulary

These are the words that were drifting. The **Use** column is binding.

| Use | Do NOT use for this | Meaning | Why this word |
|---|---|---|---|
| **gate** | check, guard, checker, validator | An automated check that **fails the build** on a violation | "Quality gate" is established (SonarQube, GitLab). "Check" is too weak — a gate blocks |
| **guard clause** | gate | An early return in code (`if (!x) return`) | Standard refactoring vocabulary (Fowler). English already separates these two; keep it that way |
| **ramp** | scale, ladder, step list | A fixed list of allowed design values — type sizes, radii, elevations | "Color ramp" and "elevation ramp" are established usage, and GitLab's design system says "type ramp". ⚠️ **"type scale" is the more common industry term** (GOV.UK, NSW) — we deviate on purpose, because `camera.scale` already owns "scale" in this codebase and a comment near map code would read ambiguously |
| **zoom**, **zoom factor** | scale (in prose) | Camera magnification on the map | The identifier `camera.scale` cannot change, but prose must say "zoom" so it never reads as a value ramp |
| **ratchet** | — | A check that lets a count fall but never rise | Established term with exactly this meaning — a recorded baseline of violations that CI allows to shrink but never grow |
| **probe** | — | A defect inserted on purpose to prove a gate turns red | `.claude/skills/gate-probe/SKILL.md` |
| **inventory** | census | The full count of existing violations, taken **before** switching a rule on | "Census" reads as demography to English speakers; engineers say "inventory" |
| **doc-block** | — | The block comment above a file or export | Standard |
| **surface** | — | A delivery target: the web, or the macOS app | Established by `AGENTS.md` — "two surfaces, one folder" |
| **`Surface` primitive** | bare "surface" | The UI component in `src/shared/ui/surface.tsx` | Same English word, two meanings. Always backtick the component so they never blur |
| **gateway** | landing page | The first-visit screen behind `/` and `/download` | It is not only marketing — installed-app users hit the same route, so "landing page" would misdescribe it |
| **facade** | gateway | A single entry point hiding several render paths | The map's canvas/DOM render paths were called "gateways", colliding with the product screen. English already has "facade" |
| **workbench** | — | The macOS app window where the work happens | VS Code and Eclipse both use "workbench" for exactly this |
| **decision ledger** | — | `docs/DECISIONS.md` — append-only decisions, each with the dissent that lost | — |
| **seat** | — | One standing reviewer on the PO or design council | Standard for panels and boards |

### Words that legitimately mean different things

Do **not** unify these. A sweep that collapses them destroys meaning. Measured
2026-08-22:

| Word | One sense | A different sense |
|---|---|---|
| `gate` in `topology-map-v2/*-gate.ts` | a **runtime conditional** — skip an idle frame, cluster past a density threshold | not a CI gate |
| `gate` in ACP code | a **permission checkpoint** — the user approves a write | not a CI gate |
| `repository` | the **git repo** (~780 occurrences, every one legitimate) | never the vault |
| `ramp` as a verb | motion **ramping down** (deceleration) | not a value list |
| `ladder` | `Esc` dismissal order; `ConnectLadder`'s three steps | not a value ramp |

---

## 5. User-facing register

On screen, use the plain column.
`tests/contract/ui-copy-glossary.contract.test.ts` enforces this against
`messages/*.json`.

| Internal | Korean screen | English screen |
|---|---|---|
| frontmatter | 파일 맨 위 정보칸 | the info block at the top of the file |
| node | 동그라미 (on the map) · 문서 (as a file) | dot · document |
| edge | 연결 | connection |
| graph | 지도 | map |
| render | 화면에 그리다 | draw · show |
| parse | 읽어 들이다 | read |
| query | 검색어 | search text |
| index (body) | 검색 준비 | search prep |
| metadata | 기본 정보 | basic info |
| handle (filesystem) | "브라우저가 연 폴더" | "the folder your browser opened" |
| contract | 어떻게 돌고 있나 · 원본 정보 | where this reads from |
| schema | 형식 | format |
| vault | 폴더 · 문서함 | folder · workspace |
| ontology | 온톨로지 | ontology |

`ontology` keeps its name. `.claude/rules/design.md` already restricts it to
brand positions and to sentences that define the word.

### The parenthesis rule

Some technical words cannot simply be deleted — a user who hits an error needs
the searchable term.

- **Explaining** → plain words only: `파일 맨 위 정보칸이 그대로 지도가 됩니다`
- **The user must find or search the word** (error text, examples) → plain words
  plus one parenthesis: `파일 맨 위 정보칸(frontmatter)이 닫히지 않았어요`
- **The user types it verbatim** → leave it. `kind: project` is code

One parenthesis per screen; after that, plain words only.

---

## 6. Comment policy

Approved by the owner, 2026-08-22.

> **The code says what. A comment says why.**

### Delete

- Anything restating the code — `// increment the counter`
- Work-order markers that meant something for one afternoon — `audit A2`, `iter 18`
- History that no longer constrains anything: a fact about a deleted file, the
  rationale for a rule that was since removed
- Multi-paragraph preambles above a five-line function

### Keep, and write in English

- **Dated measurements.** *Measured 2026-08-19: the gateway burned 55–68 ms/s
  after 40 s of no input.* No code can carry this
- **Owner decisions**, with the quote that settled them
- **Rejected alternatives** — why *not* the obvious approach
- **Constraints whose removal reintroduces a bug** — why a gate is shaped this
  way, why an order of operations matters
- **Anything that reads as wrong but is right**, with the evidence

### The test

> Delete the comment. If the next person could now repeat the mistake it
> prevented, keep it.

### How much to cut

A doc-block should not be longer than the code it documents — **unless it carries
measurements, an owner decision, or a rejected alternative.** Those earn any
length. Narrative does not.

Measured 2026-08-22, before this pass: 1,248 files carried 37,230 lines of Korean
comment out of 57,666 comment lines total. `src/shared/ui/control-class.ts` was
**55% comment**; `use-topology-loop.ts` carried 1,381 comment lines.

What to compress, in order:

1. **Section headings in short files.** Three `##` headings above a 40-line file
   is scaffolding for an essay nobody is reading. Fold them into one bold lead.
2. **Connective narrative** — "그래서 … 그런데 … 그러니" chains that walk the
   reader to a conclusion the next sentence states outright.
3. **Restatement.** The same point made once in the summary and again in the body.
4. **Dead history** — a rationale for a rule that no longer exists, a fact about a
   deleted file. Delete, do not translate.

What never shrinks: numbers, dates, owner quotes, "why not the obvious approach",
and the reason a gate is shaped the way it is.

### Long rationale moves into a document

When a doc-block outgrows the code it sits on, move the prose into a markdown
file and leave a one-line pointer:

```ts
// Why the camera fits the full node bbox and not the spine bbox:
// docs/TOPOLOGY-V2-DESIGN.md "Camera fit"
```

Two rules keep this safe:

1. **Point at a path plus a section heading — never a line number.** Line numbers
   are wrong by the next commit.
2. **The path must resolve.** `pnpm docs:comment-refs` scans code comments for
   repo-relative `.md` paths and fails when one is missing — the same guarantee
   `pnpm docs:links` already gives markdown-to-markdown links. Without it, one
   folder rename silently breaks every pointer at once.

### Quotes stay in Korean

Three kinds of Korean survive translation, all for the same reason: the Korean
**is** the thing being pointed at, so replacing it breaks the pointer.

1. **Owner quotes** — evidence. Translating loses what makes it evidence.
2. **Korean doc section titles in `「 」`** — those headings are still Korean, so
   an English rendering no longer matches the heading it cites.
3. **On-screen strings quoted as evidence.** Measured 2026-08-22: a pass rendered
   `「이 폴더 맞나요?」` and `「코드 위치」` into English inside comments. Both are
   live strings in `messages/ko.json`, so anyone grepping the screen text to find
   the code behind it would no longer hit those comments. Restored.

In every case: keep the Korean, add a short English gloss.

```ts
// Owner, 2026-08-18: "처음 로딩될때 … 너무 아래임.. 딱 중앙이었음해"
// (the map sat too low on first load; it should be centred)
```

---

## 7. Gates

| Gate | Scope |
|---|---|
| `tests/contract/ui-copy-glossary.contract.test.ts` | §5 — user-facing strings, and every `pnpm <script>` a screen names must exist |
| `pnpm docs:links` | Markdown-to-markdown links and cited repo paths |
| `pnpm docs:comment-refs` | `.md` paths cited from code comments resolve |

Code comments are **not** scanned for §4 vocabulary. There the technical words
are the correct ones.
