import { TopologyV2KindGlyph, TopologyV2TraceMark } from "@/shared/ui";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import type { DependsOnPairRow } from "../../lib/depends-on-rows";
import type { HubEgoThumbnail } from "../../lib/hub-ego-thumbnail";

export interface RelationHubRow {
  id: string;
  title: string;
  kind: string;
  degree: number;
  thumbnail: HubEgoThumbnail;
}

export interface RelationsTabLabels {
  relationTypesTitle: string;
  topDependsOnTitle: string;
  noDependsOn: string;
  hubsTitle: string;
  noHubs: string;
  connectionsUnit: string;
  hubTruncated: (shown: number, total: number) => string;
  hubThumbnailCaption: string;
  agentReadinessTitle: string;
  agentReadinessReady: string;
  agentReadinessPreflight: string;
  agentReadinessReview: string;
}

export interface RelationsTabAgentReadiness {
  ready: number;
  preflight: number;
  review: number;
}

export interface RelationsTabProps {
  edgeTypeRows: Array<{ type: string; count: number }>;
  totalEdges: number;
  edgeTypeLabel: (type: string) => string;
  dependsOnRows: DependsOnPairRow[];
  hubs: RelationHubRow[];
  hubTotalCount: number;
  kindLabel: (kind: string) => string;
  /** relation evidence quality rolled up into a handoff-readiness read — ready
   *  (strong ∪ supported evidence) / preflight (weak, `related_to`) / review
   *  (no evidence yet). Derivation: `classifyRelationQuality` +
   *  `summarizeAgentReadiness` (`@/entities/knowledge-graph`) — moved here
   *  from the topology map's overview mode (W3 분석 보기 은퇴), which is now
   *  the single place this reads before an agent starts writing relations. */
  agentReadiness: RelationsTabAgentReadiness;
  labels: RelationsTabLabels;
}

/**
 * 탭2 관계 — insights-final.html frame 2. Agent readiness 계기(3구 요약 +
 * 분포 바) + 관계 타입 mega row(trace-mark 범례 그대로) + 상위 depends_on +
 * 허브(52px 미니 ego 썸네일, 실제 이웃 수/타입에서 유도).
 */
export function RelationsTab({
  edgeTypeRows,
  totalEdges,
  edgeTypeLabel,
  dependsOnRows,
  hubs,
  hubTotalCount,
  kindLabel,
  agentReadiness,
  labels,
}: RelationsTabProps) {
  const edgeMax = edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0);
  const readinessTotal = agentReadiness.ready + agentReadiness.preflight + agentReadiness.review;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-[1.2fr_1fr]">
      <section
        aria-label={labels.relationTypesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div
          aria-label={`${labels.agentReadinessTitle}: ${agentReadiness.ready} ${labels.agentReadinessReady} · ${agentReadiness.preflight} ${labels.agentReadinessPreflight} · ${agentReadiness.review} ${labels.agentReadinessReview}`}
          data-testid="insights-agent-readiness"
          className="mb-3.5 border-b border-[color:var(--color-divider)] pb-3.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.agentReadinessTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11.5px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {agentReadiness.ready} <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">{labels.agentReadinessReady}</span>
              </span>
              <span>
                {agentReadiness.preflight} <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">{labels.agentReadinessPreflight}</span>
              </span>
              <span>
                {agentReadiness.review} <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">{labels.agentReadinessReview}</span>
              </span>
            </span>
          </div>
          <div
            data-testid="insights-agent-readiness-meter"
            className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)]"
          >
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-ready-meter,var(--color-overlay-3))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.ready : 1 }}
            />
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-preflight-meter,var(--color-status-warning))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.preflight : 0 }}
            />
            <span
              aria-hidden
              className="bg-[color:var(--topology-overview-readiness-review-meter,var(--color-status-danger))]"
              style={{ flexGrow: readinessTotal > 0 ? agentReadiness.review : 0 }}
            />
          </div>
        </div>
        <CardHead label={labels.relationTypesTitle} gcap="relation breakdown" count={totalEdges} />
        <div className="mt-1 flex flex-col">
          {edgeTypeRows.map((row) => {
            const width = edgeMax > 0 ? Math.max(2, Math.round((row.count / edgeMax) * 100)) : 0;
            const pct = totalEdges > 0 ? Math.round((row.count / totalEdges) * 100) : 0;
            return (
              <div
                key={row.type}
                className="flex items-center gap-3.5 border-t border-[color:var(--color-divider)] py-3.5 first:border-t-0"
              >
                <TopologyV2TraceMark containment={isContainmentRelation(row.type)} />
                <span className="w-[112px] flex-none font-mono text-[13px] text-[color:var(--color-text-primary)]">
                  {edgeTypeLabel(row.type)}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                  <span
                    className="block h-full rounded-full bg-[color:var(--color-overlay-3)]"
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="min-w-[52px] flex-none text-right">
                  <span className="block font-mono text-[15px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {row.count}
                  </span>
                  <span className="block font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">{pct}%</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">{labels.topDependsOnTitle}</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            top depends_on
          </span>
        </div>
        <div className="mt-1 flex flex-1 flex-col justify-evenly">
          {dependsOnRows.length === 0 ? (
            <p className="py-2 text-[12px] text-[color:var(--color-text-quaternary)]">{labels.noDependsOn}</p>
          ) : (
            dependsOnRows.map((row) => (
              <div
                key={`${row.fromId}->${row.toId}`}
                className="flex items-center gap-2.5 border-t border-[color:var(--color-divider)] py-2.5 text-[13px] text-[color:var(--color-text-secondary)] first:border-t-0"
              >
                <TopologyV2TraceMark containment={false} />
                <span className="min-w-0 truncate">{row.fromTitle}</span>
                <span className="flex-none text-[color:var(--color-text-quaternary)]">→</span>
                <span className="min-w-0 truncate">{row.toTitle}</span>
                <span className="ml-auto flex-none font-mono text-[12.5px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                  {row.count}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section
        aria-label={labels.hubsTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
            {labels.hubsTitle}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            hubs by degree
          </span>
        </div>
        <div className="mt-2 flex flex-1 flex-col">
          {hubs.length === 0 ? (
            <p className="py-2 text-[12px] text-[color:var(--color-text-quaternary)]">{labels.noHubs}</p>
          ) : (
            hubs.map((hub) => (
              <div
                key={hub.id}
                className="flex items-center gap-3.5 border-t border-[color:var(--color-divider)] py-2.5 first:border-t-0"
              >
                <HubEgoThumbnailSvg kind={hub.kind} thumbnail={hub.thumbnail} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[color:var(--color-text-primary)]">
                    {hub.title}
                  </span>
                  <span className="block text-[11px] text-[color:var(--color-text-quaternary)]">{kindLabel(hub.kind)}</span>
                </span>
                <span className="flex-none text-right">
                  <span className="block font-mono text-[18px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {hub.degree}
                  </span>
                  <span className="block font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {labels.connectionsUnit}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
        {hubTotalCount > hubs.length ? (
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-[11px] text-[color:var(--color-text-quaternary)]">
            {labels.hubTruncated(hubs.length, hubTotalCount)}
          </p>
        ) : null}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-[11px] text-[color:var(--color-text-quaternary)]">
          {labels.hubThumbnailCaption}
        </p>
      </section>
    </div>
  );
}

function CardHead({ label, gcap, count }: { label: string; gcap: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">{label}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {gcap}
      </span>
      <span className="ml-auto font-mono text-[13px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {count}
      </span>
    </div>
  );
}

/** 52px 미니 ego 썸네일 — 실제 degree/스포크 데이터(`buildHubEgoThumbnail`)를 그대로 그린다. */
function HubEgoThumbnailSvg({ kind, thumbnail }: { kind: string; thumbnail: HubEgoThumbnail }) {
  const s = 52;
  const c = s / 2;
  const r = c - 5;
  return (
    <span className="relative inline-flex flex-none" style={{ width: s, height: s }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="absolute inset-0">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-divider)" strokeWidth={1} />
        {thumbnail.spokes.map((spoke, i) => {
          // toFixed(2) — SSR/CSR 부동소수점 문자열 직렬화가 미세하게 달라
          // hydration mismatch 를 내던 회귀(`y2`/`cy` 마지막 자리 drift)를
          // 고정 소수 자릿수로 차단. 52px 썸네일에서 0.01px 반올림은 육안 무영향.
          const x2 = (c + Math.cos(spoke.angle) * r).toFixed(2);
          const y2 = (c + Math.sin(spoke.angle) * r).toFixed(2);
          return (
            <g key={i}>
              <line
                x1={c}
                y1={c}
                x2={x2}
                y2={y2}
                stroke={spoke.dashed ? "var(--topology-v2-edge-depends)" : "var(--topology-v2-edge-contains)"}
                strokeWidth={1}
                strokeDasharray={spoke.dashed ? "2 2.4" : undefined}
              />
              <circle cx={x2} cy={y2} r={1.8} fill="var(--topology-v2-node-fill-element)" stroke="var(--topology-v2-node-stroke-element)" strokeWidth={0.8} />
            </g>
          );
        })}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <TopologyV2KindGlyph kind={kind} size={16} />
      </span>
    </span>
  );
}
