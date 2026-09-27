// Contract for the CLI write audit-log helper: does recordCliWrite reuse mcp's
// activity-log module to append to the same `.ontology-atlas/activity.jsonl`, does
// it copy the heartbeat agent, and is it best-effort (never throwing on any input).
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recordCliWrite } from './activity-log.mjs';

// Resolve through the declared package dependency instead of escaping into the
// monorepo. This keeps the published CLI's own `npm test` runnable after both
// tarballs are installed in an otherwise empty directory.
const monorepoActivityLogPath = fileURLToPath(
  new URL('../../../mcp/src/activity-log.mjs', import.meta.url),
);
const activityLogModulePath = existsSync(monorepoActivityLogPath)
  ? monorepoActivityLogPath
  : createRequire(import.meta.url).resolve('ontology-atlas-mcp/src/activity-log.mjs');
const { readActivityEntries } = await import(pathToFileURL(activityLogModulePath).href);

function tmpVault() {
  return mkdtempSync(join(tmpdir(), 'cli-activity-log-'));
}

describe('cli activity-log — recordCliWrite (P2-①)', () => {
  it('append writes the MCP activity.jsonl with a cli:-prefixed tool', async () => {
    const root = tmpVault();
    try {
      await recordCliWrite(root, {
        tool: 'cli:relate',
        target: 'capabilities/a',
        summary: 'capabilities/a --depends_on--> capabilities/b',
        why: '쓰기 경로가 b 를 지난다',
      });
      const entries = readActivityEntries(root);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].tool, 'cli:relate');
      assert.equal(entries[0].target, 'capabilities/a');
      assert.equal(entries[0].why, '쓰기 경로가 b 를 지난다');
      assert.equal(entries[0].agent, null);
      assert.equal(entries[0].v, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies the agent from the heartbeat', async () => {
    const root = tmpVault();
    try {
      mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
      writeFileSync(
        join(root, '.ontology-atlas/agent-activity.json'),
        JSON.stringify({ agent: 'claude-code' }),
        'utf-8',
      );
      await recordCliWrite(root, { tool: 'cli:add', target: 'capabilities/x', summary: 'add capability:capabilities/x' });
      const entries = readActivityEntries(root);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].agent, 'claude-code');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accumulates repeated appends in order', async () => {
    const root = tmpVault();
    try {
      await recordCliWrite(root, { tool: 'cli:import', target: 'capabilities/a', summary: 'import capability:capabilities/a' });
      await recordCliWrite(root, { tool: 'cli:import', target: 'elements/b', summary: 'import element:elements/b' });
      const entries = readActivityEntries(root);
      assert.deepEqual(entries.map((e) => e.target), ['capabilities/a', 'elements/b']);
      assert.ok(entries.every((e) => e.tool === 'cli:import'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not throw when the path cannot be appended', async () => {
    // It must still pass silently once the file cannot be created under a missing
    // parent. (Here a file sits where a directory is expected, so mkdir fails.)
    const root = tmpVault();
    try {
      writeFileSync(join(root, '.ontology-atlas'), 'not a directory', 'utf-8');
      await assert.doesNotReject(
        recordCliWrite(root, { tool: 'cli:add', target: 't', summary: 's' }),
      );
      // The call still returns successfully even though no log line was written.
      assert.equal(existsSync(join(root, '.ontology-atlas/activity.jsonl')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
