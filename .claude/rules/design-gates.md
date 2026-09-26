---
paths:
  - "eslint.config.mjs"
  - "tests/contract/**"
  - "scripts/check-*.mjs"
  - "scripts/lib/design-spec-census.mjs"
  - ".claude/rules/design.md"
---

# Gate shape rules

Load while writing or changing a gate. `design.md` says what is enforced; this
file says how a detector, its scope and its exemptions must be built. Pair it
with `/gate-probe` (inventory, planted RED, idle-scan floor, wiring). Each
gate's own incident history belongs in that gate file's header, not here.

## Detector shape

- Exempt per unit, not per whole value: test each comma-separated shadow layer
  on its own, so one valid layer cannot launder a raw sibling.
- Allow exact geometry, not "contains `var(`": a raw shadow with a token colour
  is still raw.
- The host decides the token. Ink on filled indigo is
  `--color-text-on-accent`; compute contrast pairs rather than allowlisting
  words (`brand-fill-ink-license`).
- Cover every syntax a rule has: class strings, inline `style` objects
  (including `--*` custom-property keys and animation/transition shorthand),
  JSX ternaries, object ternaries and framer props. A second syntax needs a
  second detector. Skip comparison literals under `BinaryExpression`.
- Scan string literals, not parsed JSX tags, and add no length cutoff.
- Assert that every notation variant (single and double quotes, runtime props)
  contributes a non-zero count. Source inventory does not prove rendered
  inventory.
- Measure interaction states where WCAG applies: hover contrast is measured in
  a real hover (`hover-contrast.spec.ts`).
- Canvas pickers and inspectors are compared with recorded paint commands, not
  with a shared formula (`map-3d-edge-picking.spec.ts`).
- Shell-command gates parse non-comment lines and compare exact commands, not
  prefixes.

## Scope

- ESLint flat config replaces a rule's options per block. Keep shared selectors
  in one array, spread it into every scoped block, and count the spread sites
  with `--print-config`.
- Coverage is all `src` and `app` TypeScript minus exact debt files. Never add a
  directory or debt exemption; add a ratified ramp step and its lint rule.
- Exemptions have direction: preserving a valid use must not preserve an
  invalid use that shares its file or value.
- Hex is banned inside arbitrary-value syntax only; a global ban is noise.
- z-index below 20 is local stacking; 20 and above use `--z-*`. A token with
  zero consumers is misinformation (`unused-token-ratchet`).

## Ratchets and removal

- A ratchet fails when current debt is above or below its baseline.
- Measure the rendered defect before paying debt; a ledger can be wrong about
  both count and category.
- To delete a gate as redundant, open the current file, then show the
  replacement catching a planted violation and accepting a planted valid
  value. Git history alone does not prove redundancy.
