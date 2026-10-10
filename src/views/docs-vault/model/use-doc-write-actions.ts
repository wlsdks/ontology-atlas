'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  useLocalVault,
  VaultConflictError,
  type ReferrerRewriteReport,
} from '@/entities/vault-session';
import {
  buildNewNodeDoc,
  planKindChangeReferrers,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault';
import { codedFailure } from '@/shared/lib/failure-code';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { findSimilarNodeByTitle, type SimilarNodeMatch } from '@/shared/lib/similar-node-title';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { useToast } from '@/shared/ui';
import {
  PINNED_DOCS_STORAGE_PREFIX,
  RECENT_DOCS_STORAGE_PREFIX,
  pushRecentDoc,
} from '@/widgets/docs-vault';
import { kindChangeReceipt } from '../lib/kind-change-receipt';
import { reclassifyMoveTarget } from '../lib/kind-folder-move';
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';
import type { useDocAccess } from './use-doc-access';
import type { useDocsVaultAddress } from './use-docs-vault-url';
import type { useDocsVaultSource } from './use-docs-vault-source';
import type { useQuerySlugVerdict } from './use-query-slug-verdict';
import type { useVaultManifest } from './use-vault-manifest';

export interface DeleteDocTarget {
  slug: string;
  title: string;
  /** By display name. */
  referrers: ReadonlyArray<{ slug: string; title: string }>;
}

export interface RenameDocTarget {
  slug: string;
  title: string;
  /** Their references move with the file. */
  referrerCount: number;
}

export const NEW_DOC_KINDS = ['domain', 'capability', 'element', 'document'] as const;
export type NewDocKind = (typeof NEW_DOC_KINDS)[number];

export interface DocFrontmatterPatch {
  kind?: string;
  domain?: string | null;
  title?: string;
  /** A per-language name (`display_ko`, `display_en`, ...); null removes the key. */
  [displayName: `display_${string}`]: string | null | undefined;
}

/** How many referrer names a kind-change receipt spells out before it counts the rest. */
const REFERRER_NAMES_SHOWN = 3;

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

/** The reader's word for a kind-named list key; shared with the write receipts. */
export function useReferrerListName(): (key: string) => string {
  const t = useTranslations("docsVault.frontmatterBlock.referrerLists.listName");
  return useCallback(
    (key: string) => {
      switch (key) {
        case "domains":
          return t("domains");
        case "capabilities":
          return t("capabilities");
        case "elements":
          return t("elements");
        case "domain":
          return t("domain");
        default:
          return key;
      }
    },
    [t],
  );
}

export function useDocWriteActions({
  address,
  vault,
  src,
  appTouchedSlugsRef,
  access,
  selectedSlug,
  setSelectedSlug,
  setAdvancedOpen,
  closePopovers,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  vault: ReturnType<typeof useVaultManifest>;
  src: ReturnType<typeof useDocsVaultSource>;
  appTouchedSlugsRef: ReturnType<typeof useQuerySlugVerdict>['appTouchedSlugsRef'];
  access: ReturnType<typeof useDocAccess>;
  selectedSlug: string | null;
  setSelectedSlug: (slug: string | null) => void;
  setAdvancedOpen: (open: boolean) => void;
  closePopovers: () => void;
}) {
  const { replaceUrlState, generalDocsHref, setView } = address;
  const { manifest, docsBySlug, selectedDoc } = vault;
  const { recentKey, setRecentSlugs, setPinnedSlugs } = src;
  const { canEditCurrent, setEditing } = access;
  const localVault = useLocalVault();
  const referrerListName = useReferrerListName();
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const failureSentence = useFailureSentence();
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
    closePopovers();
    setNewDocKindDialogOpen(true);
  }, [canEditCurrent, closePopovers]);
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

  const handleInsertToc = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const headings = doc.headings.filter(
      (h) => h.depth >= 2 && h.depth <= 3,
    );
    if (headings.length === 0) {
      toast.show(t('dialog.noHeadings'), 'info');
      return;
    }
    const tocLines = headings.map((h) => {
      const indent = h.depth === 3 ? '  ' : '';
      return `${indent}- [${h.text}](#${h.slug})`;
    });
    const tocBlock = [
      '<!-- toc:start -->',
      `## ${t('dialog.tocHeading')}`,
      '',
      ...tocLines,
      '<!-- toc:end -->',
    ].join('\n');
    const fh = localVault.fileHandles.get(selectedSlug);
    if (!fh) {
      toast.show(t('dialog.notLocalFile'), 'error');
      return;
    }
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // `insertAfter` is not adjusted for the stripped block; safe while the toc sits at the top.
      const head = stripped.slice(0, insertAfter);
      const body = stripped.slice(insertAfter);
      const next = `${head}${tocBlock}\n\n${body}`;
      await localVault.saveDoc(selectedSlug, next, {
        expectedMtime: file.lastModified,
      });
    } catch (err) {
      toast.show(
        err instanceof VaultConflictError
          ? t('dialog.vaultConflict')
          : failureSentence(err, t('dialog.tocFailed')).sentence,
        'error',
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, t, toast, failureSentence]);

  const handleExportDocHtml = useCallback(() => {
    if (!selectedSlug || typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) {
      toast.show(t('dialog.notRendered'), 'info');
      return;
    }
    const html = buildDocsVaultPopoutHtml(doc.title, article.outerHTML);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = doc.slug.replace(/\//g, '-');
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedSlug, manifest, t, toast]);

  const domainOptions = useMemo(
    () =>
      manifest.docs
        .filter((d) => d.frontmatter?.kind === 'domain')
        .map((d) => ({
          slug: d.slug,
          title:
            (typeof d.frontmatter?.title === 'string' && d.frontmatter.title.trim()) ||
            d.title,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [manifest],
  );
  // Referrers are named by display name, and each list by its plain name in the reader's language.
  const docDisplayName = useCallback(
    (slug: string) => {
      const doc = docsBySlug.get(slug);
      return doc ? resolveLocaleDisplayName(doc.frontmatter, locale, doc.title) : slug;
    },
    [docsBySlug, locale],
  );
  const joinDocNames = useCallback(
    (slugs: readonly string[]) => {
      const shown = slugs.slice(0, REFERRER_NAMES_SHOWN).map(docDisplayName).join(', ');
      return slugs.length > REFERRER_NAMES_SHOWN
        ? `${shown}${t('frontmatterBlock.referrerLists.namesMore', { count: slugs.length - REFERRER_NAMES_SHOWN })}`
        : shown;
    },
    [docDisplayName, t],
  );
  // Rows the quick patch shows before Save, from the same verdict the write applies.
  const kindChangeReferrers = useCallback(
    (newKind: string, newSlug: string) => {
      if (!selectedDoc) return [];
      return planKindChangeReferrers(manifest.docs, {
        oldSlug: selectedDoc.slug,
        newSlug,
        newKind,
      }).map((row) => ({ ...row, name: docDisplayName(row.slug) }));
    },
    [selectedDoc, manifest, docDisplayName],
  );
  // The receipt after Save: which referrers moved lists, kept it, or could not be written.
  const showKindChangeReceipt = useCallback(
    (report: ReferrerRewriteReport) => {
      const receipt = kindChangeReceipt(report);
      if (!receipt) return;
      const list = (key: string | null) => (key ? referrerListName(key) : '');
      const sentences: string[] = [];
      if (receipt.moved.slugs.length > 0) {
        const args = {
          count: receipt.moved.slugs.length,
          names: joinDocNames(receipt.moved.slugs),
          to: list(receipt.moved.to),
          from: list(receipt.moved.from),
        };
        sentences.push(
          receipt.moved.from
            ? t('frontmatterBlock.referrerLists.movedReceipt', args)
            : t('frontmatterBlock.referrerLists.movedReceiptMixed', args),
        );
      }
      if (receipt.kept.slugs.length > 0) {
        sentences.push(
          t('frontmatterBlock.referrerLists.keptReceipt', {
            count: receipt.kept.slugs.length,
            names: joinDocNames(receipt.kept.slugs),
          }),
        );
      }
      if (receipt.failed.slugs.length > 0) {
        sentences.push(
          t('frontmatterBlock.referrerLists.failedReceipt', {
            count: receipt.failed.slugs.length,
            names: joinDocNames(receipt.failed.slugs),
          }),
        );
      }
      const description =
        sentences.length > 1
          ? sentences.slice(1).join(' ')
          : receipt.moved.slugs.length > 0
            ? t('frontmatterBlock.referrerLists.movedEffect', {
                count: receipt.moved.slugs.length,
                to: list(receipt.moved.to),
              })
            : undefined;
      toast.show(sentences[0], receipt.tone, undefined, description ? { description } : undefined);
    },
    [t, joinDocNames, referrerListName, toast],
  );
  // The form shows a rejection in place, so no toast. A kind change also moves the file to
  // its new kind folder and rewrites every referrer's list.
  const handlePatchDocFrontmatter = useCallback(
    async (patch: DocFrontmatterPatch) => {
      if (!selectedDoc) return;
      const updates: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) updates[key] = value;
      }
      const currentKind =
        typeof selectedDoc.frontmatter?.kind === 'string' ? selectedDoc.frontmatter.kind.trim() : null;
      const newKind = updates.kind && updates.kind !== currentKind ? updates.kind : null;
      const expectedMtime = selectedDoc.mtime;
      if (!newKind) {
        await localVault.updateFrontmatter(selectedDoc.slug, updates, { expectedMtime });
        return;
      }
      const moveTarget = reclassifyMoveTarget(selectedDoc.slug, currentKind, newKind);
      showKindChangeReceipt(
        moveTarget
          ? await moveDoc(selectedDoc.slug, moveTarget, { expectedMtime, frontmatterUpdates: updates })
          : await localVault.reclassifyDoc(selectedDoc.slug, updates, { expectedMtime }),
      );
    },
    [selectedDoc, localVault, moveDoc, showKindChangeReceipt],
  );
  const handleMoveToKindFolder = useCallback(
    (target: string) => {
      if (!selectedDoc) return;
      moveDoc(selectedDoc.slug, target, { expectedMtime: selectedDoc.mtime }).catch((err: unknown) => {
        toast.show(
          err instanceof VaultConflictError
            ? t('dialog.vaultConflict')
            : failureSentence(err, t('dialog.moveFailed')).sentence,
          'error',
        );
      });
    },
    [selectedDoc, moveDoc, toast, t, failureSentence],
  );
  return {
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
  };
}
