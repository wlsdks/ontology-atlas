---
name: design-system-audit
description: Audit whether the design system is enforced at all: off-ramp values, parallel token systems, syntax and path blind spots, warning-only rules, and missing probes.
---

# Audit the system, not one screen

A **ramp** is the allowed value ladder; an **off-ramp value** is hand-selected
outside it; a **gate** is automated enforcement. A 2026-08-03 inventory found
300+ off-ramp values, but their cause was four gate holes:

| Hole | Effect |
|---|---|
| lint saw bracket values only | 268 named Tailwind steps such as `text-sm` and `rounded-md` bypassed the ramp |
| two central surfaces were warning-only with no warning cap | 66 violations blocked nothing |
| a colour checker skipped a directory | raw colours had never been checked there |
| one screen owned a parallel four-step ramp | 17 of 33 elements sat off the app-wide ramp |

Fixing values without closing entry holes guarantees recurrence. `/design-audit`
measures one finished DOM change; `/responsive-sweep` measures breakpoint bands;
this skill asks whether the system is enforceable.

## Scope and requested action

Use the scope returned by `pnpm design:route`, or the user's explicit audit
scope. "Every" below refers to that scope, not every screen in the repository.
An audit request produces findings and repair proposals. Apply repairs only
when the task also authorizes them; the repair order below does not itself
authorize edits. Report unmeasured areas rather than expanding the audit silently.

## 0. Read actual ramps

Extract values from `app/globals.css`; do not audit from memory or a stale prose
copy.

```bash
grep -oE "\-\-text-[a-z-]+:\s*[0-9.]+px" app/globals.css | sort -u
grep -oE "\-\-radius-[a-z-]+:\s*[0-9.]+px" app/globals.css | sort -u
grep -oE "\-\-leading-[a-z-]+:" app/globals.css | sort -u
grep -oE "\-\-shadow-elevation-[a-z0-9-]+:" app/globals.css | sort -u
```

## 1. Measure gate reach

For every specification, ask what the detector cannot see.

1. **Syntax:** bracket versus named utility, hex versus rgba, class versus inline
   style, prefixed variants, text arrow versus icon, direct value versus ternary.
2. **Path:** lint the file directly and compare with an independent source search.
   Four app boundary pages once held 22 silent off-ramp lines outside scope.
3. **Level:** a warning with no `--max-warnings` is not a gate.
4. **Exemption:** inspect `shouldSkip*`, allowlists, and ignores. Exempt exact files
   with reasons, never whole directories.
5. **Parallel system:** look for surface-local ramps differing from global steps by
   1–4px.
6. **Letterform pin:** reject gates that freeze an adjacent class or quote style
   rather than the property; they fail on legitimate rewrites.

## 2. Measure rendered output

Source says what was requested; computed style says what was drawn. Fill allowed
sets from step 0, then inventory visible rects and computed font, radius, and
shadow values. A token itself may hold an off-ramp value while source appears
clean.

Also group `boxShadow` values. Under one light source, higher elevation should
spread and strengthen consistently; reversed pairs imply different lighting
models.

## 3. Repair order is a contract

1. **Zero-pixel changes:** map identical named values, such as `rounded-md` to the
   6px chip or `text-sm` to the 14px body-lg step. Point surface tokens at existing
   ramp tokens without editing consumers.
2. **0.5–1px changes:** compare before/after screenshots.
3. **Visible changes:** require a design decision; ratchet residual debt if one PR
   cannot close it.
4. **Enable the gate last.** Reversing this order creates warning noise.

## 4. Inventory and probe

Classify every hit before enabling. Plant one violating and one valid line and run
the actual gate. Use the available file-editing capability for temporary probes;
restore each probe and keep generated scratch outside the repo.

A zero count is not evidence until a planted violation turns red.

### The scanner writes the ledger

Hand-authored baselines were wrong four times in one day, in both directions.
Write the census function first, paste its output without hand correction, and
make the ratchet fail when debt rises **or falls**. A lower actual count must force
the baseline down.

Measure whether an item is truly debt before paying it. Nine supposedly unsized
icons were already sized by slot containers; adding call-site values would have
duplicated the specification.

## 5. New tokens default to no

A new token needs name, value, consumers, and a reason existing steps cannot work.
One consumer is insufficient; name it when the second real consumer appears.
Unused tokens are misinformation and fail `unused-token-ratchet`.

## Report

```md
## Design-system audit — <scope> · <date>

### Gates first
| Hole | Blind spot | Escaped count | Prescription |

### Rendered inventory
| Item | On ramp | Off ramp | Representative values |

### Repair order
1. zero-pixel N · 2. 0.5–1px N · 3. design decision N · 4. gate

### New tokens
none / <name · value · N consumers · why existing steps fail>
```

When repair is authorized, do not call it complete after value replacement
without checking the affected gate. For audits, report the identified holes and
remaining proof. Do not judge rendered values from source alone, change every
value at once, enable hundreds of warnings, or count fixture classes as product
violations.
