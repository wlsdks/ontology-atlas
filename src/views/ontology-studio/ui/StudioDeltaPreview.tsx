"use client";

/**
 * 저장 미리보기 모달 — `StudioCompass.tsx` 에서 갈라져 나온 첫 조각 (2026-08-13).
 *
 * 그 파일은 3,523줄로 이 저장소에서 가장 컸다. 이 블록(미니 로즈 좌표계 · 위성
 * 배치 · 스크림 모달)은 나침 무대 본체와 상수도 상태도 공유하지 않는 자기완결
 * SVG 층이라 경계가 가장 깨끗했다. 타입만 본체에서 되가져온다(type-only 라
 * 순환이 아니다).
 */

import { X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { IconButton, Surface, controlClass } from "@/shared/ui";
import type { StudioBearing } from "../lib/build-studio-item";
import type { DeltaPreviewLayout, DeltaSatellite, DeltaSatelliteState } from "../lib/build-delta-preview";
import type { StudioCompassLabels } from "./StudioCompass";

/**
 * A scrim modal that answers "저장하면 지도가 이렇게 변해요" at the confirm moment.
 * The focal node's EXISTING neighborhood renders achromatic (context only); only
 * the staged delta is indigo — added neighbors solid, moved nodes at their new
 * bearing, cut edges dashed + struck. Below the diagram the SAME plain sentence
 * list (`summary`) so the picture and the words never disagree. Commits directly
 * from the footer (the one-click save contract) or closes (✕ / scrim / Esc).
 *
 * A compact self-contained SVG mini-graph — NOT the heavy canvas engine — reusing
 * the compass strut/bearing primitives at small scale.
 */
const MINI = { w: 520, h: 300 } as const;
const MCX = MINI.w / 2; // 260
const MCY = MINI.h / 2; // 150
const MC = { w: 152, h: 52 } as const;
const MS = { w: 130, h: 30, gap: 8 } as const;
const V_OFF = 30; // vertical gap from center edge to first up/down chip
const H_OFF = 44; // horizontal gap from center edge to first left/right chip

interface PlacedDeltaSat {
  sat: DeltaSatellite;
  x: number;
  y: number;
  strut: string;
}

/** Place one bearing's satellites + return the "+N" overflow chip anchor. */
function placeDeltaBearing(
  bearing: StudioBearing,
  sats: DeltaSatellite[],
): { placed: PlacedDeltaSat[]; overflowAnchor: { x: number; y: number } } {
  const placed: PlacedDeltaSat[] = [];
  if (bearing === "up") {
    const edgeY = MCY - MC.h / 2;
    sats.forEach((sat, i) => {
      const top = edgeY - V_OFF - (i + 1) * MS.h - i * MS.gap;
      placed.push({ sat, x: MCX - MS.w / 2, y: top, strut: `M ${MCX} ${edgeY} V ${top + MS.h}` });
    });
    const lastTop = placed.length ? placed[placed.length - 1].y : edgeY;
    return { placed, overflowAnchor: { x: MCX, y: lastTop - 16 } };
  }
  if (bearing === "down") {
    const edgeY = MCY + MC.h / 2;
    sats.forEach((sat, i) => {
      const top = edgeY + V_OFF + i * (MS.h + MS.gap);
      placed.push({ sat, x: MCX - MS.w / 2, y: top, strut: `M ${MCX} ${edgeY} V ${top}` });
    });
    const lastBottom = placed.length ? placed[placed.length - 1].y + MS.h : edgeY;
    return { placed, overflowAnchor: { x: MCX, y: lastBottom + 6 } };
  }
  // left / right — stacked vertically, centered on MCY.
  const isRight = bearing === "right";
  const edgeX = isRight ? MCX + MC.w / 2 : MCX - MC.w / 2;
  const x = isRight ? edgeX + H_OFF : edgeX - H_OFF - MS.w;
  const n = sats.length;
  const totalH = n * MS.h + Math.max(0, n - 1) * MS.gap;
  const startY = MCY - totalH / 2;
  sats.forEach((sat, i) => {
    const top = startY + i * (MS.h + MS.gap);
    const cy = top + MS.h / 2;
    const meetX = isRight ? x : x + MS.w;
    placed.push({ sat, x, y: top, strut: `M ${edgeX} ${MCY} L ${meetX} ${cy}` });
  });
  const lastBottom = placed.length ? placed[placed.length - 1].y + MS.h : MCY;
  return { placed, overflowAnchor: { x: x + MS.w / 2, y: lastBottom + 6 } };
}

const DELTA_STRUT_STROKE: Record<DeltaSatelliteState, string> = {
  existing: "var(--color-border-strong)",
  added: "var(--color-indigo-brand)",
  moved: "var(--color-indigo-brand)",
  removed: "var(--color-border-strong)",
};

export function DeltaPreviewModal({
  open,
  layout,
  labels,
  kindLabelFor,
  summary,
  canSave,
  onSave,
  onClose,
}: {
  /** 닫힘은 즉시 언마운트가 아니다 — `Surface` 가 퇴장 창을 진다. */
  open: boolean;
  layout: DeltaPreviewLayout;
  labels: StudioCompassLabels;
  kindLabelFor: (kind: string) => string;
  summary: {
    count: number;
    collapsed: string;
    headline: string;
    lines: string[];
    fileEffect: string;
  } | null;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const byBearing: Record<StudioBearing, DeltaSatellite[]> = { up: [], right: [], down: [], left: [] };
  for (const sat of layout.satellites) byBearing[sat.bearing].push(sat);
  const bearings: StudioBearing[] = ["up", "right", "down", "left"];
  const placements = bearings.map((b) => ({
    bearing: b,
    ...placeDeltaBearing(b, byBearing[b]),
    overflow: layout.overflowByBearing[b],
  }));

  const center = layout.center;
  return (
    // 스크림이 화면을 덮는 **큰 표면**이라 밝기 전용 문법을 쓴다
    // (`motion="overlay"`) — 이동/스케일을 걸면 무대 전체가 흔들린 것으로
    // 읽힌다. 스크림과 카드가 한 표면으로 같이 들어오고 같이 나간다.
    <Surface
      open={open}
      motion="overlay"
      data-testid="studio-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={labels.previewTitle}
      className="absolute inset-0 z-[13] flex items-center justify-center bg-[color:var(--color-overlay-2)] px-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-[560px] max-w-full flex-col overflow-hidden rounded-sheet border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]"
        style={{ boxShadow: "var(--shadow-elevation-3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-5 py-3.5">
          <span className="min-w-0 flex-1 truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {labels.previewTitle}
          </span>
          <IconButton
            size="sm"
            tone="muted"
            data-testid="studio-preview-close"
            label={labels.previewCloseAria}
            onClick={onClose}
            className="flex-none hover:text-[color:var(--color-text-secondary)]"
          >
            <X size={ICON_SIZE.md} aria-hidden />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* mini-graph — fixed-coordinate board scrolls in its own gutter on a
              narrow viewport (never breaks the modal's horizontal layout). */}
          <div className="px-5 pt-4">
            <div className="overflow-x-auto">
            <div
              className="relative mx-auto rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
              style={{ width: MINI.w, height: MINI.h }}
              data-testid="studio-preview-graph"
            >
              <svg
                className="pointer-events-none absolute left-0 top-0 h-full w-full"
                viewBox={`0 0 ${MINI.w} ${MINI.h}`}
                aria-hidden
              >
                {placements.flatMap((p) =>
                  p.placed.map((ps, i) => (
                    <path
                      key={`${p.bearing}-${i}`}
                      d={ps.strut}
                      fill="none"
                      strokeLinecap="round"
                      stroke={DELTA_STRUT_STROKE[ps.sat.state]}
                      strokeWidth={ps.sat.state === "existing" || ps.sat.state === "removed" ? 1.25 : 1.75}
                      strokeDasharray={ps.sat.state === "removed" ? "3 4" : undefined}
                    />
                  )),
                )}
              </svg>

              {/* center focal / new node */}
              <div
                data-testid="studio-preview-center"
                className="absolute flex flex-col justify-center rounded-card px-3"
                style={{
                  left: MCX - MC.w / 2,
                  top: MCY - MC.h / 2,
                  width: MC.w,
                  height: MC.h,
                  border: center.isNew ? "1.5px solid var(--color-indigo-brand)" : "1px solid var(--color-border-strong)",
                  background: center.isNew ? "var(--color-indigo-a08)" : "var(--color-panel)",
                }}
              >
                {center.isNew ? (
                  <span className="mb-0.5 inline-flex w-fit items-center rounded-micro bg-[color:var(--color-indigo-a16)] px-1 py-px text-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-label)] text-[color:var(--color-indigo-text-soft)]">
                    {labels.previewCenterNew}
                  </span>
                ) : null}
                <span className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
                  {center.title}
                </span>
                <span className="truncate text-label text-[color:var(--color-text-quaternary)]">
                  {kindLabelFor(center.kind)}
                  {center.domainLabel ? ` · ${center.domainLabel}` : ""}
                </span>
              </div>

              {/* satellites */}
              {placements.flatMap((p) =>
                p.placed.map((ps) => <DeltaSatChip key={ps.sat.node.id + ps.sat.state} placed={ps} labels={labels} />),
              )}

              {/* per-bearing overflow "+N" */}
              {placements
                .filter((p) => p.overflow > 0)
                .map((p) => (
                  <span
                    key={`overflow-${p.bearing}`}
                    data-testid={`studio-preview-overflow-${p.bearing}`}
                    className="absolute -translate-x-1/2 whitespace-nowrap rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-1.5 py-px text-label text-[color:var(--color-text-quaternary)]"
                    style={{ left: p.overflowAnchor.x, top: p.overflowAnchor.y }}
                  >
                    {labels.previewOverflow(p.overflow)}
                  </span>
                ))}
            </div>
            </div>

            {/* legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <LegendItem swatch="existing" label={labels.previewLegendExisting} />
              <LegendItem swatch="added" label={labels.previewLegendAdded} />
              {layout.counts.moved > 0 ? <LegendItem swatch="moved" label={labels.previewLegendMoved} /> : null}
              {layout.counts.removed > 0 ? <LegendItem swatch="removed" label={labels.previewLegendRemoved} /> : null}
            </div>
          </div>

          {/* the SAME plain sentence list */}
          {summary ? (
            <div className="mt-4 border-t border-[color:var(--color-divider)] px-5 py-3.5" data-testid="studio-preview-summary">
              <p className="text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] [word-break:keep-all]">
                {summary.headline}
              </p>
              {summary.lines.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {summary.lines.map((line, i) => (
                    <li
                      key={`${line}-${i}`}
                      className="flex items-start gap-2 text-caption text-[color:var(--color-text-tertiary)]"
                    >
                      <span aria-hidden className="mt-1.5 h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
                      <span className="min-w-0 flex-1 [word-break:keep-all]">{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {summary.fileEffect ? (
                <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">{summary.fileEffect}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* footer — one indigo save (commits directly) + quiet close */}
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
          <button
            type="button"
            data-testid="studio-preview-dismiss"
            onClick={onClose}
            className={controlClass({
              shape: "segment",
              size: "lg",
              className: "hover:text-[color:var(--color-text-secondary)]",
            })}
          >
            {labels.previewClose}
          </button>
          <button
            type="button"
            data-testid="studio-preview-save"
            disabled={!canSave}
            onClick={onSave}
            className={controlClass({
              shape: "card",
              size: "md",
              tone: "onAccent",
              className: "hover:bg-[color:var(--color-indigo-brand-hover)]",
            })}
          >
            {labels.save}
          </button>
        </div>
      </div>
    </Surface>
  );
}

/** One placed satellite chip — encoding by delta state (achromatic vs indigo). */
function DeltaSatChip({ placed, labels }: { placed: PlacedDeltaSat; labels: StudioCompassLabels }) {
  const { sat, x, y } = placed;
  const state = sat.state;
  const indigo = state === "added" || state === "moved";
  const removed = state === "removed";
  return (
    <div
      data-testid={`studio-preview-sat-${state}`}
      data-node-id={sat.node.id}
      className="absolute flex items-center gap-1.5 rounded-card px-2"
      style={{
        left: x,
        top: y,
        width: MS.w,
        height: MS.h,
        border: indigo
          ? "1.5px solid var(--color-indigo-brand)"
          : removed
            ? "1.25px dashed var(--color-border-strong)"
            : "1px solid var(--color-border-soft)",
        background: indigo ? "var(--color-indigo-a08)" : "var(--color-panel)",
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none rounded-full"
        style={{
          background: indigo ? "var(--color-indigo-brand)" : "var(--color-text-quaternary)",
          opacity: removed ? 0.5 : 1,
        }}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-label [word-break:keep-all]",
          indigo ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-tertiary)]",
          removed && "text-[color:var(--color-text-quaternary)] line-through",
        )}
      >
        {sat.node.title}
      </span>
      {state === "moved" ? (
        <span className="flex-none rounded-micro bg-[color:var(--color-indigo-a16)] px-1 text-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)]">
          {labels.previewMovedChip}
        </span>
      ) : removed ? (
        <span className="flex-none rounded-micro border border-[color:var(--color-border-soft)] px-1 text-label text-[color:var(--color-text-quaternary)]">
          {labels.previewRemovedChip}
        </span>
      ) : null}
    </div>
  );
}

/** Legend swatch matching the graph encoding. */
function LegendItem({ swatch, label }: { swatch: DeltaSatelliteState; label: string }) {
  const indigo = swatch === "added" || swatch === "moved";
  const removed = swatch === "removed";
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 flex-none rounded-micro"
        style={{
          border: indigo
            ? "1.5px solid var(--color-indigo-brand)"
            : removed
              ? "1.25px dashed var(--color-border-strong)"
              : "1px solid var(--color-border-soft)",
          background: indigo ? "var(--color-indigo-a08)" : "transparent",
        }}
      />
      {label}
    </span>
  );
}
