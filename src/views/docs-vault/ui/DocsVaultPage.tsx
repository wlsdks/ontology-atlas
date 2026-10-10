'use client';

import { useSkillParityHandoff } from '../model/use-skill-parity-handoff';
import { useDocsVaultUrlSync } from '../model/use-docs-vault-url-sync';
import { useDocReview } from '../model/use-doc-review';
import { useCollectionDocs } from '../model/use-collection-docs';
import { useDocAccess } from '../model/use-doc-access';
import { useCollectionSelection } from '../model/use-collection-selection';
import { useDocListLayout } from '../model/use-doc-list-layout';
import { useQuerySlugGuard } from '../model/use-query-slug-guard';
import { useVaultManifest } from '../model/use-vault-manifest';
import { useDogfoodVaultSwitch } from '../model/use-dogfood-vault-switch';
import { useLandingSource } from '../model/use-landing-source';
import { useDocTabs } from '../model/use-doc-tabs';
import { useActiveSource } from '../model/use-active-source';
import { useDocWriteActions } from '../model/use-doc-write-actions';
import { usePaletteShortcuts } from '../model/use-palette-shortcuts';
import { useDocsVaultCommands } from '../model/use-docs-vault-commands';
import { useDocsVaultSource } from '../model/use-docs-vault-source';
import { useDocOutline } from '../model/use-doc-outline';
import { useDocsVaultAddress } from '../model/use-docs-vault-address';
import { useDocSelection } from '../model/use-doc-selection';
import type { DocsVaultDocCollection, DocsVaultCollection } from '../lib/docs-vault-collection';
import { DocsVaultHeader } from './DocsVaultHeader';
import { DocsVaultDocumentPane } from './DocsVaultDocumentPane';
import { DocsVaultSidebar } from './DocsVaultSidebar';
import { DocsVaultDialogs } from './DocsVaultDialogs';
import { Suspense, useCallback, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  useLocalVault,
  useVaultSessionIdentityScope,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { OntologyStarterCta } from '@/features/docs-vault-local';
import { useDocumentTitle } from '@/shared/lib/use-document-title';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { useHydrated } from '@/shared/lib/use-hydrated';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { RouteLoadingFallback, controlClass } from '@/shared/ui';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import { useBackToTop, useDocReadingScrollSpy } from '@/widgets/doc-reading-pane';
import { usePaletteState } from '../lib/use-palette-state';
import { useDocsBodyIndex, type DocsTreeGroup, type DocsTreeSort } from '@/widgets/docs-vault';
import { buildOntologyDeeplinkForDoc, buildTopologyDeeplinkForDoc } from '@/entities/docs-vault';
import { DesktopVaultWelcome } from './parts/DesktopVaultWelcome';
import { recentVaultRowKey } from '@/features/vault-switch';
import { useReferrerListName } from './parts/DocFrontmatterBlock';
import { useAgentFilesModel } from '../lib/use-agent-files';
import { EmptyState } from './parts/EmptyState';
import { DocsVaultAuditModal } from './parts/DocsVaultAuditModal';
import { isDocsVaultLocalSourceDisabled, type DocsVaultView } from '../lib/persistence';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

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
  const referrerListName = useReferrerListName();
  const siteT = useTranslations('metadata');
  const tSkillParity = useTranslations('skillParity');
  const localVault = useLocalVault();
  const hydrated = useHydrated();
  const installedShell = hydrated && isDesktopShell();
  const {
    searchParams,
    routePathname,
    querySlug,
    queryView,
    querySource,
    querySample,
    queryDogfood,
    queryTreeSort,
    queryTreeGroup,
    insightsReturnTab,
    workspaceHref,
    getDocHref,
    getProjectHref,
    projectsListHref,
    replaceUrlState,
    generalDocsHref,
    legacyLibraryRedirectHref,
    libraryOntologyHref,
  } = useDocsVaultAddress();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(querySlug);
  // A truthy `openWith` opens the palette; its value is the initial query (`>`, `#`, ``).
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  const [paletteOpened, setPaletteOpened] = useState(false);
  if (paletteOpen && !paletteOpened) setPaletteOpened(true);
  const vaultSessionScope = useVaultSessionIdentityScope();
  const [view, setView] = useState<DocsVaultView>(queryView);
  // No visible menu remains; other surfaces still call `setAdvancedOpen(false)` to close popovers.
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
  const { open: vaultChipOpen, setOpen: setVaultChipOpen, ref: vaultChipMenuRef } =
    useAdvancedMenu();
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(undefined);
  // Set when the reader picks a real document.
  const [sampleWelcomeDismissed, setSampleWelcomeDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [docCollection, setDocCollection] = useState<DocsVaultCollection>(initialCollection);
  const [treeSort, setTreeSort] = useState<DocsTreeSort>(queryTreeSort);
  const [treeGroup, setTreeGroup] = useState<DocsTreeGroup>(queryTreeGroup);
  const {
    source,
    setSource,
    staticSampleOverride,
    setStaticSampleOverride,
    sourcePreferenceHydrated,
    setSourcePreferenceHydrated,
    isDesktopRuntime,
    localWinsInitialSource,
    localIntentAutoOpenRef,
  } = useDocsVaultSource({
    localVault,
    querySource,
    querySample,
    installedShell,
    setAdvancedOpen,
  });
  const { docListCollapsed, docListToggled, docListLeaving, toggleDocListCollapsed } =
    useDocListLayout();
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  const localVaultStatus = localVault.status;
  // Distinguishes "not known yet" from "confirmed absent"; the landing decision waits on it.
  const localVaultRestoreAttempted = localVault.restoreAttempted;
  const openLocalVault = localVault.open;
  const openRecentLocalVault = localVault.openRecent;
  const localVaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle) ?? localVault.handle.name ?? null
    : null;
  const handleOpenDogfoodVault = useDogfoodVaultSwitch({
    queryDogfood,
    isDesktopRuntime,
    source,
    localVaultStatus,
    localVaultRootPath,
    openRecentLocalVault,
  });
  const localSourceDisabled = isDocsVaultLocalSourceDisabled({
    isDesktopRuntime,
    localVaultStatus: localVault.status,
  });
  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ source, localVault });
  const { showDesktopWelcome, vaultScopeSettled } = useLandingSource({
    installedShell,
    isDesktopRuntime,
    localVault,
    localVaultStatus,
    localVaultRestoreAttempted,
    querySource,
    source,
    setSource,
    sourcePreferenceHydrated,
    setSourcePreferenceHydrated,
    localWinsInitialSource,
  });

  // Always starts closed; a modal on every load violates modality.
  const [contractOpen, setContractOpen] = useState(false);
  const openContract = useCallback(() => {
    // Single-transient rule: opening a modal closes the other popovers.
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setContractOpen(true);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const closeContract = useCallback(() => setContractOpen(false), []);
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocReadingScrollSpy(selectedSlug, source);
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);
  const {
    handleSourceChange,
    handleOpenAgentGraphWorkflowGuide,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  } = useActiveSource({
    source,
    setSource,
    setStaticSampleOverride,
    localVault,
    localVaultStatus,
    installedShell,
    isDesktopRuntime,
    queryDogfood,
    view,
    replaceUrlState,
    setSelectedSlug, setActiveTag, setSampleWelcomeDismissed,
    setAdvancedOpen, setRecentSlugs, localIntentAutoOpenRef,
  });
  const {
    staticVault,
    manifest,
    normalizedQuerySlug,
    legacyDocumentMode,
    legacyRedirectToLibrary,
    scopedDocs,
    scopedDocSlugs,
    staticHeadings,
    ontologyDerivation,
    docsBySlug,
    vaultSlugs,
    refSlugResolver,
  } = useVaultManifest({
    isLocalSourceLoaded,
    localVault,
    staticSampleOverride,
    querySlug,
    legacyEntry,
    documentScope,
  });
  const { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing } =
    useDocAccess({ source, localVault, isLocalSourceLoaded, selectedSlug });
  const {
    outOfScopeQuerySlug,
    showSampleWelcomeNote,
    handleViewChange,
    handleTreeSortChange,
    handleTreeGroupChange,
  } = useDocsVaultUrlSync({
    searchParams,
    queryView,
    queryTreeSort,
    queryTreeGroup,
    view,
    setView,
    treeSort,
    setTreeSort,
    treeGroup,
    setTreeGroup,
    replaceUrlState,
    setAdvancedOpen,
    documentScope,
    legacyEntry,
    manifest,
    normalizedQuerySlug,
    scopedDocSlugs,
    selectedSlug,
    setSelectedSlug,
    vaultScopeSettled,
    legacyRedirectToLibrary,
    generalDocsHref,
    legacyLibraryRedirectHref,
    source,
    sampleWelcomeDismissed,
  });
  const {
    openDocTabs,
    openDocTabsHydrated,
    rememberActiveSlug,
    closeDocTabInWorkingSet,
    pendingRestoredActiveSlug,
    selectedDoc,
  } = useDocTabs({
    recentKey,
    vaultSlugs,
    scopedDocSlugs,
    normalizedQuerySlug,
    routePathname,
    docsBySlug,
    selectedSlug,
    setSelectedSlug,
  });
  const { missingQuerySlug, vaultScope, appTouchedSlugsRef } = useQuerySlugGuard({
    normalizedQuerySlug,
    docsBySlug,
    vaultScopeSettled,
    source,
    recentKey,
    staticVault,
    replaceUrlState,
  });
  // Every surface names a document the same way; the file path stays in the caption below.
  const selectedDocDisplayTitle = selectedDoc
    ? resolveLocaleDisplayName(selectedDoc.frontmatter, locale, selectedDoc.title)
    : "";
  // Null means no place in the graph, so "open on the map" is not rendered.
  const mapDeeplinkForSelectedDoc = selectedDoc
    ? buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc)
    : null;
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
    handleInsertToc,
    handleExportDocHtml,
    domainOptions,
    kindChangeReferrers,
    handlePatchDocFrontmatter,
    handleMoveToKindFolder,
  } = useDocWriteActions({
    manifest,
    docsBySlug,
    selectedDoc,
    localVault,
    recentKey,
    replaceUrlState,
    setPinnedSlugs, setRecentSlugs, setSelectedSlug, setEditing, setView,
    setAdvancedOpen, setVaultChipOpen, setPaletteQuery, appTouchedSlugsRef,
    canEditCurrent, selectedSlug, generalDocsHref, referrerListName,
  });
  // Static export cannot prebuild per-slug metadata; mirrors layout.tsx's `%s · siteName`.
  useDocumentTitle(
    selectedDoc ? `${selectedDocDisplayTitle} · ${siteT('siteName')}` : null,
  );
  const {
    collectionDocs,
    collectionTagCounts,
    collectionManifest,
    collectionDocSlugs,
    collectionCounts,
    collectionPinnedSlugs,
    collectionRecentSlugs,
  } = useCollectionDocs({
    manifest,
    scopedDocs,
    documentScope,
    docCollection,
    pinnedSlugs,
    recentSlugs,
  });
  // Palette full-text index from the first open, keyed by mtime.
  const { bodyIndex: docsBodyIndex, indexing: docsBodyIndexing } = useDocsBodyIndex({
    docs: collectionDocs,
    enabled: paletteOpened,
    scope: vaultSessionScope,
    getDocContent,
  });
  const { reviewQueue, selectedReviewRow, reviewBusy, handleReviewWrite } = useDocReview({
    scopedDocs,
    getDocContent,
    source,
    staticVault,
    selectedSlug,
    selectedDoc,
    localVault,
  });
  const { handleCollectionChange } = useCollectionSelection({
    manifest,
    scopedDocs,
    scopedDocSlugs,
    documentScope,
    docCollection,
    setDocCollection,
    initialCollection,
    selectedDoc,
    selectedSlug,
    setSelectedSlug,
    setActiveTag,
    pinnedSlugs,
    recentSlugs,
    collectionDocs,
    collectionDocSlugs,
    collectionPinnedSlugs,
    collectionRecentSlugs,
    openDocTabsHydrated,
    pendingRestoredActiveSlug,
    outOfScopeQuerySlug,
    normalizedQuerySlug,
    vaultScopeSettled,
    routePathname,
    replaceUrlState,
  });
  const { handleSelect, handleCloseDocTab, handleSelectFromSidebar } = useDocSelection({
    documentScope,
    scopedDocSlugs,
    generalDocsHref,
    rememberActiveSlug,
    closeDocTabInWorkingSet,
    setSelectedSlug,
    setHighlightQuery,
    setRecentSlugs,
    setSampleWelcomeDismissed,
    setSourceTreeOpen,
    recentKey,
    replaceUrlState,
    selectedSlug,
    collectionDocs,
    collectionDocSlugs,
  });
  usePaletteShortcuts({ paletteOpen, setPaletteQuery });
  const { backlinksDetail, outlineHeadings, showOutlineRail, handleHeadingNavigate } =
    useDocOutline({
      manifest,
      selectedSlug,
      selectedDoc,
      staticHeadings,
      setActiveHeadingSlug,
    });
  const { commands } = useDocsVaultCommands({
    localVault,
    view,
    source,
    installedShell,
    selectedSlug,
    pinnedSet,
    canEditCurrent,
    editing,
    setEditing,
    activeTag,
    setActiveTag,
    projectsListHref,
    legacyDocumentMode,
    setPaletteQuery,
    handleOpenNewDocDialog,
    handleDeleteCurrent,
    handleExportDocHtml,
    handleInsertToc,
    handleViewChange,
    handleRenameCurrent,
    handleSourceChange,
    handleTogglePin,
  });
  // From the whole manifest, independent of the collection filter; read-only.
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  const { skillParity, handleCopySkillParityHandoff } = useSkillParityHandoff({
    isDesktopRuntime,
    localVault,
  });
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
        localVault={localVault}
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
          reviewQueue={reviewQueue}
          collectionPinnedSlugs={collectionPinnedSlugs}
          collectionRecentSlugs={collectionRecentSlugs}
          selectedSlug={selectedSlug}
          docsBySlug={docsBySlug}
          activeTag={activeTag}
          collectionManifest={collectionManifest}
          docCollection={docCollection}
          collectionCounts={collectionCounts}
          documentScope={documentScope}
          legacyDocumentMode={legacyDocumentMode}
          collectionDocSlugs={collectionDocSlugs}
          handleSelectFromSidebar={handleSelectFromSidebar}
          handleCollectionChange={handleCollectionChange}
          handleTogglePin={handleTogglePin}
          setActiveTag={setActiveTag}
          canEditCurrent={canEditCurrent}
          handleOpenNewDocDialog={handleOpenNewDocDialog}
          handleVaultPillSwap={handleVaultPillSwap}
          treeSort={treeSort}
          treeGroup={treeGroup}
          handleTreeSortChange={handleTreeSortChange}
          handleTreeGroupChange={handleTreeGroupChange}
          agentFiles={documentScope === 'ontology' ? null : agentFiles}
          sourceTreeOpen={sourceTreeOpen}
          setSourceTreeOpen={setSourceTreeOpen}
          docListCollapsed={docListCollapsed}
          docListLeaving={docListLeaving}
          docListToggled={docListToggled}
        />

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
              localVault={localVault}
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
              backlinksDetail={backlinksDetail}
              mapDeeplinkForSelectedDoc={mapDeeplinkForSelectedDoc}
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

      <DocsVaultDialogs
        paletteOpen={paletteOpen}
        paletteQuery={paletteQuery}
        setPaletteQuery={setPaletteQuery}
        collectionDocs={collectionDocs}
        collectionRecentSlugs={collectionRecentSlugs}
        collectionPinnedSlugs={collectionPinnedSlugs}
        commands={commands}
        collectionTagCounts={collectionTagCounts}
        handleSelect={handleSelect}
        setActiveTag={setActiveTag}
        getDocHref={getDocHref}
        docsBodyIndex={docsBodyIndex}
        docsBodyIndexing={docsBodyIndexing}
        newDocKindDialogOpen={newDocKindDialogOpen}
        handleCreateNewDocWithKind={handleCreateNewDocWithKind}
        setNewDocKindDialogOpen={setNewDocKindDialogOpen}
        renameTarget={renameTarget}
        isSlugTaken={isSlugTaken}
        setRenameTarget={setRenameTarget}
        confirmRename={confirmRename}
        deleteTarget={deleteTarget}
        confirmDelete={confirmDelete}
        setDeleteTarget={setDeleteTarget}
        pendingSimilarDoc={pendingSimilarDoc}
        openPendingSimilarDoc={openPendingSimilarDoc}
        createPendingDocAnyway={createPendingDocAnyway}
      />
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
