import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { partitionReadmeOnlyDomains } from './bootstrap.mjs';

/**
 * Withholding README-only domains — the contract of the discriminating function.
 *
 * Field review 2026-08-08: all 11 README headings landed as domains, producing a
 * star graph with a single relation type (attunegraph). A hand-sewn stopword sieve
 * loses structurally — every new README invents a heading the list does not know —
 * so **corroboration** decides instead: only a domain with code evidence, or one
 * named as a parent by a code-derived candidate, is planted automatically.
 */
describe('partitionReadmeOnlyDomains', () => {
  const d = (slug, source) => ({ slug, title: slug, evidence: { source } });

  it('defers a domain whose only evidence is a README', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/quick-start-from-source', 'README.md')],
      capabilities: [],
      elements: [],
    });
    assert.equal(r.corroborated.length, 0);
    assert.equal(r.readmeOnly.length, 1);
  });

  it('confirms a domain with code-directory evidence', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/auth', 'src/auth')],
      capabilities: [],
      elements: [],
    });
    assert.equal(r.corroborated.length, 1);
    assert.equal(r.readmeOnly.length, 0);
  });

  it('confirms a README domain when a code-backed capability names it as parent', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/typed-api', 'README.md')],
      capabilities: [
        { slug: 'capabilities/query', title: 'Query', domain: 'domains/typed-api', evidence: { source: 'src/query' } },
      ],
      elements: [],
    });
    assert.equal(r.corroborated.length, 1, 'a README-sourced domain named by code is planted');
  });

  it('does not confirm a domain named only by a README-sourced capability', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/typed-api', 'README.md')],
      capabilities: [
        { slug: 'capabilities/query', title: 'Query', domain: 'domains/typed-api', evidence: { source: 'readme.md' } },
      ],
      elements: [],
    });
    assert.equal(r.readmeOnly.length, 1);
  });

  it('treats every readme variant (readme.md, README.rst, README) as README evidence', () => {
    for (const src of ['readme.md', 'README.rst', 'README']) {
      const r = partitionReadmeOnlyDomains({ domains: [d('domains/x', src)], capabilities: [], elements: [] });
      assert.equal(r.readmeOnly.length, 1, src);
    }
  });

  it('does not defer a domain with no evidence at all', () => {
    const r = partitionReadmeOnlyDomains({ domains: [{ slug: 'domains/x', title: 'x' }], capabilities: [], elements: [] });
    assert.equal(r.corroborated.length, 1);
  });
});
