'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import {
  deriveOntologyFromVault,
  dogfoodManifest,
  DOGFOOD_AGENT_SLUG_PREFIX,
} from '@/entities/docs-vault';
import { derivationToInsight } from './use-ontology-insight';

/**
 * This repository's own vault, pinned, because the `/download` caption claims it and its hero map
 * draws it before first paint. The manifest is a static import
 * (docs/DECISIONS.md, 2026-07-28), so only the screens that reach this file pay for that chunk. Derived once per locale.
 */
const DOGFOOD_DERIVATION = deriveOntologyFromVault(dogfoodManifest);
const insightByLocale = new Map<string, KnowledgeProjectInsight>();

function dogfoodInsight(locale: string): KnowledgeProjectInsight {
  let insight = insightByLocale.get(locale);
  if (!insight) {
    insight = derivationToInsight(DOGFOOD_DERIVATION, locale, {
      agentSlugPrefix: DOGFOOD_AGENT_SLUG_PREFIX,
    });
    insightByLocale.set(locale, insight);
  }
  return insight;
}

export function useDogfoodInsight(): KnowledgeProjectInsight {
  const locale = useLocale();
  return useMemo(() => dogfoodInsight(locale), [locale]);
}
