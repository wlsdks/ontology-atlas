"use client";

import { useTranslations } from "next-intl";

import { controlClass } from "@/shared/ui/control-class";

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
      className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-5 text-center shadow-[var(--shadow-elevation-2)]"
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {title}
      </p>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]">
        {body}
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className={controlClass({
          shape: "chip",
          size: "md",
          active: true,
          className:
            "font-mono uppercase tracking-[var(--tracking-caps-14)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
        })}
      >
        {t("clearFilters")}
      </button>
    </div>
  );
}
