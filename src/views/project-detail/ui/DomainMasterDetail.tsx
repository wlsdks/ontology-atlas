"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { DomainCompositionRow } from "../model/domain-composition";

/** Twelve rows read as a list at a glance; the rest waits behind one press. */
const CAPABILITIES_SHOWN = 12;

export interface DomainMasterDetailLabels {
  listLabel: string;
  capabilityUnit: string;
  elementUnit: string;
  legendCaption: string;
  /** Why the rows' sum can exceed the heading's counts; empty when it does not. */
  overlapNote: string;
  optionAria: (row: DomainCompositionRow) => string;
  counts: (row: DomainCompositionRow) => string;
  capabilityLinkAria: (title: string) => string;
  capabilitiesEmpty: string;
  showMore: (count: number) => string;
  elementCount: (count: number) => string;
  mapLinkLabel: string;
}

/**
 * Domains as master and detail: one row is always selected, so the selected domain's capabilities
 * are readable without a press. Bar length is the domain's concept count against the largest.
 */
export function DomainMasterDetail({
  domains,
  maxTotal,
  labels,
}: {
  domains: readonly DomainCompositionRow[];
  maxTotal: number;
  labels: DomainMasterDetailLabels;
}) {
  const [selectedId, setSelectedId] = useState(domains[0]?.id ?? null);
  const selected = domains.find((domain) => domain.id === selectedId) ?? domains[0];
  const optionRefs = useRef(new Map<string, HTMLLIElement>());
  const idBase = useId();
  const detailTitleId = `${idBase}-detail-title`;

  const selectAt = (index: number) => {
    const next = domains[Math.max(0, Math.min(domains.length - 1, index))];
    if (!next) return;
    setSelectedId(next.id);
    optionRefs.current.get(next.id)?.focus();
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = domains.findIndex((domain) => domain.id === selected?.id);
    const target =
      event.key === "ArrowDown" ? index + 1
        : event.key === "ArrowUp" ? index - 1
          : event.key === "Home" ? 0
            : event.key === "End" ? domains.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    selectAt(target);
  };

  if (!selected) return null;
  return (
    <div
      data-testid="project-detail-domains"
      className="grid min-w-0 grid-cols-1 gap-x-12 gap-y-8 @3xl/project-page:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p aria-hidden data-testid="domain-capacity-legend" className="flex items-center gap-3.5 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
              {labels.capabilityUnit}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]" />
              {labels.elementUnit}
            </span>
          </p>
          <span className="text-label text-[color:var(--color-text-tertiary)]">{labels.legendCaption}</span>
        </div>
        <ul
          role="listbox"
          aria-label={labels.listLabel}
          aria-orientation="vertical"
          data-testid="project-detail-domain-list"
          onKeyDown={onListKeyDown}
          // Name, bar and count are three shared columns, so every bar starts on one x.
          className="-mx-2 grid grid-cols-[auto_minmax(0,max-content)_minmax(3rem,1fr)_auto] gap-y-px"
        >
          {domains.map((domain) => {
            const isSelected = domain.id === selected.id;
            return (
              <li
                key={domain.id}
                ref={(node) => {
                  if (node) optionRefs.current.set(domain.id, node);
                  else optionRefs.current.delete(domain.id);
                }}
                role="option"
                aria-selected={isSelected}
                aria-label={labels.optionAria(domain)}
                tabIndex={isSelected ? 0 : -1}
                data-testid="project-detail-domain-option"
                data-domain-id={domain.id}
                onClick={() => setSelectedId(domain.id)}
                className={controlClass({
                  shape: "row",
                  size: "md",
                  tone: "secondary",
                  active: isSelected,
                  hoverSurface: "lift",
                  className: "col-span-4 grid grid-cols-subgrid items-center gap-x-3 px-2",
                })}
              >
                <OntologyMapKindGlyph kind="domain" size={ICON_SIZE.md} className="shrink-0" />
                <span className="min-w-0 truncate">{domain.title}</span>
                <DomainLengthBar domain={domain} maxTotal={maxTotal} />
                <span className="min-w-[2ch] text-right font-mono text-body tabular-nums text-[color:var(--color-text-tertiary)]">
                  {domain.total}
                </span>
              </li>
            );
          })}
        </ul>
        {labels.overlapNote ? (
          <p
            data-testid="project-detail-domain-overlap-note"
            className="mt-3 max-w-[var(--measure-prose)] break-keep text-pretty text-label leading-body text-[color:var(--color-text-tertiary)]"
          >
            {labels.overlapNote}
          </p>
        ) : null}
      </div>
      <SelectedDomain key={selected.id} domain={selected} titleId={detailTitleId} labels={labels} />
    </div>
  );
}

/** Two neutral segments a 1px seam apart; the track's width is the domain's share of the largest. */
function DomainLengthBar({ domain, maxTotal }: { domain: DomainCompositionRow; maxTotal: number }) {
  const lengthPercent = maxTotal > 0 ? (domain.total / maxTotal) * 100 : 0;
  return (
    <span aria-hidden className="flex h-1.5 min-w-0 items-stretch">
      <span
        data-testid="project-detail-domain-bar"
        className="flex h-full gap-px overflow-hidden rounded-full"
        style={{ width: `${lengthPercent}%` }}
      >
        {domain.capabilityCount > 0 ? (
          <span className="h-full bg-[color:var(--color-indigo-brand)]" style={{ flexGrow: domain.capabilityCount }} />
        ) : null}
        {domain.elementCount > 0 ? (
          <span className="h-full bg-[color:var(--color-text-quaternary)]" style={{ flexGrow: domain.elementCount }} />
        ) : null}
      </span>
    </span>
  );
}

function SelectedDomain({
  domain,
  titleId,
  labels,
}: {
  domain: DomainCompositionRow;
  titleId: string;
  labels: DomainMasterDetailLabels;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? domain.capabilities : domain.capabilities.slice(0, CAPABILITIES_SHOWN);
  const hiddenCount = domain.capabilities.length - shown.length;
  return (
    <section
      aria-labelledby={titleId}
      data-testid="project-detail-domain-detail"
      className="min-w-0"
    >
      <h3
        id={titleId}
        data-testid="project-detail-domain-detail-title"
        className="text-title font-[var(--font-weight-strong)] tracking-title text-[color:var(--color-text-primary)]"
      >
        {domain.title}
      </h3>
      {domain.definition ? (
        <p className="mt-1.5 max-w-[var(--measure-prose)] break-keep text-pretty text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {domain.definition}
        </p>
      ) : null}
      <p className="mt-2 text-body tabular-nums text-[color:var(--color-text-tertiary)]">{labels.counts(domain)}</p>
      {domain.capabilities.length > 0 ? (
        <ul
          data-testid="project-detail-domain-capabilities"
          className="-mx-2 mt-4 flex max-w-lg flex-col"
        >
          {shown.map((capability) => (
            <li key={capability.id} className="min-w-0">
              <Link
                href={getTopologyFocusHref(capability.id)}
                aria-label={labels.capabilityLinkAria(capability.title)}
                data-testid="project-detail-capability-link"
                className={controlClass({
                  shape: "row",
                  size: "sm",
                  tone: "secondary",
                  hoverSurface: "lift",
                  hoverInk: "strong",
                  className: "w-full gap-2 px-2",
                })}
              >
                <OntologyMapKindGlyph kind="capability" size={ICON_SIZE.sm} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{capability.title}</span>
                {capability.elementCount > 0 ? (
                  <span aria-hidden className="shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                    {labels.elementCount(capability.elementCount)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 break-keep text-body text-[color:var(--color-text-tertiary)]">{labels.capabilitiesEmpty}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {hiddenCount > 0 ? (
          <button
            type="button"
            data-testid="project-detail-domain-show-more"
            onClick={() => setShowAll(true)}
            className={controlClass({ shape: "link", hoverInk: "strong", className: "touch-hit-expand" })}
          >
            {labels.showMore(hiddenCount)}
          </button>
        ) : null}
        <Link
          href={getTopologyFocusHref(domain.id)}
          data-testid="project-detail-domain-map-link"
          className={controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand" })}
        >
          {labels.mapLinkLabel}
        </Link>
      </div>
    </section>
  );
}
