'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';
import {
  TopologyV2KindGlyph,
  isTopologyV2RenderableKind,
} from '@/shared/ui/topology-v2-kind-glyph';
import {
  DEFAULT_DOCS_TREE_GROUP,
  DEFAULT_DOCS_TREE_SORT,
  buildDocsTreeRecencyIndex,
  sortDocsTreeNodes,
  type DocsTreeGroup,
  type DocsTreeOrder,
  type DocsTreeSort,
} from '../lib/tree-order';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { RowButton } from '@/shared/ui';

interface Props {
  tree: VaultTreeNode;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  query?: string;
  /** Order within a group. Name order by default. The contract is `lib/tree-order.ts`. */
  sort?: DocsTreeSort;
  /** Which to draw first, folders or documents. Folders first by default. */
  group?: DocsTreeGroup;
  /** The active tag filter. null clears it. */
  activeTag?: string | null;
  /** The slugs the active tag matches. Used only while activeTag is set. */
  activeTagSlugs?: Set<string>;
  /** The slugs within the current document scope. Without it, the whole tree renders. */
  visibleDocSlugs?: Set<string>;
  /**
   * slug → VaultDoc lookup. `frontmatter.kind` selects the machined kind glyph
   * (project hex · domain chip · capability circle · element via-pad); without it,
   * fall back to the generic FileText icon (the previous behaviour).
   */
  docsBySlug?: Map<string, VaultDoc>;
}

/** How many actual documents (leaves) sit under a directory node — shown as an engraved count. */
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
      size={ICON_SIZE.sm}
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
  order,
}: {
  node: VaultTreeNode;
  depth: number;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  query: string;
  activeTagSlugs?: Set<string>;
  visibleDocSlugs?: Set<string>;
  docsBySlug?: Map<string, VaultDoc>;
  order: DocsTreeOrder;
}) {
  const locale = useLocale();
  // With a tag or search filter active, matching paths auto-expand — a filtered
  // document hidden inside a collapsed folder defeats the source list's purpose.
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
      <RowButton
        active={active}
        onClick={() => onSelect(node.slug!)}
        aria-current={active ? 'page' : undefined}
        className="group relative transition-[background-color,color,transform] motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
          />
        ) : null}
        <DocKindGlyph slug={node.slug} docsBySlug={docsBySlug} />
        {/* The list, search and map call one document by the same name — if only the
            tree drew the canonical title, the sidebar and the popover would state
            different names. */}
        <span className="min-w-0 flex-1 truncate">
          {resolveLocaleDisplayName(
            docsBySlug?.get(node.slug)?.frontmatter,
            locale,
            node.title ?? node.name,
          )}
        </span>
      </RowButton>
    );
  }

  // directory
  const docCount = countDocs(node);
  return (
    <div>
      <RowButton
        tone="muted"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-[var(--font-weight-signature)] transition-[background-color,color,transform] motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.99] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
        style={{ paddingLeft: `${16 + depth * 12}px` }}
      >
        {open ? (
          <ChevronDown size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <ChevronRight size={ICON_SIZE.sm} aria-hidden />
        )}
        <Folder size={ICON_SIZE.sm} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {docCount > 0 ? (
          <span
            data-token="engraved-numeral"
            className="flex-none font-mono text-label tabular-nums text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {docCount}
          </span>
        ) : null}
      </RowButton>
      {(open || activeTagSlugs || query) && node.children ? (
        <div>
          {sortDocsTreeNodes(node.children, order).map((child) => (
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
              order={order}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The source vault tree. Directories collapse and expand; a source record calls
 * onSelect on click.
 */
export function DocsVaultTree({
  tree,
  selectedSlug,
  onSelect,
  query,
  sort = DEFAULT_DOCS_TREE_SORT,
  group = DEFAULT_DOCS_TREE_GROUP,
  activeTag,
  activeTagSlugs,
  visibleDocSlugs,
  docsBySlug,
}: Props) {
  const t = useTranslations('vaultWidgets.tree');
  const children = useMemo(() => tree.children ?? [], [tree]);
  const tagSlugs = activeTag ? activeTagSlugs : undefined;
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  // Modification times live in the manifest, not the tree. In name order they are not
  // computed at all — there is no reason to build an unused index across 158 documents.
  const order = useMemo<DocsTreeOrder>(
    () => ({
      sort,
      group,
      recency:
        sort === 'recent' && docsBySlug
          ? buildDocsTreeRecencyIndex(tree, docsBySlug)
          : undefined,
    }),
    [docsBySlug, group, sort, tree],
  );
  return (
    <nav
      aria-label={t('navAria')}
      className="flex h-full flex-col gap-0.5 overflow-auto py-2"
    >
      {sortDocsTreeNodes(children, order).map((child) => (
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
          order={order}
        />
      ))}
    </nav>
  );
}
