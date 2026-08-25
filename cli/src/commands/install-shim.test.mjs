import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { SHIM_SIGNATURE, inspectTarget, onPath, shimBody } from './install-shim.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Owner, 2026-08-25: *"make `atlas` take you in… but no npm yet."* A name in `package.json` only
 * becomes a command through an install, and publishing is forbidden until asked — so the CLI writes
 * its own one-line launcher into a directory the person owns.
 *
 * `.claude/rules/surfaces.md` allows installing a command only under four conditions, and the two a
 * test can hold are here: the contents are exact and printable before writing, and a file this
 * command did not write is never touched.
 */
describe('install-shim — atlas 를 PATH 에 올리되, 남의 것은 건드리지 않는다', () => {
  it('한 줄짜리 실행기이고, exec 로 프로세스를 넘긴다', () => {
    const body = shimBody('/checkout/cli/src/index.mjs');
    // ⚠️ `exec` rather than a wrapper: a wrapper keeps a shell between the person and the process,
    // which swallows signals — Ctrl-C on a long command would look broken.
    assert.match(body, /^#!\/bin\/sh/);
    assert.match(body, /exec node "\/checkout\/cli\/src\/index\.mjs" "\$@"/);
    assert.ok(body.includes(SHIM_SIGNATURE), '표식이 없으면 --uninstall 이 자기 것을 못 알아본다');
  });

  /*
   * ⚠️ The falsifier this decision recorded, then met within the hour. A shim whose checkout moved
   * hands the person a Node module-loader stack trace naming neither `atlas` nor the missing folder.
   * One `test -f` turns that into a sentence they can act on.
   */
  it('체크아웃이 사라졌을 때를 먼저 확인한다 — 스택 트레이스가 아니라 문장을 준다', () => {
    const body = shimBody('/checkout/cli/src/index.mjs');
    assert.match(body, /if \[ ! -f/, 'exec 전에 대상 존재를 확인하지 않는다');
    assert.ok(body.includes('/checkout/cli/src/index.mjs'), '없어진 경로를 사람에게 말해야 한다');
    assert.match(body, /exit 127/, '실패를 성공으로 보고하면 스크립트가 조용히 잘못 흘러간다');
    // The check must sit before exec, or it never runs.
    assert.ok(body.indexOf('if [ ! -f') < body.indexOf('exec node'));
  });

  it('경로에 공백이 있어도 깨지지 않는다', () => {
    const body = shimBody('/Users/dana/My Projects/atlas/cli/src/index.mjs');
    assert.ok(body.includes('"/Users/dana/My Projects/atlas/cli/src/index.mjs"'));
  });

  /*
   * ⚠️ The distinction the safety rests on. Deleting or overwriting a file somebody put there
   * themselves is the worst thing this command could do, so "ours" is decided by a marker we wrote,
   * never by the filename.
   */
  it('우리가 쓴 것과 남의 것을 표식으로 가른다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shim-'));
    const ours = join(dir, 'ours');
    const theirs = join(dir, 'theirs');
    writeFileSync(ours, shimBody('/checkout/cli/src/index.mjs'));
    writeFileSync(theirs, '#!/bin/sh\necho "my own script"\n');

    assert.equal(inspectTarget(ours).state, 'ours');
    assert.equal(inspectTarget(theirs).state, 'foreign');
    assert.equal(inspectTarget(join(dir, 'nothing-here')).state, 'free');
  });

  it('PATH 에 있는지 정확히 본다 — 접두사가 같다고 같은 폴더가 아니다', () => {
    assert.equal(onPath('/home/d/.local/bin', '/usr/bin:/home/d/.local/bin'), true);
    assert.equal(onPath('/home/d/.local/bin', '/usr/bin:/home/d/.local/bin-extra'), false);
    assert.equal(onPath('/home/d/.local/bin', ''), false);
  });
});
