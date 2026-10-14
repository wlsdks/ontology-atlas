import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// Enforce FSD layer boundaries at the lint stage. Written with official
// `boundaries/dependencies` + v7 entity selectors/policies (2026~).
//   Docs: https://www.jsboundaries.dev/docs/rules/dependencies/

// The array is reused across config objects: a later `no-restricted-syntax` replaces, never
// merges, so every block that adds a ramp rule must spread this too.
const checkboxAccentSelectors = [
  {
    selector: 'Literal[value=/accent-\\[(?!color:var\\(--color-indigo-brand\\))/]',
    message:
      'The checkbox accent is the single --color-indigo-brand token; use Checkbox (shared/ui/fields/checkbox.tsx) instead of styling it directly (docs/DECISIONS.md).',
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

// `accent` (#7170ff) is AA only on the darkest backgrounds; on indigo/amber tints contrast falls
// to 3.5-4.4, so tinted controls use `accentOnTint`. Only literal pairings in one call/element are
// seen; constants are covered by tests/contract/design-tokens/accent-ink-contrast.contract.test.ts.
/*
 * Inline `style={{ boxShadow }}` creates no class, so className selectors cannot see it. Loaded in
 * both global and ramp blocks: flat config replaces rule options, never merges. Allowed values
 * must reference ladder, docking, pressing or surface tokens, not any `var(`.
 */
const ALLOWED_SHADOW_TOKEN =
  'var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--map-|var\\(--chrome|var\\(--git|inset';

/**
 * Judged per layer: split by commas, flag when at least one layer lacks an allowed mark.
 * `[a-zA-Z(]` keeps numeric fragments of `rgba(0,0,0,.2)` from counting. `var()` fallbacks
 * containing commas false-positive; fixing that needs a parser, not regex.
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
 * Inline `fontSize`/`borderRadius` create no class, so ramp rules cannot see them. `var(` passes
 * for surface tokens; `--text-*` is blocked separately. `opengraph-image.tsx`/`twitter-image.tsx`
 * are drawn by Satori, which has no CSS variables, so a later block reloads all but this array.
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
 * Only `button`/`summary` with a literal `cursor-pointer` are flagged: the base rule in
 * `app/globals.css` already sets it. Other cursor uses (options, labels, cards, SVG) are
 * legitimate; `cn()` output is covered by tests/e2e/design-audits/cursor-affordance.spec.ts.
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
 * Blocks any `disabled:opacity-*` other than 55, the value in `CONTROL_DISABLED_CLASS`.
 * `disabled-affordance.contract.test.ts` compares both, so moving one turns this red.
 */
const disabledAffordanceSelectors = [
  {
    selector:
      'Literal[value=/(^|[^-\\w])((aria-|group-|peer-)?disabled):opacity-(?!55([^0-9]|$))/]',
    message:
      'The disabled opacity is owned by the value layer: disabled:opacity-55 (CONTROL_DISABLED_CLASS in control-class.ts). Remove this class if the element builds on controlClass/fieldClass, which already applies it; for a hand-built control, compose CONTROL_DISABLED_CLASS. See tests/contract/controls/disabled-affordance.contract.test.ts',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])((aria-|group-|peer-)?disabled):opacity-(?!55([^0-9]|$))/]',
    message:
      'The disabled opacity is owned by the value layer (template literal): disabled:opacity-55 only. Hand-built controls compose CONTROL_DISABLED_CLASS.',
  },
];

/*
 * Closes three axes: `tracking-[…em]` (use `--tracking-*`), `font-[NNN]` (use `--font-weight-*`)
 * and Tailwind palette utilities. White text on indigo is `--color-text-on-accent`;
 * `--color-text-primary` there drops contrast to 4.42 and fails AA.
 */
const typographyAxisSelectors = [
  /*
   * Named leading utilities (`leading-relaxed` etc.) are banned by the line-height ramp in
   * `design.md`, not only bracket forms.
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
   * Named weight steps are banned; `font-normal` (400) is allowed as the base weight, meaning "turn
   * off emphasis".
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
 * z-index 20+ is a global app contract with the `--z-*` ladder; lower values are local stacking
 * and are not checked.
 */
/*
 * Tailwind v4 `z-*` is dynamic, so `z-25` or `z-70` emits the same as `z-[N]`. Named 20/30/40/50
 * stay legal (design-gates.md). Other named values at or above 20 duplicate a `--z-*` token or
 * invent a step.
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
 * Direct-child matching misses ternaries such as `tone={cond ? "accent" : …}`, so pairs match
 * direct literals plus `ConditionalExpression > Literal` branches, which does not hit comparison
 * literals like `x === "accent"`.
 */
const accentTintPairingSelectors = [
  {
    selector:
      'CallExpression[callee.name="controlClass"] ObjectExpression:has(:matches(Property[key.name="tone"] > Literal[value="accent"], Property[key.name="tone"] ConditionalExpression > Literal[value="accent"])):has(Property[key.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      'Ink on an indigo/amber tint fill is accentOnTint, not the tone accent (#7170ff, composite contrast 3.5~4.4:1, below AA). Ternary branches are covered too. See tests/contract/design-tokens/accent-ink-contrast.contract.test.ts',
  },
  {
    selector:
      'JSXOpeningElement:has(:matches(JSXAttribute[name.name="tone"] > Literal[value="accent"], JSXAttribute[name.name="tone"] JSXExpressionContainer ConditionalExpression > Literal[value="accent"])):has(JSXAttribute[name.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      'Ink on an indigo/amber tint fill is tone="accentOnTint", not tone="accent" (#7170ff, below AA). Ternary branches (tone={cond ? "accent" : …}) are covered too. See tests/contract/design-tokens/accent-ink-contrast.contract.test.ts',
  },
];


// ── Geometry & Type Codex (R5) Blockade ─────────────────────────────────
// Arbitrary classes like text-[Npx] / rounded-[Npx] are prohibited — docs/DESIGN-SYSTEM.md
// Express only via the "Geometry & Type Codex" ramp (text-caption…text-hero / rounded-chip…panel).
// Intentional exceptions outside the ramp must be explicitly marked with `// eslint-disable-next-line
// no-restricted-syntax -- <reason>`. Migrated directories = error,
// incomplete (ontology-map · views/home) = warn.
/*
 * The hex gate sees only Tailwind arbitrary values; this also bans rgb()/rgba()/hsl() literals.
 * `rgba(${...` and `rgb(var(` suit canvas paint reading tokens at runtime, so a digit must follow
 * the paren. No literal utility syntax in messages: the Tailwind v4 scanner reads this file.
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
   * Tailwind v4 adds our ramps without replacing its base scale, so named classes like `text-sm` and
   * `rounded-md` pass the bracket selectors. `rounded-full` is excluded: circles are not a question
   * the radius ramp answers.
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
  /* Directional radius forms (`rounded-t-*` etc.) are in scope, or `rounded-r-md` would pass. */
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
   * Un-suffixed `rounded` (4px) is a Tailwind v4 alias the name-step selector misses; `:` as
   * delimiter also catches variant prefixes such as `[&_code]:rounded`.
   */
  /*
   * Tailwind's named type and radius steps are the ramp's last bypass; this covers the families that
   * had no selector (`rounded-xs`, `rounded-2xl`, `rounded-3xl`, `text-base` to `text-4xl`).
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
  // The ramp is in `rem` (`app/globals.css`) so text-only zoom reaches it; the px selectors cannot
  // see `text-[0.8125rem]`, so both spellings are banned.
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
  // Flag only shadows without an allowed token: a CSS variable reference is valid, so a blanket ban
  // floods lint. Allowed: ladder (elevation-*/dock-*), press, surface tokens (topology/chrome/git),
  // inset hairline. No literal utility syntax in messages: the Tailwind v4 scanner reads this file.
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
  // Preventive gate scoped to Tailwind arbitrary values: remaining hex literals are fixtures,
  // comments and surfaces CSS variables cannot reach (Satori, `viewport.themeColor`, standalone
  // HTML, mask stencil).
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
  // Motion budget is set by frequency: hover/focus surfaces are met dozens of times a day, so use a
  // fast token. Matches only when both coexist in one className string, all an AST rule can see. No
  // literal utility syntax in messages: the Tailwind v4 scanner reads this file.
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
  // Duration also hides in keyframe animation shorthand; token references start with `var(`, not a
  // digit, so they do not match. No literal utility syntax in messages: the Tailwind v4 scanner
  // reads this file.
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
  // The bracket form of a duration escapes the number-suffix rule; token references do not start
  // with a digit, so they do not match.
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
  // Tailwind named shadows sit outside the elevation ladder; `shadow-none` is allowed as an explicit
  // no-shadow. No literal utility syntax in messages: the Tailwind v4 scanner reads this file.
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
  // Arbitrary line heights only: ramp steps use no brackets, and named leading utilities are covered
  // by the typography axis selectors. No literal utility syntax in messages: the Tailwind v4 scanner
  // reads this file.
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
  // A ramp token through an arbitrary length gains the size but loses that step's paired
  // line-height. Mismatches in general: tests/contract/typography/type-ramp-leading-pair.contract.test.ts. No
  // literal utility syntax in messages: the Tailwind v4 scanner reads this file.
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
  // The duration rule sees only Tailwind class strings; framer `transition={{ duration }}` literals
  // would split JS motion constants from the CSS ramp.
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
  // JSX `style` objects bypass the class and framer rules: times on timing properties and `--*`
  // keys, and shorthand strings. Descendant `Literal` covers ternary branches. Template-literal
  // times are runtime-computed; see design-gates.md before widening.
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
 * Ramp coverage is a blocklist: every file under `src/**` and `app/**` is covered, with exceptions
 * listed per file. An allowlist left newly created directories with no ramp rules at all.
 */
export const rampCoveredGlobs = ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'];

/**
 * Files exempted from the ramp. The key is a file, never a directory glob, or new files beside it
 * would be exempt. tests/contract/typography/type-ramp-coverage.contract.test.ts checks the paths exist, debt
 * stays within the ledger, and the cover glob is not narrowed.
 */
export const rampDebtExemptions = [
  // Empty. A file put back here turns the ramp off for it; add a ramp step instead.
  // `type-ramp-coverage` runs ESLint itself to check that new paths receive every ramp selector.
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
  // Slice public API: import a slice through its `index.ts`, never through
  // `@/<layer>/<slice>/<segment>/...`. Tests keep deep access.
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
  // Ramp blocks cover `src/**` and `app/**` except debt files. Reload the checkbox accent selectors
  // so flat-config replacement cannot drop them. Excluded files still get the checkbox accent and
  // accent tint guards from the global block.
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
  // Surfaces a CSS variable cannot reach: JS indigo mirror, standalone popout HTML, canvas paint
  // fallbacks. A new file here needs the same reason. Must come after the ramp block: flat config
  // replaces the rule, so it reloads every ramp selector except `colorLiteralSelectors`.
  {
    files: [
      'src/shared/config/indigo-tokens.ts',
      'src/views/docs-vault/lib/doc-actions/popout-template.ts',
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
   * Satori surface: exempts only the inline size/radius rules, since CSS variables do not reach
   * Satori. Flat config replaces rule options, so this block reloads all other selectors and must
   * come after the ramp blocks.
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
  // Bans `--color-amber-docs-*` tokens in the settings sheet, where they mixed with warning amber in
  // one badge. Scoped here because document surfaces legitimately use them. Flat config replaces
  // rule options, so this block reloads the ramp selectors.
  {
    files: ['src/widgets/app-settings-menu/**/*.{ts,tsx}'],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...checkboxAccentSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // Reload every ramp selector here too, or weight, spacing, palette and layer rules silently stop
        // applying in this directory.
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
   * The `_` prefix marks intentionally unused names. `ignoreRestSiblings` stays off because it would
   * exempt unmarked names; the probe in tests/contract/ci-gates/lint-warning-ratchet.contract.test.ts proves
   * unmarked unused variables are still caught.
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
