'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { VaultTreeNode } from '@/entities/docs-vault';

interface Props {
  tree: VaultTreeNode;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  query?: string;
  /** 활성 태그 필터. null 이면 태그 필터 해제. */
  activeTag?: string | null;
  /** 활성 태그가 매치하는 slug 집합. activeTag 가 있을 때만 사용. */
  activeTagSlugs?: Set<string>;
  /** 현재 문서 범위에 포함되는 slug 집합. 없으면 전체 tree 를 렌더한다. */
  visibleDocSlugs?: Set<string>;
}

function matchesVisibleDoc(node: VaultTreeNode, visibleDocSlugs?: Set<string>): boolean {
  if (!visibleDocSlugs) return true;
  if (node.type === 'doc') return Boolean(node.slug && visibleDocSlugs.has(node.slug));
  return node.children?.some((child) => matchesVisibleDoc(child, visibleDocSlugs)) ?? false;
}

function matchesTag(node: VaultTreeNode, activeTagSlugs?: Set<string>): boolean {
  if (!activeTagSlugs) return true;
  if (node.type === 'doc' && node.slug) return activeTagSlugs.has(node.slug);
  return node.children?.some((c) => matchesTag(c, activeTagSlugs)) ?? false;
}

function matchesQuery(node: VaultTreeNode, query: string): boolean {
  if (!query) return true;
  const haystack = [node.title, node.name, node.slug, node.path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function containsQueryMatch(
  node: VaultTreeNode,
  query: string,
  visibleDocSlugs?: Set<string>,
): boolean {
  if (!matchesVisibleDoc(node, visibleDocSlugs)) return false;
  if (!query) return true;
  if (node.type === 'doc') return matchesQuery(node, query);
  return node.children?.some((child) => containsQueryMatch(child, query, visibleDocSlugs)) ?? false;
}

function containsSelectedSlug(
  node: VaultTreeNode,
  selectedSlug: string | null,
  visibleDocSlugs?: Set<string>,
): boolean {
  if (!selectedSlug) return false;
  if (!matchesVisibleDoc(node, visibleDocSlugs)) return false;
  if (node.type === 'doc') return node.slug === selectedSlug;
  return node.children?.some((child) => containsSelectedSlug(child, selectedSlug, visibleDocSlugs)) ?? false;
}

function TreeNode({
  node,
  depth,
  selectedSlug,
  onSelect,
  query,
  activeTagSlugs,
  visibleDocSlugs,
}: {
  node: VaultTreeNode;
  depth: number;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  query: string;
  activeTagSlugs?: Set<string>;
  visibleDocSlugs?: Set<string>;
}) {
  // 태그/검색 필터 활성 시에는 매치 경로를 자동으로 펼침 — 걸러진 문서가
  // 접힌 폴더 안에 숨어 있으면 source list 의 역할을 못 한다.
  const [open, setOpen] = useState(() =>
    containsSelectedSlug(node, selectedSlug, visibleDocSlugs),
  );
  if (!matchesVisibleDoc(node, visibleDocSlugs)) return null;
  if (!matchesTag(node, activeTagSlugs)) return null;
  if (!containsQueryMatch(node, query, visibleDocSlugs)) return null;

  if (node.type === 'doc' && node.slug) {
    if (!matchesQuery(node, query)) return null;
    const active = selectedSlug === node.slug;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.slug!)}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-[background-color,color,transform] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset ${
          active
            ? 'bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:rgba(255,255,255,0.035)] hover:text-[color:var(--color-text-primary)]'
        }`}
        style={{ paddingLeft: `${16 + depth * 12}px` }}
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
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] font-medium text-[color:var(--color-text-quaternary)] transition-[background-color,color,transform] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] hover:bg-[color:rgba(255,255,255,0.035)] hover:text-[color:var(--color-text-secondary)]"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown size={12} aria-hidden />
        ) : (
          <ChevronRight size={12} aria-hidden />
        )}
        <Folder size={12} aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
      {(open || activeTagSlugs || query) && node.children ? (
        <div>
          {[...node.children]
            .sort((a, b) =>
              (a.title ?? a.name).localeCompare(b.title ?? b.name, 'ko'),
            )
            .map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedSlug={selectedSlug}
                onSelect={onSelect}
                query={query}
                activeTagSlugs={activeTagSlugs}
                visibleDocSlugs={visibleDocSlugs}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Source Vault tree. 디렉터리는 접기/펼치기, source record 는 클릭 시 onSelect.
 */
export function DocsVaultTree({
  tree,
  selectedSlug,
  onSelect,
  query,
  activeTag,
  activeTagSlugs,
  visibleDocSlugs,
}: Props) {
  const t = useTranslations('vaultWidgets.tree');
  const children = useMemo(() => tree.children ?? [], [tree]);
  const tagSlugs = activeTag ? activeTagSlugs : undefined;
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  return (
    <nav
      aria-label={t('navAria')}
      className="flex h-full flex-col gap-0.5 overflow-auto py-2"
    >
      {[...children]
        .sort((a, b) =>
          (a.title ?? a.name).localeCompare(b.title ?? b.name, 'ko'),
        )
        .map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            selectedSlug={selectedSlug}
            onSelect={onSelect}
            query={normalizedQuery}
            activeTagSlugs={tagSlugs}
            visibleDocSlugs={visibleDocSlugs}
          />
        ))}
    </nav>
  );
}
