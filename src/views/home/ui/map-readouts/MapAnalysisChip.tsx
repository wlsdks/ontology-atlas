"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { useCountUp } from "@/shared/lib/render-timing/use-count-up";
import { Button, ChromeChip, Surface } from "@/shared/ui";
import type { MapAnalysisChipModel, MapAnalysisPill, MapAnalysisRow, MapAnalysisWhen } from "../../lib/map-analysis/map-analysis-chip";
import { resolveLanePopoverAlign, type LanePopoverAlign } from "./lane-popover-align";

const PANEL_WIDTH = 320;

export interface MapAnalysisChipProps {
  model: MapAnalysisChipModel;
  /** The desktop app can start a run; the web says where that works instead. */
  canMapTheRest: boolean;
  /** Opens the map conversation, whose row holds the estimate and Start. */
  onMapTheRest: () => void;
}

type Translate = ReturnType<typeof useTranslations<"mapAnalysis">>;

function whenLabel(t: Translate, when: MapAnalysisWhen): string {
  if (when.kind === "today") return t("when.today");
  if (when.kind === "yesterday") return t("when.yesterday");
  return t("when.days", { days: when.days });
}

function pillLabel(t: Translate, pill: MapAnalysisPill, percent: number): string {
  switch (pill.kind) {
    case "full":
      return t("pill.full", { percent, number: pill.number, when: whenLabel(t, pill.when) });
    case "shareOnly":
      return t("pill.shareOnly", { percent });
    case "running":
      return t("pill.running", { percent });
    case "noShare":
      return t("pill.noShare", { number: pill.number, when: whenLabel(t, pill.when) });
  }
}

function rowChangeLabel(t: Translate, row: MapAnalysisRow): string {
  const counts = { added: row.added, changed: row.changed };
  if (row.after === null) return t("panel.rowNoShare", counts);
  if (row.before === null) return t("panel.rowFirst", { after: row.after, ...counts });
  return t("panel.rowChange", { before: row.before, after: row.after, ...counts });
}

/**
 * The map's code analysis chip: share on the map, which analysis, how long ago. A press opens a
 * short panel under it (share, when it was counted, the last five analyses, the next step) and the
 * chip stays pressed; a second press, Escape or a press outside closes it.
 */
export function MapAnalysisChip({ model, canMapTheRest, onMapTheRest }: MapAnalysisChipProps) {
  const t = useTranslations("mapAnalysis");
  const tWorkCard = useTranslations("workCard.mapping");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<LanePopoverAlign>("start");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sharePercent = model.share?.percent ?? 0;
  const drawnPercent = useCountUp(sharePercent, undefined, { animateChanges: true, intro: false });
  const label = pillLabel(t, model.pill, drawnPercent);
  const restingLabel = pillLabel(t, model.pill, sharePercent);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // Captured on the window, so Escape closes with focus anywhere and the map's Esc ladder stays out.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, close]);

  const { share, counted, rows, earlier, record, offMap } = model;
  return (
    <div
      ref={rootRef}
      className="topology-chrome-in relative min-w-0 shrink"
      data-testid="map-analysis-chip"
      data-pill={model.pill.kind}
      data-record={record}
      data-lane-popover={open ? "open" : undefined}
    >
      <ChromeChip
        ref={triggerRef}
        onClick={() => {
          if (open) {
            close(false);
            return;
          }
          setAlign(resolveLanePopoverAlign(rootRef.current, PANEL_WIDTH));
          setOpen(true);
        }}
        active={open}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("pill.label", { summary: restingLabel })}
        data-testid="map-analysis-chip-trigger"
        className="max-w-full tabular-nums"
      >
        {label}
      </ChromeChip>
      <Surface
        open={open}
        origin={align === "end" ? "top right" : "top left"}
        role="group"
        aria-label={t("panel.title")}
        data-testid="map-analysis-panel"
        className={`absolute ${align === "end" ? "right-0" : "left-0"} top-[calc(100%+8px)] z-30 w-[320px] max-w-[calc(100vw-2rem)] rounded-card border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]`}
      >
        <div className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t("panel.title")}
        </div>
        <div className="flex flex-col gap-3 px-3 py-3">
          {share ? (
            <div className="flex flex-col gap-1">
              <p className="text-body leading-body text-[color:var(--color-text-primary)]" data-testid="map-analysis-share">
                {offMap === 0
                  ? t("panel.shareAll", { total: share.total })
                  : t("panel.share", { mapped: share.mapped, total: share.total, percent: share.percent })}
              </p>
              {counted ? (
                <p className="text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="map-analysis-counted">
                  {t("panel.counted", { number: counted.number, when: whenLabel(t, counted.when) })}
                </p>
              ) : null}
            </div>
          ) : null}
          {rows.length > 0 ? (
            <section aria-label={t("panel.listTitle")} className="flex flex-col gap-1.5">
              <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t("panel.listTitle")}
              </h3>
              <ol className="flex flex-col gap-2" data-testid="map-analysis-rows">
                {rows.map((row) => {
                  const date = format.dateTime(new Date(row.at), { month: "short", day: "numeric" });
                  return (
                    <li key={row.id} className="flex flex-col gap-0.5" data-testid="map-analysis-row">
                      <span className="truncate text-body leading-body text-[color:var(--color-text-secondary)]">
                        {row.agent
                          ? t("panel.row", { number: row.number, date, agent: row.agent })
                          : t("panel.rowNoAgent", { number: row.number, date })}
                      </span>
                      <span className="text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
                        {rowChangeLabel(t, row)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {earlier > 0 ? (
                <p className="text-label leading-label text-[color:var(--color-text-quaternary)]" data-testid="map-analysis-earlier">
                  {t("panel.earlier", { count: earlier })}
                </p>
              ) : null}
            </section>
          ) : null}
          {record === "absent" ? (
            <div className="flex flex-col gap-1" data-testid="map-analysis-no-record">
              <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t("panel.noRecord")}</p>
              <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t("panel.where")}</p>
            </div>
          ) : null}
          {record === "unreadable" ? (
            <p className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="map-analysis-unreadable">
              {t("panel.unreadable")}
            </p>
          ) : null}
          {offMap > 0 ? (
            canMapTheRest ? (
              <div className="flex flex-col items-start gap-1.5 border-t border-[color:var(--topology-floating-panel-divider)] pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="map-analysis-map-rest"
                  onClick={() => {
                    close(false);
                    onMapTheRest();
                  }}
                >
                  {tWorkCard("startTitle")}
                </Button>
                <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t("action.mapRestHelp")}</p>
              </div>
            ) : (
              <p
                className="border-t border-[color:var(--topology-floating-panel-divider)] pt-3 text-label leading-label text-[color:var(--color-text-tertiary)]"
                data-testid="map-analysis-web-analyze"
              >
                {t("web.analyze")}
              </p>
            )
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
