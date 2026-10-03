"use client";

import { useTranslations } from "next-intl";

interface FlatDialLegendProps {
  evidenceMeasured: boolean;
  linksShown: number;
  linksTotal: number;
}

export function FlatDialLegend({ evidenceMeasured, linksShown, linksTotal }: FlatDialLegendProps) {
  const t = useTranslations("mapDial");
  return (
    <div className="pointer-events-none hidden max-w-full justify-end md:flex">
      <div
        data-testid="flat-dial-legend"
        data-evidence-measured={evidenceMeasured ? "true" : "false"}
        className="pointer-events-none flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]"
      >
        <span className="flex items-center gap-1.5">
          <svg aria-hidden width="34" height="14" viewBox="0 0 34 14">
            <line x1="2" y1="7" x2="20" y2="7" strokeWidth="2.4" strokeLinecap="round" style={{ stroke: "var(--map-edge-depends)" }} />
            <text x="24" y="11" className="text-caption" style={{ fill: "var(--map-panel-text-secondary)" }}>3</text>
          </svg>
          {t("legendFlows")}
        </span>
        <span className="flex items-center gap-1.5">
          <svg aria-hidden width="24" height="14" viewBox="0 0 24 14">
            <line x1="2" y1="7" x2="15" y2="7" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--map-indigo-bright)" }} />
            <polygon points="14,3 22,7 14,11" style={{ fill: "var(--map-indigo-bright)" }} />
          </svg>
          {t("legendNeeds")}
        </span>
        <span className="flex items-center gap-1.5">
          <svg aria-hidden width="24" height="14" viewBox="0 0 24 14">
            <line x1="2" y1="7" x2="15" y2="7" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--map-edge-selected)" }} />
            <polygon points="14,3 22,7 14,11" style={{ fill: "var(--map-edge-selected)" }} />
          </svg>
          {t("legendUsers")}
        </span>
        <span data-testid="flat-dial-legend-rings">{t("legendRings")}</span>
        {linksShown < linksTotal ? (
          <span data-testid="flat-dial-legend-links">{t("linksShown", { shown: linksShown, total: linksTotal })}</span>
        ) : null}
        {evidenceMeasured ? (
          <span className="flex items-center gap-1.5">
            <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="4.5" strokeWidth="1.6" style={{ fill: "var(--map-canvas-bg-near)", stroke: "var(--color-status-warning)" }} />
            </svg>
            {t("legendStale")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
