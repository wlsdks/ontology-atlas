"use client";

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { buildReviewQueue, type ReviewQueueRow, type VaultDoc } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

let lastQueue: { key: string; rows: ReviewQueueRow[] } | null = null;

export function reviewQueueKey(docs: VaultDoc[], locale: string): string {
  const marks = [locale];
  for (const doc of docs) {
    const frontmatter = doc.frontmatter ?? {};
    if (frontmatter.review_state === undefined) continue;
    marks.push([doc.slug, doc.title, doc.mtime ?? doc.updatedAt, frontmatter.review_state, frontmatter.review_note, frontmatter.reviewed_by, frontmatter.reviewed_digest]
      .map((value) => String(value ?? ''))
      .join('\u0000'));
  }
  return marks.join('\u0001');
}

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
  const locale = useLocale();
  const key = useMemo(() => reviewQueueKey(docs, locale), [docs, locale]);
  const [rows, setRows] = useState<ReviewQueueRow[]>(() => (lastQueue?.key === key ? lastQueue.rows : []));

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
      const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
      const localized = next.map((row) => {
        const doc = bySlug.get(row.slug);
        return doc
          ? { ...row, title: resolveLocaleDisplayName(doc.frontmatter, locale, row.title) }
          : row;
      });
      lastQueue = { key, rows: localized };
      if (!cancelled) setRows(localized);
    })();
    return () => {
      cancelled = true;
    };
  }, [docs, getDocContent, bundledContent, locale, key]);

  return rows;
}
