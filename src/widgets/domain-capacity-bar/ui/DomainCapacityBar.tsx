import { OntologyMapKindGlyph } from "@/shared/ui";

interface DomainCapacityBarRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

export interface DomainCapacityBarLabels {
  capabilityUnit: string;
  elementUnit: string;
}

export interface DomainCapacityBarProps {
  row: DomainCapacityBarRow;
  labels: DomainCapacityBarLabels;
  /** Title column width classes, tunable per call site; defaults to the insights list's column. */
  titleWidthClassName?: string;
  /**
   * `stacked` (default): total over breakdown, right-aligned in the fixed tail. `inline`: one line
   * after the track, width `--capacity-tail-inline`, which the list sets to its widest tail so
   * tracks end on one axis.
   */
  tail?: "stacked" | "inline";
  /**
   * Where the breakdown sits: `tail` (default) or `title`, under the domain name, leaving the tail
   * to the total so the number stands beside its bar.
   */
  breakdownPlacement?: "tail" | "title";
}

/**
 * One domain's composition, capabilities against elements; the track always fills and only the
 * boundary moves (size is the number column's job). Shared by `/ontology/insights` and `/projects`,
 * so fixes land here. Indigo plus neutral with a 1px seam, since kind tones separate only by hue.
 * No minimum width, which would inflate small values.
 * Record: `.qa-scratch/domain-bar-color-2026-07-26.md`; charter: `docs/DESIGN-SYSTEM.md` "Three ambers,
 * three rules".
 */
export function DomainCapacityBar({
  row,
  labels,
  titleWidthClassName = "sm:w-[220px]",
  tail = "stacked",
  breakdownPlacement = "tail",
}: DomainCapacityBarProps) {
  // The denominator is this row's own sum, so rows compare where the boundary sits.
  const filled = row.capabilityCount + row.elementCount;
  const capWidth = filled > 0 ? (row.capabilityCount / filled) * 100 : 0;
  const elWidth = filled > 0 ? (row.elementCount / filled) * 100 : 0;
  const breakdownText = `${labels.capabilityUnit} ${row.capabilityCount} · ${labels.elementUnit} ${row.elementCount}`;
  const underTitle = breakdownPlacement === "title";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5" data-testid="domain-capacity-bar-row">
      <span className={`flex w-full min-w-0 shrink-0 flex-col ${titleWidthClassName}`}>
        <span className="flex min-w-0 items-center gap-2 text-body-lg text-[color:var(--color-text-secondary)]">
          <OntologyMapKindGlyph kind="domain" size={15} />
          <span className="truncate">{row.title}</span>
        </span>
        {underTitle ? (
          // Under the name the line starts on the name's own text line (glyph 15 + gap 8).
          <span
            data-testid="domain-capacity-bar-breakdown"
            className="block truncate pl-[23px] text-label tabular-nums text-[color:var(--color-text-tertiary)]"
          >
            {breakdownText}
          </span>
        ) : null}
      </span>
      {/*
       * aria-hidden: the same numbers sit as text beside it. Segments render only above 0, so the
       * seam exists only when both values do.
       */}
      <span
        aria-hidden
        data-testid="domain-capacity-bar-track"
        className="flex h-2 min-w-[48px] flex-1 gap-px overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
      >
        {capWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-capability"
            className="block h-full bg-[color:var(--color-indigo-brand)]"
            style={{ width: `${capWidth}%` }}
          />
        ) : null}
        {elWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-element"
            className="block h-full bg-[color:var(--color-text-quaternary)]"
            style={{ width: `${elWidth}%` }}
          />
        ) : null}
      </span>
      {/*
       * Fixed-width tail so text width cannot change the track length and split the shared
       * axis; `w-48` fits every current English tail. `tabular-nums` keeps digits aligned.
       */}
      {tail === "inline" ? (
        <span
          data-testid="domain-capacity-bar-tail"
          className="flex w-[var(--capacity-tail-inline,auto)] flex-none items-baseline gap-2.5 whitespace-nowrap"
        >
          <span className="text-title font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--map-numeral-face)]">
            {row.total}
          </span>
          {underTitle ? null : (
            <span
              data-testid="domain-capacity-bar-breakdown"
              className="min-w-0 truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]"
            >
              {breakdownText}
            </span>
          )}
        </span>
      ) : (
        <span
          data-testid="domain-capacity-bar-tail"
          // With the breakdown under the name, the tail holds the total alone in a fixed column
          // three digits wide.
          className={`${underTitle ? "w-8" : "w-48"} flex-none text-right`}
        >
          <span className="block font-mono text-title tabular-nums text-[color:var(--map-numeral-face)]">
            {row.total}
          </span>
          {underTitle ? null : (
            <span
              data-testid="domain-capacity-bar-breakdown"
              className="block truncate text-label tabular-nums text-[color:var(--color-text-quaternary)]"
            >
              {breakdownText}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The legend for both pieces, once per bar block and always rendered so the space above does not
 * wobble. aria-hidden like the graphic it keys; each row's caption carries the fact.
 */
export function DomainCapacityLegend({
  labels,
  className = "",
}: {
  labels: DomainCapacityBarLabels;
  className?: string;
}) {
  return (
    <p
      aria-hidden
      data-testid="domain-capacity-legend"
      className={`flex items-center gap-3.5 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)] ${className}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {labels.capabilityUnit}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]" />
        {labels.elementUnit}
      </span>
    </p>
  );
}
