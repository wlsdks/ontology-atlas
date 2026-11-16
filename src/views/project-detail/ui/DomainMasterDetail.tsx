"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { EXIT_TRANSITION, MOTION, STAGGER } from "@/shared/motion";
import { SPRING, framerSpring } from "@/shared/motion/spring";
import { cn } from "@/shared/lib/cn";
import type { DomainCompositionRow } from "../model/domain-composition";
import { RECENT_DOT_CLASS, STALE_DOT_CLASS } from "./now/now-parts";

/** Twelve rows read as a list at a glance; the rest waits behind one press. */
const CAPABILITIES_SHOWN = 12;
/** Past this many domains the list scrolls inside itself instead of pushing the page. */
const DOMAIN_ROWS_SHOWN = 12;
/** Incoming capability rows stagger up to this index, then arrive together. */
const STAGGERED_ROWS = 6;
const CAPABILITY_ROW_REM = 1.75;
/** The `md` row's floor (`min-h-9`). */
const DOMAIN_ROW_REM = 2.25;
const TINT_CLASS = "pointer-events-none absolute inset-x-0 top-0 rounded-chip bg-[color:var(--color-overlay-2)]";

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
  /** The map's domain caption for its stale capabilities. */
  domainStale: (count: number) => string;
  /** Names the amber mark in words: the legend item, the dot's tooltip and its accessible name. */
  staleMark: string;
  recentMark: string;
}

/** The map's two states on a capability: stale by the measured Git walk, changed in the recent window. */
export interface CompositionMarks {
  /** Empty unless the walk was measured, so unknown never draws as stale. */
  staleIds: ReadonlySet<string>;
  changedIds: ReadonlySet<string>;
  /** Reserved while the walk reads, so the legend item arrives without moving the list. */
  staleLegend: "shown" | "reserved" | "absent";
}

/**
 * Domains as master and detail: one row is always selected, so the selected domain's capabilities
 * are readable without a press. Bar length is the domain's concept count against the largest.
 */
export function DomainMasterDetail({
  domains,
  maxTotal,
  labels,
  marks,
}: {
  domains: readonly DomainCompositionRow[];
  maxTotal: number;
  labels: DomainMasterDetailLabels;
  marks: CompositionMarks;
}) {
  const [selectedId, setSelectedId] = useState(domains[0]?.id ?? null);
  const selected = domains.find((domain) => domain.id === selectedId) ?? domains[0];
  const optionRefs = useRef(new Map<string, HTMLLIElement>());
  const reducedMotion = useReducedMotion() ?? false;

  const selectAt = (index: number) => {
    const next = domains[Math.max(0, Math.min(domains.length - 1, index))];
    if (!next) return;
    setSelectedId(next.id);
    const option = optionRefs.current.get(next.id);
    option?.focus({ preventScroll: true });
    option?.scrollIntoView?.({ block: "nearest" });
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

  // Every domain's detail fits the same box, so a selection never changes the page's height.
  const reservedRows = Math.min(CAPABILITIES_SHOWN, Math.max(1, ...domains.map((domain) => domain.capabilities.length)));
  const reserve = {
    "--capability-rows-1": reservedRows,
    "--capability-rows-2": Math.ceil(reservedRows / 2),
    "--capability-rows-3": Math.ceil(reservedRows / 3),
    "--capability-row": `${CAPABILITY_ROW_REM}rem`,
  } as CSSProperties;

  if (!selected) return null;
  return (
    <div
      data-testid="project-detail-domains"
      className="grid min-w-0 grid-cols-1 gap-x-12 gap-y-8 @3xl/project-page:grid-cols-[minmax(20rem,4fr)_minmax(0,8fr)]"
    >
      <div className="min-w-0">
        <div className="mb-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1">
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
          {marks.staleLegend === "absent" ? null : (
            <motion.span
              data-testid="project-detail-stale-legend"
              aria-hidden={marks.staleLegend === "reserved"}
              className="flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]"
              initial={false}
              animate={{ opacity: marks.staleLegend === "shown" ? 1 : 0 }}
              transition={MOTION.fast}
            >
              <span aria-hidden className="text-[color:var(--color-status-warning)]">◐</span>
              {labels.staleMark}
            </motion.span>
          )}
        </div>
        <DomainList
          domains={domains}
          selectedId={selected.id}
          maxTotal={maxTotal}
          labels={labels}
          reducedMotion={reducedMotion}
          optionRefs={optionRefs}
          staleIds={marks.staleIds}
          onSelect={setSelectedId}
          onKeyDown={onListKeyDown}
        />
        {labels.overlapNote ? (
          <p
            data-testid="project-detail-domain-overlap-note"
            className="mt-3 max-w-[var(--measure-prose)] break-keep text-pretty text-label leading-body text-[color:var(--color-text-tertiary)]"
          >
            {labels.overlapNote}
          </p>
        ) : null}
      </div>
      {/* Outgoing and incoming details share one grid cell, so the swap never moves what follows. */}
      <div className="grid min-w-0 [grid-template-areas:'pane']" style={reserve}>
        <AnimatePresence initial={false}>
          <SelectedDomain
            key={selected.id}
            domain={selected}
            labels={labels}
            reducedMotion={reducedMotion}
            marks={marks}
            reserveShowMore={domains.some((domain) => domain.capabilities.length > CAPABILITIES_SHOWN)}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}

function DomainList({
  domains,
  selectedId,
  maxTotal,
  labels,
  reducedMotion,
  optionRefs,
  staleIds,
  onSelect,
  onKeyDown,
}: {
  domains: readonly DomainCompositionRow[];
  selectedId: string;
  maxTotal: number;
  labels: DomainMasterDetailLabels;
  reducedMotion: boolean;
  optionRefs: RefObject<Map<string, HTMLLIElement>>;
  staleIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
}) {
  const [tint, setTint] = useState<{ y: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const option = optionRefs.current.get(selectedId);
    if (!option) return;
    const next = { y: option.offsetTop, height: option.offsetHeight };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tint follows a measured row, known only after layout.
    setTint((prev) => (prev && prev.y === next.y && prev.height === next.height ? prev : next));
  }, [selectedId, optionRefs, domains]);

  return (
    <ul
      role="listbox"
      aria-label={labels.listLabel}
      aria-orientation="vertical"
      data-testid="project-detail-domain-list"
      onKeyDown={onKeyDown}
      // Name, bar, stale count and total are shared columns, so every bar starts on one x and a
      // stale count arriving after the Git walk moves nothing.
      className="relative -mx-2 grid grid-cols-[auto_minmax(0,max-content)_minmax(3rem,1fr)_2.5rem_auto] gap-y-px overflow-y-auto overscroll-contain"
      style={{ maxHeight: `calc(${DOMAIN_ROWS_SHOWN} * ${DOMAIN_ROW_REM}rem + ${DOMAIN_ROWS_SHOWN - 1}px)` }}
    >
      {tint ? (
        // One tint for the selection, gliding between rows instead of jumping.
        reducedMotion ? (
          <span aria-hidden data-testid="project-detail-domain-tint" className={TINT_CLASS} style={{ height: tint.height, transform: `translateY(${tint.y}px)` }} />
        ) : (
          <motion.span
            aria-hidden
            data-testid="project-detail-domain-tint"
            className={TINT_CLASS}
            initial={false}
            animate={{ y: tint.y }}
            style={{ height: tint.height }}
            transition={framerSpring(SPRING.surface)}
          />
        )
      ) : null}
      {domains.map((domain) => {
        const isSelected = domain.id === selectedId;
        const staleCount = domain.capabilities.reduce((sum, capability) => sum + (staleIds.has(capability.id) ? 1 : 0), 0);
        return (
          <li
            key={domain.id}
            ref={(node) => {
              if (node) optionRefs.current.set(domain.id, node);
              else optionRefs.current.delete(domain.id);
            }}
            role="option"
            aria-selected={isSelected}
            aria-label={staleCount > 0 ? `${labels.optionAria(domain)} · ${labels.domainStale(staleCount)}` : labels.optionAria(domain)}
            tabIndex={isSelected ? 0 : -1}
            data-testid="project-detail-domain-option"
            data-domain-id={domain.id}
            onClick={() => onSelect(domain.id)}
            className={controlClass({
              shape: "row",
              size: "md",
              tone: "secondary",
              hoverSurface: isSelected ? undefined : "lift",
              className: cn(
                "relative col-span-5 grid grid-cols-subgrid items-center gap-x-3 px-2",
                isSelected && "text-[color:var(--color-text-primary)]",
              ),
            })}
          >
            <OntologyMapKindGlyph kind="domain" size={ICON_SIZE.md} className="shrink-0" />
            <span className="min-w-0 truncate">{domain.title}</span>
            <DomainLengthBar domain={domain} maxTotal={maxTotal} reducedMotion={reducedMotion} />
            <span aria-hidden title={staleCount > 0 ? labels.domainStale(staleCount) : undefined} className="text-right">
              <AnimatePresence initial={false}>
                {staleCount > 0 ? (
                  <motion.span
                    key={staleCount}
                    data-testid="project-detail-domain-stale"
                    className="text-label tabular-nums text-[color:var(--color-status-warning)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: EXIT_TRANSITION }}
                    transition={MOTION.fast}
                  >
                    ◐ {staleCount}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
            <span className="min-w-[2ch] text-right font-mono text-body tabular-nums text-[color:var(--color-text-tertiary)]">
              {domain.total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Two neutral segments a 1px seam apart; the track's width is the domain's share of the largest. */
function DomainLengthBar({ domain, maxTotal, reducedMotion }: { domain: DomainCompositionRow; maxTotal: number; reducedMotion: boolean }) {
  const lengthPercent = maxTotal > 0 ? (domain.total / maxTotal) * 100 : 0;
  return (
    <span aria-hidden className="flex h-1.5 min-w-0 items-stretch">
      <motion.span
        data-testid="project-detail-domain-bar"
        className="flex h-full origin-left gap-px overflow-hidden rounded-full"
        style={{ width: `${lengthPercent}%` }}
        initial={reducedMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={MOTION.slow}
      >
        {domain.capabilityCount > 0 ? (
          <span className="h-full bg-[color:var(--color-indigo-brand)]" style={{ flexGrow: domain.capabilityCount }} />
        ) : null}
        {domain.elementCount > 0 ? (
          <span className="h-full bg-[color:var(--color-text-quaternary)]" style={{ flexGrow: domain.elementCount }} />
        ) : null}
      </motion.span>
    </span>
  );
}

/** A fixed slot for the two dots, so a mark arriving after the Git walk moves no text. */
function CapabilityMarks({ stale, changed, labels }: { stale: boolean; changed: boolean; labels: DomainMasterDetailLabels }) {
  return (
    <span className="flex w-4 shrink-0 items-center justify-end gap-1">
      <AnimatePresence initial={false}>
        {stale ? (
          <motion.span
            key="stale"
            role="img"
            aria-label={labels.staleMark}
            title={labels.staleMark}
            data-testid="project-detail-capability-stale"
            className={STALE_DOT_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: EXIT_TRANSITION }}
            transition={MOTION.fast}
          />
        ) : null}
        {changed ? (
          <motion.span
            key="changed"
            role="img"
            aria-label={labels.recentMark}
            title={labels.recentMark}
            data-testid="project-detail-capability-changed"
            className={RECENT_DOT_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: EXIT_TRANSITION }}
            transition={MOTION.fast}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function SelectedDomain({
  domain,
  labels,
  reducedMotion,
  marks,
  reserveShowMore,
}: {
  domain: DomainCompositionRow;
  labels: DomainMasterDetailLabels;
  reducedMotion: boolean;
  marks: CompositionMarks;
  /** Some domain has more rows than are shown, so every detail keeps the line its door sits on. */
  reserveShowMore: boolean;
}) {
  const present = useIsPresent();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? domain.capabilities : domain.capabilities.slice(0, CAPABILITIES_SHOWN);
  const hiddenCount = domain.capabilities.length - shown.length;
  const titleId = `project-detail-domain-${domain.id.replace(/[^a-z0-9-]/gi, "-")}`;
  const rise = reducedMotion ? 0 : 4;
  return (
    <motion.section
      aria-labelledby={present ? titleId : undefined}
      aria-hidden={present ? undefined : true}
      inert={!present}
      data-testid={present ? "project-detail-domain-detail" : "project-detail-domain-detail-leaving"}
      className={cn("min-w-0 [grid-area:pane]", !present && "pointer-events-none")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={reducedMotion ? MOTION.fast : MOTION.base}
    >
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-1">
        <div className="min-w-0">
          <h3
            id={titleId}
            data-testid={present ? "project-detail-domain-detail-title" : undefined}
            className="truncate text-title font-[var(--font-weight-strong)] tracking-title text-[color:var(--color-text-primary)]"
          >
            {domain.title}
          </h3>
          {/* Two lines are kept whether or not the domain has a definition, so the rows below never move. */}
          <p
            title={domain.definition ?? undefined}
            className="mt-1 line-clamp-2 min-h-[2lh] max-w-[var(--measure-prose)] break-keep text-pretty text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
          >
            {domain.definition}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1 text-right">
          <p data-testid="project-detail-domain-counts" className="whitespace-nowrap text-body tabular-nums text-[color:var(--color-text-tertiary)]">
            {labels.counts(domain)}
          </p>
          <Link
            href={getTopologyFocusHref(domain.id)}
            data-testid="project-detail-domain-map-link"
            className={controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand whitespace-nowrap" })}
          >
            {labels.mapLinkLabel}
          </Link>
        </div>
      </header>
      <div className="mt-4 min-h-[calc(var(--capability-rows-1)*var(--capability-row))] @5xl/project-page:min-h-[calc(var(--capability-rows-2)*var(--capability-row))] @[90rem]/project-page:min-h-[calc(var(--capability-rows-3)*var(--capability-row))]">
        {domain.capabilities.length > 0 ? (
          <ul
            data-testid="project-detail-domain-capabilities"
            className="-mx-2 grid auto-rows-[var(--capability-row)] grid-cols-1 gap-x-6 @5xl/project-page:grid-cols-2 @[90rem]/project-page:grid-cols-3"
          >
            {shown.map((capability, index) => (
              <motion.li
                key={capability.id}
                className="min-w-0"
                initial={{ opacity: 0, y: rise }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...(reducedMotion ? MOTION.fast : MOTION.base), delay: reducedMotion ? 0 : Math.min(index, STAGGERED_ROWS) * STAGGER }}
              >
                <Link
                  href={getTopologyFocusHref(capability.id)}
                  aria-label={[
                    labels.capabilityLinkAria(capability.title),
                    marks.staleIds.has(capability.id) ? labels.staleMark : null,
                    marks.changedIds.has(capability.id) ? labels.recentMark : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  data-testid="project-detail-capability-link"
                  className={controlClass({
                    shape: "row",
                    size: "sm",
                    tone: "secondary",
                    hoverSurface: "lift",
                    hoverInk: "strong",
                    className: "h-full w-full gap-2 px-2",
                  })}
                >
                  <OntologyMapKindGlyph kind="capability" size={ICON_SIZE.sm} className="shrink-0" />
                  <span title={capability.title} className="min-w-0 flex-1 truncate">{capability.title}</span>
                  <CapabilityMarks stale={marks.staleIds.has(capability.id)} changed={marks.changedIds.has(capability.id)} labels={labels} />
                  {capability.elementCount > 0 ? (
                    <span aria-hidden className="shrink-0 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                      {labels.elementCount(capability.elementCount)}
                    </span>
                  ) : null}
                </Link>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="break-keep text-body text-[color:var(--color-text-tertiary)]">{labels.capabilitiesEmpty}</p>
        )}
      </div>
      {reserveShowMore ? (
        <div className="mt-3 flex h-6 items-center">
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
        </div>
      ) : null}
    </motion.section>
  );
}
