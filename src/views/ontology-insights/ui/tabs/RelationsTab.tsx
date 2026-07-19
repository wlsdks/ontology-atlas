import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph, TopologyV2TraceMark } from "@/shared/ui";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import { getOntologyKindTone } from "@/entities/ontology-class";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { DependsOnPairRow } from "../../lib/depends-on-rows";
import type { HubEgoThumbnail } from "../../lib/hub-ego-thumbnail";
import { relationTypeIndigo } from "../../lib/relation-type-tone";

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
  repairQueueTitle: string;
  repairQueueStale: string;
  repairQueueOrphan: string;
  repairQueuePromotion: string;
  repairQueueEmpty: string;
  repairQueueTargetLabel: string;
  repairQueueActionKindStale: string;
  repairQueueActionKindOrphan: string;
  repairQueueActionKindPromotion: string;
  repairQueueOpenBuilder: string;
  repairQueueOpenOntology: string;
}

export interface RelationsTabAgentReadiness {
  ready: number;
  preflight: number;
  review: number;
}

export interface RelationsTabHealthQueue {
  staleCount: number;
  orphanCount: number;
  promotionCount: number;
  actionTarget: OntologyHealthActionTarget | null;
  builderHref: (slug: string) => string;
  ontologyHref: (slug: string) => string;
}

export interface RelationsTabHubLink {
  /** 허브 행 클릭 → 지도 노드 포커스 딥링크 (`buildOntologyNodeHref`). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
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
  /** 수리 큐 — 분석 패널 완전 소멸 2단계 §c 로 지도 좌측 레일의 health 모드
   *  에서 이관. `buildOntologyHealthActionTarget`(entities 레벨, 지도의 health
   *  칩과 같은 소스)로 고른 다음 수리 대상 + 빌더 ?node= 딥링크. */
  healthQueue: RelationsTabHealthQueue;
  hubLink: RelationsTabHubLink;
  labels: RelationsTabLabels;
}

/**
 * 탭2 관계 — insights-final.html frame 2. Agent readiness 계기(3구 요약 +
 * 분포 바) + 관계 타입 mega row(trace-mark 범례 그대로, 인디고 농도 스케일로
 * 색 구분 — `relationTypeIndigo`, contains/belongs_to 가장 짙고 나머지는
 * 옅어짐) + 상위 depends_on + 허브(52px 미니 ego 썸네일, kind 색 data mark:
 * 중심 = 허브 자신의 kind 톤, 스포크/이웃은 옅은 tint — 실제 이웃 수/타입에서
 * 유도, degree 옆 상대 미터 바 추가).
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
  healthQueue,
  hubLink,
  labels,
}: RelationsTabProps) {
  const edgeMax = edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0);
  // hubs 는 이미 degree 내림차순 — hubs[0] 이 이 목록 안의 최대치.
  const hubDegreeMax = hubs.reduce((m, h) => Math.max(m, h.degree), 0);
  const readinessTotal = agentReadiness.ready + agentReadiness.preflight + agentReadiness.review;
  const repairActionKindLabel = healthQueue.actionTarget
    ? healthQueue.actionTarget.kind === "stale"
      ? labels.repairQueueActionKindStale
      : healthQueue.actionTarget.kind === "orphan"
        ? labels.repairQueueActionKindOrphan
        : labels.repairQueueActionKindPromotion
    : null;

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
        <div
          data-testid="insights-repair-queue"
          className="mb-3.5 border-b border-[color:var(--color-divider)] pb-3.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {labels.repairQueueTitle}
            </span>
            <span className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11.5px] tabular-nums text-[color:var(--topology-v2-numeral-face)]">
              <span>
                {healthQueue.staleCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueStale}
                </span>
              </span>
              <span>
                {healthQueue.orphanCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueueOrphan}
                </span>
              </span>
              <span>
                {healthQueue.promotionCount}{" "}
                <span className="text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {labels.repairQueuePromotion}
                </span>
              </span>
            </span>
          </div>
          {healthQueue.actionTarget ? (
            <div
              data-testid="insights-repair-queue-target"
              className="mt-2.5 flex min-w-0 items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[color:var(--color-text-secondary)]">
                {repairActionKindLabel ? (
                  <span className="shrink-0 rounded border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--color-text-tertiary)]">
                    {repairActionKindLabel}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">{healthQueue.actionTarget.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={healthQueue.builderHref(healthQueue.actionTarget.slug)}
                  data-testid="insights-repair-queue-builder-link"
                  className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                >
                  {labels.repairQueueOpenBuilder}
                </Link>
                <Link
                  href={healthQueue.ontologyHref(healthQueue.actionTarget.slug)}
                  className="inline-flex min-h-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  {labels.repairQueueOpenOntology}
                </Link>
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[color:var(--color-text-quaternary)]">
              {labels.repairQueueEmpty}
            </p>
          )}
        </div>
        <CardHead label={labels.relationTypesTitle} gcap="relation breakdown" count={totalEdges} />
        <div
          aria-hidden
          className="mt-2 flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)]"
        >
          {edgeTypeRows.map((row) => {
            const share = totalEdges > 0 ? row.count / totalEdges : 0;
            if (share <= 0) return null;
            return <span key={row.type} style={{ flexGrow: share, backgroundColor: relationTypeIndigo(row.type) }} />;
          })}
        </div>
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
                    className="block h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: relationTypeIndigo(row.type) }}
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
            hubs.map((hub) => {
              const meterPct = hubDegreeMax > 0 ? Math.max(6, Math.round((hub.degree / hubDegreeMax) * 100)) : 0;
              return (
              <Link
                key={hub.id}
                href={hubLink.href(hub.id)}
                aria-label={hubLink.ariaLabel(hub.title)}
                data-testid="insights-hub-row-link"
                className="-mx-1.5 flex items-center gap-3.5 rounded-md border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors first:border-t-0 hover:bg-[color:var(--color-overlay-1)]"
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
                  <span
                    aria-hidden
                    className="mt-1 block h-1 w-14 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${meterPct}%`, backgroundColor: "rgba(94, 106, 210, 0.7)" }}
                    />
                  </span>
                </span>
              </Link>
              );
            })
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

/**
 * 52px 미니 ego 썸네일 — 실제 degree/스포크 데이터(`buildHubEgoThumbnail`)를
 * 그대로 그린다. 색은 허브 자신의 kind 톤(`getOntologyKindTone`) 하나로
 * 통일 — 링/스포크는 옅은 tint(이웃), 중심 원판은 진한 fill(허브 자신)이라
 * "중심 노드 kind 색, 이웃은 옅게" 데이터 마크 규칙을 그대로 따른다. 실선/
 * 파선(contains/depends) 구분은 그대로 유지 — 색은 kind, 선 스타일은 관계
 * 타입이라는 두 가지 다른 사실을 하나의 마크에 겹치지 않는다.
 */
function HubEgoThumbnailSvg({ kind, thumbnail }: { kind: string; thumbnail: HubEgoThumbnail }) {
  const s = 52;
  const c = s / 2;
  const r = c - 5;
  const tone = getOntologyKindTone(kind);
  return (
    <span className="relative inline-flex flex-none" style={{ width: s, height: s }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="absolute inset-0">
        <circle cx={c} cy={c} r={r} fill="none" stroke={tone.chipBorder} strokeWidth={1} />
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
                stroke={tone.chipBorder}
                strokeWidth={1}
                strokeDasharray={spoke.dashed ? "2 2.4" : undefined}
              />
              <circle cx={x2} cy={y2} r={1.8} fill={tone.chipBg} stroke={tone.chipBorder} strokeWidth={0.8} />
            </g>
          );
        })}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          aria-hidden
          className="absolute h-[27px] w-[27px] rounded-full"
          style={{ backgroundColor: tone.chipBg, border: `1px solid ${tone.chipBorder}` }}
        />
        <TopologyV2KindGlyph kind={kind} size={16} className="relative" />
      </span>
    </span>
  );
}
