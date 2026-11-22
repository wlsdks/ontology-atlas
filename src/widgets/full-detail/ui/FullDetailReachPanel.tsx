"use client";

import type {
  FullDetailReachDepth,
  FullDetailReachDomainRow,
  FullDetailReachModel,
} from "../lib/full-detail-reach";
import { HiddenCountLine } from "@/shared/ui/status/hidden-count-line";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";

/**
 * Outward reach: one sentence, a 1/2/3 step selector and a per-domain bar breakdown. Indigo is
 * reserved for the self domain here (`.claude/rules/design.md`).
 */
export interface FullDetailReachLabels {
  summary: (depth: number, count: number, total: number) => string;
  /** The depth control's accessible name; an exclusive choice is a radiogroup and needs one. */
  stepsAria: string;
  selfDomainLabel: string;
  noDomainLabel: string;
  domainsHidden: (hidden: number) => string;
}

const STEPS: readonly FullDetailReachDepth[] = [1, 2, 3];
const DOMAIN_ROW_LIMIT = 7;

function domainDisplayName(
  row: FullDetailReachDomainRow,
  labels: FullDetailReachLabels,
): string {
  if (row.isSelf) return labels.selfDomainLabel;
  return row.domainTitle ?? labels.noDomainLabel;
}

export function FullDetailReachPanel({
  reach,
  step,
  onChangeStep,
  labels,
  className,
}: {
  reach: FullDetailReachModel;
  step: FullDetailReachDepth;
  onChangeStep: (step: FullDetailReachDepth) => void;
  labels: FullDetailReachLabels;
  className?: string;
}) {
  const atDepth = reach.byDepth[step];
  const topRows = atDepth.domainRows.slice(0, DOMAIN_ROW_LIMIT);

  return (
    <section data-fulldetail-reach className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p
          data-fulldetail-reach-summary
          className="min-w-0 flex-1 text-body font-[var(--font-weight-signature)] tabular-nums text-[color:var(--map-panel-text-primary)]"
        >
          {labels.summary(step, atDepth.reachableCount, reach.totalNodes)}
        </p>
        <span data-fulldetail-reach-steps className="inline-flex">
          <SegmentedControl<FullDetailReachDepth>
            ariaLabel={labels.stepsAria}
            value={step}
            options={STEPS.map((candidate) => ({
              value: candidate,
              label: <span className="min-w-2 text-center tabular-nums">{candidate}</span>,
              testId: `fulldetail-reach-step-${candidate}`,
            }))}
            onChange={onChangeStep}
            size="md"
          />
        </span>
      </div>
      {topRows.length > 0 ? (
        <div
          data-fulldetail-domain-bars
          className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-x-3.5 gap-y-1.5 sm:grid-cols-[170px_1fr_44px]"
        >
          {topRows.map((row) => (
            <DomainBarRow
              key={row.domainId ?? "no-domain"}
              row={row}
              total={reach.totalNodes}
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
      />
    </section>
  );
}

function DomainBarRow({
  row,
  total,
  displayName,
}: {
  row: FullDetailReachDomainRow;
  total: number;
  displayName: string;
}) {
  const widthPercent = Math.max(1, Math.round((row.count / Math.max(total, 1)) * 1000) / 10);
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
