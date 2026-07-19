'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';
import {
  TopologyV2KindGlyph,
  isTopologyV2RenderableKind,
} from '@/shared/ui/topology-v2-kind-glyph';

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
  /**
   * slug → VaultDoc 조회. frontmatter.kind 로 machined kind glyph (project
   * hex · domain chip · capability circle · element via-pad) 를 고른다.
   * 없으면 일반 FileText 아이콘으로 fallback (기존 동작 그대로).
   */
  docsBySlug?: Map<string, VaultDoc>;
}

/** 디렉터리 노드 아래 실제 문서(leaf) 개수 — 음각 count 로 노출. */
function countDocs(node: VaultTreeNode): number {
  if (node.type === 'doc') return node.slug ? 1 : 0;
  return (node.children ?? []).reduce((sum, child) => sum + countDocs(child), 0);
}

function DocKindGlyph({
  slug,
  docsBySlug,
}: {
  slug: string;
  docsBySlug?: Map<string, VaultDoc>;
}) {
  const kind = docsBySlug?.get(slug)?.frontmatter?.kind;
  const kindStr = typeof kind === 'string' ? kind : '';
  if (kindStr && isTopologyV2RenderableKind(kindStr)) {
    return <TopologyV2KindGlyph kind={kindStr} size={12} className="shrink-0" />;
  }
  return (
    <FileText
      size={12}
      className="text-[color:var(--color-text-quaternary)]"
      aria-hidden
    />
  );
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
  docsBySlug,
}: {
  node: VaultTreeNode;
  depth: number;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  query: string;
  activeTagSlugs?: Set<string>;
  visibleDocSlugs?: Set<string>;
  docsBySlug?: Map<string, VaultDoc>;
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
        className={`group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-[background-color,color,transform] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset ${
          active
            ? 'bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]'
        }`}
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
          />
        ) : null}
        <DocKindGlyph slug={node.slug} docsBySlug={docsBySlug} />
        <span className="min-w-0 flex-1 truncate">{node.title ?? node.name}</span>
      </button>
    );
  }

  // directory
  const docCount = countDocs(node);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] font-medium text-[color:var(--color-text-quaternary)] transition-[background-color,color,transform] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown size={12} aria-hidden />
        ) : (
          <ChevronRight size={12} aria-hidden />
        )}
        <Folder size={12} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {docCount > 0 ? (
          <span
            data-token="engraved-numeral"
            className="flex-none font-mono text-[10.5px] tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {docCount}
          </span>
        ) : null}
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
                docsBySlug={docsBySlug}
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
  docsBySlug,
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
            docsBySlug={docsBySlug}
          />
        ))}
    </nav>
  );
}
