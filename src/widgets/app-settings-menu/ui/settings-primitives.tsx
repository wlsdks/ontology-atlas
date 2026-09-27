import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { SegmentedControl } from '@/shared/ui/segmented-control';

/**
 * The settings sheet's primitives (group, row, value slider, radio chips, two-segment
 * toggle), shared so every settings pane has one height, caption colour and type dialect:
 *
 * | What | Step |
 * |---|---|
 * | Row and control labels, pressable text | `text-body` (12.5px) |
 * | One-line descriptions, supporting captions, value readouts | `text-label` (11px) |
 * | `text-caption` (9.5px) | **not used** |
 *
 * The caption step is for micro labels, legends and timestamps, which a control's name is not.
 * Gate: settings-sheet-type-dialect.contract.test.ts.
 */

/**
 * Ink for the Detail toggle shared by `FootprintSettings` and `ExpandSettings`: only what
 * the ramp's `Chip size="lg" tone="secondary"` does not supply (border, hover, focus, placement).
 */
export const DETAIL_TOGGLE_CHIP =
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * Ink for the Reset link, used as `link` at `size: 'md'` since `link/sm` is the forbidden
 * caption step. Only the ink is shared: the adoption ratchet sees a literal `controlClass(`
 * in an opening tag, so each site writes the ramp call inline.
 */
export const RESET_LINK_INK = 'justify-self-start hover:text-[color:var(--color-text-primary)]';

/**
 * One style for every section name in the settings sheet, root group headers and drill-in
 * section headers alike. It stays `text-label`: an uppercase 9.5px eyebrow does nothing for
 * Hangul and would sit smaller than its own content.
 */
export const SETTINGS_SECTION_LABEL =
  'font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]';

/**
 * The head every pane opens with: the section's name and one sentence saying what the pane
 * decides (`docs/records/decisions/2026-09-25-settings-pane-head-ac02840d-c96d-45d0-83d4-8ebf11daa06c.md`).
 * Its transparent border and inset match the rows' start line; no bottom padding, so the
 * Screen pane fits 672; the sentence keeps the prose measure and is balanced.
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
    /* No side inset: the heading shares the start line of the card or tiles beneath it. */
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 id={id} className={SETTINGS_SECTION_LABEL}>
        {label}
      </h3>
      {trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/**
 * A group of settings rows. `label` is optional: a group is named only when its pane holds
 * more than one, since the LNB already names the pane.
 */
export function SettingsGroup({
  label,
  trailing,
  children,
  testId,
}: {
  label?: string;
  /** Controls that belong to the whole group, on the heading's right. */
  trailing?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  // `min-w-0`: as a grid item it would size to its widest caption (a long folder path), and
  // the group's `overflow-hidden` would clip the controls on the right.
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
 * Initials of the first two words, so "Gemini CLI" and "Goose" get distinct tiles; a one-word
 * name keeps one letter.
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
 * A product's mark in its 32px plate, or its initials on `VendorMark`'s own plate when there is
 * no drawing, so the two cannot drift. Exported for the agents tab's other-tools shelf.
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
  /** The product mark at the row's left, bundled image paths only; the slot is always reserved. */
  icon?: string | null;
  /** The verified brand colour for the mark; without one it draws neutral. */
  iconInk?: string | null;
  /** The name whose initials fill the mark slot when there is no drawing (`monogramOf`). */
  monogram?: string;
}) {
  // Content sets the height: 64px with a 32px product mark, 48px without.
  const hasMarkSlot = icon !== undefined;
  // The text claims at least 10rem; when the controls do not fit beside it they wrap to
  // their own line, right-aligned, instead of squeezing the label to nothing.
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
 * Value slider: label, track and current value on one row. The track is painted by hand,
 * since `accent-color` alone leaves the unfilled side browser grey, brighter than its label.
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
 * Pick one of several values in the `Slider` row grammar. `SegmentedControl` supplies the
 * radiogroup, roving and arrow keys; this adapter adds only the settings row layout.
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
      {/* The joined `well` track, the one-of-N grammar the Screen pane's switches use. */}
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

/** Two-segment boolean toggle over `SegmentedControl`, in the settings row grammar. */
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
