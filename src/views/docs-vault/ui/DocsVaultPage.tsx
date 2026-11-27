'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { useAdoptDocumentText, useDocumentDetail } from '@/features/document-detail';
import { OntologyStarterCta } from '@/features/docs-vault-local';
import { recentVaultRowKey } from '@/features/vault-switch';
import { buildOntologyDeeplinkForDoc } from '@/entities/docs-vault';
import { useDocumentTitle } from '@/shared/lib/public-pages/use-document-title';
import { firstHeading } from '@/shared/lib/vault-document/parse-frontmatter';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { useClaimShellKey } from '@/shared/lib/keyboard/shell-key-claims';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import { usePanelPresence } from '@/shared/lib/render-timing/use-presence';
import { useTypingShortcuts } from '@/shared/lib/keyboard/use-typing-shortcut';
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
import { useDocsVaultFolder } from '../model/use-docs-vault-folder';
import { useVaultManifest } from '../model/use-vault-manifest';
import type { DocsVaultDocCollection } from '../lib/docs-vault-collection';
import {
  readStoredListCollapsed,
  storeListCollapsed,
} from '../lib/persistence';
import { buildSkillParityHandoff } from '../lib/agent-files/skill-parity-handoff';
import type { SkillParityRow } from '../lib/agent-files/skill-parity';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useAgentFilesModel } from '../lib/agent-files/use-agent-files';
import { usePaletteState } from '../lib/use-palette-state';
import { useSkillParity } from '../lib/agent-files/use-skill-parity';
import { DocsVaultHeader } from './DocsVaultHeader';
import { DocsVaultDocumentPane } from './DocsVaultDocumentPane';
import { DocsVaultSidebar } from './DocsVaultSidebar';
import { DocsSidebarBody } from './sidebar/DocsSidebarBody';
import { DesktopVaultWelcome } from './welcome/DesktopVaultWelcome';
import { DocsVaultAuditModal } from './DocsVaultAuditModal';
import { DeleteDocDialog } from './doc-actions/DeleteDocDialog';
import { DocsVaultEmptyState } from './welcome/DocsVaultEmptyState';
import { NewDocKindDialog } from './doc-actions/NewDocKindDialog';
import { RenameDocDialog } from './doc-actions/RenameDocDialog';

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
    getDocHref,
    getProjectHref,
    libraryOntologyHref,
  } = address;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(address.querySlug);
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
  const { open: vaultChipOpen, setOpen: setVaultChipOpen, ref: vaultChipMenuRef } =
    useAdvancedMenu();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  const [docListCollapsed, setDocListCollapsedState] = useState(readStoredListCollapsed);
  const [docListToggled, setDocListToggled] = useState(false);
  const [treeToolsHost, setTreeToolsHost] = useState<HTMLDivElement | null>(null);
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
  const src = useDocsVaultFolder({ address });
  const {
    localVaultRootPath,
    handleTogglePin,
    showDesktopWelcome,
    vaultScopeSettled,
    handleOpenDogfoodVault,
    showDogfoodHint,
    isLocalSourceLoaded,
    vaultChipIdentity,
  } = src;

  const [contractOpen, setContractOpen] = useState(false);
  const closePopovers = useCallback(() => {
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const openContract = useCallback(() => {
    closePopovers();
    setContractOpen(true);
  }, [closePopovers]);
  const closeContract = useCallback(() => setContractOpen(false), []);
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocReadingScrollSpy(selectedSlug, src.recentKey);
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);
  const vault = useVaultManifest({
    querySlug: address.querySlug,
    selectedSlug,
    legacyEntry,
    documentScope,
  });
  const {
    manifest,
    legacyDocumentMode,
    legacyRedirectToLibrary,
    scopedDocs,
    scopedDocSlugs,
    selectedDoc,
    ontologyDerivation,
    docsBySlug,
    vaultSlugs,
    refSlugResolver,
  } = vault;
  const access = useDocAccess({ isLocalSourceLoaded, selectedSlug });
  const { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing } = access;
  const selectedDetail = useDocumentDetail(selectedDoc);
  const latestAdopt = useLatestRef(useAdoptDocumentText());
  const latestDocsBySlug = useLatestRef(docsBySlug);
  const readOpenDocText = useMemo(
    () =>
      getDocContent &&
      ((slug: string) => {
        const text = getDocContent(slug);
        const doc = latestDocsBySlug.current.get(slug);
        if (doc) latestAdopt.current(doc, text);
        return text;
      }),
    [getDocContent, latestAdopt, latestDocsBySlug],
  );
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
  });
  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect],
  );
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
    docHeadings: selectedDetail?.headings,
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
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  const skillParityRoot =
    localVault.handle ? getTauriVaultRootPath(localVault.handle) ?? null : null;
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
    void openLocalVault();
  }, [openLocalVault]);

  const [paintedBody, setPaintedBody] = useState<{ doc: string; titled: boolean } | null>(null);
  const paintedDoc = selectedDoc?.slug ?? null;
  const reportPaintedBody = useCallback((doc: string, body: string | null) => {
    const titled = body !== null && firstHeading(body) !== null;
    setPaintedBody((previous) => (previous?.doc === doc && previous.titled === titled ? previous : { doc, titled }));
  }, []);
  const titledBeforeBodyPaints = selectedDetail?.headings.some((heading) => heading.depth === 1);
  const bodyTitled = paintedBody?.doc === paintedDoc ? paintedBody.titled : titledBeforeBodyPaints;
  const columnTitle = selectedDoc && !showDesktopWelcome && bodyTitled === false ? selectedDocDisplayTitle : null;
  const headerTreeTools =
    documentScope === 'ontology' && !legacyDocumentMode && !docListCollapsed && !showDesktopWelcome;

  // One neutral frame until the remembered folder settles, so the empty state never paints as its data.
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
        openContract={openContract}
        view={view}
        openDocTabs={openDocTabs}
        selectedSlug={selectedSlug}
        handleSelect={handleSelect}
        handleCloseDocTab={handleCloseDocTab}
        setPaletteQuery={setPaletteQuery}
        treeToolsHostRef={headerTreeTools ? setTreeToolsHost : undefined}
        showPageHeading={columnTitle === null}
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

      {(localVault.status === 'error' ||
        localVault.status === 'permission-needed') &&
      /* The chooser marks a vanished folder itself; the banner's "showing sample documents" is false there. */
      !(showDesktopWelcome && localVault.errorCode === 'path-missing') ? (
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
          onOpenDogfoodPath={handleOpenDogfoodVault}
          onOpenRecent={(record) => void localVault.openRecent(record)}
          onForgetRecent={(record) => void localVault.forgetRecent(record)}
          currentVaultKey={
            localVault.storedVaultRecord
              ? recentVaultRowKey(localVault.storedVaultRecord)
              : null
          }
          choosing={localVault.awaitingVaultChoice}
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
          {(placement) => (
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
              onCreateNewDoc={canEditCurrent ? handleOpenNewDocDialog : handleVaultPillSwap}
              canCreateNewDoc={canEditCurrent}
              sort={treeSort}
              group={treeGroup}
              onSortChange={handleTreeSortChange}
              onGroupChange={handleTreeGroupChange}
              agentFiles={documentScope === 'ontology' ? null : agentFiles}
              toolsHost={placement === 'pane' && headerTreeTools ? treeToolsHost : null}
            />
          )}
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
              columnTitle={columnTitle}
              onBodyPainted={reportPaintedBody}
              editing={editing}
              setEditing={setEditing}
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
              getDocContent={readOpenDocText}
              reviewBusy={reviewBusy}
              handleReviewWrite={handleReviewWrite}
              vaultSlugs={vaultSlugs}
              getDocHref={getDocHref}
              getProjectHref={getProjectHref}
              highlightQuery={highlightQuery}
              resolveImage={resolveImage}
            />
          ) : localVault.status === 'loaded' &&
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
            <DocsVaultEmptyState
              docCount={scopedDocs.length}
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
            getDocContent={getDocContent}
          />
        ) : null}
      </AnimatePresence>

      <NewDocKindDialog
        open={newDocKindDialogOpen}
        onSelect={handleCreateNewDocWithKind}
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
  initialCollection?: DocsVaultDocCollection;
  documentScope?: 'all' | 'ontology';
  legacyEntry?: boolean;
} = {}) {
  // Local-first core (`.claude/rules/local-first.md` §1): no auth gate before the vault picker.
  // The exported HTML holds only the neutral frame: the remembered folder is known after hydration.
  const hydrated = useHydrated();
  if (!hydrated) return <RouteLoadingFallback />;
  return (
    // Prerendered HTML carries this fallback; null would start as a black screen.
    <Suspense fallback={<RouteLoadingFallback />}>
      <DocsVaultContent
        initialCollection={initialCollection}
        documentScope={documentScope}
        legacyEntry={legacyEntry}
      />
    </Suspense>
  );
}
