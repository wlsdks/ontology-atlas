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
describe('install-shim puts atlas on PATH without touching foreign files', () => {
  it('writes a one-line launcher that execs the CLI', () => {
    const body = shimBody('/checkout/cli/src/index.mjs');
    // ⚠️ `exec` rather than a wrapper: a wrapper keeps a shell between the person and the process,
    // which swallows signals — Ctrl-C on a long command would look broken.
    assert.match(body, /^#!\/bin\/sh/);
    assert.match(body, /exec node "\/checkout\/cli\/src\/index\.mjs" "\$@"/);
    assert.ok(body.includes(SHIM_SIGNATURE), '--uninstall needs the signature to recognise its own shim');
  });

  /*
   * ⚠️ The falsifier this decision recorded, then met within the hour. A shim whose checkout moved
   * hands the person a Node module-loader stack trace naming neither `atlas` nor the missing folder.
   * One `test -f` turns that into a sentence they can act on.
   */
  it('checks for a missing checkout before exec and prints a sentence', () => {
    const body = shimBody('/checkout/cli/src/index.mjs');
    assert.match(body, /if \[ ! -f/, 'the target is not checked before exec');
    assert.ok(body.includes('/checkout/cli/src/index.mjs'), 'the missing path must be named');
    assert.match(body, /exit 127/, 'a missing checkout must exit non-zero');
    // The check must sit before exec, or it never runs.
    assert.ok(body.indexOf('if [ ! -f') < body.indexOf('exec node'));
  });

  it('handles a path containing spaces', () => {
    const body = shimBody('/Users/dana/My Projects/atlas/cli/src/index.mjs');
    assert.ok(body.includes('"/Users/dana/My Projects/atlas/cli/src/index.mjs"'));
  });

  /*
   * ⚠️ The distinction the safety rests on. Deleting or overwriting a file somebody put there
   * themselves is the worst thing this command could do, so "ours" is decided by a marker we wrote,
   * never by the filename.
   */
  it('tells its own shim from a foreign file by the signature', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shim-'));
    const ours = join(dir, 'ours');
    const theirs = join(dir, 'theirs');
    writeFileSync(ours, shimBody('/checkout/cli/src/index.mjs'));
    writeFileSync(theirs, '#!/bin/sh\necho "my own script"\n');

    assert.equal(inspectTarget(ours).state, 'ours');
    assert.equal(inspectTarget(theirs).state, 'foreign');
    assert.equal(inspectTarget(join(dir, 'nothing-here')).state, 'free');
  });

  it('matches PATH entries exactly, not by shared prefix', () => {
    assert.equal(onPath('/home/d/.local/bin', '/usr/bin:/home/d/.local/bin'), true);
    assert.equal(onPath('/home/d/.local/bin', '/usr/bin:/home/d/.local/bin-extra'), false);
    assert.equal(onPath('/home/d/.local/bin', ''), false);
  });
});
