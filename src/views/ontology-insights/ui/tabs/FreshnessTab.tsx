import { Link } from "@/i18n/navigation";
import { formatDate } from "@/shared/lib/format-date";
import { TopologyV2KindGlyph } from "@/shared/ui";
import type { DomainFreshnessRow, RecentUpdateRow } from "../../lib/freshness";

const LEVEL_BACKGROUND: Record<0 | 1 | 2 | 3, string> = {
  0: "var(--color-overlay-1)",
  1: "var(--color-overlay-2)",
  2: "var(--color-overlay-3)",
  3: "var(--color-border-strong)",
};

export interface FreshnessTabLabels {
  domainFreshnessTitle: string;
  windowCaption: string;
  noDomains: string;
  stale: string;
  currentWeek: string;
  unknownDate: string;
  daysAgo: (days: number) => string;
  older: string;
  /** 히트스트립 시간축 방향 라벨 — 좌측(과거) / 우측(현재). */
  axisStart: string;
  axisEnd: string;
  /** 셀 툴팁 — "N주 전 · 갱신 M건" (weeksAgo ≥ 1). */
  weekCell: (weeksAgo: number, count: number) => string;
  /** 이번 주 셀 툴팁 — "이번 주 · 갱신 M건". */
  weekCellCurrent: (count: number) => string;
  recentUpdatesTitle: string;
  noRecentUpdates: string;
  staleCountLabel: string;
  trendTitle: string;
  trendCaption: string;
}

export interface FreshnessTabRecentLink {
  /** 최근 갱신 행 클릭 → 지도 노드 포커스 딥링크 (`buildOntologyNodeHref`,
   *  관계 탭 허브 행과 같은 소스). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface FreshnessTabProps {
  domainRows: DomainFreshnessRow[];
  recent: RecentUpdateRow[];
  staleCount: number;
  /** 전 도메인 합산 주간 갱신 건수, 히트스트립과 같은 12주 창 —
   * `computeFreshnessSummary` 가 이미 계산한 실데이터 (`freshness.ts`). */
  weeklyTotals: number[];
  kindLabel: (kind: string) => string;
  recentLink: FreshnessTabRecentLink;
  labels: FreshnessTabLabels;
}

/**
 * 탭3 신선도 — `visual-richness-sampler.html` §3 heatstrip 문법. 셀 값은
 * 하드코딩 배열이 아니라 `computeFreshnessSummary` 가 실제 vault 문서
 * `updatedAt` 에서 집계한 값. 이번 주 셀만 인디고, 나머지는 중립 램프.
 */
export function FreshnessTab({
  domainRows,
  recent,
  staleCount,
  weeklyTotals,
  kindLabel,
  recentLink,
  labels,
}: FreshnessTabProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
      <section
        aria-label={labels.domainFreshnessTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
            {labels.domainFreshnessTitle}
          </span>
          <span className="ml-auto font-mono text-label text-[color:var(--color-text-quaternary)]">{labels.windowCaption}</span>
        </div>
        {domainRows.length === 0 ? (
          <p className="mt-3.5 flex-1 text-body text-[color:var(--color-text-quaternary)]">{labels.noDomains}</p>
        ) : (
          <div className="mt-3.5 flex flex-1 flex-col justify-evenly gap-1.5">
            {domainRows.map((row) => (
              // 행 호버 하이라이트 — 700px 가로 스캔(라벨→12셀→날짜)을 돕는
              // 기존 hub/최근갱신 행과 같은 -mx/px 상쇄 패턴이라 셀·축 정렬은
              // 그대로다(콘텐츠 x 위치 불변).
              <div
                key={row.domainId}
                data-testid="insights-freshness-domain-row"
                className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-[color:var(--color-overlay-1)]"
              >
                <span
                  className={
                    "flex w-[136px] flex-none items-center gap-1.5 truncate text-label " +
                    (row.stale ? "text-[color:var(--color-text-quaternary)]" : "text-[color:var(--color-text-secondary)]")
                  }
                >
                  <TopologyV2KindGlyph kind="domain" size={12} />
                  <span className="truncate">{row.domainTitle}</span>
                  {row.stale ? (
                    <span className="flex-none rounded border border-dashed border-[color:var(--color-border-strong)] px-1 text-caption text-[color:var(--color-text-quaternary)]">
                      {labels.stale}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-1 gap-[3px]">
                  {row.weeks.map((week, i) => (
                    <i
                      key={i}
                      // 셀 = 한 주의 갱신 건수. max-w 캡을 두면 스트립이 좌측에
                      // 뭉쳐 아래 축 라벨("이번 주")이 마지막 셀과 어긋난다 —
                      // flex-1 충만으로 축·범례·날짜 열과 같은 폭을 공유한다.
                      title={
                        week.isCurrentWeek
                          ? labels.weekCellCurrent(week.count)
                          : labels.weekCell(row.weeks.length - 1 - i, week.count)
                      }
                      // eslint-disable-next-line no-restricted-syntax -- 14px 높이 주간 신선도 바의 3px 헤어라인 반경은 chip(6px)로 올리면 pill 이 돼 램프 밖 예외.
                      className="h-3.5 flex-1 rounded-[3px]"
                      style={{
                        backgroundColor: week.isCurrentWeek
                          ? "var(--color-indigo-brand)"
                          : LEVEL_BACKGROUND[week.level],
                      }}
                    />
                  ))}
                </span>
                <span className="w-12 flex-none text-right font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {row.daysAgo !== null ? labels.daysAgo(row.daysAgo) : labels.unknownDate}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
              <span className="w-[136px] flex-none" aria-hidden />
              <span className="flex flex-1 items-center justify-between">
                <span>{labels.axisStart}</span>
                <span>{labels.axisEnd}</span>
              </span>
              <span className="w-12 flex-none" aria-hidden />
            </div>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-[color:var(--color-divider)] pt-2.5 text-caption text-[color:var(--color-text-quaternary)]">
          <span>{labels.older}</span>
          {([0, 1, 2, 3] as const).map((level) => (
            <i key={level} className="h-2.5 w-2.5 flex-none rounded-sm" style={{ backgroundColor: LEVEL_BACKGROUND[level] }} />
          ))}
          <span>·</span>
          <i className="h-2.5 w-2.5 flex-none rounded-sm" style={{ backgroundColor: "var(--color-indigo-brand)" }} />
          <span>{labels.currentWeek}</span>
        </div>
        <div className="mt-3 border-t border-[color:var(--color-divider)] pt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-body font-medium text-[color:var(--color-text-secondary)]">{labels.trendTitle}</span>
          </div>
          <FreshnessTrendSparkline weeklyTotals={weeklyTotals} />
          <p className="mt-1.5 text-caption text-[color:var(--color-text-quaternary)]">{labels.trendCaption}</p>
        </div>
      </section>

      <section
        aria-label={labels.recentUpdatesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
            {labels.recentUpdatesTitle}
          </span>
        </div>
        <div className="mt-2 flex flex-1 flex-col">
          {recent.length === 0 ? (
            <p className="py-2 text-body text-[color:var(--color-text-quaternary)]">{labels.noRecentUpdates}</p>
          ) : (
            recent.map((row) => (
              <Link
                key={row.nodeId}
                href={recentLink.href(row.nodeId)}
                aria-label={recentLink.ariaLabel(row.title)}
                data-testid="insights-freshness-row-link"
                className="-mx-1.5 flex items-center gap-2.5 rounded-md border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors first:border-t-0 hover:bg-[color:var(--color-overlay-1)]"
              >
                <TopologyV2KindGlyph kind={row.kind} size={14} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-[color:var(--color-text-primary)]">{row.title}</span>
                  <span className="block text-label text-[color:var(--color-text-quaternary)]">
                    {kindLabel(row.kind)}
                    {row.domainTitle ? ` · ${row.domainTitle}` : ""}
                  </span>
                </span>
                <span className="flex-none font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                  {/* P4-③ — 로컬 타임존 기준 날짜(`formatDate`). 이전엔
                      toISOString() 이 UTC 로 렌더해 자정 부근 갱신이 하루
                      전날짜로 표시됐다(예: 03:12 KST → UTC 로는 전날). */}
                  {formatDate(row.updatedAt)}
                </span>
              </Link>
            ))
          )}
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          <span>{labels.staleCountLabel}</span>
          <span className="font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">{staleCount}</span>
        </div>
      </section>
    </div>
  );
}

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 28;
const SPARKLINE_PAD = 2;

/**
 * 주간 갱신 건수 스파크라인 — `computeFreshnessSummary` 가 실제 문서
 * 갱신일에서 집계한 `weeklyTotals` 를 그대로 그린다(장식용 난수 없음).
 * 단일 인디고 라인 + 옅은 채움, 히트스트립과 같은 12주 창.
 */
function FreshnessTrendSparkline({ weeklyTotals }: { weeklyTotals: number[] }) {
  if (weeklyTotals.length === 0) return null;
  const max = Math.max(1, ...weeklyTotals);
  const stepX = weeklyTotals.length > 1 ? (SPARKLINE_WIDTH - SPARKLINE_PAD * 2) / (weeklyTotals.length - 1) : 0;
  const points = weeklyTotals.map((value, i) => {
    const x = SPARKLINE_PAD + i * stepX;
    const y = SPARKLINE_PAD + (1 - value / max) * (SPARKLINE_HEIGHT - SPARKLINE_PAD * 2);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });
  const linePath = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `${SPARKLINE_PAD},${SPARKLINE_HEIGHT - SPARKLINE_PAD} ${linePath} ${
    points[points.length - 1].x
  },${SPARKLINE_HEIGHT - SPARKLINE_PAD}`;

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      aria-hidden="true"
      className="mt-1.5 w-full max-w-60"
      preserveAspectRatio="none"
    >
      <polygon points={areaPath} fill="var(--color-indigo-a14)" stroke="none" />
      <polyline points={linePath} fill="none" stroke="var(--color-indigo-brand)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
