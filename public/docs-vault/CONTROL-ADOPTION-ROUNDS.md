# Control adoption — round history

> **What lives here and why.** This is the round-by-round record behind
> `tests/contract/control-adoption-ratchet.contract.test.ts`: the exhaustive
> counts, the registration verdicts, the categories that were rejected and on
> what evidence. It was **579 lines of doc-block at the top of that test file**
> until 2026-08-22.
>
> `.claude/rules/design-gates.md` already states the rule this follows — *do not
> stack the rule (what) and the story (why) in one file*. Measured the same day:
> this repository's comments are 16% of its lines against `block/buzz`'s 11%, and
> its 40-line-plus blocks carry 5,186 lines against Buzz's 1,606. This block alone
> was 11% of that excess.
>
> The test keeps the rule and a pointer here. Nothing was cut — the counts,
> verdicts and owner quotes below are the doc-block verbatim.

════════════════════════════════════════════════════════════════════
## Today's numbers (2026-08-04) — read this part first
════════════════════════════════════════════════════════════════════

There are **six** counts: two tag families (button, anchor) × three categories.
They used to be one lump of 113, which made progress unreadable. The split
order is this table: registered/debt (first round, 2026-08-04) → anchors split
out (second) → **no-basis (third)**.

## ✅ Round closed (2026-08-06) — **zero places still style controls by hand**

Owner: *"What does it mean that the decision is finished? Does it mean there is
nothing left to fix? Then shouldn't we declare it complete so we do not look for
it again next time?"*
(if the verdict is final and there is nothing left to fix, declare the round
closed so the next person does not go looking again)

| | 2026-08-05 | now |
|---|---:|---:|
| hand-written **buttons** | 74 | **0** |
| hand-written **links** | 67 | **0** |
| hand-written **form elements** | 63 | **0** |

**While those three are 0 this round is finished.** Everything left is a place
the design system *cannot in principle* produce, **listed with its reason**,
and every row carries a `conditional` — the "when do we reopen this" clause. If
the missing capability lands, the row is deleted and the place drops back into
debt.

The only way a count stops being 0 is a **newly hand-written control**, and
that is exactly when this file turns red.

## Vocabulary (2026-08-06, owner asked)

| This file's word | What it means |
|---|---|
| **debt** | Places styled by hand instead of through the design system. The more there are, the more the same button differs from screen to screen |
| **registered** | A place the design system **cannot in principle** produce, listed with the evidence for why. Not an exemption — a record that "there is no way today". If a way appears it drops back into debt |
| **no-basis** | A place the design system *could* produce but there is nothing to produce — a transparent click surface with no visible spec. Not something to fix |
| **ratchet** | A gate that pins today's number as a ceiling so an improved count can never regress |

**"Button debt 0" means no button is styled by hand any more.**

| Count | One line | Which way it moves |
|---:|---|---|
| **button registered 32** | The value layer **cannot in principle** emit this (`OUTSIDE_VALUE_LAYER`) | To raise it you edit `BASELINE_REGISTERED` **by hand**. That diff is where the "why" goes |
| **button no-basis 4** | The value layer could emit, but there is nothing to emit — not a control (`NO_BASIS`) | Standing still is correct. **Not debt to repay** |
| **button debt 0** | Movable but not yet moved | **Targets 0.** Button progress is read here and nowhere else |
| **anchor registered 29** | Same meaning, anchors (`OUTSIDE_VALUE_LAYER_ANCHORS`) | Raise `BASELINE_ANCHOR_REGISTERED` by hand |
| **anchor no-basis 0** | Measured — all 102 inspected, result 0 (`<a>` exists to go somewhere, so it rarely becomes a spec-less click surface) | Raise by hand when a qualifying place appears |
| **anchor debt 0** | Unregistered remainder of 23 `<Link>` + 14 `<a>` not yet moved | **Targets 0** |
| **form debt 0** | Hand-specced `<input>`/`<textarea>`/`<select>`/`<label>` (added 2026-08-05; on 08-06 it went 63→57→29→20) | **Targets 0.** Every text field moved and native `<select>` debt reached **0**. The remaining 20 are layout-only labels (not a spec) + 5 checkboxes (own contract pins them) + slider, full-screen editor, stage inputs |
| button total 108 · anchor total 102 · form total 63 | Sum per family | Derived. Do not judge from these |

**Why three categories — because debt has to be able to reach 0.** Mixing
"cannot in principle" and "nothing to emit" into debt makes a number that can
never reach 0, and a number that cannot reach 0 is decoration, not a progress
gauge. The owner's point was exactly this: *"If it does not need to be done,
doesn't that mean it does not belong in the design system or is not relevant?
Then it should be excluded altogether; including it in the count is confusing."*
(if a place does not need the design system it should be excluded outright;
counting it in only confuses the number)

⚠️ **Before 2026-08-04 this gate counted only `<button>`.** So "debt 85" was
never once the count of *all* controls — 109 anchors could grow freely outside
the gate's field of view. The number did not jump to 194; that much had been
going uncounted the whole time.

### ⚠️ The registry is a debt list, not a permit list

Inherited verbatim from the hard-cut registry's preamble
(`surface-motion-ratchet.contract.test.ts`): *"if you find a hard-cut surface
that is not listed here, you fix it — you do not add a row."*

1. **Register only what has been verified.** "Probably cannot be moved" is
   debt, not a registration. Unverified things sitting on the debt side is an
   error in the **safe direction**.
2. **Registering a file does not exempt that file.** A row registers a
   **count**, not a file. Write one more hand control in a registered file and
   the registered count is unchanged while debt goes up by 1 = red.
3. **When the evidence disappears the row dies.** Each row carries a `proof`
   string; when that string vanishes from the file the gate reports that the
   claim is dead. `chrome-token` rows carry one more layer — the gate checks
   globals.css to see whether the token really is beyond the fixed steps. The
   day such a token becomes an ordinary px value, that row turns red and drops
   into debt.
4. **If registration becomes an escape hatch this round has failed.**
   Registering something that could have been moved is exactly that failure.

### The registration test — the line between "outside forever" and "not moved yet"

The value layer (`controlClass()`) emits a **className**. So these are things
it cannot express in principle, and adding an axis would not change that:

| Claim | What is outside the value layer |
|---|---|
| `chrome-token` | A chrome token owns the dimension. The value layer's height vocabulary is **fixed steps only**, while these tokens are `clamp(38px, 4.2vh, 48px)` or get **redefined to a different value** at narrow widths / coarse pointers. A fixed-step ramp can express neither a viewport function nor a pointer promotion |
| `stage-geometry` | The dimension comes from **JS-computed `style`**, not className (absolutely positioned stage coordinates). A ramp cannot emit style |
| `value-layer-peer` | The value layer's **own house**. This is where a primitive declares its own spec. Forcing it through would break the contract or push colour/dimension out through `className` and neutralise the layer — a layer cannot consume itself |
| `standard-button` *(anchors, 2026-08-04)* | **The one shape the value layer explicitly yielded.** `control-class.ts` says so in its own preamble: *"It does not replace the standard button (`<Button>`) … creating overlap makes it unclear which one is the specification."* So an anchor passing through `buttonVariants()` **already went through a value layer**, and moving it to `controlClass` would violate that rule rather than comply with it |
| `no-spec` *(anchors, 2026-08-04)* | The tag declares **no shape, size, or colour at all** — either a pure `className={className}` pass-through or a single `"inline-flex"` for placement. There is nothing for the value layer to emit, and placement is the layer the value layer itself defined as `className`'s share |
| `state-scoped` *(anchors, 2026-08-04)* | The whole spec exists **only under a variant prefix** (a `focus:` skip link — `sr-only` at rest). `controlClass()` emits a prefix-less class string, so no prefix can be attached |
| `prose` *(anchors, 2026-08-04 link floor round)* | **Prose, not a control.** A link inside markdown body flow — its siblings are text, the parent `--leading-prose` owns the line box, and WCAG 2.5.8 exempts inline text. All eight value-layer shapes are flex-family, so **display:inline is impossible in principle** (inline-flex kills wrapping at 320px — measured rect 1 vs 2). Its destination is the `.prose-link` contract (`prose-link.contract.test.ts`) |

Conversely, **"the value layer does not have that shape yet" is not grounds for
registration.** That is a place the Systems seat opens by adding a
part, so it is **debt**. This distinction is the whole of this round.

### How to read the three categories — two questions per place

1. **Can the value layer emit this?** No → **registered** (one of the claim
   types above).
2. If yes, **is there anything to emit?** Yes → **debt** (move it). No →
   **no-basis** (`NO_BASIS` — see the 2026-08-04 category round below).

Only one case answers "no" to (2) today: a **screen-covering click surface**
(scrim, blocking backdrop). It declares no shape, size, type, or ink, so there
is nothing for the value layer to apply.
⚠️ "moving it is a hassle" and "pixels would shift" are not answers to (2) —
those are debt.

A row with `conditional` means "move it once X exists" — the day the value
layer gains that axis, delete the registration, drop it into debt, and repay it.

### The 2026-08-04 registration round **rejected 13** — the claims were false

The round opened with "git 15 · shared/ui 10 · studio 11 = 36 are outside the
value layer". Opening each place, only **23 were true**:

| Rejected place | n | Why the claim was false |
|---|---:|---|
| `atlas-git-panel/ui/CommitDetail.tsx` | 2 | Does **not** use `--git-*` tokens. Underlined tab (`min-h-9 border-b-2`) and deep-inset row (`px-5`) — both are value-layer holes the ledger had already counted = debt |
| `atlas-git-panel/ui/ConceptEgoCard.tsx` | 1 | Same. A text control inside a `flex-wrap` list — the "dense wrap" hole = debt |
| `shared/ui/node-explanation-edit.tsx` | 3 | It merely **lives in** `src/shared/ui`; it is not a primitive. `h-6 w-6 rounded-full` is the "no circular icon control" hole the ledger had already named = debt |
| `shared/ui/info-hint.tsx` | 1 | The same circular-icon hole = debt |
| `shared/ui/compact-copy-button.tsx` | 1 | `rounded-chip px-2 py-1 text-label` are ramp values. The only thing outside is the `active:translate-y` press dialect = debt |
| `ontology-studio/**` — 3 in-sentence controls · 1 dashed picker · 1 `rounded-2xl` entry card | 5 | Not "stage geometry". The first four are the inline/dashed holes; the last is a ramp-pending exception **already visibly registered with owner approval + `eslint-disable`** = debt |

⚠️ **Also: the claim that `studio-navigation.spec.ts` pins those dimensions as
a contract — offered as the basis for the studio 11 — is not true.** That spec
measures only `fontSize`/`height` of `studio-save` and `studio-exit`, and
neither is among the 11. The real reason three stage places are outside the
value layer is not an e2e contract but
**`style={{left, top, width: layout.socket.w …}}`** — they were registered
under corrected evidence.

════════════════════════════════════════════════════════════════════
## What debt 90 is waiting on — the value layer's holes (next round's input)
════════════════════════════════════════════════════════════════════

Every round counted "why it could not be moved". That inventory lives here once.
Each number is the measurement from the last round that counted that hole.

| Hole | Last measured | What is missing |
|---|---:|---|
| **The size ramp binds inset and type into one step** | 9 | "Large inset + small type" really exists (5 mono micro CTAs · 2 success-tint actions · settings notification chip · `MarkdownField` tab). Moving them changes the type — this is not an axis but the Systems seat's call on **which side is the spec** |
| **`scope: 'panel'` opens ink only** | 7 | Border and indigo are still outside: `--topology-v2-panel-border`(#2a2a30) · `--topology-v2-panel-divider`(#23232a) · `--topology-v2-indigo-bright`(#8890e0 ≠ global #7170ff). The value layer's comment asserts *"There is no indigo in the panel ramp"* — but there is |
| **No circular icon control** | 6 | `icon` is pinned to `rounded-chip`. Turning a 24px circle into a 6px square is not normalisation but an **identity change**, so it was not decided alone without convening the Systems seat |
| **Secondary controls inside dense rows / wraps** | 5 + 1 | Loading `link`'s `min-h-11` (WCAG 2.5.8) makes the row 2–3× taller. The `inline` axis exempts "inside a **sentence**" only and cannot say "inside a dense row" |
| **Three-column grid rows** | 3 | `STEP_ROW` (visual · name · why). `row` is flex-only |
| **`tone: 'accent'` is a marker, not ink** | 3 | There are two indigos — marker `--color-indigo-accent`(#7170ff) and text `--color-indigo-text-soft`(#bcc3ffeb). Measured on tint: accent **3.55–4.25:1 (below AA)** vs text-soft **7.09–8.37:1**. Not an unmoved place but a **latent defect in the value layer itself** |
| **Tabs whose selection marker is an underline** | 2 | `segment` is defined as "border 0" so it cannot draw a `border-b-2` tab. Switching to a tint is not normalisation but a **notation change** = the design gate's call |
| **Dashed border = "fillable" affordance** | 2 | The stage's "connect more" and the picker's "create new". Border *style* is shape, so passing it through `className` neutralises the layer |
| **Full-width centred + touch promotion** | 2 | `chip`/`card` are content-width so they have no `justify-center`, and `segment`, which has `justify-center`, has no border = there is no "bordered full-width centred button" |
| **Floating segment** | 2 | `segment`'s pressed state is a single indigo tint, but two places use a dialect where a `--color-panel` thumb floats over the track (`LocaleSwitch` · settings `SegmentSwitch`) and one of them is pinned by a contract string |
| **No place that emits no type step** | 2 | All eight shapes force a size, so a control that must **inherit** the parent font size structurally cannot enter |
| **No bordered icon square** | 2 | `QueueRowActions` kebab · `HubRail`. With only two consumers this is **not an axis yet** — record the number and move on |
| **pill's shallow vertical inset** | 2 | The ramp is 2·2·4px but real filter pills are 6–10px. Raising it also grows the type |
| **Deep-inset list row** | 1 | The commit file row's `px-5`. `row` maxes out at `px-3` |
| **16px radius outside the ramp** | 1 | The entry selection card — an exception **already visibly registered** with owner approval + `eslint-disable`. Registering `--radius-surface`(16) is the next design pass |
| **Press dialect (`active:translate-y`)** | 1 | `compact-copy-button`. The value layer has no press axis |

### Registration candidates verified — the 2026-08-04 combined round confirmed and registered 7

The paragraph above had deferred chrome-token candidates to "the next
registration round"; each was opened: `SearchPalette` · `GlobalSearch` ·
`ShortcutSheet` · `DocsHeaderTile` · `BackToTopButton` · `GitStatusTile` ·
`AppNavRail` (button family) = **7 registered**. Verification caught one defect
— GlobalSearch's dedicated token was a **single fixed 32px declaration**, so
`tokenIsBeyondFixedSteps` rejected it (meanwhile the coarse-promotion block
comment claimed it was "already covered"); it was registered only after being
converged onto `--overlay-close-size`. **Still unverified candidates**: 5
scrim/full-screen overlays (needs a new claim type) · 4 settings-sheet contract
strings — left in debt (the safe direction).

### This count **over-reports** — a known limit

What is counted is the **literal** `controlClass(` in an opening tag (a tag
using a constant built by `controlClass()` in the same file passes). So a
finished class that went through the ramp but is imported from **another file**
is caught as "hand-written". The error is in the safe direction (there is no
under-reporting), but it penalises the correct refactor of extracting a shared
constant.

### 2026-08-04 hole round — debt 90 → 85, and **zero new axes**

The remaining 77 (unregistered at the start of that round) were sorted
exhaustively. **This round's output is not the 5 moved but the "why no axis was
created".**

| Category | n | What it is |
|---|---:|---|
| **Re-judged as outside the value layer** | 25 | 10 chrome-token contracts · 5 scrim/full-screen overlays · 4 settings sheets whose contract pins the class string · 6 error/404 standard-button places (4 adopted this round) → **21 go to the next registration round** |
| **Mono uppercase micro CTA** | 5 | **Third round running.** First in line for the next verdict — but reviewed as a **part**, not an axis (rule 1) |
| Multi-line / grid rows | 10 | The earlier "no axis" decision still stands |
| panel border / indigo | 6 | **Fourth round running.** But all overlap a second hole, so alone they recover 0–1 |
| Inset floor / asymmetry | 5 | |
| Type / ink inheritance | 5 | |
| 40px · 3 tint fills · 2 in dense rows · 1 chip 28px | 6 | |
| Singletons (only one place with that reason) | 14 | Cannot justify an axis |

**Why no axis at all**: most remaining places sit in **two or more holes at
once** (e.g. panel indigo + inset/type binding). So any single new axis opens
0–1 places **on its own**. An axis with 0–1 consumers does not get built — the
same standard that killed `fixedHeight`. **The 6 panel border/indigo places
only open in the same round that unbinds inset from type.**

**Re-measurement corrected two earlier observations**: "circular icon 6" is
**2** within this target set (four live in `shared/ui`, outside the value
layer), and `HubRail` is a vertical edge tab rather than a bordered icon
square, so squares number **1** and are still not an axis.

The 5 moved: two 404 files adopted `<Button>` (contrast at those places
corrected **4.42 → 4.70** — they sit outside `a11y-ratchet`'s ROUTES so the
ratchet could not see them) · `rounded-[4px]` + eslint-disable →
`rounded-micro` (the disable's reason disappeared with registration).

⚠️ Side measurement: raw `buttonVariants()` leaves **both** the base's
`border-transparent` and the variant border in place, and CSS source order lets
transparent win. `<Link>` consumers must merge through `cn`.

════════════════════════════════════════════════════════════════════
## 2026-08-04 anchor round — all 110 sorted exhaustively
════════════════════════════════════════════════════════════════════

The 110 present on the day the anchor gate was switched on were opened and
classified place by place. **This round's output is not the 8 moved but the
exhaustive "why the other 102 do not move"** — that is exactly how the button
side went from 417 to 85.

### The 8 moved — only two categories, both evidenced by measurement

| Category | n | Actual movement |
|---|---:|---|
| `chip`/`md` **exact match** | 5 | **0px.** The hand class was `min-h-8 px-2.5 text-label` + `border-soft` + `rounded-chip` and the ramp emits the same values. The ramp's added `py-1.5` only makes the natural height 16+12+2=30, so `min-h-8`(32) still wins |
| `link`/`lg`/`scope:panel` | 3 | **+10px** (FullDetailA1 handoff row). This is not normalisation but an **accessibility correction** — that place was a 20px-tall text target, **below** WCAG 2.5.8's 24px floor (a standalone control, not covered by the in-sentence exemption). `link`'s `min-h-11` is the axis that defaults precisely to prevent this defect |

### The remaining 102 — 19 registered · 83 debt

| Category | n | What is missing / why it is outside |
|---|---:|---|
| **[registered] `standard-button`** | 10 | The shape the value layer yielded. DownloadPage 7 · AgentClientButtons 1 · two 404 files 2 |
| **[registered] `chrome-token`** | 4 | AtlasGitPanel 2 (`--git-setup-action-height`) · AppNavRail 1 (`--app-nav-rail-tile-height`) · TopologyReviewLink 1 (`--chrome-tile-size`). All three have two or more declarations, so they pass the token check |
| **[registered] `no-spec`** | 3 | MacosDownloadLink (pass-through) · PublicQuickActions 2 (`inline-flex` wrappers) |
| **[registered] `value-layer-peer`** | 1 | `ChromeTile`'s `<Link>` branch |
| **[registered] `state-scoped`** | 1 | Skip link |
| No place that emits **no** type step | 13 | All eight shapes force a size, so an anchor that must **inherit** the parent size structurally cannot enter. The button ledger counted this hole as "2"; among anchors it is **13** — the largest category of this round and first in line for the next verdict |
| Text links in dense rows / sentences | 12 | `link`'s `min-h-11` (WCAG 2.5.8) makes top bars, in-chip links, and two-link rows 2–3× taller. The `inline` axis exempts "inside a **sentence**" only |
| **Always-on underline + `decoration-*`** | 12 | The value layer has **no** underline/decoration axis at all. Half are markdown body links (docs 5 · gateway 2) and are therefore **prose, not controls** — whether to build an axis or remove this category from "controls" is the Systems seat's call |
| Inset and type bound into one step | 9 | The hole the button ledger counted as "9". Exactly 9 among anchors too |
| No weight axis (`font-medium`/`semibold`) | 4 | Only `onAccent` loads semibold, and it loads it fixed |
| Borderless **vertical** tiles | 4 | 2 rail · 2 bottom tabs. `tile` requires border, radius, and inset. ⚠️ A `chrome-token` claim for the bottom tab's `--topology-bottom-tab-min-height` was **rejected** — it is a single fixed 56px declaration and the token check refuses it (a case of the gate actually blocking a registration escape) |
| Heights off the ladder | 3+2+2+1+2 | 36px 3 · 28px 2 · 40px chip 2 · 48px sheet row 1 · 40px `rounded-full` dialect 2 |
| Tint / overlay fills | 3 | |
| Mono uppercase micro | 3 | **The same category** as the button side. Together 8, and four rounds running |
| Multi-line / grid cards | 3 | Earlier "no axis" decision still stands |
| `border-t` list rows | 3 | `row` has no divider |
| Panel border / action surface | 2 | `scope: 'panel'` opens ink only — five rounds running on the button side |
| Singletons (only one place with that reason) | 6 | Press/lift dialect · vertical underline selection marker · ChromeTile inline reimplementation · border-colour axis · `link` has no `body-lg` step · (remainder not included in the off-ladder heights above) |

**Why zero new axes again**: the two largest categories (type inheritance 13 ·
dense rows 12) are **demands in opposite directions** — one says "emit no
size", the other says "emit a height but not 44". Both touch `link` and each
one's fix invalidates the other's. Which side is the spec is the Systems seat's call, not
something this round decides alone.

### Next round's input — by recovery, with the exhaustive counts

| Rank | What | Recovers | Why not this round |
|---:|---|---:|---|
| 1 | Verdict on `link`'s **two axes: type and target** | 25 | The only decision that opens type-inheritance 13 + dense-row 12 at once. It is a Systems-seat convening matter, and it is why this round did not touch that file |
| 2 | Underline/decoration axis — **or removing prose links from "controls"** | 12 | Half are markdown body, which may not be "things you press". Whether to add an axis or change the classification comes first |
| 3 | Unbinding inset from type | 9 | **The same decision** as the button side's 9 — both numbers come down in one round |
| 4 | Weight axis | 4 | Only `onAccent` loading semibold is the asymmetry today |
| 5 | Borderless vertical tiles | 4 | 2 rail + 2 bottom tabs. `tile` needs a "border 0" branch |
| 6 | The `rounded-full` dialect in `app/error.tsx` · `app/global-error.tsx` | 2 (+2 buttons) | Not missed: these are siblings of the dialect the two 404 files normalised to `<Button>` yesterday, and they must move **together** with the adjacent `<button>`. Expected movement: radius 9999→12 · px 16→18 · type 12.5→14 · ink secondary→primary + background fill. That is a **design verdict**, not a value-layer move, so a different gate owns it |
| 7 | ChromeTile inline reimplementation 1 (`HomePage`) | 1 | Moving to the primitive is the answer, but the icon token differs (`--topology-chrome-icon-size` vs `--chrome-icon`) and it has a badge child, so it is not a drop-in |
| — | Mono uppercase micro 3 | 3 | **Combined with the button side's 5 = 8.** Four rounds running, so it is reviewed as a **part**, not an axis |

════════════════════════════════════════════════════════════════════
## 2026-08-04 combined round — buttons 85 + anchors 83 recounted in one table and judged by combination
════════════════════════════════════════════════════════════════════

Three rounds of "zero new axes" were caused by remaining places sitting in two
or more holes at once, so this round measured **combinations** rather than one
category at a time. The exhaustive re-measurement used the same logic as this
file's parser (brace depth) and 85 · 83 matched the baselines exactly.

### Combined category table (buttons B / anchors A — one place can be in several)

| Category | B | A | Sum | Status |
|---|---:|---:|---:|---|
| Emits no type step (needs inheritance) | 52* | 38* | 90* | Waiting on the `link` redesign (verdict below) — *heuristic over-reports: places whose label sits in a child span, and icon-only places, are mixed in. The anchor round's selective count of 13 is authoritative |
| Inset/type binding (off-ramp (px,py,type)) | 19 | 24 | 43 | Not an axis — **decomposed into three identities** (verdict below) |
| Tint fill (indigo/success a-step background) | 15 | 9 | 24 | Travels with the mono part and panel surfaces |
| Heights off the ladder (h-5/7/9/10/12/16) | 10 | 10 | 20 | Partly chrome tokens and standard-button dialects |
| Always-on underline / decoration | 2 | 13 | 15 | Interaction verdict: 5 prose + 2 pseudo-prose are not controls — goes to the prose contract round |
| Weight (font-medium/semibold) | 8 | 7 | 15 | Axis candidate, consumers fully counted |
| rounded-full dialect (outside pill) | 9 | 5 | 14 | Mostly overlaps the mono CTA |
| **Mono uppercase micro CTA** | 8 | 4 | 12 | **Fifth round running — promoted to a part (verdict below)** |
| Multi-line / grid | 4 | 6 | 10 | "No axis" decision still stands |
| panel surface (border · divider · indigo-bright) | 7 | 1 | 8 | Has consumers — same round as the inset/type decomposition |
| Circular icon | 6 | 0 | 6 | Axis candidate (icon circular branch), 6 consumers |
| border-t list rows | 4 | 2 | 6 | Candidate for a row-divider branch |
| Full-width centred | 6 | 0 | 6 | |
| Scrim / full-screen overlay | 5 | 0 | 5 | Waiting on a new registration claim type |
| Press dialect (active:translate) | 4 | 0 | 4 | |
| 2 dashed · 1 underlined tab · 2 9px type | 5 | 0 | 5 | Singletons |

### Combination analysis — "axis A alone opens N, A+B opens M" (the point of this convening)

For each candidate prescription, how many places it opens **completely**:

| Prescription | Opens alone | Opens in combination |
|---|---:|---|
| Underline / prose reclassification | 17 | — (interaction verdict received; goes to the prose contract round) |
| Chrome-token registration verification | 15 | **7 executed this round** (the rest are the scrim type and settings-sheet contracts) |
| Unbinding inset/type (assuming a single axis) | 13 | +18 (together with mono and tint) — but not solved with an axis (verdict ②) |
| Mono part alone | 3 | **+9–12** (together with tint fill and inset binding — three simultaneous holes is this category's nature) |
| Circular icon branch | 3 | +3 (together with chrome token and tint) |
| panel surface | 3 | +5 (together with inset/type — matching four rounds of observation) |
| border-t row branch | 5 | +2 |

The numbers confirm the premise for convening: **the largest recovery is not a
single axis but the bundle "mono part + tint tone + inset decomposition"
(≈31) and the "link redesign" (type inheritance + dense rows + prose
reclassification, ≈37).** The former needs a part spec; the latter received the
verdict below.

### Verdict (Systems seat, 2026-08-04)

① **`link` stands on the wrong floor — a factual error.** The value layer cites
   WCAG 2.5.8 (AA, 24×24) while loading the 2.5.5 (AAA) / HIG value (44,
   `min-h-11`). 44 is `--touch-target-min`, which design.md pins as the
   **single source for coarse** — 44 across the board on fine pointers violates
   this repository's own touch contract. The `inline` escape hatch exists only
   because the floor is wrong. **Resetting it (floor 24 + coarse promotion +
   deleting the `inline` axis + prose reclassification) moves pixels at 43
   call sites across 28 files, so it gets its own round with a per-place
   table** — this round does the verdict and the comment correction (removing
   the wrong citation) only.
② **Inset/type binding is not an axis.** The (px,py,type) distribution across
   the 43 places is not one hole but three identities: mono command tag (a
   part) · standard-button dialect (px-4/body/h-10) · rows and chips within ±1
   step. A new inset axis would multiply across 8 shapes × 4 sizes and become a
   second system (rule 1 arithmetic).
③ **The mono command tag is promoted to a part** (five rounds running = the
   most repeated category). A behaviour-layer primitive owning the voice
   (font-mono · uppercase · one tracking token · caption) plus its gate, in the
   same PR — first in line next round. Tracking is split 0.08×3 / 0.10 / 0.12 /
   0.14×3 across the exhaustive count, so fixing the value needs on-screen
   measurement.
   (2026-08-04 icon-ramp round re-counted the full range — registered and debt
   alike, every `font-mono`+`uppercase` control tag: **22 places · 5 values** =
   0.06×2 (the docs audit modal, newly found this round) · 0.08×6 · 0.10×2 ·
   0.12×4 · 0.14×8. There is one more value, 0.06, above the four in debt 12 —
   input for the measurement round.)

### Next round — by recovery

| Rank | What | Recovers (est.) | Precondition |
|---:|---|---:|---|
| 1 | `link` reset: floor 24 (min-h-6) + coarse promotion + delete the inline axis + prose reclassification (5 prose · 2 pseudo-prose → prose contract: forced display:inline, underline token, UA focus) | debt ≈37 + consistency across 43 adopted call sites | Per-place table · preload an Inline exemption into the touch-target instrument (otherwise the 5 prose places go falsely red) · dense rows must not use touch-hit-expand (it steals taps) — prefer the gap prescription (gap-1→2.5, height unchanged) |
| 2 | Mono command tag part (+ tint fill tone) | ≈12 | Fix tracking to one value (on-screen measurement) · the amber-isolated place waits for a demotion verdict |
| 3 | Immediate AA repair in dense rows — DomainCouplingCard vertical gap-1→gap-2.5 (centre distance 21→26, row height unchanged) | Clears 1 AA violation | Interaction measurement received — only application remains |
| 4 | panel surface (border · divider · indigo-bright) + remaining inset decomposition | ≈8 | Needs an explicit revision of the scope contract ("signals are scope-independent") |
| 5 | Circular icon branch / border-t row branch / weight axis | 6 / 6 / 15 | Each needs its consumer count re-confirmed |
| 6 | Scrim registration claim type · 4 settings-sheet contracts | 9 | Extend the registration criteria table |

════════════════════════════════════════════════════════════════════
## 2026-08-04 link floor-24 round — executing "next" rank 1 (its own round)
════════════════════════════════════════════════════════════════════

The execution of the combined round's verdict ①. Ledger: docs/DECISIONS.md
2026-08-04 "Link Floor 24." Two things stay in this file:

- **Adopted consumers measured at 40 call sites across 24 files** — the
  verdict's "43 call sites / 28 files" over-reported (re-counted with the same
  brace-depth parser as this file). The per-place before→after table is in the
  PR body and the ledger.
- `link` floor `min-h-11`(44) → **`min-h-6`(24, WCAG 2.5.8 AA)**. The coarse 44
  is emitted by `.touch-hit-expand` — attached at 25 places (21 new), while the
  **15 unattached have less than 12px of clearance to a neighbouring target**
  (tap stealing: a later element's ::after covers an earlier one in DOM order)
  or sit inside genuine sentence/caption rows. Per-place verdicts are in the
  ledger table.
- The `inline` axis was **deleted** — of 14 places counted exhaustively only 3
  were genuinely inside a sentence, and the material for that judgement
  (sibling text source · used display · reflow) is entirely outside static
  view. Inline exemption now happens at runtime instead
  (touch-target-contract's fine-pointer check, INLINE_EXEMPT + spacingClear).
- **Prose reclassification 6** (the `prose` registration above) — anchor debt
  83 → 77. The verdict's "→76" assumed 7 prose; the recount corrected it to 6
  (see the registration comment).

════════════════════════════════════════════════════════════════════
## 2026-08-04 category round — separating "no basis" out of debt (buttons 78 → 74)
════════════════════════════════════════════════════════════════════

Opened by an owner observation: the debt count mixed in **places judged to have
no reason to enter the value layer**, which blurred what the number meant. This
round changed no code — **classification and measurement only.**

### This round's output is not the 4 separated out but the **20 rejected**

The preamble had counted "singletons 14 · multi-line/grid 10" into that
category. Opening each place and re-measuring **against the whole repository as
the denominator**, most were false. A "singleton" was one *within that round's
target set*, not one **in the repository** — two numbers with different
denominators were being called by the same name.

| Claim | Counted then | Exhaustive re-count | True? | Goes to |
|---|---:|---:|---|---|
| Press dialect (`active:translate`) is a singleton | 1 | **5** | false | debt |
| Dashed affordance is a singleton | 2 | **3** | false | debt |
| Deep inset (`px-5`) is a singleton | 1 | **2** | false | debt |
| Underlined tab (`border-b-*`) is a singleton | 2 | **2** — the `tab-bar.tsx` primitive already owns that notation | false | debt (destination `<TabBar>`) |
| Remaining "singletons": vertical underline, border colour, weight, … | ~8 | Grouped by off-ramp **property kind**, at least 6 consumers each (weight 39 · underline 24 · mono 46 …) | false | debt |
| Multi-line / grid rows | 10 | Only **1** opening tag has an actual grid (`DesktopVaultWelcome`). The rest were "multi-line card" judgements, not grids | false | debt |
| Even that **1** | — | Its icon column is a fixed `h-7 w-7`, so `row` (flex+gap) produces the **same pixels**. The grid is taste, not a requirement | false | debt |
| **Full-screen click surfaces (scrim, blocking backdrop)** | 5 | **4** — the fifth (`DemoStage` playback overlay) carries `text-body`/`leading-body`, so the predicate rejected it | **true** | **no-basis 4** |

So **only one category survived**, and the gate rejected one place even inside
it. Same result as yesterday's registration round removing 13 — the lesson was
applied directly.

### Why only the click surface is true — the two things this verdict requires

`isClickSurface()` requires **both**: ① `inset-0` (it covers the screen) ②
**zero** ramp-owned properties (it declares no height, inset, radius, border,
type, or weight). A scrim is placement (`absolute inset-0 z-*`) plus one
background layer, and applying any of the value layer's eight shapes **changes
nothing visible**. There is no spec to apply.

The map's three carry a **contract** instead of a spec —
`data-backdrop-contract="blocks-map-and-closes-composer"` ·
`data-backdrop-surface-token` · `data-interactive-overlay` (the marker the
tour's auto-start suppression reads). They are parts of the overlay machinery,
not of the design system.

### Return rules — three things that stop this category becoming an escape hatch

| If this stops being true | Which check turns red |
|---|---|
| A scrim gains any spec (one `px-3` is enough) | "as many qualifying click surfaces exist as were registered" — the value layer now has something to emit, so it drops into debt |
| A fifth click surface appears anywhere | "the **exhaustive count** for this reason equals the pinned number" (`CLICK_SURFACE_CENSUS`) — a new place is caught both as debt and by the census pin |
| An unqualified place is claimed into this category | Both of the above + "no-basis does not grow" — confirmed with a live probe (`DemoStage` false claim → 4 checks red) |

All three are **machine-measured** and do not rest on anyone's opinion. Seven
probes were all confirmed red (census exceeded · extra control in a registered
file · spec attached · `inset-0` removed · false claim · registry emptied ·
baseline lowered alone).

### What the next round inherits

- **`RecentNodeRow`'s pure `className={className}` pass-through, 1** — the same
  nature as the anchors' `no-spec` registration but not yet registered. This
  round's job was creating a new category, so it was left in debt (the safe
  direction). First in line for the next registration round.
- Now that a scrim type exists, the preamble's **"scrim/full-screen overlay 5,
  awaiting a new claim type"** item is resolved — 4 are no-basis, 1 is debt
  (`DemoStage`).

════════════════════════════════════════════════════════════════════
## History — round by round (417 → 108). **Do not delete**
════════════════════════════════════════════════════════════════════

What each round counted is the evidence for the next promotion. Below is a
compressed form; the numbers and reasons are preserved. The original prose is
in git history (this file's 2026-08-03 revision).

### Why a ratchet and not a lint rule (founding judgement, still valid)

The original proposal was "a `<button>` whose className does not come from
`controlClass()` is a lint error". Per the `/gate-probe` discipline the
inventory was taken before switching it on: **419**. A rule that cannot be
cleared in one PR is noise rather than enforcement, and it buries the existing
signal (96 warnings) too — this repository already has the precedent of banning
`shadow-[` wholesale and watching lint go from 144 to 548. On top of that the
migration is **normalisation**, so pixels change (143 chips carried 50 distinct
size combinations), and a decision that moves pixels belongs to the design
gate, not to a lint rule.

### First measurement (2026-08-03) — 419 counted, baseline 417

By shape: chip 128 · text-link-like 85 · list row 39 · icon square 36 · pill 32
· other/unclassified token radius 58 · card-like 18 · floating/h-8 19 ·
standard button 1. The **2** with no className at all are wrappers and were
excluded, and the ratchet caught that correction itself (its first run went red
with "419 dropped to 417").

⚠️ Parser lesson: if an opening tag is not terminated by **brace depth**, the
`=>` inside `onClick={() => …}` reads as the end of the tag. That happened in
the first measurement and classified 251 of the 419 as "no className", nearly
inverting the conclusion. **Measure the wrong element and the number is wrong
even though it is a number.**

### The descent

| Value | What moved |
|---:|---|
| 417 | First measurement |
| 406 | Settings sheet 11 — chip 6 · icon 2 · row 1 · link-like 1 |
| 389 | 17 of the map's two widgets' 31 — row 8 · link-like 5 · icon 3 · card 2 · chip 1. The 14 left are shapes **not in** the six classifications (vertical action tile 5 · segment tab 3 · window selection chip · vertical edge tab · canvas anchor circle · tree chevron), or 2 places where the ramp's minimum inset (8px) conflicts with this panel's 4px inset |
| 303 | 86 of the docs/quick-drawer/studio 121 — row 27 · icon 24 · chip 21 · link-like 13 · pill 4 · card 2. The 35 left = chrome-token contract 4 · stage absolute positioning 15 · sets that read as one unit 11 · in-sentence inline 5 |
| 269 | Recovering the 48 the two rounds above left "because there was no place for them" — right after filling four holes in the value layer (`a1f956ce9`). Settings sheet 29 + map action tile 5. `tone`'s four new values (secondary 6 · accent 11 · success 2 · warning 2 · danger 1) opened 22, `shape: 'tile'` opened 7, and `link`'s `min-h-11` opened 3 |
| 259 | 10 of the views round's 18 — row 6 · chip 5. **The first time `row`/`sm` exactly matched a hand-written height** (`py-1.5` + `--leading-label` = 28px = `min-h-7`) |
| 227 | 32 of the features round's 63 — chip 15 · pill 6 · link-like 6 · icon 3 · other 2 |
| 210 | 17 of the map views' 31 — icon 9 · pill 4 · chip 1 · link-like 1. The 14 left = not controls 3 (a full-screen backdrop is a scrim, not something that gets pressed) · chrome token 2 · needs truncation 3 · padded text links 3 · no ramp step 3 |
| 173 | 37 of the widgets round's 84 — chip 21 · pill 4 · icon 4 · card 5 · row 2 · link-like 1. Zero new axes. **210 − 37 = 173 matched the exhaustive re-measurement exactly**, meaning the three rounds share no files |
| 148 | Value-layer round, 25 — the result of filling holes the ledger had counted repeatedly. Segment/ghost 12 · panel ink 7 · filled indigo 3 · truncation 3. Three new axes plus an eighth shape |
| 136 | 12 of the studio/history round's 38 — card 7 · chip 2 · segment 2 · onAccent 3 (overlapping). Zero new axes, shapes, or tones. **The history panel moved 0 of 15** — that round first reported "structurally outside the value layer", and 2026-08-04 registered **12** of them (the other 3 are value-layer holes, so debt) |
| 144 | 4 of the primitives/views round's 35. **The output is not the number moved but "why 31 did not move"** — same layer as the value layer 6 · holes already in the ledger 21 · dead primitives that never render 4 |
| 123 | 9 of the remainder round's 57 — chip 6 · segment 2 · icon 1. Zero new axes or values. Four moved chips landed from `h-9`(36) on **`--control-h-md`(32)** = the first measurement showing the ladder #884 restored actually works |
| 119 | **Deleted** two dead primitives — `LinkListEditor` and `ChipListEditor` were exported and unit-tested but had **0** production consumers (exhaustive grep). Exactly those 4 |
| 117 | Value-layer round 2 (Systems seat), 6 — the "one step below sm" that three rounds counted was filled with a **micro tier**: `--radius-micro`(4px — already the value at 96 places) + chip `size: 'xs'` + a redefined `segment/sm`. Alongside: chip/pill default border divider(0.08) → border-soft(0.06) — correcting to the majority of an exhaustive 74:18 |
| **113** | Today, after the accessibility/ink round. On 2026-08-04 it split into **registered 23 + debt 90** |

### What deleting the dead primitives turned up (2026-08-03)

`link-list-editor` was the **only `.tsx` in this repository** using
`data-external-link-marker` (the declaration of the allowed column for a
label-leading `↗`), and `label-decoration.contract.test.ts` leaned on that fact
with *"the number of files using the marker must not be 0"*. **A component
nobody rendered was holding up a rule's allowance clause.** The allowance stays
(WCAG G201 — warn before opening a new window) and the gate's idling guard moved
from "files using the exception" to "files scanned + a synthetic probe". Ledger:
`docs/DECISIONS.md` 2026-08-03 "Two Dead Primitives."

### What the value-layer round **did not build** — that is a conclusion too

`/gate-probe`'s step-1 discipline ("if noise buries the signal, do not build the
rule") applied to axes as well. **An axis with no consumer does not get built.**

| What the ledger asked for | Why it was not built (measured) |
|---|---|
| `card`'s `items-start` (multi-line cards) | One axis does not open it. The three consumers differ on **two or more axes** (`FirstRunPage`'s 3 are `grid-cols-[32px_1fr]` · `rounded-chip` · `px-4 py-3.5`; `DesktopVaultWelcome`'s 4 are full-bleed radius 0 with `px-4 py-4`). Opening alignment alone admits **not one place** = an axis with 0 users |
| A `tracking-<step>` partner for `text-<step>` | Emittable, but it **changes the width of all 244 places today** (0.02em × 11px ≈ +1.3px on a 6-character chip). The honest fix is binding `--text-<step>--letter-spacing` in globals.css, which needs its own measurement round |
| Splitting `active` from a "selected" axis | An exhaustive measurement of 12 segment places found **12/12 indigo tint background**, with only the ink differing (primary 11 · accent 1). Normalised to the majority instead of adding an axis |
| `--chrome-radius-inner`(7px) | **Not a hole.** In globals.css it is an alias for `var(--radius-chip)` = 6px. The ledger's "7px" is a stale record, and this is the basis for `segment` using `rounded-chip` |
| A `fixedHeight` axis | **Deleted** 2026-08-03. It was a symptom of wrong values, not an axis |

### Ladder measurement (2026-08-03, 1512×860 · dark) — only 7 of 18 combinations sit on the ladder

The ladder is **28 / 32 / 40**:

| Shape | sm | md | lg |
|---|---:|---:|---:|
| chip | 24 | **32** | **32** |
| pill | 24 | **32** | **32** |
| segment | 22 | 24 | **32** |
| row | **28** | 36 | 42 |
| card | 30 | 34 | **40** |
| icon | 24 | **28** | **32** |

Three readings: ① 22 · 24 · 30 · 34 · 36 · 42 are still **outside** this app's
height vocabulary ② `chip`/`pill` have identical md and lg heights, so "one size
larger" does nothing to the height ③ the chip family has no 40px
(`--control-h-lg`) step.

### The first time the value layer widened a contract's reach

The studio/history round moved 6 studio headers, 3 of which carried
`text-caption`(9.5px) — `studio-navigation.spec.ts`'s "chrome labels are one
value, 11px" contract only covered `studio-save` and `studio-exit`, so their
siblings had slipped out. Moving them to the ramp (`card/sm` = `text-label`)
made places the contract never measured become contract-valued automatically.
/
