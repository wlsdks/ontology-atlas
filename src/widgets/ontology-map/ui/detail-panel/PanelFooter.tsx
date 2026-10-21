import { slugDisplaySegment } from "./map-datasheet";
import { controlClass } from "@/shared/ui";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

export function PanelFooter({
  slug,
  labels,
  onOpenFullDetail,
  onProjectSourceAction,
  projectSourceBusy,
  showProjectSource,
  projectLayout,
  showSourceRemedy,
}: {
  slug: string;
  labels: OntologyMapDetailPanelLabels;
  onOpenFullDetail: OntologyMapDetailPanelProps["onOpenFullDetail"];
  onProjectSourceAction: OntologyMapDetailPanelProps["onProjectSourceAction"];
  projectSourceBusy: boolean;
  showProjectSource: boolean;
  projectLayout: boolean;
  showSourceRemedy: boolean;
}) {
  return (
    <div
      data-testid="map-detail-panel-footer"
      className="flex shrink-0 items-center gap-2.5 rounded-b-[var(--map-panel-radius)] border-t border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-[var(--map-panel-pad)] py-[11px]"
    >
      {!projectLayout ? (
        <span
          data-testid="map-detail-panel-slug"
          title={slug}
          className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-quaternary)]"
        >
          {slugDisplaySegment(slug)}
        </span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {onOpenFullDetail ? (
        <button
          type="button"
          onClick={onOpenFullDetail}
          data-testid="map-detail-panel-open-full-detail"
          /*
           * One grammar for "full detail" on every kind: the chip `lg` its footer neighbour (the
           * project's source action) wears, 32px high with the chip radius. Only the emphasis steps down
           * on the project, whose source action is the filled control, so two never compete.
           */
          className={controlClass({
            shape: "chip",
            size: "lg",
            className: projectLayout
              ? "atlas-touch-floor shrink-0 border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] text-[color:var(--map-panel-text-tertiary)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]"
              : "atlas-touch-floor shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)]",
          })}
        >
          {labels.openFullDetail}
        </button>
      ) : null}
      {/* The action for when there is a gap was taken by the remedy block above —
          what remains here is one quiet action for the "nothing to do" state. */}
      {showProjectSource && labels.sourceAction && !showSourceRemedy ? (
        onProjectSourceAction ? (
          <button
            type="button"
            onClick={() => { void onProjectSourceAction(); }}
            disabled={projectSourceBusy}
            aria-busy={projectSourceBusy}
            data-testid="map-project-source-action"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className:
                "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--map-panel-primary-border)] bg-[color:var(--map-panel-primary-surface)] text-[color:var(--map-panel-primary-text)] hover:border-[color:var(--map-panel-primary-border-hover)] hover:bg-[color:var(--map-panel-primary-surface-hover)] disabled:cursor-wait",
            })}
          >
            {projectSourceBusy ? labels.sourceBusy ?? labels.sourceAction : labels.sourceAction}
          </button>
        ) : (
          <span className="shrink-0 text-body text-[color:var(--map-panel-text-secondary)]">
            {labels.sourceAction}
          </span>
        )
      ) : null}
    </div>
  );
}
