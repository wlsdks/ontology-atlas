'use client';

import { useMemo } from 'react';

import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { useVaultHealth } from '@/features/vault-ontology/model/use-vault-health';
import type { VaultManifest } from '@/entities/docs-vault';

import { chatSuggestions, type ChatSuggestion } from './chat-suggestions';

/**
 * The suggestions the conversation pane shows — derived from **the vault currently being viewed**.
 *
 * The verdict rules belong to `chat-suggestions.ts` (a pure function, so easy to test) and this hook
 * only gathers the material. The mode branch has the same shape as the ones `useVaultHealth`,
 * `useVaultConceptFacts`, and `useVaultDocFreshnessIndex` already use — not a new copy but the same
 * source, `useStaticVaultSource`.
 */

/**
 * Capabilities with no code evidence. `path:` is the one line saying "where is this capability
 * implemented", and when empty that node exists only on the map and not in the code.
 *
 * Only capabilities are examined — a domain has no code location by nature (it is a business area),
 * and an element's location is its whole reason to exist, so it is almost never empty.
 */
function unevidencedCapabilities(manifest: VaultManifest | null): string[] {
  if (!manifest) return [];
  const out: string[] = [];
  for (const doc of manifest.docs) {
    const fm = doc.frontmatter as Record<string, unknown> | undefined;
    if (fm?.kind !== 'capability') continue;
    const path = fm.path;
    if (typeof path === 'string' && path.trim().length > 0) continue;
    out.push(doc.slug);
  }
  return out.sort();
}

export function useChatSuggestions(): ChatSuggestion[] {
  const health = useVaultHealth();
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  // The choice is made on the manifest's presence rather than `status` — using `status` made the
  // suggestions vanish entirely and come back during the re-read right after a save
  // (`use-vault-concept-facts` uses the same verdict for the same reason).
  const manifest = mode === 'static' ? staticSource.manifest : (vault.manifest ?? null);

  return useMemo(
    () =>
      chatSuggestions({
        nodeCount: health.summary.nodes,
        islands: health.islands,
        missingContainment: health.missingContainment,
        unevidenced: unevidencedCapabilities(manifest),
      }),
    [health, manifest],
  );
}
