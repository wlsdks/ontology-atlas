import { useMemo } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';

export interface VaultConceptFacts {
  /** Empty means the validator asked and found nothing. */
  findings: readonly string[];
  domainRef: string | null;
  mtime: number | null;
}

const NO_FINDINGS: readonly string[] = [];

/** Uncomputed findings read as an empty list: silence means "nothing reported", never "checked and clean". */
export function manifestToConceptFacts(
  manifest: VaultManifest,
): Map<string, VaultConceptFacts> {
  const facts = new Map<string, VaultConceptFacts>();
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter ?? {};
    const domainRaw = typeof fm.domain === 'string' ? fm.domain.trim() : '';
    facts.set(doc.slug, {
      findings: Array.isArray(doc.meaningFindings) ? doc.meaningFindings : NO_FINDINGS,
      domainRef: domainRaw || null,
      mtime: typeof doc.mtime === 'number' ? doc.mtime : null,
    });
  }
  return facts;
}

const EMPTY_FACTS: Map<string, VaultConceptFacts> = new Map();
const factsCache = new WeakMap<VaultManifest, Map<string, VaultConceptFacts>>();

function cachedFacts(manifest: VaultManifest): Map<string, VaultConceptFacts> {
  const cached = factsCache.get(manifest);
  if (cached) return cached;
  const built = manifestToConceptFacts(manifest);
  factsCache.set(manifest, built);
  return built;
}

export function useVaultConceptFacts(): ReadonlyMap<string, VaultConceptFacts> {
  const vault = useLocalVault();

  const arriving = vault.partialTotal > 0;
  return useMemo(() => {
    if (arriving) return EMPTY_FACTS;
    // By manifest presence, not `status`: status is 'loading' on every save and poll, and an
    // empty map then makes rows vanish.
    if (!vault.manifest) return EMPTY_FACTS;
    return cachedFacts(vault.manifest);
  }, [arriving, vault.manifest]);
}
