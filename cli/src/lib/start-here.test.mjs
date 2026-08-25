import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { startHereContext, startHereRows } from './start-here.mjs';

/**
 * Owner, 2026-08-25: *"if we are doing this, make it much better than it is now."* Bare
 * `ontology-atlas` printed all 56 commands — a reference answering a question nobody asked. The
 * person who types the bare command has said they do not know the next word.
 */
describe('start here — 맨손으로 쳤을 때 무엇을 권하는가', () => {
  it('코드 폴더에 온톨로지가 없으면 코드를 읽으라고 먼저 말한다', () => {
    const [first] = startHereRows({ looksLikeCode: true });
    assert.match(first.command, /bootstrap/);
  });

  it('빈 온톨로지 안에서는 채우는 길을 먼저 준다', () => {
    const [first] = startHereRows({ inVault: true, conceptCount: 0 });
    assert.match(first.command, /bootstrap/);
  });

  /*
   * ⚠️ The CLI equivalent of the empty map offering 「browse concepts」. Suggesting a query to
   * somebody with nothing to query sends them to an empty answer they cannot act on.
   */
  it('개념이 0개면 질의를 권하지 않는다', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 0 });
    assert.equal(rows.some((r) => /query|overview|health/.test(r.command)), false);
  });

  it('내용이 있으면 둘러보기와 상태를 준다', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 40 });
    assert.match(rows[0].command, /overview/);
    assert.ok(rows.some((r) => /health/.test(r.command)));
  });

  it('옆에 온톨로지가 있으면 그 경로를 붙여 준다 — 사람이 다시 안 찾게', () => {
    const rows = startHereRows({ nearbyVault: './atlas', conceptCount: 12 });
    assert.ok(rows[0].command.includes('./atlas'));
  });

  it('아직 PATH 에 없으면 그 사실을 마지막에 알려 준다', () => {
    const rows = startHereRows({ inVault: true, conceptCount: 5, shimInstalled: false });
    assert.ok(rows.some((r) => /install-shim/.test(r.command)));
    assert.equal(startHereRows({ inVault: true, conceptCount: 5, shimInstalled: true })
      .some((r) => /install-shim/.test(r.command)), false);
  });

  it('어디에 서 있는지 한 줄로 말한다', () => {
    assert.match(startHereContext({ inVault: true, conceptCount: 0 }), /empty/);
    assert.match(startHereContext({ looksLikeCode: true }), /codebase/);
    assert.match(startHereContext({ nearbyVault: './atlas' }), /\.\/atlas/);
  });

  it('어떤 상황에서도 전체 목록으로 가는 길은 남는다', () => {
    for (const s of [{}, { looksLikeCode: true }, { inVault: true, conceptCount: 9 }]) {
      assert.ok(startHereRows(s).some((r) => r.command.includes('--help')));
    }
  });
});
