import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import { slugDisplaySegment } from "./map-datasheet";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

const FILLED_SKIN =
  "font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)]";
const QUIET_SKIN =
  "border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] text-[color:var(--map-panel-text-secondary)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]";

/** A panel action chip: filled only for the one emphasised control, quiet everywhere else. */
export function panelActionClass(filled: boolean): string {
  return controlClass({
    shape: "chip",
    size: "md",
    className: `atlas-touch-floor shrink-0 ${filled ? FILLED_SKIN : QUIET_SKIN}`,
  });
}

/**
 * The slug an agent takes, the menus, and the step deeper. A document's step is opening the
 * document itself, its one filled control while nothing in the panel needs a person.
 */
export function PanelFooter({
  slug,
  labels,
  menus,
  documentAction,
  onOpenFullDetail,
}: {
  slug: string;
  labels: OntologyMapDetailPanelLabels;
  menus: ReactNode;
  /** Present only for a document selection; replaces the full-detail step. */
  documentAction: { href: string; filled: boolean } | null;
  onOpenFullDetail: OntologyMapDetailPanelProps["onOpenFullDetail"];
}) {
  return (
    <div
      role="group"
      aria-label={labels.actionsGroupLabel}
      data-testid="map-detail-panel-footer"
      className="flex shrink-0 items-center gap-1.5 rounded-b-[var(--map-panel-radius)] border-t border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-[var(--map-panel-pad)] py-2.5"
    >
      <span
        data-testid="map-detail-panel-slug"
        title={slug}
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-quaternary)]"
      >
        {slugDisplaySegment(slug)}
      </span>
      {menus}
      {documentAction ? (
        <Link
          href={documentAction.href}
          data-testid="map-detail-panel-open-document"
          data-action-role={documentAction.filled ? "primary" : "secondary"}
          className={panelActionClass(documentAction.filled)}
        >
          {labels.actionDocument}
        </Link>
      ) : onOpenFullDetail ? (
        <button
          type="button"
          onClick={onOpenFullDetail}
          data-testid="map-detail-panel-open-full-detail"
          className={controlClass({
            shape: "chip",
            size: "md",
            className:
              "atlas-touch-floor shrink-0 border-transparent px-2 text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]",
          })}
        >
          {labels.openFullDetail}
        </button>
      ) : null}
    </div>
  );
}
