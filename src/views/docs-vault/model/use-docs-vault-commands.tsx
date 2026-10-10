'use client';

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  Bot,
  FileText,
  Link2,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocalVault } from '@/entities/vault-session';
import { buildOntologyStarterAgentVerifyPrompt } from '@/features/docs-vault-local';
import { copyText } from '@/shared/lib/copy-text';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { useToast } from '@/shared/ui';
import type { VaultCommand } from '@/widgets/docs-vault';
import type { DocsVaultSource as Source, DocsVaultView } from '../lib/persistence';

export function useDocsVaultCommands({
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
}: {
  localVault: ReturnType<typeof useLocalVault>;
  view: DocsVaultView;
  source: Source;
  installedShell: boolean;
  selectedSlug: string | null;
  pinnedSet: ReadonlySet<string>;
  canEditCurrent: boolean;
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
  activeTag: string | null;
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  projectsListHref: string;
  legacyDocumentMode: boolean;
  setPaletteQuery: Dispatch<SetStateAction<string | null>>;
  handleOpenNewDocDialog: () => void;
  handleDeleteCurrent: () => void;
  handleExportDocHtml: () => void;
  handleInsertToc: () => void;
  handleViewChange: (next: DocsVaultView) => void;
  handleRenameCurrent: () => void;
  handleSourceChange: (next: Source) => void;
  handleTogglePin: (slug: string) => void;
}) {
  const t = useTranslations('docsVault');
  const router = useRouter();
  const toast = useToast();

  /** The toast confirms the copy, including failure, since clipboard permission can be refused silently. */
  const handleCopyUrl = useCallback(
    async (slug: string) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('slug', slug);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url.toString());
        copied = true;
      } catch {
        copied = false;
      }
      toast.show(
        copied ? t('linkCopied') : t('linkCopyFailed'),
        copied ? 'success' : 'error',
      );
    },
    [t, toast],
  );
  const handleCopyAgentVerifyPrompt = useCallback(async () => {
    // The builder knows the vault path; a fixed `.` points at whatever folder the agent runs in.
    const copied = await copyText(
      buildOntologyStarterAgentVerifyPrompt(
        (localVault.handle ? getTauriVaultRootPath(localVault.handle) : null) ?? '.',
      ),
    );
    toast.show(
      copied ? t('dialog.agentVerifyPromptCopied') : t('dialog.agentVerifyPromptCopyFailed'),
      copied ? 'success' : 'error',
    );
    // `localVault.handle` stays in the deps: the prompt carries the vault's absolute path.
  }, [localVault.handle, t, toast]);

  const commands = useMemo<VaultCommand[]>(() => {
    const selectedDocExists = selectedSlug !== null;
    return [
      {
        id: 'palette',
        label: t('commands.openPalette'),
        icon: <Search size={ICON_SIZE.sm} aria-hidden />,
        shortcut: '⌘K',
        onRun: () => setPaletteQuery(''),
      },
      {
        id: 'palette-tags',
        label: t('commands.findTags'),
        icon: '#',
        shortcut: '⌘K #',
        onRun: () => setPaletteQuery('#'),
      },
      {
        id: 'view-doc',
        label: t('commands.viewDoc'),
        icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
        visible: view !== 'doc',
        onRun: () => handleViewChange('doc'),
      },
      {
        id: 'source-server',
        label: t('commands.sourceServer'),
        icon: <Package size={ICON_SIZE.sm} aria-hidden />,
        visible: !installedShell && source !== 'server',
        onRun: () => handleSourceChange('server'),
      },
      {
        id: 'source-local',
        label: t('commands.sourceLocal'),
        icon: <Save size={ICON_SIZE.sm} aria-hidden />,
        visible: source !== 'local' && localVault.isSupported,
        onRun: () => handleSourceChange('local'),
      },
      {
        id: 'pin-toggle',
        label: pinnedSet.has(selectedSlug ?? '') ? t('commands.unpinDoc') : t('commands.pinDoc'),
        icon: <Star size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists,
        onRun: () => selectedSlug && handleTogglePin(selectedSlug),
      },
      {
        id: 'copy-url',
        label: t('commands.copyUrl'),
        icon: <Link2 size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists,
        onRun: () => selectedSlug && void handleCopyUrl(selectedSlug),
      },
      {
        id: 'copy-agent-verify-prompt',
        label: t('commands.copyAgentVerifyPrompt'),
        icon: <Bot size={ICON_SIZE.sm} aria-hidden />,
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void handleCopyAgentVerifyPrompt(),
      },
      {
        id: 'print',
        label: t('commands.print'),
        icon: <Printer size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists && view === 'doc',
        onRun: () => {
          if (typeof window !== 'undefined') window.print();
        },
      },
      {
        id: 'edit',
        label: t('commands.edit'),
        icon: <Pencil size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent && selectedDocExists && !editing,
        onRun: () => setEditing(true),
      },
      {
        id: 'new-doc',
        label: t('commands.newDoc'),
        icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent && !legacyDocumentMode,
        onRun: () => handleOpenNewDocDialog(),
      },
      {
        id: 'rename',
        label: t('commands.rename'),
        keywords: t('commands.renameKeywords'),
        icon: '✎',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleRenameCurrent(),
      },
      {
        id: 'insert-toc',
        label: t('commands.insertToc'),
        icon: '≡',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleInsertToc(),
      },
      {
        id: 'delete',
        label: t('commands.deleteDoc'),
        icon: <Trash2 size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleDeleteCurrent(),
      },
      {
        id: 'export-doc-html',
        label: t('commands.exportDocHtml'),
        icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists && view === 'doc',
        onRun: () => handleExportDocHtml(),
      },
      {
        id: 'local-refresh',
        label: t('commands.localRefresh'),
        icon: '↻',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.refresh(),
      },
      {
        id: 'local-close',
        label: t('commands.localClose'),
        icon: '✖',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.close(),
      },
      {
        id: 'tag-clear',
        label: t('commands.clearTagFilter'),
        icon: '#',
        visible: activeTag !== null,
        onRun: () => setActiveTag(null),
      },
      {
        id: 'projects-list',
        label: t('commands.projectsList'),
        icon: '←',
        onRun: () => {
          // The static export has no locale-less `/projects/` route.
          router.push(projectsListHref);
        },
      },
    ];
  }, [
    router,
    view,
    source,
    installedShell,
    selectedSlug,
    pinnedSet,
    canEditCurrent,
    editing,
    activeTag,
    projectsListHref,
    localVault,
    handleCopyUrl,
    handleCopyAgentVerifyPrompt,
    handleOpenNewDocDialog,
    handleDeleteCurrent,
    handleExportDocHtml,
    handleInsertToc,
    handleViewChange,
    handleRenameCurrent,
    handleSourceChange,
    handleTogglePin,
    legacyDocumentMode,
    setPaletteQuery,
    t,
    setActiveTag,
    setEditing,
  ]);
  return { commands, handleCopyUrl, handleCopyAgentVerifyPrompt };
}
