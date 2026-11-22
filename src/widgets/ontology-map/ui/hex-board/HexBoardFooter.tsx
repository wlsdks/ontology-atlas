import type { ReactNode, Ref } from "react";
import { Chip } from "@/shared/ui/controls/controls";
import type { HexBoardLabels } from "./hex-board-labels";

/** The board's bottom strip: the stale-only, regions-only and relief toggles, with the legend below. */
export function HexBoardFooter({
  ref,
  labels,
  evidenceMeasured,
  staleOnly,
  staleTotal,
  regionsOnly,
  relief,
  onToggleStale,
  onToggleRegions,
  onToggleRelief,
  legend,
}: {
  ref: Ref<HTMLDivElement>;
  labels: Pick<HexBoardLabels, "staleOnly" | "regionsOnly" | "relief">;
  evidenceMeasured: boolean;
  staleOnly: boolean;
  staleTotal: number;
  regionsOnly: boolean;
  relief: boolean;
  onToggleStale: () => void;
  onToggleRegions: () => void;
  onToggleRelief: () => void;
  legend: ReactNode;
}) {
  return (
    <div
      ref={ref}
      data-testid="hex-board-footer"
      className="absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px)] right-[calc(var(--map-safe-inset-right)*1px)] flex flex-col items-center gap-2"
    >
      <div className="pointer-events-auto flex gap-1 rounded-chip bg-[color:var(--chrome-surface)] p-1">
        {evidenceMeasured ? (
          <Chip
            size="md"
            tone={staleOnly ? "warning" : "secondary"}
            active={staleOnly}
            hoverSurface="lift"
            data-testid="hex-board-stale-only"
            aria-pressed={staleOnly}
            onClick={onToggleStale}
          >
            {labels.staleOnly(staleTotal)}
          </Chip>
        ) : null}
        <Chip
          size="md"
          tone={regionsOnly ? "strong" : "secondary"}
          active={regionsOnly}
          hoverSurface="lift"
          data-testid="hex-board-regions-only"
          aria-pressed={regionsOnly}
          onClick={onToggleRegions}
        >
          {labels.regionsOnly}
        </Chip>
        <Chip
          size="md"
          tone={relief ? "strong" : "secondary"}
          active={relief}
          hoverSurface="lift"
          data-testid="hex-board-relief"
          aria-pressed={relief}
          onClick={onToggleRelief}
        >
          {labels.relief}
        </Chip>
      </div>
      {legend}
    </div>
  );
}
