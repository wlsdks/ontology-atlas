"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback } from "react";
import { X } from "lucide-react";
import {
  formatV2MetricLine,
  type V2ConnectionGroupsView,
  type V2ConnectionGroupView,
  type V2MetricValues,
} from "./topology-v2-datasheet";

/**
 * topology-map-v2 "component datasheet" node panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5). Rendered ONLY when the
 * `atlas:feature:topology-map-v2` flag is on — the flag-off path keeps the
 * shared `TopologyNodePopover` byte-identical, so the Sigma engine is
 * untouched (lead design decision). Re-presents the SAME selection facts the
 * shared popover derives, at instrument density: a kind-shape miniature +
 * power dot header, ONE engraved metric line (no triplication), connections
 * grouped by relation type with a canvas-matching trace mini-line (no badge
 * pile), and an agent-handoff copy row.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--topology-v2-panel-*` tokens.
 */

export interface TopologyV2DetailPanelLabels {
  kindLabel: string;
  poweredOn: string;
  poweredOff: string;
  metricUsedBy: string;
  metricDependsOn: string;
  metricEvidence: string;
  groupContains: string;
  groupDepends: string;
  noConnections: string;
  handoff: string;
  close: string;
}

export interface TopologyV2DetailPanelProps {
  slug: string;
  title: string;
  kind: string;
  /** "전원" — powered (recently updated / fresh) vs unpowered (quiet). */
  powered: boolean;
  metric: V2MetricValues;
  /** Connections grouped by relation type, each with a capped row preview + the
   * group's true total — so a contains-hub's depends group renders its real
   * count instead of collapsing into a generic overflow. */
  groups: V2ConnectionGroupsView;
  /** Pre-built agent handoff payload; the view owns clipboard + toast. */
  handoffText: string;
  labels: TopologyV2DetailPanelLabels;
  onSelectConnection: (id: string) => void;
  onCopyHandoff: (text: string) => void;
  onClose: () => void;
  className?: string;
}

type RenderableKind = "project" | "domain" | "capability" | "element";

function isRenderableKind(kind: string): kind is RenderableKind {
  return (
    kind === "project" ||
    kind === "domain" ||
    kind === "capability" ||
    kind === "element"
  );
}

/**
 * The kind-shape miniature — the same silhouette family the v2 canvas draws
 * (hex = project, chip = domain, circle = capability, via-pad = element),
 * stroked/filled with the shared `--topology-v2-node-*` kind tokens so the
 * header reads as a shrunk copy of the node on the map.
 */
function KindGlyph({ kind }: { kind: string }) {
  const resolved: RenderableKind = isRenderableKind(kind) ? kind : "element";
  const fill = `var(--topology-v2-node-fill-${resolved})`;
  const stroke = `var(--topology-v2-node-stroke-${resolved})`;
  const s = 15;
  const c = s / 2;
  const common = {
    fill,
    stroke,
    strokeWidth: 1.25,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      data-kind-glyph={resolved}
      className="shrink-0"
    >
      {resolved === "project" ? (
        // hexagon (flat-top-ish, matching canvas hexPoints)
        <polygon points={hexPoints(c, c, c - 1.2)} {...common} />
      ) : resolved === "domain" ? (
        // chip — wider rounded rectangle
        <rect x={1} y={3.4} width={s - 2} height={s - 6.8} rx={1.6} {...common} />
      ) : resolved === "capability" ? (
        <circle cx={c} cy={c} r={c - 1.6} {...common} />
      ) : (
        // via-pad — square with a drilled hole
        <g>
          <rect x={2.4} y={2.4} width={s - 4.8} height={s - 4.8} rx={1.4} {...common} />
          <circle cx={c} cy={c} r={1.5} fill="var(--topology-v2-node-hole-fill)" stroke="none" />
        </g>
      )}
    </svg>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Trace mini-line matching the canvas edge style: contains = solid hairline,
 * depends = dashed. One compact marker per group, drawn once in the group
 * header — never per row.
 */
function TraceMark({ group }: { group: "contains" | "depends" }) {
  const stroke =
    group === "contains"
      ? "var(--topology-v2-edge-contains-mark)"
      : "var(--topology-v2-edge-depends-mark)";
  return (
    <svg width={22} height={6} viewBox="0 0 22 6" aria-hidden="true" className="shrink-0">
      <line
        x1={1}
        y1={3}
        x2={21}
        y2={3}
        stroke={stroke}
        strokeWidth={1.4}
        strokeDasharray={group === "depends" ? "3 3" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TopologyV2DetailPanel({
  slug,
  title,
  kind,
  powered,
  metric,
  groups,
  handoffText,
  labels,
  onSelectConnection,
  onCopyHandoff,
  onClose,
  className,
}: TopologyV2DetailPanelProps) {
  const metricLine = formatV2MetricLine(metric, {
    usedBy: labels.metricUsedBy,
    dependsOn: labels.metricDependsOn,
    evidence: labels.metricEvidence,
  });
  const hasConnections = groups.contains.total > 0 || groups.depends.total > 0;

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const renderGroup = (
    group: "contains" | "depends",
    label: string,
    view: V2ConnectionGroupView,
  ) => {
    if (view.total === 0) return null;
    const overflow = view.total - view.rows.length;
    return (
      <div className="flex flex-col gap-1" data-datasheet-group={group}>
        <div className="flex items-center gap-2">
          <TraceMark group={group} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {label}
          </span>
          <span
            data-datasheet-group-total={group}
            className="font-mono text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            {view.total}
          </span>
        </div>
        <ul className="flex flex-col">
          {view.rows.map((row) => (
            <li key={`${group}:${row.id}`}>
              <button
                type="button"
                onClick={() => onSelectConnection(row.id)}
                data-datasheet-connection={row.id}
                className="flex w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-1 text-left transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {overflow > 0 ? (
          <span
            data-datasheet-group-overflow={group}
            className="pl-[30px] font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]"
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={title}
      data-testid="topology-v2-detail-panel"
      data-datasheet-density="instrument"
      onKeyDown={handleKeyDown}
      className={[
        "flex w-[var(--topology-v2-panel-width)] flex-col gap-[var(--topology-v2-panel-gap)]",
        "rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]",
        "bg-[color:var(--topology-v2-panel-surface)] p-[var(--topology-v2-panel-pad)]",
        "shadow-[var(--topology-v2-panel-shadow)]",
        className ?? "",
      ].join(" ")}
    >
      {/* Header — kind miniature + name + power dot + close */}
      <div className="flex items-start gap-2">
        <div className="mt-[1px]">
          <KindGlyph kind={kind} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              data-power-state={powered ? "on" : "off"}
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: powered
                  ? "var(--topology-v2-panel-power-on)"
                  : "var(--topology-v2-panel-power-off)",
              }}
            />
            <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 pl-[13.5px]">
            <span className="text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)]">
              {labels.kindLabel}
            </span>
            <span className="text-[10px] text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
            <span className="text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
              {powered ? labels.poweredOn : labels.poweredOff}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          data-testid="topology-v2-detail-panel-close"
          className="-mr-1 -mt-1 shrink-0 rounded-[var(--topology-v2-panel-row-radius)] p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* One engraved metric line — no subtitle + boxes triplication */}
      <div
        data-datasheet-metric="engraved"
        className="rounded-[var(--topology-v2-panel-row-radius)] bg-[color:var(--topology-v2-panel-metric-surface)] px-2 py-1.5"
      >
        <span className="font-mono text-[11.5px] tracking-[0.01em] text-[color:var(--topology-v2-panel-metric-text)]">
          {metricLine}
        </span>
      </div>

      {/* Connections grouped by relation type */}
      <div className="flex flex-col gap-2.5">
        {hasConnections ? (
          <>
            {renderGroup("contains", labels.groupContains, groups.contains)}
            {renderGroup("depends", labels.groupDepends, groups.depends)}
          </>
        ) : (
          <span className="text-[11.5px] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.noConnections}
          </span>
        )}
      </div>

      {/* Agent-handoff row */}
      <div className="flex items-center gap-2 border-t border-[color:var(--topology-v2-panel-divider)] pt-2">
        <button
          type="button"
          onClick={() => onCopyHandoff(handoffText)}
          data-testid="topology-v2-detail-panel-handoff"
          className="flex items-center gap-1.5 rounded-[var(--topology-v2-panel-row-radius)] border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2 py-1 text-[11px] font-medium text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
        >
          {labels.handoff}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)]">
          {slug}
        </span>
      </div>
    </div>
  );
}
