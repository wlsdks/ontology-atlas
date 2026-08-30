'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';

import { useDataSourceMode, useLocalVault, useStaticVaultSource } from '@/entities/vault-session';
import { useVaultHealth } from '@/features/vault-ontology';
import { capabilitiesWithoutImplementationEvidence } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';

import { chatSuggestions, type ChatSuggestion } from './chat-suggestions';

export function suggestionDisplayNames(
  docs: readonly VaultDoc[],
  locale: string,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const doc of docs) {
    const name = resolveLocaleDisplayName(doc.frontmatter, locale, doc.title);
    const addresses = [
      typeof doc.frontmatter.slug === 'string' ? doc.frontmatter.slug : '',
      doc.slug,
    ];
    for (const address of addresses) {
      const trimmed = address.trim();
      if (!trimmed) continue;
      names[trimmed] = name;
      names[trimmed.replace(/^ontology\//, '')] = name;
    }
  }
  return names;
}

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
  const locale = useLocale();
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  // The choice is made on the manifest's presence rather than `status` — using `status` made the
  // suggestions vanish entirely and come back during the re-read right after a save
  // (`use-vault-concept-facts` uses the same verdict for the same reason).
  const manifest = mode === 'static' ? staticSource.manifest : (vault.manifest ?? null);

  return useMemo(
    () => {
      const displayNames = manifest ? suggestionDisplayNames(manifest.docs, locale) : {};
      return chatSuggestions({
        nodeCount: health.summary.nodes,
        islands: health.islands,
        missingContainment: health.missingContainment,
        unevidenced: manifest
          ? capabilitiesWithoutImplementationEvidence(manifest.docs)
          : [],
        displayNames,
        sourceState,
      });
    },
    [health, locale, manifest, sourceState],
  );
}
