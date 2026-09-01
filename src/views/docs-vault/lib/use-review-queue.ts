"use client";

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { buildReviewQueue, type ReviewQueueRow, type VaultDoc } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

/**
 * The review queue for the currently loaded folder.
 *
 * **Why it is a hook with state rather than a `useMemo`.** The drift half of the
 * queue hashes a document's meaning, and the browser's only hash
 * (`crypto.subtle`) is asynchronous. That cost is paid for approved nodes alone —
 * a raised node needs no body, and an unmarked node is never counted — so the
 * work is bounded by how much a person actually reviewed rather than by vault
 * size.
 *
 * **Why the body is parsed here.** Both sources hand over a whole `.md` file:
 * the static source from its bundled content map, the local folder from a file
 * handle. The digest is over the body a reader sees, so the frontmatter is
 * stripped with the same parser the manifest was built with.
 */
export function useReviewQueue({
  docs,
  getDocContent,
  bundledContent,
}: {
  docs: VaultDoc[];
  /** Local folder reader. Absent for the bundled source. */
  getDocContent: ((slug: string) => Promise<string>) | undefined;
  /** Bundled source content, keyed by slug. */
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
        // A file that cannot be read is not evidence that its node drifted, so
        // `buildReviewQueue` drops the row on null rather than reporting one.
        return raw === null ? null : parseFrontmatter(raw).body;
      });
      // The rest of this sidebar draws `display_ko` / `display_en`; a queue that
      // showed the canonical `title` instead put two names for one node on one
      // screen. Resolved here rather than in the entity, because which name a
      // reader gets is a property of who is reading.
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
