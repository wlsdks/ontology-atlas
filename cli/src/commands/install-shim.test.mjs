import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { SHIM_SIGNATURE, inspectTarget, onPath, shimBody } from './install-shim.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The two `.claude/rules/surfaces.md` install conditions a test can hold: the contents are exact and
 * printable before writing, and a file this command did not write is never touched.
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
   * A shim whose checkout moved otherwise hands the person a Node loader stack trace naming neither
   * `atlas` nor the missing folder.
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
   * Overwriting a file somebody put there is the worst outcome, so ours is decided by a marker we
   * wrote, never by the filename.
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
