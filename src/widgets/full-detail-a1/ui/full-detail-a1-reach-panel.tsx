"use client";

import type {
  FullDetailReachDepth,
  FullDetailReachDomainRow,
  FullDetailReachModel,
} from "../lib/full-detail-reach";
import { controlClass } from "@/shared/ui/control-class";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Link } from "@/i18n/navigation";

/**
 * Outward reach sentence, a 1/2/3 step selector and a per-domain bar breakdown. Indigo is reserved
 * for the self domain here (`.claude/rules/design.md`).
 */
export interface FullDetailA1ReachLabels {
  leadIn: string;
  stepUnit: string;
  afterSteps: string;
  /** The depth control's accessible name; an exclusive choice is a radiogroup and needs one. */
  stepsAria: string;
  ofTotal: (count: number, total: number) => string;
  mostlyNone: string;
  mostlyOne: (a: string, aCount: number) => string;
  mostlyTwo: (a: string, aCount: number, b: string, bCount: number) => string;
  selfDomainLabel: string;
  noDomainLabel: string;
  /** The remainder sentence for domains past `DOMAIN_ROW_LIMIT`. */
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
    <section data-fulldetail-reach className={["border-y border-[color:var(--map-panel-border)] py-4", className ?? ""].join(" ")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-lg leading-prose tracking-[var(--tracking-title)] text-[color:var(--map-panel-text-secondary)]">
        <span className="inline-flex items-center gap-2">
        {labels.leadIn}{" "}
        {/*
         * `SegmentedControl`: an exclusive choice whose well draws the affordance at rest;
         * inline-flex keeps it in the sentence, with roving tabindex and the coarse-pointer touch
         * floor.
         */}
        <span data-fulldetail-reach-steps className="inline-flex">
          <SegmentedControl<FullDetailReachDepth>
            ariaLabel={labels.stepsAria}
            value={step}
            options={STEPS.map((candidate) => ({
              value: candidate,
              label: String(candidate),
              testId: `fulldetail-reach-step-${candidate}`,
            }))}
            onChange={onChangeStep}
            size="md"
          />
        </span>
        </span>
        <p className="min-w-0 max-w-[var(--measure-doc-column)]">
        {labels.stepUnit} {labels.afterSteps}{" "}
        <span className="font-mono text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
          {labels.ofTotal(atDepth.reachableCount, reach.totalNodes)}
        </span>
        {" — "}
        {buildMostlyText(topRows, labels)}
        </p>
      </div>
      {topRows.length > 0 ? (
        <div
          data-fulldetail-domain-bars
          className="mt-3.5 grid max-w-[var(--measure-stage-column)] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:grid-cols-[170px_1fr_44px] items-center gap-x-3.5 gap-y-1.5"
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
            ? "text-[color:var(--map-panel-text-secondary)]"
            : "text-[color:var(--map-panel-text-tertiary)]",
        ].join(" ")}
      >
        {displayName}
      </span>
      {/* eslint-disable-next-line no-restricted-syntax -- the 2px hairline radius of a 3px-tall gauge track is an exception outside chip(6px). */}
      <span className="relative h-[3px] overflow-hidden rounded-[2px] bg-[color:var(--map-panel-border)]">
        <span
          // eslint-disable-next-line no-restricted-syntax -- the fill paired with the gauge track above, same 2px hairline radius.
          className="absolute inset-y-0 left-0 rounded-[2px]"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: row.isSelf
              ? "var(--map-indigo)"
              : "var(--map-panel-text-quaternary)",
          }}
        />
      </span>
      <span className="text-right text-label text-[color:var(--map-panel-text-tertiary)]">
        {row.count}
      </span>
    </>
  );
}
