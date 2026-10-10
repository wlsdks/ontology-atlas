'use client';

import type { useCollectionDocs } from '../model/use-collection-docs';
import type { useDocWriteActions } from '../model/use-doc-write-actions';
import type { useDocsVaultCommands } from '../model/use-docs-vault-commands';
import type { useDocsVaultAddress } from '../model/use-docs-vault-address';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import { SimilarNodeWarning } from '@/shared/ui';
import { DocsVaultUnifiedPalette, useDocsBodyIndex } from '@/widgets/docs-vault';
import { NewDocKindDialog } from '../ui/parts/NewDocKindDialog';
import { RenameDocDialog } from '../ui/parts/RenameDocDialog';
import { DeleteDocDialog } from '../ui/parts/DeleteDocDialog';

export function DocsVaultDialogs({
  paletteOpen,
  paletteQuery,
  setPaletteQuery,
  collectionDocs,
  collectionRecentSlugs,
  collectionPinnedSlugs,
  commands,
  collectionTagCounts,
  handleSelect,
  setActiveTag,
  getDocHref,
  docsBodyIndex,
  docsBodyIndexing,
  newDocKindDialogOpen,
  handleCreateNewDocWithKind,
  setNewDocKindDialogOpen,
  renameTarget,
  isSlugTaken,
  setRenameTarget,
  confirmRename,
  deleteTarget,
  confirmDelete,
  setDeleteTarget,
  pendingSimilarDoc,
  openPendingSimilarDoc,
  createPendingDocAnyway,
}: {
  paletteOpen: boolean;
  paletteQuery: string | null;
  setPaletteQuery: Dispatch<SetStateAction<string | null>>;
  collectionDocs: ReturnType<typeof useCollectionDocs>['collectionDocs'];
  collectionRecentSlugs: ReturnType<typeof useCollectionDocs>['collectionRecentSlugs'];
  collectionPinnedSlugs: ReturnType<typeof useCollectionDocs>['collectionPinnedSlugs'];
  commands: ReturnType<typeof useDocsVaultCommands>['commands'];
  collectionTagCounts: ReturnType<typeof useCollectionDocs>['collectionTagCounts'];
  handleSelect: (slug: string, query?: string) => void;
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  getDocHref: ReturnType<typeof useDocsVaultAddress>['getDocHref'];
  docsBodyIndex: ReturnType<typeof useDocsBodyIndex>['bodyIndex'];
  docsBodyIndexing: ReturnType<typeof useDocsBodyIndex>['indexing'];
  newDocKindDialogOpen: ReturnType<typeof useDocWriteActions>['newDocKindDialogOpen'];
  handleCreateNewDocWithKind: ReturnType<typeof useDocWriteActions>['handleCreateNewDocWithKind'];
  setNewDocKindDialogOpen: ReturnType<typeof useDocWriteActions>['setNewDocKindDialogOpen'];
  renameTarget: ReturnType<typeof useDocWriteActions>['renameTarget'];
  isSlugTaken: ReturnType<typeof useDocWriteActions>['isSlugTaken'];
  setRenameTarget: ReturnType<typeof useDocWriteActions>['setRenameTarget'];
  confirmRename: ReturnType<typeof useDocWriteActions>['confirmRename'];
  deleteTarget: ReturnType<typeof useDocWriteActions>['deleteTarget'];
  confirmDelete: ReturnType<typeof useDocWriteActions>['confirmDelete'];
  setDeleteTarget: ReturnType<typeof useDocWriteActions>['setDeleteTarget'];
  pendingSimilarDoc: ReturnType<typeof useDocWriteActions>['pendingSimilarDoc'];
  openPendingSimilarDoc: ReturnType<typeof useDocWriteActions>['openPendingSimilarDoc'];
  createPendingDocAnyway: ReturnType<typeof useDocWriteActions>['createPendingDocAnyway'];
}) {
  const t = useTranslations('docsVault');
  return (
    <>
      <AnimatePresence>
        {paletteOpen ? (
          <DocsVaultUnifiedPalette
            key="docs-unified-palette"
            onClose={() => setPaletteQuery(null)}
            docs={collectionDocs}
            recentSlugs={collectionRecentSlugs}
            pinnedSlugs={collectionPinnedSlugs}
            commands={commands}
            tagCounts={collectionTagCounts}
            onDocSelect={(slug, q) => handleSelect(slug, q)}
            onTagSelect={(tag) => setActiveTag(tag)}
            initialQuery={paletteQuery ?? ''}
            getDocHref={getDocHref}
            bodyIndex={docsBodyIndex}
            bodyIndexing={docsBodyIndexing}
          />
        ) : null}
      </AnimatePresence>

      <NewDocKindDialog
        open={newDocKindDialogOpen}
        onSelect={(kind) => void handleCreateNewDocWithKind(kind)}
        onClose={() => setNewDocKindDialogOpen(false)}
      />
      <RenameDocDialog
        target={renameTarget}
        isTaken={isSlugTaken}
        onCancel={() => setRenameTarget(null)}
        onConfirm={confirmRename}
      />
      <DeleteDocDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* Bottom chip without scrim or autofocus, so the content stays usable. */}
      <AnimatePresence>
        {pendingSimilarDoc ? (
          <div
            key="pending-similar-doc"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
          >
            <div className="pointer-events-auto w-full max-w-[var(--dialog-w-sm)]">
              <SimilarNodeWarning
                message={t('dialog.similarNodeWarning', { title: pendingSimilarDoc.match.title })}
                openLabel={t('dialog.similarNodeOpen')}
                createAnywayLabel={t('dialog.similarNodeCreateAnyway')}
                onOpen={openPendingSimilarDoc}
                onCreateAnyway={createPendingDocAnyway}
              />
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
