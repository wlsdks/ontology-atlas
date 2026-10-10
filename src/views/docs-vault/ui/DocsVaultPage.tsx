'use client';

import { Suspense, useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  useLocalVault,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { OntologyStarterCta } from '@/features/docs-vault-local';
import { recentVaultRowKey } from '@/features/vault-switch';
import { buildOntologyDeeplinkForDoc } from '@/entities/docs-vault';
import { useDocumentTitle } from '@/shared/lib/use-document-title';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { useClaimShellKey } from '@/shared/lib/shell-key-claims';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import {
  RouteLoadingFallback,
  SimilarNodeWarning,
  controlClass,
  useToast,
} from '@/shared/ui';
import { useBackToTop, useDocReadingScrollSpy } from '@/widgets/doc-reading-pane';
import { DocsVaultUnifiedPalette } from '@/widgets/docs-vault';
import { useDocAccess } from '../model/use-doc-access';
import { useDocCollection } from '../model/use-doc-collection';
import { useDocOutline } from '../model/use-doc-outline';
import { useDocReview } from '../model/use-doc-review';
import { useDocTabs } from '../model/use-doc-tabs';
import { useQuerySlugVerdict } from '../model/use-query-slug-verdict';
import { useDocWriteActions } from '../model/use-doc-write-actions';
import { useDocsVaultAddress, useDocsVaultUrlSync } from '../model/use-docs-vault-url';
import { useDocsVaultCommands } from '../model/use-docs-vault-commands';
import { useDocsVaultSource } from '../model/use-docs-vault-source';
import { useVaultManifest } from '../model/use-vault-manifest';
import {
  shouldShowSampleWelcomeNote,
  type DocsVaultDocCollection,
} from '../lib/docs-vault-collection';
import {
  readStoredListCollapsed,
  storeListCollapsed,
} from '../lib/persistence';
import { buildSkillParityHandoff } from '../lib/skill-parity-handoff';
import type { SkillParityRow } from '../lib/skill-parity';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useAgentFilesModel } from '../lib/use-agent-files';
import { usePaletteState } from '../lib/use-palette-state';
import { useSkillParity } from '../lib/use-skill-parity';
import { DocsVaultHeader } from './DocsVaultHeader';
import { DocsVaultDocumentPane } from './DocsVaultDocumentPane';
import { DocsVaultSidebar } from './DocsVaultSidebar';
import { DocsSidebarBody } from './parts/DocsSidebarBody';
import { DesktopVaultWelcome } from './parts/DesktopVaultWelcome';
import { DocsVaultAuditModal } from './parts/DocsVaultAuditModal';
import { DeleteDocDialog } from './parts/DeleteDocDialog';
import { EmptyState } from './parts/EmptyState';
import { NewDocKindDialog } from './parts/NewDocKindDialog';
import { RenameDocDialog } from './parts/RenameDocDialog';

function DocsVaultContent({
  initialCollection,
  documentScope,
  legacyEntry,
}: {
  initialCollection: DocsVaultDocCollection;
  documentScope: 'all' | 'ontology';
  legacyEntry: boolean;
}) {
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const siteT = useTranslations('metadata');
  const tSkillParity = useTranslations('skillParity');
  const toast = useToast();
  const localVault = useLocalVault();
  const openLocalVault = localVault.open;
  const address = useDocsVaultAddress();
  const {
    view,
    insightsReturnTab,
    workspaceHref,
    getDocHref,
    getProjectHref,
    libraryOntologyHref,
  } = address;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(address.querySlug);
  // A truthy `openWith` opens the palette; its value is the initial query (`>`, `#`, ``).
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  // No visible menu remains; other surfaces still call `setAdvancedOpen(false)` to close popovers.
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
  const { open: vaultChipOpen, setOpen: setVaultChipOpen, ref: vaultChipMenuRef } =
    useAdvancedMenu();
  // Set when the reader picks a real document; `shouldShowSampleWelcomeNote` combines it.
  const [sampleWelcomeDismissed, setSampleWelcomeDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  const [docListCollapsed, setDocListCollapsedState] = useState(readStoredListCollapsed);
  const [docListToggled, setDocListToggled] = useState(false);
  const docListPresence = usePanelPresence(!docListCollapsed);
  const docListLeaving = docListToggled && docListCollapsed && docListPresence.mounted;
  const toggleDocListCollapsed = useCallback(() => {
    setDocListToggled(true);
    setDocListCollapsedState((collapsed) => {
      const next = !collapsed;
      storeListCollapsed(next);
      return next;
    });
  }, []);
  const src = useDocsVaultSource({
    address,
    setAdvancedOpen,
    setSelectedSlug,
    setActiveTag,
    setSampleWelcomeDismissed,
  });
  const {
    source,
    installedShell,
    isDesktopRuntime,
    localSourceDisabled,
    localVaultRootPath,
    handleTogglePin,
    showDesktopWelcome,
    vaultScopeSettled,
    handleOpenDogfoodVault,
    handleSourceChange,
    handleOpenAgentGraphWorkflowGuide,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  } = src;

  // Always starts closed; a modal on every load violates modality.
  const [contractOpen, setContractOpen] = useState(false);
  const closePopovers = useCallback(() => {
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const openContract = useCallback(() => {
    // Single-transient rule: opening a modal closes the other popovers.
    closePopovers();
    setContractOpen(true);
  }, [closePopovers]);
  const closeContract = useCallback(() => setContractOpen(false), []);
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocReadingScrollSpy(selectedSlug, source);
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);
  const vault = useVaultManifest({
    isLocalSourceLoaded,
    staticSampleOverride: src.staticSampleOverride,
    querySlug: address.querySlug,
    selectedSlug,
    legacyEntry,
    documentScope,
  });
  const {
    staticVault,
    manifest,
    normalizedQuerySlug,
    legacyDocumentMode,
    legacyRedirectToLibrary,
    scopedDocs,
    scopedDocSlugs,
    selectedDoc,
    staticHeadings,
    ontologyDerivation,
    docsBySlug,
    vaultSlugs,
    refSlugResolver,
  } = vault;
  const access = useDocAccess({ source, isLocalSourceLoaded, selectedSlug });
  const { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing } = access;
  const { treeSort, treeGroup, handleViewChange, handleTreeSortChange, handleTreeGroupChange } =
    useDocsVaultUrlSync({
      address,
      vault,
      selectedSlug,
      setSelectedSlug,
      setAdvancedOpen,
      vaultScopeSettled,
    });
  const tabs = useDocTabs({ address, vault, src, selectedSlug, setSelectedSlug });
  const { openDocTabs } = tabs;
  const { missingQuerySlug, vaultScope, appTouchedSlugsRef } = useQuerySlugVerdict({
    address,
    vault,
    src,
  });
  const showSampleWelcomeNote = shouldShowSampleWelcomeNote({
    source,
    normalizedQuerySlug: normalizedQuerySlug ?? selectedSlug,
    dismissed: sampleWelcomeDismissed,
  });
  // Every surface names a document the same way; the file path stays in the caption below.
  const selectedDocDisplayTitle = selectedDoc
    ? resolveLocaleDisplayName(selectedDoc.frontmatter, locale, selectedDoc.title)
    : "";
  const writes = useDocWriteActions({
    address,
    vault,
    src,
    appTouchedSlugsRef,
    access,
    selectedSlug,
    setSelectedSlug,
    setAdvancedOpen,
    closePopovers,
  });
  const {
    deleteTarget,
    setDeleteTarget,
    handleDeleteCurrent,
    confirmDelete,
    renameTarget,
    setRenameTarget,
    handleRenameCurrent,
    confirmRename,
    isSlugTaken,
    handleScaffoldOntologyStarter,
    newDocKindDialogOpen,
    setNewDocKindDialogOpen,
    handleOpenNewDocDialog,
    pendingSimilarDoc,
    handleCreateNewDocWithKind,
    openPendingSimilarDoc,
    createPendingDocAnyway,
    domainOptions,
    kindChangeReferrers,
    handlePatchDocFrontmatter,
    handleMoveToKindFolder,
  } = writes;
  // Static export cannot prebuild per-slug metadata; mirrors layout.tsx's `%s · siteName`.
  useDocumentTitle(
    selectedDoc ? `${selectedDocDisplayTitle} · ${siteT('siteName')}` : null,
  );
  const { reviewQueue, selectedReviewRow, reviewBusy, handleReviewWrite } = useDocReview({
    scopedDocs,
    getDocContent,
    source,
    staticVault,
    selectedSlug,
    selectedDoc,
  });
  const {
    docCollection,
    highlightQuery,
    collectionDocs,
    collectionTagCounts,
    collectionManifest,
    collectionDocSlugs,
    collectionCounts,
    collectionPinnedSlugs,
    collectionRecentSlugs,
    docsBodyIndex,
    docsBodyIndexing,
    handleCollectionChange,
    handleSelect,
    handleCloseDocTab,
  } = useDocCollection({
    address,
    vault,
    src,
    tabs,
    documentScope,
    initialCollection,
    selectedSlug,
    setSelectedSlug,
    setActiveTag,
    setSampleWelcomeDismissed,
    paletteOpen,
    getDocContent,
  });
  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect],
  );
  // ⌘K is this workspace's palette, so the shell search stands aside.
  useClaimShellKey('search');
  useTypingShortcuts([
    {
      combo: { key: 'k', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'o', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true, shift: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '> ' : null)),
    },
    {
      combo: { key: '/' },
      disabled: paletteOpen,
      onFire: () => setPaletteQuery(''),
    },
  ]);
  const { outlineHeadings, showOutlineRail, handleHeadingNavigate } = useDocOutline({
    selectedDoc,
    staticHeadings,
    setActiveHeadingSlug,
  });
  const { commands } = useDocsVaultCommands({
    src,
    access,
    address,
    writes,
    selectedSlug,
    activeTag,
    setActiveTag,
    setPaletteQuery,
    handleViewChange,
    legacyDocumentMode,
  });
  // From the whole manifest, independent of the collection filter; read-only.
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  // Skill-copy parity only with a real absolute path; the web falls back to the handle name.
  const skillParityRoot =
    isDesktopRuntime && localVault.handle
      ? getTauriVaultRootPath(localVault.handle) ?? null
      : null;
  const skillParity = useSkillParity(skillParityRoot);
  const handleCopySkillParityHandoff = useCallback(
    (rows: SkillParityRow[]) => {
      if (!skillParityRoot) return;
      const text = buildSkillParityHandoff(rows, skillParityRoot);
      if (!text) return;
      void navigator.clipboard
        .writeText(text)
        .then(() => toast.show(tSkillParity("copied"), "success"))
        .catch(() => toast.show(tSkillParity("copyFailed"), "error"));
    },
    [toast, tSkillParity, skillParityRoot],
  );
  const handleVaultPillSwap = useCallback(() => {
    if (source !== 'local' && isDesktopRuntime) {
      handleSourceChange('local');
      return;
    }
    void openLocalVault();
  }, [source, isDesktopRuntime, handleSourceChange, openLocalVault]);

  // One neutral frame until source and restored manifest settle, so the static manifest
  // never paints as the installed app's data.
  if (!vaultScopeSettled || legacyRedirectToLibrary) return <RouteLoadingFallback />;

  return (
    <div className="flex h-full w-full">
      <div className="topology-ui-scale relative flex h-full min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 44px chrome grid keeps the content start line fixed across views. Below lg the header
         wraps to two rows to avoid overflow at 390px (local-vault-picker.spec.ts). */}
      <div data-chrome-grid="44" className="flex-none">
      <DocsVaultHeader
        legacyDocumentMode={legacyDocumentMode}
        docListCollapsed={docListCollapsed}
        libraryOntologyHref={libraryOntologyHref}
        insightsReturnTab={insightsReturnTab}
        workspaceHref={workspaceHref}
        setSourceTreeOpen={setSourceTreeOpen}
        toggleDocListCollapsed={toggleDocListCollapsed}
        vaultChipIdentity={vaultChipIdentity}
        scopedDocs={scopedDocs}
        manifest={manifest}
        scopedDocSlugs={scopedDocSlugs}
        isLocalSourceLoaded={isLocalSourceLoaded}
        localVaultRootPath={localVaultRootPath}
        vaultChipOpen={vaultChipOpen}
        setVaultChipOpen={setVaultChipOpen}
        vaultChipMenuRef={vaultChipMenuRef}
        setAdvancedOpen={setAdvancedOpen}
        handleVaultPillSwap={handleVaultPillSwap}
        source={source}
        installedShell={installedShell}
        handleSourceChange={handleSourceChange}
        localSourceDisabled={localSourceDisabled}
        openContract={openContract}
        view={view}
        openDocTabs={openDocTabs}
        selectedSlug={selectedSlug}
        handleSelect={handleSelect}
        handleCloseDocTab={handleCloseDocTab}
        setPaletteQuery={setPaletteQuery}
      />
      </div>
      <DocsVaultAuditModal
        skillParity={skillParity}
        onCopySkillParityHandoff={handleCopySkillParityHandoff}
        tSkillParity={tSkillParity}
        open={contractOpen}
        manifest={manifest}
        nodeCount={ontologyDerivation.nodes.length}
        edgeCount={ontologyDerivation.edges.length}
        graphHref={
          selectedDoc
            ? (buildOntologyDeeplinkForDoc(selectedDoc) ?? '/ontology/')
            : '/ontology/'
        }
        isLocalSourceLoaded={isLocalSourceLoaded}
        onClose={closeContract}
        t={t}
      />

      {/* A local vault in error or needing permission says so instead of silently showing the sample. */}
      {source === 'local' &&
      (localVault.status === 'error' ||
        localVault.status === 'permission-needed') ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-4 py-2 text-body text-[color:var(--color-status-danger)]"
          role="status"
        >
          <span className="flex-1">
            {localVault.status === 'permission-needed'
              ? t('vaultStatus.permissionNeededBanner')
              : // A rejection is not a failure; do not leak the cause string.
                localVault.errorCode === 'root-rejected'
                ? t('vaultStatus.rootRejectedBanner')
                : // Each code owns a finished sentence; append the cause only when there is one.
                  localVault.errorCode === 'grant-needed'
                  ? t('vaultStatus.grantNeededBanner')
                  : localVault.errorCode === 'path-missing'
                  ? t('vaultStatus.pathMissingBanner')
                  : localVault.errorCode === 'permission-denied'
                    ? t('vaultStatus.permissionDeniedBanner')
                    : localVault.errorMessage
                      ? t('vaultStatus.errorBanner', { message: localVault.errorMessage })
                      : t('vaultStatus.unknownErrorBanner')}
          </span>
          <button
            type="button"
            onClick={() =>
              localVault.status === 'permission-needed'
                ? localVault.requestPermission()
                : void openLocalVault()
            }
            className={controlClass({
              shape: 'chip',
              tone: 'danger',
              className: 'hover:bg-[color:var(--color-danger-a12)]',
            })}
          >
            {t('vaultStatus.openPicker')}
          </button>
        </div>
      ) : null}

      {/* Say so when `?slug=` does not resolve in this vault; default selection draws another document. */}
      {missingQuerySlug ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-2 text-body text-[color:var(--color-status-warning)]"
          role="status"
          data-testid="docs-missing-slug-banner"
        >
          <span className="min-w-0 flex-1 truncate">
            {t('vaultStatus.missingSlugBanner', { slug: missingQuerySlug })}
          </span>
          {selectedDoc ? (
            <Link
              href={getDocHref(selectedDoc.slug)}
              data-testid="docs-missing-slug-fallback"
              className={controlClass({ shape: 'link', tone: 'secondary', className: 'shrink-0 text-label' })}
            >
              {t('vaultStatus.openFallback')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {showDesktopWelcome ? (
        <DesktopVaultWelcome
          status={localVault.status}
          recentVaults={localVault.recentVaults}
          onOpen={() => void openLocalVault()}
          // The web cannot open an absolute path (`.claude/rules/surfaces.md` forbids a dead CTA), and working web paths sit beside it.
          onOpenDogfoodPath={isDesktopRuntime ? handleOpenDogfoodVault : undefined}
          onOpenRecent={(record) => void localVault.openRecent(record)}
          onForgetRecent={(record) => void localVault.forgetRecent(record)}
          currentVaultKey={
            localVault.storedVaultRecord
              ? recentVaultRowKey(localVault.storedVaultRecord)
              : null
          }
          choosing={localVault.awaitingVaultChoice}
          // Only the installed app can reopen the folder without a permission gesture.
          canResumeWithoutGesture={isDesktopRuntime}
          showDogfoodHint={showDogfoodHint}
          t={t}
        />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1">
        <DocsVaultSidebar
          sourceTreeOpen={sourceTreeOpen}
          setSourceTreeOpen={setSourceTreeOpen}
          docListCollapsed={docListCollapsed}
          docListLeaving={docListLeaving}
          docListToggled={docListToggled}
        >
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
        </DocsVaultSidebar>

        <main
          id="main"
      tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          /**
           * Measures in the installed app whether dot directories were read, a desktop capability a browser
           * cannot prove (`.claude/rules/surfaces.md`). `-` means no capability
           * (web), `0/0` means capable with no skill tree.
           */
          data-skill-parity={
            skillParity ? `${skillParity.rows.length}/${skillParity.disagreeing}` : "-"
          }
        >
          {selectedDoc ? (
            <DocsVaultDocumentPane
              selectedDoc={selectedDoc}
              editing={editing}
              setEditing={setEditing}
              showSampleWelcomeNote={showSampleWelcomeNote}
              localSourceDisabled={localSourceDisabled}
              handleSourceChange={handleSourceChange}
              setSampleWelcomeDismissed={setSampleWelcomeDismissed}
              canEditCurrent={canEditCurrent}
              handleRenameCurrent={handleRenameCurrent}
              handleDeleteCurrent={handleDeleteCurrent}
              isLocalSourceLoaded={isLocalSourceLoaded}
              articleScrollRef={articleScrollRef}
              showOutlineRail={showOutlineRail}
              outlineHeadings={outlineHeadings}
              activeHeadingSlug={activeHeadingSlug}
              handleHeadingNavigate={handleHeadingNavigate}
              backToTop={backToTop}
              editResolver={editResolver}
              vaultScope={vaultScope}
              manifest={manifest}
              domainOptions={domainOptions}
              handlePatchDocFrontmatter={handlePatchDocFrontmatter}
              handleMoveToKindFolder={handleMoveToKindFolder}
              kindChangeReferrers={kindChangeReferrers}
              handleSelect={handleSelect}
              refSlugResolver={refSlugResolver}
              docsBySlug={docsBySlug}
              selectedReviewRow={selectedReviewRow}
              getDocContent={getDocContent}
              reviewBusy={reviewBusy}
              handleReviewWrite={handleReviewWrite}
              source={source}
              vaultSlugs={vaultSlugs}
              getDocHref={getDocHref}
              getProjectHref={getProjectHref}
              highlightQuery={highlightQuery}
              resolveImage={resolveImage}
              staticVault={staticVault}
            />
          ) : source === 'local' &&
            localVault.status === 'loaded' &&
            canEditCurrent &&
            scopedDocs.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center px-5 pt-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] lg:pb-5">
                <div className="w-full max-w-3xl">
                  <OntologyStarterCta
                    onScaffold={handleScaffoldOntologyStarter}
                    docCount={0}
                    vaultPath={
                      localVault.handle
                        ? getTauriVaultRootPath(localVault.handle)
                        : null
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              docCount={scopedDocs.length}
              onOpenAgentWorkflow={handleOpenAgentGraphWorkflowGuide}
              onOpenTree={() => setSourceTreeOpen(true)}
            />
          )}
        </main>

          </div>
        </>
      )}

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
      </div>
    </div>
  );
}

export function DocsVaultPage({
  initialCollection = 'guides',
  documentScope = 'all',
  legacyEntry = false,
}: {
  /** The collection a no-slug entry opens. Explicit slugs and later choices still win. */
  initialCollection?: DocsVaultDocCollection;
  /** Fix Library's Ontology tab to authored ontology nodes; generic Docs remains unscoped. */
  documentScope?: 'all' | 'ontology';
  /** Resolve `/docs` only as an exact non-ontology document reader; otherwise return to Library. */
  legacyEntry?: boolean;
} = {}) {
  // Local-first core (`.claude/rules/local-first.md` §1): no auth gate before the vault picker.
  return (
    <VaultSourceHydrationBoundary>
      {/* Prerendered HTML carries this fallback; null would start as a black screen. */}
      <Suspense fallback={<RouteLoadingFallback />}>
        <DocsVaultContent
          initialCollection={initialCollection}
          documentScope={documentScope}
          legacyEntry={legacyEntry}
        />
      </Suspense>
    </VaultSourceHydrationBoundary>
  );
}
