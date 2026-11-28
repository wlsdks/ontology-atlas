import type { useDocReview } from '../model/use-doc-review';
import type { useDocAccess } from '../model/use-doc-access';
import type { useDocWriteActions } from '../model/use-doc-write-actions';
import type { useVaultManifest } from '../model/use-vault-manifest';
import type { useDocOutline } from '../model/use-doc-outline';
import type { useDocsVaultAddress } from '../model/use-docs-vault-url';
import type { Dispatch, SetStateAction } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'use-intl';
import { TextCursorInput, Trash2 } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { useLocalVault } from '@/entities/vault-session';
import { IconButton, controlClass, useToast } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { DocReadingPane, useBackToTop, useDocReadingScrollSpy } from '@/widgets/doc-reading-pane';
import { DocsVaultBacklinks, DocsVaultEditor, DocsVaultViewer } from '@/widgets/docs-vault';
import {
  buildOntologyDeeplinkForDoc,
  buildTopologyDeeplinkForDoc,
  type VaultManifest,
} from '@/entities/docs-vault';
import { DocMetaBar } from './DocMetaBar';
import { DocFrontmatterBlock } from './DocFrontmatterBlock';
import { persistEditorSave } from '../lib/persistence';

function splitVaultSlugPath(slug: string): { dir: string; name: string } {
  const parts = slug.split('/');
  const name = parts.pop() ?? slug;
  return { dir: parts.length > 0 ? `${parts.join('/')}/` : '', name };
}

export function DocsVaultDocumentPane({
  selectedDoc,
  columnTitle,
  onBodyPainted,
  editing,
  setEditing,
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
  vaultSlugs,
  getDocHref,
  getProjectHref,
  highlightQuery,
  resolveImage,
}: {
  selectedDoc: VaultManifest['docs'][number];
  columnTitle: string | null;
  onBodyPainted: (doc: string, body: string | null) => void;
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
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
  vaultSlugs: ReturnType<typeof useVaultManifest>['vaultSlugs'];
  getDocHref: ReturnType<typeof useDocsVaultAddress>['getDocHref'];
  getProjectHref: ReturnType<typeof useDocsVaultAddress>['getProjectHref'];
  highlightQuery: string | undefined;
  resolveImage: ReturnType<typeof useDocAccess>['resolveImage'];
}) {
  const t = useTranslations('docsVault');
  const toast = useToast();
  const localVault = useLocalVault();
  const backlinkSources = manifest.backlinkSources?.[selectedDoc.slug] ?? [];
  const mapDeeplinkForSelectedDoc =
    buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc);
  const filePath = (
    <p data-testid="docs-editor-path" className="min-w-0 flex-auto truncate font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
      <span>{splitVaultSlugPath(selectedDoc.slug).dir}</span>
      {splitVaultSlugPath(selectedDoc.slug).name}.md
    </p>
  );
  const headControls = (
    <div className="ml-auto flex min-h-[var(--chrome-tile-size)] flex-none items-center gap-2">
      {canEditCurrent && !editing ? (
        <span data-testid="docs-file-actions" className="flex flex-none items-center">
          <IconButton
            label={t('fileActions.rename')}
            tone="muted"
            hoverInk="strong"
            hoverSurface="lift"
            onClick={handleRenameCurrent}
            data-testid="docs-file-rename"
            className="size-[var(--chrome-tile-size)]"
          >
            <TextCursorInput size={ICON_SIZE.lg} aria-hidden />
          </IconButton>
          <IconButton
            label={t('fileActions.delete')}
            tone="muted"
            hoverInk="strong"
            hoverSurface="lift"
            onClick={handleDeleteCurrent}
            data-testid="docs-file-delete"
            className="size-[var(--chrome-tile-size)]"
          >
            <Trash2 size={ICON_SIZE.lg} aria-hidden />
          </IconButton>
        </span>
      ) : null}
      {canEditCurrent ? (
        <div
          role="tablist"
          data-testid="docs-editor-mode"
          aria-label={`${t('editorHeader.previewTab')} / ${t('editorHeader.editTab')}`}
          className="inline-flex flex-none items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-px"
        >
          {([false, true] as const).map((mode) => (
            <button
              key={mode ? 'edit' : 'preview'}
              type="button"
              // eslint-disable-next-line no-restricted-syntax -- hand-built tabs not yet moved to TabBar
              role="tab"
              aria-selected={editing === mode}
              onClick={() => setEditing(mode)}
              className={controlClass({
                shape: 'segment',
                size: 'lg',
                active: editing === mode,
                hoverInk: 'secondary',
              })}
            >
              {mode ? t('editorHeader.editTab') : t('editorHeader.previewTab')}
            </button>
          ))}
        </div>
      ) : null}
      {isLocalSourceLoaded ? (
        <span data-testid="docs-local-synced" className="flex-none text-label leading-label text-[color:var(--color-text-quaternary)]">
          <span
            className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-indigo-accent)] align-middle"
            aria-hidden
          />
          {t('editorHeader.localSynced')}
        </span>
      ) : null}
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
          <header
            data-testid="docs-reading-head"
            className={cn("mx-auto max-w-[var(--measure-doc-column)] px-6 pt-3 md:px-10", editing && "pb-4")}
          >
            {columnTitle ? (
              <>
                {filePath}
                <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2">
                  <h1
                    data-testid="docs-reading-title"
                    className="min-w-0 flex-1 py-1 text-display leading-display font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                  >
                    {columnTitle}
                  </h1>
                  {headControls}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {filePath}
                {headControls}
              </div>
            )}
          </header>
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
                  key={selectedDoc.slug}
                  doc={selectedDoc}
                  onBodyPainted={(body) => onBodyPainted(selectedDoc.slug, body)}
                  compactTop
                  vaultSlugs={vaultSlugs}
                  onNavigate={handleSelect}
                  getDocContent={getDocContent}
                  getDocHref={getDocHref}
                  getProjectHref={getProjectHref}
                  highlightQuery={highlightQuery}
                  resolveImage={resolveImage}
                />
              </>
            )}
        </DocReadingPane>
      </div>

      {!editing ? (
        // The bottom-tab reserve must apply to this `flex-none` sibling too, or the tab bar covers
        // its controls below lg.
        <div className="flex flex-none items-center gap-2 border-t border-[color:var(--color-border-soft)] px-4 pt-2.5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] lg:pb-2.5">
          {backlinkSources.length > 0 ? (
            <DocsVaultBacklinks
              sources={backlinkSources}
              docsBySlug={docsBySlug}
              onNavigate={handleSelect}
            />
          ) : (
            <p className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-quaternary)]">
              {t('backlinksStrip.empty')}
            </p>
          )}
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
