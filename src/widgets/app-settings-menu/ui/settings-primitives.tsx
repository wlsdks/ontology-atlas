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
 * (*"이 버튼도 너무 작고? 뭔가 설정 자체가 좀 작아"* — this button is too small too,
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
 * Ink for the 「자세히」 (detail) toggle — `FootprintSettings` and `ExpandSettings`
 * each held **their own copy of the same control** (byte-identical strings). With
 * two copies, a day comes when only one gets fixed, which is exactly why this file
 * exists. Shape, size and tone come from the value layer
 * (`Chip size="lg" tone="secondary"`); what remains here is only what the ramp
 * does not supply — border colour, hover, focus and grid placement.
 */
export const DETAIL_TOGGLE_CHIP =
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * 「초기화」 (reset) — text that is pressable on its own is `link` (measured: 85
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

/** Group header plus row container — the skeleton of the Toss-style "group header + immediately operable rows" grammar. */
/**
 * A group of settings rows. `label` is **optional**: where the LNB already names
 * that pane, the title is not written again (the same word standing on the left
 * and on the right means one of them is wasted ink). A name is given only when one
 * pane holds more than one group.
 */
export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      {label ? (
        <h3 className={`px-1 ${SETTINGS_SECTION_LABEL}`}>{label}</h3>
      ) : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
        {children}
      </div>
    </section>
  );
}

/**
 * Only bundled mark paths pass. This value goes inside a CSS `url()`, so a
 * quotation mark mixed in could invent style there. Today the only values that
 * arrive are the `/acp-icons/<id>.svg` paths our build script produces, so
 * **locking it by shape is free** — and the hole stays shut even if another source
 * is wired in here later.
 */
const BUNDLED_MARK = /^\/acp-icons\/[a-z0-9-]+\.svg$/;

/**
 * One other product's mark.
 *
 * ## Why not `<img>` (2026-08-16, found from an owner report)
 *
 * All 38 registry icons are **`fill="currentColor"`** (the registration rule
 * rejects an SVG with baked-in colour). Drawn through `<img>` there is no text
 * colour for that instruction to reach, so it falls back to the initial value —
 * **black** — and on a dark panel that is a black drawing on a black plate. The
 * icon was on screen and invisible, and nothing in the code looked wrong.
 *
 * So the drawing is used as a **mask** and we paint the colour: the vendor's
 * published brand colour where there is one, neutral where there is not. As a
 * bonus nothing inside the SVG is rendered, so someone else's file can do nothing
 * on our screen.
 *
 * ## Why the plate is light
 *
 * This app has one dark screen, but what sits here belongs to the vendor rather
 * than to us, and most of these are drawn for a light background (6 of the 11
 * whose colour was checked are black to #2D2D2D). The reference product (Buzz)
 * also lays a white plate under dark marks.
 */
function VendorMark({ src, ink }: { src: string | null; ink: string | null }) {
  const safe = src && BUNDLED_MARK.test(src) ? src : null;
  return (
    <span
      data-vendor-mark={safe ? 'true' : 'empty'}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-chip border',
        safe
          ? 'border-[color:var(--color-vendor-plate-edge)] bg-[color:var(--color-vendor-plate)]'
          : // With no drawing there is no plate either — an empty white square draws more attention than the name.
            'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]',
      )}
    >
      {safe ? (
        <span
          aria-hidden
          data-vendor-mark-ink={ink ? 'brand' : 'neutral'}
          className="size-5"
          style={{
            backgroundColor: ink ?? 'var(--color-vendor-mark-ink)',
            maskImage: `url("${safe}")`,
            WebkitMaskImage: `url("${safe}")`,
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
          }}
        />
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
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3',
        hasMarkSlot ? 'min-h-16 py-2.5' : 'min-h-12 py-2',
      )}
      data-testid={testId}
    >
      {hasMarkSlot ? <VendorMark src={icon ?? null} ink={iconInk ?? null} /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-body text-[color:var(--color-text-secondary)]">{label}</p>
        {caption ? (
          <p
            className={cn(
              'mt-0.5 break-keep text-label leading-label',
              captionTone === 'danger'
                ? 'text-[color:var(--color-status-danger)]'
                : captionTone === 'warning'
                  ? 'text-[color:var(--color-status-warning)]'
                  : 'text-[color:var(--color-text-quaternary)]',
            )}
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

/**
 * Value slider — label, track and current value on one row.
 *
 * The track is painted by hand. With `accent-color` alone the **unfilled side is
 * the browser's default light grey**, which makes the slider brighter than its own
 * label on a dark panel (owner: *"너무 못생겼잖아"* — that's just ugly). Indigo up
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
    <label className="flex min-h-11 items-center gap-3 px-1 py-2">
      <span className="w-28 shrink-0 text-body text-[color:var(--color-text-secondary)]">{label}</span>
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
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--color-indigo-accent)]"
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
    <div className="flex min-h-11 items-center gap-3 px-1 py-2">
      <span className="w-28 shrink-0 text-body text-[color:var(--color-text-secondary)]">{label}</span>
      <SegmentedControl
        ariaLabel={label}
        variant="chips"
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
