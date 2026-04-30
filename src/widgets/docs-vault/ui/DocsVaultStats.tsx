'use client';

import { useMemo } from 'react';
import { FileText, Hash, Link2, Pin, Star } from 'lucide-react';
import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';

interface Props {
  manifest: VaultManifest;
  pinnedSlugs: string[];
  onSelect: (slug: string) => void;
}

interface Stats {
  docCount: number;
  totalWords: number;
  avgWords: number;
  medianWords: number;
  biggest: VaultDoc | null;
  modes: Record<'planner' | 'engineer' | 'both', number>;
  topReferenced: Array<{ doc: VaultDoc; count: number }>;
  topOutlinks: Array<{ doc: VaultDoc; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  orphanCount: number;
  pinnedCount: number;
}

function computeStats(
  manifest: VaultManifest,
  pinnedSlugs: string[],
): Stats {
  const docs = manifest.docs;
  const totalWords = docs.reduce((sum, d) => sum + d.wordCount, 0);
  const avgWords = docs.length > 0 ? Math.round(totalWords / docs.length) : 0;
  const sortedByWords = [...docs].sort((a, b) => a.wordCount - b.wordCount);
  const medianWords =
    sortedByWords.length > 0
      ? sortedByWords[Math.floor(sortedByWords.length / 2)].wordCount
      : 0;
  const biggest =
    sortedByWords.length > 0
      ? sortedByWords[sortedByWords.length - 1]
      : null;

  const modes = { planner: 0, engineer: 0, both: 0 };
  for (const d of docs) modes[d.mode] += 1;

  const bySlug = new Map<string, VaultDoc>();
  for (const d of docs) bySlug.set(d.slug, d);

  const topReferenced = Object.entries(manifest.backlinksDetail ?? {})
    .map(([slug, entries]) => ({ doc: bySlug.get(slug), count: entries.length }))
    .filter((x): x is { doc: VaultDoc; count: number } => x.doc !== undefined)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topOutlinks = docs
    .map((d) => ({ doc: d, count: d.linksOut.length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topTags = Object.entries(manifest.tags)
    .map(([tag, slugs]) => ({ tag, count: slugs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // orphan = linksOut 0 AND backlinks 0
  const orphanCount = docs.filter(
    (d) =>
      d.linksOut.length === 0 &&
      (manifest.backlinksDetail?.[d.slug]?.length ?? 0) === 0,
  ).length;

  return {
    docCount: docs.length,
    totalWords,
    avgWords,
    medianWords,
    biggest,
    modes,
    topReferenced,
    topOutlinks,
    topTags,
    orphanCount,
    pinnedCount: pinnedSlugs.length,
  };
}

export function DocsVaultStats({ manifest, pinnedSlugs, onSelect }: Props) {
  const stats = useMemo(
    () => computeStats(manifest, pinnedSlugs),
    [manifest, pinnedSlugs],
  );
  const totalForModes =
    stats.modes.planner + stats.modes.engineer + stats.modes.both;

  return (
    <div className="mx-auto max-w-[960px] px-6 py-8 md:px-10 md:py-10">
      <h2 className="mb-1 text-[22px] font-semibold text-[color:var(--color-text-primary)]">
        볼트 통계
      </h2>
      <p className="mb-8 text-[12.5px] text-[color:var(--color-text-tertiary)]">
        매니페스트 생성 기준 —{' '}
        <span className="font-mono">
          {new Date(manifest.generatedAt).toLocaleString('ko-KR')}
        </span>
      </p>

      {/* 핵심 숫자 카드 */}
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="문서" value={stats.docCount} unit="개" />
        <StatCard
          label="총 단어"
          value={stats.totalWords.toLocaleString('ko-KR')}
        />
        <StatCard label="평균 단어" value={stats.avgWords.toLocaleString('ko-KR')} />
        <StatCard label="중앙값" value={stats.medianWords.toLocaleString('ko-KR')} />
      </section>

      {/* 모드별 비중 */}
      <section className="mb-8">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          모드별 분포
        </h3>
        {totalForModes > 0 ? (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-border-soft)]">
            <div className="flex h-5 w-full">
              <ModeBar
                label="기획자"
                count={stats.modes.planner}
                total={totalForModes}
                color="rgba(224,196,140,0.75)"
              />
              <ModeBar
                label="개발자"
                count={stats.modes.engineer}
                total={totalForModes}
                color="rgba(139,151,255,0.72)"
              />
              <ModeBar
                label="공용"
                count={stats.modes.both}
                total={totalForModes}
                color="rgba(180,190,210,0.6)"
              />
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[color:var(--color-text-tertiary)]">
          <ModeLegend
            label="기획자"
            count={stats.modes.planner}
            total={totalForModes}
            color="rgba(224,196,140,0.85)"
          />
          <ModeLegend
            label="개발자"
            count={stats.modes.engineer}
            total={totalForModes}
            color="rgba(139,151,255,0.85)"
          />
          <ModeLegend
            label="공용"
            count={stats.modes.both}
            total={totalForModes}
            color="rgba(180,190,210,0.85)"
          />
        </div>
      </section>

      {/* 두 개 리스트 */}
      <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <RankList
          title="가장 많이 인용된 문서"
          icon={<Link2 size={11} />}
          items={stats.topReferenced.map((x) => ({
            slug: x.doc.slug,
            title: x.doc.title,
            count: x.count,
          }))}
          onSelect={onSelect}
        />
        <RankList
          title="가장 많은 외부 링크"
          icon={<Link2 size={11} />}
          items={stats.topOutlinks.map((x) => ({
            slug: x.doc.slug,
            title: x.doc.title,
            count: x.count,
          }))}
          onSelect={onSelect}
        />
      </section>

      {/* 태그 */}
      <section className="mb-8">
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          <Hash size={10} aria-hidden />
          태그 Top {stats.topTags.length}
        </h3>
        {stats.topTags.length === 0 ? (
          <p className="text-[12px] text-[color:var(--color-text-tertiary)]">
            frontmatter 에 tags 가 있는 문서가 아직 없습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stats.topTags.map((t) => (
              <span
                key={t.tag}
                className="inline-flex items-center gap-1 rounded-sm border border-[color:var(--color-border-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]"
              >
                {t.tag}
                <span className="text-[color:var(--color-text-quaternary)]">
                  {t.count}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 나머지 미니 지표 */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard
          label="고정"
          value={stats.pinnedCount}
          unit="개"
          icon={<Pin size={11} aria-hidden />}
        />
        <StatCard
          label="링크 없는 문서"
          value={stats.orphanCount}
          unit="개"
          icon={<FileText size={11} aria-hidden />}
          hint="어느 문서와도 연결되지 않은 외톨이. 수동 링크 추천 대상."
        />
        {stats.biggest ? (
          <button
            type="button"
            onClick={() => onSelect(stats.biggest!.slug)}
            className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2 text-left transition-colors hover:border-[color:rgba(139,151,255,0.3)]"
          >
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              <Star size={10} aria-hidden />
              가장 큰 문서
            </div>
            <div className="mt-1 truncate text-[13px] text-[color:var(--color-text-primary)]">
              {stats.biggest.title}
            </div>
            <div className="font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
              {stats.biggest.wordCount.toLocaleString('ko-KR')} 단어
            </div>
          </button>
        ) : null}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  icon,
  hint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2"
      title={hint}
    >
      <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums text-[color:var(--color-text-primary)]">
        {value}
        {unit ? (
          <span className="ml-1 text-[12px] font-normal text-[color:var(--color-text-tertiary)]">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ModeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  if (pct === 0) return null;
  return (
    <div
      title={`${label} ${count} · ${pct.toFixed(1)}%`}
      style={{ width: `${pct}%`, backgroundColor: color }}
    />
  );
}

function ModeLegend({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label} · {count}{' '}
      <span className="font-mono text-[color:var(--color-text-quaternary)]">
        {pct.toFixed(0)}%
      </span>
    </span>
  );
}

function RankList({
  title,
  icon,
  items,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ slug: string; title: string; count: number }>;
  onSelect: (slug: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-[color:var(--color-text-tertiary)]">
          해당 항목이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item, idx) => (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => onSelect(item.slug)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors hover:bg-[color:var(--color-overlay-1)]"
              >
                <span className="w-5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  {idx + 1}.
                </span>
                <span className="flex-1 truncate text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]">
                  {item.title}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[color:rgba(139,151,255,0.85)]">
                  {item.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
