// Never answer "healthy" for a folder with zero nodes.
//
// Why (measured 2026-08-16): running `health` on a folder that is not a vault (one
// `.md`, no frontmatter) returned **`healthy`, exit 0** — because all six checks
// were `pass:0`. Zero cycles, zero unresolved edges, zero disconnected components.
// With nothing to count, everything passes.
//
// That is exactly the failure `/gate-probe` names: **a check idling on an empty set
// is not a check.** And the person receiving that answer loses the chance to
// suspect they pointed at the wrong folder — the tool just said it was fine.
//
// So "is there anything to count" is checked first. Without it, the `pass` of the
// other six proves nothing.

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
    // If this assertion breaks, the check above has not become unnecessary — some
    // other check has started behaving differently on an empty vault, and this is
    // the place to look again.
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
