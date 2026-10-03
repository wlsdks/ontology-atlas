"use client";

import { useTranslations } from "next-intl";
import { useSampleNodeHint } from "../model/use-sample-node-hint";

export interface SampleNodeHintProps {
  hasSelection: boolean;
  hidden?: boolean;
  inline?: boolean;
}

export function SampleNodeHint({ hasSelection, hidden = false, inline = false }: SampleNodeHintProps) {
  const t = useTranslations("firstRunStarter.nodeHint");
  const { visible } = useSampleNodeHint(hasSelection);

  if (!visible || hidden) return null;

  return (
    <div
      data-testid="sample-node-hint"
      data-toast-wall="bottom"
      data-inline={inline ? "true" : undefined}
      className={`pointer-events-none ${inline ? "" : "absolute bottom-[calc(var(--topology-relation-legend-bottom-inset)+8px)] left-1/2 z-20 -translate-x-1/2"} hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--map-panel-divider)] bg-[color:var(--color-panel)] px-3.5 py-1.5 text-label text-[color:var(--map-panel-text-secondary)] shadow-[var(--chrome-shadow)] md:flex`}
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
