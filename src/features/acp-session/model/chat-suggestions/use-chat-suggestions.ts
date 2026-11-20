'use client';

import { useMemo } from 'react';

import { useDataSourceMode, useLocalVault, useStaticVaultSource } from '@/entities/vault-session';
import { useVaultHealth } from '@/features/vault-ontology';

import { chatSuggestions, type ChatSuggestion } from './chat-suggestions';
import { canonicalSlug, capabilitiesWithoutDependency, capabilitiesWithoutReadRule, codeShapedTitles } from './measured-facts';

const NO_SUGGESTIONS: ChatSuggestion[] = [];

/**
 * Next steps for the vault currently viewed. The rules live in the pure `chat-suggestions.ts`; this
 * hook gathers the counts from the same sources the map reads, so a number here is the map's number.
 * `changedSource` is the map's own Git measurement (slugs whose cited file changed after their
 * document), or `null` where it was not measured. Empty, and uncomputed, while not `shown`.
 */
export function useChatSuggestions(
  sourceState: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects',
  changedSource: readonly string[] | null,
  shown: boolean,
): ChatSuggestion[] {
  const health = useVaultHealth(shown);
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  // The choice follows the manifest's presence, not `status`, so rows do not vanish during the
  // re-read after a save (as in `use-vault-concept-facts`).
  const manifest = mode === 'static' ? staticSource.manifest : (vault.manifest ?? null);

  return useMemo(() => {
    if (!health) return NO_SUGGESTIONS;
    const docs = manifest?.docs ?? [];
    const slugByAddress = new Map(docs.map((doc) => [doc.slug, canonicalSlug(doc)]));
    return chatSuggestions({
      nodeCount: health.summary.nodes,
      sourceState,
      islands: health.islands.map((group) => group.map((slug) => slugByAddress.get(slug) ?? slug)),
      withoutReadRule: capabilitiesWithoutReadRule(docs),
      withoutDependency: capabilitiesWithoutDependency(docs),
      codeShaped: codeShapedTitles(docs),
      changedSource,
    });
  }, [changedSource, health, manifest, sourceState]);
}
