'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';

import { useDataSourceMode, useLocalVault, useStaticVaultSource } from '@/entities/vault-session';
import { useVaultHealth } from '@/features/vault-ontology';
import { capabilitiesWithoutImplementationEvidence } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { resolveLocaleDisplayName } from '@/shared/lib/locale-text/locale-display-name';

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
 * Suggestions for the vault currently viewed. The rules live in the pure `chat-suggestions.ts`; this
 * hook gathers material from the same source as the other vault hooks, `useStaticVaultSource`.
 */

export function useChatSuggestions(
  sourceState: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects' = 'bound',
): ChatSuggestion[] {
  const health = useVaultHealth();
  const locale = useLocale();
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const staticSource = useStaticVaultSource();

  // The choice follows the manifest's presence, not `status`, so suggestions do not vanish during the
  // re-read after a save (as in `use-vault-concept-facts`).
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
