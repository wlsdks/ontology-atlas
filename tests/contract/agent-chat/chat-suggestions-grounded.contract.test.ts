import { describe, expect, it } from 'vitest';

import { resolveStaticVaultSource } from '@/entities/docs-vault';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import { chatSuggestions } from '@/features/acp-session/model/chat-suggestions/chat-suggestions';
import {
  canonicalSlug,
  capabilitiesWithoutDependency,
  codeShapedTitles,
} from '@/features/acp-session/model/chat-suggestions/measured-facts';

/**
 * Locks that next steps still point at things in this folder when they run through the **real
 * vault**: manifest, health and the measured facts, then the rows. The unit tests lock "given these
 * facts, what is offered"; between them lies the data path, and a break there is invisible to both.
 *
 * **Not locked**: how many of each fact our vault has right now. That changes with every vault edit.
 */

const manifest = resolveStaticVaultSource('dogfood').manifest;

function nextStepsForRealVault() {
  const health = computeVaultHealth(manifest.docs);
  const slugByAddress = new Map(manifest.docs.map((doc) => [doc.slug, canonicalSlug(doc)]));
  const facts = {
    islands: health.islands.map((group) => group.map((slug) => slugByAddress.get(slug) ?? slug)),
    withoutDependency: capabilitiesWithoutDependency(manifest.docs),
    codeShaped: codeShapedTitles(manifest.docs),
  };
  return {
    health,
    facts,
    out: chatSuggestions({ nodeCount: health.summary.nodes, ...facts, changedSource: null }),
  };
}

describe('next steps point at this folder even when passed through the real vault', () => {
  it('the check is not idling — the vault to look at exists', () => {
    expect(manifest.docs.length).toBeGreaterThan(50);
    expect(nextStepsForRealVault().health.summary.nodes).toBeGreaterThan(50);
  });

  it('the path does not break — rows or the quiet line always appear, at most three fixes and the check', () => {
    const { out } = nextStepsForRealVault();
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('every slug a request names is a node that exists, and every count matches its fact', () => {
    const { out, facts } = nextStepsForRealVault();
    const known = new Set(manifest.docs.map(canonicalSlug));
    const factFor = {
      dependencies: facts.withoutDependency,
      standAlone: facts.islands.flat(),
      rename: facts.codeShaped,
    } as Record<string, readonly string[] | undefined>;
    for (const row of out) {
      const fact = factFor[row.kind];
      if (!fact) continue;
      expect(row.params.count, row.kind).toBe(new Set(fact).size);
      for (const slug of String(row.params.slugs).split(', ')) {
        expect(known.has(slug), `${row.kind} names "${slug}", which is not in the vault`).toBe(true);
      }
    }
  });

  it('a fact that really exists in our vault surfaces as a row', () => {
    const { out, facts } = nextStepsForRealVault();
    const hasWork = facts.islands.length > 0 || facts.withoutDependency.length > 0 || facts.codeShaped.length > 0;
    expect(out.some((row) => row.kind === 'nothingLeft')).toBe(!hasWork);
  });
});
