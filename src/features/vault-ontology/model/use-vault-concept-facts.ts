'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import type { VaultManifest } from '@/entities/docs-vault';

/** Only the document facts the to-do queue's meaning-gap verdict needs — the input to `MeaningGapRow`. */
export interface VaultConceptFacts {
  /**
   * The meaning findings the manifest recorded for this document, as portable
   * codes. Empty means the validator asked and found nothing.
   */
  findings: readonly string[];
  domainRef: string | null;
  mtime: number | null;
}

const NO_FINDINGS: readonly string[] = [];

/**
 * Manifest → per-doc-slug facts. Pure, so a test only has to build one manifest.
 *
 * `findings` is carried through unchanged from `VaultDoc.meaningFindings`, which both
 * manifest builders fill from `src/shared/lib/meaning-findings.ts`. Nothing is judged
 * here: until 2026-09-22 this hook decided "has a definition" from the presence of a
 * `description` or an excerpt, so a node whose body was a heading and a placeholder
 * counted as defined, and the person's own queue disagreed with what `validate_vault`
 * told their agent about the same file.
 *
 * A document with no `kind:`, a manifest built before the key existed, and a node whose
 * findings were **not computed** (`null` — the builder ran without the rule module) all read
 * as an empty list here, which raises no row and no count. That is deliberately the quiet
 * answer: silence says "nothing was reported", never "this file was checked and is clean",
 * and no surface may turn it into the second.
 */
export function manifestToConceptFacts(
  manifest: VaultManifest,
): Map<string, VaultConceptFacts> {
  const facts = new Map<string, VaultConceptFacts>();
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter ?? {};
    const domainRaw = typeof fm.domain === 'string' ? fm.domain.trim() : '';
    facts.set(doc.slug, {
      // `null` (not computed) lands here with the absent case on purpose — see above.
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
