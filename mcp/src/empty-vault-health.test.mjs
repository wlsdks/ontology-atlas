// Zero nodes is never "healthy": every check passes vacuously on an empty set
// (`/gate-probe`), and the person loses the hint they opened the wrong folder.
// "Is there anything to count" is checked first.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

function health(docs) {
  return queryCompiledOntology(compileOntology(docs, { includeIndexes: true }), {
    operation: 'health',
  });
}

const node = (slug, frontmatter) => ({
  slug,
  frontmatter: { uid: '00000000-0000-4000-8000-000000000001', ...frontmatter },
  body: '',
  mtime: 1,
});

describe('does not report an empty vault as healthy', () => {
  it('zero nodes is not `healthy`', () => {
    const result = health([]);
    assert.equal(result.summary.nodes, 0);
    assert.notEqual(result.status, 'healthy');
  });

  it('names the reason in one check so a person knows what to do', () => {
    const check = health([]).checks.find((c) => c.id === 'vault_present');
    assert.ok(check);
    assert.equal(check.status, 'fail');
    assert.match(check.message, /폴더|folder|vault/i);
  });

  it('pins that the other checks pass vacuously on an empty set', () => {
    // If this breaks, another check changed its empty-vault behaviour; look there.
    const others = health([]).checks.filter((c) => c.id !== 'vault_present');
    assert.ok(others.length >= 5);
    assert.deepEqual(
      [...new Set(others.map((c) => c.status))],
      ['pass'],
      'with no nodes every other check has nothing to count and passes',
    );
  });

  it('passes with at least one node, since a check that always fails is no check', () => {
    const result = health([node('domains/auth', { kind: 'domain', title: 'Auth' })]);
    const check = result.checks.find((c) => c.id === 'vault_present');
    assert.equal(check.status, 'pass');
    assert.equal(check.count, 1);
  });
});
