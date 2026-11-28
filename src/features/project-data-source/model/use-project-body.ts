import { useEffect, useState } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import { extractProjectBody, findProjectVaultDoc } from '@/entities/docs-vault';

export interface UseProjectBodyState {
  body: string | null;
  settled: boolean;
}

export function useProjectBody(slug: string | null): UseProjectBodyState {
  const vault = useLocalVault();
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
  }, [slug, vault.manifest, vault.fileHandles]);

  const current = resolved && resolved.slug === slug ? resolved : null;
  return { body: current ? current.body : null, settled: slug === null || current !== null };
}
