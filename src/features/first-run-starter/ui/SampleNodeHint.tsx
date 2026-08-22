"use client";

import { useTranslations } from "next-intl";
import { useSampleNodeHint } from "../model/use-sample-node-hint";

export interface SampleNodeHintProps {
  /** Is a node currently selected on the map — the first selection permanently retires the hint. */
  hasSelection: boolean;
  /**
   * Suppresses rendering while the guided tour is open — the tour teaches the same
   * lesson ("press one") more explicitly in the same place, and overlapping them is
   * double guidance. This is not a permanent dismiss: it reappears when the tour
   * closes, if it has not been dismissed yet.
   */
  hidden?: boolean;
}

/**
 * The one-time map hint on a first visit in sample mode — "press a node on the map ·
 * every one is a real document". A single quiet label seated at the bottom centre of
 * the map (not popup soup).
 *
 * - `pointer-events-none`: the hint never blocks a node click. Clicking "through" it
 *   onto the node beneath *is* the dismiss.
 * - No entrance animation (static), keeping the charter's calm and behaving
 *   identically for `prefers-reduced-motion` users.
 * - The gate and the permanent dismiss belong to `useSampleNodeHint` (localStorage).
 *   Connecting a real vault turns the sample-settled gate off and it retires itself.
 */
export function SampleNodeHint({ hasSelection, hidden = false }: SampleNodeHintProps) {
  const t = useTranslations("firstRunStarter.nodeHint");
  const { visible } = useSampleNodeHint(hasSelection);

  if (!visible || hidden) return null;

  return (
    <div
      data-testid="sample-node-hint"
      /*
       * The bottom inset uses **`…-bottom-inset`**, not the left/right
       * `…-legend-inset` (measured fix, 2026-08-01).
       *
       * The two tokens share a default (24px), so on a wide screen the difference is
       * invisible. They diverge below `lg`, where only `bottom-inset` adds the tab-bar
       * reserve. Using the left/right one meant that at 768, 834, and 1023 this hint
       * had 25 of its 30px (83%) covered by the tab bar — the map's **first
       * interaction instruction** was effectively invisible on a tablet in portrait.
       * It was rendering, so no visibility check would call it odd.
       *
       * The same accident had already happened twice (2026-07-23, the INDEX footer and
       * the readout), and this token was created then. The third time is not a new
       * value but **failing to use one that exists.**
       */
      className="pointer-events-none absolute bottom-[calc(var(--topology-relation-legend-bottom-inset)+8px)] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--topology-v2-panel-divider)] bg-[color:var(--color-panel)] px-3.5 py-1.5 text-label text-[color:var(--topology-v2-panel-text-secondary)] shadow-[var(--chrome-shadow)] md:flex"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]"
      />
      <span>
        <b className="font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
          {t("action")}
        </b>{" "}
        {t("reason")}
      </span>
    </div>
  );
}
