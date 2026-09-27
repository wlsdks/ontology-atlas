'use client';

import { useEffect, useState } from 'react';
import { useDataSourceMode, useLocalVault, useStaticVaultSource } from '@/entities/vault-session';
import { extractProjectBody, findProjectVaultDoc, fetchServerDocContent } from '@/entities/docs-vault';

export interface UseProjectBodyState {
  /** The real markdown body of project.md. Null when absent or not yet read. */
  body: string | null;
}

/** Lazy body loader for `/project/[slug]`: bundled content for static, `getFile()` for local. */
export function useProjectBody(slug: string | null): UseProjectBodyState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // Manifest and content are taken as one stable pair from the resolver.
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

  // Project docs come from the exported raw asset, keeping content.json out of the initial chunk.
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
