'use client';

import { useEffect, useState } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { extractProjectBody, findProjectVaultDoc } from '@/entities/docs-vault';
import { fetchServerDocContent } from '@/entities/docs-vault/lib/server-doc-content';

export interface UseProjectBodyState {
  /** The real markdown body of project.md. Null when absent or not yet read. */
  body: string | null;
}

/**
 * The lazy body loader for the "body" card on `/project/[slug]`.
 *
 * `useProjects` (the shared derivation the list screen also uses) needs only the excerpt and
 * never pre-reads a full body. This hook does I/O only when `ProjectDetailPage` mounts, and
 * only for that slug.
 *
 * - static: content.json is already bundled, so the lookup is synchronous (no extra I/O).
 * - local: the real file is read asynchronously through `FileSystemFileHandle.getFile()`,
 *   reusing the same mechanism as node description editing on HomePage.
 */
export function useProjectBody(slug: string | null): UseProjectBodyState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // The manifest and the content are taken **as a pair** — the old defect was precisely
  // "manifest storefront, content dogfood". It returns one module constant, so the reference
  // is stable and putting it in an effect's dependencies causes no re-run loop.
  const staticSource = useStaticVaultSource();
  const [resolved, setResolved] = useState<{ slug: string; body: string | null } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      window.queueMicrotask(() => {
        if (!cancelled) setResolved(null);
      });
      return () => {
        cancelled = true;
      };
    }

    if (mode === 'static') {
      const doc = findProjectVaultDoc(staticSource.manifest, slug);
      if (!doc) {
        window.queueMicrotask(() => {
          if (!cancelled) setResolved({ slug, body: null });
        });
        return () => {
          cancelled = true;
        };
      }

  // Only gateway documents are in the synchronous fallback map. Project documents are read
  // from the public raw asset the static export already copied, so the full content.json is
  // not loaded into the initial chunk.
      fetchServerDocContent(doc.slug, {
        bundledContent: staticSource.content,
        locationHref: typeof window === 'undefined' ? undefined : window.location.href,
      })
        .then((raw) => {
          if (!cancelled) setResolved({ slug, body: extractProjectBody(raw) ?? null });
        })
        .catch(() => {
          if (!cancelled) setResolved({ slug, body: null });
        });
      return () => {
        cancelled = true;
      };
    }

    // local
    const doc = vault.manifest ? findProjectVaultDoc(vault.manifest, slug) : null;
    const fh = doc ? vault.fileHandles.get(doc.slug) : null;
    if (!fh) {
      window.queueMicrotask(() => {
        if (!cancelled) setResolved({ slug, body: null });
      });
      return () => {
        cancelled = true;
      };
    }
    fh.getFile()
      .then((file) => file.text())
      .then((raw) => {
        if (!cancelled) setResolved({ slug, body: extractProjectBody(raw) ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolved({ slug, body: null });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, mode, vault.manifest, vault.fileHandles, staticSource]);

  return { body: resolved && resolved.slug === slug ? resolved.body : null };
}
