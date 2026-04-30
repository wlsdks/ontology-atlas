'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type {
  VaultMode,
  VaultTreeNode,
} from '@/entities/docs-vault';

interface Props {
  tree: VaultTreeNode;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** 관점 필터 — 문서를 숨기지 않고 해당 관점 문서를 먼저 보여준다. */
  audience: VaultMode | 'all';
  /** slug → mode 조회 맵. 트리에는 mode 가 없어서 docs 배열에서 매핑. */
  audienceBySlug: Record<string, VaultMode>;
  /** 활성 태그 필터. null 이면 태그 필터 해제. */
  activeTag?: string | null;
  /** 활성 태그가 매치하는 slug 집합. activeTag 가 있을 때만 사용. */
  activeTagSlugs?: Set<string>;
  /** 외부 이벤트가 닿은 문서. 숨기지 않고 작은 점으로 표시. */
  activitySlugs?: Set<string>;
}

function audienceRank(
  node: VaultTreeNode,
  audience: VaultMode | 'all',
  audienceBySlug: Record<string, VaultMode>,
): number {
  if (audience === 'all') return 0;
  if (node.type === 'doc' && node.slug) {
    const m = audienceBySlug[node.slug] ?? 'both';
    if (m === audience) return 0;
    if (m === 'both') return 1;
    return 2;
  }
  return Math.min(
    ...(node.children ?? []).map((child) =>
      audienceRank(child, audience, audienceBySlug),
    ),
    2,
  );
}

function matchesTag(node: VaultTreeNode, activeTagSlugs?: Set<string>): boolean {
  if (!activeTagSlugs) return true;
  if (node.type === 'doc' && node.slug) return activeTagSlugs.has(node.slug);
  return node.children?.some((c) => matchesTag(c, activeTagSlugs)) ?? false;
}

function TreeNode({
  node,
  depth,
  selectedSlug,
  onSelect,
  audience,
  audienceBySlug,
  activeTagSlugs,
  activitySlugs,
}: {
  node: VaultTreeNode;
  depth: number;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  audience: VaultMode | 'all';
  audienceBySlug: Record<string, VaultMode>;
  activeTagSlugs?: Set<string>;
  activitySlugs?: Set<string>;
}) {
  // 태그 필터 활성 시에는 모든 디렉터리 자동 펼침 — 매치된 문서만 보이므로
  // 접혀 있으면 찾기 어렵다.
  const [open, setOpen] = useState(depth < 2);
  if (!matchesTag(node, activeTagSlugs)) return null;

  if (node.type === 'doc' && node.slug) {
    const active = selectedSlug === node.slug;
    const rank = audienceRank(node, audience, audienceBySlug);
    const faded = audience !== 'all' && rank === 2 && !active;
    const isActivity = activitySlugs?.has(node.slug) ?? false;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.slug!)}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset ${
          active
            ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]'
            : faded
              ? 'text-[color:rgba(150,156,170,0.5)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]'
            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
          />
        ) : null}
        <FileText
          size={12}
          className={
            active
              ? 'text-[color:rgba(139,151,255,0.9)]'
              : 'text-[color:var(--color-text-quaternary)]'
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{node.title ?? node.name}</span>
        {isActivity ? (
          <span
            aria-label="최근 개발 이벤트"
            className="inline-flex flex-none items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.26)] bg-[color:rgba(94,106,210,0.1)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:rgba(200,210,255,0.9)]"
          >
            작업 중
          </span>
        ) : null}
      </button>
    );
  }

  // directory
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[11px] font-mono uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown size={12} aria-hidden />
        ) : (
          <ChevronRight size={12} aria-hidden />
        )}
        <Folder size={12} aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
      {(open || activeTagSlugs) && node.children ? (
        <div>
          {[...node.children]
            .sort((a, b) => {
              const rankDiff =
                audienceRank(a, audience, audienceBySlug) -
                audienceRank(b, audience, audienceBySlug);
              if (rankDiff !== 0) return rankDiff;
              return (a.title ?? a.name).localeCompare(b.title ?? b.name, 'ko');
            })
            .map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedSlug={selectedSlug}
              onSelect={onSelect}
              audience={audience}
              audienceBySlug={audienceBySlug}
              activeTagSlugs={activeTagSlugs}
              activitySlugs={activitySlugs}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Vault 문서 트리. 디렉터리는 접기/펼치기, 문서는 클릭 시 onSelect.
 * 모드 필터를 주면 해당 모드 문서만 보여준다.
 */
export function DocsVaultTree({
  tree,
  selectedSlug,
  onSelect,
  audience,
  audienceBySlug,
  activeTag,
  activeTagSlugs,
  activitySlugs,
}: Props) {
  const children = useMemo(() => tree.children ?? [], [tree]);
  const tagSlugs = activeTag ? activeTagSlugs : undefined;
  return (
    <nav
      aria-label="문서 트리"
      className="flex h-full flex-col gap-0.5 overflow-auto py-2"
    >
      {[...children]
        .sort((a, b) => {
          const rankDiff =
            audienceRank(a, audience, audienceBySlug) -
            audienceRank(b, audience, audienceBySlug);
          if (rankDiff !== 0) return rankDiff;
          return (a.title ?? a.name).localeCompare(b.title ?? b.name, 'ko');
        })
        .map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          audience={audience}
          audienceBySlug={audienceBySlug}
          activeTagSlugs={tagSlugs}
          activitySlugs={activitySlugs}
        />
      ))}
    </nav>
  );
}
