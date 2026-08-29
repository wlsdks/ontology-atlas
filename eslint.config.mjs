import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// Enforce FSD layer boundaries at the lint stage. Written with official
// `boundaries/dependencies` + v7 entity selectors/policies (2026~).
//   Docs: https://www.jsboundaries.dev/docs/rules/dependencies/

// ── Design Charter §11 (existing): prohibit scale hover · purple-pink gradient ──────
// The selector array below is reused across multiple config objects. In flat config, declaring the same
// rule multiple times results in the last one "overwriting" (not array merging), so any config adding a size ramp
// rule must also include this selector to ensure the scale/gradient guard is not lost
// in that file.
const scaleGradientSelectors = [
  /*
   * **Glassmorphism prohibited — documented but no rule existed** (audit before 2026-08-17 release).
   *
   * Both the "Design" section of `forbidden.md` and the absolute prohibition list in `DESIGN-SYSTEM.md`
   * pinned down `backdrop-blur-*`, but there was no rule to catch it. When enabled, there were 0 live
   * violations (the three caught by code were all **comments** stating "this is prohibited").
   * So enabling it now produces zero noise and only blocks future intrusions.
   */
  {
    selector: "Literal[value=/(^|\\s|:)backdrop-blur/]",
    message:
      '디자인 헌장 — glassmorphism 금지. 뒤를 흐리는 대신 불투명 표면 토큰(--color-panel/elevated)이나 색 알파(--color-overlay-*)를 쓴다.',
  },
  {
    selector: "TemplateElement[value.raw=/(^|\\s|:)backdrop-blur/]",
    message:
      '디자인 헌장 — glassmorphism 금지 (template literal). 불투명 표면 토큰 또는 색 알파로.',
  },
  {
    selector: "Literal[value=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지. bg/border 변경 또는 색 alpha 로 대체.',
  },
  {
    selector:
      "TemplateElement[value.raw=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지 (template literal). bg/border 변경으로 대체.',
  },
  {
    selector: "Literal[value=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지. 단일 인디고 또는 무채색만.',
  },
  {
    selector:
      "TemplateElement[value.raw=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지 (template literal).',
  },
  {
    // Canvas 2D glow — `ctx.shadowBlur = n`. The charter (forbidden.md) prohibits
    // glow/neon/halo globally in the app, with only **one exception** (static · opt-in · default 0 · max 6px)
    // for footprint trail blur. That single case lives only in
    // `shared/lib/footprint-glyph.ts`, and this selector enforces that fact.
    //
    // Why a rule is needed: Canvas glow uses **API calls, not class strings**, so it falls
    // outside the view of existing value rules (the `shadow-[…]` geometric allowlist). If a new canvas surface
    // writes one line of shadowBlur, no gate catches it and it enters quietly.
    selector: 'MemberExpression[property.name="shadowBlur"]',
    message:
      'canvas 글로우 금지 (forbidden.md). 유일한 예외는 발자국 트레일 번짐이고 shared/lib/footprint-glyph.ts 안에서만 산다.',
  },
  /*
   * Checkbox accent — the canonical brand is the only one (approved in the "System" section on 2026-08-15).
   *
   // Before enabling, a full sweep found accents-[ 6 locations split into three types — brand 4 · accent(#7170ff) 1 ·
   * **undefined (UA default color) 1** (current violation of the "no multiple color systems" rule). All 6 locations were migrated to the Checkbox primitive (`shared/ui/checkbox.tsx`) before enabling — upon enabling, violations dropped to 0. Zero exempt files designed (precedent: disabled:opacity): only brand token references are allowed through, so the primitive itself remains under this rule.
   */
  {
    selector: 'Literal[value=/accent-\\[(?!color:var\\(--color-indigo-brand\\))/]',
    message:
      '체크박스 accent 는 --color-indigo-brand 하나다 — 직접 쓰지 말고 Checkbox(shared/ui/checkbox.tsx)를 쓴다. 근거: 2026-08-15 체계석 비준(docs/DECISIONS.md).',
  },
  {
    selector: 'TemplateElement[value.raw=/accent-\\[(?!color:var\\(--color-indigo-brand\\))/]',
    message:
      '체크박스 accent 는 --color-indigo-brand 하나다 (template literal) — Checkbox 프리미티브를 쓴다.',
  },
];

// ── Indigo Ink License (2026-08-03 Che Gye-seok) ────────────────────────
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
  'var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--chrome|var\\(--git|inset';

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
      '고도 사다리 이탈 (인라인 style) — 그림자의 **기하**도 토큰이 정한다. --shadow-elevation-1/2/3 (coach-mark < popover < dialog), 가장자리 도킹은 -dock-bottom/-dock-side, 눌린 컨트롤은 --shadow-control-press. 인라인 스타일은 클래스 셀렉터에 안 걸리므로 여기서 막는다.',
  },
  {
    selector: `Property[key.name="boxShadow"] TemplateElement[value.raw=/${SHADOW_INLINE_LAYER_VIOLATION}/]`,
    message:
      '고도 사다리 이탈 (인라인 style, template literal) — --shadow-elevation-* / -dock-* / --shadow-control-press 를 참조한다.',
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
      '인라인 style 의 크기·반경 하드코딩 금지 — 클래스가 안 생겨 램프 룰이 못 보는 층이다. 크기는 타입 램프 유틸리티(클래스)로, 반경은 radius 램프로, CSS 변수가 닿지 않는 표면(Satori·canvas)만 eslint-disable + 사유.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(fontSize|borderRadius)$/] ConditionalExpression > Literal:not([raw=/var\\(/])',
    message:
      '인라인 style 의 크기·반경 하드코딩 금지 (삼항 가지) — 조건이 갈려도 두 가지 모두 램프를 탄다.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(fontSize|borderRadius)$/] > TemplateLiteral:not(:has(TemplateElement[value.raw=/var\\(/]))',
    message:
      '인라인 style 의 크기·반경 하드코딩 금지 (template literal) — 토큰을 var() 로 참조하지 않는 조립 문자열은 램프 밖이다.',
  },
  {
    selector: 'JSXAttribute[name.name="style"] Property[key.name="fontSize"] > Literal[value=/var\\(--text-/]',
    message:
      '타입 램프 토큰을 인라인 fontSize 로 우회 참조 금지 — 크기만 얻고 그 단이 싣는 행간 짝을 잃는다. 램프 유틸리티(클래스)를 쓴다. 램프 밖 표면 전용 크기 토큰은 이 룰에 걸리지 않는다.',
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
      'button/summary 의 pointer 커서는 app/globals.css 의 base 규칙이 이미 정한다 — 여기 다시 적으면 중복이고, 중복이 쌓이면 다음 사람이 «여기만 특별한가» 를 매번 다시 판단한다. 지워라. 중앙 규칙이 안 닿는 원소(li[role=option] · label · 클릭되는 카드 등)에서는 정당하다.',
  },
  {
    selector:
      'JSXOpeningElement[name.name=/^(button|summary)$/] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|[^-\\w])(enabled:)?cursor-pointer([^-\\w]|$)/]',
    message:
      'button/summary 의 pointer 커서는 base 규칙이 정한다 (template literal). 중복을 지워라.',
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
      '비활성 흐림 값은 값 층이 정한다 — disabled:opacity-55 (control-class.ts CONTROL_DISABLED_CLASS). controlClass/fieldClass 기반이면 base 가 이미 실으니 이 클래스를 지우고, 손 컨트롤이면 CONTROL_DISABLED_CLASS 를 조합하라. 근거: tests/contract/disabled-affordance.contract.test.ts',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])((aria-|group-|peer-)?disabled):opacity-(?!55([^0-9]|$))/]',
    message:
      '비활성 흐림 값은 값 층이 정한다 (template literal) — disabled:opacity-55 하나. 손 컨트롤은 CONTROL_DISABLED_CLASS 를 조합하라.',
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
      '행간도 램프다. 이름 붙은 Tailwind 행간 스텝 금지 — --leading-caption/label/body/body-lg/title/display/hero 짝과 --leading-display-tight/prose 를 쓴다. 크기 스텝이 자기 행간을 함께 싣는 자리라면 행간 클래스 자체가 필요 없다.',
  },
  {
    selector:
      "TemplateElement[value.raw=/(^|\\s|:)leading-(relaxed|snug|none|tight|loose|[3-9]|10)(\\s|$)/]",
    message:
      '행간도 램프다. 이름 붙은 Tailwind 행간 스텝 금지 (template literal). --leading-* 램프가 만드는 유틸리티로.',
  },
  {
    selector: 'Literal[value=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message:
      '자간도 램프다. 대문자 마이크로 라벨은 --tracking-caps-08/10/12/14/16, 본문 짝은 --tracking-caption/label/body/body-lg/title, 큰 제목은 --tracking-display/hero/section/card 를 쓴다. 램프 밖 값이 필요하면 스텝을 등재하는 PR 을 먼저 낸다.',
  },
  {
    selector: 'TemplateElement[value.raw=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message: '자간도 램프다 (template literal). --tracking-* 토큰을 쓴다.',
  },
  {
    selector: 'Literal[value=/font-\\[[0-9]+\\]/]',
    message:
      '글자 무게도 램프다. --font-weight-signature(510) · -emphasis(560) · -strong(650) 셋뿐이다. 숫자를 직접 적으면 그 의도가 이름 없이 산다.',
  },
  {
    selector: 'TemplateElement[value.raw=/font-\\[[0-9]+\\]/]',
    message: '글자 무게도 램프다 (template literal). --font-weight-* 를 쓴다.',
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
      '이름 있는 Tailwind 무게 스텝 금지 — 램프는 --font-weight-signature(510) · -emphasis(560) · -strong(650) 셋뿐이다. 제목 역할(h1~h6 · <b>/<strong> · 다이얼로그 제목 · display 이상 크기)은 strong, 그 밖의 인라인 강조는 emphasis 를 쓴다. 강조를 끄는 자리는 font-normal 이 맞다.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])font-(thin|extralight|light|medium|semibold|bold|extrabold|black)([^-\\w]|$)/]',
    message:
      '이름 있는 Tailwind 무게 스텝 금지 (template literal). --font-weight-signature/-emphasis/-strong 을 쓴다.',
  },
  {
    selector:
      'Literal[value=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message:
      'Tailwind 기본 팔레트 금지 — 헌장은 무채색 + 인디고 하나다. --color-* 토큰을 쓴다. ⚠️ 값이 아니라 **자리**가 토큰을 정한다: 인디고 면 위 흰 글자는 --color-text-primary 가 아니라 --color-text-on-accent 다(전자는 4.42:1 로 AA 미달).',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message: 'Tailwind 기본 팔레트 금지 (template literal). --color-* 토큰을 쓴다.',
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
const layerSelectors = [
  {
    selector: 'Literal[value=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message:
      '층위 20 이상은 앱 전역 계약이다 — 숫자를 직접 적지 말고 --z-* 사다리를 쓴다(surface-sticky < map-hint < map-scrim < map-popover < overlay-chrome < dialog-scrim < dialog < tour < tour-card < tooltip < skip-link). 한 표면 안에서만 유효한 지역 쌓임은 20 미만으로 쓴다.',
  },
  {
    selector: 'TemplateElement[value.raw=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message: '층위 20 이상은 --z-* 사다리를 쓴다 (template literal).',
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
      '인디고/앰버 틴트 채움 위 잉크는 tone accent(#7170ff, 합성 대비 3.5~4.4:1 — AA 미달)가 아니라 accentOnTint 다. 삼항식 가지도 같다. 근거: tests/contract/accent-ink-contrast.contract.test.ts',
  },
  {
    selector:
      'JSXOpeningElement:has(:matches(JSXAttribute[name.name="tone"] > Literal[value="accent"], JSXAttribute[name.name="tone"] JSXExpressionContainer ConditionalExpression > Literal[value="accent"])):has(JSXAttribute[name.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      '인디고/앰버 틴트 채움 위 잉크는 tone="accent"(#7170ff, AA 미달)가 아니라 tone="accentOnTint" 다. 삼항식 가지(tone={cond ? "accent" : …})도 같다. 근거: tests/contract/accent-ink-contrast.contract.test.ts',
  },
];

/*
 * ── Gateway FX namespace seal (2026-08-18, gateway landing remake) ──────────────
 *
 * `--gateway-fx-*` tokens and `gateway-fx-*` classes are the surface of **the one explicit exception** to the charter's "no moving gradient background" ban (`.claude/rules/forbidden.md`).
 * The way to prevent exceptions from becoming convention is like footprint spread — lock consumption points by file path: `src/views/download/** Only ` and `app/globals.css` (token definitions).
 *
 * This selector is loaded in all scope blocks, and only the gateway view's own scope block (below)
 * excludes this while reloading all others. The value layer gate is
 * `tests/contract/gateway-fx-exception.contract.test.ts` — it scans the filesystem directly,
 * so even if this selector dies, that test catches it.
 */
const gatewayFxScopeSelectors = [
  {
    selector: 'Literal[value=/gateway-fx/]',
    message:
      '관문 FX(전류장·그레인·커서 링)는 관문 랜딩 한정 예외다 — --gateway-fx-* / gateway-fx-* 는 src/views/download/** 밖에서 쓰지 않는다. 근거: forbidden.md 「움직이는 그라디언트 배경」 예외 · tests/contract/gateway-fx-exception.contract.test.ts',
  },
  {
    selector: 'TemplateElement[value.raw=/gateway-fx/]',
    message:
      '관문 FX 는 관문 랜딩 한정 예외다 (template literal) — src/views/download/** 밖 사용 금지.',
  },
];

// ── Geometry & Type Codex (R5) Blockade ─────────────────────────────────
// Arbitrary classes like text-[Npx] / rounded-[Npx] are prohibited — docs/DESIGN-SYSTEM.md
// Express only via the "Geometry & Type Codex" ramp (text-caption…text-hero / rounded-chip…panel).
// Intentional exceptions outside the ramp must be explicitly marked with `// eslint-disable-next-line
// no-restricted-syntax -- <reason>`. Migrated directories = error,
// incomplete (topology-map-v2 · views/home) = warn.
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
   * Che Gye-seok's prescription on 2026-08-03 established gates for these holes:
   *
   * - `rounded-sm`(4px) and un-suffixed `rounded`(4px, 37 instances) were **not drift
   *   but steps missing from the ramp** — a value repeating 96 times is not an exception.
   *   After listing `--radius-micro`(4px) and performing full machine replacement (pixel shift 0), we
   *   enabled the selector below (violations 0 upon enabling).
   * - `rounded-2xl`(19) · `text-base|lg|xl|2xl|3xl`(total 8) require pixel-moving replacements,
   *   needing per-location judgment — a per-family ratchet
   *   (`tests/contract/named-offramp-utility-ratchet.contract.test.ts`) keeps movement only below the baseline. This ratchet counts named utilities and **does not skip covered directories** — `ARBITRARY_SIZE` ratchet
   *   skips covered directories by looking only at bracket patterns, correcting this hole that was long false (12 instances initially, then 20, yet nothing turned red).
   */
  {
    selector: 'Literal[value=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 타입 스텝 금지(램프 우회). text-caption/label/body/body-lg/title/display/hero 로.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 타입 스텝 금지 (template literal). text-* 램프로.',
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
      'Geometry Codex — Tailwind 기본 radius 스텝 금지(램프 우회). rounded-micro/chip/card/panel/sheet 로.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?(sm|md|lg|xl)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 radius 스텝 금지 (template literal). rounded-* 램프로.',
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
      'Geometry Codex — Tailwind 이름 스텝 금지(램프 우회). 반경은 rounded-micro/chip/card/panel/sheet, 크기는 text-caption/label/body/body-lg/title/display/hero 로.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])(rounded-(xs|2xl|3xl)|text-(base|lg|xl|2xl|3xl|4xl))([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 이름 스텝 금지 (template literal). 램프 토큰으로.',
  },
  {
    selector: 'Literal[value=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex — 무접미 rounded(4px) 금지(램프 우회). 같은 4px 은 rounded-micro 다.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex — 무접미 rounded(4px) 금지 (template literal). rounded-micro 로.',
  },
  {
    selector: 'Literal[value=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지. text-caption/label/body/body-lg/title/display/hero 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지 (template literal). text-* 램프로.',
  },
  {
    selector:
      'Literal[value=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지(방향 접미 포함). rounded-chip/card/panel/sheet 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector:
      'TemplateElement[value.raw=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지 (template literal). rounded-* 램프로.',
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
      '고도 사다리 이탈 — 그림자의 **기하**도 토큰이 정하고, 판정은 **레이어 하나하나**에 대해 한다. --shadow-elevation-1/2/3 (coach-mark < popover < dialog), 가장자리 도킹은 -dock-bottom/-dock-side, 눌린 컨트롤은 --shadow-control-press. inset 헤어라인은 재질이라 허용되지만, 그 옆 레이어까지 면제해 주지는 않는다 — 정상 레이어 한 겹이 손으로 쓴 고도 그림자를 세탁하던 것이 2026-08-06 에 막힌 구멍이다.',
  },
  {
    selector: `TemplateElement[value.raw=/${SHADOW_CLASS_LAYER_VIOLATION}/]`,
    message:
      '고도 사다리 이탈 (template literal) — 레이어마다 판정한다. --shadow-elevation-* / -dock-* / --shadow-control-press 를 쓴다.',
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
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지. --color-* 토큰을 var() 로 참조한다. CSS 변수가 닿지 않는 표면(Canvas·next/og·standalone HTML)은 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지 (template literal). --color-* 토큰을 var() 로.',
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
      '모션 예산 — 호버/포커스로 트리거되는 고빈도 표면에 이동(base)/확정(settle) 예산을 쓰지 않는다. fast 램프 토큰으로 강등하거나, 고빈도가 아니라는 근거를 eslint-disable 주석에 남긴다.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(?:hover|focus-within|focus-visible):[^`]*duration-\\[var\\(--motion-(?:base|settle)\\)\\]|duration-\\[var\\(--motion-(?:base|settle)\\)\\][^`]*(?:hover|focus-within|focus-visible):/]',
    message:
      '모션 예산 — 호버/포커스 고빈도 표면에 이동/확정 예산 금지 (template literal). fast 램프로 강등한다.',
  },
  {
    selector: 'Literal[value=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지. 기본(--motion-fast, 확인)이면 duration 클래스를 생략하고, 표면 이동은 --motion-base, 확정은 --motion-settle 을 duration 유틸리티 안에서 var() 로 참조한다.',
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
      '모션 duration 하드코딩 금지 — 애니메이션 단축 문법 안의 시간도 램프를 탄다. --motion-fast/base/settle 와 --motion-ease 를 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/animate-\\[[^\\]]*_[0-9.]+m?s/]',
    message:
      '모션 duration 하드코딩 금지 — 애니메이션 단축 문법 안의 시간 (template literal). --motion-* 토큰을 var() 로.',
  },
  // 2026-07-28 duration's **bracket form** — the `duration-<number>` rule only sees utility number suffixes. `duration-[180ms]` is outside that regex since it's in brackets,
  // and doesn't hit the ramp bypass rule (referencing ramp tokens as arbitrary length). Measured 1 instance (document sidebar width transition) replaced and enabled — 0 violations, total unchanged.
  // Token-reference types (`duration-[var(--motion-base)]`) don't start with numbers so they don't hit this regex.
  {
    selector: 'Literal[value=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      '모션 duration 하드코딩 금지 — 대괄호 안의 시간도 램프를 탄다. --motion-fast/base/settle 을 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      '모션 duration 하드코딩 금지 — 대괄호 안의 시간 (template literal). --motion-* 토큰을 var() 로.',
  },
  // 2026-07-28 Tailwind **named shadows** — defined the high ladder (`--shadow-elevation-1/2/3`)
  // but the rule only saw arbitrary values, so framework defaults like `shadow-2xl` lived outside the ladder. Full sweep measured 6 instances all in sheet/dialog (= dialog tier), replaceable in one PR, and 0 violations · total unchanged after replacement.
  // `shadow-none` is excluded from the list as a justified declaration of "no shadow".
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      '고도 사다리 이탈 — Tailwind 기본 그림자 대신 --shadow-elevation-1/2/3 (coach-mark < popover < dialog) 을 shadow 유틸리티 안에서 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      '고도 사다리 이탈 (template literal) — --shadow-elevation-* 토큰을 var() 로 참조한다.',
  },
  // 2026-07-28 colored halos — `design.md` banned "glow-like boxShadow `0 0 ...` ring" by name, but the shadow rule exempted values with `var(` entirely,
  // so the active indicator on the bottom tab bar lived with an indigo halo of `0 0 12px`.
  // **The reason the exemption was justified works in reverse here** — the exception meant to save normal token references also saved glows used as tokens.
  //
  // Discrimination is by color: monochrome shadow tokens (`--color-shadow-*`) `0 0` spread are justified ambient shadows for large surfaces like side drawers (measurement: 2 instances, both drawers).
  // Other color tokens' `0 0` are halos around marks — banned targets (measurement: 1 instance, replacement complete). Narrowed after, 0 violations · lint total unchanged.
  // ⚠️ Ban literal utility syntax in messages — Tailwind v4 scanner scans this file.
  {
    selector: 'Literal[value=/shadow-\\[0_0_(?!0[_\\]])[^\\]]*var\\(--color-(?!shadow-)/]',
    message:
      '디자인 헌장 — 마크 둘레의 색 있는 헤일로 금지 (glow ring). 대비가 부족하면 헤일로가 아니라 선/면의 값을 올린다. 무채색 그림자 토큰의 확산 그림자는 예외.',
  },
  {
    selector: 'TemplateElement[value.raw=/shadow-\\[0_0_(?!0[_\\]])[^\\]]*var\\(--color-(?!shadow-)/]',
    message:
      '디자인 헌장 — 마크 둘레의 색 있는 헤일로 금지 (template literal). 무채색 그림자 토큰의 확산 그림자는 예외.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지 (template literal). --motion-fast/base/settle 토큰으로.',
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
      '행간 하드코딩 금지. --leading-caption 부터 --leading-prose 까지 9단 램프가 만드는 유틸리티로 쓴다 (크기 스텝과 1:1 짝). 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/leading-\\[[0-9.]+\\]/]',
    message:
      '행간 하드코딩 금지 (template literal). --leading-* 램프 토큰이 만드는 유틸리티로.',
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
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지. 램프 유틸리티(text-<스텝>)를 직접 쓴다 — 우회하면 크기만 얻고 그 단이 싣는 행간 짝을 잃는다. 램프 밖 크기 토큰(레일·크롬 전용)은 이 룰에 걸리지 않는다.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[length:var\\(--text-/]',
    message:
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지 (template literal). 램프 유틸리티를 직접 쓴다.',
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
      'framer transition duration 리터럴 금지 — `@/shared/motion` 의 램프 거울(MOTION.fast/base/settle)을 import 한다. 램프 밖 값이 필요하면 먼저 CSS 램프에 등재하고 거울 계약 테스트를 넓힌다.',
  },
  {
    selector:
      'JSXAttribute[name.name="transition"] ObjectExpression > Property[key.name="ease"] > :matches(ArrayExpression, Literal)',
    message:
      'framer transition ease 리터럴 금지 — `MOTION_EASE`(= --motion-ease 의 값 복사)를 쓴다. 램프 duration 을 받는 원소는 이징도 같은 패밀리로 간다.',
  },
  // 2026-08-27 inline style time literals — **the third syntax of the duration rule.**
  // The class rules above see className strings and the framer rule sees `transition={{...}}`,
  // but a JSX `style` object was outside every detector: /motion-verify measured a raw
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
      '모션 시간 하드코딩 금지 — JSX style 객체 안의 리터럴 시간값(딜레이·지속시간·커스텀 프로퍼티)도 램프를 탄다. --motion-fast/base/settle 을 var() 로 참조하고, 스태거는 단위 없는 스텝 커스텀 프로퍼티에 숫자만 싣고 시간은 CSS 쪽 calc(var(--*-stagger) * step) 이 만든다.',
  },
  {
    selector:
      'JSXAttribute[name.name="style"] Property[key.name=/^(animation|transition)$/] Literal[value=/(^|[^-\\w(])[0-9.]+m?s([^-\\w]|$)/]',
    message:
      '모션 시간 하드코딩 금지 — JSX style 의 animation/transition 단축 문법 안에 박힌 리터럴 시간도 램프를 탄다. --motion-fast/base/settle 과 --motion-ease 를 var() 로 참조한다.',
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

// Prevent regression of local-first first paint firebase 0 promise (after PR #99).
//
// The main barrel for `@/entities/<x>` must have no firebase dependency (type / lib /
// pure helper only). Firestore subscription/mutation functions should be imported directly via `@/entities/<x>/api` so chunks download only at cloud-mode entry points.
//
// Importing the names below in the main barrel blocks with "use api path" message. When adding new api functions, never export them in the main barrel either — if you do, add the names to this list to block regression.
//
// **Reason for shared array**: flat config does not merge options but **replaces** them when redefining the same rule later. If a narrower scope block lists only its own restrictions, this firestore guard quietly disappears from that path. Scope blocks must always spread this array before adding their own items.
//
// Details: `@.claude/rules/architecture.md`.
const firestoreApiRestrictedPaths = [
  {
    name: '@/entities/project',
    importNames: [
      'listProjects',
      'getProject',
      'upsertProject',
      'upsertProjectPositions',
      'deleteProject',
      'deleteProjects',
      'subscribeProjects',
      'fetchAllProjectsAtBuild',
      'uploadScreenshot',
      'deleteScreenshot',
    ],
    message:
      "firestore api 는 '@/entities/project/api' 로 직접 import 하세요 (local-first 첫 paint 청크 firebase 0 보장).",
  },
  {
    name: '@/entities/category',
    importNames: [
      'subscribeCategories',
      'upsertCategory',
      'deleteCategory',
      'seedDefaultCategoriesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/category/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/status',
    importNames: [
      'subscribeStatuses',
      'upsertStatus',
      'deleteStatus',
      'seedDefaultStatusesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/status/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/admin',
    importNames: ['isAdmin'],
    message: "firestore api 는 '@/entities/admin/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-class',
    importNames: [
      'subscribeOntologyClasses',
      'upsertOntologyClass',
      'seedDefaultOntologyClassesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-class/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-relation',
    importNames: [
      'subscribeOntologyRelations',
      'upsertOntologyRelation',
      'seedDefaultOntologyRelationsIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-relation/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/knowledge-graph',
    importNames: [
      'listKnowledgeProjectInsight',
      'subscribeKnowledgeProjectInsight',
      'subscribeKnowledgePublicGraph',
      'subscribeKnowledgeApprovedGraph',
      'subscribeKnowledgePublicMeta',
      'addManualKnowledgeNode',
      'addManualKnowledgeEdge',
    ],
    message:
      "firestore api 는 '@/entities/knowledge-graph/api' 로 직접 import 하세요. (lazy hook `useKnowledgePublic*` 은 메인 barrel 그대로 OK.)",
  },
];

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
  // Firestore api path guard — list source is `firestoreApiRestrictedPaths`.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: firestoreApiRestrictedPaths }],
    },
  },
  // Domain capacity bars do not use the kind palette (owner confirmed 2026-07-26,
  // 2026-07-26 owner confirmation — measurements and evidence are in `.claude/rules/design.md` 「Bar Coloring」 section. Original work file is gitignored in `.qa-scratch/`, so not in the repo).
  //
  // The two pieces of this bar already carry identity via order (capacity increases left) + unit word + adjacent number. Adding kind color on top would be redundant ink; moreover, that pair (amber rgba(211,159,73) · eucalyptus rgba(124,166,141)) has a track composite contrast of 1.14:1, so they are distinguished only by hue, not brightness — the axis most difficult for red-green color blindness to distinguish. So it was lowered to the app-wide bar syntax (achromatic + one indigo + 1px core).
  //
  // Without this rule, this spec is not maintained — `getOntologyKindTone` reverts to a one-line import. The kind palette remains only in places where color carries identity (**the only** channel: unlabeled stacks in type census, map dots, tree chips).
  //
  // ⚠️ Flat config does not merge rule options but **replaces** them — spread the same array to prevent the above block's firestore guard from disappearing from this path.
  {
    files: ['src/widgets/domain-capacity-bar/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: firestoreApiRestrictedPaths,
          patterns: [
            {
              group: ['@/entities/ontology-class', '@/entities/ontology-class/**'],
              message:
                '도메인 용량 막대는 kind 팔레트를 쓰지 않습니다 — 조각의 정체는 순서·단위어·숫자가 나르고, 채색은 `--color-indigo-brand` + `--color-text-quaternary` + 1px 심입니다. 근거: `.claude/rules/design.md` 「막대 채색」 문단(2026-07-26 소유자 확정).',
            },
          ],
        },
      ],
    },
  },
  // Design Charter §11 (CLAUDE.md) automatic blocking.
  // - Prohibit scale hover (`hover:scale-*` `active:scale-*` etc)
  // - Prohibit purple-pink gradients (`from-purple-*` `to-pink-*` combinations)
  // - Glassmorphism: handled separately (current code usage 0).
  // Violations cause lint error — code PR cannot pass.
  {
    files: ['src/**/*.{ts,tsx,jsx,js}', 'app/**/*.{ts,tsx,jsx,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...accentTintPairingSelectors,
        // Ramp debt files also receive this block — inline shadows are a ladder issue, not
        // ramp issue, so they must not be exempted along with debt exemption.
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...gatewayFxScopeSelectors,
      ],
    },
  },
  // Ramp blockade — `src/**` + `app/**` **all** error, except legacy debt files.
  // Also load scale/gradient selectors to prevent their guard from being overwritten by flat config.
  //
  // Excluded files are not defenseless — the scale/gradient · accent tint guards from the global block above (`src/**`+`app/**`) still apply. What is excluded is only the ramp (type/radius/line-height/motion/shadow) selectors, and that debt is held by the `tests/contract/type-ramp-coverage.contract.test.ts` ratchet.
  {
    files: rampCoveredGlobs,
    ignores: [...codexTestIgnores, ...rampDebtExemptions],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...gatewayFxScopeSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
      ],
    },
  },
  // One charter exception — footprint trail smearing (static · opt-in · default 0 · cap 6px).
  //
  // ⚠️ **This block must come after the two ramp blocks above.** The flat config does not
  // merge rule
  // option arrays but replaces them, so placing it earlier would reactivate the shadowBlur selector via `rampCoveredGlobs`(which
  // includes this file), nullifying the exception — empirically,
  // we found one additional warning.
  //
  // By narrowing the exception to **a single file**, lint will alert first
  // the moment a second consumer appears. This arrangement prevents the corruption of exceptions spreading by convention.
  {
    files: ['src/shared/lib/footprint-glyph.ts'],
    rules: {
      'no-restricted-syntax': [
        /*
         * ⚠️ **It is `error` — previously it was `warn`, and that was not a gate.**
         *
         * Exceptions are precisely output by the single line `.filter(…shadowBlur)` below. However,
         * if the level is also lowered to `warn`, **all remaining selectors** (arbitrary size ·
         * accent tint · scale/gradient) become powerless only in this file. Moreover,
         * `pnpm lint` has no `--max-warnings`, so exit 0 regardless of warning count.
         *
         * 2026-08-04 audit measurement: planting `text-[13px] rounded-[7px]` in this file and
         * running `pnpm lint` resulted in «94 problems (0 errors, 94 warnings)», **passing**. We left the entire gate open for one exception.
         *
         * Pre-enable census: violations in this file are **0**, so promotion cost is 0.
         */
        'error',
        ...scaleGradientSelectors.filter((rule) => !rule.selector.includes('shadowBlur')),
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // 2026-08-05: The four below were missing — this block itself was stepping in the trap warned about in the comment above.
        // Exceptions should be only the `shadowBlur` line, but type axis · layer · inline shadow · cursor were all turned off. Census 0, so enabling cost is 0.
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...gatewayFxScopeSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
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
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...gatewayFxScopeSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
      ],
    },
  },
  // Prohibit `--color-amber-docs-*` isolation tokens in settings sheet (2026-08-02, Design
  // Council S3 · Che Gye-seok).
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
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // 2026-08-05: This block was also stepping in the same trap. The comment above correctly warned to «reload ramp selectors» but only loaded `arbitrarySize`, so weight/spacing/palette/layer were **never enforced** in this directory (including the three axes enabled by #940). Confirmed via probe:
        // `font-semibold`·`tracking-[…]`·`text-white` in this path passed with 0 error. Census 0, so enabling cost is 0.
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...gatewayFxScopeSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        {
          selector: 'Literal[value=/color-amber-docs-/]',
          message:
            '설정 시트에서 docs 표면 장식용 quarantine 앰버를 쓰지 않는다. 경고 신호는 --color-amber-source-* (면·보더) 와 --color-amber-source-text-* (글자) 사다리를 쓴다 — 한 배지 안에서 두 앰버 계보가 섞이면 신호가 아니라 장식으로 읽힌다.',
        },
        {
          selector: 'TemplateElement[value.raw=/color-amber-docs-/]',
          message:
            '설정 시트에서 docs 표면 장식용 quarantine 앰버를 쓰지 않는다 (template literal). --color-amber-source-* / --color-amber-source-text-* 사다리를 쓴다.',
        },
      ],
    },
  },
  /*
   * **Sole consumer** of gateway FX exceptions — `src/views/download/**` (2026-08-18).
   *
   // Exclude only gatewayFxScopeSelectors and **reload all others** — flat config
   // does not merge rule option arrays, so missed selectors quietly die in this
   // directory (same discipline as footprint-glyph · Satori block). It must come after the ramp blocks above.
   */
  {
    files: ['src/views/download/**/*.{ts,tsx}'],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...inlineSizeSelectors,
        ...cursorAffordanceSelectors,
        ...disabledAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
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
