---
name: design-build
description: Build UI from this repository's primitives and ramps in a deterministic order, then prove the rendered result with the matching instruments and gates.
---

# Build from the design system

- A **primitive** is a shared UI part such as a button or chip.
- A **ramp** is the finite set of allowed type, radius, shadow, and motion values.
- A **hard cut** is a surface appearing or disappearing in one frame.

The 2026-08-03 inventory found that only 1 of 419 raw buttons used the available
primitive, 11 of 20 conditional surfaces hard-cut, and 143 chips used fifty size
combinations. Missing parts and an unwritten order—not model taste—were the gap.

## 0-Z. Search before adding a value

`--control-h-{sm,md,lg}` (28/32/40) already existed when 24/30/34 were invented.
Conflicts then produced an exception axis and one screen ended with 8–9 control
heights.

Before proposing a dimension, colour, or spacing value:

1. search `app/globals.css` for the role;
2. read “System growth rules” in `docs/DESIGN-SYSTEM.md`;
3. inspect `git log --oneline -- app/globals.css | head -20` for history;
4. only then propose a value, with the measured number of blocked consumers.

The existing height family begins at `--control-h-`. A value invented without
searching does not extend the system; it creates another one.

## 0-A. Route specification changes

Declare `design-contract` to `pnpm design:route` when changing:

- `src/shared/ui/control-class.ts` axes, options, or defaults;
- `src/shared/ui/controls.tsx` or `surface.tsx` primitive guarantees;
- type, leading, radius, shadow, or colour ramps in `app/globals.css`;
- the “Fixed scale contract” in `.claude/rules/design.md`.

The router selects `design-system` plus a contrasting seat, a design-system
audit, and `/gate-probe`. During a 244-control normalization the author alone chose eight tones, seven
shapes, three axes, and their values. Chip sizes fell from fifty to three but one
screen retained 8–9 heights. A one-author specification is taste, not a system.

## 0. Choose the shape before building

Run `pnpm design:route` with every observable change class. Run
`/design-directions` only when its result says `directions=yes`; value changes
inside a selected shape do not pay for divergence.

## 0-B. Render while building

When the route includes `computer-use-loop`, do not finish a whole screen from
code or imagination before looking at it.

1. Capture the exact baseline state through the computer-use capability.
2. Implement one coherent visual slice: one hierarchy, state, or interaction.
3. Render it in the actual browser, WebView, or installed app.
4. Request a fresh Computer Use accessibility tree and screenshot; inspect both.
5. If pixels or the tree expose a geometry question, measure the DOM's computed
   styles and rects in the browser.
6. Fix the observed defect before starting the next slice, then repeat.

Keep baseline, material checkpoint, and final screenshot paths. A material
checkpoint is the smallest visual result that can be judged on its own, not
every CSS line. Browser automation localizes DOM geometry; it does not replace
the actual-window Computer Use evidence.

## 1. Controls

### Interactive parts

| Need | Use |
|---|---|
| compact labelled action | `<Chip>` |
| square icon action | `<IconButton label="…">`; label is required |
| whole list row | `<RowButton>` |
| primary/standard action | `<Button>` |
| borderless inset, tab, or segment | `controlClass({ shape: 'segment' })` |
| pill, card, link, or tile | `controlClass({ shape })` |
| no existing shape | stop and inventory the whole population before adding one |

### Value inputs

| Need | Use |
|---|---|
| one-line input | `<Input label="…">`; label, aria-label, or labelledBy is type-required |
| multi-line input | `<Textarea label="…">` |
| error or guidance | `error`/`hint` props; aria wiring and alert role are automatic |
| one independent boolean | `<Checkbox label="…">`; the label is the target |
| 2–4 exclusive short values | `<SegmentedControl>`; even On/Off uses this when values label an existing row |
| detached or data-sized options | `variant="chips"`, optionally `fill` |
| a genuinely different radiogroup container | `useRovingRadioGroup`; do not hand-write role without keyboard behaviour |
| 5+ or long exclusive options | `<Select>` |
| parent already owns the frame | `frame="bare"` |

Hover values come from `controlClass` axes: `hoverInk`, `hoverSurface`, and
`hoverBorder`. They are opt-in and do not apply to active controls. A value absent
from an axis needs a written role reason, not another arbitrary option.

Checkbox versus segmented control depends on the label: if it names the item,
use Checkbox; if the item name already exists and labels name possible values,
use SegmentedControl.

`className` on Input/Textarea targets the label+field+message wrapper. Give that
wrapper `w-full`; do not style the inner field separately.

### Static badges

Use `badgeClass({ shape: 'micro' | 'tag' | 'pill' })`. Geometry is canonical;
colour and tracking remain contextual because the inventory found sixty colour
combinations with no majority. Passing geometry through `className` defeats the
primitive and fails `static-badge-adoption-ratchet`.

### Complete form example

```tsx
<Dialog open={open} onClose={close} labelledBy="new-project-title" size="sm">
  <h2 id="new-project-title" className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
    Create project
  </h2>
  <div className="mt-4 flex flex-col gap-3">
    <Input label="Name" className="w-full" value={name}
      onChange={(e) => setName(e.target.value)}
      error={submitted && !name.trim() ? 'Enter a name' : undefined} />
    <Textarea label="Description" className="w-full" rows={3}
      hint="You can change this later" value={desc}
      onChange={(e) => setDesc(e.target.value)} />
    <Checkbox label="Publish immediately" checked={isPublic}
      onChange={(e) => setPublic(e.target.checked)} />
  </div>
  <div className="mt-4 flex justify-end gap-2">
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <Button variant="primary" onClick={submit}>Create</Button>
  </div>
</Dialog>
```

The title is `text-title`/strong and connected by `labelledBy`; error/hint are
props; footer is right-aligned with cancel before the primary action; field and
section rhythm is `gap-3` and `mt-4`.

`className` may carry only placement, width, and order. Shape, size, and colour
belong to the primitive/ramp interface.

## 2. Appearing surfaces

```tsx
<Surface open={open} origin="top right" onExited={returnFocus}>…</Surface>
```

`Surface` supplies exit presence, the exit animation, inert/pointer blocking, and
one completion callback. A blocking surface uses `<Dialog>`, which supplies scrim,
dialog semantics, Escape, focus trap/restoration, scroll lock, and canonical
widths. `dialog-adoption-ratchet` blocks hand-built dialog markup.

Popover origin follows the invoking control; a centre-origin popover is grounds
for rejection.

## 3. Values

| Value | Authority |
|---|---|
| Type | named type ramp; unknown names silently render root 16px |
| Leading | matching `--leading-*` pair |
| Radius | micro/chip/card/panel/sheet |
| Shadow | elevation-1/2/3, dock, or control-press |
| Colour | `--color-*`; a new hue is a new system |
| Duration | fast feedback, base movement, settle completion |

## 4. Motion

- One input is one event; related stages begin in one frame.
- The user-invoked surface moves first, not only its background.
- Hover and focus complete by `--motion-fast`.
- Global CSS already handles reduced motion; do not create a conflicting local
  `!important` branch.

## 5. Measure after building

Always begin with:

```bash
pnpm checks:changed
pnpm design:route -- --change=<every-observed-class>
```

Run only the proof packet the router returns. Every rendered design class
includes the completed Computer Use render loop above; the final proof points
to its baseline, material checkpoints, and final state.

`motion` always includes `/motion-verify` against a real macOS screen recording.
Static screenshots, duration tokens, and headless frames do not replace it.
`responsive` measures affected bands; `topology-gesture` uses `/map-perf`;
`desktop-shell` proves the touched installed-app state. Combine facts when more
than one failure mode changed.

## 6. Gates that will stop the change

- `control-adoption-ratchet`
- `surface-motion-ratchet`
- `contrast-ratchet`
- `a11y-ratchet`
- `disabled-affordance`
- `control-class`

Follow their diagnosis; do not route around them.

## 7. A new specification ships with a gate

Inventory current violations before enabling anything. A rule that creates
hundreds of warnings is noise; the raw shadow ban once raised 144 to 548. Use
`/gate-probe` to prove one violation fails and one valid form passes.
