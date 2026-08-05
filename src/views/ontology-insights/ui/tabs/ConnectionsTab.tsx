import { Waypoints } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  EmptyState,
  EvidenceOnlyBadge,
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
} from "@/shared/ui";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import { relationTypeIndigo } from "../../lib/relation-type-tone";
import type { ImpactRanking } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import {
  ImpactRankingCard,
  type ImpactRankingLabels,
  type ImpactRankingLink,
} from "./ImpactRankingCard";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface ConnectionHubRow {
  id: string;
  title: string;
  kind: string;
  degree: number;
  /**
   * 근거로만 적힌 이름(자기 문서 없음)인가. 허브는 순서를 바꾸지 않는다 —
   * 연결이 실제로 많은 것을 아래로 내리면 "지금 뭐가 중심인가"의 답이 틀려진다.
   * 대신 그 행이 아직 문서가 없다는 사실을 조용히 밝힌다.
   */
  evidenceOnly: boolean;
}

export interface ConnectionsTabLabels {
  relationTypesTitle: string;
  relationTypesCaption: string;
  noRelationTypes: string;
  noRelationTypesHint: string;
  hubsTitle: string;
  noHubs: string;
  noHubsHint: string;
  hubTruncated: (shown: number, total: number) => string;
  hubDegreeCaption: string;
  /** 근거 계층 배지 — 영향 랭킹과 **같은 i18n 키**에서 온다(문구는 한 벌). */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

export interface ConnectionsTabHubLink {
  /** 허브 행 클릭 → 지도 노드 포커스 딥링크 (`buildOntologyNodeHref`). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface ConnectionsTabProps {
  edgeTypeRows: Array<{ type: string; count: number }>;
  totalEdges: number;
  edgeTypeLabel: (type: string) => string;
  hubs: ConnectionHubRow[];
  hubTotalCount: number;
  kindLabel: (kind: string) => string;
  hubLink: ConnectionsTabHubLink;
  labels: ConnectionsTabLabels;
  impact: ImpactRanking;
  impactLink: ImpactRankingLink;
  impactLabels: ImpactRankingLabels;
}

/**
 * `연결` 탭 — "어떤 개념이 중심이고, 바꾸면 어디까지 퍼지나"에 답한다. 카드 세
 * 장(관계 타입 ∥ 허브 · 영향 랭킹)은 같은 해부구조로 읽히도록 머리(제목+총계)
 * → 차트 → 행 → 각주 한 줄 순서를 공유한다.
 *
 * 두 번의 잉크 삭감이 여기 반영돼 있다.
 * ① 「가장 많이 기대는 곳」 카드 삭제 — 도그푸드 실측에서 상위 5행이 전부
 *    count 1 이라 순위가 성립하지 않았다(의존 엣지가 전체의 6%). 신호 없는 표는
 *    읽는 사람의 시간만 쓴다.
 * ② 허브 에고 썸네일 삭제 — 6행이 모두 같은 바퀴 모양이라 구분 정보가 숫자에만
 *    있었다(Tufte: erase non-data-ink). 남은 것은 kind 글리프 · 제목 · 상대
 *    막대 · 숫자로, 행 높이가 절반이 됐다.
 *
 * 둘째 줄(양 칸 폭)의 「바꾸면 멀리 퍼지는 개념」은 허브의 짝이다 — 허브가
 * "지금 뭐가 중심인가"를 말하면, 영향 랭킹은 "그걸 건드리면 어디까지 다시
 * 봐야 하나"를 말한다. 같은 질문의 두 얼굴이라 같은 탭에 산다.
 *
 * 두 카드가 근거 계층을 다르게 다루는 것은 질문이 다르기 때문이다. 영향
 * 랭킹은 위험도를 묻는 자리라 문서 없는 파생 개념을 접힌 아래 계층으로
 * 내리고, 허브는 "실제로 연결이 많은 것"을 묻는 자리라 순서를 그대로 두고
 * 배지로만 밝힌다 — 여기서 순서를 바꾸면 답 자체가 틀려진다.
 */
export function ConnectionsTab({
  edgeTypeRows,
  totalEdges,
  edgeTypeLabel,
  hubs,
  hubTotalCount,
  kindLabel,
  hubLink,
  labels,
  impact,
  impactLink,
  impactLabels,
}: ConnectionsTabProps) {
  const edgeMax = edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0);
  // hubs 는 이미 degree 내림차순 — hubs[0] 이 이 목록 안의 최대치.
  const hubDegreeMax = hubs.reduce((m, h) => Math.max(m, h.degree), 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
      <section
        aria-label={labels.relationTypesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.relationTypesTitle} count={totalEdges} />
        {edgeTypeRows.length === 0 ? (
          <div className="mt-3 flex flex-1 flex-col">
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noRelationTypes}
              description={labels.noRelationTypesHint}
            />
          </div>
        ) : (
          <>
            <div
              aria-hidden
              className="mt-3 flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)]"
            >
              {edgeTypeRows.map((row) => {
                const share = totalEdges > 0 ? row.count / totalEdges : 0;
                if (share <= 0) return null;
                return (
                  <span
                    key={row.type}
                    style={{ flexGrow: share, backgroundColor: relationTypeIndigo(row.type) }}
                  />
                );
              })}
            </div>
            {/* 관계 타입은 3~4행뿐이라 옆 허브 카드(6행)가 그리드 높이를
                정한다 — 남는 세로를 행 사이로 고르게 나눠 카드 아래가 비어
                보이지 않게 한다(종류 분포 카드와 같은 처리). */}
            <div className="mt-2 flex flex-1 flex-col justify-evenly">
              {edgeTypeRows.map((row, i) => {
                const width = edgeMax > 0 ? Math.max(2, Math.round((row.count / edgeMax) * 100)) : 0;
                const pct = totalEdges > 0 ? Math.round((row.count / totalEdges) * 100) : 0;
                return (
                  <div
                    key={row.type}
                    className="flex items-center gap-3 border-t border-[color:var(--color-divider)] py-2.5 first:border-t-0"
                  >
                    <TopologyV2TraceMark containment={isContainmentRelation(row.type)} />
                    <span className="w-[104px] flex-none truncate font-mono text-body text-[color:var(--color-text-primary)]">
                      {edgeTypeLabel(row.type)}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                      <InsightsBar pct={width} color={relationTypeIndigo(row.type)} index={i} />
                    </span>
                    <span className="w-11 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                      {row.count}
                    </span>
                    <span className="w-9 flex-none text-right font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {labels.relationTypesCaption}
        </p>
      </section>

      <section
        aria-label={labels.hubsTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        {/* 허브 총계는 아래 절단 문구("상위 6 / 전체 289")가 이미 말한다 —
            같은 수치를 한 카드에서 두 번 쓰지 않는다. */}
        <CardHead label={labels.hubsTitle} />
        <div className="mt-2 flex flex-1 flex-col justify-start">
          {hubs.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noHubs}
              description={labels.noHubsHint}
            />
          ) : (
            hubs.map((hub, i) => {
              const meterPct = hubDegreeMax > 0 ? Math.max(6, Math.round((hub.degree / hubDegreeMax) * 100)) : 0;
              return (
                <Link
                  key={hub.id}
                  href={hubLink.href(hub.id)}
                  aria-label={hubLink.ariaLabel(hub.title)}
                  data-testid="insights-hub-row-link"
                  className="-mx-1.5 flex items-center gap-3 rounded-chip border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors first:border-t-0 hover:bg-[color:var(--color-overlay-1)]"
                >
                  <TopologyV2KindGlyph kind={hub.kind} size={16} className="flex-none" />
                  <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
                    {hub.title}
                  </span>
                  {hub.evidenceOnly ? (
                    <EvidenceOnlyBadge
                      label={labels.evidenceBadge}
                      hint={labels.evidenceBadgeHint}
                    />
                  ) : null}
                  <span className="hidden flex-none text-label text-[color:var(--color-text-quaternary)] sm:inline">
                    {kindLabel(hub.kind)}
                  </span>
                  <span
                    aria-hidden
                    className="h-1.5 w-14 flex-none overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                  >
                    <InsightsBar pct={meterPct} color="var(--color-indigo-a66)" index={i} />
                  </span>
                  <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {hub.degree}
                  </span>
                </Link>
              );
            })
          )}
        </div>
        {/* 절단 문구를 각주에 이어 붙여 한 줄로 유지한다 — 선택적 슬롯이
            카드 높이를 흔들면 같은 그리드의 두 카드가 서로 다른 해부구조를
            갖게 된다. */}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {hubTotalCount > hubs.length ? `${labels.hubTruncated(hubs.length, hubTotalCount)} · ` : ""}
          {labels.hubDegreeCaption}
        </p>
      </section>

      {/* 같은 그리드의 둘째 줄 — 랭킹은 제목이 길어 반 칸에서는 잘린다. */}
      <ImpactRankingCard
        className="lg:col-span-2"
        rows={impact.rows}
        rankedCount={impact.rankedCount}
        evidenceRows={impact.evidenceRows}
        evidenceRankedCount={impact.evidenceRankedCount}
        declaredDependencyEdges={impact.declaredDependencyEdges}
        declaredWithRationaleEdges={impact.declaredWithRationaleEdges}
        kindLabel={kindLabel}
        nodeLink={impactLink}
        labels={impactLabels}
      />
    </div>
  );
}

function CardHead({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
      {count === undefined ? null : (
        <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {count}
        </span>
      )}
    </div>
  );
}
