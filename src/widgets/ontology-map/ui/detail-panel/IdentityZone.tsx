import { useTranslations } from "next-intl";
import { morphName, morphTargetProps } from "@/shared/motion/shared-element";
import { CloseButton } from "@/shared/ui";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import type { ConceptReview, OntologyMapDetailPanelLabels, OntologyMapDetailPanelProps } from "./types";

function MetaSeparator() {
  return <span aria-hidden className="shrink-0 text-[color:var(--map-panel-text-quaternary)]">·</span>;
}

/**
 * The header: one meta line (kind, the direct owner, one time fact) and the name on up to two
 * lines. The time fact is the confirmation date while it holds, else a change inside the recent
 * window, else nothing.
 */
export function IdentityZone({
  nodeId,
  title,
  kind,
  owner,
  review,
  powered,
  updatedAtLabel,
  labels,
  onSelectConnection,
  onHoverConnection,
  onClose,
  closeButtonRef,
}: {
  nodeId: string;
  title: string;
  kind: string;
  owner: OntologyMapDetailPanelProps["owner"];
  review: ConceptReview | undefined;
  powered: boolean;
  updatedAtLabel: string | null;
  labels: OntologyMapDetailPanelLabels;
  onSelectConnection: OntologyMapDetailPanelProps["onSelectConnection"];
  onHoverConnection: OntologyMapDetailPanelProps["onHoverConnection"];
  onClose: OntologyMapDetailPanelProps["onClose"];
  closeButtonRef: OntologyMapDetailPanelProps["closeButtonRef"];
}) {
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const changedLabel = powered && updatedAtLabel ? updatedAtLabel : null;
  return (
    <div className="px-[var(--map-panel-pad)] pt-2.5 pb-3">
      <div className="flex min-h-8 items-center gap-2">
        <p
          data-testid="map-detail-panel-meta"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-label text-[color:var(--map-panel-text-tertiary)]"
        >
          <span data-testid="map-detail-panel-kind" className="inline-flex shrink-0 items-center gap-1.5">
            <OntologyMapKindGlyph kind={kind} size={12} />
            {labels.kindLabel}
          </span>
          {owner ? (
            <>
              <MetaSeparator />
              <button
                type="button"
                onClick={() => onSelectConnection(owner.id)}
                onPointerEnter={() => onHoverConnection?.(owner.id)}
                onPointerLeave={() => onHoverConnection?.(null)}
                data-testid="map-detail-panel-owner"
                className="atlas-touch-floor -mx-1 inline-flex min-h-7 min-w-0 items-center truncate rounded-chip px-1 text-[color:var(--map-panel-text-secondary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)] active:bg-[color:var(--map-panel-row-active)]"
              >
                <span className="truncate">{owner.title}</span>
              </button>
            </>
          ) : null}
          {review?.reviewedOn ? (
            <>
              <MetaSeparator />
              <span data-testid="map-detail-panel-reviewed-on" title={tReview("reviewedOnTitle")} className="shrink-0">
                {tReview("reviewedOn", { date: review.reviewedOn })}
              </span>
            </>
          ) : changedLabel ? (
            <>
              <MetaSeparator />
              <span data-testid="map-datasheet-updated-at" className="shrink-0">
                {changedLabel}
              </span>
            </>
          ) : null}
        </p>
        <CloseButton
          ref={closeButtonRef}
          label={labels.close}
          onClick={onClose}
          data-testid="map-detail-panel-close"
          className="text-[color:var(--map-panel-text-tertiary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)] active:bg-[color:var(--map-panel-row-active)]"
        />
      </div>
      <h2
        title={title}
        className="mt-1 min-w-0 text-title font-[var(--font-weight-strong)] leading-title tracking-title text-[color:var(--map-panel-text-primary)]"
      >
        <span {...morphTargetProps(morphName("concept", nodeId))} className="line-clamp-2 w-fit max-w-full break-words">
          {title}
        </span>
      </h2>
    </div>
  );
}
