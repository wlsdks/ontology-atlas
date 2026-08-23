---
name: gate-probe
description: Prove a gate before trusting it. Inventory violations, plant a defect, verify RED, restore GREEN, prevent idle scans, and confirm automatic wiring.
---

# Gate probe

A green gate may be protecting the product or looking at nothing. Deliberately
breaking the protected property is how to tell.

- A **gate** is an automated check that blocks a violation: lint, contract test,
  e2e spec, or CI step.
- A **probe** is a defect planted on purpose to prove that gate turns red.

This repository has shipped gates that searched generated prose instead of the
screen, stayed green after the subject was deleted, checked only a function name,
matched zero files, or were invoked by no workflow. None had been probed.

## 0. State the property

Write one sentence describing the product fact the gate protects. Distinguish the
fact from its implementation. “The three installation stages remain reachable”
is a property; “scroll equals zero” is an implementation detail.

## 1. Inventory before enabling

For a new rule, count every current hit and classify it by pattern and legitimacy.
Confirm the real violations fit one pull request. Hundreds of new warnings are
noise that hides existing signal. A global raw-shadow ban once raised warnings
from 144 to 548; a measured selector found five actual defects.

If signal cannot be separated from noise, do not create the rule. Record the
inventory and why the gate was rejected.

## 2. Plant the defect and require RED

Temporarily restore the exact defect or insert one violating line. Run the gate.
If it stays green, the gate does not exist.

- Change only the probe line; never use `git checkout -- <file>` and erase other work.
- Confirm the failure message identifies what and where to fix.
- Probe every independently protected condition.
- Restore the line immediately and require GREEN again.

## 3. Block idle scans

A scan over zero subjects is always green. Count the subjects and fail at zero.
For glob-based rules, prove the glob matches real files. A ratchet baseline that
would fail when the scan narrows is another valid anti-idle layer.

```ts
expect(keys.length).toBeGreaterThan(0);
expect(measured, 'the collector measured nothing').toBeGreaterThan(3);
```

## 4. Confirm automatic wiring

- Find the exact CI workflow and step that invokes the gate.
- Confirm `pnpm checks:changed -- <affected paths...>` recommends it.
- A check that depends on human memory is not a gate.

## 5. Document it

Add the command to `docs/DEVELOPMENT-CHECKS.md` and mention it in `README.md`.
When a contract covers a layer lint cannot see, register that layer in the design
rule table too.

## Report

```md
## Gate probe — <name>

**Property**: <one product fact>
**Inventory**: <N violations and classification, or not applicable>
**Probe**: <inserted defect> → <RED and diagnostic>
**Idle protection**: <subject-count assertion>
**Wiring**: <workflow step and checks:changed mapping>
**Decision**: trustworthy / not yet trustworthy because …
```

## Never

- Trust a gate merely because it passes.
- Pin a human-written sentence. Generate and diff, verify a reference, derive
  expected data from code, or mechanically inventory syntax instead.
- Maintain a hand-written forbidden-word list that weakens unless expanded.
- Assume a failure means product code is wrong before reproducing the gate's
  subject. Several past red gates were stale or scoped incorrectly.
