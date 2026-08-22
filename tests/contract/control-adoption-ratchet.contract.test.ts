import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Control adoption ratchet — **hand-written control classNames can never grow.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Today's numbers (2026-08-04) — read this part first
 * ════════════════════════════════════════════════════════════════════
 *
 * There are **six** counts: two tag families (button, anchor) × three categories.
 * They used to be one lump of 113, which made progress unreadable. The split
 * order is this table: registered/debt (first round, 2026-08-04) → anchors split
 * out (second) → **no-basis (third)**.
 *
 * ## ✅ Round closed (2026-08-06) — **zero places still style controls by hand**
 *
 * Owner: *"판정이 끝났다는 건 뭔 말임? 고칠 게 없다는 뜻임? 그럼 종료를 선언해
 * 줘야지 다음에 또 안 찾지 않을까?"*
 * (if the verdict is final and there is nothing left to fix, declare the round
 * closed so the next person does not go looking again)
 *
 * | | 2026-08-05 | now |
 * |---|---:|---:|
 * | hand-written **buttons** | 74 | **0** |
 * | hand-written **links** | 67 | **0** |
 * | hand-written **form elements** | 63 | **0** |
 *
 * **While those three are 0 this round is finished.** Everything left is a place
 * the design system *cannot in principle* produce, **listed with its reason**,
 * and every row carries a `conditional` — the "when do we reopen this" clause. If
 * the missing capability lands, the row is deleted and the place drops back into
 * debt.
 *
 * The only way a count stops being 0 is a **newly hand-written control**, and
 * that is exactly when this file turns red.
 *
 * ## Vocabulary (2026-08-06, owner asked)
 *
 * | This file's word | What it means |
 * |---|---|
 * | **debt** | Places styled by hand instead of through the design system. The more there are, the more the same button differs from screen to screen |
 * | **registered** | A place the design system **cannot in principle** produce, listed with the evidence for why. Not an exemption — a record that "there is no way today". If a way appears it drops back into debt |
 * | **no-basis** | A place the design system *could* produce but there is nothing to produce — a transparent click surface with no visible spec. Not something to fix |
 * | **ratchet** | A gate that pins today's number as a ceiling so an improved count can never regress |
 *
 * **"Button debt 0" means no button is styled by hand any more.**
 *
 * | Count | One line | Which way it moves |
 * |---:|---|---|
 * | **button registered 32** | The value layer **cannot in principle** emit this (`OUTSIDE_VALUE_LAYER`) | To raise it you edit `BASELINE_REGISTERED` **by hand**. That diff is where the "why" goes |
 * | **button no-basis 4** | The value layer could emit, but there is nothing to emit — not a control (`NO_BASIS`) | Standing still is correct. **Not debt to repay** |
 * | **button debt 0** | Movable but not yet moved | **Targets 0.** Button progress is read here and nowhere else |
 * | **anchor registered 29** | Same meaning, anchors (`OUTSIDE_VALUE_LAYER_ANCHORS`) | Raise `BASELINE_ANCHOR_REGISTERED` by hand |
 * | **anchor no-basis 0** | Measured — all 102 inspected, result 0 (`<a>` exists to go somewhere, so it rarely becomes a spec-less click surface) | Raise by hand when a qualifying place appears |
 * | **anchor debt 0** | Unregistered remainder of 23 `<Link>` + 14 `<a>` not yet moved | **Targets 0** |
 * | **form debt 0** | Hand-specced `<input>`/`<textarea>`/`<select>`/`<label>` (added 2026-08-05; on 08-06 it went 63→57→29→20) | **Targets 0.** Every text field moved and native `<select>` debt reached **0**. The remaining 20 are layout-only labels (not a spec) + 5 checkboxes (own contract pins them) + slider, full-screen editor, stage inputs |
 * | button total 108 · anchor total 102 · form total 63 | Sum per family | Derived. Do not judge from these |
 *
 * **Why three categories — because debt has to be able to reach 0.** Mixing
 * "cannot in principle" and "nothing to emit" into debt makes a number that can
 * never reach 0, and a number that cannot reach 0 is decoration, not a progress
 * gauge. The owner's point was exactly this: *"할 필요가 없다는 건 디자인
 * 시스템으로 만들 필요가 없거나 관련 없는 부분이라는 거 아냐? 그러면 아예
 * 제외하는 게 맞고, 수에 포함시키면 헷갈리니."*
 * (if a place does not need the design system it should be excluded outright;
 * counting it in only confuses the number)
 *
 * ⚠️ **Before 2026-08-04 this gate counted only `<button>`.** So "debt 85" was
 * never once the count of *all* controls — 109 anchors could grow freely outside
 * the gate's field of view. The number did not jump to 194; that much had been
 * going uncounted the whole time.
 *
 * ### ⚠️ The registry is a debt list, not a permit list
 *
 * Inherited verbatim from the hard-cut registry's preamble
 * (`surface-motion-ratchet.contract.test.ts`): *"if you find a hard-cut surface
 * that is not listed here, you fix it — you do not add a row."*
 *
 * 1. **Register only what has been verified.** "Probably cannot be moved" is
 *    debt, not a registration. Unverified things sitting on the debt side is an
 *    error in the **safe direction**.
 * 2. **Registering a file does not exempt that file.** A row registers a
 *    **count**, not a file. Write one more hand control in a registered file and
 *    the registered count is unchanged while debt goes up by 1 = red.
 * 3. **When the evidence disappears the row dies.** Each row carries a `proof`
 *    string; when that string vanishes from the file the gate reports that the
 *    claim is dead. `chrome-token` rows carry one more layer — the gate checks
 *    globals.css to see whether the token really is beyond the fixed steps. The
 *    day such a token becomes an ordinary px value, that row turns red and drops
 *    into debt.
 * 4. **If registration becomes an escape hatch this round has failed.**
 *    Registering something that could have been moved is exactly that failure.
 *
 * ### The registration test — the line between "outside forever" and "not moved yet"
 *
 * The value layer (`controlClass()`) emits a **className**. So these are things
 * it cannot express in principle, and adding an axis would not change that:
 *
 * | Claim | What is outside the value layer |
 * |---|---|
 * | `chrome-token` | A chrome token owns the dimension. The value layer's height vocabulary is **fixed steps only**, while these tokens are `clamp(38px, 4.2vh, 48px)` or get **redefined to a different value** at narrow widths / coarse pointers. A fixed-step ramp can express neither a viewport function nor a pointer promotion |
 * | `stage-geometry` | The dimension comes from **JS-computed `style`**, not className (absolutely positioned stage coordinates). A ramp cannot emit style |
 * | `value-layer-peer` | The value layer's **own house**. This is where a primitive declares its own spec. Forcing it through would break the contract or push colour/dimension out through `className` and neutralise the layer — a layer cannot consume itself |
 * | `standard-button` *(anchors, 2026-08-04)* | **The one shape the value layer explicitly yielded.** `control-class.ts` says so in its own preamble: *"표준 버튼(`<Button>`)을 대체하지 않는다 … 겹치는 자리를 만들면 «어느 쪽이 규격인가»가 흐려진다"* (it does not replace the standard button; overlapping places blur which one is the spec). So an anchor passing through `buttonVariants()` **already went through a value layer**, and moving it to `controlClass` would violate that rule rather than comply with it |
 * | `no-spec` *(anchors, 2026-08-04)* | The tag declares **no shape, size, or colour at all** — either a pure `className={className}` pass-through or a single `"inline-flex"` for placement. There is nothing for the value layer to emit, and placement is the layer the value layer itself defined as `className`'s share |
 * | `state-scoped` *(anchors, 2026-08-04)* | The whole spec exists **only under a variant prefix** (a `focus:` skip link — `sr-only` at rest). `controlClass()` emits a prefix-less class string, so no prefix can be attached |
 * | `prose` *(anchors, 2026-08-04 link floor round)* | **Prose, not a control.** A link inside markdown body flow — its siblings are text, the parent `--leading-prose` owns the line box, and WCAG 2.5.8 exempts inline text. All eight value-layer shapes are flex-family, so **display:inline is impossible in principle** (inline-flex kills wrapping at 320px — measured rect 1 vs 2). Its destination is the `.prose-link` contract (`prose-link.contract.test.ts`) |
 *
 * Conversely, **"the value layer does not have that shape yet" is not grounds for
 * registration.** That is a place 체계 (the design-systems seat) opens by adding a
 * part, so it is **debt**. This distinction is the whole of this round.
 *
 * ### How to read the three categories — two questions per place
 *
 * 1. **Can the value layer emit this?** No → **registered** (one of the claim
 *    types above).
 * 2. If yes, **is there anything to emit?** Yes → **debt** (move it). No →
 *    **no-basis** (`NO_BASIS` — see the 2026-08-04 category round below).
 *
 * Only one case answers "no" to (2) today: a **screen-covering click surface**
 * (scrim, blocking backdrop). It declares no shape, size, type, or ink, so there
 * is nothing for the value layer to apply.
 * ⚠️ "moving it is a hassle" and "pixels would shift" are not answers to (2) —
 * those are debt.
 *
 * A row with `conditional` means "move it once X exists" — the day the value
 * layer gains that axis, delete the registration, drop it into debt, and repay it.
 *
 * ### The 2026-08-04 registration round **rejected 13** — the claims were false
 *
 * The round opened with "git 15 · shared/ui 10 · studio 11 = 36 are outside the
 * value layer". Opening each place, only **23 were true**:
 *
 * | Rejected place | n | Why the claim was false |
 * |---|---:|---|
 * | `atlas-git-panel/ui/CommitDetail.tsx` | 2 | Does **not** use `--git-*` tokens. Underlined tab (`min-h-9 border-b-2`) and deep-inset row (`px-5`) — both are value-layer holes the ledger had already counted = debt |
 * | `atlas-git-panel/ui/ConceptEgoCard.tsx` | 1 | Same. A text control inside a `flex-wrap` list — the "dense wrap" hole = debt |
 * | `shared/ui/node-explanation-edit.tsx` | 3 | It merely **lives in** `src/shared/ui`; it is not a primitive. `h-6 w-6 rounded-full` is the "no circular icon control" hole the ledger had already named = debt |
 * | `shared/ui/info-hint.tsx` | 1 | The same circular-icon hole = debt |
 * | `shared/ui/compact-copy-button.tsx` | 1 | `rounded-chip px-2 py-1 text-label` are ramp values. The only thing outside is the `active:translate-y` press dialect = debt |
 * | `ontology-studio/**` — 3 in-sentence controls · 1 dashed picker · 1 `rounded-2xl` entry card | 5 | Not "stage geometry". The first four are the inline/dashed holes; the last is a ramp-pending exception **already visibly registered with owner approval + `eslint-disable`** = debt |
 *
 * ⚠️ **Also: the claim that `studio-navigation.spec.ts` pins those dimensions as
 * a contract — offered as the basis for the studio 11 — is not true.** That spec
 * measures only `fontSize`/`height` of `studio-save` and `studio-exit`, and
 * neither is among the 11. The real reason three stage places are outside the
 * value layer is not an e2e contract but
 * **`style={{left, top, width: layout.socket.w …}}`** — they were registered
 * under corrected evidence.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## What debt 90 is waiting on — the value layer's holes (next round's input)
 * ════════════════════════════════════════════════════════════════════
 *
 * Every round counted "why it could not be moved". That inventory lives here once.
 * Each number is the measurement from the last round that counted that hole.
 *
 * | Hole | Last measured | What is missing |
 * |---|---:|---|
 * | **The size ramp binds inset and type into one step** | 9 | "Large inset + small type" really exists (5 mono micro CTAs · 2 success-tint actions · settings notification chip · `MarkdownField` tab). Moving them changes the type — this is not an axis but 체계's call on **which side is the spec** |
 * | **`scope: 'panel'` opens ink only** | 7 | Border and indigo are still outside: `--topology-v2-panel-border`(#2a2a30) · `--topology-v2-panel-divider`(#23232a) · `--topology-v2-indigo-bright`(#8890e0 ≠ global #7170ff). The value layer's comment asserts *"패널 램프에 인디고는 없다"* (there is no indigo in the panel ramp) — but there is |
 * | **No circular icon control** | 6 | `icon` is pinned to `rounded-chip`. Turning a 24px circle into a 6px square is not normalisation but an **identity change**, so it was not decided alone without convening 체계 |
 * | **Secondary controls inside dense rows / wraps** | 5 + 1 | Loading `link`'s `min-h-11` (WCAG 2.5.8) makes the row 2–3× taller. The `inline` axis exempts "inside a **sentence**" only and cannot say "inside a dense row" |
 * | **Three-column grid rows** | 3 | `STEP_ROW` (visual · name · why). `row` is flex-only |
 * | **`tone: 'accent'` is a marker, not ink** | 3 | There are two indigos — marker `--color-indigo-accent`(#7170ff) and text `--color-indigo-text-soft`(#bcc3ffeb). Measured on tint: accent **3.55–4.25:1 (below AA)** vs text-soft **7.09–8.37:1**. Not an unmoved place but a **latent defect in the value layer itself** |
 * | **Tabs whose selection marker is an underline** | 2 | `segment` is defined as "border 0" so it cannot draw a `border-b-2` tab. Switching to a tint is not normalisation but a **notation change** = the design gate's call |
 * | **Dashed border = "fillable" affordance** | 2 | The stage's "connect more" and the picker's "create new". Border *style* is shape, so passing it through `className` neutralises the layer |
 * | **Full-width centred + touch promotion** | 2 | `chip`/`card` are content-width so they have no `justify-center`, and `segment`, which has `justify-center`, has no border = there is no "bordered full-width centred button" |
 * | **Floating segment** | 2 | `segment`'s pressed state is a single indigo tint, but two places use a dialect where a `--color-panel` thumb floats over the track (`LocaleSwitch` · settings `SegmentSwitch`) and one of them is pinned by a contract string |
 * | **No place that emits no type step** | 2 | All eight shapes force a size, so a control that must **inherit** the parent font size structurally cannot enter |
 * | **No bordered icon square** | 2 | `QueueRowActions` kebab · `HubRail`. With only two consumers this is **not an axis yet** — record the number and move on |
 * | **pill's shallow vertical inset** | 2 | The ramp is 2·2·4px but real filter pills are 6–10px. Raising it also grows the type |
 * | **Deep-inset list row** | 1 | The commit file row's `px-5`. `row` maxes out at `px-3` |
 * | **16px radius outside the ramp** | 1 | The entry selection card — an exception **already visibly registered** with owner approval + `eslint-disable`. Registering `--radius-surface`(16) is the next design pass |
 * | **Press dialect (`active:translate-y`)** | 1 | `compact-copy-button`. The value layer has no press axis |
 *
 * ### Registration candidates verified — the 2026-08-04 combined round confirmed and registered 7
 *
 * The paragraph above had deferred chrome-token candidates to "the next
 * registration round"; each was opened: `SearchPalette` · `GlobalSearch` ·
 * `ShortcutSheet` · `DocsHeaderTile` · `BackToTopButton` · `GitStatusTile` ·
 * `AppNavRail` (button family) = **7 registered**. Verification caught one defect
 * — GlobalSearch's dedicated token was a **single fixed 32px declaration**, so
 * `tokenIsBeyondFixedSteps` rejected it (meanwhile the coarse-promotion block
 * comment claimed it was "already covered"); it was registered only after being
 * converged onto `--overlay-close-size`. **Still unverified candidates**: 5
 * scrim/full-screen overlays (needs a new claim type) · 4 settings-sheet contract
 * strings — left in debt (the safe direction).
 *
 * ### This count **over-reports** — a known limit
 *
 * What is counted is the **literal** `controlClass(` in an opening tag (a tag
 * using a constant built by `controlClass()` in the same file passes). So a
 * finished class that went through the ramp but is imported from **another file**
 * is caught as "hand-written". The error is in the safe direction (there is no
 * under-reporting), but it penalises the correct refactor of extracting a shared
 * constant.
 *
 * ### 2026-08-04 hole round — debt 90 → 85, and **zero new axes**
 *
 * The remaining 77 (unregistered at the start of that round) were sorted
 * exhaustively. **This round's output is not the 5 moved but the "why no axis was
 * created".**
 *
 * | Category | n | What it is |
 * |---|---:|---|
 * | **Re-judged as outside the value layer** | 25 | 10 chrome-token contracts · 5 scrim/full-screen overlays · 4 settings sheets whose contract pins the class string · 6 error/404 standard-button places (4 adopted this round) → **21 go to the next registration round** |
 * | **Mono uppercase micro CTA** | 5 | **Third round running.** First in line for the next verdict — but reviewed as a **part**, not an axis (rule 1) |
 * | Multi-line / grid rows | 10 | The earlier "no axis" decision still stands |
 * | panel border / indigo | 6 | **Fourth round running.** But all overlap a second hole, so alone they recover 0–1 |
 * | Inset floor / asymmetry | 5 | |
 * | Type / ink inheritance | 5 | |
 * | 40px · 3 tint fills · 2 in dense rows · 1 chip 28px | 6 | |
 * | Singletons (only one place with that reason) | 14 | Cannot justify an axis |
 *
 * **Why no axis at all**: most remaining places sit in **two or more holes at
 * once** (e.g. panel indigo + inset/type binding). So any single new axis opens
 * 0–1 places **on its own**. An axis with 0–1 consumers does not get built — the
 * same standard that killed `fixedHeight`. **The 6 panel border/indigo places
 * only open in the same round that unbinds inset from type.**
 *
 * **Re-measurement corrected two earlier observations**: "circular icon 6" is
 * **2** within this target set (four live in `shared/ui`, outside the value
 * layer), and `HubRail` is a vertical edge tab rather than a bordered icon
 * square, so squares number **1** and are still not an axis.
 *
 * The 5 moved: two 404 files adopted `<Button>` (contrast at those places
 * corrected **4.42 → 4.70** — they sit outside `a11y-ratchet`'s ROUTES so the
 * ratchet could not see them) · `rounded-[4px]` + eslint-disable →
 * `rounded-micro` (the disable's reason disappeared with registration).
 *
 * ⚠️ Side measurement: raw `buttonVariants()` leaves **both** the base's
 * `border-transparent` and the variant border in place, and CSS source order lets
 * transparent win. `<Link>` consumers must merge through `cn`.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 anchor round — all 110 sorted exhaustively
 * ════════════════════════════════════════════════════════════════════
 *
 * The 110 present on the day the anchor gate was switched on were opened and
 * classified place by place. **This round's output is not the 8 moved but the
 * exhaustive "why the other 102 do not move"** — that is exactly how the button
 * side went from 417 to 85.
 *
 * ### The 8 moved — only two categories, both evidenced by measurement
 *
 * | Category | n | Actual movement |
 * |---|---:|---|
 * | `chip`/`md` **exact match** | 5 | **0px.** The hand class was `min-h-8 px-2.5 text-label` + `border-soft` + `rounded-chip` and the ramp emits the same values. The ramp's added `py-1.5` only makes the natural height 16+12+2=30, so `min-h-8`(32) still wins |
 * | `link`/`lg`/`scope:panel` | 3 | **+10px** (FullDetailA1 handoff row). This is not normalisation but an **accessibility correction** — that place was a 20px-tall text target, **below** WCAG 2.5.8's 24px floor (a standalone control, not covered by the in-sentence exemption). `link`'s `min-h-11` is the axis that defaults precisely to prevent this defect |
 *
 * ### The remaining 102 — 19 registered · 83 debt
 *
 * | Category | n | What is missing / why it is outside |
 * |---|---:|---|
 * | **[registered] `standard-button`** | 10 | The shape the value layer yielded. DownloadPage 7 · AgentClientButtons 1 · two 404 files 2 |
 * | **[registered] `chrome-token`** | 4 | AtlasGitPanel 2 (`--git-setup-action-height`) · AppNavRail 1 (`--app-nav-rail-tile-height`) · TopologyReviewLink 1 (`--chrome-tile-size`). All three have two or more declarations, so they pass the token check |
 * | **[registered] `no-spec`** | 3 | MacosDownloadLink (pass-through) · PublicQuickActions 2 (`inline-flex` wrappers) |
 * | **[registered] `value-layer-peer`** | 1 | `ChromeTile`'s `<Link>` branch |
 * | **[registered] `state-scoped`** | 1 | Skip link |
 * | No place that emits **no** type step | 13 | All eight shapes force a size, so an anchor that must **inherit** the parent size structurally cannot enter. The button ledger counted this hole as "2"; among anchors it is **13** — the largest category of this round and first in line for the next verdict |
 * | Text links in dense rows / sentences | 12 | `link`'s `min-h-11` (WCAG 2.5.8) makes top bars, in-chip links, and two-link rows 2–3× taller. The `inline` axis exempts "inside a **sentence**" only |
 * | **Always-on underline + `decoration-*`** | 12 | The value layer has **no** underline/decoration axis at all. Half are markdown body links (docs 5 · gateway 2) and are therefore **prose, not controls** — whether to build an axis or remove this category from "controls" is 체계's call |
 * | Inset and type bound into one step | 9 | The hole the button ledger counted as "9". Exactly 9 among anchors too |
 * | No weight axis (`font-medium`/`semibold`) | 4 | Only `onAccent` loads semibold, and it loads it fixed |
 * | Borderless **vertical** tiles | 4 | 2 rail · 2 bottom tabs. `tile` requires border, radius, and inset. ⚠️ A `chrome-token` claim for the bottom tab's `--topology-bottom-tab-min-height` was **rejected** — it is a single fixed 56px declaration and the token check refuses it (a case of the gate actually blocking a registration escape) |
 * | Heights off the ladder | 3+2+2+1+2 | 36px 3 · 28px 2 · 40px chip 2 · 48px sheet row 1 · 40px `rounded-full` dialect 2 |
 * | Tint / overlay fills | 3 | |
 * | Mono uppercase micro | 3 | **The same category** as the button side. Together 8, and four rounds running |
 * | Multi-line / grid cards | 3 | Earlier "no axis" decision still stands |
 * | `border-t` list rows | 3 | `row` has no divider |
 * | Panel border / action surface | 2 | `scope: 'panel'` opens ink only — five rounds running on the button side |
 * | Singletons (only one place with that reason) | 6 | Press/lift dialect · vertical underline selection marker · ChromeTile inline reimplementation · border-colour axis · `link` has no `body-lg` step · (remainder not included in the off-ladder heights above) |
 *
 * **Why zero new axes again**: the two largest categories (type inheritance 13 ·
 * dense rows 12) are **demands in opposite directions** — one says "emit no
 * size", the other says "emit a height but not 44". Both touch `link` and each
 * one's fix invalidates the other's. Which side is the spec is 체계's call, not
 * something this round decides alone.
 *
 * ### Next round's input — by recovery, with the exhaustive counts
 *
 * | Rank | What | Recovers | Why not this round |
 * |---:|---|---:|---|
 * | 1 | Verdict on `link`'s **two axes: type and target** | 25 | The only decision that opens type-inheritance 13 + dense-row 12 at once. It is a 체계 convening matter, and it is why this round did not touch that file |
 * | 2 | Underline/decoration axis — **or removing prose links from "controls"** | 12 | Half are markdown body, which may not be "things you press". Whether to add an axis or change the classification comes first |
 * | 3 | Unbinding inset from type | 9 | **The same decision** as the button side's 9 — both numbers come down in one round |
 * | 4 | Weight axis | 4 | Only `onAccent` loading semibold is the asymmetry today |
 * | 5 | Borderless vertical tiles | 4 | 2 rail + 2 bottom tabs. `tile` needs a "border 0" branch |
 * | 6 | The `rounded-full` dialect in `app/error.tsx` · `app/global-error.tsx` | 2 (+2 buttons) | Not missed: these are siblings of the dialect the two 404 files normalised to `<Button>` yesterday, and they must move **together** with the adjacent `<button>`. Expected movement: radius 9999→12 · px 16→18 · type 12.5→14 · ink secondary→primary + background fill. That is a **design verdict**, not a value-layer move, so a different gate owns it |
 * | 7 | ChromeTile inline reimplementation 1 (`HomePage`) | 1 | Moving to the primitive is the answer, but the icon token differs (`--topology-chrome-icon-size` vs `--chrome-icon`) and it has a badge child, so it is not a drop-in |
 * | — | Mono uppercase micro 3 | 3 | **Combined with the button side's 5 = 8.** Four rounds running, so it is reviewed as a **part**, not an axis |
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 combined round — buttons 85 + anchors 83 recounted in one table and judged by combination
 * ════════════════════════════════════════════════════════════════════
 *
 * Three rounds of "zero new axes" were caused by remaining places sitting in two
 * or more holes at once, so this round measured **combinations** rather than one
 * category at a time. The exhaustive re-measurement used the same logic as this
 * file's parser (brace depth) and 85 · 83 matched the baselines exactly.
 *
 * ### Combined category table (buttons B / anchors A — one place can be in several)
 *
 * | Category | B | A | Sum | Status |
 * |---|---:|---:|---:|---|
 * | Emits no type step (needs inheritance) | 52* | 38* | 90* | Waiting on the `link` redesign (verdict below) — *heuristic over-reports: places whose label sits in a child span, and icon-only places, are mixed in. The anchor round's selective count of 13 is authoritative |
 * | Inset/type binding (off-ramp (px,py,type)) | 19 | 24 | 43 | Not an axis — **decomposed into three identities** (verdict below) |
 * | Tint fill (indigo/success a-step background) | 15 | 9 | 24 | Travels with the mono part and panel surfaces |
 * | Heights off the ladder (h-5/7/9/10/12/16) | 10 | 10 | 20 | Partly chrome tokens and standard-button dialects |
 * | Always-on underline / decoration | 2 | 13 | 15 | Interaction verdict: 5 prose + 2 pseudo-prose are not controls — goes to the prose contract round |
 * | Weight (font-medium/semibold) | 8 | 7 | 15 | Axis candidate, consumers fully counted |
 * | rounded-full dialect (outside pill) | 9 | 5 | 14 | Mostly overlaps the mono CTA |
 * | **Mono uppercase micro CTA** | 8 | 4 | 12 | **Fifth round running — promoted to a part (verdict below)** |
 * | Multi-line / grid | 4 | 6 | 10 | "No axis" decision still stands |
 * | panel surface (border · divider · indigo-bright) | 7 | 1 | 8 | Has consumers — same round as the inset/type decomposition |
 * | Circular icon | 6 | 0 | 6 | Axis candidate (icon circular branch), 6 consumers |
 * | border-t list rows | 4 | 2 | 6 | Candidate for a row-divider branch |
 * | Full-width centred | 6 | 0 | 6 | |
 * | Scrim / full-screen overlay | 5 | 0 | 5 | Waiting on a new registration claim type |
 * | Press dialect (active:translate) | 4 | 0 | 4 | |
 * | 2 dashed · 1 underlined tab · 2 9px type | 5 | 0 | 5 | Singletons |
 *
 * ### Combination analysis — "axis A alone opens N, A+B opens M" (the point of this convening)
 *
 * For each candidate prescription, how many places it opens **completely**:
 *
 * | Prescription | Opens alone | Opens in combination |
 * |---|---:|---|
 * | Underline / prose reclassification | 17 | — (interaction verdict received; goes to the prose contract round) |
 * | Chrome-token registration verification | 15 | **7 executed this round** (the rest are the scrim type and settings-sheet contracts) |
 * | Unbinding inset/type (assuming a single axis) | 13 | +18 (together with mono and tint) — but not solved with an axis (verdict ②) |
 * | Mono part alone | 3 | **+9–12** (together with tint fill and inset binding — three simultaneous holes is this category's nature) |
 * | Circular icon branch | 3 | +3 (together with chrome token and tint) |
 * | panel surface | 3 | +5 (together with inset/type — matching four rounds of observation) |
 * | border-t row branch | 5 | +2 |
 *
 * The numbers confirm the premise for convening: **the largest recovery is not a
 * single axis but the bundle "mono part + tint tone + inset decomposition"
 * (≈31) and the "link redesign" (type inheritance + dense rows + prose
 * reclassification, ≈37).** The former needs a part spec; the latter received the
 * verdict below.
 *
 * ### Verdict (체계 seat, 2026-08-04)
 *
 * ① **`link` stands on the wrong floor — a factual error.** The value layer cites
 *    WCAG 2.5.8 (AA, 24×24) while loading the 2.5.5 (AAA) / HIG value (44,
 *    `min-h-11`). 44 is `--touch-target-min`, which design.md pins as the
 *    **single source for coarse** — 44 across the board on fine pointers violates
 *    this repository's own touch contract. The `inline` escape hatch exists only
 *    because the floor is wrong. **Resetting it (floor 24 + coarse promotion +
 *    deleting the `inline` axis + prose reclassification) moves pixels at 43
 *    call sites across 28 files, so it gets its own round with a per-place
 *    table** — this round does the verdict and the comment correction (removing
 *    the wrong citation) only.
 * ② **Inset/type binding is not an axis.** The (px,py,type) distribution across
 *    the 43 places is not one hole but three identities: mono command tag (a
 *    part) · standard-button dialect (px-4/body/h-10) · rows and chips within ±1
 *    step. A new inset axis would multiply across 8 shapes × 4 sizes and become a
 *    second system (rule 1 arithmetic).
 * ③ **The mono command tag is promoted to a part** (five rounds running = the
 *    most repeated category). A behaviour-layer primitive owning the voice
 *    (font-mono · uppercase · one tracking token · caption) plus its gate, in the
 *    same PR — first in line next round. Tracking is split 0.08×3 / 0.10 / 0.12 /
 *    0.14×3 across the exhaustive count, so fixing the value needs on-screen
 *    measurement.
 *    (2026-08-04 icon-ramp round re-counted the full range — registered and debt
 *    alike, every `font-mono`+`uppercase` control tag: **22 places · 5 values** =
 *    0.06×2 (the docs audit modal, newly found this round) · 0.08×6 · 0.10×2 ·
 *    0.12×4 · 0.14×8. There is one more value, 0.06, above the four in debt 12 —
 *    input for the measurement round.)
 *
 * ### Next round — by recovery
 *
 * | Rank | What | Recovers (est.) | Precondition |
 * |---:|---|---:|---|
 * | 1 | `link` reset: floor 24 (min-h-6) + coarse promotion + delete the inline axis + prose reclassification (5 prose · 2 pseudo-prose → prose contract: forced display:inline, underline token, UA focus) | debt ≈37 + consistency across 43 adopted call sites | Per-place table · preload an Inline exemption into the touch-target instrument (otherwise the 5 prose places go falsely red) · dense rows must not use touch-hit-expand (it steals taps) — prefer the gap prescription (gap-1→2.5, height unchanged) |
 * | 2 | Mono command tag part (+ tint fill tone) | ≈12 | Fix tracking to one value (on-screen measurement) · the amber-isolated place waits for a demotion verdict |
 * | 3 | Immediate AA repair in dense rows — DomainCouplingCard vertical gap-1→gap-2.5 (centre distance 21→26, row height unchanged) | Clears 1 AA violation | Interaction measurement received — only application remains |
 * | 4 | panel surface (border · divider · indigo-bright) + remaining inset decomposition | ≈8 | Needs an explicit revision of the scope contract ("signals are scope-independent") |
 * | 5 | Circular icon branch / border-t row branch / weight axis | 6 / 6 / 15 | Each needs its consumer count re-confirmed |
 * | 6 | Scrim registration claim type · 4 settings-sheet contracts | 9 | Extend the registration criteria table |
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 link floor-24 round — executing "next" rank 1 (its own round)
 * ════════════════════════════════════════════════════════════════════
 *
 * The execution of the combined round's verdict ①. Ledger: docs/DECISIONS.md
 * 2026-08-04 「link 바닥 24」 (the link floor of 24). Two things stay in this file:
 *
 * - **Adopted consumers measured at 40 call sites across 24 files** — the
 *   verdict's "43 call sites / 28 files" over-reported (re-counted with the same
 *   brace-depth parser as this file). The per-place before→after table is in the
 *   PR body and the ledger.
 * - `link` floor `min-h-11`(44) → **`min-h-6`(24, WCAG 2.5.8 AA)**. The coarse 44
 *   is emitted by `.touch-hit-expand` — attached at 25 places (21 new), while the
 *   **15 unattached have less than 12px of clearance to a neighbouring target**
 *   (tap stealing: a later element's ::after covers an earlier one in DOM order)
 *   or sit inside genuine sentence/caption rows. Per-place verdicts are in the
 *   ledger table.
 * - The `inline` axis was **deleted** — of 14 places counted exhaustively only 3
 *   were genuinely inside a sentence, and the material for that judgement
 *   (sibling text source · used display · reflow) is entirely outside static
 *   view. Inline exemption now happens at runtime instead
 *   (touch-target-contract's fine-pointer check, INLINE_EXEMPT + spacingClear).
 * - **Prose reclassification 6** (the `prose` registration above) — anchor debt
 *   83 → 77. The verdict's "→76" assumed 7 prose; the recount corrected it to 6
 *   (see the registration comment).
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 category round — separating "no basis" out of debt (buttons 78 → 74)
 * ════════════════════════════════════════════════════════════════════
 *
 * Opened by an owner observation: the debt count mixed in **places judged to have
 * no reason to enter the value layer**, which blurred what the number meant. This
 * round changed no code — **classification and measurement only.**
 *
 * ### This round's output is not the 4 separated out but the **20 rejected**
 *
 * The preamble had counted "singletons 14 · multi-line/grid 10" into that
 * category. Opening each place and re-measuring **against the whole repository as
 * the denominator**, most were false. A "singleton" was one *within that round's
 * target set*, not one **in the repository** — two numbers with different
 * denominators were being called by the same name.
 *
 * | Claim | Counted then | Exhaustive re-count | True? | Goes to |
 * |---|---:|---:|---|---|
 * | Press dialect (`active:translate`) is a singleton | 1 | **5** | false | debt |
 * | Dashed affordance is a singleton | 2 | **3** | false | debt |
 * | Deep inset (`px-5`) is a singleton | 1 | **2** | false | debt |
 * | Underlined tab (`border-b-*`) is a singleton | 2 | **2** — the `tab-bar.tsx` primitive already owns that notation | false | debt (destination `<TabBar>`) |
 * | Remaining "singletons": vertical underline, border colour, weight, … | ~8 | Grouped by off-ramp **property kind**, at least 6 consumers each (weight 39 · underline 24 · mono 46 …) | false | debt |
 * | Multi-line / grid rows | 10 | Only **1** opening tag has an actual grid (`DesktopVaultWelcome`). The rest were "multi-line card" judgements, not grids | false | debt |
 * | Even that **1** | — | Its icon column is a fixed `h-7 w-7`, so `row` (flex+gap) produces the **same pixels**. The grid is taste, not a requirement | false | debt |
 * | **Full-screen click surfaces (scrim, blocking backdrop)** | 5 | **4** — the fifth (`DemoStage` playback overlay) carries `text-body`/`leading-body`, so the predicate rejected it | **true** | **no-basis 4** |
 *
 * So **only one category survived**, and the gate rejected one place even inside
 * it. Same result as yesterday's registration round removing 13 — the lesson was
 * applied directly.
 *
 * ### Why only the click surface is true — the two things this verdict requires
 *
 * `isClickSurface()` requires **both**: ① `inset-0` (it covers the screen) ②
 * **zero** ramp-owned properties (it declares no height, inset, radius, border,
 * type, or weight). A scrim is placement (`absolute inset-0 z-*`) plus one
 * background layer, and applying any of the value layer's eight shapes **changes
 * nothing visible**. There is no spec to apply.
 *
 * The map's three carry a **contract** instead of a spec —
 * `data-backdrop-contract="blocks-map-and-closes-composer"` ·
 * `data-backdrop-surface-token` · `data-interactive-overlay` (the marker the
 * tour's auto-start suppression reads). They are parts of the overlay machinery,
 * not of the design system.
 *
 * ### Return rules — three things that stop this category becoming an escape hatch
 *
 * | If this stops being true | Which check turns red |
 * |---|---|
 * | A scrim gains any spec (one `px-3` is enough) | "as many qualifying click surfaces exist as were registered" — the value layer now has something to emit, so it drops into debt |
 * | A fifth click surface appears anywhere | "the **exhaustive count** for this reason equals the pinned number" (`CLICK_SURFACE_CENSUS`) — a new place is caught both as debt and by the census pin |
 * | An unqualified place is claimed into this category | Both of the above + "no-basis does not grow" — confirmed with a live probe (`DemoStage` false claim → 4 checks red) |
 *
 * All three are **machine-measured** and do not rest on anyone's opinion. Seven
 * probes were all confirmed red (census exceeded · extra control in a registered
 * file · spec attached · `inset-0` removed · false claim · registry emptied ·
 * baseline lowered alone).
 *
 * ### What the next round inherits
 *
 * - **`RecentNodeRow`'s pure `className={className}` pass-through, 1** — the same
 *   nature as the anchors' `no-spec` registration but not yet registered. This
 *   round's job was creating a new category, so it was left in debt (the safe
 *   direction). First in line for the next registration round.
 * - Now that a scrim type exists, the preamble's **"scrim/full-screen overlay 5,
 *   awaiting a new claim type"** item is resolved — 4 are no-basis, 1 is debt
 *   (`DemoStage`).
 *
 * ════════════════════════════════════════════════════════════════════
 * ## History — round by round (417 → 108). **Do not delete**
 * ════════════════════════════════════════════════════════════════════
 *
 * What each round counted is the evidence for the next promotion. Below is a
 * compressed form; the numbers and reasons are preserved. The original prose is
 * in git history (this file's 2026-08-03 revision).
 *
 * ### Why a ratchet and not a lint rule (founding judgement, still valid)
 *
 * The original proposal was "a `<button>` whose className does not come from
 * `controlClass()` is a lint error". Per the `/gate-probe` discipline the
 * inventory was taken before switching it on: **419**. A rule that cannot be
 * cleared in one PR is noise rather than enforcement, and it buries the existing
 * signal (96 warnings) too — this repository already has the precedent of banning
 * `shadow-[` wholesale and watching lint go from 144 to 548. On top of that the
 * migration is **normalisation**, so pixels change (143 chips carried 50 distinct
 * size combinations), and a decision that moves pixels belongs to the design
 * gate, not to a lint rule.
 *
 * ### First measurement (2026-08-03) — 419 counted, baseline 417
 *
 * By shape: chip 128 · text-link-like 85 · list row 39 · icon square 36 · pill 32
 * · other/unclassified token radius 58 · card-like 18 · floating/h-8 19 ·
 * standard button 1. The **2** with no className at all are wrappers and were
 * excluded, and the ratchet caught that correction itself (its first run went red
 * with "419 dropped to 417").
 *
 * ⚠️ Parser lesson: if an opening tag is not terminated by **brace depth**, the
 * `=>` inside `onClick={() => …}` reads as the end of the tag. That happened in
 * the first measurement and classified 251 of the 419 as "no className", nearly
 * inverting the conclusion. **Measure the wrong element and the number is wrong
 * even though it is a number.**
 *
 * ### The descent
 *
 * | Value | What moved |
 * |---:|---|
 * | 417 | First measurement |
 * | 406 | Settings sheet 11 — chip 6 · icon 2 · row 1 · link-like 1 |
 * | 389 | 17 of the map's two widgets' 31 — row 8 · link-like 5 · icon 3 · card 2 · chip 1. The 14 left are shapes **not in** the six classifications (vertical action tile 5 · segment tab 3 · window selection chip · vertical edge tab · canvas anchor circle · tree chevron), or 2 places where the ramp's minimum inset (8px) conflicts with this panel's 4px inset |
 * | 303 | 86 of the docs/quick-drawer/studio 121 — row 27 · icon 24 · chip 21 · link-like 13 · pill 4 · card 2. The 35 left = chrome-token contract 4 · stage absolute positioning 15 · sets that read as one unit 11 · in-sentence inline 5 |
 * | 269 | Recovering the 48 the two rounds above left "because there was no place for them" — right after filling four holes in the value layer (`a1f956ce9`). Settings sheet 29 + map action tile 5. `tone`'s four new values (secondary 6 · accent 11 · success 2 · warning 2 · danger 1) opened 22, `shape: 'tile'` opened 7, and `link`'s `min-h-11` opened 3 |
 * | 259 | 10 of the views round's 18 — row 6 · chip 5. **The first time `row`/`sm` exactly matched a hand-written height** (`py-1.5` + `--leading-label` = 28px = `min-h-7`) |
 * | 227 | 32 of the features round's 63 — chip 15 · pill 6 · link-like 6 · icon 3 · other 2 |
 * | 210 | 17 of the map views' 31 — icon 9 · pill 4 · chip 1 · link-like 1. The 14 left = not controls 3 (a full-screen backdrop is a scrim, not something that gets pressed) · chrome token 2 · needs truncation 3 · padded text links 3 · no ramp step 3 |
 * | 173 | 37 of the widgets round's 84 — chip 21 · pill 4 · icon 4 · card 5 · row 2 · link-like 1. Zero new axes. **210 − 37 = 173 matched the exhaustive re-measurement exactly**, meaning the three rounds share no files |
 * | 148 | Value-layer round, 25 — the result of filling holes the ledger had counted repeatedly. Segment/ghost 12 · panel ink 7 · filled indigo 3 · truncation 3. Three new axes plus an eighth shape |
 * | 136 | 12 of the studio/history round's 38 — card 7 · chip 2 · segment 2 · onAccent 3 (overlapping). Zero new axes, shapes, or tones. **The history panel moved 0 of 15** — that round first reported "structurally outside the value layer", and 2026-08-04 registered **12** of them (the other 3 are value-layer holes, so debt) |
 * | 144 | 4 of the primitives/views round's 35. **The output is not the number moved but "why 31 did not move"** — same layer as the value layer 6 · holes already in the ledger 21 · dead primitives that never render 4 |
 * | 123 | 9 of the remainder round's 57 — chip 6 · segment 2 · icon 1. Zero new axes or values. Four moved chips landed from `h-9`(36) on **`--control-h-md`(32)** = the first measurement showing the ladder #884 restored actually works |
 * | 119 | **Deleted** two dead primitives — `LinkListEditor` and `ChipListEditor` were exported and unit-tested but had **0** production consumers (exhaustive grep). Exactly those 4 |
 * | 117 | Value-layer round 2 (체계 seat), 6 — the "one step below sm" that three rounds counted was filled with a **micro tier**: `--radius-micro`(4px — already the value at 96 places) + chip `size: 'xs'` + a redefined `segment/sm`. Alongside: chip/pill default border divider(0.08) → border-soft(0.06) — correcting to the majority of an exhaustive 74:18 |
 * | **113** | Today, after the accessibility/ink round. On 2026-08-04 it split into **registered 23 + debt 90** |
 *
 * ### What deleting the dead primitives turned up (2026-08-03)
 *
 * `link-list-editor` was the **only `.tsx` in this repository** using
 * `data-external-link-marker` (the declaration of the allowed column for a
 * label-leading `↗`), and `label-decoration.contract.test.ts` leaned on that fact
 * with *"the number of files using the marker must not be 0"*. **A component
 * nobody rendered was holding up a rule's allowance clause.** The allowance stays
 * (WCAG G201 — warn before opening a new window) and the gate's idling guard moved
 * from "files using the exception" to "files scanned + a synthetic probe". Ledger:
 * `docs/DECISIONS.md` 2026-08-03 「죽은 프리미티브 둘」 (two dead primitives).
 *
 * ### What the value-layer round **did not build** — that is a conclusion too
 *
 * `/gate-probe`'s step-1 discipline ("if noise buries the signal, do not build the
 * rule") applied to axes as well. **An axis with no consumer does not get built.**
 *
 * | What the ledger asked for | Why it was not built (measured) |
 * |---|---|
 * | `card`'s `items-start` (multi-line cards) | One axis does not open it. The three consumers differ on **two or more axes** (`FirstRunPage`'s 3 are `grid-cols-[32px_1fr]` · `rounded-chip` · `px-4 py-3.5`; `DesktopVaultWelcome`'s 4 are full-bleed radius 0 with `px-4 py-4`). Opening alignment alone admits **not one place** = an axis with 0 users |
 * | A `tracking-<step>` partner for `text-<step>` | Emittable, but it **changes the width of all 244 places today** (0.02em × 11px ≈ +1.3px on a 6-character chip). The honest fix is binding `--text-<step>--letter-spacing` in globals.css, which needs its own measurement round |
 * | Splitting `active` from a "selected" axis | An exhaustive measurement of 12 segment places found **12/12 indigo tint background**, with only the ink differing (primary 11 · accent 1). Normalised to the majority instead of adding an axis |
 * | `--chrome-radius-inner`(7px) | **Not a hole.** In globals.css it is an alias for `var(--radius-chip)` = 6px. The ledger's "7px" is a stale record, and this is the basis for `segment` using `rounded-chip` |
 * | A `fixedHeight` axis | **Deleted** 2026-08-03. It was a symptom of wrong values, not an axis |
 *
 * ### Ladder measurement (2026-08-03, 1512×860 · dark) — only 7 of 18 combinations sit on the ladder
 *
 * The ladder is **28 / 32 / 40**:
 *
 * | Shape | sm | md | lg |
 * |---|---:|---:|---:|
 * | chip | 24 | **32** | **32** |
 * | pill | 24 | **32** | **32** |
 * | segment | 22 | 24 | **32** |
 * | row | **28** | 36 | 42 |
 * | card | 30 | 34 | **40** |
 * | icon | 24 | **28** | **32** |
 *
 * Three readings: ① 22 · 24 · 30 · 34 · 36 · 42 are still **outside** this app's
 * height vocabulary ② `chip`/`pill` have identical md and lg heights, so "one size
 * larger" does nothing to the height ③ the chip family has no 40px
 * (`--control-h-lg`) step.
 *
 * ### The first time the value layer widened a contract's reach
 *
 * The studio/history round moved 6 studio headers, 3 of which carried
 * `text-caption`(9.5px) — `studio-navigation.spec.ts`'s "chrome labels are one
 * value, 11px" contract only covered `studio-save` and `studio-exit`, so their
 * siblings had slipped out. Moving them to the ramp (`card/sm` = `text-label`)
 * made places the contract never measured become contract-valued automatically.
 */

/** The **kind of claim** that something is outside the value layer. A new kind must also be added to the registration-criteria table above. */
type OutsideClaim =
  | 'chrome-token'
  | 'stage-geometry'
  | 'value-layer-peer'
  | 'standard-button'
  | 'no-spec'
  | 'state-scoped'
  | 'prose'
  /**
   * **The value layer's eight shapes cannot in principle produce that layout**
   * (added 2026-08-06).
   *
   * Different from `chrome-token`: that one cannot be emitted because the token
   * changes per condition; this one because the layout itself is not in the
   * vocabulary.
   *
   * ⚠️ **This claim must always carry a `conditional`.** Once the shape or axis
   * exists, the registration is deleted and the place drops back into debt.
   * Without a condition it becomes a permanent exemption, which breaks this
   * registry's definition as a debt list rather than a permit list.
   */
  | 'shape-gap';

interface OutsideEntry {
  /** Repo-relative path. Must exist. */
  readonly file: string;
  /** **How many places in this file are registered as outside the value layer.** Not the whole file. */
  readonly count: number;
  readonly claim: OutsideClaim;
  /**
   * The evidence string that **must remain in that file**. If it disappears the
   * claim is dead and the gate turns red. `chrome-token` uses the token name,
   * and the gate goes on to check in globals.css that the token really is beyond
   * the fixed steps.
   */
  readonly proof: string;
  readonly why: string;
  /** "Move it once X exists" — when the value layer gains that axis, delete the registration and drop the place into debt. */
  readonly conditional?: string;
}

/**
 * **The verified "outside the value layer" registry.**
 *
 * If you find a place that is outside the value layer but not listed here,
 * **open it and verify before adding a row** (discipline 1 above). If you cannot
 * verify it, leave it in debt.
 */
const OUTSIDE_VALUE_LAYER: readonly OutsideEntry[] = [
  /*
   * ════════════════════════════════════════════════════════════════════
   * 2026-08-06 — **completion declared.** The last two were judged and listed.
   * ════════════════════════════════════════════════════════════════════
   *
   * Owner: *"판정이 끝났다는 건 뭔 말임? 고칠 게 없다는 뜻임? 그럼 종료를 선언해
   * 줘야지 다음에 또 안 찾지 않을까?"*
   * (if the verdict is final and nothing is left to fix, declare it closed so the
   * next person does not go looking again)
   *
   * Correct. **"Nothing left to fix" must mean the count is 0, and 0 is the
   * declaration.** Saying the verdict is final while leaving a non-zero count
   * just sends the next person looking.
   */
  {
    file: 'src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '[@media(pointer:coarse)]',
    why:
      '최근 변경 창(window) 라디오 칩. ⚠️ **2026-08-15 정정** — 종전 근거(“값 층은 ' +
      '`[@media(pointer:coarse)]` 변형을 원리적으로 못 낸다”)는 **더 이상 참이 아니다**. ' +
      '값 층이 `atlas-touch-floor`(globals.css, coarse 에서 44px)를 chip/segment base 에 ' +
      '실으면서 그 조건은 발화했고, 이 자리의 손 변형은 이제 값 층이 낼 수 있는 것이다. ' +
      '남은 진짜 blocker 는 높이가 아니라 셋이다: `min-w-12` **균일폭**(값 층에 축 없음) · ' +
      '`--topology-v2-panel-*` **패널 스코프 잉크**(무채색 램프가 아니다) · ' +
      '`rounded-[var(--chrome-radius-inner)]` **크롬 반경**(칩 램프의 `rounded-chip` 이 아니다). ' +
      '게다가 이 치수(24 · 11px · 48px 균일)는 소유자가 두 번 고쳐 확정한 것이라 ' +
      '(2026-08-02 *“버튼이 너무 작고”* → *“비율이나 그런게 맞아야하는데”*), 램프로 끌어당기면 ' +
      '그 이력을 깬다.',
    conditional:
      '값 층이 **균일폭 축 + 패널 스코프 잉크**를 얻으면 이 줄을 지우고 옮긴다. ' +
      '(포인터 조건부 높이는 이미 얻었다 — 그것만으로는 부족하다.)',
  },
  /* 2026-08-06 — **the last three.** Each was opened and its evidence verified. */
  /*
   * ════════════════════════════════════════════════════════════════════
   * 2026-08-06 — **a place with a final verdict comes out of debt**
   * ════════════════════════════════════════════════════════════════════
   *
   * Owner: *"디자인 시스템화 안 시키기로 한 거는 왜 그런지 분석하고 문제없으면
   * 아예 이슈에서 없애 버려 개수 안 나오게 — 계속 나한테 몇 개 남았다고 말하니까
   * 나는 계속 고치라고 명령하게 되잖아."*
   * (if we decided not to design-system a place, analyse why, and if that is
   * fine remove it from the issue entirely so it stops showing up in the count —
   * being told how many are left keeps making me order it fixed)
   *
   * The preamble of this file already gives the reason: **debt is only a progress
   * gauge if it can reach 0**, and mixing in "cannot in principle" makes 0
   * unreachable. Leaving a decided place in debt means **the number nags a
   * person.**
   *
   * The eight below were each opened and verified, and all carry a
   * `conditional` — when the value layer gains that axis the registration is
   * deleted and the place drops back into debt.
   */
  {
    file: 'src/views/home/ui/HomePage.tsx',
    count: 3,
    claim: 'chrome-token',
    proof: '--chrome-tile-size',
    why:
      '지도 우상단 크롬 타일 셋(투어 · 단축키 도움말 · 좁은 폭 레일 대체). ' +
      '36px 이고 coarse 포인터에서 `max(36px, --touch-target-min)` 으로 승격한다 ' +
      '— globals.css 에 선언이 둘이라 토큰 검사를 통과한다. 값 층은 포인터 ' +
      '조건부 높이를 못 낸다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다.',
  },
  {
    file: 'src/widgets/topology-index-panel/ui/TopologyIndexTab.tsx',
    count: 1,
    claim: 'shape-gap',
    proof: 'flex-col',
    why: '지도 INDEX 패널을 여는 세로 손잡이. 위와 같은 세로 스택 배치다.',
    conditional: '세로 스택 컨트롤이 6곳을 넘으면 위와 함께 지운다.',
  },
  {
    file: 'src/widgets/topology-index-panel/ui/TopologyIndexTreeRow.tsx',
    count: 1,
    claim: 'no-spec',
    proof: 'aria-hidden="true"',
    why:
      '트리 행의 펼침 셰브론. `aria-hidden` + `tabIndex={-1}` 이라 **접근성 트리에 ' +
      '없고 포커스 순서에도 없다** — 조작은 바깥 `role="treeitem"` 행이 진다. ' +
      '컨트롤이 아니라 마우스 어포던스라 씌울 규격이 없다.',
    conditional: '이 셰브론이 접근성 트리에 다시 노출되면(=진짜 컨트롤이 되면) 부채로 내린다.',
  },
  {
    file: 'src/widgets/topology-controls/ui/HubRail.tsx',
    count: 1,
    claim: 'shape-gap',
    proof: 'h-16 w-5',
    why:
      '지도 왼쪽 가장자리의 허브 레일 손잡이. **16:5 세로 막대**(64×20)라 모양 여덟의 ' +
      '어느 치수 사다리에도 없다 — 칩·pill 은 가로가 길고 `icon` 은 정사각이다. ' +
      '가장자리에 붙는 잡이(edge grab)는 이 앱에 하나뿐이다.',
    conditional: '가장자리 잡이가 둘이 되면 그때 값에 이름을 붙인다(이 저장소의 「두 번째로 쓸 곳이 생기는 순간」 규율).',
  },
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 4,
    claim: 'chrome-token',
    proof: '--git-row-h',
    why:
      '변경 행 · 「나머지」 토글 · STEP_ROW 3열 그리드 행 3. 높이가 ' +
      'clamp(38px, 4.2vh, 48px) 이고 좁은 폭에서 26px, coarse 포인터에서 44px 로 ' +
      '재정의된다. 값 층의 높이 어휘는 고정 단뿐이라 **뷰포트 함수를 표현할 수 없다**.',
  },
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 7,
    claim: 'chrome-token',
    proof: '--git-setup-action-height',
    why:
      '스냅샷 확인/취소 · 도크 · 재확인 · 재시도 · init · init 복사. 데스크톱 36px ' +
      '인데 coarse 포인터에서 --touch-target-min(44px)으로 **승격**한다. 램프는 ' +
      '포인터 조건부 높이를 못 낸다.',
    conditional: '값 층이 포인터 승격 축(coarse 에서 44px)을 얻으면 다시 연다.',
  },
  {
    file: 'src/shared/ui/button.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: 'buttonVariants',
    why: '표준 버튼 프리미티브 자신. 값 층이 자기를 소비할 수는 없다.',
  },
  {
    file: 'src/shared/ui/chrome-chip.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--chrome-tile-size',
    why: '크롬 칩 프리미티브. 높이가 --chrome-tile-size 크롬 계약이고 소비처는 className 만 얹는다.',
  },
  {
    file: 'src/shared/ui/chrome-tile.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--chrome-tile-size',
    why: '크롬 타일 프리미티브. 같은 크롬 계약(36px, coarse 에서 max(36px, 44px)).',
  },
  {
    file: 'src/shared/ui/select.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--control-h-md',
    why:
      'select 트리거. **값 층과 같은 컨트롤 높이 사다리**(--control-h-md/lg)를 직접 ' +
      '읽고 w-full · rounded-card 로 폼 필드 계약을 진다.',
  },
  {
    file: 'src/shared/ui/tab-bar.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--tabbar-underline',
    why:
      '밑줄 탭 프리미티브 자신. 반경 0 · items-baseline · pb-[11px] · ' +
      'border-b-[length:var(--tabbar-underline)] 로 **다른 표기법**을 소유한다. ' +
      'segment 는 「보더 0」이 정의라 이 표기법을 못 그린다.',
  },
  /*
   * ── The 2026-08-04 combined round's 7 verified registrations. The chrome-token
   * candidates the preamble had deferred to "the next registration round" were
   * opened place by place. All are tokens that go from 32–36px on fine pointers
   * to 44 on coarse, or that ride a scale factor, so a fixed-step ramp cannot
   * express them in principle (`tokenIsBeyondFixedSteps` verifies this
   * mechanically).
   */
  {
    file: 'src/widgets/search-palette/ui/SearchPalette.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--overlay-close-size',
    why: '팔레트 닫기 — 32px 이고 coarse 포인터에서 --touch-target-min(44)으로 승격한다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다.',
  },

  {
    file: 'src/widgets/global-search/ui/GlobalSearch.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--overlay-close-size',
    why:
      '검색 시트 닫기. ⚠️ 검증이 결함을 잡은 자리다 — 전용 토큰 ' +
      '(--topology-search-sheet-close-size)은 32px **단독 고정 선언**이라 이 ' +
      '게이트가 기각했고(승격 블록 주석은 «이미 커버됨»이라 거짓말하고 있었다), ' +
      '같은 일을 하는 --overlay-close-size 로 수렴시킨 뒤에야 등재 자격이 생겼다. ' +
      'fine 32 → 32(이동 0), coarse 32 → 44(형제 오버레이와 같은 계약).',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다.',
  },
  {
    file: 'src/views/docs-vault/ui/parts/DocsHeaderTile.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--chrome-tile-size',
    why:
      '문서함 헤더 타일 프리미티브 — size-[var(--chrome-tile-size)] 로 크롬 잠금 단' +
      '(36, coarse 에서 max(36,44))을 그대로 진다. ChromeTile 의 문서함 형제.',
  },
  {
    file: 'src/views/docs-vault/ui/parts/BackToTopButton.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--chrome-tile-size',
    why:
      '문서함 「맨 위로」 부유 컨트롤 — h-[var(--chrome-tile-size)] 크롬 계약. ' +
      'rounded-full 원형 방언은 별개 부채로 남는다(원형 아이콘 구멍) — 등재는 치수 주장만 승인한다.',
  },
  {
    file: 'src/widgets/app-nav-rail/ui/GitStatusTile.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--app-nav-rail-tile-height',
    why:
      '레일 git 타일 — calc(32px × --topology-ui-scale-factor) + coarse max() 승격. ' +
      '램프는 스케일 계수도 포인터 승격도 못 낸다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다. 누름 방언(active:translate-y-px)은 별개 부채다.',
  },
  {
    file: 'src/widgets/app-nav-rail/ui/AppNavRail.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--app-nav-rail-tile-height',
    why:
      '레일 에이전트 타일(버튼 갈래) — 같은 파일의 <Link> 갈래가 이미 앵커 등록부에 ' +
      '있다. 한 파일이 두 태그를 내므로 두 등록부에 한 줄씩 선다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다. 누름 방언은 별개 부채다.',
  },
];

/**
 * **A literal — not derived from `OUTSIDE_VALUE_LAYER`.**
 *
 * This does not inherit the hard-cut ratchet's defect, where `BASELINE =
 * REGISTRY.length` made "it never grows" **impossible to fail in principle**:
 * adding a row raised the baseline with it, loosening the pawl in both
 * directions. Raising the registered count requires editing this number **by
 * hand**, and that diff is where the "why" goes.
 */
const BASELINE_REGISTERED = 29;

/**
 * **Only this number may fall.** The total (108) minus registered (30) minus
 * no-basis (4).
 *
 * Writing one more hand control in a registered file does not raise the
 * registered count, so it raises this one — registration is not an exemption.
 * The same is true of no-basis.
 */
const BASELINE_HAND_WRITTEN_DEBT = 0;

/**
 * **The third category — "no basis".**
 *
 * It claims something **different** from a registration (`OutsideEntry`):
 *
 * | Category | Claim | Can the value layer emit this? |
 * |---|---|---|
 * | registered | "outside in principle" | **No** (viewport function · JS coordinates · the layer's own house · another layer's contract) |
 * | **no-basis** | "it could, but **there is nothing to emit**" | Yes it could. But this element has **no spec** — it is not a control |
 * | debt | "not moved yet" | It could, and there is something to emit. It simply was not moved |
 *
 * ⚠️ **Do not confuse this with `no-spec` (a registration).** There the spec is
 * **delegated to the caller** (`className={className}`) — the value layer cannot
 * emit someone else's decision, so it is outside in principle. Here **nobody**
 * decides a spec, because there is nothing to decide.
 */
type NoBasisClaim = 'click-surface';

interface NoBasisEntry {
  readonly file: string;
  readonly count: number;
  readonly family: 'button' | 'anchor';
  readonly claim: NoBasisClaim;
  /** The evidence string that must remain in the file. Same discipline as a registration. */
  readonly proof: string;
  readonly why: string;
}

/**
 * **The "nothing for the value layer to emit" registry.**
 *
 * The only claim type today is `click-surface`: a **screen-covering click
 * surface** (scrim, blocking backdrop). It gets pressed but it is not a control
 * — it declares **no** shape, size, type, or ink, only placement
 * (`absolute inset-0 z-*`) plus one background layer, and the value layer has
 * already declared both of those outside its share (placement belongs to
 * `className`).
 *
 * ⚠️ **These rows are not debt to repay.** Debt 74 targets 0; these 4 do not —
 * which is why the counts were split. Mixed together, debt becomes a number that
 * **cannot reach 0 in principle**, and at that moment it stops being a progress
 * gauge and becomes decoration.
 */
const NO_BASIS: readonly NoBasisEntry[] = [
  {
    file: 'src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx',
    count: 1,
    family: 'button',
    claim: 'click-surface',
    proof: '--color-scrim-a58',
    why:
      '빠른 편집 시트의 스크림. `absolute inset-0 bg-[var(--color-scrim-a58)]` 가 전부이고 역할은 ' +
      '「바깥을 눌러 닫기」다. 값 층의 모양 여덟 중 어느 것을 씌워도 **보이는 것이 달라지지 ' +
      '않는다** — 씌울 규격이 없어서다.',
  },
  {
    file: 'src/views/home/ui/HomePage.tsx',
    count: 3,
    family: 'button',
    claim: 'click-surface',
    proof: 'data-backdrop-contract',
    why:
      '지도의 차단 백드롭 셋(부트스트랩 취소 · 노드 생성 취소 2). 규격이 아니라 **계약**을 지고 ' +
      '있고 그 계약을 스스로 선언한다 — `data-backdrop-contract="blocks-map-and-closes-composer"` · ' +
      '`data-backdrop-surface-token` · `data-interactive-overlay`(투어 자동시작 차단 판정이 읽는 ' +
      '마커). 컨트롤 규격은 0이다.',
  },
  {
    file: 'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx',
    count: 1,
    family: 'button',
    claim: 'click-surface',
    proof: 'data-testid="acp-chat-history-scrim"',
    why:
      '앱 안 대화의 **지난 대화 목록 뒤 막**. 그 목록은 절대 위치로 떠서 대화를 덮는다 — ' +
      '흐름에 두면 열 때 대화가 밀려나고 목록이 대화의 일부처럼 보였다(2026-08-16 소유자 ' +
      '실보고). 떠 있는 것에는 「아무 데나 누르면 닫힌다」가 딸려야 하고 그 클릭면이 이 막이다. ' +
      '`absolute inset-0` 과 바탕 한 겹이 전부이고, 값 층의 모양 여덟 중 무엇을 씌워도 ' +
      '**보이는 것이 달라지지 않는다** — 씌울 규격이 없어서다.',
  },
];

const NO_BASIS_BUTTONS = NO_BASIS.filter((e) => e.family === 'button');

/**
 * **The anchor side is 0 today — a measurement, not an empty row.**
 *
 * Running all 102 through the predicate returns 0. That makes sense: an `<a>`
 * exists to **go somewhere**, so it rarely becomes a spec-less click surface
 * (there is no reason to put an `href` on a scrim). When a qualifying anchor
 * appears, a row is added and `BASELINE_ANCHOR_NO_BASIS` is raised by hand — this
 * 0 does not mean the gate is idling, it is **the predicate's 0 after seeing all
 * 102 real places** (probe ⑮ asserts exactly that).
 */
const NO_BASIS_ANCHORS = NO_BASIS.filter((e) => e.family === 'anchor');

/** A literal — same reason as the registration baselines (a derived value loosens the pawl in both directions). */
/*
 * 4 → 5 (2026-08-16): the **scrim behind the past-conversation list** in the
 * in-app chat.
 *
 * That list floats absolutely and covers the conversation (put in flow, opening
 * it pushed the conversation aside and the list read as part of it — reported by
 * the owner). Anything floating needs "click anywhere to dismiss", and that
 * click surface is this scrim.
 *
 * It satisfies both qualifications exactly: `absolute inset-0` (it covers the
 * screen) and **zero** ramp-owned properties (placement plus one background
 * layer, nothing to apply a spec to).
 */
const BASELINE_NO_BASIS = 5;
const BASELINE_ANCHOR_NO_BASIS = 0;

/**
 * **Pins the exhaustive count for this reason.** Across the whole repository
 * today, exactly this many hand controls are granted the qualification by the
 * predicate. If a further one appears the number diverges and **turns red** —
 * at which point a person either ① raises the registry and this number by hand
 * if it really is a click surface (that diff is where the "why" goes), or ②
 * repays it as debt. There is no path to a silent exemption.
 */
const CLICK_SURFACE_CENSUS = 5;

const ROOTS = ['src', 'app'];
const GLOBALS_CSS = 'app/globals.css';
const SELF = 'tests/contract/control-adoption-ratchet.contract.test.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Terminates an opening tag by **brace depth**.
 *
 * Without this, the `=>` inside `onClick={() => …}` reads as the end of the tag.
 * That happened in the first measurement and classified 251 of 419 as "no
 * className", nearly inverting the conclusion. **Measure the wrong element and
 * the number is wrong even though it is a number.**
 */
/**
 * Blank out comments before any tag parsing, keeping byte offsets and line
 * numbers intact (block comments become spaces, not nothing).
 *
 * **Why this is required, not optional** (measured 2026-08-22). `openingTag`
 * tracks quotes so a `"` inside an attribute cannot end the tag early. A comment
 * sitting inside a JSX opening tag defeats that: an English apostrophe — as in
 * `This scrim's name` — opens a quote that never closes, so the parser runs past
 * the tag and swallows the JSX after it. The click-surface count in this file
 * silently fell 5 → 4 the moment the repo's comments were translated to English.
 *
 * Korean prose has no apostrophes, which is why the defect stayed latent for as
 * long as the comments were Korean. Sibling gates (`field-adoption-ratchet`,
 * `focus-ring-presence`, `static-surface-census`) already strip first; this is
 * the same pattern, not a new one.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

/**
 * **A control is not only `<button>`** (2026-08-04).
 *
 * For one day this ratchet counted `<button>` alone, leaving **109 hand-specced
 * anchors** (`<Link>` 85 · `<a>` 24) outside the gate's field of view. They are
 * no different from buttons: pressable elements that hand-write their own
 * height, inset, and radius — the value layer's `link` shape exists precisely
 * for them.
 */
const BUTTON_TAGS = ['button'] as const;
const ANCHOR_TAGS = ['Link', 'a'] as const;

function handWrittenTags(file: string, tags: readonly string[] = BUTTON_TAGS): string[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  // Names bound by `const X = controlClass({…})` / `const X = cn(controlClass({…}), …)`.
  const systemConstants = [
    ...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*(?:controlClass|fieldClass|fieldLabel)\s*\(/g),
  ].map((m) => m[1]);
  const found: string[] = [];
  for (const m of source.matchAll(new RegExp(`<(?:${tags.join('|')})\\b`, 'g'))) {
    const tag = openingTag(source, m.index + m[0].length);
    if (!/className/.test(tag)) continue; // No class means no hand-written spec
    /*
     * Did it go through the system? **Looking only at literals in the opening
     * tag is not enough** — when a finished class is extracted into a constant
     * shared by several places (`const INDIGO_CHIP = controlClass({…})`), those
     * consumers get caught as "hand-written".
     *
     * The 2026-08-03 recovery round actually took that penalty: the indigo
     * emphasis chip needed border and hover to be complete, so it had to be
     * bundled into 4 constants — and then the ratchet reported a regression.
     * **A gate that discourages the correct refactor is not a gate.**
     *
     * `fieldClass` joined on 2026-08-06. **Leave that one name out and moved
     * places keep counting as debt, so the baseline never falls** — the 체계
     * (design-systems) seat named this the top idling candidate in that PR.
     */
    if (/(?:controlClass|fieldClass|fieldLabel)\s*\(/.test(tag)) continue;
    if (systemConstants.length > 0 && systemConstants.some((name) => new RegExp(`\\b${name}\\b`).test(tag))) continue;
    found.push(tag);
  }
  return found;
}

function countInFile(file: string, tags: readonly string[] = BUTTON_TAGS): number {
  return handWrittenTags(file, tags).length;
}

/**
 * **The words inside string literals in an opening tag.** Even when the class is
 * assembled from constants or templates, the literal fragments are caught here.
 * Variant prefixes (`hover:`, `focus:`, …) are stripped — "did it declare a
 * spec" is a question independent of state.
 */
function literalClassTokens(tag: string): string[] {
  const out: string[] = [];
  for (const m of tag.matchAll(/["'`]([^"'`]*)["'`]/g)) {
    for (const word of m[1].split(/\s+/)) {
      if (word) out.push(word.replace(/^[a-z-]+:/, ''));
    }
  }
  return out;
}

/** The property kinds the value layer **owns**. Declaring any one of them makes it a control spec. */
const RAMP_OWNED_TOKEN =
  /^-?(min-h|h|w|size|p|px|py|pt|pb|pl|pr|gap|rounded|border|text|font|leading|tracking)(-|$)/;

/**
 * **The predicate for "this is not a control but a screen-covering click
 * surface".**
 *
 * It requires **both**:
 *
 * 1. `inset-0` — it covers the screen (or its parent) entirely. If it does not,
 *    it is just a small control, which is "not moved yet" rather than "nothing
 *    to say".
 * 2. **Zero** ramp-owned properties — it declares no height, inset, radius,
 *    border, type, or weight. The moment it declares one, the value layer has
 *    something to emit, the qualification disappears, and it returns to debt.
 *
 * (2) is this category's pawl. It has already rejected a real place —
 * `DemoStage`'s playback overlay is `absolute inset-0` but carries `text-body`
 * and `leading-body`. **Full-bleed does not mean click surface.**
 */
function isClickSurface(tag: string): boolean {
  if (!/inset-0/.test(tag)) return false;
  return !literalClassTokens(tag).some((token) => RAMP_OWNED_TOKEN.test(token));
}

/** The **exhaustive count** of qualifying click surfaces across the repository. Measured independently of the registry. */
function clickSurfaceCensus(scanned: string[], tags: readonly string[] = BUTTON_TAGS): string[] {
  const hits: string[] = [];
  for (const file of scanned) {
    for (const tag of handWrittenTags(file, tags)) {
      if (isClickSurface(tag)) hits.push(file);
    }
  }
  return hits;
}

/**
 * Takes the registry **as an argument** so a probe can remove a row or add a
 * file and aim at the detector itself (same reason as the hard-cut ratchet's
 * `stillHardCut(registry)`).
 */
function census(
  scanned: string[],
  registry: readonly OutsideEntry[] = OUTSIDE_VALUE_LAYER,
  tags: readonly string[] = BUTTON_TAGS,
  noBasisRegistry: readonly NoBasisEntry[] = NO_BASIS_BUTTONS,
) {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of scanned) {
    const n = countInFile(file, tags);
    if (n > 0) {
      byFile.set(file, n);
      total += n;
    }
  }
  const registeredByFile = new Map<string, number>();
  for (const entry of registry) {
    registeredByFile.set(entry.file, (registeredByFile.get(entry.file) ?? 0) + entry.count);
  }
  let registered = 0;
  for (const n of registeredByFile.values()) registered += n;
  const noBasisByFile = new Map<string, number>();
  for (const entry of noBasisRegistry) {
    noBasisByFile.set(entry.file, (noBasisByFile.get(entry.file) ?? 0) + entry.count);
  }
  let noBasis = 0;
  for (const n of noBasisByFile.values()) noBasis += n;
  return {
    total,
    registered,
    noBasis,
    debt: total - registered - noBasis,
    byFile,
    registeredByFile,
    noBasisByFile,
  };
}

/**
 * Is a chrome token **really beyond the fixed steps?**
 *
 * The value layer emits fixed px steps, so "inexpressible" is true only when the
 * token is redefined to a different value per condition (width, pointer) or uses
 * a viewport function. The day a token collapses into one ordinary px value this
 * check turns red and that row becomes debt rather than a registration.
 */
function tokenIsBeyondFixedSteps(css: string, token: string): boolean {
  const declarations = [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  if (declarations.length === 0) return false;
  if (declarations.length > 1) return true;
  return /clamp\(|max\(|min\(|\d+v[hw]|touch-target-min/.test(declarations[0]);
}

const scannedFiles = ROOTS.flatMap((root) => walk(root));
const { total, registered, noBasis, debt, byFile, registeredByFile, noBasisByFile } = census(scannedFiles);
const globalsCss = readFileSync(GLOBALS_CSS, 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════
 * ## Anchor controls — **the third and fourth counts** (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### Why a new count instead of adding to debt 85
 *
 * The preamble already recorded the judgement: *"종전엔 113 이 한 덩어리였고,
 * 그래서 무엇이 진전인지 알 수 없었다"* (113 used to be one lump, which made
 * progress unreadable — unmovable places and not-yet-moved places sat in the same
 * cell). The same lesson applies here.
 *
 * Adding anchors to debt 85 makes **194**, and when that number falls nobody can
 * tell whether a button or an anchor moved. The two families are **different
 * units of work** — a button is usually one `controlClass({ shape })` line, while
 * an anchor forces `<Link>` through a `cn` merge (measured in this file: raw
 * `buttonVariants()` leaves both the base's `border-transparent` and the variant
 * border in place, and source order lets transparent win) and external links also
 * hit the leading `↗` marker rule.
 *
 * ### Why `<Link>` and `<a>` are one count
 *
 * These two are **not** split. `<Link>` renders an `<a>`, and in the value layer
 * both have the same destination, `shape: 'link'`. Putting one prescription in
 * two cells is bookkeeping, not a progress gauge. The per-tag breakdown is
 * recorded here instead — **`<Link>` 71 · `<a>` 21** (measured after the 10
 * recovered by the 2026-08-04 round that rejected splitting by type).
 *
 * ⚠️ The audit report's number was **77**. That difference is drift or a
 * different filter, and the number the gate uses must be **what this file's
 * parser actually counted** — writing someone else's count into a baseline makes
 * the first run red, and then a person fixes the number instead of the gate.
 *
 * ### Registrations became 19 a day later — the 0 on the day the gate opened meant "not yet verified"
 *
 * On the day it was created no "outside the value layer" claim had been verified,
 * so all 110 were debt. Opening each place per discipline 1, **19 were true**, and
 * one of them (the bottom tab bar's `--topology-bottom-tab-min-height`) was
 * **rejected by the gate itself** — a single fixed 56px declaration, which
 * `tokenIsBeyondFixedSteps` refuses. This is where the round proved by
 * measurement that registration is not an escape hatch.
 */
// 2026-08-18 gateway remake: the hero CTA pair (published `<a>` · pending
// `<Link>`) + the demo ghost anchor — all three registered via `buttonVariants`
// (standard-button).
// 2026-08-18 (second pass, owner request): the hero's second row — Intel `<a>` ·
// Windows `<a>` · macOS `<a>` for Windows visitors · browser `<Link>`. All four
// standard-button.
// 2026-08-19: deleting the install section removed 7 anchors from the gateway
// (the panel's primary CTA · Intel · GitHub exit · web exit · release notes ·
// Windows download · Windows tracking) — `Link` 19→17 · `a` 17→12.
const ANCHOR_TAG_SPLIT: Readonly<Record<string, number>> = { Link: 17, a: 12 };

/**
 * **The verified "outside the value layer" anchor registry.**
 *
 * Same discipline as the button side's `OUTSIDE_VALUE_LAYER` — if you find a
 * place outside the value layer that is not listed here, **open it and verify
 * before adding a row**. If you cannot verify it, leave it in debt.
 */
const OUTSIDE_VALUE_LAYER_ANCHORS: readonly OutsideEntry[] = [
  /* 2026-08-06 — **the last two links.** With these, hand-styled links reach 0. */
  {
    file: 'src/views/home/ui/HomePage.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--chrome-tile-size',
    why:
      '지도 크롬의 git 타일(좁은 폭 전용). `size-[var(--chrome-tile-size)]` 로 36px 이고 ' +
      'coarse 포인터에서 `max(36px, --touch-target-min)` 으로 **승격**한다 — 선언이 ' +
      '둘이라 토큰 검사를 통과한다. 값 층은 포인터 조건부 치수를 못 낸다.',
    conditional: '값 층이 포인터 조건부 치수 축을 얻으면 이 줄을 지우고 옮긴다.',
  },
  {
    file: 'src/widgets/recent-node-row/ui/RecentNodeRow.tsx',
    count: 1,
    claim: 'no-spec',
    proof: 'className={className}',
    why:
      '최근 노드 행의 **자리잡기 래퍼**. `className` 을 prop 으로 받아 그대로 넘긴다 — ' +
      '규격은 호출부에 있고 이 파일에는 씌울 것이 없다. `PublicQuickActions` 의 ' +
      '`inline-flex` 래퍼와 같은 부류다.',
    conditional: '이 래퍼가 자기 규격을 갖게 되면(치수·색을 직접 내면) 부채로 내린다.',
  },
  {
    file: 'src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx',
    count: 2,
    claim: 'shape-gap',
    proof: 'flex-col',
    why:
      '하단 탭 둘(현재 탭 · 앱 받기). **아이콘 위 · 라벨 아래**로 세로로 쌓이는데 ' +
      '`row` 는 **가로 정렬이 정체성**이라(`items-center` + `text-left`) 이 배치를 ' +
      '못 낸다. 2026-08-06 에 전수를 세어 **4곳**(그중 1곳은 이미 등재)이라 새 축을 ' +
      '만들지 않기로 판정했다 — `stacked` 축을 만들 때의 근거가 9곳이었다.',
    conditional: '세로 스택 컨트롤이 6곳(지금의 두 배)을 넘으면 `row` 에 orientation 축을 만들고 이 줄을 지운다.',
  },
  {
    file: 'src/views/download/ui/DownloadPage.tsx',
    count: 7,
    claim: 'standard-button',
    proof: 'buttonVariants',
    why:
      '히어로 CTA 쌍(published `<a>` · pending `<Link>`) · 데모 앵커(ghost → outline, 소유자 ' +
      '«버튼인지도 모르겠고») · 히어로 둘째 줄 4(Intel `<a>` · Windows `<a>` · Windows ' +
      '방문자용 macOS `<a>` · 브라우저 `<Link>`). 전부 `cn(buttonVariants({…}), …)` 로 ' +
      '**표준 버튼 프리미티브**를 지난다. `control-class.ts` 가 스스로 "표준 버튼을 대체하지 ' +
      '않는다" 고 선언했으므로 여기를 `controlClass` 로 옮기는 것은 그 규칙 위반이다.\n' +
      '2026-08-19: 14 → 7. 설치 절(판 · 검증 레일 · 3단)이 삭제되면서 판의 주 CTA · ' +
      'Intel · GitHub 출구 · 웹 출구 · 릴리스 노트 · Windows 받기 · Windows 추적 일곱이 ' +
      '함께 사라졌다(`docs/DECISIONS.md` (83)).',
    conditional:
      '⚠️ 이 중 둘은 `className` 이 프리미티브의 반경·인셋을 덮는다(`rounded-chip px-4 sm:px-6`). ' +
      '그건 이 게이트가 아니라 다음 디자인 라운드의 일이다 — 등재가 그 결함을 승인하지는 않는다.',
  },
  {
    file: 'src/features/docs-vault-local/ui/AgentClientButtons.tsx',
    count: 1,
    claim: 'standard-button',
    proof: 'buttonVariants',
    why: '`clientControlClass()` = `buttonVariants({ variant: "outline", size: "sm" })` + 폭·반경.',
  },
  {
    file: 'app/[locale]/not-found.tsx',
    count: 1,
    claim: 'standard-button',
    proof: 'buttonVariants',
    why: '2026-08-04 버튼 라운드가 손 `rounded-full` 방언에서 정규화한 그 자리. `cn` 병합까지 되어 있다.',
  },
  {
    file: 'app/not-found.tsx',
    count: 1,
    claim: 'standard-button',
    proof: 'buttonVariants',
    why: '같음(루트 404).',
  },
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 2,
    claim: 'chrome-token',
    proof: '--git-setup-action-height',
    why:
      '「앱 받기」·「볼트 고르기」 — `PRIMARY_ACTION_CLASS` 가 버튼 형제 7개와 **같은 상수**다. ' +
      '데스크톱 36px 인데 coarse 포인터에서 --touch-target-min 으로 승격한다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다 — 버튼 쪽 같은 줄과 함께 내려온다.',
  },
  {
    file: 'src/widgets/app-nav-rail/ui/AppNavRail.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--app-nav-rail-tile-height',
    why:
      '레일 하단 「앱 받기」 타일. 높이가 calc(32px * --topology-ui-scale-factor) 이고 coarse ' +
      '포인터에서 max() 로 재정의된다 — 램프는 스케일 계수도 포인터 승격도 못 낸다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다. 누름 방언(active:translate-y-px)은 별개 부채다.',
  },
  {
    file: 'src/views/home/ui/TopologyReviewLink.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--chrome-tile-size',
    why:
      '지도 우상단 유틸 레인의 검수 칩. 높이가 크롬 잠금 단(36px, coarse 에서 max(36,44))이고 ' +
      '표면·보더·그림자·포커스링이 `--topology-utility-lane-*` 계약이다 — 원소가 그 계약을 ' +
      '`data-utility-action-token-contract` 로 스스로 선언한다.',
  },
  {
    file: 'src/shared/ui/chrome-tile.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--chrome-tile-size',
    why:
      '`ChromeTile` 프리미티브의 **`<Link>` 갈래**. 같은 파일의 `<button>` 갈래가 이미 버튼 쪽에 ' +
      '등재돼 있다 — 한 프리미티브가 두 태그를 내므로 두 등록부에 한 줄씩 선다.',
  },
  {
    file: 'src/features/macos-download-link/ui/MacosDownloadLink.tsx',
    count: 1,
    claim: 'no-spec',
    proof: 'className={className}',
    why:
      '이 파일이 선언하는 규격이 **0**이다 — href·rel 만 고정하고 클래스는 호출자 것을 그대로 ' +
      '넘긴다. 값 층이 낼 것이 없다.',
  },
  {
    file: 'src/widgets/public-quick-actions/ui/PublicQuickActions.tsx',
    count: 2,
    claim: 'no-spec',
    proof: 'className="inline-flex"',
    why:
      '`<Button>` 을 감싸 shrink-wrap 시키는 자리잡기 래퍼 둘. `inline-flex` 하나뿐이고 그건 값 ' +
      '층 자신이 `className` 의 몫이라고 정의한 층이다(자리잡기·폭·순서).',
  },
  /*
   * ── Prose reclassification from the 2026-08-04 link floor-24 round: of the
   * "always-on underline 12" category, the 6 inside markdown body flow come out of
   * the control ledger. ⚠️ The preceding verdict counted "prose 5 + pseudo-prose 2
   * = 7", but the recount with this file's parser is **6** (the gateway markdown
   * a-override is 1 — the verdict's "gateway 2" mistook the truncated-body notice
   * CTA for prose; that CTA is a standalone control and stays in debt). The 2
   * pseudo-prose places (inline-flex on external/repo links) were corrected to
   * display:inline in the same PR as the registration, closing the 320px wrapping
   * defect at the same time.
   */
  {
    file: 'src/widgets/docs-vault/ui/DocsVaultViewer.tsx',
    count: 5,
    claim: 'prose',
    proof: 'prose-link',
    why:
      '마크다운 a-override 의 다섯 갈래(프로젝트 위키링크 · 볼트 위키링크 · 외부 http · ' +
      '내부 해석 · repo blob). 전부 본문 문장 속에 렌더되고 줄 상자는 산문 부모의 것이다. ' +
      '외부 2는 inline-flex 로 줄바꿈이 죽어 있던 「가짜 산문」이었고 이 라운드가 inline 으로 정정했다.',
  },
  {
    file: 'src/views/gateway-doc/ui/GatewayDocPage.tsx',
    count: 1,
    claim: 'prose',
    proof: 'prose-link',
    why: '관문 읽을거리(PROSE_COMPONENTS)의 마크다운 a-override — 같은 산문 계약.',
  },
  {
    file: 'app/[locale]/layout.tsx',
    count: 1,
    claim: 'state-scoped',
    proof: 'focus:not-sr-only',
    why:
      '본문 건너뛰기 링크. 평상시 `sr-only` 이고 규격(반경·보더·인셋·타입·색) **전부가 `focus:` ' +
      '접두 아래**에 있다. `controlClass()` 는 무변형 문자열을 내므로 접두를 붙일 수 없다.',
  },
];

/**
 * **A literal.** Same reason as the button-side baselines — a derived value
 * loosens the pawl in both directions (that is how the hard-cut ratchet actually
 * died).
 */
// 29 → 32 (2026-08-18 gateway remake): DownloadPage's hero CTA pair + the demo
// ghost anchor — all standard-button claims (the shape the value layer yielded).
// 32 → 36 (2026-08-18, second pass): the hero's second row of 4 — the owner
// pointed out the hero had no Windows-download or web-entry button, so all four
// destinations became buttons. The same
// The same standard-button claim, so the registration reason is the same.
const BASELINE_ANCHOR_REGISTERED = 29;

/** **Only this number may fall.** The anchor total (92) minus registered (25). */
const BASELINE_ANCHOR_DEBT = 0;

const anchorCensus = census(scannedFiles, OUTSIDE_VALUE_LAYER_ANCHORS, ANCHOR_TAGS, NO_BASIS_ANCHORS);

/**
 * ════════════════════════════════════════════════════════════════════
 * ## Forms — **the fifth count** (2026-08-05)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### This gate could not see forms
 *
 * The two families above count only `button` and `Link`/`a`. So **`<input>`,
 * `<textarea>`, `<select>`, and `<label>` were outside this ratchet's field of
 * view**, and the promise that hand-written controls never grow had never once
 * been true for forms.
 *
 * The 2026-08-05 exhaustive count measured the cost:
 *
 * | Item | Measured |
 * |---|---:|
 * | `<input>` · `<textarea>` · native `<select>` · `<label>` | **62** |
 * | `<input>` that actually reads `--control-h-*` | **6 / 33 (18%)** |
 * | Distinct (height, radius, type, border) combinations | **34 across 44 places (77%)** |
 * | Native checkboxes below WCAG 2.5.8 AA (24px) | **5 / 5** |
 *
 * That is **more scattered** than chips at "50 combinations across 143 (35%)".
 * The absolute number is smaller because the population is smaller, but the
 * share of places inventing a value by hand is higher.
 *
 * ### Why a third count instead of adding to debt 74
 *
 * Same reason anchors were counted separately (the "third and fourth counts"
 * section above). Adding forms to button debt means that when the number falls
 * **nobody can tell whether a button or a form moved.** The unit of work also
 * differs — a button is usually one `controlClass({ shape })` line, whereas a
 * form needs a **shape the value layer does not have yet** (`field`), so
 * convening 체계 (the design-systems seat) comes first.
 *
 * ### Today this count does not claim anything is movable
 *
 * The registration list (`OUTSIDE_VALUE_LAYER_FIELDS`) is **empty**, because
 * without a field shape in the value layer there is not yet any basis to claim
 * "the value layer cannot emit this in principle". So today this count does
 * exactly one thing: **stop it growing further.** When the shape exists,
 * registrations appear and debt comes down.
 */
const FIELD_TAGS = ['input', 'textarea', 'select', 'label'] as const;

/**
 * **Empty** — for the reason above. Until the value layer has a `field` shape,
 * "the value layer cannot emit this" is a tautology, not a claim.
 */
const OUTSIDE_VALUE_LAYER_FIELDS: readonly OutsideEntry[] = [
  {
    file: 'src/views/project-detail/ui/ProjectDetailPage.tsx',
    count: 1,
    claim: 'no-spec',
    proof: 'className="sr-only"',
    why:
      '검수 JSON을 브라우저의 로컬 file picker에서 받는 **보이지 않는 transport input**이다. ' +
      '사람이 보고 누르는 규격은 바로 옆 `Button`이 소유하고, 이 input에 field 모양을 ' +
      '씌우면 같은 행동에 두 개의 시각 컨트롤이 생긴다.',
    conditional: 'File System Access 기반 공용 picker primitive가 생기면 이 native input과 등록을 함께 지운다.',
  },
  {
    file: 'src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx',
    count: 4,
    claim: 'no-spec',
    proof: 'className="block"',
    why:
      '빠른 편집 시트의 라벨 넷. **`block` 하나뿐인 자리잡기 래퍼**다 — 이름 텍스트는 ' +
      '안쪽 `FieldLabel` 이 그리고, 이 태그는 그것을 세로로 쌓는 일만 한다. `fieldLabel()` ' +
      '을 씌우면 안쪽 이름과 **둘이 규격을 다툰다**(`DESIGN-SYSTEM.md` 「폼 필드」 절의 ' +
      '셋째 갈래).',
    conditional: '이 라벨이 자기 타입·색을 직접 내기 시작하면 부채로 내린다.',
  },
  /*
   * ════════════════════════════════════════════════════════════════════
   * 2026-08-06 — **forms declared closed too.** The remaining 20 were judged exhaustively.
   * ════════════════════════════════════════════════════════════════════
   *
   * Until the day before, this array was **empty** — with no field spec in the
   * value layer, "the value layer cannot emit this in principle" was a tautology.
   * Now that `fieldClass` and `fieldLabel` exist, each remaining place can actually
   * state why it cannot be moved.
   */
  {
    file: 'src/features/project-edit/ui/ProjectForm.tsx',
    count: 2,
    claim: 'no-spec',
    proof: 'accent-[color:var(--color-indigo-brand)]',
    why:
      '체크박스 하나와 그 라벨. 체크박스의 크기·타깃은 **자기 계약**' +
      '(`checkbox-target-size.contract.test.ts`)이 이미 고정한다 — 그 계약이 정본이고 ' +
      '여기서 또 규격을 씌우면 두 곳이 값을 다툰다.',
    conditional: '체크박스 계약이 사라지면 이 줄을 지우고 부채로 내린다.',
  },
  {
    file: 'src/views/home/ui/OntologyBootstrapForm.tsx',
    count: 2,
    claim: 'no-spec',
    proof: 'accent-[color:var(--color-indigo-brand)]',
    why: '위와 같다 — 체크박스와 그 라벨은 체크박스 계약이 고정한다.',
    conditional: '체크박스 계약이 사라지면 부채로 내린다.',
  },
  {
    file: 'src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx',
    count: 4,
    claim: 'no-spec',
    proof: 'accent-[color:var(--color-indigo-brand)]',
    why: '체크박스 둘과 그 라벨 둘. 체크박스 계약이 고정한다.',
    conditional: '체크박스 계약이 사라지면 부채로 내린다.',
  },
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 2,
    claim: 'no-spec',
    proof: 'accent-[var(--color-indigo-accent)]',
    why: 'push opt-in 체크박스와 그 라벨. 체크박스 계약이 고정한다.',
    conditional: '체크박스 계약이 사라지면 부채로 내린다.',
  },
  {
    file: 'src/features/docs-vault-local/ui/WebManualConnectPanel.tsx',
    count: 2,
    claim: 'no-spec',
    proof: 'size-4',
    why: '수동 연결 확인 체크박스와 그 행. 체크박스의 크기와 타깃은 체크박스 계약이 고정한다.',
    conditional: '체크박스 계약이 사라지면 부채로 내린다.',
  },
  {
    file: 'src/widgets/app-settings-menu/ui/settings-primitives.tsx',
    count: 2,
    claim: 'shape-gap',
    proof: '[&>svg]:h-3.5',
    why:
      '슬라이더(`type="range"`)와 그 행. **앱에 이것 하나뿐**이고, 트랙과 썸이 ' +
      '각각 치수를 갖는 이중 체계라 `fieldClass` 의 한 줄/여러 줄 문법과 근본적으로 ' +
      '다르다. 소비처가 하나인 값에 이름을 붙이지 않는다는 이 저장소의 규율.',
    conditional: '슬라이더가 둘이 되면 그때 값에 이름을 붙인다.',
  },
  {
    file: 'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
    count: 1,
    claim: 'stage-geometry',
    proof: 'absolute inset-0 resize-none',
    why:
      '문서 편집기의 **전면 작성면**. `absolute inset-0` 으로 패널 전체를 채우는 ' +
      '표면이라 상자 치수(높이·인셋·반경)를 가질 수 없다 — `fieldClass` 는 자기 ' +
      '상자를 내는 부품이다.',
    conditional: '이 편집기가 상자 안으로 들어오면 부채로 내린다.',
  },
  {
    file: 'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx',
    count: 1,
    claim: 'no-spec',
    proof: 'invisible pointer-events-none absolute',
    why:
      '컴포저의 **높이 계측용 숨김 미러**. 사용자에게 안 보이고 `scrollHeight` 를 ' +
      '재려고만 존재한다 — 컨트롤이 아니라 계측 장치라 씌울 규격이 없다.',
    conditional: '오토그로우를 CSS 로 대체해 미러가 사라지면 이 줄도 지운다.',
  },
];

/** **A literal.** Same reason as the other baselines — a derived value loosens the pawl in both directions. */
/*
 * 2026-08-15: -1 → -6. Migrating to the Checkbox primitive folded 6 raw
 * type="checkbox" places across 5 files into shared/ui/checkbox.tsx (ratified by
 * the 체계 seat —
 * docs/DECISIONS.md).
 */
const BASELINE_FIELD_DEBT = -6;

const fieldCensus = census(scannedFiles, OUTSIDE_VALUE_LAYER_FIELDS, FIELD_TAGS, []);

describe('컨트롤 채택 래칫 — 폼(`<input>` · `<textarea>` · `<select>` · `<label>`)', () => {
  /**
   * ⚠️ **A lower bound on the debt count punishes progress.** This assertion used
   * to require "more than 20" and turned red the moment debt fell 29 → 20 — the
   * third time the same failure was repeated in one day. Debt falling is the
   * destination, not a defect.
   *
   * So the question here is not "is there enough debt" but **"is the detector still
   * alive"** — the per-tag field-of-view assertions below check that. Here we only
   * check that, **while debt is non-zero**, the three categories sum to the total.
   */
  /**
   * ⚠️ **It broke the moment the count reached 0** — the **sixth** time in this
   * file, and this time it was the genuine completion point (2026-08-06).
   *
   * This assertion used to check "total == baseline". Once every remaining place
   * was listed and debt reached 0, it diverged as "total 20 vs baseline 0".
   * **Total and debt are different numbers** — the total is how many of that tag
   * exist, debt is how many of them are not moved yet.
   *
   * The question is whether **the three categories (debt, registered, no-basis)
   * sum to the total**. That must hold whether debt is 0 or 100.
   */
  it('세 부류의 합이 전수와 같다 — 어느 칸에도 안 들어간 폼이 없다', () => {
    expect(fieldCensus.registered + fieldCensus.noBasis + fieldCensus.debt).toBe(fieldCensus.total);
  });

  it('손으로 규격을 쓴 폼이 늘지 않는다', () => {
    const worst = [...fieldCensus.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(
      fieldCensus.debt,
      `손으로 규격을 쓴 폼이 ${BASELINE_FIELD_DEBT} → ${fieldCensus.debt} 로 늘었다 ` +
        `(전수 ${fieldCensus.total}).\n` +
        `가장 많은 파일: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}\n` +
        '값 층에 `field` 모양이 아직 없으므로, 새 폼 컨트롤은 기존 파일의 상수를 재사용하거나 ' +
        '「체계」를 소집해 모양을 먼저 만들어라.',
    ).toBeLessThanOrEqual(BASELINE_FIELD_DEBT);
  });

  it('기준선이 실측보다 위로 뜨지 않는다 — 헐거운 멈춤쇠는 멈춤쇠가 아니다', () => {
    expect(
      fieldCensus.debt,
      `폼 부채가 ${BASELINE_FIELD_DEBT} → ${fieldCensus.debt} 로 줄었다. ` +
        `BASELINE_FIELD_DEBT 도 ${fieldCensus.debt} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_FIELD_DEBT);
  });

  it('세 부류의 합이 전수와 같다 — 어느 칸에도 안 들어간 건이 없다', () => {
    expect(fieldCensus.registered + fieldCensus.noBasis + fieldCensus.debt).toBe(fieldCensus.total);
  });

  /**
   * **Check non-zero per tag, one tag at a time.** "Not being an empty set is
   * different from seeing the whole set" — this prevents a repeat of the
   * 2026-08-05 defect where the icon ratchet matched single quotes only and still
   * passed its denominator assertion. `label` alone puts the total over 20, so a
   * total-only assertion cannot catch `input` going uncounted.
   */
  /**
   * ⚠️ **Do not measure this with debt — it punishes progress** (it actually broke
   * on 2026-08-06).
   *
   * This assertion used to require **at least one debt item** per tag. That day
   * every native `<select>` moved to `fieldClass`, the count hit 0, and the check
   * went red — a gate breaking in the direction of a better spec, which makes the
   * next person revert **the spec** rather than the gate (exactly the shape
   * `documentation.md` forbids). That was the second time the same failure happened
   * in a single day.
   *
   * So we measure the **scanner's field of view** — whether that tag exists in the
   * repository at all, debt or not. Debt reaching 0 is the destination, not a
   * defect.
   */
  it('네 태그를 각각 보고 있다 — 한 태그만 보면서 총계로 위장하지 못한다', () => {
    const seen = Object.fromEntries(FIELD_TAGS.map((tag) => [tag, 0])) as Record<string, number>;
    for (const file of scannedFiles) {
      const source = readFileSync(file, 'utf8');
      for (const tag of FIELD_TAGS) {
        seen[tag] += [...source.matchAll(new RegExp(`<${tag}\\b`, 'g'))].length;
      }
    }
    for (const tag of FIELD_TAGS) {
      expect(seen[tag], `<${tag}> 가 저장소에 하나도 없다 — 스캐너의 시야 밖이거나 태그가 사라졌다`).toBeGreaterThan(0);
    }
  });
});

describe('컨트롤 채택 래칫 — 등재된 「값 층 밖」', () => {
  it('등재된 파일이 전부 실재한다 — 없는 파일을 세면 수가 거짓이 된다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
    }
  });

  it('각 줄의 근거가 아직 파일에 있다 — 근거가 사라지면 주장도 죽는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `${entry.file} 에서 «${entry.proof}» 가 사라졌다. 이 줄의 주장(${entry.claim})은 그 근거 위에 ` +
          `서 있다 — 자리가 바뀌었으면 등록부를 다시 쓰고, 값 층으로 옮겼으면 줄을 지워라.`,
      ).toBe(true);
    }
  });

  it('`chrome-token` 줄의 토큰이 정말 고정 단 밖이다 — px 하나가 되면 부채로 내려온다', () => {
    const chromeTokens = OUTSIDE_VALUE_LAYER.filter((e) => e.claim === 'chrome-token');
    expect(chromeTokens.length, '`chrome-token` 줄이 하나도 없으면 이 검사는 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of chromeTokens) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, entry.proof),
        `${entry.proof} 가 globals.css 에서 **고정 단 하나**가 됐다. 그러면 값 층이 낼 수 있으므로 ` +
          `«표현 불가» 주장이 죽는다 — ${entry.file} 를 등록부에서 지우고 부채로 갚아라.`,
      ).toBe(true);
    }
  });

  it('등재 수가 그 파일의 실측을 넘지 않는다 — 있지도 않은 것을 등재할 수 없다', () => {
    for (const [file, claimed] of registeredByFile) {
      const actual = byFile.get(file) ?? 0;
      expect(
        claimed,
        `${file}: 등재 ${claimed} 인데 실측 손 컨트롤은 ${actual} 뿐이다. 자리를 값 층으로 옮겼으면 ` +
          `등록부의 수도 함께 내려라 — 안 내리면 그만큼이 부채에서 조용히 사라진다.`,
      ).toBeLessThanOrEqual(actual);
    }
  });

  it('등재가 늘지 않는다 — 늘리려면 리터럴을 손으로 올리고 diff 에 왜를 적는다', () => {
    expect(
      registered,
      `등재가 ${BASELINE_REGISTERED} → ${registered} 로 늘었다. **등록부는 허가 목록이 아니라 부채 ` +
        `목록이다** — 옮길 수 있는데 안 옮긴 것을 등재하는 것이 이 게이트가 막으려는 실패다. 정말 값 ` +
        `층이 원리적으로 못 내는 자리라면 BASELINE_REGISTERED 를 손으로 올려라.`,
    ).toBeLessThanOrEqual(BASELINE_REGISTERED);
  });

  it('등재가 줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      registered,
      `등재가 ${BASELINE_REGISTERED} → ${registered} 로 줄었다. BASELINE_REGISTERED 도 ${registered} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_REGISTERED);
  });
});

describe('컨트롤 채택 래칫 — 앵커(`<Link>` · `<a>`)', () => {
  it('등재된 앵커 파일이 전부 실재한다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
    }
  });

  it('각 줄의 근거가 아직 파일에 있다 — 근거가 사라지면 주장도 죽는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `${entry.file} 에서 «${entry.proof}» 가 사라졌다. 이 줄의 주장(${entry.claim})은 그 근거 위에 ` +
          `서 있다 — 자리가 바뀌었으면 등록부를 다시 쓰고, 값 층으로 옮겼으면 줄을 지워라.`,
      ).toBe(true);
    }
  });

  it('`chrome-token` 앵커 줄의 토큰이 정말 고정 단 밖이다', () => {
    const chromeTokens = OUTSIDE_VALUE_LAYER_ANCHORS.filter((e) => e.claim === 'chrome-token');
    expect(chromeTokens.length, '`chrome-token` 줄이 없으면 이 검사는 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of chromeTokens) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, entry.proof),
        `${entry.proof} 가 globals.css 에서 **고정 단 하나**가 됐다 — 값 층이 낼 수 있으므로 ` +
          `${entry.file} 를 등록부에서 지우고 부채로 갚아라.`,
      ).toBe(true);
    }
  });

  it('등재 수가 그 파일의 실측을 넘지 않는다 — 있지도 않은 것을 등재할 수 없다', () => {
    for (const [file, claimed] of anchorCensus.registeredByFile) {
      const actual = anchorCensus.byFile.get(file) ?? 0;
      expect(
        claimed,
        `${file}: 앵커 등재 ${claimed} 인데 실측 손 앵커는 ${actual} 뿐이다. 자리를 값 층으로 옮겼으면 ` +
          `등록부의 수도 함께 내려라.`,
      ).toBeLessThanOrEqual(actual);
    }
  });

  it('앵커 등재가 늘지 않는다 — 늘리려면 리터럴을 손으로 올리고 diff 에 왜를 적는다', () => {
    expect(
      anchorCensus.registered,
      `앵커 등재가 ${BASELINE_ANCHOR_REGISTERED} → ${anchorCensus.registered} 로 늘었다. ` +
        `**등록부는 허가 목록이 아니라 부채 목록이다** — 「모양이 아직 없다」는 등재 사유가 아니다.`,
    ).toBeLessThanOrEqual(BASELINE_ANCHOR_REGISTERED);
  });

  it('앵커 등재가 줄었으면 기준선도 내린다', () => {
    expect(
      anchorCensus.registered,
      `앵커 등재가 ${BASELINE_ANCHOR_REGISTERED} → ${anchorCensus.registered} 로 줄었다. ` +
        `BASELINE_ANCHOR_REGISTERED 도 ${anchorCensus.registered} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_ANCHOR_REGISTERED);
  });

  it('앵커 부채가 늘지 않는다 — 누를 수 있는 것은 전부 값 층을 지난다', () => {
    const worst = [...anchorCensus.byFile.entries()]
      .filter(([f]) => !anchorCensus.registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      anchorCensus.debt,
      `손으로 규격을 쓴 앵커가 ${BASELINE_ANCHOR_DEBT} → ${anchorCensus.debt} 로 늘었다 ` +
        `(전수 ${anchorCensus.total} − 등재 ${anchorCensus.registered}).\n` +
        `\`controlClass({ shape: 'link' })\` 가 이 자리를 위해 있다. \`<Link>\` 는 \`cn\` 병합이 필수다 — ` +
        `raw 변형은 base 의 border-transparent 가 소스 순서로 이긴다(이 파일 실측).\n` +
        `등재된 파일이라도 면제가 아니다: 거기 손 앵커를 더하면 등재 수는 그대로고 이 수가 오른다.\n` +
        `미등재 중 가장 많은 파일: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_ANCHOR_DEBT);
  });

  it('앵커 부채를 갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      anchorCensus.debt,
      `앵커 부채가 ${BASELINE_ANCHOR_DEBT} → ${anchorCensus.debt} 로 줄었다. ` +
        `BASELINE_ANCHOR_DEBT 도 ${anchorCensus.debt} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_ANCHOR_DEBT);
  });

  it('세 수의 합이 앵커 전수와 맞는다', () => {
    expect(anchorCensus.registered + anchorCensus.noBasis + anchorCensus.debt).toBe(anchorCensus.total);
  });

  it('태그 내역이 전수와 맞는다 — 두 태그가 서로를 잃지 않는다', () => {
    const perTag = Object.fromEntries(
      ANCHOR_TAGS.map((tag) => [tag, census(scannedFiles, [], [tag], []).total]),
    );
    expect(
      perTag,
      '머리말의 태그 내역이 실측과 어긋난다. 수가 움직였으면 내역도 같이 고쳐라 — ' +
        '내역이 낡으면 다음 사람이 어느 쪽이 움직였는지 못 읽는다.',
    ).toEqual(ANCHOR_TAG_SPLIT);
    expect(Object.values(perTag).reduce((a, b) => a + b, 0)).toBe(anchorCensus.total);
  });
});

describe('컨트롤 채택 래칫 — 아직 안 옮긴 부채', () => {
  it('부채가 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    const worst = [...byFile.entries()]
      .filter(([f]) => !registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      debt,
      `아직 안 옮긴 손 컨트롤이 ${BASELINE_HAND_WRITTEN_DEBT} → ${debt} 로 늘었다 ` +
        `(전수 ${total} − 등재 ${registered}).\n` +
        `새 컨트롤은 \`controlClass({ shape })\` 를 쓴다 — 모양 여덟은 실측에서 나왔고 램프 밖 값을 못 낸다.\n` +
        `등재된 파일이라도 면제가 아니다: 거기 손 컨트롤을 더하면 등재 수는 그대로고 이 수가 오른다.\n` +
        `미등재 중 가장 많은 파일: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('부채를 갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      debt,
      `부채가 ${BASELINE_HAND_WRITTEN_DEBT} → ${debt} 로 줄었다. ` +
        `이 파일의 BASELINE_HAND_WRITTEN_DEBT 도 ${debt} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('세 수의 합이 전수와 맞는다 — 갈라진 수가 서로를 잃지 않는다', () => {
    expect(
      registered + noBasis + debt,
      `등재 ${registered} + 근거 없음 ${noBasis} + 부채 ${debt} 가 전수 ${total} 과 다르다. ` +
        '한 자리를 두 부류에 동시에 넣었거나, 어느 부류가 실측을 넘어 등재됐다.',
    ).toBe(total);
  });
});

describe('컨트롤 채택 래칫 — 근거 없음(값 층이 낼 것이 없다)', () => {
  it('등재된 파일이 전부 실재하고 근거가 아직 파일에 있다', () => {
    expect(NO_BASIS.length, '이 등록부가 비면 아래 검사 전부가 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of NO_BASIS) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `${entry.file} 에서 «${entry.proof}» 가 사라졌다 — 이 줄의 주장이 그 근거 위에 서 있다.`,
      ).toBe(true);
    }
  });

  it('등재한 수만큼 **자격 있는** 클릭면이 그 파일에 실재한다 — 규격을 하나라도 달면 부채로 돌아온다', () => {
    for (const entry of NO_BASIS) {
      const tags = entry.family === 'button' ? BUTTON_TAGS : ANCHOR_TAGS;
      const qualified = handWrittenTags(entry.file, tags).filter(isClickSurface).length;
      expect(
        qualified,
        `${entry.file}: 「${entry.claim}」 ${entry.count} 을 주장하는데 판정을 통과하는 자리는 ${qualified} 뿐이다. ` +
          '판정은 ① 전면(inset-0) ② 램프 소유 속성 0개 를 동시에 요구한다 — 스크림에 높이·인셋·반경·타입을 ' +
          '하나라도 달면 값 층이 낼 것이 생긴 것이므로 「낼 것이 없다」가 거짓이 된다. 그 자리는 부채로 갚아라.',
      ).toBeGreaterThanOrEqual(entry.count);
    }
  });

  it('이 사유의 **전수**가 못박은 수와 같다 — 다섯 번째 클릭면은 조용히 면제되지 않는다', () => {
    const hits = clickSurfaceCensus(scannedFiles);
    expect(
      hits.length,
      `클릭면 전수가 ${CLICK_SURFACE_CENSUS} → ${hits.length} 로 바뀌었다 (${[...new Set(hits)].join(' · ')}).\n` +
        '늘었으면: 새 전면 클릭 캐처가 생긴 것이다. 정말 규격이 0인 자리면 등록부와 CLICK_SURFACE_CENSUS 를 ' +
        '**손으로** 올려라 — 그 diff 가 「왜」를 적을 자리다. 아니면 부채로 갚아라.\n' +
        '줄었으면: 그 자리가 컨트롤이 됐거나 사라진 것이므로 두 수를 함께 내려라.',
    ).toBe(CLICK_SURFACE_CENSUS);
    expect(noBasis, '등재한 근거 없음이 실측 전수를 넘었다').toBeLessThanOrEqual(hits.length);
  });

  it('근거 없음이 늘지 않는다 — 늘리려면 리터럴을 손으로 올린다', () => {
    expect(
      noBasis,
      `근거 없음이 ${BASELINE_NO_BASIS} → ${noBasis} 로 늘었다. **이 부류가 도피처가 되면 이 라운드는 ` +
        `실패다** — 「옮기기 번거롭다」는 근거 없음이 아니라 부채다.`,
    ).toBeLessThanOrEqual(BASELINE_NO_BASIS);
    expect(anchorCensus.noBasis).toBeLessThanOrEqual(BASELINE_ANCHOR_NO_BASIS);
  });

  it('근거 없음이 줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      noBasis,
      `근거 없음이 ${BASELINE_NO_BASIS} → ${noBasis} 로 줄었다. BASELINE_NO_BASIS 도 ${noBasis} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_NO_BASIS);
    expect(anchorCensus.noBasis).toBeGreaterThanOrEqual(BASELINE_ANCHOR_NO_BASIS);
  });

  it('근거 없음 수가 그 파일의 실측을 넘지 않는다 — 파일 면제가 아니다', () => {
    for (const [file, claimed] of noBasisByFile) {
      const actual = byFile.get(file) ?? 0;
      expect(claimed, `${file}: 근거 없음 ${claimed} 인데 실측 손 컨트롤은 ${actual} 뿐이다.`).toBeLessThanOrEqual(
        actual,
      );
    }
  });
});

/**
 * **Detector probes** — the `/gate-probe` discipline.
 *
 * The tests above run only on "today's numbers" and "today's registry". That
 * leaves room for the detector to idle on an empty set, or for registrations to
 * swallow debt whole, with everything still green. Here the predicate is aimed at
 * **in both directions**.
 *
 * ⚠️ The hard-cut ratchet had the defect where `BASELINE = REGISTRY.length` made
 * "it never grows" **impossible to fail in principle**. So both baselines are
 * literals, and ④ below asserts that fact itself.
 */
describe('탐지기 프로브 — 이 게이트가 실제로 무엇을 잡는가', () => {
  const FIXTURE = 'tests/fixtures/control-adoption/HandWrittenControl.tsx.fixture';

  it('① 손으로 쓴 컨트롤을 실제로 센다 — 0을 통과로 읽지 않는다', () => {
    expect(existsSync(FIXTURE), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(true);
    // Two fixtures: one off-ramp spec + one **unregistered** chrome-token place.
    expect(countInFile(FIXTURE), '픽스처의 손 컨트롤 2건을 못 셌다면 파서가 깨진 것이다').toBe(2);

    /*
     * Alive on the real tree too. ⚠️ **Do not ask "how many are left" here** — that
     * number shrinks with debt, so a lower bound turns red on the day everything is
     * moved (re-reviewed 2026-08-06). Measure the **number of files scanned** (the
     * scanner's field of view) instead; that is independent of debt.
     */
    expect(scannedFiles.length, '훑은 파일이 너무 적다 — 스캐너의 시야가 죽었다').toBeGreaterThan(150);
    expect(byFile.size, '파일별 집계가 음수일 수 없다').toBeGreaterThanOrEqual(0);
  });

  it('② 등재 안 된 자리를 손 컨트롤로 만들면 **부채**로 잡힌다 — 등재 쪽으로 새지 않는다', () => {
    /*
     * Adding the fixtures to the scan sends both straight to debt. A place using a
     * chrome token is **not registered unless it is in the registry** — the rule is
     * "only verified, registered rows are exempt", not "using a token exempts you".
     */
    const withFixture = census([...scannedFiles, FIXTURE]);
    expect(withFixture.registered).toBe(registered);
    expect(withFixture.debt).toBe(debt + 2);
    expect(
      withFixture.debt,
      '미등재 자리에 손 컨트롤이 늘었는데 부채 기준선을 안 넘었다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('③ 등록부에서 줄을 지우면 그 자리가 **부채로 돌아온다** — 등재가 사실을 지우지 않는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER.filter((e) => e !== entry),
      );
      expect(without.registered).toBe(registered - entry.count);
      expect(
        without.debt,
        `${entry.file}(${entry.proof}) 줄을 지웠는데 부채가 안 늘었다 — 그 줄은 아무것도 등재하고 있지 않다`,
      ).toBe(debt + entry.count);
    }
  });

  it('④ 기준선 둘이 **리터럴**이다 — 등록부에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    const source = readFileSync(SELF, 'utf8');
    expect(
      /const BASELINE_REGISTERED = \d+;/.test(source),
      'BASELINE_REGISTERED 가 리터럴이 아니다. `OUTSIDE_VALUE_LAYER.length` 나 reduce 로 두면 줄을 ' +
        '더할 때 기준선도 같이 올라가 멈춤쇠가 헐거워진다(하드컷 래칫의 실제 결함).',
    ).toBe(true);
    expect(/const BASELINE_HAND_WRITTEN_DEBT = \d+;/.test(source), '부채 기준선도 리터럴이어야 한다').toBe(true);
  });

  /**
   * ⚠️ **Do not pin the negative example to a token name** (doing so turned this
   * red once, on 2026-08-05).
   *
   * This check used to name `--control-h-md` as its negative example — *"a single
   * 32px, so the value layer can emit it as is"*. Then a legitimate change raised
   * control heights to 44px under `@media (pointer: coarse)`, the token **moved to
   * the positive side**, and the check failed even though the helper was fine.
   *
   * That is the shape `documentation.md` forbids — a hand-written expectation
   * breaks on changes that improve the spec, and the next person reverts **the
   * spec** rather than the check. So the negative example is **derived from the
   * CSS**: pick a token that really is "one declaration + a plain px" today and
   * check that the helper rejects it.
   */
  it('⑤ 토큰 검사가 아무거나 통과시키지 않는다 — 고정 단 토큰은 반드시 거절한다', () => {
    // Positive: redefined per condition, or using a viewport function.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--git-row-h')).toBe(true);
    expect(tokenIsBeyondFixedSteps(globalsCss, '--overlay-close-size')).toBe(true);
    // Since 2026-08-05 `--control-h-md` is redeclared as 44 on coarse → positive.
    expect(
      tokenIsBeyondFixedSteps(globalsCss, '--control-h-md'),
      'coarse 승격이 사라졌다면 그건 손가락 바닥이 무너진 것이다',
    ).toBe(true);

    // Negative: pick a "one declaration + plain px" token straight from the CSS.
    const counts = new Map<string, string[]>();
    for (const m of globalsCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
      const list = counts.get(m[1]) ?? [];
      list.push(m[2].trim());
      counts.set(m[1], list);
    }
    const plainPx = [...counts.entries()]
      .filter(([, values]) => values.length === 1 && /^\d+(\.\d+)?px$/.test(values[0]))
      .map(([token]) => token);
    expect(
      plainPx.length,
      '평범한 px 토큰이 하나도 없다 — 이 프로브가 빈 집합 위에서 돌고 있다',
    ).toBeGreaterThan(10);
    for (const token of plainPx) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, token),
        `${token} 은 px 하나뿐인데 통과했다 — 「크롬 토큰이라 못 옮긴다」가 무제한 면제가 된다`,
      ).toBe(false);
    }
    // A token that does not exist is not evidence.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--not-a-real-token-xyz')).toBe(false);
  });

  it('⑦ 앵커 탐지기가 실제로 센다 — `<button>` 만 세던 사각지대의 자(尺)', () => {
    // Must count the fixture's two anchors (one `<Link>`, one `<a>`).
    expect(
      countInFile(FIXTURE, ANCHOR_TAGS),
      '픽스처의 손 앵커 2건을 못 셌다면 앵커 탐지기가 죽은 것이다',
    ).toBe(2);
    /*
     * Alive on the real tree — without this, "anchor debt 0" and "not counted at
     * all" are the same green. **But measure the scanner's field of view, not the
     * debt count** (same reason as above).
     */
    expect(scannedFiles.length, '훑은 파일이 너무 적다 — 스캐너의 시야가 죽었다').toBeGreaterThan(150);
    expect(anchorCensus.byFile.size, '앵커 파일별 집계가 음수일 수 없다').toBeGreaterThanOrEqual(0);
  });

  it('⑧ 앵커를 하나 더 쓰면 **앵커 부채로** 잡힌다 — 버튼 수는 안 움직인다', () => {
    const withFixture = census([...scannedFiles, FIXTURE], OUTSIDE_VALUE_LAYER_ANCHORS, ANCHOR_TAGS, NO_BASIS_ANCHORS);
    // The fixtures are not in the registry, so both go to **debt**.
    expect(withFixture.registered).toBe(anchorCensus.registered);
    expect(withFixture.debt).toBe(anchorCensus.debt + 2);
    expect(
      withFixture.debt,
      '앵커가 늘었는데 기준선을 안 넘었다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(BASELINE_ANCHOR_DEBT);
    // The two counts do not contaminate each other.
    expect(census([...scannedFiles, FIXTURE]).debt, '앵커 픽스처가 버튼 부채를 움직였다').toBe(debt + 2);
  });

  it('⑨ 앵커 기준선 둘이 **리터럴**이다', () => {
    const source = readFileSync(SELF, 'utf8');
    expect(/const BASELINE_ANCHOR_DEBT = \d+;/.test(source)).toBe(true);
    expect(
      /const BASELINE_ANCHOR_REGISTERED = \d+;/.test(source),
      '앵커 등재 기준선이 리터럴이 아니다. `OUTSIDE_VALUE_LAYER_ANCHORS.length` 로 두면 줄을 더할 때 ' +
        '기준선도 같이 올라가 「등재가 늘지 않는다」가 원리적으로 실패 불가가 된다.',
    ).toBe(true);
  });

  it('⑪ 앵커 등록부에서 줄을 지우면 그 자리가 **부채로 돌아온다**', () => {
    for (const entry of OUTSIDE_VALUE_LAYER_ANCHORS) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER_ANCHORS.filter((e) => e !== entry),
        ANCHOR_TAGS,
        NO_BASIS_ANCHORS,
      );
      expect(without.registered).toBe(anchorCensus.registered - entry.count);
      expect(
        without.debt,
        `${entry.file}(${entry.proof}) 줄을 지웠는데 앵커 부채가 안 늘었다 — 그 줄은 아무것도 등재하고 있지 않다`,
      ).toBe(anchorCensus.debt + entry.count);
    }
  });

  /**
   * ⚠️ **Do not require a real defect to still exist** (it actually broke on
   * 2026-08-06).
   *
   * This probe used to assert *"DownloadPage's release-notes link is still in
   * debt"*. Moving that link into the value layer turned it **red** — punishing the
   * fix. That was the third time the same failure happened in this file in one day.
   *
   * The question is not "does the defect still exist" but **"does registration leak
   * into a file-wide exemption"**. Plant a hand anchor in a registered file and
   * check that debt rises — a form that holds even when defects are 0.
   */
  it('⑫ 앵커 등재는 **파일 면제가 아니다** — 등재된 파일에 손 앵커를 더하면 부채가 오른다', () => {
    const file = 'src/views/download/ui/DownloadPage.tsx';
    const claimed = anchorCensus.registeredByFile.get(file) ?? 0;
    expect(claimed, '이 프로브는 그 파일이 실제로 등재돼 있을 때만 뜻이 있다').toBeGreaterThan(0);
    const withOneMore = census(
      [...scannedFiles, FIXTURE],
      OUTSIDE_VALUE_LAYER_ANCHORS,
      ANCHOR_TAGS,
      NO_BASIS_ANCHORS,
    );
    expect(
      withOneMore.debt - anchorCensus.debt,
      '등재된 파일 곁에 손 앵커를 더했는데 부채가 안 올랐다 — 등재가 면제로 새고 있다',
    ).toBeGreaterThan(0);
  });

  /**
   * **`shape-gap` cannot be used without a condition** (added 2026-08-06).
   *
   * The claim is that the value layer's eight shapes cannot produce that layout in
   * principle — but shapes and axes are things that can be built. Without recording
   * **when it reopens** it becomes a permanent exemption, which breaks this
   * registry's definition as a debt list rather than a permit list.
   *
   * The discipline comes from the owner: a place with a final verdict comes out of
   * the debt count, but **why it was removed and when it returns** must stay on the
   * record.
   */
  it('⑭ `shape-gap` 등재는 전부 «언제 다시 여는가» 를 진다', () => {
    const gaps = OUTSIDE_VALUE_LAYER.concat(OUTSIDE_VALUE_LAYER_ANCHORS).filter(
      (e) => e.claim === 'shape-gap',
    );
    expect(gaps.length, '이 단언은 shape-gap 등재가 있을 때만 뜻이 있다').toBeGreaterThan(0);
    for (const e of gaps) {
      expect(
        e.conditional,
        `${e.file} 의 shape-gap 등재에 조건이 없다 — 조건 없는 「못 낸다」는 영구 면제다`,
      ).toBeTruthy();
      expect(
        (e.conditional ?? '').length,
        `${e.file} 의 조건이 너무 짧다 — 무엇이 관측되면 다시 여는지 적어야 한다`,
      ).toBeGreaterThan(15);
    }
  });

  it('⑬ 기각된 주장이 실제로 기각된다 — 하단 탭바의 56px 은 크롬 토큰 면제가 아니다', () => {
    /*
     * The place where this round claimed `chrome-token` for
     * `--topology-bottom-tab-min-height` and then rejected its own claim. This pins
     * that the rejection was **the gate's verdict, not an opinion** — the day the
     * value becomes conditional this probe turns red and the registration is
     * reconsidered.
     */
    expect(
      tokenIsBeyondFixedSteps(globalsCss, '--topology-bottom-tab-min-height'),
      '이 토큰이 조건부가 됐다 — BottomTabBar 2건의 `chrome-token` 등재를 다시 심사하라',
    ).toBe(false);
    /*
     * ⚠️ **What was rejected is the one `chrome-token` claim, not "any
     * registration".**
     *
     * This assertion used to require *"BottomTabBar is **not registered**"*. So when
     * it was honestly registered on 2026-08-06 under a **different claim**
     * (`shape-gap` — the eight shapes cannot produce a vertical stack layout, 4
     * places exhaustively), it turned red.
     *
     * A probe must guard only the property it exists to guard. Here that property is
     * **"a fixed 56px token cannot buy a chrome exemption"**, so it checks only
     * whether the place is registered under *that* claim.
     */
    const bottomTabClaims = OUTSIDE_VALUE_LAYER_ANCHORS.concat(OUTSIDE_VALUE_LAYER)
      .filter((e) => e.file === 'src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx')
      .map((e) => e.claim);
    expect(
      !bottomTabClaims.includes('chrome-token'),
      'BottomTabBar 가 `chrome-token` 으로 등재됐다 — 그 주장은 56px 고정 단이라 기각된 것이다',
    ).toBe(true);
  });

  it('⑩ 값 층을 지난 앵커는 안 센다 — 램프를 통과해도 세면 옮길 이유가 사라진다', () => {
    // The probe only means something if a consumer exists: an anchor already using `controlClass`.
    const adopted = scannedFiles.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /<(Link|a)\b[^>]*controlClass\s*\(/.test(src.replace(/\n/g, ' '));
    });
    expect(adopted.length, '값 층을 지난 앵커 소비처가 0이면 이 면제는 검증된 적이 없다').toBeGreaterThan(0);
  });

  /*
   * ── Probes for the no-basis category (2026-08-04). This category **fails if it
   * becomes an escape hatch**, so the predicate is aimed at in both directions:
   * what it catches on the real tree (⑭), what it **rejects** on the real tree
   * (⑮), how it dies on synthetic input (⑯), and whether deleting a row returns the
   * place to debt (⑰).
   */

  it('⑭ 판정 함수가 실물에서 센다 — 빈 집합 위에서 놀지 않는다', () => {
    const hits = clickSurfaceCensus(scannedFiles);
    expect(hits.length, '실물에서 한 자리도 못 잡으면 이 부류는 검증된 적이 없다').toBeGreaterThan(0);
    for (const file of new Set(hits)) {
      expect(
        NO_BASIS.some((e) => e.file === file),
        `${file} 이 클릭면 판정을 통과하는데 등록부에 없다 — 등재하거나 부채로 갚아라.`,
      ).toBe(true);
    }
  });

  /**
   * ⚠️ **Do not require a real defect to still exist** — the **fourth** time in
   * this file alone.
   *
   * This probe used to require `DemoStage`'s full-bleed overlay to **still be in
   * debt**. When that overlay moved into the value layer on 2026-08-06,
   * `handWrittenTags` returned 0 and it turned red — punishing the fix.
   *
   * The question is not "is that file still unmoved" but **"does being full-bleed
   * alone buy an exemption"**. That is a property of the **predicate**
   * (`isClickSurface`), so a synthetic tag answers it, and it holds even when
   * defects are 0.
   *
   * What `DemoStage` looked like is kept as the control case, so the next person
   * does not misread "full-bleed therefore scrim".
   */
  it('⑮ 음성 대조군 — 전면이어도 규격을 지면 클릭면이 아니다', () => {
    /*
     * `DemoStage`'s playback overlay really had this shape — full-bleed (`inset-0`)
     * with a scrim background, but it carries **`text-body` and `leading-body`**. The
     * value layer has something to emit, so it is debt, not a click surface. If this
     * passed, "full-bleed means exempt" would make the category an escape hatch.
     */
    const fullBleedWithSpec =
      ' type="button" className="absolute inset-0 flex items-center justify-center' +
      ' bg-[color:var(--color-backdrop-medium)] text-body leading-body' +
      ' text-[color:var(--color-text-primary)] transition-colors"';
    expect(
      isClickSurface(fullBleedWithSpec),
      '전면 + 스크림이지만 타입을 싣는 오버레이가 클릭면으로 통과했다 — 「전면이면 면제」가 열렸다',
    ).toBe(false);
    expect(NO_BASIS.some((e) => e.file === 'src/views/download/ui/DemoStage.tsx')).toBe(false);
    // Anchor 0 means "0 after seeing all 102", not "not counted".
    /*
     * **A lower bound near the measured value turns red on every move.** The
     * question is not "are there enough" but **"is it counting"** — when every anchor
     * has moved into the value layer this number is correctly 0, and at that point
     * the `fullBleed` assertions above would already have gone red first, making this
     * probe moot.
     */
    expect(anchorCensus.total, '앵커를 한 건도 안 세고 있으면 아래 0 은 무의미하다').toBeGreaterThan(0);
    expect(clickSurfaceCensus(scannedFiles, ANCHOR_TAGS).length).toBe(BASELINE_ANCHOR_NO_BASIS);
  });

  it('⑯ 합성 프로브 — 규격을 하나만 달아도, 전면을 벗어나도 자격이 죽는다', () => {
    const scrim = ' type="button" className="absolute inset-0 z-[25] bg-[color:var(--x)]" onClick={close}';
    expect(isClickSurface(scrim), '순수 스크림을 못 잡으면 판정 함수가 죽은 것이다').toBe(true);
    for (const spec of ['px-3', 'min-h-9', 'rounded-chip', 'text-label', 'border', 'font-medium', 'gap-2']) {
      expect(
        isClickSurface(scrim.replace('inset-0', `inset-0 ${spec}`)),
        `«${spec}» 를 달았는데도 통과한다 — 값 층이 낼 것이 생겼는데 「낼 것이 없다」가 남으면 도피처다.`,
      ).toBe(false);
    }
    // The same holds when hidden behind a variant prefix.
    expect(isClickSurface(scrim.replace('inset-0', 'inset-0 hover:rounded-chip'))).toBe(false);
    // Not full-bleed means it is simply a control.
    expect(isClickSurface(scrim.replace('inset-0 ', ''))).toBe(false);
  });

  it('⑰ 근거 없음 줄을 지우면 그 자리가 **부채로 돌아온다** — 분류가 사실을 지우지 않는다', () => {
    for (const entry of NO_BASIS_BUTTONS) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER,
        BUTTON_TAGS,
        NO_BASIS_BUTTONS.filter((e) => e !== entry),
      );
      expect(without.noBasis).toBe(noBasis - entry.count);
      expect(
        without.debt,
        `${entry.file} 줄을 지웠는데 부채가 안 늘었다 — 그 줄은 아무것도 분류하고 있지 않다`,
      ).toBe(debt + entry.count);
    }
    // Adding fixtures does not leak into no-basis — anything not in the registry is debt.
    const withFixture = census([...scannedFiles, FIXTURE]);
    expect(withFixture.noBasis).toBe(noBasis);
    expect(withFixture.debt).toBe(debt + 2);
  });

  it('⑱ 근거 없음 기준선도 **리터럴**이다 — 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    const source = readFileSync(SELF, 'utf8');
    expect(/const BASELINE_NO_BASIS = \d+;/.test(source)).toBe(true);
    expect(/const BASELINE_ANCHOR_NO_BASIS = \d+;/.test(source)).toBe(true);
    expect(
      /const CLICK_SURFACE_CENSUS = \d+;/.test(source),
      '사유의 전수까지 리터럴이어야 한다 — 실측에서 파생하면 「늘면 빨개진다」가 실패 불가가 된다.',
    ).toBe(true);
  });

  /**
   * ⚠️ **Do not require a real defect to still exist** — the **fifth** time in
   * this file alone, and this time it broke **the moment debt reached 0**
   * (2026-08-06).
   *
   * This probe used to require *"`CommitDetail` is still in debt"*. Moving that
   * file into the value layer took button debt to **0** and turned it red — the
   * textbook shape of **a gate that dies on the day the work is finished**.
   *
   * The question is not "is that file still unmoved" but **"does registration
   * exempt a whole file"**. Plant a hand control in a registered file and check
   * that debt rises; that holds even when defects are 0 (the anchor side's ⑫ is
   * already in this shape).
   */
  it('⑥ 등재는 **파일 면제가 아니다** — 등재된 파일에 손 컨트롤을 더하면 부채가 오른다', () => {
    const registeredFile = OUTSIDE_VALUE_LAYER[0]?.file;
    expect(registeredFile, '등록부가 비었다 — 이 프로브가 헛돈다').toBeTruthy();
    expect(registeredByFile.has(registeredFile as string)).toBe(true);

    const withOneMore = census([...scannedFiles, FIXTURE], OUTSIDE_VALUE_LAYER, BUTTON_TAGS, NO_BASIS_BUTTONS);
    expect(
      withOneMore.debt - debt,
      '등재된 파일 곁에 손 컨트롤을 더했는데 부채가 안 올랐다 — 등재가 면제로 새고 있다',
    ).toBeGreaterThan(0);
  });
});
