import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { SegmentedControl } from '@/shared/ui/segmented-control';

/**
 * The settings sheet's primitives — group · row · value slider · radio chips ·
 * two-segment toggle.
 *
 * They lived privately inside `AppSettingsMenu` until a second consumer appeared
 * (`AgentActivitySettings`). A copy would immediately grow different heights and
 * caption colours in the two settings panes — a specification written in two
 * places has already begun drifting (Carbon). So it dropped to one file.
 *
 * ## This sheet has one type dialect (measured 2026-08-02)
 *
 * For a while it had two. The per-section font inventory showed it plainly:
 * screen `12.5×10 · 11×5`, workspace `12.5×5 · 11×1`, but
 * **expand `9.5×10 · 11×4` (zero 12.5)** and footprint `9.5×1 · 11×4`. Inside one
 * sheet, the same kind of content (label + control + one-line description) was
 * drawn **one ramp step smaller** depending on the section.
 *
 * Nobody decided that. `Slider`/`Choice` were born inside `FootprintSettings`'
 * **collapsed detail** and carried that position's small dimensions; when they
 * were promoted to shared primitives and became `ExpandSettings`' **primary
 * decision controls**, the dimensions came along. This is what the owner saw
 * (*"This button is too small too, the settings themselves feel small."* — this button is too small too,
 * the settings themselves feel small).
 *
 * So the dialects fold into one. This sheet's specification:
 *
 * | What | Step |
 * |---|---|
 * | Row and control labels, pressable text | `text-body` (12.5px) |
 * | One-line descriptions, supporting captions, value readouts | `text-label` (11px) |
 * | `text-caption` (9.5px) | **not used** |
 *
 * 9.5px is excluded by the ramp's definition, not by size preference —
 * `--text-caption` is the step for "micro labels, legends, timestamps", and a
 * radio button's name is none of those. Gate:
 * `settings-sheet-type-dialect.contract.test.ts`.
 */

/**
 * Ink for the 「Detail」 (detail) toggle — `FootprintSettings` and `ExpandSettings`
 * each held **their own copy of the same control** (byte-identical strings). With
 * two copies, a day comes when only one gets fixed, which is exactly why this file
 * exists. Shape, size and tone come from the value layer
 * (`Chip size="lg" tone="secondary"`); what remains here is only what the ramp
 * does not supply — border colour, hover, focus and grid placement.
 */
export const DETAIL_TOGGLE_CHIP =
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * 「Reset」 (reset) — text that is pressable on its own is `link` (measured: 85
 * instances). The same two files each held their own copy of this too.
 *
 * **Why `size: 'md'`**: this sheet's dialect. `link/sm` is `text-caption`
 * (9.5px), which the table above forbids in the root sheet — the type dialect is
 * not reverted to fix a hit area.
 *
 * The hit area rose from 24 to 44px when the value layer gained `min-h-11` on
 * 2026-08-03 (WCAG 2.5.8). The font size did not change. The old `px-1 py-1` was
 * what built that 24px box, so it goes with it.
 *
 * **The call stays inline at each site.** Extracting the finished string into a
 * constant and writing `className={RESET_LINK}` would make the adoption ratchet
 * count it as a hand-written control, because the ratchet only sees a literal
 * `controlClass(` inside an opening tag — it cannot see constants or helper
 * functions. So only the **ink** is shared here and the consumer writes the ramp
 * call.
 */
export const RESET_LINK_INK = 'justify-self-start hover:text-[color:var(--color-text-primary)]';

/**
 * One set of **section names** for the settings sheet — the root sheet's group
 * headers and a drill-in's section headers are the same thing.
 *
 * ⚠️ **Three grew separately and one of them was a step smaller** (2026-08-09,
 * the owner's second report). The root sheet's `SettingsGroup` was `text-label`
 * (11) and `AiConnectionPanel`'s `SupportingSection` was `text-label` too, but
 * `VaultAgentSetupPanel`'s `SectionLabel` alone was **`text-caption` (9.5)**. All
 * four of its positions (connection file status · how agents use this folder ·
 * verify · connect) used it, so only those sections had names smaller than their
 * own content.
 *
 * **My exemption — "an eyebrow may be 9.5px" — was wrong.** It rested on the
 * ramp's definition ("micro label") and on `uppercase`, but **`uppercase` does
 * nothing to Hangul**: the uppercase-micro-label typographic device does not exist
 * here, and all that remains is 9.5px of dim text. The root sheet already used
 * 11px for the same role, so the exemption was **a specification nobody used**.
 *
 * So the value lives here once and consumers point at it — with three copies, the
 * one that drifts is the default (Carbon).
 */
export const SETTINGS_SECTION_LABEL =
  'font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]';

/**
 * The head every pane opens with — the section's name on the title step and one finished
 * sentence saying what the pane decides (2026-09-25).
 *
 * It overturns "the section title is not repeated" (2026-07-29) and steps the nav down from
 * 14px: the record, with its dissent and falsifier, is
 * `docs/records/decisions/2026-09-25-settings-pane-head-ac02840d-c96d-45d0-83d4-8ebf11daa06c.md`.
 * Type descends pane head (16) → row title (12.5) → caption (11).
 *
 * The head's text stands on the row labels' start line: the rows sit inside a group whose
 * 1px border and `px-3` put their text 13px in, so the head carries the same transparent
 * border and inset (it hung 9px left at `px-1`). No bottom padding: the pane's grid gap
 * already separates it from the first group, and the Screen pane has to fit 672. The
 * sentence is prose, so it keeps the prose measure (520), not the row measure, and is
 * balanced: `text-pretty` still left a two-word last line on the API Key sentence.
 */
export function SettingsPaneHead({
  title,
  description,
  testId,
}: {
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <header className="grid min-w-0 gap-1 border-x border-transparent px-3" data-testid={testId}>
      <h3 className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        {title}
      </h3>
      <p className="max-w-[var(--git-setup-measure)] text-body leading-body text-balance text-[color:var(--color-text-tertiary)]">
        {description}
      </p>
    </header>
  );
}

/** Group header plus row container — the skeleton of the Toss-style "group header + immediately operable rows" grammar. */
/**
 * A group of settings rows. `label` is **optional**: where the LNB already names
 * that pane, the title is not written again (the same word standing on the left
 * and on the right means one of them is wasted ink). A name is given only when one
 * pane holds more than one group.
 */
/**
 * A group's heading row: the eyebrow on the left and, when a group carries one, its own control
 * on the right (a hint, an opener). Exported on its own for a group whose body is not the row
 * container — the connectors card on the MCP tab draws its own frame.
 */
export function SettingsGroupHeading({
  label,
  trailing,
  id,
}: {
  label: string;
  trailing?: ReactNode;
  id?: string;
}) {
  return (
    /* No side inset (round 4, 2026-09-25): the heading shares the start line of the card or
       tiles beneath it. `px-1` put the eyebrow 4px right of the card edge, so every group on
       both Agents tabs had two start lines in one column. */
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 id={id} className={SETTINGS_SECTION_LABEL}>
        {label}
      </h3>
      {trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function SettingsGroup({
  label,
  trailing,
  children,
  testId,
}: {
  label?: string;
  /** Controls that belong to the whole group, on the heading's right (2026-09-19). */
  trailing?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  // `min-w-0` on the section: as a grid item it would otherwise size to its widest caption —
  // a long folder path — and the group's `overflow-hidden` then clipped every control on
  // the right (installed app, 2026-09-06: the folder row's chips were off-screen).
  return (
    <section aria-label={label} className="min-w-0" data-testid={testId}>
      {label ? <SettingsGroupHeading label={label} trailing={trailing} /> : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
        {children}
      </div>
    </section>
  );
}

import { VendorMark } from '@/shared/ui/vendor-mark';

/**
 * **Initials of the first two words, not the first letter** (2026-09-25, round 2). One letter made
 * Gemini CLI and Goose the same「G」tile in one list, so the mark no longer told them apart before
 * the name was read. Two words give「GC」and「G」; a one-word name keeps one letter, so the tile
 * never invents a second letter the name does not have.
 */
function monogramOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * A product's mark in its 32px plate, or its initials on the same plate when there is no drawing.
 *
 * ⚠️ **The monogram rides on `VendorMark`'s own plate** (2026-09-25, round 2). The first version
 * drew a look-alike tile by hand, and it had already drifted (overlay-2 where the mark's empty
 * plate is overlay-1). Composing keeps one plate: if the mark changes, the monogram changes with
 * it. Exported on its own (round 3) because the other-tools shelf on the agents tab draws the same
 * product marks outside a row, and a second copy would be the drift this comment records.
 */
export function ProductMark({
  icon,
  ink,
  monogram,
}: {
  icon?: string | null;
  ink?: string | null;
  monogram?: string;
}) {
  return (
    <span className="relative flex shrink-0">
      <VendorMark src={icon ?? null} ink={ink ?? null} />
      {!icon && monogram ? (
        <span
          aria-hidden
          data-vendor-mark="monogram"
          className="absolute inset-0 flex items-center justify-center text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]"
        >
          {monogramOf(monogram)}
        </span>
      ) : null}
    </span>
  );
}

/** One row = label (plus a one-line description when needed) on the left, current value and control on the right. */
export function SettingsRow({
  label,
  caption,
  captionTone = 'neutral',
  control,
  testId,
  icon,
  iconInk,
  monogram,
}: {
  label: string;
  caption?: string;
  captionTone?: 'neutral' | 'warning' | 'danger';
  control: ReactNode;
  testId?: string;
  /**
   * The drawing at the row's left — **bundled image paths only** (2026-08-16, the
   * runner list).
   *
   * When the list is long and the items are different **products**, names alone do
   * not support scanning; with the product's mark present the eye finds it before
   * reading the name. The slot is always reserved, because text sliding left on
   * rows without an icon makes the list ragged.
   */
  icon?: string | null;
  /**
   * The brand colour to paint that mark with. Without one it draws neutral — no
   * colour is invented for a brand we have not verified.
   */
  iconInk?: string | null;
  /**
   * The name whose initials stand in the mark slot when there is no drawing (2026-09-25).
   * An empty tile beside a product name read as a broken image; letters keep the slot doing
   * its job, which is to be found before the name is read. See `monogramOf`.
   */
  monogram?: string;
}) {
  /*
   * **A row with a mark is naturally taller** — no new axis is invented for
   * choosing heights.
   *
   * A row carrying a product mark is not "one settings value" but "one product".
   * Cramming the mark into 12px makes it unrecognisable, so it stops being a
   * scanning channel; a 32px mark in a 48px row suffocates. So height is decided by
   * **content**, not taste: 64px with a mark, the previous 48px without.
   *
   * Measuring the same list in the reference product (Buzz) gives a 65px row and a
   * 36px mark. Why theirs looks "nicer" was these two values, not colour or
   * decoration.
   */
  const hasMarkSlot = icon !== undefined;
  /*
   * **The controls wrap under the label when the row cannot hold both** (responsive sweep,
   * 2026-09-19). Measured at 390 on the Agents destination: a runtime row's three controls
   * (chat, check, badge) stood over a name squeezed to 0px, and on the MCP tab the four tool
   * rows kept a 60px label column beside a 208px button, splitting `.codex/config.toml` mid-word.
   * The text block claims at least 10rem before the control cluster is allowed on the same line;
   * when that does not fit, the cluster drops to its own line and keeps to the right (`ml-auto`).
   * At 768 and above nothing moves: the text simply grows.
   */
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3',
        hasMarkSlot ? 'min-h-16 py-2.5' : 'min-h-12 py-2',
      )}
      data-testid={testId}
    >
      {hasMarkSlot ? <ProductMark icon={icon} ink={iconInk} monogram={monogram} /> : null}
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {caption ? (
          <p
            className={cn(
              'mt-0.5 break-keep text-label leading-label [overflow-wrap:anywhere]',
              captionTone === 'danger'
                ? 'text-[color:var(--color-status-danger)]'
                : captionTone === 'warning'
                  ? 'text-[color:var(--color-status-warning)]'
                  : 'text-[color:var(--color-text-tertiary)]',
            )}
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

/**
 * Value slider — label, track and current value on one row.
 *
 * The track is painted by hand. With `accent-color` alone the **unfilled side is
 * the browser's default light grey**, which makes the slider brighter than its own
 * label on a dark panel (owner: *"That's just ugly"*). Indigo up
 * to the filled point, surface token for the rest.
 *
 * It lived privately inside `FootprintSettings` and came down here when a second
 * consumer (`ExpandSettings`) appeared — a copy would grow different track colours
 * in the two settings panes.
 */
export function Slider({
  label,
  value,
  range,
  format,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId: string;
}) {
  const filled = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <label className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2 sm:flex">
      <span className="col-span-2 shrink-0 text-body text-[color:var(--color-text-primary)] sm:w-28">{label}</span>
      <input
        type="range"
        data-testid={testId}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-indigo-accent) ${filled}%, var(--color-overlay-3) ${filled}%)`,
        }}
        className="h-1 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] sm:w-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--color-indigo-accent)]"
      />
      <span className="w-12 shrink-0 text-right font-mono text-label text-[color:var(--color-text-tertiary)]">
        {format(value)}
      </span>
    </label>
  );
}

/**
 * Pick one of several values — a row of radio chips, with the same row grammar as
 * `Slider`.
 *
 * **2026-08-15 — only the shell is left.** The substance is
 * `SegmentedControl variant="chips"` (the same fate as `SegmentSwitch`). It used
 * to hang `role="radiogroup"` by hand with **no roving tabindex and no arrow-key
 * movement** — the role promised assistive technology something and nothing
 * happened, which is the exact sentence the primitive's founding inventory named
 * as the defect. All this adapter carries is the settings sheet's **row grammar**
 * (`w-28` label plus row inset), and with zero consumption outside settings that
 * is not promotion material (the same standard that rejected `Switch` in
 * 2026-08-15 (2)). **What gets promoted is the container, not the component.**
 *
 * The migration is **zero pixels**: the hand overrides `h-8 px-3 text-body` are
 * geometrically equal to the value layer's `chip lg`
 * (`min-h-8 px-3 py-1 text-body`). The only thing that moved was the selected
 * expression's colour, and that **converged** from a hand combination
 * (`indigo-accent` border plus `indigo-line-a13`) onto the ramp's active state.
 */
export function Choice<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  testId,
  optionTestId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
  /** Per-option testId — used where a contract test has to measure which value is selected. */
  optionTestId?: (value: T) => string;
}) {
  return (
    <div className="flex min-h-11 flex-col items-stretch gap-3 px-1 py-2 sm:flex-row sm:items-center">
      <span className="shrink-0 text-body text-[color:var(--color-text-primary)] sm:w-28">{label}</span>
      {/* The joined `well` track, the same one-of-N grammar the Screen pane's switches use
          (2026-09-25). Detached chips made the Expand pane read as a second control family
          for the same kind of choice. */}
      <SegmentedControl
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          testId: optionTestId?.(option.value),
        }))}
        testId={testId}
      />
    </div>
  );
}

/** Two-segment toggle — the same surface grammar as LocaleSwitch (inherited from the old settings gear). */
/**
 * 2026-08-15 — only the shell is left; the substance is `SegmentedControl`
 * (shared/ui). Parallel `aria-pressed` (exclusivity never reaching the
 * accessibility tree), a group with no roving, and a hand-built selected
 * expression (`bg-panel` — a 1.17:1 illusion against the ink) were all replaced by
 * the primitive's radiogroup, roving and value-layer active state. This adapter
 * only preserves the settings sheet's boolean signature.
 */
export function SegmentSwitch({
  ariaLabel,
  value,
  options,
  onChange,
  testId,
}: {
  ariaLabel: string;
  value: boolean;
  options: ReadonlyArray<{ value: boolean; label: string }>;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={options}
      testId={testId}
    />
  );
}
