'use client';

import { useMemo } from 'react';

import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { useVaultHealth } from '@/features/vault-ontology/model/use-vault-health';
import { capabilitiesWithoutImplementationEvidence } from '@/entities/knowledge-graph/lib/vault-health';

import { chatSuggestions, type ChatSuggestion } from './chat-suggestions';

/**
 * The suggestions the conversation pane shows — derived from **the vault currently being viewed**.
 *
 * The verdict rules belong to `chat-suggestions.ts` (a pure function, so easy to test) and this hook
 * only gathers the material. The mode branch has the same shape as the ones `useVaultHealth`,
 * `useVaultConceptFacts`, and `useVaultDocFreshnessIndex` already use — not a new copy but the same
 * source, `useStaticVaultSource`.
 */

export function useChatSuggestions(
  sourceState: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects' = 'bound',
): ChatSuggestion[] {
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
        unevidenced: manifest
          ? capabilitiesWithoutImplementationEvidence(manifest.docs)
          : [],
        sourceState,
      }),
    [health, manifest, sourceState],
  );
}
