"use client";

import { useTranslations } from "next-intl";

export function TopologyNoMatchesState({ onClearFilters }: { onClearFilters: () => void }) {
  const t = useTranslations("topology.empty");

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-5 text-center shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        {t("noMatchesTitle")}
      </p>
      <p className="text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">
        {t("noMatchesBody")}
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="rounded-md border border-[color:rgba(139,151,255,0.3)] bg-[color:rgba(94,106,210,0.1)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
      >
        {t("clearFilters")}
      </button>
    </div>
  );
}
