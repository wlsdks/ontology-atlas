import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph } from "@/shared/ui";

export interface RecentNodeRowProps {
  kind: string;
  title: string;
  /** Second stacked line — kind/domain and, where the surface has it, a
   * short description. Composed by the caller so each surface keeps its own
   * exact wording; only the two-line stack shape is shared. */
  subtitle: ReactNode;
  /** Right-aligned primary metadata — usually a relative date. */
  trailing: ReactNode;
  /** Optional smaller line under `trailing` — e.g. the vault doc slug, kept
   * for the agent/developer audience without competing with the date. */
  trailingSecondary?: ReactNode;
  /** Present → renders as a map-focus link; absent → an inert row (dangling
   * doc with no resolvable graph node). */
  href?: string;
  ariaLabel?: string;
  testId?: string;
}

/**
 * One row of "a concept changed recently" — the shared grammar for
 * `/ontology/insights` freshness tab's recent-updates list and `/projects`'
 * recent-activity strip. Both surfaces show the same fact (title, kind,
 * domain, when) but used to disagree on layout: insights stacked title over
 * kind·domain (two lines, easy to scan top-to-bottom), `/projects` ran
 * everything into one line (title + inline gray description + domain + slug
 * + date), which reads as five competing columns rather than one row per
 * Apple HIG's consistency guidance — the same fact should look the same
 * wherever it appears. The two-line stack wins because it's the version
 * that's actually easy to scan a list of; unifying on it here means both
 * surfaces get row-hover/link chrome fixes for free going forward.
 */
export function RecentNodeRow({
  kind,
  title,
  subtitle,
  trailing,
  trailingSecondary,
  href,
  ariaLabel,
  testId,
}: RecentNodeRowProps) {
  const content = (
    <>
      <TopologyV2KindGlyph kind={kind} size={14} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-[color:var(--color-text-primary)]">{title}</span>
        <span className="block truncate text-label text-[color:var(--color-text-quaternary)]">{subtitle}</span>
      </span>
      {/* 좁은 화면(360px) 가로 오버플로우 방지 (2026-07-24 overflow-sweep) —
          긴 slug(trailingSecondary)가 flex-none 로 안 줄어 body 를 밀어냈다.
          최대폭 제약 + truncate 로 넘치지 않게 한다(제목 열이 우선 늘고,
          꼬리는 자기 상한 안에서 말줄임). */}
      <span className="flex-none max-w-[45%] text-right">
        <span className="block font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">
          {trailing}
        </span>
        {trailingSecondary ? (
          <span className="block truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
            {trailingSecondary}
          </span>
        ) : null}
      </span>
    </>
  );

  // 클릭 대상이 없는 행(지도 노드로 못 찾은 dangling doc)엔 hover 배경을
  // 주지 않는다 — 누를 수 없는데 인터랙티브해 보이면 그 자체가 결함.
  const className = `flex items-center gap-2.5 rounded-chip border-t border-[color:var(--color-divider)] px-1.5 py-2.5 transition-colors first:border-t-0 ${
    href ? "-mx-1.5 hover:bg-[color:var(--color-overlay-1)]" : ""
  }`;

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} data-testid={testId} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <div data-testid={testId} className={className}>
      {content}
    </div>
  );
}
