import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  writeCycleVault,
  writeDanglingVault,
  writeDisconnectedVault,
} from './smoke-vault-fixtures.mjs';

const CLI = resolve(fileURLToPath(new URL('../../cli/src/index.mjs', import.meta.url)));

function cliJson(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: result.status, payload: JSON.parse(result.stdout) };
}

describe('packed-CLI smoke fixture vaults, read by the source CLI', () => {
  let temp;
  before(() => {
    temp = mkdtempSync(join(tmpdir(), 'smoke-fixture-vaults-'));
  });
  after(() => rmSync(temp, { recursive: true, force: true }));

  it('the cycle vault holds exactly one dependency cycle and fails the cycles gate', () => {
    const vault = join(temp, 'cycle');
    writeCycleVault(vault);
    const { status, payload } = cliJson(['cycles', vault, '--json']);
    assert.equal(status, 1);
    assert.equal(payload.totalCycles, 1);
  });

  it('the dangling vault has one issue and one unresolved edge', () => {
    const vault = join(temp, 'dangling');
    writeDanglingVault(vault);
    const { status, payload } = cliJson(['compile', vault, '--json']);
    assert.equal(status, 1);
    assert.equal(payload.summary.issues, 1);
    assert.equal(payload.summary.unresolvedEdges, 1);
  });

  it('the disconnected vault has no path between its two capabilities', () => {
    const vault = join(temp, 'disconnected');
    writeDisconnectedVault(vault);
    const { status, payload } = cliJson(['path', 'capabilities/a', 'capabilities/b', vault, '--json']);
    assert.equal(status, 1);
    assert.equal(payload.found, false);
  });
});
