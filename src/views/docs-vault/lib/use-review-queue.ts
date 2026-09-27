"use client";

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { buildReviewQueue, type ReviewQueueRow, type VaultDoc } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

/**
 * The review queue for the loaded folder. A stateful hook because drift hashing uses the
 * asynchronous `crypto.subtle`; only approved nodes are hashed, so cost follows what a person
 * reviewed, not vault size.
 */
export function useReviewQueue({
  docs,
  getDocContent,
  bundledContent,
}: {
  docs: VaultDoc[];
  /** Absent for the bundled source. */
  getDocContent: ((slug: string) => Promise<string>) | undefined;
  bundledContent: Record<string, string> | undefined;
}): ReviewQueueRow[] {
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await buildReviewQueue(docs, async (slug) => {
        const raw = getDocContent
          ? await getDocContent(slug).catch(() => null)
          : (bundledContent?.[slug] ?? null);
        // An unreadable file is not evidence of drift, so `buildReviewQueue` drops the row on null.
        return raw === null ? null : parseFrontmatter(raw).body;
      });
      // Show the reader's `display_<locale>` name as the rest of the sidebar does.
      const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
      const localized = next.map((row) => {
        const doc = bySlug.get(row.slug);
        return doc
          ? { ...row, title: resolveLocaleDisplayName(doc.frontmatter, locale, row.title) }
          : row;
      });
      if (!cancelled) setRows(localized);
    })();
    return () => {
      cancelled = true;
    };
  }, [docs, getDocContent, bundledContent, locale]);

  return rows;
}
