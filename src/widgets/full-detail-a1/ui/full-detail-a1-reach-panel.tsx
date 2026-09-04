"use client";

import type {
  FullDetailReachDepth,
  FullDetailReachDomainRow,
  FullDetailReachModel,
} from "../lib/full-detail-reach";
import { controlClass } from "@/shared/ui/control-class";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { Link } from "@/i18n/navigation";

/**
 * Full-detail A1 "reach = sentence instrument" — replaces the rejected
 * query-builder (from/to/both direction × 1/2/3-step segments) with a
 * single outward-reach sentence + a clickable 1/2/3 step selector + a
 * per-domain engraved bar breakdown. Indigo is reserved for the self domain:
 * separately from `.claude/rules/design.md`'s "only hub/container get a supporting tone"
 * (only hub/container get a supporting tone) principle, this bar is the sole
 * place indigo is used, to separate self from other.
 */
export interface FullDetailA1ReachLabels {
  leadIn: string;
  stepUnit: string;
  afterSteps: string;
  ofTotal: (count: number, total: number) => string;
  mostlyNone: string;
  mostlyOne: (a: string, aCount: number) => string;
  mostlyTwo: (a: string, aCount: number, b: string, bCount: number) => string;
  selfDomainLabel: string;
  noDomainLabel: string;
  /**
   * The remainder sentence for the domain bars, which stop at
   * `DOMAIN_ROW_LIMIT`. Until 2026-09-05 the eighth domain onward simply
   * vanished, while the sentence above the bars proved the true count was known.
   */
  domainsHidden: (hidden: number) => string;
  /** Where every domain-to-domain relation is drawn — the insights boundaries tab. */
  domainsHiddenRoute: string;
}

const STEPS: readonly FullDetailReachDepth[] = [1, 2, 3];
const DOMAIN_ROW_LIMIT = 7;

function domainDisplayName(
  row: FullDetailReachDomainRow,
  labels: FullDetailA1ReachLabels,
): string {
  if (row.isSelf) return labels.selfDomainLabel;
  return row.domainTitle ?? labels.noDomainLabel;
}

function buildMostlyText(
  rows: readonly FullDetailReachDomainRow[],
  labels: FullDetailA1ReachLabels,
): string {
  if (rows.length === 0) return labels.mostlyNone;
  const [first, second] = rows;
  const firstName = domainDisplayName(first, labels);
  if (!second) return labels.mostlyOne(firstName, first.count);
  return labels.mostlyTwo(firstName, first.count, domainDisplayName(second, labels), second.count);
}

export function FullDetailA1ReachPanel({
  reach,
  step,
  onChangeStep,
  labels,
  className,
}: {
  reach: FullDetailReachModel;
  step: FullDetailReachDepth;
  onChangeStep: (step: FullDetailReachDepth) => void;
  labels: FullDetailA1ReachLabels;
  className?: string;
}) {
  const atDepth = reach.byDepth[step];
  const topRows = atDepth.domainRows.slice(0, DOMAIN_ROW_LIMIT);
  const maxCount = topRows.reduce((max, row) => Math.max(max, row.count), 0) || 1;

  return (
    <section data-fulldetail-reach className={className}>
      <p className="max-w-[760px] text-body-lg leading-prose tracking-[var(--tracking-title)] text-[color:var(--topology-v2-panel-text-secondary)]">
        {labels.leadIn}{" "}
        <span
          data-fulldetail-reach-steps
          className="mx-1 inline-flex items-baseline gap-1.5 align-baseline font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {STEPS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-fulldetail-reach-step={candidate}
              data-active={candidate === step ? "true" : "false"}
              onClick={() => onChangeStep(candidate)}
              className={controlClass({
                shape: "chip",
                size: "xs",
                className: [
                  // 4px is no longer an off-ramp exception — registered as `--radius-micro` (2026-08-03).
                  "px-1 py-0.5",
                  candidate === step
                    ? "border-[color:var(--topology-v2-indigo-border)] text-[color:var(--topology-v2-indigo-bright)]"
                    : "border-transparent hover:border-[color:var(--topology-v2-panel-text-quaternary)]",
                ].join(" "),
              })}
            >
              {candidate}
            </button>
          ))}
        </span>{" "}
        {labels.stepUnit} {labels.afterSteps}{" "}
        <span className="font-mono text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
          {labels.ofTotal(atDepth.reachableCount, reach.totalNodes)}
        </span>
        {" — "}
        {buildMostlyText(topRows, labels)}
      </p>
      {topRows.length > 0 ? (
        <div
          data-fulldetail-domain-bars
          className="mt-3.5 grid max-w-[640px] grid-cols-[170px_1fr_44px] items-center gap-x-3.5 gap-y-1.5"
        >
          {topRows.map((row) => (
            <DomainBarRow
              key={row.domainId ?? "no-domain"}
              row={row}
              maxCount={maxCount}
              displayName={domainDisplayName(row, labels)}
            />
          ))}
        </div>
      ) : null}
      <HiddenCountLine
        data-testid="fulldetail-reach-domains-hidden"
        className="mt-2.5"
        total={atDepth.domainRows.length}
        shown={topRows.length}
        label={labels.domainsHidden}
        route={
          <Link
            href="/ontology/insights/?tab=boundaries"
            data-testid="fulldetail-reach-domains-hidden-route"
            className={controlClass({ shape: "link", size: "sm", scope: "panel", hoverInk: "secondary" })}
          >
            {labels.domainsHiddenRoute}
          </Link>
        }
      />
    </section>
  );
}

function DomainBarRow({
  row,
  maxCount,
  displayName,
}: {
  row: FullDetailReachDomainRow;
  maxCount: number;
  displayName: string;
}) {
  const widthPercent = Math.max(2, Math.round((row.count / maxCount) * 100));
  return (
    <>
      <span
        className={[
          "truncate text-body",
          row.isSelf
            ? "text-[color:var(--topology-v2-panel-text-secondary)]"
            : "text-[color:var(--topology-v2-panel-text-tertiary)]",
        ].join(" ")}
      >
        {displayName}
      </span>
      {/* eslint-disable-next-line no-restricted-syntax -- the 2px hairline radius of a 3px-tall gauge track is an exception outside chip(6px). */}
      <span className="relative h-[3px] overflow-hidden rounded-[2px] bg-[color:var(--topology-v2-panel-border)]">
        <span
          // eslint-disable-next-line no-restricted-syntax -- the fill paired with the gauge track above, same 2px hairline radius.
          className="absolute inset-y-0 left-0 rounded-[2px]"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: row.isSelf
              ? "var(--topology-v2-indigo)"
              : "var(--topology-v2-panel-text-quaternary)",
          }}
        />
      </span>
      <span className="text-right text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
        {row.count}
      </span>
    </>
  );
}
