import { morphName, morphTargetProps } from "@/shared/motion/shared-element";
import { CloseButton, controlClass } from "@/shared/ui";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import type { OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

export function IdentityZone({
  nodeId,
  title,
  sourceTitle,
  kind,
  domain,
  powered,
  updatedAtLabel,
  labels,
  onSelectConnection,
  onHoverConnection,
  onClose,
  closeButtonRef,
  showSourcePath,
  projectLayout,
}: {
  nodeId: string;
  title: string;
  sourceTitle: string | null;
  kind: string;
  domain: OntologyMapDetailPanelProps["domain"];
  powered: boolean;
  updatedAtLabel: string | null;
  labels: OntologyMapDetailPanelLabels;
  onSelectConnection: OntologyMapDetailPanelProps["onSelectConnection"];
  onHoverConnection: OntologyMapDetailPanelProps["onHoverConnection"];
  onClose: OntologyMapDetailPanelProps["onClose"];
  closeButtonRef: OntologyMapDetailPanelProps["closeButtonRef"];
  showSourcePath: boolean;
  projectLayout: boolean;
}) {
  return (
    <div className="px-[var(--map-panel-pad)] pt-[15px] pb-4">
      <div className="mb-[11px] flex items-center gap-2.5">
        <span data-testid="map-detail-panel-kind" className="inline-flex flex-1 items-center gap-1.5 text-label text-[color:var(--map-panel-text-tertiary)]">
          <OntologyMapKindGlyph kind={kind} size={12} />
          {labels.kindLabel}
        </span>
        <CloseButton
          ref={closeButtonRef}
          label={labels.close}
          onClick={onClose}
          data-testid="map-detail-panel-close"
          className="text-[color:var(--map-panel-text-tertiary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)] active:bg-[color:var(--map-panel-row-active)]"
        />
      </div>
        <h2 className="mb-2 min-w-0 text-title font-[var(--font-weight-strong)] leading-title tracking-title text-[color:var(--map-panel-text-primary)]">
          <span {...morphTargetProps(morphName("concept", nodeId))} className="block w-fit max-w-full break-words">
            {title}
          </span>
        </h2>
      {showSourcePath && sourceTitle && sourceTitle !== title ? (
        <div
          data-testid="map-detail-panel-source-path"
          className="mb-2 text-label text-[color:var(--map-panel-text-tertiary)] break-all"
        >
          {sourceTitle}
        </div>
      ) : null}
      {/* For a project source, the OPS rail below takes over the meta position as well. */}
      {!projectLayout || domain || updatedAtLabel ? (
        <div className="flex items-center justify-between gap-3">
          {!projectLayout ? (
            // An empty label is a date still being read: the slot stays and no fresh or idle label stands
            // in for it.
            updatedAtLabel != null ? (
              <span
                data-testid="map-datasheet-updated-at"
                className="shrink-0 text-body text-[color:var(--map-panel-text-quaternary)]"
              >
                {updatedAtLabel}
              </span>
            ) : (
              <span className="shrink-0 text-body text-[color:var(--map-panel-text-quaternary)]">
                {powered ? labels.poweredOn : labels.poweredOff}
              </span>
            )
          ) : updatedAtLabel ? (
            <span
              data-testid="map-datasheet-updated-at"
              className="shrink-0 text-body text-[color:var(--map-panel-text-quaternary)]"
            >
              {labels.sourceOntologyDocument ? `${labels.sourceOntologyDocument} · ` : ""}
              {updatedAtLabel}
            </span>
          ) : null}
          {domain ? (
            <button
              type="button"
              onClick={() => onSelectConnection(domain.id)}
              /* **The same affordance** as a relation row (press it and you go to
                 that node), so hover has to match — if only this line did not
                 respond it becomes "why is this one line different". */
              onPointerEnter={() => onHoverConnection?.(domain.id)}
              onPointerLeave={() => onHoverConnection?.(null)}
              aria-label={`${labels.domainLabel} ${domain.title}`}
              data-testid="map-detail-panel-domain"
              className={controlClass({
                shape: "chip",
                size: "md",
                className:
                  "min-w-0 text-left border-[color:var(--map-panel-domain-border)] bg-[color:var(--map-panel-domain-surface)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-domain-surface-hover)]",
              })}
            >
              <span className="shrink-0 text-[color:var(--map-panel-text-tertiary)]">
                {labels.domainLabel}
              </span>
              <span className="truncate font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-domain-text)]">
                {domain.title}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
