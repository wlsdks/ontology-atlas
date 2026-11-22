import type { Ref } from "react";
import type { declaredDependents } from "../../board/relief-metric";
import type { HexBoardLayout } from "../../model/board/hex-board";
import type { HexEvidenceState } from "../../render/hex-board";
import type { HexBoardLabels } from "./hex-board-labels";

/**
 * The board's tiles as a screen-reader list, one button per tile. Its `data-*` attributes are also
 * the measurement surface the frame loop mirrors the drawn positions onto.
 */
export function HexTileList({
  ref,
  layout,
  evidence,
  selectedId,
  onSelect,
  listLabel,
  metric,
  relief,
  labels,
}: {
  ref: Ref<HTMLUListElement>;
  layout: HexBoardLayout | null;
  evidence: ReadonlyMap<string, HexEvidenceState>;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  listLabel?: string;
  metric: ReturnType<typeof declaredDependents>;
  relief: boolean;
  labels: HexBoardLabels;
}) {
  return (
    <ul ref={ref} className="sr-only" aria-label={listLabel} data-testid="hex-board-list">
      {(layout?.tiles ?? []).map((t) => (
        <li key={t.id}>
          <button
            type="button"
            tabIndex={-1}
            data-hex-id={t.id}
            data-hex-kind={t.kind}
            data-hex-domain={t.domainId ?? ""}
            data-hex-cell={`${t.q},${t.r}`}
            data-evidence={t.kind === "capability" ? (evidence.get(t.id) ?? "unknown") : undefined}
            data-dependents={t.kind === "capability" ? (metric.capability.get(t.id) ?? 0) : t.kind === "domain" ? (metric.region.get(t.id) ?? 0) : undefined}
            aria-label={
              relief && t.kind === "capability"
                ? `${t.name} · ${labels.dependents(metric.capability.get(t.id) ?? 0)}`
                : relief && t.kind === "domain"
                  ? `${t.name} · ${labels.regionDependents(metric.region.get(t.id) ?? 0)}`
                  : undefined
            }
            aria-pressed={selectedId === t.id}
            onClick={() => onSelect?.(t.id)}
          >
            {t.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
