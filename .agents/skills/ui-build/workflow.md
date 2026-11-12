# Build from the design system

For inspectors with long evidence, read the [reading-panel reference](guides/reading-panels.md)
when choosing clearance, scrolling and the proof surface.

- A **primitive** is a shared UI part such as a button or chip.
- A **ramp** is the finite set of allowed type, radius, shadow, and motion values.
- A **hard cut** is a surface appearing or disappearing in one frame.

## 0-Z. Search before adding a value

Before proposing a new primitive or ramp value (dimension, colour, or spacing),
follow this sequence. Reusing an existing value does not require repeating the
history review; verify its current role and use it:

1. search the parts in `app/styles/` for the role (`rg -- '--<role>' app/styles`);
2. read “System growth rules” in `docs/DESIGN-SYSTEM.md`;
3. inspect `git log --oneline -S'<token>' -- app/globals.css app/styles | head -20`
   for history (the entry path covers the time before the split);
4. only then propose a value, with the measured number of blocked consumers.

The existing height family begins at `--control-h-`. A value invented without
searching does not extend the system; it creates another one.

## 0-A. Specification changes

A specification change is any change to:

- `src/shared/ui/control-class.ts` axes, options, or defaults;
- `src/shared/ui/controls/controls.tsx` or `surface.tsx` primitive guarantees;
- type, leading, radius, shadow, or colour ramps in `app/styles/` (imported by `app/globals.css`);
- the “Fixed scale contract” in `.claude/rules/design.md`.

It is proved by the rendered inventory, not by a second opinion: `pnpm ui:look`
over every route in `tests/e2e/audited-routes.ts` and the design-system audit
(`/ui-proof`, row "token, ramp, primitive interface"). A changed gate also runs
`/gate-probe`.

## 0. Choose the shape before building

Read the [directions guide](guides/directions.md) only for a new or removed
primary surface, or a change to navigation or grouping; value changes inside a
selected shape do not pay for divergence.

When a product spec governs the change, the §0-B loop captures every
States row the change touches, and new text uses only the message keys its Copy
section lists; a missing state or string goes back to the lead, never into the
build.

## 0-B. Render while building

A words-only change takes one fresh `pnpm ui:look` capture of the affected state
after the change. Anything else is not finished as a whole screen from code or
imagination before looking at it.

1. Capture the baseline: `pnpm ui:look -- --route=<route> --widths=<widths>`
   prints one PNG path per route and width, with a vault open.
2. Implement one coherent visual slice: one hierarchy, state, or interaction.
3. Capture the same route and widths again and open the PNG.
4. If the pixels raise a geometry question, add `--audit` or measure the DOM's
   computed styles and rects in the browser.
5. Fix the observed defect before starting the next slice, then repeat.

Keep baseline, material checkpoint, and final capture paths. A material
checkpoint is the smallest visual result that can be judged on its own, not
every CSS line. A window, menu, Tauri bridge or WKWebView state is captured in
the installed app through Computer Use instead.

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
primitive.

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
| Duration | the `--motion-*` ramp: fast feedback, base movement, settle completion, slow travel, expressive entrance, choreography ceiling |

## 4. Motion

- One input is one event; related stages begin in one frame.
- The user-invoked surface moves first, not only its background.
- Smoothness first: animate compositor properties, keep every frame interval
  under 50 ms, and let the next input settle the motion (`docs/DESIGN-SYSTEM.md`,
  "Smoothness first"). Run it headed with `MAP_PERF_BARS=1` for the 50 ms bar
  (`docs/engineering/motion-recording.md`).
- Global CSS already handles reduced motion; do not create a conflicting local
  `!important` branch.

## 5. Measure after building

Prove it with `/ui-proof` for the classes its table lists. The final proof
points to the §0-B baseline, material checkpoints, and final capture.

`motion` always includes the `motion-verify` step against a real macOS screen recording.
Static screenshots, duration tokens, and headless frames do not replace it.
`responsive` measures affected bands; `topology-gesture` uses `map-perf`;
`desktop-shell` proves the touched installed-app state. Combine facts when more
than one failure mode changed.

## 6. Gates that will stop the change

- `contrast-ratchet`
- `a11y-ratchet`
- `disabled-affordance`
- `control-class`

Follow their diagnosis; do not route around them.

## 7. A new specification ships with a gate

Inventory current violations before enabling anything. A rule that creates
hundreds of warnings is noise; the raw shadow ban once raised 144 to 548. Use
`/gate-probe` to prove one violation fails and one valid form passes.
