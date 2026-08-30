'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';

/** Only the document facts the to-do queue's meaning-gap verdict needs — the input to `MeaningGapRow`. */
export interface VaultConceptFacts {
  hasDefinition: boolean;
  domainRef: string | null;
  mtime: number | null;
}

/**
 * Manifest → per-doc-slug facts. Pure, so a test only has to build one manifest.
 *
 * `hasDefinition` means a `description` **or** a body summary — the same ladder derivation
 * (`derive-ontology-from-vault`) uses to build a node summary, so there is no contradiction
 * where the map popover shows a meaning while the queue says "no definition".
 */
export function manifestToConceptFacts(
  manifest: VaultManifest,
): Map<string, VaultConceptFacts> {
  const facts = new Map<string, VaultConceptFacts>();
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter ?? {};
    const description =
      typeof doc.description === 'string' && doc.description.trim()
        ? doc.description.trim()
        : typeof fm.description === 'string' && fm.description.trim()
          ? String(fm.description).trim()
          : '';
    const domainRaw = typeof fm.domain === 'string' ? fm.domain.trim() : '';
    facts.set(doc.slug, {
      hasDefinition: Boolean(description) || Boolean((doc.excerpt ?? '').trim()),
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

/**
 * The mode-aware adapter — the same pattern as `useVaultDocFreshnessIndex` /
 * `useVaultHealth`. Static means the bundled sample currently shown, local means the user's
 * folder. The user's folder always wins, so nothing beyond the branch is decided here.
 */
export function useVaultConceptFacts(): ReadonlyMap<string, VaultConceptFacts> {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  return useMemo(() => {
    if (mode === 'static') return cachedFacts(staticSource.manifest);
    // Decided by **whether a manifest exists**, not by `status`. `load()` flips status to
    // 'loading' after every save and on every poll (the manifest stays), and returning an
    // empty map in that moment makes every row built from these facts disappear — to the
    // user it looks like "the fields I was filling vanished" (measured 2026-07-26).
    // Re-reading does not mean there is no data. Write safety is guarded by `expectedMtime`, not here.
    if (!vault.manifest) return EMPTY_FACTS;
    return cachedFacts(vault.manifest);
  }, [mode, vault.manifest, staticSource.manifest]);
}
