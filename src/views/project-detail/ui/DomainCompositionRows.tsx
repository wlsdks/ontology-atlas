"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import type { DomainCompositionRow } from "../model/domain-composition";

interface DomainCompositionRowsLabels {
  capabilityUnit: string;
  elementUnit: string;
  legendCaption: string;
  /** Why the hero chip sum differs from the row sum. */
  overlapNote: string;
  /** The bar is `aria-hidden`, so the figures ride here. */
  rowToggleAria: (row: DomainCompositionRow) => string;
  mapLinkLabel: string;
  /** Only the title is visible, so the name states the destination. */
  capabilityLinkAria: (title: string) => string;
  capabilitiesEmpty: string;
}

interface Props {
  domains: DomainCompositionRow[];
  labels: DomainCompositionRowsLabels;
}

/**
 * Domain rows that expand in place to every capability. The shared `DomainCapacityBar` stays
 * presentation only, since `/projects` cards reuse it; the control wraps it here. A collapsed row
 * has one job, so map doors live inside: each capability name and one domain chip.
 */
export function DomainCompositionRows({ domains, labels }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  useTailColumnWidth(listRef, domains, labels);
  return (
    <div className="flex flex-col">
      {/* Once per group, not per row. */}
      <DomainCapacityLegend
        labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
        className="mb-1.5"
      />
      <ul ref={listRef} data-testid="project-detail-domain-rows" className="flex flex-col">
        {domains.map((domain) => (
          <DomainRow key={domain.id} domain={domain} labels={labels} />
        ))}
      </ul>
      {/* One footnote paragraph in the reading column's measure; the rule spans the list. */}
      <div className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5">
        <p
          data-testid="project-detail-domain-overlap-note"
          className="max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-pretty text-label leading-label text-[color:var(--color-text-quaternary)]"
        >
          {labels.legendCaption} {labels.overlapNote}
        </p>
      </div>
    </div>
  );
}

/** Pins `--capacity-tail-inline` to the widest tail, so every track ends on one axis with no guessed width. */
function useTailColumnWidth(
  listRef: RefObject<HTMLUListElement | null>,
  domains: DomainCompositionRow[],
  labels: DomainCompositionRowsLabels,
) {
  const { capabilityUnit, elementUnit } = labels;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      list.style.removeProperty("--capacity-tail-inline");
      let widest = 0;
      list.querySelectorAll<HTMLElement>('[data-testid="domain-capacity-bar-tail"]').forEach((tail) => {
        widest = Math.max(widest, tail.getBoundingClientRect().width);
      });
      if (widest > 0) list.style.setProperty("--capacity-tail-inline", `${Math.ceil(widest)}px`);
    };
    measure();
    // A late webfont changes every tail's width.
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [listRef, domains, capabilityUnit, elementUnit]);
}

function DomainRow({
  domain,
  labels,
}: {
  domain: DomainCompositionRow;
  labels: DomainCompositionRowsLabels;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  const panelId = `project-detail-domain-panel-${domain.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <li className="min-w-0 border-b border-[color:var(--color-divider)] last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={labels.rowToggleAria(domain)}
        data-testid="project-detail-domain-row-toggle"
        onClick={() => setOpen((value) => !value)}
        /* Explicit width: a button's `width:auto` shrinks to fit; +0.75rem covers the hover face's side overhang. */
        className={controlClass({
          shape: "row",
          size: "sm",
          className:
            "-mx-1.5 w-[calc(100%+0.75rem)] gap-2 px-1.5 py-1.5 hover:bg-[color:var(--color-overlay-1)]",
        })}
      >
        <span className="min-w-0 flex-1">
          <DomainCapacityBar
            row={domain}
            labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
            tail="inline"
          />
        </span>
        {/* Says the row opens, or the rows read as a static list; a state chevron is not decoration. */}
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden="true"
          className={`shrink-0 text-[color:var(--color-text-quaternary)] transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      <div
        ref={boxRef}
        id={panelId}
        className="ai-row-disclosure"
        data-state={open ? "open" : "closed"}
        data-testid="project-detail-domain-disclosure"
        // Still mounted while collapsing, so hidden links leave the tab order at once.
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body pb-2.5">
            {/* Indented to the title (glyph 15 + gap 8), or children read as more domains. */}
            {domain.capabilities.length > 0 ? (
              <ul className="flex flex-col pl-[23px]">
                {domain.capabilities.map((capability) => (
                  <li key={capability.id} style={{ height: "var(--card-row-h)" }}>
                    <Link
                      href={getTopologyFocusHref(capability.id)}
                      aria-label={labels.capabilityLinkAria(capability.title)}
                      data-testid="project-detail-capability-link"
                      className={controlClass({
                        shape: "row",
                        size: "sm",
                        // A fixed row height, so "how many" reads as length; the link fills the li.
                        className:
                          "-mx-1.5 h-full w-[calc(100%+0.75rem)] gap-1.5 px-1.5 py-0 text-body text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
                      })}
                    >
                      <OntologyMapKindGlyph kind="capability" size={13} />
                      <span className="min-w-0 flex-1 truncate">{capability.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="break-keep pl-[23px] text-body text-[color:var(--color-text-tertiary)]">
                {labels.capabilitiesEmpty}
              </p>
            )}
            <Link
              href={getTopologyFocusHref(domain.id)}
              data-testid="project-detail-domain-map-link"
              className={controlClass({
                shape: "chip",
                size: "sm",
                className: "mt-2 ml-[23px] hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {labels.mapLinkLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}
