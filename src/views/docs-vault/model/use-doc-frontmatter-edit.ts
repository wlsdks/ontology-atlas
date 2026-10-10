'use client';

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  VaultConflictError,
  type ReferrerRewriteReport,
  type useLocalVault,
} from '@/entities/vault-session';
import { planKindChangeReferrers, type VaultManifest } from '@/entities/docs-vault';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { useToast } from '@/shared/ui';
import { kindChangeReceipt } from '../lib/kind-change-receipt';
import { reclassifyMoveTarget } from '../lib/kind-folder-move';
import type { DocFrontmatterPatch } from '../ui/parts/DocFrontmatterBlock';
import type { useDocMove } from './use-doc-move';

/** How many referrer names a kind-change receipt spells out before it counts the rest. */
const REFERRER_NAMES_SHOWN = 3;

export function useDocFrontmatterEdit({
  manifest,
  docsBySlug,
  selectedDoc,
  localVault,
  moveDoc,
  referrerListName,
}: {
  manifest: VaultManifest;
  docsBySlug: ReadonlyMap<string, VaultManifest['docs'][number]>;
  selectedDoc: VaultManifest['docs'][number] | null;
  localVault: ReturnType<typeof useLocalVault>;
  moveDoc: ReturnType<typeof useDocMove>['moveDoc'];
  referrerListName: (key: string) => string;
}) {
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const toast = useToast();
  const failureSentence = useFailureSentence();
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
    domainOptions,
    kindChangeReferrers,
    handlePatchDocFrontmatter,
    handleMoveToKindFolder,
  };
}
