"use client";

import { useEffect, useMemo, useState } from "react";
import { buildReviewQueue, type ReviewQueueRow, type VaultDoc } from "@/entities/docs-vault";
import { useLocalVault } from "@/entities/vault-session";
import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";

const NO_ROWS: ReviewQueueRow[] = [];

function reviewMarksKey(docs: readonly VaultDoc[]): string {
  const marks: string[] = [];
  for (const doc of docs) {
    const fm = doc.frontmatter ?? {};
    if (fm.review_state === undefined) continue;
    marks.push([doc.slug, doc.mtime ?? doc.updatedAt, fm.review_state, fm.review_note, fm.reviewed_by, fm.reviewed_digest].map(String).join("\0"));
  }
  return marks.join("\u0001");
}

export interface ProjectReviewRows {
  rows: ReviewQueueRow[];
  /** True until the first queue is read; a later re-read keeps the previous rows on screen. */
  reading: boolean;
}

/**
 * The folder's review queue by the rule `/docs` uses (`buildReviewQueue`): raised documents, and
 * confirmed ones whose meaning changed since or could not be read. Bodies are read from the open
 * folder.
 */
export function useProjectReviewRows(docs: readonly VaultDoc[]): ProjectReviewRows {
  const vault = useLocalVault();
  const key = useMemo(() => reviewMarksKey(docs), [docs]);
  const [result, setResult] = useState<{ key: string; rows: ReviewQueueRow[] } | null>(null);

  const fileHandles = vault.fileHandles;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const marked = docs.filter((doc) => doc.frontmatter?.review_state !== undefined);
    void buildReviewQueue(marked, async (slug) => {
      const raw = await fileHandles.get(slug)?.getFile().then((file) => file.text()).catch(() => null) ?? null;
      return raw === null ? null : parseFrontmatter(raw).body;
    }).then((rows) => {
      if (!cancelled) setResult({ key, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [key, docs, fileHandles]);

  if (!key) return { rows: NO_ROWS, reading: false };
  return { rows: result?.rows ?? NO_ROWS, reading: result === null };
}
