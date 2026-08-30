"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from "@/shared/ui/control-class";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import type { DomainCompositionRow } from "../model/domain-composition";

interface DomainCompositionRowsLabels {
  capabilityUnit: string;
  elementUnit: string;
  /** How to read the bar — one line per group. */
  legendCaption: string;
  /** Why the hero chip sum differs from the row sum. Appended inside the same footnote paragraph. */
  overlapNote: string;
  /** The bar is `aria-hidden`, so the figures ride here. */
  rowToggleAria: (row: DomainCompositionRow) => string;
  mapLinkLabel: string;
  /** The capability link's accessible name — only the title is visible, so the destination is stated here. */
  capabilityLinkAria: (title: string) => string;
  capabilitiesEmpty: string;
}

interface Props {
  domains: DomainCompositionRow[];
  labels: DomainCompositionRowsLabels;
}

/**
 * The composition tab's list of domain **rows**. It replaced the card grid
 * (`DomainCompositionGrid`), which was retired (2026-08-12, owner chose option B).
 *
 * **The cards lost on two defects, not on taste.**
 *
 * ① **"N more capabilities" was a number with nowhere to go.** A card drew the top 2 and counted the
 * rest in a footer line, and seeing those N meant leaving for the map — a number that could neither be
 * expanded nor pressed on this screen. And the criterion for "top 2" (most connected) was written
 * nowhere, so to a reader two items had simply been picked out.
 * ② **The same figures were told three ways** (hero chips, the radial map, the cards).
 *
 * Rows erase both at once: the list expands **in place**, in full (no footer line), and the picture
 * converges onto the one grammar the app already uses (`DomainCapacityBar`).
 *
 * **The widget is presentation only; layout and interaction are owned here.** Same rule as
 * `insights-domain-row-link` (the insights composition tab) — the bar component is shared with the
 * `/projects` cards, so putting a control inside it would make that one nested-interactive. The
 * wrapper adds the hit area, hover, focus ring, and touch floor, and does not move the row's layout by
 * one pixel (`block` / `w-auto` / `py-0`).
 *
 * **The door to the map: zero on a collapsed row, and inside an expanded one the name is the door.**
 * A map chip per row would add a ninth column of ink and give a collapsed row two destinations (losing
 * which one is primary). A collapsed row has one job — expanding "what is inside". Inside the expanded
 * row **the capability name itself is that node's map deeplink** (2026-08-13 — the evidence is the
 * measurement where seven names were dead-end text: the same defect option B removed, the "number with
 * nowhere to go", had survived in the names), and the domain-level door is a single chip at the end of
 * the list. No new column of ink — the link is the title text that was already there, and the border
 * and cursor say it is pressable. Opening the whole project on the map is already the hero's primary
 * button.
 */
export function DomainCompositionRows({ domains, labels }: Props) {
  return (
    <div className="flex flex-col">
      {/* The key to the bar's two segments appears once per group — repeating it per row is noise. */}
      <DomainCapacityLegend
        labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
        className="mb-1.5"
      />
      <ul data-testid="project-detail-domain-rows" className="flex flex-col">
        {domains.map((domain) => (
          <DomainRow key={domain.id} domain={domain} labels={labels} />
        ))}
      </ul>
      {/*
        The footnote is **one paragraph**. How to read the bar and "the hero chip sum ≠ the row sum" are
        the same kind of annotation needed to read this list, so splitting them into two paragraphs
        doubles the quiet grey block competing with the list's last row.
      */}
      <p
        data-testid="project-detail-domain-overlap-note"
        className="mt-2.5 break-keep border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {labels.legendCaption} {labels.overlapNote}
      </p>
    </div>
  );
}

function DomainRow({
  domain,
  labels,
}: {
  domain: DomainCompositionRow;
  labels: DomainCompositionRowsLabels;
}) {
  const [open, setOpen] = useState(false);
  // Expansion is not a hard cut — the height transition (`--motion-base`) and the content crossfade
  // (`--motion-fast`) come from the app's shared grammar. The reduced-motion equivalent rule is already
  // registered on that class (`app/globals.css`).
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
        /*
          The width is **explicit**. The precedent in the insights tab (`insights-domain-row-link`) is an
          `<a>`, which fills the cell with `w-auto`, but **a `<button>` is a form control, so `width:auto`
          is shrink-to-fit.** Copying it verbatim gave a 460px pressable face under a divider drawn to
          944px, turning the row's right half into a strip that "has a line but does not press"
          (measured). `100% + 0.75rem` reclaims the 6px the hover face extends on each side
          (`-mx-1.5 px-1.5`), and only the vertical inset returns to 0 to preserve the nine rows' 42px
          rhythm.
        */
        className={controlClass({
          shape: "row",
          size: "sm",
          className:
            "-mx-1.5 w-[calc(100%+0.75rem)] gap-2 px-1.5 py-0 hover:bg-[color:var(--color-overlay-1)]",
        })}
      >
        <span className="min-w-0 flex-1">
          <DomainCapacityBar
            row={domain}
            labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
          />
        </span>
        {/*
          **A collapsed row has to say it opens.** The "N more capabilities" this rework removed was at
          least visible as text; a row taking its place with no marker makes nine lines look like a
          read-only list (cursor and hover only speak after the mouse arrives). A chevron indicating an
          expanded state is the charter's explicit exception to the decorative-arrow ban, and the map's
          INDEX tree rows already use the same grammar (90-degree rotation plus `--motion-fast`).
        */}
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
        // It stays in the DOM while collapsing, so links that are not visible are disabled immediately
        // and kept out of the tab order and the screen reader.
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body pb-2.5">
            {/* Children are indented under the parent title (glyph 15 + gap 8 = 23px is where the title
                starts) — without the indent an expanded list stands at the same step as the domain rows
                and reads as "eight more domains appeared". */}
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
                        // The height is not left to the content — the rhythm must be the same inside the
                        // list too, so "how many" reads as length (dimensional regularity). The row height
                        // belongs to the li, and the link fills it to become the hit area.
                        className:
                          "-mx-1.5 h-full w-[calc(100%+0.75rem)] gap-1.5 px-1.5 py-0 text-body text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
                      })}
                    >
                      <TopologyV2KindGlyph kind="capability" size={13} />
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
