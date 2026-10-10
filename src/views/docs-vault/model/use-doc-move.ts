'use client';

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useLocale } from 'next-intl';
import type { ReferrerRewriteReport, useLocalVault } from '@/entities/vault-session';
import type { FrontmatterUpdateValue, VaultManifest } from '@/entities/docs-vault';
import { codedFailure } from '@/shared/lib/failure-code';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { useToast } from '@/shared/ui';
import {
  PINNED_DOCS_STORAGE_PREFIX,
  RECENT_DOCS_STORAGE_PREFIX,
  type VaultRecentKey,
} from '@/widgets/docs-vault';
import type { replaceDocsVaultUrlState } from '../lib/url-state';
import type { DeleteDocTarget } from '../ui/parts/DeleteDocDialog';
import type { RenameDocTarget } from '../ui/parts/RenameDocDialog';

// An updater can run during render, so the write goes to a microtask.
function storeSlugListSoon(storageKey: string, slugs: readonly string[]): void {
  queueMicrotask(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(slugs));
    } catch {
      /* ignore */
    }
  });
}

export function useDocMove({
  manifest,
  localVault,
  recentKey,
  replaceUrlState,
  setPinnedSlugs,
  setRecentSlugs,
  setSelectedSlug,
  setEditing,
  appTouchedSlugsRef,
  canEditCurrent,
  selectedSlug,
}: {
  manifest: VaultManifest;
  localVault: ReturnType<typeof useLocalVault>;
  recentKey: VaultRecentKey;
  replaceUrlState: typeof replaceDocsVaultUrlState;
  setPinnedSlugs: Dispatch<SetStateAction<string[]>>;
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  setEditing: Dispatch<SetStateAction<boolean>>;
  appTouchedSlugsRef: MutableRefObject<ReadonlySet<string>>;
  canEditCurrent: boolean;
  selectedSlug: string | null;
}) {
  const locale = useLocale();
  const toast = useToast();
  // Names of documents pointing at `slug`, from the manifest's backlink index.
  const referrersOf = useCallback(
    (slug: string) => {
      const seen = new Set<string>();
      const referrers: Array<{ slug: string; title: string }> = [];
      for (const entry of manifest.backlinksDetail?.[slug] ?? []) {
        if (entry.fromSlug === slug || seen.has(entry.fromSlug)) continue;
        seen.add(entry.fromSlug);
        const doc = manifest.docs.find((d) => d.slug === entry.fromSlug);
        referrers.push({
          slug: entry.fromSlug,
          title: doc ? resolveLocaleDisplayName(doc.frontmatter, locale, doc.title) : entry.fromSlug,
        });
      }
      return referrers;
    },
    [manifest, locale],
  );
  // Rename, kind change and folder move share this move. Everything naming the old address
  // follows it, and the new name is "not known yet" until the manifest has it, so the
  // missing-document banner does not fire.
  const moveDoc = useCallback(
    async (
      fromSlug: string,
      toSlug: string,
      options: { expectedMtime?: number; frontmatterUpdates?: Record<string, FrontmatterUpdateValue> } = {},
    ): Promise<ReferrerRewriteReport> => {
      if (manifest.docs.some((d) => d.slug === toSlug)) {
        throw codedFailure('already-exists', `${toSlug}.md`);
      }
      const report = await localVault.renameDoc(fromSlug, toSlug, { rewriteBacklinks: true, ...options });
      appTouchedSlugsRef.current = new Set([fromSlug, toSlug]);
      setSelectedSlug(toSlug);
      replaceUrlState({ slug: toSlug });
      setRecentSlugs((list) => {
        const mapped = list.map((s) => (s === fromSlug ? toSlug : s));
        storeSlugListSoon(`${RECENT_DOCS_STORAGE_PREFIX}${recentKey}`, mapped);
        return mapped;
      });
      setPinnedSlugs((list) => {
        const mapped = list.map((s) => (s === fromSlug ? toSlug : s));
        storeSlugListSoon(`${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`, mapped);
        return mapped;
      });
      return report;
    },
    [manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs, appTouchedSlugsRef, setSelectedSlug],
  );

  const [deleteTarget, setDeleteTarget] = useState<DeleteDocTarget | null>(null);
  const handleDeleteCurrent = useCallback(() => {
    if (!canEditCurrent || !selectedSlug) return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    // Clear what would stand above the scrim.
    toast.dismiss();
    setDeleteTarget({
      slug: doc.slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      referrers: referrersOf(doc.slug),
    });
  }, [canEditCurrent, selectedSlug, manifest, locale, referrersOf, toast]);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const slug = deleteTarget.slug;
    // The version the person was shown is the one they agreed to remove.
    const expectedMtime = manifest.docs.find((d) => d.slug === slug)?.mtime;
    await localVault.deleteDoc(slug, { expectedMtime });
    setDeleteTarget(null);
    // Mark the slug as app-touched so the missing-document banner ignores it.
    appTouchedSlugsRef.current = new Set([slug]);
    setSelectedSlug(null);
    replaceUrlState({ slug: null });
    setEditing(false);
    setRecentSlugs((list) => list.filter((s) => s !== slug));
    setPinnedSlugs((list) => {
      const next = list.filter((s) => s !== slug);
      if (next.length !== list.length) {
        storeSlugListSoon(`${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`, next);
      }
      return next;
    });
  }, [deleteTarget, manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs, appTouchedSlugsRef, setEditing, setSelectedSlug]);

  const [renameTarget, setRenameTarget] = useState<RenameDocTarget | null>(null);
  const handleRenameCurrent = useCallback(() => {
    if (!canEditCurrent || !selectedSlug) return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    toast.dismiss();
    setRenameTarget({
      slug: doc.slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      referrerCount: referrersOf(doc.slug).length,
    });
  }, [canEditCurrent, selectedSlug, manifest, locale, referrersOf, toast]);
  const confirmRename = useCallback(
    async (nextSlug: string) => {
      if (!renameTarget) return;
      const expectedMtime = manifest.docs.find((d) => d.slug === renameTarget.slug)?.mtime;
      await moveDoc(renameTarget.slug, nextSlug, { expectedMtime });
      setRenameTarget(null);
    },
    [renameTarget, manifest, moveDoc],
  );
  // macOS and Windows keep one file for `Auth.md` and `auth.md`.
  const isSlugTaken = useCallback(
    (slug: string) => {
      const wanted = slug.toLowerCase();
      return manifest.docs.some((d) => d.slug.toLowerCase() === wanted);
    },
    [manifest],
  );
  return {
    moveDoc,
    deleteTarget,
    setDeleteTarget,
    handleDeleteCurrent,
    confirmDelete,
    renameTarget,
    setRenameTarget,
    handleRenameCurrent,
    confirmRename,
    isSlugTaken,
  };
}
