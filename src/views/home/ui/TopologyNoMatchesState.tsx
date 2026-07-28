"use client";

import { useTranslations } from "next-intl";

export function TopologyNoMatchesState({
  onClearFilters,
  variant = "empty",
}: {
  onClearFilters: () => void;
  variant?: "empty" | "sparse";
}) {
  const t = useTranslations("topology.empty");
  const title = variant === "sparse" ? t("sparseFilterTitle") : t("noMatchesTitle");
  const body = variant === "sparse" ? t("sparseFilterBody") : t("noMatchesBody");

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-5 text-center shadow-[var(--shadow-elevation-2)]"
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        {title}
      </p>
      <p className="text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">
        {body}
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="rounded-md border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a10)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-line-a90)] transition-colors hover:bg-[color:var(--color-indigo-a18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
      >
        {t("clearFilters")}
      </button>
    </div>
  );
}
