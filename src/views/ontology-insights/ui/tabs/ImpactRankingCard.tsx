"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { EmptyState, EvidenceOnlyBadge, TopologyV2KindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import type { ImpactRankingRow } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface ImpactRankingLabels {
  title: string;
  caption: string;
  directLabel: string;
  transitiveLabel: string;
  empty: string;
  emptyHint: string;
  truncated: (shown: number, total: number) => string;
  /** 근거 계층 여는 버튼 — 접힘 상태. 개수를 라벨에 실어 규모를 숨기지 않는다. */
  evidenceShow: (count: number) => string;
  /** 근거 계층 닫는 버튼 — 펼침 상태. */
  evidenceHide: string;
  /** 근거 계층 캡션 — 같은 수가 여기서는 무슨 뜻인지. */
  evidenceCaption: string;
  evidenceTruncated: (shown: number, total: number) => string;
  /** 행 배지 라벨 + 마우스오버 한 줄(승격 경로 포함). */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

export interface ImpactRankingLink {
  href: (nodeId: string) => string;
  ariaLabel: (row: { title: string; direct: number; total: number }) => string;
  /** 근거 계층 행의 접근성 이름 — 위험도가 아니라 인용 수를 읽어 준다. */
  evidenceAriaLabel: (row: { title: string; total: number }) => string;
}

export interface ImpactRankingCardProps {
  rows: ImpactRankingRow[];
  rankedCount: number;
  evidenceRows: ImpactRankingRow[];
  evidenceRankedCount: number;
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
 *
 * ## 두 계층 (2026-07-26)
 *
 * 위는 **자기 문서를 가진 개념**, 아래 접힌 자리는 **다른 문서가 이름만 적어
 * 둔 근거**다. 실측(도그푸드 289개념): 계층을 나누기 전 상위 12행 중 11행이
 * `Check Package Contracts Test` · `Integration Test`(중복) 같은 파생 코드
 * 경로였고, 회의에 띄우면 가장 잘 보이는 자리에 테스트 파일 이름이 앉아 있었다.
 *
 * 두 계층이 **같은 수에 다른 캡션**을 쓰는 것이 이 카드의 요점이다. 개념
 * 계층의 15는 "바꾸면 다시 볼 곳 15", 근거 계층의 15는 "15개 개념이 이 파일을
 * 근거로 적었다" — 후자가 테스트 파일이면 위험이 아니라 오히려 지켜준다는
 * 신호다. 계산은 옳았고 말이 틀렸던 자리라, 계산이 아니라 문구를 고쳤다.
 *
 * 근거를 지우지 않는 이유: 개발자에게는 촘촘한 추적이 값이고, 「문서 만들기」
 * 승격 경로가 여기서만 보인다. 숨기기는 계층화가 아니다.
 */
export function ImpactRankingCard({
  rows,
  rankedCount,
  evidenceRows,
  evidenceRankedCount,
  kindLabel,
  nodeLink,
  labels,
  className,
}: ImpactRankingCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // 1행이 100%를 채우고 나머지는 그 상대 크기 — 허브 카드와 같은 읽기 규칙.
  // **두 계층이 같은 자를 쓴다**: 계층은 표시 우선순위의 구분이고 수는 같은
  // 계산에서 나오므로, 자를 따로 두면 같은 15가 두 목록에서 다른 길이로
  // 그려져 막대가 거짓말을 한다.
  const max = [...rows, ...evidenceRows].reduce((m, row) => Math.max(m, row.total), 0);

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
        <InsightsSectionTitle level={2} className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {labels.title}
        </InsightsSectionTitle>
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
          rows.map((row, i) => (
            <ImpactRow
              key={row.id}
              row={row}
              index={i}
              max={max}
              href={nodeLink.href(row.id)}
              ariaLabel={nodeLink.ariaLabel(row)}
              secondary={kindLabel(row.kind)}
              testId="insights-impact-row-link"
            />
          ))
        )}
      </div>

      {evidenceRankedCount > 0 ? (
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-1">
          {/* 조용한 토글 — 무채색 텍스트 버튼. 열고 닫아도 위 행들의 자리는
              그대로고, 내용은 아래로만 자란다(레이아웃 시프트 0). */}
          <button
            type="button"
            aria-expanded={evidenceOpen}
            data-testid="insights-impact-evidence-toggle"
            onClick={() => setEvidenceOpen((open) => !open)}
            // 25px 짜리 글자 폭 히트영역은 이 카드에서 유일한 조작점이라 좁다 —
            // 램프의 `row`/`sm` 이 같은 28px 를 내면서 인셋을 6 → 8 로 넓힌다.
            // 「할 일」·「신선도」 탭의 조용한 토글과 같은 호출이다.
            className={controlClass({
              shape: "row",
              size: "sm",
              className:
                "-mx-2 hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {evidenceOpen ? (
              <ChevronDown aria-hidden size={13} className="flex-none" />
            ) : (
              <ChevronRight aria-hidden size={13} className="flex-none" />
            )}
            <span className="min-w-0 truncate">
              {evidenceOpen ? labels.evidenceHide : labels.evidenceShow(evidenceRankedCount)}
            </span>
          </button>
          {evidenceOpen ? (
            // 등장은 인사이트 표면의 기존 크로스페이드 문법(120ms opacity,
            // `--motion-fast`). prefers-reduced-motion 은 base 레이어가 전역으로
            // 무력화하므로 즉시 교체로 강등된다.
            <div className="insights-disclosure-in">
              <div className="grid auto-rows-min content-start gap-x-6 lg:grid-cols-2">
                {evidenceRows.map((row, i) => (
                  <ImpactRow
                    key={row.id}
                    row={row}
                    index={i}
                    max={max}
                    href={nodeLink.href(row.id)}
                    ariaLabel={nodeLink.evidenceAriaLabel(row)}
                    secondary={row.ref ?? kindLabel(row.kind)}
                    secondaryMono
                    badge={{ label: labels.evidenceBadge, hint: labels.evidenceBadgeHint }}
                    testId="insights-impact-evidence-row-link"
                  />
                ))}
              </div>
              <p className="pt-1.5 text-label leading-snug text-[color:var(--color-text-quaternary)]">
                {evidenceRankedCount > evidenceRows.length
                  ? `${labels.evidenceTruncated(evidenceRows.length, evidenceRankedCount)} · `
                  : ""}
                {labels.evidenceCaption}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
        {rankedCount > rows.length ? `${labels.truncated(rows.length, rankedCount)} · ` : ""}
        {labels.caption}
      </p>
    </section>
  );
}

/**
 * 두 계층이 **같은 행 부품**을 쓴다 — 글리프 · 이름 · (배지) · 보조 라벨 ·
 * 막대 · 수. 배지와 경로가 붙어도 슬롯 수와 각 슬롯의 줄높이가 그대로라
 * 행 높이가 계층에 따라 달라지지 않는다(치수 규칙성).
 */
function ImpactRow({
  row,
  index,
  max,
  href,
  ariaLabel,
  secondary,
  secondaryMono,
  badge,
  testId,
}: {
  row: ImpactRankingRow;
  index: number;
  max: number;
  href: string;
  ariaLabel: string;
  secondary: string;
  secondaryMono?: boolean;
  badge?: { label: string; hint: string };
  testId: string;
}) {
  // 막대 전체 길이 = 이 목록 안에서의 상대 크기(허브 카드와 같은 읽기 규칙).
  // 그 위에 같은 자로 잰 「바로 이어진 것」을 진한 값으로 덮어 두 수를 한
  // 막대에서 비교하게 한다.
  const totalPct = max > 0 ? Math.max(6, Math.round((row.total / max) * 100)) : 0;
  const directPct =
    max > 0 && row.direct > 0 ? Math.max(3, Math.round((row.direct / max) * 100)) : 0;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        "-mx-1.5 flex items-center gap-3 rounded-chip border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors hover:bg-[color:var(--color-overlay-1)]",
        // 각 칸의 첫 행은 구분선을 지운다 — 두 칸일 때 둘째 칸의
        // 첫 행(i=1)도 칸의 머리라 위에 선이 있으면 잘린 표로 읽힌다.
        index === 0 && "border-t-0",
        index === 1 && "lg:border-t-0",
      )}
    >
      <TopologyV2KindGlyph kind={row.kind} size={16} className="flex-none" />
      <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
        {row.title}
      </span>
      {badge ? <EvidenceOnlyBadge label={badge.label} hint={badge.hint} /> : null}
      <span
        className={cn(
          "hidden flex-none truncate text-label text-[color:var(--color-text-quaternary)] sm:inline",
          secondaryMono && "font-mono sm:w-40",
        )}
      >
        {secondary}
      </span>
      <span
        aria-hidden
        className="relative block h-1.5 w-24 flex-none overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
      >
        <span className="absolute inset-0">
          <InsightsBar pct={totalPct} color="var(--color-indigo-a32)" index={index} />
        </span>
        <span className="absolute inset-0">
          <InsightsBar pct={directPct} color="var(--color-indigo-a66)" index={index} />
        </span>
      </span>
      <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {row.total}
      </span>
    </Link>
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
