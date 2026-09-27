import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { startHereContext, startHereRows } from './start-here.mjs';

describe('start here suggestions for a bare invocation', () => {
  it('suggests reading the code first in a code folder without an ontology', () => {
    const [first] = startHereRows({ looksLikeCode: true });
    assert.match(first.command, /bootstrap/);
  });

  it('suggests filling an empty ontology first', () => {
    const [first] = startHereRows({ inVault: true, conceptCount: 0 });
    assert.match(first.command, /bootstrap/);
  });

  /*
   * Suggesting a query to somebody with nothing to query sends them to an empty answer.
   */
  it('does not suggest queries with zero concepts', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 0 });
    assert.equal(rows.some((r) => /query|overview|health/.test(r.command)), false);
  });

  it('suggests overview and health for a populated vault', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 40 });
    assert.match(rows[0].command, /overview/);
    assert.ok(rows.some((r) => /health/.test(r.command)));
  });

  it('includes the path of a neighbouring ontology', () => {
    const rows = startHereRows({ nearbyVault: './atlas', conceptCount: 12 });
    assert.ok(rows[0].command.includes('./atlas'));
  });

  it('mentions last when atlas is not on PATH', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 5, shimInstalled: false });
    assert.ok(rows.some((r) => /install-shim/.test(r.command)));
    assert.equal(startHereRows({ inVault: true, conceptCount: 5, shimInstalled: true })
      .some((r) => /install-shim/.test(r.command)), false);
  });

  it('states the current location in one line', () => {
    assert.match(startHereContext({ inVault: true, conceptCount: 0 }), /empty/);
    assert.match(startHereContext({ looksLikeCode: true }), /codebase/);
    assert.match(startHereContext({ nearbyVault: './atlas' }), /\.\/atlas/);
  });

  it('always keeps the path to the full command list', () => {
    for (const s of [{}, { looksLikeCode: true }, { inVault: true, conceptCount: 9 }]) {
      assert.ok(startHereRows(s).some((r) => r.command.includes('--help')));
    }
  });
});
