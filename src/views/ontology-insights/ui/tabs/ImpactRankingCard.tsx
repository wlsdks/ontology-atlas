import { Radar } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { EmptyState, TopologyV2KindGlyph } from "@/shared/ui";
import type { ImpactRankingRow } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";

export interface ImpactRankingLabels {
  title: string;
  caption: string;
  directLabel: string;
  transitiveLabel: string;
  empty: string;
  emptyHint: string;
  truncated: (shown: number, total: number) => string;
}

export interface ImpactRankingLink {
  href: (nodeId: string) => string;
  ariaLabel: (row: { title: string; direct: number; total: number }) => string;
}

export interface ImpactRankingCardProps {
  rows: ImpactRankingRow[];
  rankedCount: number;
  kindLabel: (kind: string) => string;
  nodeLink: ImpactRankingLink;
  labels: ImpactRankingLabels;
  /** 소비처 그리드에서의 자리 (예: 2열 그리드의 둘째 줄 전체 폭). */
  className?: string;
}

/**
 * 「바꾸면 멀리 퍼지는 개념」 — 개발자·에이전트가 실제로 던지는 1번 질문
 * ("이걸 바꾸면 어디까지 깨지나")에 답하는 카드. 값은 전부
 * `buildImpactRanking` → `computeOntologyDependents` 에서 오고, 그 함수가
 * MCP `blast_radius` 와 같은 의미론이라 화면과 에이전트의 답이 갈라지지 않는다.
 *
 * 막대는 인디고 한 계열의 값 차이 2세그먼트다 — 진한 쪽이 바로 이어진 것,
 * 연한 쪽이 건너서 닿는 것. 새 hue 를 들이지 않고도 "직접/간접"이 읽힌다.
 * 같은 그리드의 다른 카드와 해부구조(머리 → 행 → 각주 한 줄)를 공유한다.
 */
export function ImpactRankingCard({
  rows,
  rankedCount,
  kindLabel,
  nodeLink,
  labels,
  className,
}: ImpactRankingCardProps) {
  // 1행이 100%를 채우고 나머지는 그 상대 크기 — 허브 카드와 같은 읽기 규칙.
  const max = rows.reduce((m, row) => Math.max(m, row.total), 0);

  return (
    <section
      aria-label={labels.title}
      data-testid="insights-impact-ranking"
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.title}
        </span>
        {/* 두 세그먼트가 무슨 뜻인지 머리에서 한 번만 말한다 — 행마다
            반복하면 잉크만 늘고 읽히지 않는다. */}
        <span className="ml-auto flex items-center gap-3 text-label text-[color:var(--color-text-quaternary)]">
          <SegmentKey color="var(--color-indigo-a66)" label={labels.directLabel} />
          <SegmentKey color="var(--color-indigo-a32)" label={labels.transitiveLabel} />
        </span>
      </div>

      {/* 두 칸 격자 — 이 카드는 나란한 두 카드를 합친 폭에 산다. 한 칸으로
          늘이면 행의 측정선이 두 배가 되어 이름과 막대 사이가 벌어지므로,
          폭을 접어 옆 허브 카드와 같은 측정선을 유지한다. 순위는 DOM 순서
          그대로 왼→오, 위→아래로 읽힌다(글 읽는 순서). */}
      <div className="mt-2 grid flex-1 auto-rows-min content-start gap-x-6 lg:grid-cols-2">
        {rows.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              size="compact"
              icon={<Radar aria-hidden />}
              skeleton
              title={labels.empty}
              description={labels.emptyHint}
            />
          </div>
        ) : (
          rows.map((row, i) => {
            // 막대 전체 길이 = 이 목록 안에서의 상대 크기(허브 카드와 같은
            // 읽기 규칙). 그 위에 같은 자로 잰 「바로 이어진 것」을 진한 값으로
            // 덮어 두 수를 한 막대에서 비교하게 한다.
            const totalPct = max > 0 ? Math.max(6, Math.round((row.total / max) * 100)) : 0;
            const directPct =
              max > 0 && row.direct > 0 ? Math.max(3, Math.round((row.direct / max) * 100)) : 0;
            return (
              <Link
                key={row.id}
                href={nodeLink.href(row.id)}
                aria-label={nodeLink.ariaLabel(row)}
                data-testid="insights-impact-row-link"
                className={cn(
                  "-mx-1.5 flex items-center gap-3 rounded-md border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors hover:bg-[color:var(--color-overlay-1)]",
                  // 각 칸의 첫 행은 구분선을 지운다 — 두 칸일 때 둘째 칸의
                  // 첫 행(i=1)도 칸의 머리라 위에 선이 있으면 잘린 표로 읽힌다.
                  i === 0 && "border-t-0",
                  i === 1 && "lg:border-t-0",
                )}
              >
                <TopologyV2KindGlyph kind={row.kind} size={16} className="flex-none" />
                <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
                  {row.title}
                </span>
                <span className="hidden flex-none text-label text-[color:var(--color-text-quaternary)] sm:inline">
                  {kindLabel(row.kind)}
                </span>
                <span
                  aria-hidden
                  className="relative block h-1.5 w-24 flex-none overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                >
                  <span className="absolute inset-0">
                    <InsightsBar pct={totalPct} color="var(--color-indigo-a32)" index={i} />
                  </span>
                  <span className="absolute inset-0">
                    <InsightsBar pct={directPct} color="var(--color-indigo-a66)" index={i} />
                  </span>
                </span>
                <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                  {row.total}
                </span>
              </Link>
            );
          })
        )}
      </div>

      <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
        {rankedCount > rows.length ? `${labels.truncated(rows.length, rankedCount)} · ` : ""}
        {labels.caption}
      </p>
    </section>
  );
}

function SegmentKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-1.5 w-4 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
