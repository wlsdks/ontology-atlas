'use client';

import type { useDocsVaultUrlSync } from '../model/use-docs-vault-url';
import type { useDocReview } from '../model/use-doc-review';
import type { useDocCollection } from '../model/use-doc-collection';
import type { useVaultManifest } from '../model/use-vault-manifest';
import type { useDocWriteActions } from '../model/use-doc-write-actions';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { IconButton, Surface } from '@/shared/ui';
import type { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import type { DocsTreeGroup, DocsTreeSort } from '@/widgets/docs-vault';
import type { DocsVaultCollection } from '../lib/docs-vault-collection';
import { DocsSidebarBody } from './parts/DocsSidebarBody';
import type { useAgentFilesModel } from '../lib/use-agent-files';

export function DocsVaultSidebar({
  reviewQueue,
  collectionPinnedSlugs,
  collectionRecentSlugs,
  selectedSlug,
  docsBySlug,
  activeTag,
  collectionManifest,
  docCollection,
  collectionCounts,
  documentScope,
  legacyDocumentMode,
  collectionDocSlugs,
  handleSelectFromSidebar,
  handleCollectionChange,
  handleTogglePin,
  setActiveTag,
  canEditCurrent,
  handleOpenNewDocDialog,
  handleVaultPillSwap,
  treeSort,
  treeGroup,
  handleTreeSortChange,
  handleTreeGroupChange,
  agentFiles,
  sourceTreeOpen,
  setSourceTreeOpen,
  docListCollapsed,
  docListLeaving,
  docListToggled,
}: {
  reviewQueue: ReturnType<typeof useDocReview>['reviewQueue'];
  collectionPinnedSlugs: ReturnType<typeof useDocCollection>['collectionPinnedSlugs'];
  collectionRecentSlugs: ReturnType<typeof useDocCollection>['collectionRecentSlugs'];
  selectedSlug: string | null;
  docsBySlug: ReturnType<typeof useVaultManifest>['docsBySlug'];
  activeTag: string | null;
  collectionManifest: ReturnType<typeof useDocCollection>['collectionManifest'];
  docCollection: DocsVaultCollection;
  collectionCounts: ReturnType<typeof useDocCollection>['collectionCounts'];
  documentScope: 'all' | 'ontology';
  legacyDocumentMode: boolean;
  collectionDocSlugs: ReturnType<typeof useDocCollection>['collectionDocSlugs'];
  handleSelectFromSidebar: (slug: string) => void;
  handleCollectionChange: ReturnType<typeof useDocCollection>['handleCollectionChange'];
  handleTogglePin: ReturnType<typeof useDocsVaultPersistence>['togglePin'];
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  canEditCurrent: boolean;
  handleOpenNewDocDialog: ReturnType<typeof useDocWriteActions>['handleOpenNewDocDialog'];
  handleVaultPillSwap: () => void;
  treeSort: DocsTreeSort;
  treeGroup: DocsTreeGroup;
  handleTreeSortChange: ReturnType<typeof useDocsVaultUrlSync>['handleTreeSortChange'];
  handleTreeGroupChange: ReturnType<typeof useDocsVaultUrlSync>['handleTreeGroupChange'];
  agentFiles: ReturnType<typeof useAgentFilesModel>;
  sourceTreeOpen: boolean;
  setSourceTreeOpen: Dispatch<SetStateAction<boolean>>;
  docListCollapsed: boolean;
  docListLeaving: boolean;
  docListToggled: boolean;
}) {
  const t = useTranslations('docsVault');
  const sidebarBody = (
    <DocsSidebarBody
      reviewQueue={reviewQueue}
      pinnedSlugs={collectionPinnedSlugs}
      recentSlugs={collectionRecentSlugs}
      selectedSlug={selectedSlug}
      docsBySlug={docsBySlug}
      activeTag={activeTag}
      manifest={collectionManifest}
      collection={docCollection}
      collectionCounts={collectionCounts}
      showCollectionChooser={documentScope !== 'ontology'}
      showCreateDocument={!legacyDocumentMode}
      visibleDocSlugs={collectionDocSlugs}
      onSelect={handleSelectFromSidebar}
      onCollectionChange={handleCollectionChange}
      onTogglePin={handleTogglePin}
      onTagSelect={setActiveTag}
      // In the read-only sample the `+` opens a folder, the path that makes creating possible.
      onCreateNewDoc={canEditCurrent ? handleOpenNewDocDialog : handleVaultPillSwap}
      canCreateNewDoc={canEditCurrent}
      sort={treeSort}
      group={treeGroup}
      onSortChange={handleTreeSortChange}
      onGroupChange={handleTreeGroupChange}
      agentFiles={documentScope === 'ontology' ? null : agentFiles}
    />
  );
  return (
    <>
      {/* Tree navigation is opt-in so the document surface stays primary. */}
      {/* Full-screen surface: opacity-only motion. */}
      <Surface
        open={sourceTreeOpen}
        motion="overlay"
        className="fixed inset-0 z-40 flex"
      >
          <div
            className="absolute inset-0 bg-[color:var(--color-scrim-a50)]"
            onClick={() => setSourceTreeOpen(false)}
            aria-hidden
          />
          <aside className="relative flex w-[300px] max-w-[84vw] flex-col overflow-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-dock-side)] md:w-[340px]">
            <div className="flex h-12 flex-none items-center justify-between border-b border-[color:var(--color-border-soft)] px-3">
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t('mobileDrawer.title')}
              </span>
              <IconButton
                label={t('mobileDrawer.closeAriaLabel')}
                onClick={() => setSourceTreeOpen(false)}
                className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </div>
            <div className="flex flex-1 flex-col overflow-auto">
              {sidebarBody}
            </div>
          </aside>
      </Surface>

      <aside
        data-testid="docs-vault-doc-list"
        data-doc-list-state={docListCollapsed ? (docListLeaving ? 'exiting' : 'collapsed') : 'open'}
        aria-label={t('mobileDrawer.title')}
        aria-hidden={docListCollapsed}
        inert={docListCollapsed}
        className={cn(
          'hidden w-[var(--docs-list-width)] flex-none flex-col overflow-hidden border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]',
          !docListCollapsed
            ? cn('lg:flex', docListToggled && 'map-overlay-in')
            : docListLeaving && 'map-overlay-out absolute inset-y-0 left-0 lg:flex',
        )}
      >
        {sidebarBody}
      </aside>
    </>
  );
}
