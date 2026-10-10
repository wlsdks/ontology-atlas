'use client';

import type { useDocReview } from '../model/use-doc-review';
import type { useDocAccess } from '../model/use-doc-access';
import type { useDocWriteActions } from '../model/use-doc-write-actions';
import type { useVaultManifest } from '../model/use-vault-manifest';
import type { useDocOutline } from '../model/use-doc-outline';
import type { useDocsVaultAddress } from '../model/use-docs-vault-url';
import type { Dispatch, SetStateAction } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { TextCursorInput, Trash2 } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocalVault } from '@/entities/vault-session';
import { Chip, IconButton, controlClass, useToast } from '@/shared/ui';
import { DocReadingPane, useBackToTop, useDocReadingScrollSpy } from '@/widgets/doc-reading-pane';
import {
  DocsVaultBacklinks,
  DocsVaultEditor,
  DocsVaultViewer,
  ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  DOCS_VAULT_REPO_ROOT,
} from '@/widgets/docs-vault';
import {
  buildOntologyDeeplinkForDoc,
  buildTopologyDeeplinkForDoc,
  resolveStaticVaultSource,
  type VaultManifest,
} from '@/entities/docs-vault';
import { DocMetaBar } from './parts/DocMetaBar';
import { DocFrontmatterBlock } from './parts/DocFrontmatterBlock';
import { SampleNotice } from './parts/SampleNotice';
import { SampleWelcomeNote } from './parts/SampleWelcomeNote';
import { persistEditorSave, type DocsVaultSource as Source } from '../lib/persistence';

function splitVaultSlugPath(slug: string): { dir: string; name: string } {
  const parts = slug.split('/');
  const name = parts.pop() ?? slug;
  return { dir: parts.length > 0 ? `${parts.join('/')}/` : '', name };
}

export function DocsVaultDocumentPane({
  selectedDoc,
  editing,
  setEditing,
  showSampleWelcomeNote,
  localSourceDisabled,
  handleSourceChange,
  setSampleWelcomeDismissed,
  canEditCurrent,
  handleRenameCurrent,
  handleDeleteCurrent,
  isLocalSourceLoaded,
  articleScrollRef,
  showOutlineRail,
  outlineHeadings,
  activeHeadingSlug,
  handleHeadingNavigate,
  backToTop,
  editResolver,
  vaultScope,
  manifest,
  domainOptions,
  handlePatchDocFrontmatter,
  handleMoveToKindFolder,
  kindChangeReferrers,
  handleSelect,
  refSlugResolver,
  docsBySlug,
  selectedReviewRow,
  getDocContent,
  reviewBusy,
  handleReviewWrite,
  source,
  vaultSlugs,
  getDocHref,
  getProjectHref,
  highlightQuery,
  resolveImage,
  staticVault,
}: {
  selectedDoc: VaultManifest['docs'][number];
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
  showSampleWelcomeNote: boolean;
  localSourceDisabled: boolean;
  handleSourceChange: (next: Source) => void;
  setSampleWelcomeDismissed: Dispatch<SetStateAction<boolean>>;
  canEditCurrent: boolean;
  handleRenameCurrent: () => void;
  handleDeleteCurrent: () => void;
  isLocalSourceLoaded: boolean;
  articleScrollRef: ReturnType<typeof useDocReadingScrollSpy>['articleScrollRef'];
  showOutlineRail: boolean;
  outlineHeadings: ReturnType<typeof useDocOutline>['outlineHeadings'];
  activeHeadingSlug: string | null;
  handleHeadingNavigate: (slug: string) => void;
  backToTop: ReturnType<typeof useBackToTop>;
  editResolver: ReturnType<typeof useDocAccess>['editResolver'];
  vaultScope: string;
  manifest: VaultManifest;
  domainOptions: ReturnType<typeof useDocWriteActions>['domainOptions'];
  handlePatchDocFrontmatter: ReturnType<typeof useDocWriteActions>['handlePatchDocFrontmatter'];
  handleMoveToKindFolder: ReturnType<typeof useDocWriteActions>['handleMoveToKindFolder'];
  kindChangeReferrers: ReturnType<typeof useDocWriteActions>['kindChangeReferrers'];
  handleSelect: (slug: string, query?: string) => void;
  refSlugResolver: ReturnType<typeof useVaultManifest>['refSlugResolver'];
  docsBySlug: ReturnType<typeof useVaultManifest>['docsBySlug'];
  selectedReviewRow: ReturnType<typeof useDocReview>['selectedReviewRow'];
  getDocContent: ReturnType<typeof useDocAccess>['getDocContent'];
  reviewBusy: boolean;
  handleReviewWrite: ReturnType<typeof useDocReview>['handleReviewWrite'];
  source: Source;
  vaultSlugs: ReturnType<typeof useVaultManifest>['vaultSlugs'];
  getDocHref: ReturnType<typeof useDocsVaultAddress>['getDocHref'];
  getProjectHref: ReturnType<typeof useDocsVaultAddress>['getProjectHref'];
  highlightQuery: string | undefined;
  resolveImage: ReturnType<typeof useDocAccess>['resolveImage'];
  staticVault: ReturnType<typeof resolveStaticVaultSource>;
}) {
  const t = useTranslations('docsVault');
  const toast = useToast();
  const localVault = useLocalVault();
  const backlinksDetail = manifest.backlinksDetail?.[selectedDoc.slug] ?? [];
  // Null means no place in the graph, so "open on the map" is not rendered.
  const mapDeeplinkForSelectedDoc =
    buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!editing && showSampleWelcomeNote ? (
        <SampleWelcomeNote
          canOpenLocalVault={!localSourceDisabled}
          onOpenFolder={() => handleSourceChange('local')}
          onDismiss={() => setSampleWelcomeDismissed(true)}
        />
      ) : null}
      {/* Display title lives in the tab and H1; this row shows only where the file lives. */}
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--color-border-soft)] px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span data-testid="docs-editor-path" className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
            <span>{splitVaultSlugPath(selectedDoc.slug).dir}</span>
            {splitVaultSlugPath(selectedDoc.slug).name}.md
          </span>
          {/* Rename and delete sit beside the path they change, only when writable and not editing,
             since a move under an open editor would strand unsaved text. */}
          {canEditCurrent && !editing ? (
            <span data-testid="docs-file-actions" className="flex flex-none items-center gap-0.5">
              <IconButton
                label={t('fileActions.rename')}
                tone="muted"
                hoverInk="strong"
                hoverSurface="lift"
                onClick={handleRenameCurrent}
                data-testid="docs-file-rename"
              >
                <TextCursorInput size={ICON_SIZE.sm} aria-hidden />
              </IconButton>
              <IconButton
                label={t('fileActions.delete')}
                tone="muted"
                hoverInk="strong"
                hoverSurface="lift"
                onClick={handleDeleteCurrent}
                data-testid="docs-file-delete"
              >
                <Trash2 size={ICON_SIZE.sm} aria-hidden />
              </IconButton>
            </span>
          ) : null}
        </div>
        {/* Read-only is a vault fact, stated here at zero vertical cost. */}
        {!editing && !isLocalSourceLoaded ? (
          <SampleNotice onOpenFolder={() => handleSourceChange('local')} />
        ) : null}
        {canEditCurrent ? (
          <div
            role="tablist"
            aria-label={`${t('editorHeader.previewTab')} / ${t('editorHeader.editTab')}`}
            className="inline-flex flex-none items-stretch gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-px shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
          >
            <Chip
              role="tab"
              aria-selected={!editing}
              active={!editing}
              tone={!editing ? 'strong' : 'muted'}
              onClick={() => setEditing(false)}
              className="hover:text-[color:var(--color-text-secondary)]"
            >
              {t('editorHeader.previewTab')}
            </Chip>
            <Chip
              role="tab"
              aria-selected={editing}
              active={editing}
              tone={editing ? 'strong' : 'muted'}
              onClick={() => setEditing(true)}
              className="hover:text-[color:var(--color-text-secondary)]"
            >
              {t('editorHeader.editTab')}
            </Chip>
          </div>
        ) : null}
        {/* The dot is the label's bullet; it states only whether the vault source is local. */}
        {isLocalSourceLoaded ? (
          <span className="flex-none text-label text-[color:var(--color-text-quaternary)]">
            <span
              className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-indigo-accent)] align-middle"
              aria-hidden
            />
            {t('editorHeader.localSynced')}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <DocReadingPane
          data-testid="docs-reading-pane"
          scrollRef={articleScrollRef}
          outline={
            !editing && showOutlineRail
              ? {
                  headings: outlineHeadings,
                  activeHeadingSlug,
                  onHeadingClick: handleHeadingNavigate,
                }
              : null
          }
          backToTop={!editing ? backToTop : null}
        >
            {editing && canEditCurrent && editResolver ? (
              <DocsVaultEditor
                key={`edit:${vaultScope}:${selectedDoc.slug}`}
                vaultScope={vaultScope}
                doc={selectedDoc}
                getDocContent={editResolver}
                onSave={(slug, content, expectedMtime) =>
                  // Rethrow so the editor stays dirty and the next poll cannot clobber the buffer.
                  persistEditorSave(
                    localVault.saveDoc,
                    { slug, content, expectedMtime },
                    () => toast.show(t('dialog.vaultConflict'), 'error'),
                  )
                }
                onClose={() => setEditing(false)}
                allDocs={manifest.docs}
              />
            ) : (
              <>
                {/* The block renders for a missing or empty kind too, the commonest ways a node leaves the map. */}
                <DocFrontmatterBlock
                    key={selectedDoc.slug}
                    doc={selectedDoc}
                    canEdit={canEditCurrent}
                    domainOptions={domainOptions}
                    onPatch={handlePatchDocFrontmatter}
                    onMoveToKindFolder={handleMoveToKindFolder}
                    kindChangeReferrers={kindChangeReferrers}
                    onNavigate={handleSelect}
                    resolveRef={(token) => refSlugResolver.get(token) ?? null}
                    kindOf={(slug) => {
                      const kind = docsBySlug.get(slug)?.frontmatter?.kind;
                      return typeof kind === "string" ? kind.trim() : null;
                    }}
                    // Only what the local vault observed; server and sample vaults render nothing.
                    agentActivityStatus={localVault.agentActivityStatus}
                    selfEditTimestamps={localVault.selfEditTimestamps}
                  />
                <DocMetaBar
                  doc={selectedDoc}
                  {...(selectedReviewRow ? { reviewRow: selectedReviewRow } : {})}
                  {...(canEditCurrent && getDocContent
                    ? {
                        review: {
                          reserved:
                            selectedDoc.frontmatter.review_state === 'human_decides',
                          busy: reviewBusy,
                          onConfirm: () => void handleReviewWrite('confirm'),
                          onRelease: () => void handleReviewWrite('release'),
                        },
                      }
                    : {})}
                />
                <DocsVaultViewer
                  key={`${source}:${selectedDoc.slug}`}
                  doc={selectedDoc}
                  vaultSlugs={vaultSlugs}
                  onNavigate={handleSelect}
                  getDocContent={getDocContent}
                  getDocHref={getDocHref}
                  getProjectHref={getProjectHref}
                  highlightQuery={highlightQuery}
                  resolveImage={resolveImage}
                  {...(source === 'local'
                    ? {}
                    : {
                        bundledContent: staticVault.content,
                        repoBlobBase: ONTOLOGY_ATLAS_REPO_BLOB_BASE,
                        vaultRepoRoot: DOCS_VAULT_REPO_ROOT,
                      })}
                />
              </>
            )}
        </DocReadingPane>
      </div>

      {/* Always visible; zero backlinks shows an empty-state line. */}
      {!editing ? (
        // The bottom-tab reserve must apply to this `flex-none` sibling too, or the tab bar covers
        // its controls below lg.
        <div className="flex flex-none items-center gap-2 border-t border-[color:var(--color-border-soft)] px-4 pt-2.5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] lg:pb-2.5">
          {backlinksDetail.length > 0 ? (
            <DocsVaultBacklinks
              entries={backlinksDetail}
              docsBySlug={docsBySlug}
              onNavigate={handleSelect}
              layout="strip"
            />
          ) : (
            <p className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-quaternary)]">
              {t('backlinksStrip.empty')}
            </p>
          )}
          {/* No `/topology/` fallback: a document without a graph node gets no map link. */}
          {mapDeeplinkForSelectedDoc ? (
            <Link
              href={mapDeeplinkForSelectedDoc}
              data-testid="docs-backlinks-open-in-map"
              className={controlClass({ shape: "link", tone: "muted", className: "flex-none text-body hover:text-[color:var(--color-text-primary)]" })}
            >
              {t('backlinksStrip.openInOntology')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
