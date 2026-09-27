"use client";

import { useTranslations } from "next-intl";
import { useSampleNodeHint } from "../model/use-sample-node-hint";

export interface SampleNodeHintProps {
  /** The first selection permanently retires the hint. */
  hasSelection: boolean;
  /**
   * Hidden while the guided tour teaches the same lesson; not a dismiss, so it returns after.
   */
  hidden?: boolean;
}

/**
 * The one-time sample hint, one quiet label at the bottom centre of the map.
 * `pointer-events-none`, so clicking through it onto a node is the dismiss; no entrance
 * animation. Gate and dismiss belong to `useSampleNodeHint`.
 */
export function SampleNodeHint({ hasSelection, hidden = false }: SampleNodeHintProps) {
  const t = useTranslations("firstRunStarter.nodeHint");
  const { visible } = useSampleNodeHint(hasSelection);

  if (!visible || hidden) return null;

  return (
    <div
      data-testid="sample-node-hint"
      /*
       * `…-bottom-inset`, not `…-legend-inset`: below `lg` only the bottom inset reserves the tab
       * bar, which otherwise covers the hint on a portrait tablet.
       */
      // A toast stands above this hint, not on it (`src/shared/ui/toast-walls.ts`).
      data-toast-wall="bottom"
      className="pointer-events-none absolute bottom-[calc(var(--topology-relation-legend-bottom-inset)+8px)] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--map-panel-divider)] bg-[color:var(--color-panel)] px-3.5 py-1.5 text-label text-[color:var(--map-panel-text-secondary)] shadow-[var(--chrome-shadow)] md:flex"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]"
      />
      <span>
        <b className="font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
          {t("action")}
        </b>{" "}
        {t("reason")}
      </span>
    </div>
  );
}
