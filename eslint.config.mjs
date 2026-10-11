import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// Enforce FSD layer boundaries at the lint stage. Written with official
// `boundaries/dependencies` + v7 entity selectors/policies (2026~).
//   Docs: https://www.jsboundaries.dev/docs/rules/dependencies/

// ── Checkbox accent selectors ────────────────────────────────────────────────
// The expression bans that used to live in this array (glassmorphism, scale hover, the
// purple-pink gradient, canvas `shadowBlur`) were lifted by the owner on 2026-09-08
// (`docs/DECISIONS.md`, "The expression bans are lifted"). What remains is the checkbox
// accent, which is a token-discipline rule, not a taste rule. The array is reused across
// several config objects: in flat config a later `no-restricted-syntax` replaces, never
// merges, so every block that adds a ramp rule must spread this too.
const checkboxAccentSelectors = [
  /*
   * Checkbox accent — the canonical brand is the only one (approved in the "System" section on 2026-08-15).
   *
   // Before enabling, a full sweep found accents-[ 6 locations split into three types — brand 4 · accent(#7170ff) 1 ·
   * **undefined (UA default color) 1** (current violation of the "no multiple color systems" rule). All 6 locations were migrated to the Checkbox primitive (`shared/ui/checkbox.tsx`) before enabling — upon enabling, violations dropped to 0. Zero exempt files designed (precedent: disabled:opacity): only brand token references are allowed through, so the primitive itself remains under this rule.
   */
  {
    selector: 'Literal[value=/accent-\\[(?!color:var\\(--color-indigo-brand\\))/]',
    message:
      'The checkbox accent is the single --color-indigo-brand token; use Checkbox (shared/ui/checkbox.tsx) instead of styling it directly (docs/DECISIONS.md).',
  },
  {
    selector: 'TemplateElement[value.raw=/accent-\\[(?!color:var\\(--color-indigo-brand\\))/]',
    message:
      'The checkbox accent is the single --color-indigo-brand token (template literal); use the Checkbox primitive.',
  },
];

const closureScopeSelectors = [
  {
    selector:
      'FunctionDeclaration[id.name=/^use(?:LocalVaultInternal|VaultChoice|VaultDocWrites)$/] :function Identifier[name="state"]:not(MemberExpression[computed=false] > Identifier.property):not(Property[computed=false] > Identifier.key)',
    message:
      'A callback in the local vault hooks reads the vault through stateRef, never `state`: a closure keeps its render\'s state, manifest included, after another folder opens.',
  },
  {
    selector:
      'FunctionDeclaration[id.name="HomePageImpl"] :function Identifier[name=/^(?:topologyVaultReadModel|vault)$/]:not(MemberExpression[computed=false] > Identifier.property):not(Property[computed=false] > Identifier.key)',
    message:
      'A callback in HomePageImpl takes the fields it needs, never `vault` or `topologyVaultReadModel`: a closure keeps its render\'s folder alive after another opens.',
  },
  {
    selector: ':function CallExpression[callee.name="derivedHook"]',
    message:
      'Create a derived hook at module level (`const useX = derivedHook(fn)`), so its function closes over no component scope.',
  },
];

// ── Indigo Ink License (2026-08-03) ─────────────────────────────────────
// `tone accent` (#7170ff, mark indigo) is only AA (4.5:1) down to the darkest background —
// when indigo/amber tints are applied, composite contrast drops to 3.5~4.4 (measured:
// tests/contract/accent-ink-contrast.contract.test.ts). Controls with tinted backgrounds
// use `accentOnTint` (--color-indigo-text-soft, front surface 6.46+) for ink.
// This selector only looks at **literal pairings within the same call/element** — className
// bypassed via file constants are handled by source scanning in the above contract test.
/*
 * Inline `style={{ boxShadow }}` — a layer that **cannot be seen** by className selectors **in principle**.
 *
 * ## Why was this needed (2026-08-04 design audit)
 *
 * The above height ladder guard looks for the **class string** `shadow-[…]`. However,
 * if shadows are written as JSX inline styles, no class is generated at all, so there
 * is nothing for the selector to catch. In that gap, the workshop (`StudioCompass.tsx`) was spinning **parallel ladders**
 * — 8 manually written shadows, 3 shapes:
 *
 *   0 -12px 30px  ×1  Bottom docking panel      → already has `-dock-bottom` (0 -12px 32px)
 *   0 12px 34px   ×6  Anchored popovers          → already have `elevation-2`(popover)
 *   0 18px 48px   ×1  Scream companion center modal → already have `elevation-3`(dialog)
 *
 * All three were **not missing layers, but layers that already had names**. This is the same pattern as the "unregistered 6th layer" incident recorded in the ladder definition comments, with the only difference being that this time it was
 * **syntax** rather than values that bypassed the gate.
 *
 * ## Why load into global blocks instead of ramp blocks
 *
 * `StudioCompass.tsx` is excluded from the ramp block due to `rampDebtExemptions`.
 * If this selector were placed in the ramp array, **only the file where the violation lives would be exempted**. Therefore,
 * it is loaded into **both** global blocks (`src/**`+`app/**`) and ramp blocks — flat config
 * does not merge rule options but replaces them, so putting it in only one side causes loss on the other.
 *
 * ## The allowance criteria are the **same list** as for className
 *
 * Since color was the token and manual geometry was what broke the ladder,
 * we do not use «pass if `var(` exists» here. One must reference a
 * token·inset dedicated to ladders·docking·pressing·surfaces.
 *
 * ⚠️ Pre-enforcement full count: 8 violations out of 9 inline boxShadow cases (all in one file) · 1 normal case
 * (`GuidedTourOverlay`'s `0 0 0 9999px var(--topology-tour-scrim-surface)` —
 * a scrim created with a massive spread, not a height shadow, and uses a surface-only token).
 * The 8 cases were converged first before enabling.
 */
const ALLOWED_SHADOW_TOKEN =
  'var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--map-|var\\(--chrome|var\\(--git|inset';

/**
 * Allowance judgment is done **per layer** (2026-08-06).
 *
 * ## What leaked out
 *
 * Previously, the two rules (class/inline) placed a negative lookahead on the **entire value**:
 * `^(?!.*(?:allowedList)).+`. So if even one allowed mark existed **anywhere** inside brackets,
 * the entire value was exempted — `inset` is 「not light but material」, so it is
 * in the allowed list; thus, **a normal single layer of inset hairline washed away
 * a hand-written elevation shadow next to it.**
 *
 * Measured proof (2026-08-06):
 *
 * | Value | Previous | Now |
 * |---|---|---|
 * | Hand-written geometry single layer | Caught | Caught |
 * | Add one inset layer before the same value | **Not caught** | Caught |
 * | Ladder token reference | Pass | Pass |
 * | Inset hairline + ladder token (normal 2 layers) | Pass | Pass |
 *
 * There were 4 leaks, one of which was a **shared button primitive**, spreading to all
 * primary buttons in the app (render census 16 instances / 10 routes). We converged all four first and enabled it — violations became 0 upon enabling.
 *
 * ## Why regex?
 *
 * Layers are split by commas. We express 「if there is **at least one** layer without an allowed mark」
 * via backtracking: skip previous layers with `(?:[^\\]]*,)?`, and place the negative lookahead
 * only on the layer at that position (`[^,\\]]*`).
 *
 * ⚠️ Reason for requiring `[a-zA-Z(]`: If a value inside a layer contains commas like `rgba(0,0,0,.2)`,
 * numeric fragments like `0` would be caught as 「layers without marks」. There are currently **0** raw
 * rgba inside brackets (hex is already blocked by a separate rule), and even if they appear later,
 * catching them is correct, but counting numeric fragments makes the message point to the wrong place.
 *
 * ⚠️ **For the same reason, `var()` fallbacks also cause false positives** (2026-08-07 Code Review).
 * `var(--shadow-elevation-1, 0 18px 40px black)` is valid syntax, but splitting by comma
 * makes the trailing fragment (`0 18px 40px black)`) look like a layer without a mark. There are currently **0** such usages in the repo — this app's shadow tokens are all declared in `:root`, so there is no reason to use fallbacks — false positives result in **red messages, not crashes**, so they do not leak quietly. To count comma nesting, we would need a parser instead of regex, and the value is not yet there. If/when we truly need fallbacks, we will upgrade this rule to a parser then.
 */
/** Class string — brackets indicate the end of the layer list. */
const SHADOW_CLASS_LAYER_VIOLATION =
  `shadow-\\[(?:[^\\]]*,)?(?![^,\\]]*(?:${ALLOWED_SHADOW_TOKEN}))[^,\\]]*[a-zA-Z(][^,\\]]*[,\\]]`;

/** Inline style values — the end of the string is the end of the layer list. */
const SHADOW_INLINE_LAYER_VIOLATION =
  `(?:^|,)(?![^,]*(?:${ALLOWED_SHADOW_TOKEN}))[^,]*[a-zA-Z(][^,]*(?:,|$)`;

const inlineShadowSelectors = [
  {
    selector: `Property[key.name="boxShadow"] > Literal[value=/${SHADOW_INLINE_LAYER_VIOLATION}/]`,
    message:
      'Off the elevation ladder (inline style): the token also owns shadow geometry. Use --shadow-elevation-1/2/3 (coach-mark < popover < dialog), -dock-bottom/-dock-side for edge docking, --shadow-control-press for pressed controls. Class selectors cannot see inline styles, so this rule catches them.',
  },
  {
    selector: `Property[key.name="boxShadow"] TemplateElement[value.raw=/${SHADOW_INLINE_LAYER_VIOLATION}/]`,
    message:
      'Off the elevation ladder (inline style, template literal): reference --shadow-elevation-*, -dock-* or --shadow-control-press.',
  },
];

/*
 * Inline style size/radius — the other half of the shadow inline rule (above) (2026-08-15).
 *
 * ## Why
 *
 * The class ramp rule only looks at className strings. Writing `style={{ fontSize }}`
 * means no class is generated at all, so nothing would be caught — it's the exact same
 * syntax hole through which 8 StudioCompass inline shadows slipped out, and the
 * 2026-08-15 audit measured one instance in source separately from the render census
 * (6 routes deviated, 0): locale-redirect's fontSize '0.875rem' — the value is identical
 * to body-lg (0 pixels), but the adjacent class already loads the same size, making it
 * **a duplicate and a line-height-unpaired size**. Clean it up first,
 * then enable — enabling it results in 0 violations.
 *
 * ## Allowance criteria
 *
 * `var(` references pass — consuming surface-only size tokens (--topology-chrome-title-size type)
 * inline is justified. However, **type ramp tokens (--text-*) must be blocked via separate selectors** —
 * gaining only the size while losing the line-height pair that unit carries
 * is the same bug as class-side ramp bypass rules.
 *
 * Ternary branches have been caught from day one (anticipating the "direct children
 * can't see ternaries" trap stepped on by the accent tint rule on 2026-08-13). Comparison literals are under BinaryExpression,
 * so they don't hit `ConditionalExpression > Literal`.
 *
 * ## Satori exception (filename-scoped block)
 *
 * `opengraph-image.tsx` / `twitter-image.tsx` are Next.js reserved filenames, and files
 * with those names are structurally all drawn by Satori — CSS variables don't reach,
 * making numeric literals the only notation (same reason as "surfaces CSS variables can't reach" in the hex rule).
 * Since it's a full sweep of 1 file with 8 instances, adding disables per line is noise, so following footprint precedent,
 * the rear scope block reloads everything except this array.
 */
const inlineSizeSelectors = [
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(fontSize|borderRadius)$/] > Literal:not([raw=/var\\(/])',
    message:
      'No hard-coded size or radius in an inline style: it creates no class, so the ramp rules cannot see it. Use a type-ramp utility class for size and the radius ramp for radius; only surfaces CSS variables cannot reach (Satori, canvas) get eslint-disable with a reason.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(fontSize|borderRadius)$/] ConditionalExpression > Literal:not([raw=/var\\(/])',
    message:
      'No hard-coded size or radius in an inline style (ternary branch): both branches must follow the ramp.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(fontSize|borderRadius)$/] > TemplateLiteral:not(:has(TemplateElement[value.raw=/var\\(/]))',
    message:
      'No hard-coded size or radius in an inline style (template literal): an assembled string that does not reference a token via var() sits outside the ramp.',
  },
  {
    selector: 'JSXAttribute[name.name="style"] Property[key.name="fontSize"] > Literal[value=/var\\(--text-/]',
    message:
      'Do not reference a type-ramp token through inline fontSize: you get the size but lose the line-height pair of that step. Use a ramp utility class. Size tokens for surfaces outside the ramp are not flagged.',
  },
];

/*
 * Duplicate `cursor-pointer` — rewriting what the central rule already established.
 *
 * ## Why (owner confirmed 2026-08-05)
 *
 * The base layer in `app/globals.css` establishes "non-disabled `button` and `summary` are
 * pointer". After that, `<button className="… cursor-pointer">` is
 * **a duplicate that changes nothing**, and as duplicates pile up, the next person must
 * re-evaluate "is this special here?" every time. In fact, 22 such instances piled up,
 * and buttons contradicted each other 5:56.
 *
 * ## Intentionally narrowed scope
 *
 * We do **not** ban `cursor-pointer` entirely. There are actually 8 places the central rule doesn't reach (`li[role=option]` · `label` · cmdk items · clickable cards ·
 * SVG `<g>` · checkboxes). Banning those too would make a rule that kills normal usage.
 * `cursor-default` is also not banned — 3 scrim instances use it legitimately
 * (closes on click but it's a surface, not a control).
 *
 * So the criterion is simply: **«Is the tag button/summary and was it written again on top?»**
 * This selector only looks at literal tag + literal className combinations — it can't see things assembled via `cn()` or component wrappers. That layer is handled by **measuring render results**
 * `tests/e2e/cursor-affordance.spec.ts` (the division of labor in this repo where contracts handle what lints can't).
 *
 * ⚠️ Pre-enable census: cleaned up 13 instances first, then enabled (0 violations · lint total unchanged).
 */
const cursorAffordanceSelectors = [
  {
    selector:
      'JSXOpeningElement[name.name=/^(button|summary)$/] JSXAttribute[name.name="className"] Literal[value=/(^|[^-\\w])(enabled:)?cursor-pointer([^-\\w]|$)/]',
    message:
      'The pointer cursor on button/summary is already set by the base rule in app/globals.css; repeating it is duplication that forces readers to ask whether this spot is special. Delete it. It is justified only on elements the central rule does not reach (li[role=option], label, clickable cards, etc.).',
  },
  {
    selector:
      'JSXOpeningElement[name.name=/^(button|summary)$/] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|[^-\\w])(enabled:)?cursor-pointer([^-\\w]|$)/]',
    message:
      'The pointer cursor on button/summary is set by the base rule (template literal). Delete the duplicate.',
  },
];

/*
 * Disabled blur — single value layer (2026-08-06 "system" meeting).
 *
 * ## Why
 *
 * `disabled:opacity-*` was split into four values in the repo: 60, 55, 50, 45.
 * The value layer (`CONTROL_DISABLED_CLASS` in `control-class.ts`) settled on 55 on 2026-08-03 — but after that, 6 `controlClass()` call sites overwrote the base-loaded value
 * into `className`, and 3 hand-controls copied values and drifted.
 * Rendering the same state (unclickable) with four brightness levels is coincidence, not a system.
 *
 * ## Rule shape — query values, no file exemptions
 *
 * Writing "ban `disabled:opacity-` itself outside the value layer file" would create another exemption file block, and this config has had three accidents forgetting to reload selector arrays for such blocks (footprint · app-settings block's 2026-08-05 comment).
 * So we write it with 0 exemptions: **block only values other than 55**. The cost of the number 55 being written in both lint and the value layer is repaid by `disabled-affordance.contract.test.ts` contrasting the two values — if the value layer moves, this rule must move too to turn red.
 *
 * ⚠️ Pre-enable census: made violations 9 places (60×5 · 50×3 · 45×1) into 0 first, then enabled
 * (lint total unchanged). The 60·50 instances in the comment don't hit anyway since they're outside the AST.
 */
const disabledAffordanceSelectors = [
  {
    selector:
      'Literal[value=/(^|[^-\\w])((aria-|group-|peer-)?disabled):opacity-(?!55([^0-9]|$))/]',
    message:
      'The disabled opacity is owned by the value layer: disabled:opacity-55 (CONTROL_DISABLED_CLASS in control-class.ts). Remove this class if the element builds on controlClass/fieldClass, which already applies it; for a hand-built control, compose CONTROL_DISABLED_CLASS. See tests/contract/disabled-affordance.contract.test.ts',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])((aria-|group-|peer-)?disabled):opacity-(?!55([^0-9]|$))/]',
    message:
      'The disabled opacity is owned by the value layer (template literal): disabled:opacity-55 only. Hand-built controls compose CONTROL_DISABLED_CLASS.',
  },
];

/*
 * Letter spacing · weight · Tailwind palette — three axes closed on 2026-08-05.
 *
 * ## Letter spacing (`tracking-[…em]`)
 *
 * The ramp **existed but no one used it**. Measurement: while 9 tokens were used by 13 files,
 * 146 files manually wrote `tracking-[Nem]`, with 21 distinct values — **31 instances of writing the same value in two notations** like `0.1em` and `0.10em`. The cause wasn't preference but **a missing layer**: places actually needing letter spacing were almost all `uppercase`
 * micro-labels (measured 194 instances), but the ramp's caption/label (0.04/0.02em) are body values, so there was no line step there. Listing five `--tracking-caps-08~16` moved 213 places to pixel 0.
 *
 * ## Weight (`font-[NNN]`)
 *
 * There's only one token: `--font-weight-signature`(510), yet `560`·`650` were manually written in 13 places. While not using Tailwind's default 3 steps (500/600/700) for variable fonts is intentional,
 * that intention **lived unnamed**. Listed both as-is.
 *
 * ## Tailwind palette utilities
 *
 * `text-white` 3 places + `border-white/35` 1 place. Small number but **monochrome+indigo one**
 * is the exact opposite of the charter. And there was a trap here — if we changed `text-white` to «not a token» as `--color-text-primary`, the contrast on indigo would have dropped from 4.70 → 4.42
 * **failing AA**. The correct destination was already `--color-text-on-accent`(#ffffff). It's not the value but the **position** that defines the token.
 *
 * ⚠️ Pre-enable census: zeroed all three axes first, then enabled (lint total unchanged).
 */
const typographyAxisSelectors = [
  /*
   * **Named line-height utilities — handover finished but rule not enabled** (2026-08-17).
   *
   * The `design.md` line-height ramp item states *"all named utilities (numeric leading-4~7 · ratio-style
   * relaxed·snug·none·tight) are banned"*, but the actual rule only looked at bracket forms. We did that intentionally then — as noted in comments below this file,
   * named usage was 199 instances then, so enabling it as a rule would have drowned existing signals in noise.
   *
   * That handover is finished. Current live usage is 0 (the one caught had a comment "moved from here"). It's now a place where we can close without
   * noise — "specs only in docs aren't followed" is the discipline of this repo.
   */
  {
    selector:
      "Literal[value=/(^|\\s|:)leading-(relaxed|snug|none|tight|loose|[3-9]|10)(\\s|$)/]",
    message:
      'Line height is a ramp too. No named Tailwind leading steps; use the --leading-caption/label/body/body-lg/title/display/hero pairs and --leading-display-tight/prose. Where a size step already carries its own line height, no leading class is needed.',
  },
  {
    selector:
      "TemplateElement[value.raw=/(^|\\s|:)leading-(relaxed|snug|none|tight|loose|[3-9]|10)(\\s|$)/]",
    message:
      'Line height is a ramp too. No named Tailwind leading steps (template literal); use utilities from the --leading-* ramp.',
  },
  {
    selector: 'Literal[value=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message:
      'Letter spacing is a ramp too. Use --tracking-caps-08/10/12/14/16 for uppercase micro labels, --tracking-caption/label/body/body-lg/title for body pairs, --tracking-display/hero/section/card for large headings. For a value outside the ramp, open a PR that registers the step first.',
  },
  {
    selector: 'TemplateElement[value.raw=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message: 'Letter spacing is a ramp too (template literal). Use --tracking-* tokens.',
  },
  {
    selector: 'Literal[value=/font-\\[[0-9]+\\]/]',
    message:
      'Font weight is a ramp too: only --font-weight-signature(510), -emphasis(560) and -strong(650). A raw number leaves its intent unnamed.',
  },
  {
    selector: 'TemplateElement[value.raw=/font-\\[[0-9]+\\]/]',
    message: 'Font weight is a ramp too (template literal). Use --font-weight-*.',
  },
  /*
   * ## Named weight steps — the other half of what was only blocking brackets (2026-08-05)
   *
   * The two selectors above only looked at **numbers written in brackets** like `font-[560]`. But
   * the actual majority used `font-medium`/`font-semibold` — **216 places** unseen by any rule or ratchet. These are the very values `globals.css`'s weight block wrote as "*only these three, not Tailwind
   * default (500/600/700)*".
   * Same shape as `text-sm`/`rounded-md` 268 instances bypassing the ramp entirely,
   * same bug recurring on one axis: **syntax evades gates, not values.**
   *
   * `font-normal`(400) is **not banned.** 400 is the document's base weight, not a ramp step, and `font-normal` means "turn off emphasis" — all 6 measured instances
   * used it that way (two of them revert browsers drawing `<b>` as 700).
   * The ramp adds three emphasis steps on top of that base.
   *
   * ⚠️ Pre-enable census: moved all 216 places to the ramp first, then enabled — 0 violations.
   */
  {
    selector:
      'Literal[value=/(^|[^-\\w])font-(thin|extralight|light|medium|semibold|bold|extrabold|black)([^-\\w]|$)/]',
    message:
      'No named Tailwind weight steps; the ramp is only --font-weight-signature(510), -emphasis(560) and -strong(650). Use strong for heading roles (h1~h6, <b>/<strong>, dialog titles, display size and above) and emphasis for other inline emphasis. To drop emphasis, use font-normal.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])font-(thin|extralight|light|medium|semibold|bold|extrabold|black)([^-\\w]|$)/]',
    message:
      'No named Tailwind weight steps (template literal). Use --font-weight-signature/-emphasis/-strong.',
  },
  {
    selector:
      'Literal[value=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message:
      'No Tailwind default palette: the charter is neutral plus a single indigo. Use --color-* tokens. Warning: the token follows the role, not the value. White text on an indigo surface is --color-text-on-accent, not --color-text-primary (which is 4.42:1, below AA).',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message: 'No Tailwind default palette (template literal). Use --color-* tokens.',
  },
];

/*
 * Layering (z-index) — **20+ is a global app contract.**
 *
 * Measurement (2026-08-05): 11 steps were used regularly, but nowhere in code was it written which sits on top of what. z-index conflicts are a prime bug source spreading as "it doesn't show so raise the number",
 * and without names, the next person raises it again.
 * Listed `--z-*` ladder (values as-is) and moved 17 global band places.
 *
 * ⚠️ **Narrowed scope to 20+.** Blocking even "local stacking valid only within one surface" like 1~13 in the combat compass stage would make local context act like a global contract,
   * turning the rule into noise. Leave those 11 places as-is.
 *
 * ⚠️ Pre-enable census: 17 arbitrary instances 20+ existed, all pre-replaced (0 violations).
 */
/*
 * ⚠️ **The arbitrary bracket was only half the door** (2026-09-05 audit, F17).
 *
 * The two selectors below saw `z-[N]`. In Tailwind v4 `z-*` is a **dynamic
 * utility**, so `z-25`, `z-70` and `z-999` are equally valid class names that emit
 * exactly the same declaration — measured in the browser on this build: 25, 70 and
 * 999 respectively. So the whole ladder could be bypassed by dropping two brackets,
 * and the syntax that read as "on the ramp" was the one nothing checked.
 *
 * **Named 20/30/40/50 stay legal.** `design-gates.md`, "z-index has a partial
 * ramp": those four Tailwind steps *are* the names for sticky, map hints, map
 * popovers and floating chrome, and tokenizing them was rejected because a token
 * with zero consumers is misinformation. The new selector therefore blocks named
 * layering at or above 20 that is **not** one of them — the values that duplicate a
 * `--z-*` token (60/70/75/80/100) or invent a step between two tiers.
 *
 * Pre-enable census (src + app, `.ts`/`.tsx`/`.css`): z-0 ×2, z-10 ×17, z-20 ×19,
 * z-30 ×18, z-40 ×16, z-50 ×18 — **zero off-ladder**, so lint signal does not grow.
 * The four `z-70` hits in the repository are prose inside comments, which no
 * `Literal`/`TemplateElement` selector reaches.
 */
const OFF_LADDER_NAMED_Z = '(?:[2-9][1-9]|[6-9]0|[1-9][0-9]{2,})';
const NAMED_Z_MESSAGE =
  'Layers 20 and above are an app-wide contract. A named z-N is the same as an arbitrary value in Tailwind v4 (z-70 really emits 70). 20/30/40/50 are the names of sticky, map-hint, map-popover and overlay-chrome, so use them as-is; for any other value use the --z-* ladder (map-scrim < dialog < tour < tour-card < tooltip < skip-link). Stacking local to one surface stays below 20.';

const layerSelectors = [
  {
    selector: 'Literal[value=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message:
      'Layers 20 and above are an app-wide contract: do not write the number, use the --z-* ladder (surface-sticky < map-hint < map-scrim < map-popover < overlay-chrome < dialog-scrim < dialog < tour < tour-card < tooltip < skip-link). Stacking local to one surface stays below 20.',
  },
  {
    selector: 'TemplateElement[value.raw=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message: 'Layers 20 and above use the --z-* ladder (template literal).',
  },
  {
    selector: `Literal[value=/(^|[^-\\w])z-${OFF_LADDER_NAMED_Z}([^-\\w]|$)/]`,
    message: NAMED_Z_MESSAGE,
  },
  {
    selector: `TemplateElement[value.raw=/(^|[^-\\w])z-${OFF_LADDER_NAMED_Z}([^-\\w]|$)/]`,
    message: `${NAMED_Z_MESSAGE} (template literal)`,
  },
];

/*
 * ⚠️ **Direct children (`>`) only misses ternaries** (2026-08-13 measurement — design-gates.md
 * "static selectors only see literals" series). `tone={cond ? "accent" : …}` is under Literal in JSXExpressionContainer→ConditionalExpression, so it didn't hit the previous selector,
 * and VaultStartChecklist was actually alive with accent+indigo tints on one element that way. So we widen each pair to "direct literal ∪ ternary branch literal" —
 * `ConditionalExpression > Literal` only catches branch (consequent/alternate) positions, so it doesn't false-positive comparison literals like `x === "accent"` (under BinaryExpression).
 */
const accentTintPairingSelectors = [
  {
    selector:
      'CallExpression[callee.name="controlClass"] ObjectExpression:has(:matches(Property[key.name="tone"] > Literal[value="accent"], Property[key.name="tone"] ConditionalExpression > Literal[value="accent"])):has(Property[key.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      'Ink on an indigo/amber tint fill is accentOnTint, not the tone accent (#7170ff, composite contrast 3.5~4.4:1, below AA). Ternary branches are covered too. See tests/contract/accent-ink-contrast.contract.test.ts',
  },
  {
    selector:
      'JSXOpeningElement:has(:matches(JSXAttribute[name.name="tone"] > Literal[value="accent"], JSXAttribute[name.name="tone"] JSXExpressionContainer ConditionalExpression > Literal[value="accent"])):has(JSXAttribute[name.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      'Ink on an indigo/amber tint fill is tone="accentOnTint", not tone="accent" (#7170ff, below AA). Ternary branches (tone={cond ? "accent" : …}) are covered too. See tests/contract/accent-ink-contrast.contract.test.ts',
  },
];


// ── Geometry & Type Codex (R5) Blockade ─────────────────────────────────
// Arbitrary classes like text-[Npx] / rounded-[Npx] are prohibited — docs/DESIGN-SYSTEM.md
// Express only via the "Geometry & Type Codex" ramp (text-caption…text-hero / rounded-chip…panel).
// Intentional exceptions outside the ramp must be explicitly marked with `// eslint-disable-next-line
// no-restricted-syntax -- <reason>`. Migrated directories = error,
// incomplete (ontology-map · views/home) = warn.
/*
 * Colour literals outside the token layer (2026-09-08).
 *
 * The 2026-07-26 hex gate looks only inside Tailwind arbitrary values (`-[#…]`), so a hex in a
 * style object, an `rgba()` anywhere, a named `ease-*` class, and a mask stencil were never seen.
 * Inventory before enabling (design-system-audit, 2026-09-08): 41 hex outside brackets and 41
 * `rgb()/rgba()` in code lines, most of them one qualitative kind palette (now the
 * `--color-kind-*` tokens), a documented JS indigo mirror, and
 * surfaces a CSS variable cannot reach (Satori, standalone HTML, canvas). Those keep their
 * scope blocks or a per-line disable with a reason; everything else moved to a token first,
 * so this array enables at 0 violations.
 *
 * `rgba(${…` and `rgb(var(` are the correct pattern for a canvas or a paint that must read a
 * token at runtime, so the regex requires a digit right after the paren.
 * ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
 */
export const colorLiteralSelectors = [
  {
    selector: 'Literal[value=/(?:^|[^\\w-])(?:rgba?|hsla?)\\(\\s*\\d/]',
    message:
      'Design charter: no rgb()/rgba()/hsl() literals. Reference --color-* tokens via var(). Only surfaces CSS variables cannot reach (canvas, Satori, standalone HTML) get eslint-disable with a reason.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^\\w-])(?:rgba?|hsla?)\\(\\s*\\d/]',
    message:
      'Design charter: no rgb()/rgba()/hsl() literals (template literal). Reference --color-* tokens via var().',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(?:color|backgroundColor|background|borderColor|outlineColor|fill|stroke|caretColor|accentColor)$/] > Literal[value=/#[0-9a-fA-F]{3,8}/]',
    message:
      'Design charter: no hex colors in an inline style; it creates no class, so the bracket-hex gate cannot see it. Reference --color-* tokens via var().',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(?:maskImage|WebkitMaskImage)$/] > Literal[value=/#[0-9a-fA-F]{3,8}|rgba?\\(\\s*\\d/]',
    message:
      'No color literals in a mask stencil, even when only alpha matters; the gate cannot see them. Use the `black`/`transparent` keyword or a --color-* token via var().',
  },
  {
    selector: 'Literal[value=/(?:^|[^-\\w])ease-(?:in|out|in-out|linear)(?![-\\w\\[])/]',
    message:
      'No hard-coded motion curves: instead of Tailwind default curves, reference --motion-ease / --motion-ease-exit / --topology-motion-ease-out via var() inside the ease utility.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])ease-(?:in|out|in-out|linear)(?![-\\w\\[])/]',
    message:
      'No hard-coded motion curves (template literal): reference --motion-ease* tokens via var().',
  },
];

export const arbitrarySizeSelectors = [
  /*
   * ── Named Tailwind base steps are also outside the ramp (2026-08-03 Census) ──────
   *
   * The bracket selectors below only look at **arbitrary syntax** like `text-[13px]`. However,
   * Tailwind v4 only *adds* our ramps without overwriting its own base scale, so
   * **named classes like `text-sm`(14) · `rounded-md`(6) pass through any rule and
   * render**. Measured 268 instances — the second system bypassing the ramp entirely.
   *
   * We replaced all values with matching ones (md=chip 6px · xl=panel 12px · sm=body-lg 14px) with ramp
   * names, then enabled this selector. Violations were 0 upon enabling.
   *
   * We exclude `rounded-full` — perfect circles (dots/avatars/pills) are not questions the linear 3-step ramp
   * can answer.
   *
   * The 2026-08-03 design review closed these holes:
   *
   * - `rounded-sm`(4px) and un-suffixed `rounded`(4px, 37 instances) were **not drift
   *   but steps missing from the ramp** — a value repeating 96 times is not an exception.
   *   After listing `--radius-micro`(4px) and performing full machine replacement (pixel shift 0), we
   *   enabled the selector below (violations 0 upon enabling).
   * - `rounded-2xl`(19) · `text-base|lg|xl|2xl|3xl`(total 8) needed pixel-moving, per-site
   *   replacements; once paid down they joined the named-step selectors further below.
   */
  {
    selector: 'Literal[value=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind default type steps (they bypass the ramp). Use text-caption/label/body/body-lg/title/display/hero.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind default type steps (template literal). Use the text-* ramp.',
  },
  /*
   * 2026-08-04 — Included directional suffix forms (`rounded-t-*` etc.) in the scope. Previously
   * the pattern only looked at `rounded-(sm|…)` so `rounded-r-md`(HubRail) · `rounded-t-[28px]`
   * (ProjectDrawer mobile sheet) **passed through any rule** alive — having a rule is useless if its scope is too short (precedent of arrow gates). Pre-enable census: 1 directional name step + 2 directional arbitrary instances, all replaced in the same PR.
   */
  {
    selector:
      'Literal[value=/(^|[^-\\w])rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?(sm|md|lg|xl)([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind default radius steps (they bypass the ramp). Use rounded-micro/chip/card/panel/sheet.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?(sm|md|lg|xl)([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind default radius steps (template literal). Use the rounded-* ramp.',
  },
  /*
   * Un-suffixed `rounded`(4px) — an alias kept alive by Tailwind v4, so it doesn't
   * catch in the name step selector. After listing `--radius-micro` on 2026-08-03 and replacing all 37 instances, we enabled it
   * (violations 0 upon enabling). We include `:` as a delimiter to also catch variant prefix forms (`[&_code]:rounded`).
   */
  /*
   * Tailwind's named type and radius steps — the ramp's last bypass.
   *
   * `named-offramp-utility-ratchet.contract.test.ts` held these with a budget of 0
   * each, which is a ratchet that has finished ratcheting: it only ever restated
   * "zero", and it re-scanned the whole tree to do it. Moving the check here makes
   * it fire at edit time instead of at test time.
   *
   * ⚠️ **Probed before moving** (2026-08-22). An audit had reported the ratchet as
   * fully covered by eslint already. It was not — of its 21 families, **nine had no
   * selector at all** (`rounded-xs` `rounded-2xl` `rounded-3xl` `text-base` `text-lg`
   * `text-xl` `text-2xl` `text-3xl` `text-4xl`). Deleting the contract on that
   * report would have opened a hole rather than removed a duplicate. These nine are
   * the selectors that close it.
   */
  {
    selector:
      'Literal[value=/(^|[^-\\w])(rounded-(xs|2xl|3xl)|text-(base|lg|xl|2xl|3xl|4xl))([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind named steps (they bypass the ramp). Use rounded-micro/chip/card/panel/sheet for radius and text-caption/label/body/body-lg/title/display/hero for size.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])(rounded-(xs|2xl|3xl)|text-(base|lg|xl|2xl|3xl|4xl))([^-\\w]|$)/]',
    message:
      'Geometry Codex: no Tailwind named steps (template literal). Use ramp tokens.',
  },
  {
    selector: 'Literal[value=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex: no bare rounded (4px; it bypasses the ramp). The same 4px is rounded-micro.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex: no bare rounded (4px) (template literal). Use rounded-micro.',
  },
  {
    selector: 'Literal[value=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[Npx]. Use the text-caption/label/body/body-lg/title/display/hero ramp, or eslint-disable with a reason if outside the ramp.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[Npx] (template literal). Use the text-* ramp.',
  },
  // The ramp moved to `rem` on 2026-09-12 so that a browser's text-only zoom reaches it
  // (`app/globals.css`, "The ramp is written in `rem`"). The two selectors above only know the
  // px spelling, so `text-[0.8125rem]` was an off-ramp size no rule could see — the same hole
  // the px selectors were written to close, reopened by the unit. Both spellings are banned.
  {
    selector: 'Literal[value=/text-\\[[0-9.]+rem\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[Nrem]. Use the text-caption/label/body/body-lg/title/display/hero ramp, or eslint-disable with a reason if outside the ramp.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+rem\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[Nrem] (template literal). Use the text-* ramp.',
  },
  // The two spellings the four selectors above still cannot see: the explicit `length:` data
  // type, and `em`. `em` is the worse of the two — it resolves against the *parent's* size, so
  // it neither pins a pixel nor follows the reader's root, and it reads as if it did.
  {
    selector: 'Literal[value=/text-\\[length:[0-9.]+(px|rem|em)\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[length:N<unit>]. Use the text-* ramp, or eslint-disable with a reason if outside the ramp.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[length:[0-9.]+(px|rem|em)\\]/]',
    message:
      'Geometry Codex: no hard-coded text-[length:N<unit>] (template literal). Use the text-* ramp.',
  },
  {
    selector: 'Literal[value=/text-\\[[0-9.]+em\\]/]',
    message:
      'Geometry Codex: no text-[Nem]. em is relative to the parent size, so it follows neither pixels nor the root. Use the text-* ramp.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+em\\]/]',
    message:
      'Geometry Codex: no text-[Nem] (template literal). Use the text-* ramp.',
  },
  {
    selector:
      'Literal[value=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex: no hard-coded rounded-[Npx] (directional suffixes included). Use the rounded-chip/card/panel/sheet ramp, or eslint-disable with a reason if outside the ramp.',
  },
  {
    selector:
      'TemplateElement[value.raw=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex: no hard-coded rounded-[Npx] (template literal). Use the rounded-* ramp.',
  },
  // 2026-07-26 — Hole revealed by owner question ("box shape or corner or border spec ... **also in code**"). `text`/`rounded` were caught, but **shadows had no rule** — even though `design.md` defined the `--shadow-elevation-1/2/3` ladder, 5 hardcoded rgba shadows remained alive (replacement complete).
  //
  // **We only catch those without `var(`.** `shadow-[var(--chrome-shadow)]` is **valid syntax** for referencing CSS variables in Tailwind, not a violation — initially we banned `shadow-\[` entirely, warning over 90 normal token usages, causing lint output to jump from 144 →
  // 548. If noise covers the signal, the gate is powerless.
  // ⚠️ **Do not use literal utility syntax in messages.** Tailwind v4's source
  // scanner scans strings in this file too, so class names used as examples become actual
  // classes — on 2026-07-26 one example created unparsable CSS `--tw-shadow: var(--...)`, breaking the production build (full Playwright failure).
  // 2026-07-28 re-convergence — **narrow the exemption that looked only at `var(` to a geometry allowed list.**
  //
  // The previous rule passed if `var(` existed in the value. This exemption was meant to preserve normal token usage (the initial draft false-positive warned over 90 instances), but had large side effects: **color was tokenized, but geometry was free**, causing hand-tuning that the ladder had converged to 3 steps to re-spread into 23 types. Among them were 2 light source inversions (bottom tab bar y negative · right panel y=0) and 1 layer inversion (blur 90 > dialog 80).
  //
  // So we look not at "did you use a token" but **"which token did you use"**. Allowed:
  // ladder (elevation-*/dock-*) · press (control-press) · surface-specific tokens
  // (topology/chrome/git) · inset hairline (material, not light). We converged the 23 instances first and enabled it, so violations were 0 upon enabling · lint total unchanged.
  // ⚠️ Prohibition on using literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: `Literal[value=/${SHADOW_CLASS_LAYER_VIOLATION}/]`,
    message:
      'Off the elevation ladder: the token also owns shadow geometry, and the check applies to every layer individually. Use --shadow-elevation-1/2/3 (coach-mark < popover < dialog), -dock-bottom/-dock-side for edge docking, --shadow-control-press for pressed controls. An inset hairline is material and allowed, but it does not exempt the layers beside it: a single valid layer once laundered a hand-written elevation shadow (closed 2026-08-06).',
  },
  {
    selector: `TemplateElement[value.raw=/${SHADOW_CLASS_LAYER_VIOLATION}/]`,
    message:
      'Off the elevation ladder (template literal): checked per layer. Use --shadow-elevation-* / -dock-* / --shadow-control-press.',
  },
  // 2026-07-26 hex — **a preventive gate with 0 current violations.** Full sweep measurement showed no src/app had hex embedded in
  // Tailwind arbitrary values, and the remaining 127 hex instances were all justified exceptions: test fixtures 83 · PR number comments 16 ·
  // surfaces CSS-vars can't reach 16 (next/og Satori · viewport.themeColor ·
  // standalone HTML) · JS-side token truth source 7 · token reader fallback 3 · mask
  // alpha stencil 2.
  //
  // So "ban all hex" would only create noise for 27 instances with 0 signals to catch.
  // **Narrowing it inside Tailwind arbitrary values** blocks today's 0 and future inflow only.
  // (Correction learned from the shadow rule — broad rules count normal usage as violations.)
  {
    selector: 'Literal[value=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      'Design charter: no hex inside a Tailwind arbitrary value. Reference --color-* tokens via var(). Surfaces CSS variables cannot reach (Canvas, next/og, standalone HTML) get eslint-disable with a reason.',
  },
  {
    selector: 'TemplateElement[value.raw=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      'Design charter: no hex inside a Tailwind arbitrary value (template literal). Reference --color-* tokens via var().',
  },
  // 2026-07-27 motion duration — **the same failure mode** as the shadow ladder. Defined the ramp
  // (--motion-fast/base/settle) but had no rule, so while only one component referenced it, 30 literals lived beside it.
  //
  // Pre-enable measurement (design.md step 4): violations were only 30 tsx files, with no category misidentified as normal use — token-reference types have brackets following, so they don't hit this regex (number after) anyway. The `var(` exception narrowing needed for the shadow rule is unnecessary here.
  // Since we replaced the 30 instances **first** and enabled the rule, it's 0 violations on enable, lint total unchanged.
  //
  // The leading `(?:^|[^-\w])` prevents false positives from CSS property name strings like `transition-duration-…`.
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file (one example broke production build on 2026-07-26).
  // 2026-07-28 motion budget — **frequency cuts the budget.** Surfaces triggered by hover/focus are encountered dozens of times a day: objectively fast curves feel slow at that frequency,
  // and the answer is curve adjustment, not budget reduction. The ramp's move/settle steps are for events happening a few times a day (mode switch · commit convergence · surface swap).
  //
  // Pre-enable census measurement (design.md step 4): among 21 ramp references, **6** coexist in className with hover/focus (info-hint · copy button · chrome chips 2 · cluster expand · project card). One PR's replacement scope, and the control group measured normal chrome chip (0.12s declaration · ramp 124ms · peak 3 frames) is already ideal,
  // so there's no category counting normal use as violation. Replaced the 6 instances **first** and enabled the rule,
  // so 0 violations on enable · lint total unchanged.
  //
  // Discrimination is "coexist in the same className string" — that's all AST rules can see, and indeed all those 6 instances were inside one string. Order doesn't matter for both.
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector:
      'Literal[value=/(?:hover|focus-within|focus-visible):[^"]*duration-\\[var\\(--motion-(?:base|settle)\\)\\]|duration-\\[var\\(--motion-(?:base|settle)\\)\\][^"]*(?:hover|focus-within|focus-visible):/]',
    message:
      'Motion budget: do not spend the move (base) or settle budget on high-frequency surfaces triggered by hover/focus. Demote to a fast ramp token, or record in the eslint-disable comment why the surface is not high-frequency.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(?:hover|focus-within|focus-visible):[^`]*duration-\\[var\\(--motion-(?:base|settle)\\)\\]|duration-\\[var\\(--motion-(?:base|settle)\\)\\][^`]*(?:hover|focus-within|focus-visible):/]',
    message:
      'Motion budget: no move/settle budget on high-frequency hover/focus surfaces (template literal). Demote to the fast ramp.',
  },
  {
    selector: 'Literal[value=/(?:^|[^-\\w])duration-\\d/]',
    message:
      'No hard-coded motion duration. For the default (--motion-fast) omit the duration class; reference --motion-base for surface moves and --motion-settle for confirmations via var() inside the duration utility.',
  },
  // 2026-07-28 — **scope hole** of the duration rule. The selector above only sees duration utilities, but surfaces using keyframes load duration inside animation shorthand syntax:
  // ms embedded there didn't hit any gate. Full sweep measurement showed 3 instances alive (150/180/220ms), and 220 was a value not even in the ramp. Replaced the 3 first
  // and enabled the rule, so 0 violations on enable · lint total unchanged.
  //
  // Token-reference types (`var(--motion-base)`) don't start with numbers, so they don't hit this regex.
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/animate-\\[[^\\]]*_[0-9.]+m?s/]',
    message:
      'No hard-coded motion duration: times inside the animation shorthand follow the ramp too. Reference --motion-fast/base/settle and --motion-ease via var().',
  },
  {
    selector: 'TemplateElement[value.raw=/animate-\\[[^\\]]*_[0-9.]+m?s/]',
    message:
      'No hard-coded motion duration inside the animation shorthand (template literal). Reference --motion-* tokens via var().',
  },
  // 2026-07-28 duration's **bracket form** — the `duration-<number>` rule only sees utility number suffixes. `duration-[180ms]` is outside that regex since it's in brackets,
  // and doesn't hit the ramp bypass rule (referencing ramp tokens as arbitrary length). Measured 1 instance (document sidebar width transition) replaced and enabled — 0 violations, total unchanged.
  // Token-reference types (`duration-[var(--motion-base)]`) don't start with numbers so they don't hit this regex.
  {
    selector: 'Literal[value=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      'No hard-coded motion duration: times inside brackets follow the ramp too. Reference --motion-fast/base/settle via var().',
  },
  {
    selector: 'TemplateElement[value.raw=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      'No hard-coded motion duration inside brackets (template literal). Reference --motion-* tokens via var().',
  },
  // 2026-07-28 Tailwind **named shadows** — defined the high ladder (`--shadow-elevation-1/2/3`)
  // but the rule only saw arbitrary values, so framework defaults like `shadow-2xl` lived outside the ladder. Full sweep measured 6 instances all in sheet/dialog (= dialog tier), replaceable in one PR, and 0 violations · total unchanged after replacement.
  // `shadow-none` is excluded from the list as a justified declaration of "no shadow".
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      'Off the elevation ladder: instead of Tailwind default shadows, reference --shadow-elevation-1/2/3 (coach-mark < popover < dialog) via var() inside the shadow utility.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      'Off the elevation ladder (template literal): reference --shadow-elevation-* tokens via var().',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])duration-\\d/]',
    message:
      'No hard-coded motion duration (template literal). Use --motion-fast/base/settle tokens.',
  },
  // 2026-07-27 line-height — letter size had specs, but line spacing didn't. Full sweep
  // measurement showed arbitrary 19 types split into 4 clusters, and value differences **within** clusters (1.5·1.55·1.6·1.65 in the same panel) were all drift.
  //
  // Pre-enable measurement (design.md step 4): 0 categories misidentified as normal use — ramp steps don't use brackets, and existing named utilities (leading-4/relaxed etc. 199 instances) aren't bracket-number forms required by this regex, so they don't hit anyway. Reason not to catch named side with rules: 199 warnings are noise drowning the baseline 143, and
  // the dominant leading-4/5/6 values (16/20/24px) match ramp pairs, so they aren't violations either.
  // Replaced 74 instances **first** and enabled the rule, so 0 violations on enable, total unchanged.
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/leading-\\[[0-9.]+\\]/]',
    message:
      'No hard-coded line height. Use utilities from the nine-step ramp from --leading-caption to --leading-prose (paired 1:1 with the size steps), or eslint-disable with a reason if outside the ramp.',
  },
  {
    selector: 'TemplateElement[value.raw=/leading-\\[[0-9.]+\\]/]',
    message:
      'No hard-coded line height (template literal). Use utilities from the --leading-* ramp tokens.',
  },
  // 2026-07-27 ramp bypass — a new failure mode after line-height companion combination (B2).
  // As size steps started carrying line-height together, **bypassing ramp tokens as arbitrary length**
  // gains only the size but loses that unit's line-height. If other ramp classes for different units exist on the same element, that unit's line-height remains,
  // creating ratios no one ever aligned — measurement: /git headline had 23px text with title pair 24px line-height (1.04), the biggest deviation in this repo.
  //
  // Pre-enable measurement (design.md step 4): 3 violations (all pointing to ramp tokens),
  // 0 categories misidentified as normal use — size tokens outside the ramp (rail labels · chrome titles etc. 5 instances) don't have `--text-` prefix, so they don't hit this regex anyway. Replaced the 3 first
  // and enabled the rule, so 0 violations on enable, lint total unchanged.
  //
  // The **general form** of mismatched pairs (ramp class + responsive arbitrary px) isn't caught by this rule — evaluating requires the full class list of one element, which doesn't fit in one selector when split as `cn()` args. That layer is handled by contract tests
  // (tests/contract/type-ramp-leading-pair.contract.test.ts).
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/text-\\[length:var\\(--text-/]',
    message:
      'Do not reference a type-ramp token through an arbitrary length. Use the ramp utility (text-<step>) directly; the bypass gives the size but loses the line-height pair of that step. Size tokens outside the ramp (rail/chrome only) are not flagged.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[length:var\\(--text-/]',
    message:
      'Do not reference a type-ramp token through an arbitrary length (template literal). Use the ramp utility directly.',
  },
  // framer-motion literals (2026-07-28 design council "system").
//
// The existing duration rule only sees Tailwind class strings (`duration-<number>`). framer's
// `transition={{ duration: 0.28 }}` was **outside any gate's scope**,
// so JS-side motion constants split from the CSS ramp (0.28·0.42), with 15 of 22 instances rendering outside the ramp.
// When values live where gates don't see, they inevitably split.
  {
    selector:
      'JSXAttribute[name.name="transition"] ObjectExpression > Property[key.name="duration"] > Literal',
    message:
      'No literal framer transition duration. Import the ramp mirror from `@/shared/motion` (MOTION.fast/base/settle). For a value outside the ramp, register it in the CSS ramp first and widen the mirror contract test.',
  },
  {
    selector:
      'JSXAttribute[name.name="transition"] ObjectExpression > Property[key.name="ease"] > :matches(ArrayExpression, Literal)',
    message:
      'No literal framer transition ease. Use `MOTION_EASE` (a copy of the --motion-ease value); an element taking a ramp duration takes its easing from the same family.',
  },
  // 2026-08-27 inline style time literals — **the third syntax of the duration rule.**
  // The class rules above see className strings and the framer rule sees `transition={{...}}`,
  // but a JSX `style` object was outside every detector: /ui-proof measured a raw
  // '--architecture-flow-delay': '100ms' shipping inside a style expression with zero lint
  // signal (finding F). The value has since moved to the stagger-token pattern
  // (--architecture-flow-stagger in globals.css × a unitless step custom property), so the
  // pre-enable census is 0 — enabling cost 0, lint total unchanged.
  //
  // Two shapes: whole-value times on timing properties and on `--*` custom-property keys
  // (the exact F escape), and times embedded in animation/transition shorthand strings.
  // Descendant `Literal` (not `> Literal`) covers ternary branches from day one
  // (design-gates: direct-child selectors miss conditional branches). The `--*` key's own
  // Literal cannot match the time regex, so the descendant form is safe there.
  // Unitless step values (`'--x-step': depth - row`) are numbers, not time strings — clean.
  // Template-literal times (`${i * 30}ms`) are runtime-computed, a different detector's job;
  // see design-gates.md before widening.
  {
    selector:
      'JSXAttribute[name.name="style"] Property:matches([key.name=/^(animation|transition)(Delay|Duration)$/], [key.value=/^--/]) Literal[value=/^[0-9.]+m?s$/]',
    message:
      'No hard-coded motion time: literal times in a JSX style object (delay, duration, custom properties) follow the ramp too. Reference --motion-fast/base/settle via var(); for stagger, put only a number in a unitless step custom property and let CSS calc(var(--*-stagger) * step) produce the time.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(animation|transition)$/] Literal[value=/(^|[^-\\w(])[0-9.]+m?s([^-\\w]|$)/]',
    message:
      'No hard-coded motion time: literal times inside an animation/transition shorthand in a JSX style follow the ramp too. Reference --motion-fast/base/settle and --motion-ease via var().',
  },
];

/*
 * ── Ramp coverage is a **blocklist** (2026-08-04) ───────────────────────────
 *
 * What was here was an allowlist (`codexMigratedGlobs`) — "only block directories where replacement is done" as error. It was honest design when we couldn't clear the fan at once,
 * but side effects inverted the purpose: **newly created directories are in neither list, so they receive no specs.**
 *
 * 2026-08-04 live usage test measurement — new `src/views/<name>/ui/*.tsx` one line
 *
 *     text-[13px]  rounded-[5px]  leading-[1.9]  duration-300
 *
 * We planted 4 violations and ran `pnpm exec eslint`, resulting in **0 errors, 0 warnings.**
 * Re-checking with `calculateConfigForFile` showed that the path received only **7** `no-restricted-syntax`
 * selectors (scale/gradient 5 + accent tint 2) and **0** ramp selectors. The owner's goal is "when you give a command, the screen comes out based on the design system", but **new screens are precisely where no specs are enforced.**
 *
 * So we flip it. The default is "overridden", and exceptions are **listed per file**.
 *
 * ⚠️ Pre-enable census measurement (`design.md` "must measure before enabling rules"):
 * Forcing ramp selectors over the entire `src/**` + `app/**` revealed **125 violations**,
 * and those 125 instances were clustered in **12 files**. 8 directories were blind spots,
 * but actual debt was 12 files — so the cost of flipping is "12 lines of exceptions".
 * We are not clearing these 125 instances in this PR due to scale, but **nature**: most are values not in the ramp (13 · 27 · 11.5px …), so replacement means render pixel changes requiring per-location design judgment. That judgment belongs to the design pass, not the lint PR. Until then, debt is held by the ratchet.
 */
export const rampCoveredGlobs = ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'];

/**
 * Files **temporarily exempted** from ramp blockade. The key is that it is a **file**, not a directory — files newly created next to legacy files are overridden from day one.
 *
 * The adjacent numbers are measured violation counts on 2026-08-04, and the master ledger is
 * `tests/contract/type-ramp-coverage.contract.test.ts`. That contract measures (1) if paths listed here actually exist, (2) if debt does not exceed the ledger, (3) if no files have reached 0, and (4) if **the cover glob has not narrowed back to an allowed list**.
 *
 * ⚠️ **Do not put directory globs in this list.** The contract rejects it — excluding by directory
 * also exempts new files inside it, which was the cause of flipping this block.
 */
export const rampDebtExemptions = [
  // **2026-08-05: Empty.** This list was a temporary
  // exemption for 「files used before the ramp existed」, and reached 0 when we moved the last 7 files' 93 instances (text 68 · radius 25) to the ramp. Now `rampCoveredGlobs` truly covers everything.
  //
  // ⚠️ **Putting a file back here is turning off specs.** If you need new values,
  // do not create an exception; list a step in the ramp (convene 「system」) and include lint in the same PR — that is what this repo already did with `--radius-micro`.
  // Even if the list is empty, the contract does not run idle: `type-ramp-coverage` runs
  // ESLint itself to measure 「whether new non-existent paths also receive all ramp selectors」.
];

// Tests assert rendered className strings, so exclude from ramp rules.
const codexTestIgnores = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Since eslint-config-next 16.2.4, new React Compiler-based rules have been promoted to error,
    // but patterns we intentionally use like setState-in-effect / refs-during-render / manual
    // memoization are valid and overly restrictive as errors. Downgraded to warning level to pass lint and allow gradual improvement.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app-layer', pattern: 'src/app/**' },
        { type: 'views', pattern: 'src/views/**' },
        { type: 'widgets', pattern: 'src/widgets/**' },
        { type: 'features', pattern: 'src/features/**' },
        { type: 'entities', pattern: 'src/entities/**' },
        { type: 'shared', pattern: 'src/shared/**' },
      ],
      'boundaries/include': ['src/**/*'],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          policies: [
            // Value imports — standard FSD layer direction.
            {
              from: { element: { type: 'app-layer' } },
              allow: {
                to: { element: { type: ['views', 'widgets', 'features', 'entities', 'shared'] } },
              },
            },
            {
              from: { element: { type: 'views' } },
              allow: {
                to: { element: { type: ['widgets', 'features', 'entities', 'shared'] } },
              },
            },
            {
              from: { element: { type: 'widgets' } },
              allow: { to: { element: { type: ['features', 'entities', 'shared'] } } },
            },
            {
              from: { element: { type: 'features' } },
              allow: { to: { element: { type: ['entities', 'shared'] } } },
            },
            {
              from: { element: { type: 'entities' } },
              allow: { to: { element: { type: ['shared'] } } },
            },
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: ['shared'] } } },
            },
            // Type-only imports (`import type ...`) are allowed in all directions.
            // They vanish at compile time, so there is no runtime dependency and they do not
            // create architecture coupling. Allows reasonable cases like shared/mocks/demo-data referencing entity shapes as types, or features referencing types of other features. `dependency.kind` is a selector-level field.
            {
              from: {
                element: {
                  type: [
                    'app-layer',
                    'views',
                    'widgets',
                    'features',
                    'entities',
                    'shared',
                  ],
                },
              },
              allow: {
                to: {
                  element: {
                    type: [
                      'app-layer',
                      'views',
                      'widgets',
                      'features',
                      'entities',
                      'shared',
                    ],
                  },
                },
                dependency: { kind: 'type' },
              },
            },
          ],
        },
      ],
    },
  },
  // Slice public API — a slice is imported through its `index.ts`, never through
  // `@/<layer>/<slice>/<segment>/…`. Measured 2026-08-30 before the rule: 64 files
  // reached past a barrel (33 in views, 21 in widgets, 12 in features), and two
  // features (`acp-session`, `acp-doctor`) had no public API at all because every
  // consumer read their model files directly. Tests keep deep access.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/views/*/*', '@/widgets/*/*', '@/features/*/*', '@/entities/*/*'],
              message:
                'Import a slice through its public API (`@/<layer>/<slice>`), not a file inside it. Add the export to that slice\'s index.ts if it is missing; a slice with no index.ts has no public API yet — create one. Tests may still reach inside.',
            },
          ],
        },
      ],
    },
  },
  // Token-discipline block for every source file: checkbox accent, accent/tint ink pairing,
  // inline shadow and size, cursor and disabled affordance. Violations are lint errors.
  {
    files: ['src/**/*.{ts,tsx,jsx,js}', 'app/**/*.{ts,tsx,jsx,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...accentTintPairingSelectors,
        // Ramp debt files also receive this block — inline shadows are a ladder issue, not
        // ramp issue, so they must not be exempted along with debt exemption.
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
      ],
    },
  },
  // Ramp blockade — `src/**` + `app/**` **all** error, except legacy debt files.
  // Also reload the checkbox accent selectors so flat-config replacement cannot drop them.
  //
  // Excluded files are not defenseless — the checkbox accent · accent tint guards from the global block above (`src/**`+`app/**`) still apply. What is excluded is only the ramp (type/radius/line-height/motion/shadow) selectors, and that debt is held by the `tests/contract/type-ramp-coverage.contract.test.ts` ratchet.
  {
    files: rampCoveredGlobs,
    ignores: [...codexTestIgnores, ...rampDebtExemptions],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        ...colorLiteralSelectors,
        ...closureScopeSelectors,
      ],
    },
  },
  // Colour mirrors and canvas paint — the surfaces a CSS variable cannot reach (2026-09-08).
  //
  // ⚠️ **This block must come after the ramp block above.** Flat config replaces the rule
  // wholesale, so it reloads every ramp selector and drops only `colorLiteralSelectors`.
  // Census on enabling (design-system-audit, 2026-09-08), every one a copy of a token or a
  // canvas fallback for one:
  //   - `src/shared/config/indigo-tokens.ts` — the documented JS mirror of `--color-indigo-*`.
  //   - `src/views/docs-vault/lib/popout-template.ts` — a standalone HTML document with no
  //     stylesheet of ours to read.
  //   - `src/widgets/ontology-map/render/**` — canvas paint, which reads its tokens through
  //     `read-map-tokens` and keeps a literal only as the fallback for a missing one.
  // A new file here is a new exception and needs the same sentence.
  {
    files: [
      'src/shared/config/indigo-tokens.ts',
      'src/views/docs-vault/lib/popout-template.ts',
      'src/widgets/ontology-map/render/**/*.{ts,tsx}',
    ],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        ...closureScopeSelectors,
      ],
    },
  },
  /*
   * Satori surface — exempt only inline size/radius rules (2026-08-15, see 「Satori Exception」 section in inlineSizeSelectors comment).
   *
   * `opengraph-image.tsx` / `twitter-image.tsx` are Next.js reserved filenames, and all files with those names are drawn by Satori — CSS variables do not reach, so numeric literals are the only notation. Census (2026-08-15): 1 file, 8 instances.
   *
   * ⚠️ Flat config does not merge rule option arrays but replaces them — this block must
   // exclude what to exempt (inlineSizeSelectors) and **reload all others**. It must come after the ramp blocks above.
   */
  {
    files: ['**/opengraph-image.tsx', '**/twitter-image.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        ...closureScopeSelectors,
      ],
    },
  },
  // Prohibit `--color-amber-docs-*` isolation tokens in settings sheet (2026-08-02 design review).
  //
  // `VaultAgentSetupPanel` was mixing two amber lineages **within the same badge**:
  // background used `--color-amber-source-a12`(warning ladder, normal) but text used
  // `--color-amber-docs-a92`(document surface decoration quarantine). The comment on that token block in `globals.css` itself wrote *"prohibit expansion · pending subsequent downgrade review"*, yet this file was actually the **largest consumer** with 15 instances.
  //
  // ⚠️ **Pre-enable census measurement** (`design.md` "must measure before enabling rules"):
  // Violations in this path are 0 after replacement. The reason for narrowing scope to this directory is also the same — enabling globally would turn red document surfaces (the legitimate home of that token) and 17 legacy instances in `ProjectDrawer` and the retired activity surface simultaneously, making it noise rather than enforcement. Those two are not this council's surface, so they are next in sequence.
  //
  // ⚠️ **Flat config does not merge rule option arrays but replaces them.** So
  // this block must **reload ramp selectors** — if not, the ramp guard `rampCoveredGlobs`(`src/**` all) quietly disappears from this directory. No subsequent blocks overwrite this glob.
  {
    files: ['src/widgets/app-settings-menu/**/*.{ts,tsx}'],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // 2026-08-05: This block was also stepping in the same trap. The comment above correctly warned to «reload ramp selectors» but only loaded `arbitrarySize`, so weight/spacing/palette/layer were **never enforced** in this directory (including the three axes enabled by #940). Confirmed via probe:
        // `font-semibold`·`tracking-[…]`·`text-white` in this path passed with 0 error. Census 0, so enabling cost is 0.
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        {
          selector: 'Literal[value=/color-amber-docs-/]',
          message:
            'Do not use the docs-surface decorative quarantine amber in the settings sheet. For warning signals use the --color-amber-source-* (fill, border) and --color-amber-source-text-* (text) ladders; mixing two amber lineages in one badge reads as decoration, not signal.',
        },
        {
          selector: 'TemplateElement[value.raw=/color-amber-docs-/]',
          message:
            'Do not use the docs-surface decorative quarantine amber in the settings sheet (template literal). Use the --color-amber-source-* / --color-amber-source-text-* ladders.',
        },
        ...closureScopeSelectors,
      ],
    },
  },
  /*
   * The `_` prefix is a **marker left by the author** meaning "intentionally unused" (2026-08-06).
   *
   * ## Why this block exists
   *
   * This repository already used that convention, but the configuration ignored it —
   * three different authors each used `_hasLoadedVault` (a parameter left to maintain
   * the signature, as noted in the comment above), `_path` (a loop variable counting
   * three paths by name), and `_omit` (destructuring to extract only the key needed
   * for `...rest`). All three remained as warnings. **If a convention lies, the next
   * person won't trust it.**
   *
   * ## Direction of exemption (`design-gates.md` "Exemptions have direction")
   *
   * This exemption protects only «explicitly marked unused» items. To mark them,
   * you must rename them, so **there is no path for accidental leakage** — hiding
   * dead variables requires intentionally prefixing `_`, which remains visible in the diff.
   * Thus `ignoreRestSiblings` is **not enabled**: it exempts unmarked names wholesale,
   * which is the opposite direction.
   *
   * Pre-enable measurement (2026-08-06): The warnings eliminated by this exemption are
   * **3**, all at the locations mentioned above. Unmarked unused variables remain caught —
   * the probe in `tests/contract/lint-warning-ratchet.contract.test.ts`
   * (`const unusedByProbe = 1;`) proves this every time.
   */
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    // Temporary git worktree for agent parallel tasks — its own lint runs in each worktree.
    // If the main lint scans into this, code from other sessions mixes in as noise.
    '.claude/worktrees/**',
    // Directory for QA agent artifacts only (gitignored) — prevents recurrence of leftover
    // investigation scripts breaking the main lint gate.
    '.qa-scratch/**',
    'out/**',
    'build/**',
    'src-tauri/target/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
