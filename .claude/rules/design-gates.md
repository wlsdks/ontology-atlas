---
paths:
  - "eslint.config.mjs"
  - "tests/contract/**"
  - "scripts/check-*.mjs"
  - "scripts/lib/design-spec-census.mjs"
  - ".claude/rules/design.md"
---

# Design gate archaeology — why each gate has this shape

> Load only while changing a gate. `design.md` owns what is enforced; this file
> owns why the detector, scope, and exemptions look this way. Splitting the two
> in 2026-08-05 removed 27.5 KB (43%) from every ordinary UI turn. Pair this file
> with `/gate-probe`; add new gate failures here, not to the working rules.

## Questions this file answers

| Question | Relevant lesson |
|---|---|
| How wide may an exemption be? | shadow geometry, inline syntax, and hex scope |
| Which token is correct? | the host surface decides, not token presence |
| What if one rule has several syntaxes? | class, inline style, JSX, and object branches all need coverage |
| How does a gate silently die? | flat-config replacement, path allowlists, and narrow scanners |
| What happens before enabling or removing a gate? | inventory and probes in both directions |
| Is only the resting state measured? | hover contrast and z-index state |

## Shadow gates allow geometry, not any `var(...)`

A first ban on all `shadow-[…]` raised warnings from 144 to 548 because more than
90 valid token references were caught. Allowing any string containing `var(`
reduced noise to zero but opened the opposite hole: a hand-written geometry such
as `0 28px 90px var(--color-shadow-a58)` passed because only its colour was
tokenized.

The 2026-07-28 inventory found 23 geometries, including two reversed light
directions (`0 -16px`, `-24px 0`) and a 90px settings-sheet blur larger than the
80px modal tier. The gate now accepts only named elevation/docking/press/surface
tokens and inset hairlines.

### Apply exemptions per layer, not per value

The first negative lookahead tested the whole comma-separated shadow value. One
valid inset layer therefore laundered an adjacent raw elevation layer. Four
places escaped, including the shared button primitive used by sixteen rendered
buttons across ten routes.

Test each comma-separated layer independently. Skip prior layers, apply the
negative lookahead only to the current layer, and require a letter or `(` so the
numeric pieces of `rgba(...)` are not misreported as shadow layers. One valid
member of an allowlist must never become a permit for its siblings.

## The host determines the token

Replacing three `text-white` uses with `--color-text-primary` would have reduced
contrast on the solid indigo surface:

| Ink | Contrast on `#5e6ad2` | AA 4.5 |
|---|---:|---:|
| `#ffffff` / `--color-text-on-accent` | 4.70 | pass |
| `--color-text-primary` | 4.42 | fail |
| `--color-indigo-text-soft` | 2.58 | fail |

Tokenization means choosing the token licensed for that host, not any token.
The initial fix was not gated; ten days later three of four filled-brand labels
had regressed to 4.42:1. `brand-fill-ink-license.contract.test.ts` computes the
pair rather than allowlisting words. Neighbouring accent-tint and quaternary
gates cannot see an opaque indigo fill.

The first implementation parsed JSX tags and produced seven false positives:
comparison operators looked like tag starts, and some classes lived in file
constants rather than tags. String literals are the correct unit; class strings
cannot legitimately contain JSX. Do not use an arbitrary length cutoff—a valid
class constant already measured 401 characters.

## z-index has a partial ramp

Eleven stable tiers were measured. Tailwind's 10/20/30/40/50 steps cover sticky,
map hints, popovers, floating chrome, and modal scrims. Named `--z-*` tokens cover
25/60/70/75/80/100 for map scrims, dialogs, tours, tour cards, tooltips, and skip
links. The lower five were not renamed because a token with zero consumers is
misinformation and `unused-token-ratchet` correctly rejected that attempt.

Values below 20 remain local stacking inside one surface. Global names would
falsely turn local context into a product-wide contract.

## Hover contrast must be measured in hover

WCAG applies to interaction states. A resting-state inventory missed primary
buttons falling from 4.70 to 3.51, 3.17, and 4.01 on hover, plus one action at
4.41. A solid button cannot visibly brighten while keeping white ink above AA;
its safe brightness margin is only 5.7%. Solid indigo therefore darkens to
`--color-indigo-brand-hover` (`#5661c4`, 5.38:1). Tinted controls may still
brighten, and tint ink uses `accentOnTint`.

`tests/e2e/hover-contrast.spec.ts` performs a real hover across seventeen routes.
Stylesheet inference failed because it selected the last matching rule rather
than the cascade winner. Moving the mouse to `(2,2)` also failed because that
point hovered the left rail, corrupting the next resting measurement. A planted
failure caught the second defect.

## Direct-child selectors miss conditional branches

The original accent/tint selector saw only a direct literal. A value below
`JSXExpressionContainer → ConditionalExpression` passed, leaving two live
violations. Cover the union of direct literals and conditional branches, but not
comparison literals under `BinaryExpression`. Probe direct JSX, JSX ternary,
object ternary, comparison, and a ternary without tint.

An inventory that searched only `tone={` found one syntax and missed the object
form. Every syntax the rule supports must also appear in its pre-enable census.

## A second syntax needs a second detector

Class rules for `shadow-[…]` cannot see `style={{ boxShadow: ... }}`. Studio once
kept eight raw shadows in three already-named roles through that path. Inline
and class detectors now share the same allowed tokens and live in both the global
and ramp blocks; putting the rule only in a ramp block would exempt the very debt
file that contained the violation.

The same pattern later appeared for inline `fontSize` and `borderRadius`.
`var(...)` is valid for surface-specific tokens, but `--text-*` through inline
style is still forbidden because it loses the line-height pair. Ternary branches
are checked from day one. Next's reserved `opengraph-image` and `twitter-image`
files are scoped out because their Satori canvas cannot consume CSS variables.

Exemptions have direction: preserving a valid use must not preserve an invalid
use that happens to share its file or value.

## Hex is not globally forbidden

The 2026-07-26 inventory found 127 hex appearances but zero product violations in
arbitrary-value syntax. The rest were test fixtures (83), PR-number comments
(16), Satori/viewport/standalone surfaces without CSS variables (16), token
definitions or static SVG (7), fallbacks (3), and alpha masks (2). A global ban
would create 27 false positives and catch nothing. The narrow rule blocks hex in
arbitrary-value syntax, where a new violation would actually live.

## Flat-config blocks replace, not merge

ESLint flat config replaces a rule's option array in later blocks. Adding a
selector to only one `no-restricted-syntax` definition silently removes it from
another scope. Put shared selectors in one array and verify that every scoped
block spreads it.

Two scoped blocks once carried comments warning about this exact trap while
spreading only `arbitrarySizeSelectors`; weight, tracking, palette, z-index,
inline shadow, and cursor rules were absent in those directories. A comment is
not a gate. Count every spread site and run a probe file through each scope.

## Scanner notation coverage is its own invariant

An icon ratchet matched only single-quoted `lucide-react` imports while 73% of
the repository used double quotes. Its non-empty floor still passed because the
visible quarter contained over 120 icons. The reported debt was 64; reality was
230.

Non-empty is not complete. Assert that every real notation variant contributes a
non-zero count. Synthetic probes are insufficient when they share the detector's
wrong assumption. Source inventory also does not prove rendered inventory: a
runtime `<Icon size={17} />` escaped tag-name matching and was found only in the
browser beside a 16px sibling.

## Coverage is a denylist of debt, not an allowlist of migrated paths

The old ramp gate covered only directories declared migrated. Every new directory
was therefore outside the design system. A probe under a new view containing
`text-[13px] rounded-[5px] leading-[1.9] duration-300` produced zero errors.

Current coverage is all `src` and `app` TypeScript, with only exact debt files
excluded. The initial forced inventory found 125 violations concentrated in
twelve files; directory-level exclusions would have exempted future files too.
Those exceptions reached zero on 2026-08-05 after 93 remaining type/radius uses
moved to nearest ramp steps. Never add a debt exemption again; add a ratified
ramp step and its lint rule.

`type-ramp-coverage.contract.test.ts` runs ESLint itself over existing and not-yet-
existing paths, probes four violations and valid ramps, rejects directory
exemptions, checks file existence, and ratchets remaining debt. Duplicating the
lint regex would recreate the old scanner that covered only seven of twelve
forms.

## Removing a gate requires the same discipline as enabling one

A 2026-08-22 history-only audit proposed deleting several gates. Opening the
current files disproved four claims:

| Report | Current measurement |
|---|---|
| `named-offramp-ratchet` fully duplicated by ESLint | 9 of 21 forms were unguarded |
| `static-vault-source` duplicated by one lint line | no equivalent rule exists; directory context is not expressible as an import rule |
| three gates approve defects | all three defects were already fixed and documented |
| `construction-rules` pins Korean prose | the opposite: it requires no Korean prose |

Git history says what was true then, not what is true now. Before deleting a
gate: open the current file, plant a violation and prove the replacement catches
it, then plant a valid value and prove the replacement stays quiet. Failing any
step means the gate is unique, not redundant.

## Measure before enabling a rule

Hundreds of new warnings are noise that hides existing signal. The raw shadow
ban raised 144 warnings to 548; narrowing it to non-token geometry found five
real violations and returned to 144.

Procedure:

1. classify every hit by syntax and legitimacy;
2. confirm real violations fit one PR;
3. fix them, add the rule, and ensure total lint signal does not grow;
4. probe one violation and one valid form.

## Ratchet assumptions must also be measured

`UNSIZED_DEBT` assumed nine Lucide slots rendered at the default 24px. All nine
were actually sized by their containers: ChromeChip 14, ChromeTile 16, and
EmptyState 16. Adding `size=` would have duplicated the canonical value and
created a regression.

The scanner now exempts only registered slot owners whose source visibly contains
`[&>svg]:size-`; unknown consumers remain counted in the safe direction. Literal
off-ramp values such as `size={13}` still fail. Measure the rendered defect before
“paying” debt; a ledger can be wrong about both count and category.

## A generous ratchet catches its own author

The first dialog ledger was wrong in two places: a comment inflated one count,
and a Radix composition had no literal `role="dialog"`. The lower-bound check
found both while the ledger was being written. A ratchet must fail when current
debt is either above **or below** its recorded baseline.

The same round measured a stale Playwright server on port 3100 three times. When
browser behaviour contradicts current source under `reuseExistingServer`, inspect
server age with `lsof -iTCP:<port>` before blaming code. Give parallel work an
explicit `PLAYWRIGHT_BASE_URL` and unique port.
