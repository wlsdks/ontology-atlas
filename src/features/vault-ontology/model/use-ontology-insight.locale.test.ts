import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from '@/entities/docs-vault';
import type { VaultManifest } from '@/entities/docs-vault';
import { derivationToInsight } from './use-ontology-insight';

// Per-locale display names (owner instruction, 2026-07-24) — pins that frontmatter
// `display_<locale>` is collected onto the stub and resolved to the screen locale at the insight boundary.
const manifest = {
  docs: [
    {
      slug: 'domains/payment',
      title: '결제',
      frontmatter: { kind: 'domain', title: '결제', display_en: 'Payments', display_zz: 123 },
    },
  ],
} as unknown as VaultManifest;

describe('display_<locale> 수집·해석', () => {
  it('collects display_<locale> keys onto the stub (non-string values ignored)', () => {
    const d = deriveOntologyFromVault(manifest);
    const node = d.nodes.find((n) => n.id === 'domain:payment');
    expect(node?.displayLocales).toEqual({ en: 'Payments' });
  });

  it('resolves the screen locale at the insight boundary with title fallback', () => {
    const d = deriveOntologyFromVault(manifest);
    const en = derivationToInsight(d, 'en').nodes.find((n) => n.id === 'domain:payment');
    const ko = derivationToInsight(d, 'ko').nodes.find((n) => n.id === 'domain:payment');
    expect(en?.display).toBe('Payments');
    expect(ko?.display).toBe('결제');
  });
});
