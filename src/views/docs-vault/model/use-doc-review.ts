'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { VaultConflictError, useLocalVault } from '@/entities/vault-session';
import { useToast } from '@/shared/ui';
import { useReviewQueue } from '../lib/use-review-queue';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { resolveStaticVaultSource, reviewDigest, type VaultManifest } from '@/entities/docs-vault';
import type { DocsVaultSource as Source } from '../lib/persistence';

export function useDocReview({
  scopedDocs,
  getDocContent,
  source,
  staticVault,
  selectedSlug,
  selectedDoc,
}: {
  scopedDocs: VaultManifest['docs'];
  getDocContent: ((slug: string) => Promise<string>) | undefined;
  source: Source;
  staticVault: ReturnType<typeof resolveStaticVaultSource>;
  selectedSlug: string | null;
  selectedDoc: VaultManifest['docs'][number] | null;
}) {
  const localVault = useLocalVault();
  const t = useTranslations('docsVault');
  const toast = useToast();
  // Built from the whole folder: a reserved node keeps waiting whatever the filter shows.
  const reviewQueue = useReviewQueue({
    docs: scopedDocs,
    getDocContent,
    bundledContent: source === 'local' ? undefined : staticVault.content,
  });
  const selectedReviewRow = useMemo(
    () => reviewQueue.find((row) => row.slug === selectedSlug),
    [reviewQueue, selectedSlug],
  );
  const [reviewBusy, setReviewBusy] = useState(false);
  /**
   * A person's own write, through the conflict-guarded `updateFrontmatter`; the MCP server
   * refuses it so that a click proves a person. The digest is of the file as it is now,
   * so any later edit reads as changed.
   */
  const handleReviewWrite = useCallback(
    async (intent: 'confirm' | 'release') => {
      if (!selectedDoc || !getDocContent) return;
      setReviewBusy(true);
      try {
        const patch: Record<string, string | null> =
          intent === 'release'
            ? {
                review_state: null,
                review_note: null,
                // Clearing only the state would leave `reviewedBy` reading as an approval nobody holds.
                reviewed_by: null,
                reviewed_at: null,
                reviewed_digest: null,
              }
            : {
                review_state: 'confirmed',
                // The reader's calendar day, not UTC's; `sv-SE` formats as `YYYY-MM-DD`.
                reviewed_at: new Date().toLocaleDateString('sv-SE'),
                reviewed_digest: await reviewDigest(
                  selectedDoc.frontmatter,
                  parseFrontmatter(await getDocContent(selectedDoc.slug)).body,
                ),
                // Confirming answers the reservation, so its question is cleared.
                review_note: null,
              };
        await localVault.updateFrontmatter(selectedDoc.slug, patch, {
          expectedMtime: selectedDoc.mtime,
        });
      } catch (err) {
        // Both callers discard this promise, so the failure is told here.
        if (err instanceof VaultConflictError) {
          toast.show(t('dialog.vaultConflict'), 'error');
        } else {
          toast.show(t('review.writeFailed'), 'error');
        }
        console.error('[docs-vault] review write failed', err);
      } finally {
        setReviewBusy(false);
      }
    },
    [selectedDoc, getDocContent, localVault, toast, t],
  );
  return { reviewQueue, selectedReviewRow, reviewBusy, handleReviewWrite };
}
