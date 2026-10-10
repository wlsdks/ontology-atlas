'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { useLocalVault } from '@/entities/vault-session';
import { buildNewNodeDoc, type VaultManifest } from '@/entities/docs-vault';
import { findSimilarNodeByTitle, type SimilarNodeMatch } from '@/shared/lib/similar-node-title';
import { useToast } from '@/shared/ui';
import { pushRecentDoc, type VaultRecentKey } from '@/widgets/docs-vault';
import type { DocsVaultView } from '../lib/persistence';
import type { replaceDocsVaultUrlState } from '../lib/url-state';
import type { NewDocKind } from '../ui/parts/NewDocKindDialog';

export function useDocCreate({
  manifest,
  localVault,
  recentKey,
  replaceUrlState,
  setRecentSlugs,
  setSelectedSlug,
  setEditing,
  setView,
  setAdvancedOpen,
  setVaultChipOpen,
  setPaletteQuery,
  canEditCurrent,
  generalDocsHref,
}: {
  manifest: VaultManifest;
  localVault: ReturnType<typeof useLocalVault>;
  recentKey: VaultRecentKey;
  replaceUrlState: typeof replaceDocsVaultUrlState;
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  setEditing: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<DocsVaultView>>;
  setAdvancedOpen: (open: boolean) => void;
  setVaultChipOpen: (open: boolean) => void;
  setPaletteQuery: Dispatch<SetStateAction<string | null>>;
  canEditCurrent: boolean;
  generalDocsHref: (slug: string) => string;
}) {
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const handleScaffoldOntologyStarter = useCallback(async () => {
    const result = await localVault.scaffoldOntology(locale);
    setRecentSlugs(pushRecentDoc(recentKey, 'README'));
    setView('doc');
    setAdvancedOpen(false);
    toast.show(
      // Concepts and config files are counted separately.
      t('dialog.ontologyStarterDone', {
        concepts: result.markdownCreated,
        configs: result.agentConfigCreated,
        skipped: result.skipped,
      }),
      'success',
    );
    router.push(generalDocsHref('README'));
    return result;
  }, [
    locale,
    localVault,
    recentKey,
    generalDocsHref,
    router,
    setAdvancedOpen,
    setRecentSlugs,
    t,
    toast,
    setView,
  ]);

  // New documents pick a kind first, so every document is a node from creation;
  // the map creates nodes with the same `buildNewNodeDoc`.
  const [newDocKindDialogOpen, setNewDocKindDialogOpen] = useState(false);
  const handleOpenNewDocDialog = useCallback(() => {
    if (!canEditCurrent) return;
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setNewDocKindDialogOpen(true);
  }, [canEditCurrent, setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  // Warns about a similar title of the same kind before creating, without blocking;
  // slug collisions are handled separately.
  const [pendingSimilarDoc, setPendingSimilarDoc] = useState<{
    slug: string;
    markdown: string;
    match: SimilarNodeMatch;
  } | null>(null);
  const commitCreateDoc = useCallback(
    async (slug: string, markdown: string) => {
      try {
        await localVault.createDoc(slug, markdown);
        setSelectedSlug(slug);
        setRecentSlugs(pushRecentDoc(recentKey, slug));
        setEditing(true);
        replaceUrlState({ slug, view: 'doc' });
      } catch (err) {
        window.alert(
          t('dialog.createFailed', { message: err instanceof Error ? err.message : String(err) }),
        );
      }
    },
    [localVault, recentKey, replaceUrlState, setRecentSlugs, t, setEditing, setSelectedSlug],
  );
  const handleCreateNewDocWithKind = useCallback(
    async (kind: NewDocKind) => {
      setNewDocKindDialogOpen(false);
      if (typeof window === 'undefined') return;
      const title = window.prompt(t('dialog.newDocTitlePrompt'));
      if (!title || !title.trim()) return;
      let slug: string;
      let markdown: string;
      try {
        ({ slug, markdown } = buildNewNodeDoc({ title, kind }));
      } catch {
        window.alert(t('dialog.invalidSlug'));
        return;
      }
      if (manifest.docs.some((d) => d.slug === slug)) {
        window.alert(t('dialog.renameAlreadyExists', { slug }));
        return;
      }
      const candidates = manifest.docs.map((d) => ({
        slug: d.slug,
        title: d.title,
        kind: String((d.frontmatter as Record<string, unknown> | undefined)?.kind ?? ''),
      }));
      const match = findSimilarNodeByTitle(title, kind, candidates);
      if (match) {
        setPendingSimilarDoc({ slug, markdown, match });
        return;
      }
      await commitCreateDoc(slug, markdown);
    },
    [manifest, commitCreateDoc, t],
  );
  const openPendingSimilarDoc = useCallback(() => {
    if (!pendingSimilarDoc) return;
    const targetSlug = pendingSimilarDoc.match.slug;
    setPendingSimilarDoc(null);
    setSelectedSlug(targetSlug);
    setEditing(false);
    replaceUrlState({ slug: targetSlug, view: 'doc' });
  }, [pendingSimilarDoc, replaceUrlState, setEditing, setSelectedSlug]);
  const createPendingDocAnyway = useCallback(() => {
    if (!pendingSimilarDoc) return;
    const { slug, markdown } = pendingSimilarDoc;
    setPendingSimilarDoc(null);
    void commitCreateDoc(slug, markdown);
  }, [pendingSimilarDoc, commitCreateDoc]);
  return {
    handleScaffoldOntologyStarter,
    newDocKindDialogOpen,
    setNewDocKindDialogOpen,
    handleOpenNewDocDialog,
    pendingSimilarDoc,
    handleCreateNewDocWithKind,
    openPendingSimilarDoc,
    createPendingDocAnyway,
  };
}
