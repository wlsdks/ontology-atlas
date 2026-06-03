'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { VaultTreeNode } from '@/entities/docs-vault';

interface Props {
  tree: VaultTreeNode;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** 활성 태그 필터. null 이면 태그 필터 해제. */
  activeTag?: string | null;
  /** 활성 태그가 매치하는 slug 집합. activeTag 가 있을 때만 사용. */
  activeTagSlugs?: Set<string>;
}

function matchesTag(node: VaultTreeNode, activeTagSlugs?: Set<string>): boolean {
  if (!activeTagSlugs) return true;
  if (node.type === 'doc' && node.slug) return activeTagSlugs.has(node.slug);
  return node.children?.some((c) => matchesTag(c, activeTagSlugs)) ?? false;
}

function containsSelectedSlug(
  node: VaultTreeNode,
  selectedSlug: string | null,
): boolean {
  if (!selectedSlug) return false;
  if (node.type === 'doc') return node.slug === selectedSlug;
  return node.children?.some((child) => containsSelectedSlug(child, selectedSlug)) ?? false;
}

function TreeNode({
  node,
  depth,
  selectedSlug,
  onSelect,
  activeTagSlugs,
}: {
  node: VaultTreeNode;
  depth: number;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  activeTagSlugs?: Set<string>;
}) {
  // 태그 필터 활성 시에는 모든 디렉터리 자동 펼침 — 매치된 문서만 보이므로
  // 접혀 있으면 찾기 어렵다.
  const [open, setOpen] = useState(() =>
    containsSelectedSlug(node, selectedSlug),
  );
  if (!matchesTag(node, activeTagSlugs)) return null;

  if (node.type === 'doc' && node.slug) {
    const active = selectedSlug === node.slug;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.slug!)}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-inset ${
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
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] font-medium text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:rgba(255,255,255,0.035)] hover:text-[color:var(--color-text-secondary)]"
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
      {(open || activeTagSlugs) && node.children ? (
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
                activeTagSlugs={activeTagSlugs}
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
  activeTag,
  activeTagSlugs,
}: Props) {
  const t = useTranslations('vaultWidgets.tree');
  const children = useMemo(() => tree.children ?? [], [tree]);
  const tagSlugs = activeTag ? activeTagSlugs : undefined;
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
            activeTagSlugs={tagSlugs}
          />
        ))}
    </nav>
  );
}
