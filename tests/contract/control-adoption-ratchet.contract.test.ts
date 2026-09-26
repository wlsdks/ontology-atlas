import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { judgeRatchet, RAISES_DIR, type RatchetJudgement } from './lib/ratchet-base';

/**
 * Control adoption ratchet — **hand-written control classNames can never grow.**
 *
 * Six counts: two tag families (button, anchor) × three categories (registered,
 * debt, no-basis). A place is *registered* when it has a written claim to be
 * outside the value layer, *debt* when it is simply not moved yet, and
 * *no-basis* when the value layer cannot express its layout at all.
 *
 * The ratchet only ever lets those numbers fall. Raising one means the value
 * layer lost a consumer, which is the regression this file exists to stop.
 *
 * **Judged against the merge base, not against a number in this file**
 * (2026-09-27). Every count is measured on the working tree and again, with the
 * same code, on the merge-base tree (`lib/ratchet-base.ts`); a change fails only
 * when it made a count grow. The registries live in
 * `tests/contract/control-adoption/<registry>/<file>.<claim>.json`, one file per
 * row, so the base's own registry is what the base is measured with and two
 * branches registering different places touch different files. A deliberate
 * rise is a `tests/contract/ratchet-raises/<gate>.<slug>.json` record whose
 * `why` is the reason a reviewer reads. Before this, nine baseline literals here
 * changed in 56 of 74 commits to the file, and parallel branches conflicted on
 * them.
 *
 * **The round history — exhaustive counts, registration verdicts, the 13 claims
 * that were rejected and why — is in Git history, not here:** the round log
 * under `docs/` was deleted after commit 530382f7a, which still holds it.
 *
 * Owner's note: *"What does it mean for the verdict to be final? Does it mean there's nothing left to fix? If so, you should declare termination so we don't have to check again next time."*
 *
 * | | 2026-08-05 | Now |
 * |---|---:|---:|
 * | Hand-written **buttons** | 74 | **0** |
 * | Hand-written **links** | 67 | **0** |
 * | Hand-written **form elements** | 63 | **0** |
 *
 * **This round is over as long as these three are 0.** The rest are all "positions the design system fundamentally cannot create," **listed with justification**, and each line carries a `conditional` — "when to reopen" — which, if a method arises, will be deleted and return to debt.
 *
 * **So the next person doesn't need to check these numbers again.** The only moment they become non-zero is when **a new hand-written control is added**, at which point this file turns red.
 *
 * ## Terminology — What "debt" means (2026-08-06, Owner's note)
 *
 * This file uses terms like "debt" and "registered," which are developer jargon and may not be understood by newcomers. Here is the plain explanation:
 *
 * | Term in this file | Plain meaning |
 * |---|---|
 * | **Debt** | **Count of positions where styles are written manually without going through the design system.** The higher the number, the more inconsistently styled buttons appear across screens. |
 * | **Registered** | **Positions that the design system fundamentally cannot create** — listed with justification for why they can't be created. This is not an exemption but a **record of "no method available now"**; if a method arises, it returns to debt. |
 * | **No-basis** | **Positions where the design system could create them but has nothing to create** — e.g., missing transparent click surfaces. Not a target for fixing. |
 * | **Ratchet** | A check that fixes today's value as an upper bound so that improved numbers **cannot get worse again**. |
 *
 * **"Button debt 0" = No buttons with hand-written styles remain.**
 *
 * | Count | Meaning — one line | Direction of movement |
 * |---:|---|---|
 * | **Button registered** | Positions the value layer **fundamentally cannot produce** (`control-adoption/buttons/`) | To increase, add a raise record for `control-registered`. That file is where to write "why." |
 * | **Button no-basis** | Positions the value layer could produce but **has nothing to produce** — not controls (`control-adoption/no-basis/`) | It is normal for this not to move. **Not a target for repayment.** |
 * | **Button debt 0** | Positions that can be moved but **haven't been yet** | **Tends toward 0.** Button progress is read solely from here. |
 * | **Anchor registered** | Same meaning, for anchors (`control-adoption/anchors/`) | Add a raise record for `control-anchor-registered`. |
 * | **Anchor no-basis 0** | Measured: saw all 102 and got 0 (since `<a>` aims to be thin, it's hard to become a "click surface with nothing to say") | Add a raise record if qualifiers arise. |
 * | **Anchor debt 0** | Unregistered among the 23 `<Link>`s and 14 `<a>`s not yet moved | **Tends toward 0.** |
 * | **Form debt 0** | `<input>`, `<textarea>`, `<select>`, `<label>` with hand-written specs (added 2026-08-05; 63→57→29→20 on 06) | **Tends toward 0.** All text fields have been moved, and native `<select>` debt is **0**. The remaining 20 are layout-only labels (not specs) + 5 checkboxes (self-contract fixed) + slider/full-screen editor/stage input. |
 * | Button total 108 · Anchor total 102 · Form total 63 | Sum of each category | Derived values. Do not judge based on these numbers. |
 *
 * **Why three categories — because debt must be able to reach 0.** Mixing "fundamentally cannot create" and "has nothing to produce" into debt means that number can never reach 0, and a number that can't reach 0 is decoration, not progress tracking. The owner's note was precisely this: *"Does 'no need' mean it doesn't need to be created by the design system or is unrelated? If so, it's correct to exclude it entirely; including it in the count causes confusion."*
 *
 * ⚠️ **Before 2026-08-04, this gate counted only `<button>`.** So "debt 85" was never the count for *all controls* — anchors (109) could grow freely outside the gate's view. The number didn't suddenly jump to 194; **that many had simply not been counted all along.**
 *
 * ### ⚠️ The registration ledger is a debt list, not an approval list
 *
 * Inherits the discipline from the header of `surface-motion-ratchet.contract.test.ts`: *"If you find a hard-cut surface not listed here, fix it rather than adding a line."*
 *
 * 1. **Registration is only for positions that passed verification.** "Probably can't be moved" is debt, not registration. Debt containing unverified items is an error in the **safe direction**.
 * 2. **Registering a file does not exempt that file.** Lines register **counts**, not files. If you add one more hand control to a registered file, the registration count stays the same but debt increases by 1 = turns red.
 * 3. **If justification disappears, the line dies.** Each line carries a `proof` string; if it disappears from the file, the gate says "claim is dead." The `chrome-token` line goes one layer deeper — checking in `globals.css` whether that token is **truly not a fixed step**. The day the token becomes a normal px, that line turns red and returns to debt.
 * 4. **If registration becomes an escape route, this round fails.** Registering something that could be moved but isn't is exactly that failure.
 *
 * ### Criteria for registration — The line separating "forever outside" from "not yet moved"
 *
 * The value layer (`controlClass()`) produces **className**. Therefore, the following three are fundamentally unproduced by this layer, and adding axes won't help:
 *
 * | Claim | What is outside the value layer |
 * |---|---|
 * | `chrome-token` | Chrome tokens own dimensions. The value layer's height vocabulary is **fixed steps** only, but these tokens are `clamp(38px, 4.2vh, 48px)` or **redefined to different values** on narrow width/coarse pointer. Fixed-step ramps cannot express viewport functions or pointer upgrades. |
 * | `stage-geometry` | Dimensions come from **JS-calculated `style`** (absolute stage coordinates), not className. Ramps cannot produce style. |
 * | `value-layer-peer` | The value layer's **own house**. Positions where primitives declare their own specs. Forcing a move breaks contracts or passes color/dimensions via `className`, neutralizing the layer — a layer cannot consume itself. |
 * | `standard-button` *(anchor, 2026-08-04)* | **The only shape explicitly yielded by the value layer.** `control-class.ts` states in its header: *"Does not replace standard buttons (`<Button>`) … creating overlapping positions blurs 'which is the spec'."* Thus, anchors passing through `buttonVariants()` have **already passed another value layer**, and moving them via `controlClass` is a violation of that rule, not compliance. |
 * | `no-spec` *(anchor, 2026-08-04)* | This tag **declares no shape/size/color** — either pure passthrough `className={className}` or a single `"inline-flex"` placeholder. It's a position where the value layer has nothing to produce; placeholders are layers the value layer itself defines as its `className` share. |
 * | `state-scoped` *(anchor, 2026-08-04)* | The entire spec exists **only under variant prefixes** (e.g., `focus:` skip link — `sr-only` normally). `controlClass()` produces unvarianted class strings, so it cannot add prefixes. |
 * | `prose` *(anchor, 2026-08-04 link bottom round)* | **Not a control but prose.** Links within markdown body flow — siblings are text, parent `--leading-prose` owns line boxes, and WCAG 2.5.8 exempts within sentences. All eight value layer shapes are flex-based, so it's **fundamentally impossible to produce `display:inline`** (inline-flex kills line wrapping at 320px — measured rect 1 vs 2). The destination is the `.prose-link` contract (`prose-link.contract.test.ts`). |
 *
 * Conversely, "the value layer doesn't have that shape yet" is **not a reason for registration**. That's a position opened by adding parts to the "system," so it is **debt**. This distinction is everything in this round.
 *
 * ### How to read the three branches — Two questions thrown at each position
 *
 * 1. **Can the value layer produce this?** If not → **registration** (one of the claim types in the table above).
 * 2. If yes, **does it have something to produce?** If yes → **debt** (move it). If no →
 *    **no-basis** (`NO_BASIS` — see "2026-08-04 category round" section below).
 *
 * The case where "no" is true in #2 is only one today: **full-screen click surfaces** (screams · blocking backdrops). They declare no shape/size/type/ink, so the value layer has nothing to overlay.
 * ⚠️ "Too cumbersome to move" · "Pixels move" are not answers to #2 — those are debt.
 *
 * Lines tagged `conditional` mean "move if X arises" — on the day the value layer gains that axis, delete registration and lower to debt, then repay.
 *
 * ### 13 claims **rejected** by the 2026-08-04 registration round — because the claims were false
 *
 * Claims entering this round were "git 15 · shared/ui 10 · workshop 11 = 36 outside value layer." Opening each position revealed **only 23 were true**:
 *
 * | Rejected position | Count | Why the claim was false |
 * |---|---:|---|
 * | `atlas-git-panel/ui/CommitDetail.tsx` | 2 | Does **not use** `--git-*` tokens. Underline tab (`min-h-9 border-b-2`) and deep inset row (`px-5`) — both are **value layer holes already counted by the owner** = debt |
 * | `atlas-git-panel/ui/ConceptEgoCard.tsx` | 1 | Same. Text control in `flex-wrap` list — "dense wrap" hole = debt |
 * | `shared/ui/node-explanation-edit.tsx` | 3 | Only **lives** in `src/shared/ui`, not a primitive. `h-6 w-6 rounded-full` is the "no circular icon control" hole already named by the owner = debt |
 * | `shared/ui/info-hint.tsx` | 1 | Same circular icon hole = debt |
 * | `shared/ui/compact-copy-button.tsx` | 1 | `rounded-chip px-2 py-1 text-label` is what the ramp produces. What's outside is just one `active:translate-y` **press idiom** = debt |
 * | `ontology-studio/**` — sentence controls 3 · dotted picker 1 · `rounded-2xl` entry card 1 | 5 | Not "stage geometry." The first four are `inline`/dotted holes; the last is a ramp waiting exception **already visibly registered with owner approval + `eslint-disable`** = debt |
 *
 * ⚠️ **Additionally, the justification for workshop 11 — "`studio-navigation.spec.ts` fixes those dimensions by contract" — is not true.** That spec measures only `fontSize`·`height` of `studio-save`/`studio-exit`, and those two are **not in** this 11. The real reason three stage positions are outside the value layer is not e2e contracts but
 * **`style={{left, top, width: layout.socket.w …}}`** — justification changed to registration.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## What awaits debt 90 — Value layer holes (input for next round)
 * ════════════════════════════════════════════════════════════════════
 *
 * We've counted "reasons unable to move" each round, and placed that census here once. The count is the measurement from the last round that measured these holes.
 *
 * | Hole | Last measurement | What's missing |
 * |---|---:|---|
 * | **Size ramp bundles inset and type in one step** | 9 | "Large inset + small text" exists (mono micro CTA 5 · success tint action 2 · settings notification chip · `MarkdownField` tab). Moving changes type — not an axis but a "system" task of deciding **which is the spec**. |
 * | **`scope: 'panel'` opens only ink** | 7 | Border/indigo still outside: `--map-panel-border`(#2a2a30) · `--map-panel-divider`(#23232a) · `--map-indigo-bright`(#8890e0 ≠ global #7170ff). Value layer comment asserts *"panel ramp has no indigo"* but **it does**. |
 * | **No circular icon control** | 6 | `icon` is fixed to `rounded-chip`. Changing 24px circle to 6px square is not normalization but **identity change**, so it wasn't decided alone without "system" convening. |
 * | **Auxiliary controls in dense rows/wrap** | 5 + 1 | Applying `link`'s `min-h-11`(WCAG 2.5.8) makes rows 2~3x taller. The `inline` axis exempts only "**within sentences**" but cannot speak of "within dense rows." |
 * | **3-column grid row** | 3 | `STEP_ROW`(visual/name/why). `row` is flex-only. |
 * | **`tone: 'accent'` is a marker, not ink** | 3 | Two indigos: marker `--color-indigo-accent`(#7170ff) and text `--color-indigo-text-soft`(#bcc3ffeb). Measured on tint background: accent **3.55~4.25:1 (AA fail)** vs text-soft **7.09~8.37:1**. Not a "position unable to move" but **a potential defect of the value layer itself**. |
 * | **Underline as selection indicator tab** | 2 | `segment` defines "border 0," so it can't draw `border-b-2` tabs. Changing to tint is not normalization but **notation change** = design gate's job. |
 * | **Dotted line = "fillable" affordance** | 2 | Stage's "add more" · picker's "create new." Border *style* is shape; passing via `className` neutralizes the layer. |
 * | **Full-width center alignment + touch upgrade** | 2 | `chip`/`card` have content width, no `justify-center`; `segment` with `justify-center` has no border = "full-width center button with border" doesn't exist. |
 * | **Rising segment** | 2 | `segment`'s press is only indigo tint, but two idioms of `--color-panel` thumb rising on track (`LocaleSwitch` · settings `SegmentSwitch`), one fixed by contract as string. |
 * | **No position without type step** | 2 | All eight shapes enforce size, so controls needing to **inherit** parent text size structurally can't enter. |
 * | **No bordered icon square** | 2 | `QueueRowActions` kebab · `HubRail`. Count is only two, so **not yet an axis** — count and pass. |
 * | **Shallow vertical inset of pill** | 2 | Ramp has 2·2·4px but actual filter pill is 6~10px. Raising makes type larger too. |
 * | **Deep inset list row** | 1 | `px-5` of commit file row. Max for `row` is `px-3`. |
 * | **Ramp outside 16px radius** | 1 | Entry selection card — exception **already visibly registered with owner approval + `eslint-disable`**. `--radius-surface`(16) registration in next design pass. |
 * | **Press idiom (`active:translate-y`)** | 1 | `compact-copy-button`. Value layer has no press axis. |
 *
 * ### Registration candidate verification — 2026-08-04 integrated round confirmed 7 for registration
 *
 * The paragraph above delayed chrome token candidates to "next registration round"; opening each position: `SearchPalette` · `GlobalSearch` · `ShortcutSheet` · `DocsHeaderTile` ·
 * `BackToTopButton` · `GitStatusTile` etc. = **6 registrations**.
 * Verification caught one defect — GlobalSearch's dedicated token is a 32px **single fixed declaration**, so `tokenIsBeyondFixedSteps` rejected it (coarse upgrade block comment previously claimed "already covered"), and only after converging to `--overlay-close-size` was it registered. **Still unverified candidates**: scream/full overlay 5 (need new claim type) · settings sheet contract string fix 4 — still kept as debt (safe direction).
 *
 * ### That this count is **over-counted** — Limitations we keep in mind
 *
 * We count the **literal** `controlClass(` of opening tags (tags using constants created by `controlClass()` in the same file pass through). So if a completed class passing the ramp is imported and used in **another file**, it's caught as "hand-written." A safe-direction error (no under-counting), but penalizes the correct refactor to shared constants.
 *
 * ### 2026-08-04 hole round — debt 90 → 85, and **0 new axes**
 *
 * The remaining 77 items (unregistered at start of this round) were fully split. **The output of this round is not the 5 moved but "why no axis was created."**
 *
 * | Category | Count | What it is |
 * |---|---:|---|
 * | **Value layer outside re-judgment** | 25 | Chrome token contract 10 · scream/full overlay 5 · settings sheet contract fixes class string 4 · error/404 standard button positions 6 (4 adopted this time) → **21 for next registration round** |
 * | **Mono uppercase micro CTA** | 5 | **3rd consecutive round.** Next judgment priority 1 — review as **part** first, not axis (rule 1). |
 * | Lucky/grid row | 10 | Prior "no axis creation" decision valid. |
 * | Panel border/indigo | 6 | **4th consecutive round.** All overlap with secondary holes, single recovery 0~1. |
 * | Inset bottom/asymmetric | 5 | |
 * | Type/ink inheritance | 5 | |
 * | 40px/tint fill 3 · dense row inside 2 · chip 28px 1 | 6 | |
 * | Singletons (only one reason) | 14 | Cannot serve as axis justification. |
 *
 * **Why no new axes**: Most remaining positions hit **multiple holes simultaneously** (e.g., panel indigo + inset/type combination). So creating any single axis opens only 0~1 positions for that axis alone. Axes with 0~1 consumers aren't created — that's the criterion that killed `fixedHeight`. **Panel border/indigo 6 opens only in the same round as resolving inset/type combination.**
 *
 * **Re-measurement corrected two prior observations**: "Circular icon 6" is **2** for this target group (four are in `shared/ui`, outside value layer) · `HubRail` is a vertical edge tab, not "bordered icon square," so squares are only **1**, still not an axis.
 *
 * Moved 5: Two 404 files adopted `<Button>` (correcting that position ratio **4.42 → 4.70** — outside `a11y-ratchet`'s ROUTES, a position the ratchet couldn't see) · `rounded-[4px]` + eslint-disable → `rounded-micro`(disable reason extinguished by registration).
 *
 * ⚠️ Side measurement: raw `buttonVariants()` has both base `border-transparent` and variant border **remaining**, so CSS source order wins transparency. `<Link>` consumers require `cn` merge.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 Anchor Round — Split 110 **fully**
 * ════════════════════════════════════════════════════════════════════
 *
 * On the day anchor gate opened, we opened and classified 110 position by position. **The output of this round is not the 8 moved but a full split of "why the remaining 102 don't move"** — exactly what made button side go from 417 → 85.
 *
 * ### Moved 8 — Only two categories, both justified by measurement
 *
 * | Category | Count | Actual movement |
 * |---|---:|---|
 * | `chip`/`md` **exact match** | 5 | **0px.** Hand class was `min-h-8 px-2.5 text-label`+`border-soft`+`rounded-chip`, and ramp produces the same values. Ramp's added `py-1.5` only makes natural height 16+12+2=30, but `min-h-8`(32) still wins. |
 * | `link`/`lg`/`scope:panel` | 3 | **+10px** (FullDetailA1 handoff row). This is not normalization but **accessibility correction** — that position had a 20px text-height target and fell short of WCAG 2.5.8's 24px floor **not exempted by sentence exemption** (a standalone control). `link`'s `min-h-11` is exactly the default axis created to prevent this defect. |
 *
 * ### Remaining 102 — Registration 19 · Debt 83
 *
 * | Category | Count | What's missing / Why outside? |
 * |---|---:|---|
 * | **[Registration] `standard-button`** | 10 | Shape yielded by value layer. DownloadPage 7 · Architecture empty-state exit 1 · Two 404 files 2. |
 * | **[Registration] `chrome-token`** | 3 | AtlasGitPanel 2(`--git-setup-action-height`) · TopologyReviewLink 1(`--chrome-tile-size`). Both have multiple declarations, passing token check. |
 * | **[Registration] `no-spec`** | 3 | MacosDownloadLink(passthrough) · PublicQuickActions 2(`inline-flex` wrapper). |
 * | **[Registration] `value-layer-peer`** | 1 | `<Link>` branch of `ChromeTile`. |
 * | **[Registration] `state-scoped`** | 1 | Skip link. |
 * | No position without type step | 13 | All eight shapes enforce size, so anchors needing to **inherit parent size** structurally can't enter. Button owner counted this hole as "2," but it's **13** for anchors — largest category this round, next judgment priority 1. |
 * | Dense row/sentence text links | 12 | `link`'s `min-h-11`(WCAG 2.5.8) makes top bar/chip inside/2-link row 2~3x taller. `inline` axis exempts only "**within sentences**." |
 * | **Permanent underline + `decoration-*`** | 12 | Value layer has **no underline/decoration axis at all**. Half are markdown body links (document 5 · gateway 2), so not controls but **prose** — whether to create an axis or remove this category from controls is "system's" judgment. |
 * | Inset and type bundled in one step | 9 | The hole button owner counted as "9." Exactly 9 for anchors too. |
 * | No weight axis (`font-medium`/`semibold`) | 4 | Only `onAccent` loads semibold as fixed. |
 * | Borderless **vertical** tile | 4 | Rail 2 · bottom tab 2. `tile` requires border/radius/inset. ⚠️ Claimed `--topology-bottom-tab-min-height` for `chrome-token` on bottom tab but **rejected** — single 56px fixed declaration, so token check refuses (case where gate actually blocks registration escape). |
 * | Height outside ladder | 3+2+2+1+2 | 36px 3 · 28px 2 · 40px chip 2 · 48px sheet row 1 · 40px `rounded-full` idiom 2. |
 * | Tint/overlay fill | 3 | |
 * | Mono uppercase micro | 3 | Same category as button side. Combined is 8, 4th consecutive round. |
 * | Lucky/grid card | 3 | Prior "no axis creation" decision valid. |
 * | `border-t` list row | 3 | `row` has no divider. |
 * | Panel border/action surface | 2 | `scope: 'panel'` opens only ink — 5th consecutive round for button side. |
 * | Singleton (only one reason) | 6 | Press/raise idiom · vertical underline selection indicator · ChromeTile inline reimplementation · border color axis · no `body-lg` step on `link` · (remaining not included in height outside ladder). |
 *
 * **Why zero new axes again**: Two largest categories (type inheritance 13 · dense row 12) are **opposite direction requirements** — one "don't produce size," the other "produce height but exclude 44." Both touch `link` and invalidate each other's harm. Which is the spec is "system's" job, not something this round decides alone.
 *
 * ### Input for next round — By recovery count, with full split
 *
 * | Rank | What | Recovery | Why not this time? |
 * |---:|---|---:|---|
 * | 1 | `link`'s **type/target two axes** judgment | 25 | The only decision opening both type inheritance 13 + dense row 12 at once. "System" convening matter, reason this round didn't fix that file. |
 * | 2 | Underline/decoration axis — **or remove prose links from controls** | 12 | Half are markdown body, so may not be "pressable." Whether to create axis or change classification comes first. |
 * | 3 | Resolve inset/type combination | 9 | Same decision as button side's 9 — both numbers drop in same round. |
 * | 4 | Weight axis | 4 | Asymmetry now: only `onAccent` loads semibold. |
 * | 5 | Borderless vertical tile | 4 | Rail 2 + bottom tab 2. `tile` needs "border 0" branch. |
 * | 6 | `app/error.tsx` · `app/global-error.tsx`'s `rounded-full` idiom | 2(+button 2) | Not missed this time but the **sibling** of the idiom normalized to `<Button>` yesterday, needing to move **together** with adjacent `<button>`, so left behind. Expected actual movement: radius 9999→12 · px 16→18 · type 12.5→14 · ink secondary→primary + background fill. Not value layer movement but **design judgment**, so different gate. |
 * | 7 | ChromeTile inline reimplementation 1(`HomePage`) | 1 | Answer is moving to primitive, but icon tokens differ (`--topology-chrome-icon-size` vs `--chrome-icon`) and has badge child, so not a drop-in. |
 * | — | Mono uppercase micro 3 | 3 | Combined with button side's 5 to **8**. 4th consecutive round, so review as **part**, not axis. |
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 Integrated Round — Re-evaluate button 85 + anchor 83 as one table, judge by combination
 * ════════════════════════════════════════════════════════════════════
 *
 * Since reason for "zero new axes" three consecutive rounds was "remaining positions hit multiple holes simultaneously," this time we weighed categories not singly but **by combination**. Full re-measurement used same logic as this file's parser (brace depth), and 85 · 83 matched baseline exactly.
 *
 * ### Integrated category table (Button B / Anchor A — one position overlaps multiple categories)
 *
 * | Category | B | A | Sum | Status |
 * |---|---:|---:|---:|---|
 * | Position without type step (needs inheritance) | 52* | 38* | 90* | Waiting `link` redesign (judgment below) — *Heuristic over-count: positions with label in child span · icon-only mixed. Pre-selection full split is anchor round's 13 as ground truth. |
 * | Inset/type combination (ramp outside (px,py,type)) | 19 | 24 | 43 | Not axis but **split into three identities** (judgment below). |
 * | Tint fill (indigo/success a-step background) | 15 | 9 | 24 | With mono parts/panel surface. |
 * | Height outside ladder(h-5/7/9/10/12/16) | 10 | 10 | 20 | Partially chrome token/standard button idiom. |
 * | Permanent underline/decoration | 2 | 13 | 15 | Interaction judgment: prose 5 + fake prose 2 are not controls — to prose contract round. |
 * | Weight(font-medium/semibold) | 8 | 7 | 15 | Axis candidate, consumer full split complete. |
 * | rounded-full idiom(outside pill) | 9 | 5 | 14 | Majority overlaps mono CTA. |
 * | **Mono uppercase micro CTA** | 8 | 4 | 12 | **5th consecutive round — part upgrade judgment (below)**. |
 * | Lucky/grid | 4 | 6 | 10 | "No axis creation" decision valid. |
 * | Panel surface(border/divider/indigo-bright) | 7 | 1 | 8 | Has consumers — same round as inset/type split. |
 * | Circular icon | 6 | 0 | 6 | Axis candidate(icon circular branch), 6 consumers. |
 * | border-t list row | 4 | 2 | 6 | `row` divider branch candidate. |
 * | Full-width center alignment | 6 | 0 | 6 | |
 * | Scream/full overlay | 5 | 0 | 5 | Waiting new registration claim type. |
 * | Press idiom(active:translate) | 4 | 0 | 4 | |
 * | Dotted 2 · underline tab 1 · 9px type 2 | 5 | 0 | 5 | Singleton. |
 *
 * ### Combination analysis — "Axis A alone N, A+B for M" (purpose of this convening)
 *
 * Counted per prescription candidate "does that prescription alone open the position entirely?":
 *
 * | Prescription | Positions opened alone | Positions opened by combination |
 * |---|---:|---|
 * | Underline/prose tailoring | 17 | — (Receiving interaction judgment, to prose contract round). |
 * | Chrome token registration verification | 15 | **7 executed this time** (rest scream type/settings sheet contract). |
 * | Inset/type release(single axis assumption) | 13 | +18 (with mono/tint) — but not resolved by single axis (judgment ②). |
 * | Mono part alone | 3 | **+9~12** (with tint fill/inset combination — triple-hole simultaneity is this category's identity). |
 * | Circular icon branch | 3 | +3 (with chrome token/tint). |
 * | Panel surface | 3 | +5 (with inset/type — matches 4th consecutive round observation). |
 * | border-t row branch | 5 | +2. |
 *
 * Numbers confirm convening premise: **largest recovery is not single axis but "mono part + tint tone + inset split" bundle(≈31) and "link redesign"(type inheritance + dense row + prose tailoring, ≈37).** Former needs part spec; latter received judgment below.
 *
 * ### Judgment (System stone, 2026-08-04)
 *
 * ① **`link` stands on wrong floor — factual error.** Value layer cites WCAG 2.5.8
 *    (AA, 24×24) while loading values from 2.5.5(AAA)/HIG(44, `min-h-11`).
 *    44 is `--touch-target-min` and design.md fixed as "coarse single source" — fine pointer full-screen 44 violates this repository's own touch contract.
 *    `inline` escape route was an axis needed because floor was wrong. **Reset(floor 24 + coarse upgrade + `inline` axis deletion + prose tailoring) moves pixels for 43 calls/28 files of adoption consumers, so goes to its own round with position-by-position full split table** — this round only does judgment and comment correction(remove incorrect citation).
 * ② **Inset/type combination is not an axis.** Distribution of (px,py,type) for 43 positions is not one hole but three identities: mono command tag(part) · standard button idiom(px-4/body/h-10) · ±1-step within row/chip. Creating inset axis multiplies to 8 shapes×4 sizes, becoming second system(rule 1 arithmetic).
 * ③ **Mono command tag upgraded to part** (5th consecutive round = most repeated category). Action layer primitive + gate owning voice(font-mono·uppercase·tracking 1token·caption) in same PR — next round priority 1. Tracking splits into full split 0.08×3 / 0.10 / 0.12 / 0.14×3, needing screen measurement for value confirmation.
 *    (Full range re-split of 2026-08-04 icon ramp round — unrelated to registration/debt, all `font-mono`+`uppercase` control tags: **22 positions · 5 values** = 0.06×2(document audit modal, newly found this round) · 0.08×6 · 0.10×2 · 0.12×4 · 0.14×8.
 *    One more 0.06 above debt 12's 4 values — input for measurement round.)
 *
 * ### Next round — By recovery count
 *
 * | Rank | What | Recovery(expected) | Prerequisite |
 * |---:|---|---:|---|
 * | 1 | `link` reset: floor 24(min-h-6) + coarse upgrade + inline axis deletion + prose tailoring(prose 5 · fake prose 2 → prose contract: force display:inline · underline token · UA focus) | Debt ≈37 + adoption 43-call consistency | Position-by-position full split table · touch-target meter Inline exception pre-adoption(if not, prose 5 becomes false red) · Dense row touch-hit-expand prohibited(tap stealing) — gap prescription(gap-1→2.5, height unchanged) priority. |
 * | 2 | Mono command tag part(+ tint fill tone) | ≈12 | Tracking 1 value confirmation(screen measurement) · Amber-isolated 1 position post-downgrade judgment. |
 * | 3 | Dense row AA immediate fix — DomainCouplingCard vertical gap-1→gap-2.5(center distance 21→26, row height unchanged) | Resolve 1 AA violation | Interaction measurement reception complete — only application remains. |
 * | 4 | Panel surface(border/divider/indigo-bright) + remaining inset split | ≈8 | Scope contract("signal is scope-independent") explicit revision needed. |
 * | 5 | Circular icon branch / border-t row branch / weight axis | 6 / 6 / 15 | Re-verify consumer full split for each. |
 * | 6 | Scream registration claim type · settings sheet contract 4 | 9 | Expand registration criteria table. |
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 link floor 24 Round — Execute "next" priority 1 (own round)
 * ════════════════════════════════════════════════════════════════════
 *
 * Execution of integrated round judgment ①. Owner: docs/DECISIONS.md 2026-08-04
 * "link floor 24." What remains in this file is count and correction both:
 *
 * - **Adoption consumer measurement 40 calls/24 files** — "43 calls/28 files" in judgment text was over-counted(re-split with same logic as this file's brace-depth parser). Position-by-position before→after full split table is in PR body and owner. |
 * - `link` floor `min-h-11`(44) → **`min-h-6`(24, WCAG 2.5.8 AA)**. Coarse's
 *   44 is produced by `.touch-hit-expand` — attachment 25(new 21), **non-attachment 15 has neighbor target margin <12px** (tap stealing: ::after of element later in DOM order covers preceding element) or truly within sentence/caption row. Position-by-position judgment in owner table.
 * - `inline` axis **deletion** — Of 14 positions fully split, only 3 were truly within sentences; judgment materials(sibling text source · used display · reflow) are all outside static view.
 *   Inline exemption judgment transferred to runtime meter(touch-target-contract's fine-pointer
 *   check, INLINE_EXEMPT + spacingClear).
 * - **Prose tailoring 6** (above `prose` registration) — Anchor debt 83 → 77. Judgment text's "→76" assumed prose 7, re-split corrected to 6(see registration comment).
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 Category Round — Separate "no-basis" from debt (button 78 → 74)
 * ════════════════════════════════════════════════════════════════════
 *
 * Round opened by owner's note: debt count mixed with **"positions judged to have no reason to put in value layer,"** blurring what that number means. This round didn't fix a single line of code — only **classification and measurement**.
 *
 * ### Output of this round is not the 4 separated but **20 rejected**
 *
 * Header counted "singleton 14 · lucky/grid 10" as those categories. Opening position by position and **re-measuring with entire repository as denominator**, most were false. "Singleton" was only one *within that round's target group*, not **one in the repository** — calling different denominators by same name.
 *
 * | Claim | Count then | Full split re-measurement | True? | Where to |
 * |---|---:|---:|---|---|
 * | Press idiom(`active:translate`) is singleton | 1 | **5** | False | Debt |
 * | Dotted affordance is singleton | 2 | **3** | False | Debt |
 * | Deep inset(`px-5`) is singleton | 1 | **2** | False | Debt |
 * | Underline tab(`border-b-*`) is singleton | 2 | **2** — `tab-bar.tsx` primitive already owns that notation | False | Debt(destination `<TabBar>`). |
 * | Remaining "singletons" like vertical underline/border color/weight | ~8 | Group by ramp outside **attribute types**, minimum 6 consumers(weight 39 · underline 24 · mono 46 …) | False | Debt |
 * | Lucky/grid row | 10 | Actual grid in opening tags is **1**(`DesktopVaultWelcome`). Rest are "lucky card" judgments, not grids. | False | Debt |
 * | That **1** even | — | Icon column fixed to `h-7 w-7`, so `row`(flex+gap) produces **same pixels**. Grid is preference, not necessity. | False | Debt |
 * | **Full-screen click surface(scream/blocking backdrop)** | 5 | **4** — fifth(`DemoStage` play overlay) loads `text-body`·`leading-body`, so judgment function rejects. | **True** | **No-basis 4**. |
 *
 * So **only one category recognized**, and even within it, gate rejected one position. Same result as yesterday's registration round removing 13 items — used what we learned then directly.
 *
 * ### Why only click surface is true — Two requirements this judgment demands
 *
 * `isClickSurface()` requires **simultaneously**: ① `inset-0`(covers screen) ② **0 attributes** owned by ramp(no declaration among height/inset/radius/border/type/weight).
 * Screams only have positioning(`absolute inset-0 z-*`) and one background layer, and overlaying anything of value layer's eight shapes **doesn't change what's visible**. Because no spec to overlay.
 *
 * The map's three carry **contracts** instead of specs — `data-backdrop-contract="blocks-map-and-closes-composer"`
 * · `data-backdrop-surface-token` · `data-interactive-overlay`(marker read by tour auto-start block judgment). Parts of overlay machinery, not design system.
 *
 * ### Return rules — Three to prevent this category from becoming escape route
 *
 * | What becomes false | Which check turns red |
 * |---|---|
 * | Attach any spec to scream(even one `px-3` is enough) | "As many qualified click surfaces as registered actually exist" — value layer now has something to produce, so returns to debt. |
 * | Fifth click surface appears somewhere | "Every qualifying click surface is in the registry" (probe ⑭) and the `control-click-surfaces` count against the merge base — new position caught by both. |
 * | Claim unqualified position for this category | Above two + "no-basis doesn't increase" — confirmed by measurement probe(`DemoStage` false claim → 4 checks red). |
 *
 * All three rules **are machine-measured**, not relying on human opinion. Confirmed all 7 probes red(full split exceeded · additional in registration file · spec attachment · `inset-0` removal · false claim · clearing ledger · lowering baseline only).
 *
 * ### What next round inherits
 *
 * - **`RecentNodeRow`'s `className={className}` pure passthrough 1** — Same nature as anchor registration's
 *   `no-spec` but not yet registered. This round was about creating new category, so didn't touch, left in debt(safe direction). Next registration round priority 1.
 * - Scream type appeared, so header's "waiting for new registration claim type" item **scream/full overlay 5** is resolved — 4 no-basis, 1 debt(`DemoStage`). |
 *
 * ════════════════════════════════════════════════════════════════════
 * ## History — Round-by-round record (417 → 108). **Do not delete**
 * ════════════════════════════════════════════════════════════════════
 *
 * What each round counted is justification for next upgrade. Below is compressed version, preserving numbers and reasons. Original narrative in git history(2026-08-03 revision of this file).
 *
 * ### Why ratchet instead of lint rule (founding judgment, still valid)
 *
 * Original was "lint error if `<button>`'s className doesn't come from `controlClass()`." Counted full split before turning on per `/gate-probe` discipline: **419 items**. A rule that can't be fixed in one PR is noise not force, and covers existing signal(warning 96) — this repository previously banned `shadow-[` entirely, causing lint to jump 144 → 548. Moreover, transition is **normalization**, so pixels change(143 chips with unique size combinations 50 types), and decisions changing pixels are design gate's job, not lint rule's.
 *
 * ### Initial measurement (2026-08-03) — Full split 419, baseline 417
 *
 * By shape: chip 128 · text link-type 85 · list row 39 · icon square 36 · pill 32 · token radius others/uncategorized 58 · card-type 18 · floating/h-8 19 · standard button 1.
 * **2 items** with no className were wrappers, excluded; ratchet caught that correction itself(first run "reduced to 419 → 417" turned red).
 *
 * ⚠️ Parser lesson: If you don't split opening tags by **brace depth**, you read `=>` of `onClick={() => …}` as tag end. That happened in first measurement, classifying 251 of 419 as "no className," nearly flipping conclusion entirely. **Wrong element to measure means wrong number, even if a number comes out.**
 *
 * ### Record of descent
 *
 * | Value | What was moved |
 * |---:|---|
 * | 417 | Initial measurement |
 * | 406 | Settings sheet 11 — chip 6 · icon 2 · row 1 · link-type 1. |
 * | 389 | Map two widgets 31 of 17 — row 8 · link-type 5 · icon 3 · card 2 · chip 1. Remaining 14 are shapes **not in** six categories(vertical action tile 5 · segment tab 3 · window selection chip · vertical edge tab · canvas anchor circle · tree chevron) or positions where ramp minimum inset(8px) conflicts with panel's 4px inset 2. |
 * | 303 | Document drawer/quick drawer/workshop 121 of 86 — row 27 · icon 24 · chip 21 · link-type 13 · pill 4 · card 2. Remaining 35 = chrome token contract 4 · stage absolute positioning 15 · set read as one 11 · inline within sentence 5. |
 * | 269 | Recovery of 48 left by above two rounds "no space" — just after filling four value layer holes(`a1f956ce9`). Settings sheet 29 + map action tile 5. New four `tone`(secondary 6 · accent 11 · success 2 · warning 2 · danger 1) opened 22, `shape: 'tile'` opened 7, `link`'s `min-h-11` opened 3. |
 * | 259 | View round 18 of 10 — row 6 · chip 5. **First time `row`/`sm` exactly matched hand-written height**(`py-1.5` + `--leading-label` = 28px = `min-h-7`). |
 * | 227 | Features round 63 of 32 — chip 15 · pill 6 · link-type 6 · icon 3 · others 2. |
 * | 210 | Map view 31 of 17 — icon 9 · pill 4 · chip 1 · link-type 1. Remaining 14 = not controls 3(full backdrop is scream, not pressable element) · chrome token 2 · ellipsis needed 3 · padding text link 3 · ramp no step 3. |
 * | 173 | Widget round 84 of 37 — chip 21 · pill 4 · icon 4 · card 5 · row 2 · link-type 1. Zero new axes. **210 − 37 = 173 exactly matched full split re-measurement** = means three rounds didn't overlap a single file. |
 * | 148 | Value layer round 25 — result of filling holes owner repeatedly counted. Segment/ghost 12 · panel ink 7 · filled indigo 3 · ellipsis 3. Three new axes + eighth shape one. |
 * | 136 | Workshop/record round 38 of 12 — card 7 · chip 2 · segment 2 · on-accent 3(overlap). Zero new axis/shape/tone. **Record panel is 0 of 15** — this round first saw "structurally outside value layer," and 2026-08-04 registered **12** of them(rest 3 are value layer holes, so debt). |
 * | 144 | Primitive/view round 35 of 4. **Output is "why 31 didn't move" rather than count moved** — same layer as value layer 6 · hole already in owner 21 · dead primitive not rendering 4. |
 * | 123 | Remaining round 57 of 9 — chip 6 · segment 2 · icon 1. Zero new axis/value. Moved chips four sat at `h-9`(36) → **`--control-h-md`(32)** = #884's returned ladder worked, first measurement. |
 * | 119 | Two dead primitives **deleted** — `LinkListEditor`·`ChipListEditor` exported and have unit tests but production consumers were **0**(full split grep). Exactly those 4 items. |
 * | 117 | Value layer round 2(system stone) 6 — "one step below sm" counted three consecutive rounds filled as **micro tier**: `--radius-micro`(4px — already 96 positions with that value) + chip `size: 'xs'` + `segment/sm` override. Together: change chip/pill default border divider(0.08) → border-soft(0.06) — majority correction of full split 74:18. |
 * | **113** | Today after accessibility/ink round. Split into **registration 23 + debt 90** on 2026-08-04. |
 *
 * ### What came with dead primitive deletion (2026-08-03)
 *
 * `link-list-editor` was the **only `.tsx`** in this repository using `data-external-link-marker`(declaration of column allowing `↗` before label), and
 * `label-decoration.contract.test.ts` relied on that fact with *"file writing marker must be 0."* **A component no one renders was supporting the rule's exception clause.** Kept exception(WCAG G201 — warning before leaving to new window), moved gate's idling prevention from "count of files writing exception" to "count of scanned files + synthetic probe." Owner: `docs/DECISIONS.md` 2026-08-03 "Two dead primitives."
 *
 * ### What value layer round **didn't create** — Not creating is also conclusion
 *
 * Applied `/gate-probe` step 1 discipline("don't create rule if noise covers signal") to axes too. **Don't create axis that can't name a single consumer.**
 *
 * | What owner requested | Reason not created(measurement) |
 * |---|---|
 * | `card`'s `items-start`(lucky card) | Doesn't open with one axis. Three consumers **deviate by 2+ axes**(`FirstRunPage` 3 is `grid-cols-[32px_1fr]` · `rounded-chip` · `px-4 py-3.5`, `DesktopVaultWelcome` 4 is radius 0 full bleed `px-4 py-4`). Opening only alignment **no position enters** = axis with 0 users. |
 * | Pair `tracking-<step>` for `text-<step>` | Can produce but **all 244 widths change today**(0.02em × 11px ≈ 6-char chip +1.3px). Honest fix is bundling `--text-<step>--letter-spacing` in globals.css, needing own measurement round. |
 * | Separate `active` vs "selected" axis | Segment 12 positions measured as **12/12 indigo tint background**, split only in ink(primary 11 · accent 1). Normalized by **majority** instead of axis. |
 * | `--chrome-radius-inner`(7px) | **Not a hole.** Alias for `var(--radius-chip)` = 6px in globals.css. Owner's "7px" is old record, and here is reason `segment` uses `rounded-chip`. |
 * | `fixedHeight` axis | Deleted 2026-08-03. Was symptom of wrong value, not axis. |
 *
 * ### Ladder measurement (2026-08-03, 1512×860 · dark) — Only 7 of 18 combinations on ladder
 *
 * Ladder is **28 / 32 / 40**:
 *
 * | Shape | sm | md | lg |
 * |---|---:|---:|---|
 * | chip | 24 | **32** | **32** |
 * | pill | 24 | **32** | **32** |
 * | segment | 22 | 24 | **32** |
 * | row | **28** | 36 | 42 |
 * | card | 30 | 34 | **40** |
 * | icon | 24 | **28** | **32** |
 *
 * Three things read: ① 22 · 24 · 30 · 34 · 36 · 42 are still **outside** this app's height vocabulary. ② `chip`/`pill` have same height for md and lg, so "one step larger" does nothing for height. ③ Chip family lacks 40px(`--control-h-lg`) step. |
 *
 * ### First case value layer expanded contract scope
 *
 * Workshop/record round moved workshop headers 6 had `text-caption`(9.5px) in 3 — `studio-navigation.spec.ts`'s "chrome label is one value 11px" contract only grabbed `studio-save`/`studio-exit` two positions, so siblings escaped.
 * Moving to ramp(`card/sm` = `text-label`) automatically made uncontracted positions into contract values. |
 */
/**
 * The **kind of claim** that something is outside the value layer. A new kind must also be added
 * to the registration-criteria table above.
 *
 * `shape-gap` (added 2026-08-06): **the value layer's eight shapes cannot in principle produce that
 * layout.** Different from `chrome-token`: that one cannot be emitted because the token changes per
 * condition; this one because the layout itself is not in the vocabulary. ⚠️ It must always carry a
 * `conditional` — once the shape or axis exists, the registration is deleted and the place drops
 * back into debt. Without a condition it becomes a permanent exemption, which breaks this
 * registry's definition as a debt list rather than a permit list (probe ⑭ holds this).
 */
const OUTSIDE_CLAIMS = [
  'chrome-token',
  'stage-geometry',
  'value-layer-peer',
  'standard-button',
  'no-spec',
  'state-scoped',
  'prose',
  'shape-gap',
] as const;
type OutsideClaim = (typeof OUTSIDE_CLAIMS)[number];

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
  /** Round history that used to sit beside the row as a comment. Not read by any check. */
  readonly note?: string;
}

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
 *
 * The only claim type today is `click-surface`: a **screen-covering click
 * surface** (scrim, blocking backdrop). It gets pressed but it is not a control
 * — it declares **no** shape, size, type, or ink, only placement
 * (`absolute inset-0 z-*`) plus one background layer, and the value layer has
 * already declared both of those outside its share (placement belongs to
 * `className`).
 *
 * ⚠️ **These rows are not debt to repay.** Debt targets 0; these do not — which
 * is why the counts were split. Mixed together, debt becomes a number that
 * **cannot reach 0 in principle**, and at that moment it stops being a progress
 * gauge and becomes decoration.
 *
 * **The anchor side is 0 today — a measurement, not an empty row.** Running all
 * anchors through the predicate returns 0: an `<a>` exists to **go somewhere**,
 * so it rarely becomes a spec-less click surface. Probe ⑮ asserts exactly that.
 */
const NO_BASIS_CLAIMS = ['click-surface'] as const;
type NoBasisClaim = (typeof NO_BASIS_CLAIMS)[number];

interface NoBasisEntry {
  readonly file: string;
  readonly count: number;
  readonly family: 'button' | 'anchor';
  readonly claim: NoBasisClaim;
  /** The evidence string that must remain in the file. Same discipline as a registration. */
  readonly proof: string;
  readonly why: string;
  readonly note?: string;
}

/**
 * **The registries are data files, one per row.**
 *
 * `buttons/`, `anchors/` and `fields/` hold the verified "outside the value layer" rows;
 * `no-basis/` holds the "nothing for the value layer to emit" rows. A row is
 * `<registry>/<file basename>.<claim>[.<proof slug>].json`.
 *
 * If you find a place that is outside the value layer but not listed, **open it
 * and verify before adding a row** (discipline 1 above). If you cannot verify it,
 * leave it in debt. Adding a row raises a registered count, so it also needs the
 * raise record that says why; that pair is the review.
 *
 * ⚠️ 2026-08-23, worth keeping: an evidence link was first written trailing a
 * sentence, which forces `display: inline` and therefore a `prose` registration.
 * Measuring instead of registering showed the sentence position was the mistake —
 * moved onto its own line it was an ordinary `shape: 'link'` control and no row
 * was needed. **Check whether the position is wrong before registering a shape the
 * value layer cannot make.**
 */
const REGISTRY_DIR = 'tests/contract/control-adoption';
type RegistryName = 'buttons' | 'anchors' | 'fields' | 'no-basis';

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function rowProblems(name: string, row: Record<string, unknown>, registry: RegistryName): string[] {
  const problems: string[] = [];
  if (!isText(row.file)) problems.push('`file` must be a repository path');
  else if (!name.startsWith(`${basename(row.file, extname(row.file))}.`)) {
    problems.push(`file name must start with "${basename(row.file, extname(row.file))}."`);
  }
  if (!Number.isInteger(row.count) || (row.count as number) <= 0) problems.push('`count` must be a positive integer');
  if (!isText(row.proof)) problems.push('`proof` must name the evidence string');
  if (!isText(row.why)) problems.push('`why` must say why the place is outside');
  const claims: readonly string[] = registry === 'no-basis' ? NO_BASIS_CLAIMS : OUTSIDE_CLAIMS;
  if (!claims.includes(row.claim as string)) problems.push(`\`claim\` must be one of ${claims.join(', ')}`);
  if (registry === 'no-basis' && row.family !== 'button' && row.family !== 'anchor') {
    problems.push('`family` must be "button" or "anchor"');
  }
  return problems;
}

/**
 * Read one registry under `root` (the working tree, or a merge-base tree).
 *
 * **A root without the registry directory throws** rather than returning empty: that tree
 * predates the data files, so measuring it would count zero registrations and report every
 * row as growth. The judge treats a throwing base as "nothing comparable" and uses the absolute
 * ceiling instead.
 */
function loadRegistry(root: string, registry: 'no-basis'): NoBasisEntry[];
function loadRegistry(root: string, registry: Exclude<RegistryName, 'no-basis'>): OutsideEntry[];
function loadRegistry(root: string, registry: RegistryName): (OutsideEntry | NoBasisEntry)[] {
  if (!existsSync(join(root, REGISTRY_DIR))) {
    throw new Error(`${join(root, REGISTRY_DIR)} does not exist; this tree predates the registry files`);
  }
  const dir = join(root, REGISTRY_DIR, registry);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const row = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const problems = rowProblems(name, row, registry);
      if (problems.length > 0) throw new Error(`${REGISTRY_DIR}/${registry}/${name}: ${problems.join('; ')}`);
      return row as unknown as OutsideEntry | NoBasisEntry;
    });
}

const OUTSIDE_VALUE_LAYER = loadRegistry(process.cwd(), 'buttons');
const OUTSIDE_VALUE_LAYER_ANCHORS = loadRegistry(process.cwd(), 'anchors');
const NO_BASIS = loadRegistry(process.cwd(), 'no-basis');
const NO_BASIS_BUTTONS = NO_BASIS.filter((e) => e.family === 'button');
const NO_BASIS_ANCHORS = NO_BASIS.filter((e) => e.family === 'anchor');

/**
 * **The counts when this gate moved to the merge-base judge (2026-09-27). Never edited.**
 *
 * They are not the baseline — the merge base is. They are the ceiling used where there is no
 * merge base to compare with (a shallow clone), and a floor under a tree compared with itself
 * (a push to `main`). Raise records widen them too, so a deliberate rise never needs an edit
 * here. Each is a **literal** (probe ④): a value derived from the registry would rise with every
 * row, which is how the hard-cut ratchet's "never grows" became impossible to fail.
 */
const FALLBACK = {
  registered: 24,
  debt: 0,
  noBasis: 5,
  clickSurfaces: 5,
  anchorRegistered: 38,
  anchorDebt: 0,
  anchorNoBasis: 0,
  fieldDebt: -6,
} as const;

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
const FIELD_TAGS = ['input', 'textarea', 'select', 'label'] as const;

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
     * places keep counting as debt, so the baseline never falls** — the system
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

type Census = ReturnType<typeof census>;
type TreeMeasure = {
  scanned: string[];
  button: Census;
  anchor: Census;
  field: Census;
  clickSurfaces: string[];
  anchorClickSurfaces: string[];
};

/**
 * Every count this gate judges, for the tree rooted at `root`, with **that tree's own
 * registries**. The merge-base judge calls it with the extracted base tree, which is why the
 * registries are data files: the base's rows are only readable if they are not code in this file.
 */
function measureTree(root: string): TreeMeasure {
  const cwd = process.cwd();
  const scanned = ROOTS.map((r) => join(root, r))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => walk(relative(cwd, dir) || '.'));
  const noBasis = loadRegistry(root, 'no-basis');
  return {
    scanned,
    button: census(scanned, loadRegistry(root, 'buttons'), BUTTON_TAGS, noBasis.filter((e) => e.family === 'button')),
    anchor: census(scanned, loadRegistry(root, 'anchors'), ANCHOR_TAGS, noBasis.filter((e) => e.family === 'anchor')),
    field: census(scanned, loadRegistry(root, 'fields'), FIELD_TAGS, []),
    clickSurfaces: clickSurfaceCensus(scanned),
    anchorClickSurfaces: clickSurfaceCensus(scanned, ANCHOR_TAGS),
  };
}

/**
 * The working tree and each extracted merge base are measured once. An extracted base is
 * content-addressed and never changes; a scratch repository in a probe does, so it is not cached.
 */
const BASE_CACHE = join(tmpdir(), 'atlas-ratchet-base');
const measured = new Map<string, TreeMeasure>();
function measureOnce(root: string): TreeMeasure {
  const cacheable = root === process.cwd() || root.startsWith(BASE_CACHE);
  if (!cacheable) return measureTree(root);
  let result = measured.get(root);
  if (!result) {
    result = measureTree(root);
    measured.set(root, result);
  }
  return result;
}

const today = measureOnce(process.cwd());
const scannedFiles = today.scanned;
const { total, registered, noBasis, debt, byFile, registeredByFile, noBasisByFile } = today.button;
const anchorCensus = today.anchor;
const fieldCensus = today.field;
const globalsCss = readFileSync(GLOBALS_CSS, 'utf8');

/** Everything `measureTree` reads; only these are extracted at the merge base. */
const READS = [...ROOTS, REGISTRY_DIR];

type JudgeOptions = { cwd?: string; base?: string | null; fallback?: number };

/**
 * **The eight judged counts.** Each is one `judgeRatchet` call with its gate id written out,
 * because a raise record is valid only for a gate that a contract file names this way
 * (`ratchet-merge-base.contract.test.ts`). The probes at the end of this file run these same
 * calls on a scratch repository, so what they prove is what the tests above enforce.
 */
const judgeControl = {
  registered: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-registered',
      measure: (root) => measureOnce(root).button.registered,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.registered,
      cwd: o.cwd,
      base: o.base,
    }),
  debt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-debt',
      measure: (root) => measureOnce(root).button.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.debt,
      cwd: o.cwd,
      base: o.base,
    }),
  noBasis: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-no-basis',
      measure: (root) => measureOnce(root).button.noBasis,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.noBasis,
      cwd: o.cwd,
      base: o.base,
    }),
  clickSurfaces: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-click-surfaces',
      measure: (root) => measureOnce(root).clickSurfaces.length,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.clickSurfaces,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorRegistered: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-registered',
      measure: (root) => measureOnce(root).anchor.registered,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorRegistered,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorDebt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-debt',
      measure: (root) => measureOnce(root).anchor.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorDebt,
      cwd: o.cwd,
      base: o.base,
    }),
  anchorNoBasis: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-anchor-no-basis',
      measure: (root) => measureOnce(root).anchor.noBasis,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.anchorNoBasis,
      cwd: o.cwd,
      base: o.base,
    }),
  fieldDebt: (o: JudgeOptions = {}) =>
    judgeRatchet({
      gate: 'control-field-debt',
      measure: (root) => measureOnce(root).field.debt,
      reads: READS,
      fallback: o.fallback ?? FALLBACK.fieldDebt,
      cwd: o.cwd,
      base: o.base,
    }),
} satisfies Record<keyof typeof FALLBACK, (o?: JudgeOptions) => RatchetJudgement>;

/**
 * ════════════════════════════════════════════════════════════════════
 * ## Anchor controls — **the third and fourth counts** (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### Why a new count instead of adding to debt 85
 *
 * The preamble already recorded the judgement: *"Previously, 113 was one lump,
 * so it was impossible to know what had progressed"* (113 used to be one lump, which made
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
 * convening system (the design-systems seat) comes first.
 *
 * ### Today this count does not claim anything is movable
 *
 * The registration list (`control-adoption/fields/`) was **empty**, because
 * without a field shape in the value layer there is not yet any basis to claim
 * "the value layer cannot emit this in principle". So today this count does
 * exactly one thing: **stop it growing further.** When the shape exists,
 * registrations appear and debt comes down.
 */

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

  it('손으로 규격을 쓴 폼이 머지 베이스보다 늘지 않는다', () => {
    const verdict = judgeControl.fieldDebt();
    const worst = [...fieldCensus.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(
      verdict.current,
      `Hand-specced form controls rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${fieldCensus.total}).\n${verdict.explain}\n` +
        `Most in: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}\n` +
        'New form controls use `fieldClass` / `fieldLabel`; a place they cannot style is a verified row in ' +
        `${REGISTRY_DIR}/fields/.`,
    ).toBeLessThanOrEqual(verdict.ceiling);
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

  it('등재가 머지 베이스보다 늘지 않는다 — 늘리려면 raise 기록에 왜를 적는다', () => {
    const verdict = judgeControl.registered();
    expect(
      verdict.current,
      `Registered button places rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n` +
        `${verdict.explain}\n` +
        '**The registry is a debt list, not a permit list** — registering a place that could move is the ' +
        'failure this gate exists to stop. Only a place the value layer cannot emit in principle earns a row.',
    ).toBeLessThanOrEqual(verdict.ceiling);
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

  it('앵커 등재가 머지 베이스보다 늘지 않는다', () => {
    const verdict = judgeControl.anchorRegistered();
    expect(
      verdict.current,
      `Registered anchor places rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n` +
        `${verdict.explain}\n` +
        '**The registry is a debt list, not a permit list** — "the shape does not exist yet" is not a reason to register.',
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('앵커 부채가 머지 베이스보다 늘지 않는다 — 누를 수 있는 것은 전부 값 층을 지난다', () => {
    const verdict = judgeControl.anchorDebt();
    const worst = [...anchorCensus.byFile.entries()]
      .filter(([f]) => !anchorCensus.registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      verdict.current,
      `Hand-specced anchors rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${anchorCensus.total} − registered ${anchorCensus.registered}).\n${verdict.explain}\n` +
        `\`controlClass({ shape: 'link' })\` exists for this place. \`<Link>\` needs a \`cn\` merge — the raw ` +
        `variant lets the base's border-transparent win by source order (measured in this file).\n` +
        `A registered file is not exempt: a hand anchor added there leaves the registered count alone and raises this one.\n` +
        `Unregistered files with the most: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it('세 수의 합이 앵커 전수와 맞는다', () => {
    expect(anchorCensus.registered + anchorCensus.noBasis + anchorCensus.debt).toBe(anchorCensus.total);
  });

  /**
   * The per-tag split used to be a literal (`{ Link: n, a: m }`) edited with every registered
   * anchor — 25 commits, the most-edited line in this file. It guarded nothing the three judged
   * anchor counts do not: every new anchor is registered, no-basis, or debt, and each of those is
   * judged against the merge base. What remains is the property the name promised: both tags are
   * counted, and together they are the whole census.
   */
  it('태그 내역이 전수와 맞는다 — 두 태그가 서로를 잃지 않는다', () => {
    const perTag = Object.fromEntries(
      ANCHOR_TAGS.map((tag) => [tag, census(scannedFiles, [], [tag], []).total]),
    );
    for (const tag of ANCHOR_TAGS) {
      expect(perTag[tag], `no hand <${tag}> counted — the scanner lost that tag`).toBeGreaterThan(0);
    }
    expect(Object.values(perTag).reduce((a, b) => a + b, 0), JSON.stringify(perTag)).toBe(anchorCensus.total);
  });
});

describe('컨트롤 채택 래칫 — 아직 안 옮긴 부채', () => {
  it('부채가 머지 베이스보다 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    const verdict = judgeControl.debt();
    const worst = [...byFile.entries()]
      .filter(([f]) => !registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      verdict.current,
      `Hand-written controls not yet moved rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(total ${total} − registered ${registered} − no-basis ${noBasis}).\n${verdict.explain}\n` +
        `New controls use \`controlClass({ shape })\` — the eight shapes came from measurement and cannot emit off-ramp values.\n` +
        `A registered file is not exempt: a hand control added there leaves the registered count alone and raises this one.\n` +
        `Unregistered files with the most: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(verdict.ceiling);
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

  it('이 사유의 **전수**가 머지 베이스보다 늘지 않는다 — 새 클릭면은 조용히 면제되지 않는다', () => {
    const hits = today.clickSurfaces;
    const verdict = judgeControl.clickSurfaces();
    expect(
      verdict.current,
      `Qualifying click surfaces rose to ${verdict.current} over the ceiling ${verdict.ceiling} ` +
        `(${[...new Set(hits)].join(' · ')}).\n${verdict.explain}\n` +
        'A new full-bleed click catcher appeared. If it truly carries zero spec, register it in ' +
        `${REGISTRY_DIR}/no-basis/ and say why in the raise record; otherwise repay it as debt.`,
    ).toBeLessThanOrEqual(verdict.ceiling);
    expect(noBasis, '등재한 근거 없음이 실측 전수를 넘었다').toBeLessThanOrEqual(hits.length);
  });

  it('근거 없음이 머지 베이스보다 늘지 않는다', () => {
    for (const verdict of [judgeControl.noBasis(), judgeControl.anchorNoBasis()]) {
      expect(
        verdict.current,
        `${verdict.gate} rose to ${verdict.current} over the ceiling ${verdict.ceiling}.\n${verdict.explain}\n` +
          '**If this category becomes an escape hatch the round has failed** — "too cumbersome to move" is debt, not no-basis.',
      ).toBeLessThanOrEqual(verdict.ceiling);
    }
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
 * "it never grows" **impossible to fail in principle**. Here the ceiling is the
 * merge base's own registry, which a row added in this change cannot lift (the
 * scratch-repository probes at the end prove it), and the fallback ceilings are
 * literals (④).
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
      '미등재 자리에 손 컨트롤이 늘었는데 판정하는 수가 안 올랐다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(debt);
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

  it('④ 대체 천장이 **리터럴**이다 — 등록부에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    const source = readFileSync(SELF, 'utf8');
    const block = /const FALLBACK = \{\n([\s\S]*?)\n\} as const;/.exec(source);
    expect(block, 'FALLBACK 블록을 못 찾았다 — 이 프로브가 헛돈다').not.toBeNull();
    const lines = block![1].split('\n').map((line) => line.trim());
    expect(lines.length).toBe(Object.keys(FALLBACK).length);
    for (const line of lines) {
      expect(
        /^[a-zA-Z]+: -?\d+,$/.test(line),
        `${line} — a fallback derived from a registry (\`.length\`, a reduce) rises with every row, the ` +
          "hard-cut ratchet's actual defect.",
      ).toBe(true);
    }
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
  });

  it('⑧ 앵커를 하나 더 쓰면 **앵커 부채로** 잡힌다 — 버튼 수는 안 움직인다', () => {
    const withFixture = census([...scannedFiles, FIXTURE], OUTSIDE_VALUE_LAYER_ANCHORS, ANCHOR_TAGS, NO_BASIS_ANCHORS);
    // The fixtures are not in the registry, so both go to **debt**.
    expect(withFixture.registered).toBe(anchorCensus.registered);
    expect(withFixture.debt).toBe(anchorCensus.debt + 2);
    // The two counts do not contaminate each other.
    expect(census([...scannedFiles, FIXTURE]).debt, '앵커 픽스처가 버튼 부채를 움직였다').toBe(debt + 2);
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
    expect(today.anchorClickSurfaces.length, 'an anchor click surface that is not registered as no-basis').toBe(anchorCensus.noBasis);
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

/**
 * ════════════════════════════════════════════════════════════════════
 * ## One surface, one close — **the seventh count is a rule, not a number** (2026-09-06)
 * ════════════════════════════════════════════════════════════════════
 *
 * Measured in the installed app: the meaning dock drew **two identical X buttons a few pixels
 * apart**, one from the workbench and one from the chat panel inside it. Both closed the same
 * thing, and the inner one closed a surface the chat panel does not own — a control that acts on
 * its host is a control that cannot be reasoned about from the file it lives in.
 *
 * This is not a hand-written-className problem, so it is not a count. It is an **ownership** rule,
 * and it belongs beside the other control rules because the failure is the same shape: a control
 * appears because a file could add one, not because the surface needed one.
 *
 * > **A panel rendered inside another surface does not draw that surface's close button.**
 *
 * The detector reads the JSX, not the prop list: `onClose` is a perfectly good prop name for a
 * panel that owns its own dismissal, and the violation is a *host* handing it down. Both halves
 * are checked — the hosts must not pass it, and the panel must not have a close control to pass it
 * to, so the rule cannot be half-satisfied by a prop that is simply ignored.
 */
const WORKBENCH_HOSTED_PANEL = 'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx';
const WORKBENCH_HOSTS = [
  'src/views/home/ui/TopologyAgentDock.tsx',
  'src/views/ontology-insights/ui/parts/InsightsAgentDock.tsx',
  'src/views/architecture/ui/ArchitectureAgentDock.tsx',
] as const;

/** Attribute names on every `<AcpChatPanel …>` element in a file. */
function chatPanelAttributes(text: string): string[][] {
  const found: string[][] = [];
  // The opening tag ends at the first `>` outside braces and quotes — the same brace-depth walk
  // `static-surface-census` uses, because `onClick={() => …}` contains a `>`.
  for (const match of text.matchAll(/<AcpChatPanel\b/g)) {
    let depth = 0;
    let quote: string | null = null;
    let end = text.length;
    for (let index = match.index + 1; index < text.length; index += 1) {
      const character = text[index];
      if (quote) {
        if (character === quote && text[index - 1] !== '\\') quote = null;
      } else if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0) {
        end = index;
        break;
      }
    }
    const tag = text.slice(match.index, end);
    found.push([...tag.matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9-]*)=/g)].map((attr) => attr[1]));
  }
  return found;
}

describe('컨트롤 소유권 — 한 화면에 닫기는 하나', () => {
  it('탐지기가 공회전하지 않는다 — 세 호스트 모두에서 패널을 찾는다', () => {
    for (const host of WORKBENCH_HOSTS) {
      const tags = chatPanelAttributes(readFileSync(host, 'utf8'));
      expect(tags.length, `${host} 에서 AcpChatPanel 을 못 찾았다`).toBeGreaterThan(0);
      // A tag with no attributes read means the brace walk stopped early.
      expect(tags[0].length, `${host} 의 속성을 못 읽었다`).toBeGreaterThan(3);
    }
  });

  it('호스트는 자기 닫기를 패널에 넘기지 않는다', () => {
    for (const host of WORKBENCH_HOSTS) {
      for (const attributes of chatPanelAttributes(readFileSync(host, 'utf8'))) {
        expect(
          attributes,
          `${host}: 워크벤치 안의 대화 패널에 onClose 를 넘겼다 — X 가 둘이 되고, 안쪽 것은 자기 것이 아닌 화면을 닫는다`,
        ).not.toContain('onClose');
      }
    }
  });

  it('패널에는 넘겨줄 닫기 자체가 없다 — 규칙이 무시되는 prop 으로 반만 지켜지지 않게', () => {
    const panel = readFileSync(WORKBENCH_HOSTED_PANEL, 'utf8');
    expect(panel, '패널이 여전히 닫기 버튼을 그린다').not.toContain('data-testid="acp-chat-close"');
    expect(panel, '패널이 여전히 onClose 를 받는다').not.toMatch(/^\s*onClose\??:/m);
  });

  /**
   * ⚠️ **A gate that can only pass is not a gate.** The violation is planted in the shape it had:
   * a host passing its own close down to the panel it contains.
   */
  it('탐지기 프로브 — 심은 위반을 잡고, 이웃 prop 은 놓아둔다', () => {
    const host = readFileSync(WORKBENCH_HOSTS[1], 'utf8');
    const planted = host.replace('onTurnStarted={capture.onTurnStarted}', 'onClose={onClose}');
    expect(planted, '심을 자리를 못 찾았다 — 이 프로브가 헛돈다').not.toBe(host);
    expect(chatPanelAttributes(planted).some((attrs) => attrs.includes('onClose'))).toBe(true);
    // `onDraftPresenceChange` and friends are not close buttons; the detector must name the prop.
    expect(chatPanelAttributes(host).some((attrs) => attrs.includes('onClose'))).toBe(false);
    expect(chatPanelAttributes(host)[0]).toContain('onDraftPresenceChange');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════
 * ## The merge-base judgement, on a scratch repository (2026-09-27)
 * ════════════════════════════════════════════════════════════════════
 *
 * The tests above can only compare this checkout with its own merge base. These probes build a
 * small repository in the same shape (`src/` plus the registry directory), run **the same eight
 * `judgeControl` calls**, and plant one regression per count: each must turn RED, a raise record
 * written in the same change must turn it GREEN, and a fall needs no file at all. The last probes
 * are the reason for the conversion: two branches that each register a different place merge
 * without a conflict, and a registry row added in a change cannot lift the ceiling it is judged by.
 */
describe('머지 베이스 판정 — 스크래치 저장소 프로브', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'control-adoption-judge-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const git = (repo: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'commit.gpgsign=false', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

  const put = (repo: string, path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  const tsx = (element: string) => `export function Probe() {\n  return (${element});\n}\n`;
  const row = (repo: string, registry: RegistryName, name: string, extra: Record<string, unknown>) =>
    put(
      repo,
      `${REGISTRY_DIR}/${registry}/${name}.json`,
      JSON.stringify({ file: `src/${name.split('.')[0]}.tsx`, count: 1, proof: 'probe', why: 'probe row', ...extra }),
    );
  const raise = (repo: string, gate: string, slug: string) =>
    put(
      repo,
      `${RAISES_DIR}/${gate}.${slug}.json`,
      JSON.stringify({ gate, raise: 1, why: 'A probe raise that states a full sentence of reason for the growth.' }),
    );

  /** One of each: a registered button, a no-basis scrim, a registered anchor, and a hand field. */
  function repo(name: string, { registry = true } = {}): string {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main');
    put(dir, 'src/Reg.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
    put(dir, 'src/Scrim.tsx', tsx('<button type="button" className="absolute inset-0 bg-[var(--s)]" />'));
    put(dir, 'src/Door.tsx', tsx('<a className="px-2" href="#">x</a>'));
    put(dir, 'src/Field.tsx', tsx('<input className="h-8" />'));
    if (registry) {
      row(dir, 'buttons', 'Reg.chrome-token', { claim: 'chrome-token' });
      row(dir, 'no-basis', 'Scrim.click-surface', { claim: 'click-surface', family: 'button' });
      row(dir, 'anchors', 'Door.no-spec', { claim: 'no-spec' });
    }
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'base');
    return dir;
  }

  const judgeAt = (key: keyof typeof judgeControl, cwd: string, base: string | null) =>
    judgeControl[key]({ cwd, base, fallback: 1000 });

  /** Each count, the smallest change that makes it grow, and the gate id its raise record names. */
  const PLANTS: { key: keyof typeof judgeControl; gate: string; plant: (dir: string) => void }[] = [
    {
      key: 'registered',
      gate: 'control-registered',
      plant: (dir) => {
        put(dir, 'src/Reg2.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
        row(dir, 'buttons', 'Reg2.chrome-token', { claim: 'chrome-token' });
      },
    },
    { key: 'debt', gate: 'control-debt', plant: (dir) => put(dir, 'src/Hand.tsx', tsx('<button className="px-3">h</button>')) },
    {
      key: 'noBasis',
      gate: 'control-no-basis',
      plant: (dir) => {
        put(dir, 'src/Scrim2.tsx', tsx('<button type="button" className="absolute inset-0 bg-[var(--s)]" />'));
        row(dir, 'no-basis', 'Scrim2.click-surface', { claim: 'click-surface', family: 'button' });
      },
    },
    {
      key: 'clickSurfaces',
      gate: 'control-click-surfaces',
      plant: (dir) => put(dir, 'src/Scrim3.tsx', tsx('<button type="button" className="absolute inset-0" />')),
    },
    {
      key: 'anchorRegistered',
      gate: 'control-anchor-registered',
      plant: (dir) => {
        put(dir, 'src/Door2.tsx', tsx('<a className="px-2" href="#">x</a>'));
        row(dir, 'anchors', 'Door2.no-spec', { claim: 'no-spec' });
      },
    },
    {
      key: 'anchorDebt',
      gate: 'control-anchor-debt',
      plant: (dir) => put(dir, 'src/Hand.tsx', tsx('<a className="px-2" href="#">h</a>')),
    },
    {
      key: 'anchorNoBasis',
      gate: 'control-anchor-no-basis',
      plant: (dir) => {
        put(dir, 'src/Veil.tsx', tsx('<a className="absolute inset-0" href="#" />'));
        row(dir, 'no-basis', 'Veil.click-surface', { claim: 'click-surface', family: 'anchor' });
      },
    },
    {
      key: 'fieldDebt',
      gate: 'control-field-debt',
      plant: (dir) => put(dir, 'src/Field2.tsx', tsx('<input className="h-8" />')),
    },
  ];

  it('covers every judged count exactly once', () => {
    expect(PLANTS.map((p) => p.key).sort()).toEqual(Object.keys(judgeControl).sort());
    for (const p of PLANTS) expect(judgeControl[p.key]({ base: null }).gate).toBe(p.gate);
  });

  it.each(PLANTS)('$gate: RED on growth over the base, GREEN with a raise record, GREEN on a fall', ({ key, gate, plant }) => {
    const dir = repo(`plant-${key}`);
    const base = git(dir, 'rev-parse', 'HEAD');

    const unchanged = judgeAt(key, dir, base);
    expect(unchanged.atBase, 'the base must be measured, not skipped').not.toBeNull();
    expect(unchanged.current).toBe(unchanged.atBase);
    expect(unchanged.current).toBeLessThanOrEqual(unchanged.ceiling);

    plant(dir);
    const grown = judgeAt(key, dir, base);
    expect(grown.current, `${gate}: the planted regression did not move the count`).toBe(grown.atBase! + 1);
    expect(grown.current, `${gate}: growth passed`).toBeGreaterThan(grown.ceiling);

    raise(dir, gate, 'probe');
    const raised = judgeAt(key, dir, base);
    expect(raised.added.map((r) => r.gate)).toEqual([gate]);
    expect(raised.current).toBeLessThanOrEqual(raised.ceiling);

    // A fall: every place and row removed, with nothing else edited.
    rmSync(join(dir, 'src'), { recursive: true, force: true });
    for (const registry of ['buttons', 'anchors', 'fields', 'no-basis'] as const) {
      rmSync(join(dir, REGISTRY_DIR, registry), { recursive: true, force: true });
    }
    const fallen = judgeAt(key, dir, base);
    expect(fallen.current, `${gate}: removing every place must be a fall`).toBeLessThan(fallen.atBase! + 1);
    expect(fallen.current).toBeLessThanOrEqual(fallen.ceiling);
  });

  it('a registry row added in this change cannot lift the ceiling it is judged by', () => {
    const dir = repo('row-only');
    const base = git(dir, 'rev-parse', 'HEAD');
    put(dir, 'src/Reg.tsx', tsx('<><button className="h-[var(--probe)]">r</button><button className="px-3">h</button></>'));
    // Registering the new hand control keeps it out of debt, so the registered count is what grows.
    row(dir, 'buttons', 'Reg.chrome-token.second', { claim: 'chrome-token' });
    const debt = judgeAt('debt', dir, base);
    expect(debt.current).toBeLessThanOrEqual(debt.ceiling);
    const verdict = judgeAt('registered', dir, base);
    expect(verdict.atBase).toBe(1);
    expect(verdict.current, 'the row lifted its own ceiling').toBeGreaterThan(verdict.ceiling);
  });

  it('lets two branches that each register a different place merge without a conflict', () => {
    const dir = repo('parallel');
    const base = git(dir, 'rev-parse', 'HEAD');
    const register = (branch: string, name: string) => {
      git(dir, 'switch', '-q', '-c', branch, base);
      put(dir, `src/${name}.tsx`, tsx('<button className="h-[var(--probe)]">r</button>'));
      row(dir, 'buttons', `${name}.chrome-token`, { claim: 'chrome-token' });
      raise(dir, 'control-registered', branch);
      const verdict = judgeAt('registered', dir, base);
      expect(verdict.current, `${branch} alone`).toBeLessThanOrEqual(verdict.ceiling);
      git(dir, 'add', '.');
      git(dir, 'commit', '-q', '-m', branch);
    };
    register('register-a', 'Alpha');
    register('register-b', 'Beta');

    git(dir, 'switch', '-q', 'main');
    git(dir, 'merge', '-q', '--no-edit', 'register-a');
    git(dir, 'merge', '-q', '--no-edit', 'register-b');
    expect(git(dir, 'status', '--porcelain'), 'the merge left conflicts').toBe('');
    const merged = judgeAt('registered', dir, base);
    expect(merged.current).toBe(3);
    expect(merged.current).toBeLessThanOrEqual(merged.ceiling);

    // The next branch starts from the merge: both raises are spent.
    const next = git(dir, 'rev-parse', 'HEAD');
    put(dir, 'src/Gamma.tsx', tsx('<button className="h-[var(--probe)]">r</button>'));
    row(dir, 'buttons', 'Gamma.chrome-token', { claim: 'chrome-token' });
    const later = judgeAt('registered', dir, next);
    expect(later.atBase).toBe(3);
    expect(later.current, 'a raise already landed widened a later change').toBeGreaterThan(later.ceiling);
  });

  it('judges against the absolute ceiling when the base predates the registry files', () => {
    const dir = repo('transition', { registry: false });
    const base = git(dir, 'rev-parse', 'HEAD');
    row(dir, 'buttons', 'Reg.chrome-token', { claim: 'chrome-token' });
    const verdict = judgeControl.registered({ cwd: dir, base, fallback: 1 });
    expect(verdict.atBase, 'a base without registries would count every row as growth').toBeNull();
    expect(verdict.ceiling).toBe(1);
    expect(judgeControl.registered({ cwd: dir, base, fallback: 0 }).current).toBeGreaterThan(0);
  });

  it('refuses a malformed row rather than counting it as zero', () => {
    const dir = repo('malformed');
    put(dir, `${REGISTRY_DIR}/buttons/Wrong.chrome-token.json`, JSON.stringify({ file: 'src/Reg.tsx', count: 1 }));
    expect(() => measureTree(dir)).toThrow(/file name must start with "Reg\."/);
  });
});
