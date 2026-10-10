'use client';

import type { useDocsVaultAddress } from '../model/use-docs-vault-url';
import type { Dispatch, SetStateAction, ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Menu, PanelLeft, Search } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocalVault } from '@/entities/vault-session';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { cn } from '@/shared/lib/cn';
import { Chip, controlClass } from '@/shared/ui';
import type { VaultManifest } from '@/entities/docs-vault';
import { DocsHeaderTile } from './parts/DocsHeaderTile';
import { DocsVaultVaultChip } from './parts/DocsVaultVaultChip';
import { DocsVaultTabStrip } from './parts/DocsVaultTabStrip';
import { resolveVaultChipIdentity } from '../lib/vault-chip-identity';
import type { DocsVaultSource as Source, DocsVaultView } from '../lib/persistence';

export function DocsVaultHeader({
  legacyDocumentMode,
  docListCollapsed,
  libraryOntologyHref,
  insightsReturnTab,
  workspaceHref,
  setSourceTreeOpen,
  toggleDocListCollapsed,
  vaultChipIdentity,
  scopedDocs,
  manifest,
  scopedDocSlugs,
  isLocalSourceLoaded,
  localVaultRootPath,
  localVault,
  vaultChipOpen,
  setVaultChipOpen,
  vaultChipMenuRef,
  setAdvancedOpen,
  handleVaultPillSwap,
  source,
  installedShell,
  handleSourceChange,
  localSourceDisabled,
  openContract,
  view,
  openDocTabs,
  selectedSlug,
  handleSelect,
  handleCloseDocTab,
  setPaletteQuery,
}: {
  legacyDocumentMode: boolean;
  docListCollapsed: boolean;
  libraryOntologyHref: string;
  insightsReturnTab: ReturnType<typeof useDocsVaultAddress>['insightsReturnTab'];
  workspaceHref: string;
  setSourceTreeOpen: Dispatch<SetStateAction<boolean>>;
  toggleDocListCollapsed: () => void;
  vaultChipIdentity: ReturnType<typeof resolveVaultChipIdentity>;
  scopedDocs: VaultManifest['docs'];
  manifest: VaultManifest;
  scopedDocSlugs: ReadonlySet<string>;
  isLocalSourceLoaded: boolean;
  localVaultRootPath: string | null;
  localVault: ReturnType<typeof useLocalVault>;
  vaultChipOpen: boolean;
  setVaultChipOpen: Dispatch<SetStateAction<boolean>>;
  vaultChipMenuRef: ComponentProps<typeof DocsVaultVaultChip>['menuRef'];
  setAdvancedOpen: (open: boolean) => void;
  handleVaultPillSwap: () => void;
  source: Source;
  installedShell: boolean;
  handleSourceChange: (next: Source) => void;
  localSourceDisabled: boolean;
  openContract: () => void;
  view: DocsVaultView;
  openDocTabs: ComponentProps<typeof DocsVaultTabStrip>['tabs'];
  selectedSlug: string | null;
  handleSelect: (slug: string, query?: string) => void;
  handleCloseDocTab: (slug: string) => void;
  setPaletteQuery: Dispatch<SetStateAction<string | null>>;
}) {
  const t = useTranslations('docsVault');
  // Show the real path only for an open local folder; the build machine's dogfood path
  // would otherwise leak into the sample.
  const vaultPillPath =
    isLocalSourceLoaded && localVaultRootPath
      ? localVaultRootPath
      : isLocalSourceLoaded && localVault.handle
        ? localVault.handle.name
        : t('header.vaultPillSampleLabel');
  const vaultTopLevelFolderCount = manifest.tree.children?.filter(
    (child) =>
      child.type === 'dir' &&
      (child.children?.some(function containsScopedDoc(descendant): boolean {
        return descendant.type === 'doc'
          ? Boolean(descendant.slug && scopedDocSlugs.has(descendant.slug))
          : descendant.children?.some(containsScopedDoc) ?? false;
      }) ?? false),
  ).length ?? 0;

  // While the list is expanded, zone-l ends at the document pane's left edge so tabs sit
  // over the pane (list width − header padding − zone gap).
  const identityZone = (
    <div
      data-docs-header-zone="identity"
      className={cn(
        // From md this uses content width; the pane alignment applies at lg only.
        "flex w-full min-w-0 flex-none flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:gap-3",
        legacyDocumentMode
          ? "lg:w-auto"
          : docListCollapsed
          ? "lg:w-auto"
          : "lg:w-[calc(var(--docs-list-width)-1.5rem)]",
      )}
    >
      {legacyDocumentMode ? (
        <>
          <Link
            href={libraryOntologyHref}
            data-testid="docs-compatibility-library-return"
            className={controlClass({
              shape: 'chip',
              size: 'lg',
              className: 'min-h-[var(--chrome-tile-size)] flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]',
            })}
          >
            <ArrowLeft size={ICON_SIZE.md} aria-hidden />
            <span>{t('compatibility.back')}</span>
          </Link>
          <span className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t('compatibility.title')}
          </span>
        </>
      ) : null}
      {/* Return to the insights review the user came from; the rail owns the way back to the map. */}
      {insightsReturnTab ? (
        <Link
          href={workspaceHref}
          aria-label={t('header.backToReviewAriaLabel')}
          className={controlClass({
            shape: 'chip',
            size: 'lg',
            className:
              'min-h-[var(--chrome-tile-size)] flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]',
          })}
        >
          <ArrowLeft size={ICON_SIZE.md} aria-hidden />
          <span className="hidden sm:inline">{t('header.reviewBack')}</span>
        </Link>
      ) : null}
      <Chip
        size="lg"
        onClick={() => setSourceTreeOpen(true)}
        className="min-h-[var(--chrome-tile-size)] flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] lg:hidden"
        aria-label={t('header.openTreeAriaLabel')}
        title={t('header.openTreeTitle')}
      >
        <Menu size={ICON_SIZE.md} aria-hidden />
        <span className="hidden sm:inline">{t('header.openTreeTitle')}</span>
      </Chip>
      <DocsHeaderTile
        icon={<PanelLeft size={ICON_SIZE.lg} aria-hidden />}
        title={docListCollapsed ? t('header.docListExpand') : t('header.docListCollapse')}
        active={docListCollapsed}
        aria-expanded={!docListCollapsed}
        onClick={toggleDocListCollapsed}
        className="hidden lg:inline-flex"
      />
      {/* The chip states the chosen source (`lib/vault-chip-identity`). */}
      <DocsVaultVaultChip
        label={
          vaultChipIdentity.kind === 'local'
            ? vaultChipIdentity.label
            : vaultChipIdentity.kind === 'local-pending'
              ? t('header.vaultChipLocalPending')
              : t('advanced.sourceServer')
        }
        docCount={vaultChipIdentity.showDocCount ? scopedDocs.length : null}
        folderCount={vaultTopLevelFolderCount}
        path={vaultPillPath}
        isLocalSourceLoaded={isLocalSourceLoaded}
        open={vaultChipOpen}
        onToggle={() =>
          setVaultChipOpen((open) => {
            const next = !open;
            if (next) setAdvancedOpen(false);
            return next;
          })
        }
        onSwap={() => {
          setVaultChipOpen(false);
          handleVaultPillSwap();
        }}
        isSample={source === 'server'}
        allowSample={!installedShell}
        onUseSample={() => {
          setVaultChipOpen(false);
          handleSourceChange('server');
        }}
        localDisabled={localSourceDisabled}
        localDisabledReason={
          localSourceDisabled ? t('vaultStatus.unsupportedTooltip') : undefined
        }
        onOpenAudit={() => {
          setVaultChipOpen(false);
          openContract();
        }}
        menuRef={vaultChipMenuRef}
        toolsMovedHint={t('header.vaultToolsMovedHint')}
        t={t}
      />
    </div>
  );
  // `self-stretch` fills the header height so the active tab covers the baseline.
  const tabsZone = (
    <div
      data-docs-header-zone="tabs"
      className="hidden min-w-0 flex-1 self-stretch lg:flex"
    >
      {view === 'doc' ? (
        <DocsVaultTabStrip
          tabs={openDocTabs}
          activeSlug={selectedSlug}
          onActivate={handleSelect}
          onClose={handleCloseDocTab}
          t={t}
        />
      ) : null}
    </div>
  );
  // Fixed order at natural width; zone-c shrinks so nothing overlaps. From md `ml-auto`
  // right-aligns; at lg zone-c owns the gap.
  const toolsZone = (
    <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 md:ml-auto md:w-auto md:flex-nowrap">
      {/* Source display and switching live in the vault chip only. */}
      <DocsHeaderTile
        icon={<Search size={ICON_SIZE.lg} aria-hidden />}
        title={t('header.paletteTooltip')}
        aria-label={t('header.paletteAriaLabel')}
        onClick={() => {
          setAdvancedOpen(false);
          setVaultChipOpen(false);
          setPaletteQuery('');
        }}
      />
      {/* At lg+ the nav rail gear owns settings; this tile appears only below lg. */}
      <div className="lg:hidden">
        <AppSettingsMenu
          mode={source === 'local' ? 'local' : 'static'}
          triggerVariant="chrome-tile"
        />
      </div>
    </div>
  );

  // `isolate` and `z-10` are a pair: `isolate` confines the header's stacking, and `z-10`
  // lifts the header over the reading pane so its dropdowns are not covered. Keep it
  // below `--z-map-scrim` (25) and `--z-dialog` (60).
  return (
    <header className="relative isolate z-10 flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 bg-[color:var(--color-panel)] px-3 py-2 md:h-11 md:min-h-0 md:flex-nowrap md:gap-2 md:px-4 md:py-0">
      <h1 className="sr-only">
        {legacyDocumentMode ? t('compatibility.title') : t('header.title')}
      </h1>
      {/* Absolutely positioned so the active tab can cover it with its own 2px underline. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[color:var(--color-border-soft)]"
      />
      {identityZone}
      {tabsZone}
      {toolsZone}
    </header>
  );
}
