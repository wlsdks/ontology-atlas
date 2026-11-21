import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseArgs } from './parse-args.mjs';

describe('agent-brief flags', () => {
  it('reads --help anywhere', () => {
    assert.deepEqual(parseArgs(['--json', '-h']), { help: true });
  });

  it('refuses two output formats at once', () => {
    assert.equal(parseArgs(['--json', '--prompt']).error, '--json and --prompt cannot be used together');
  });

  it('refuses --verify-fallbacks with --graph-db-pack', () => {
    assert.equal(
      parseArgs(['--verify-fallbacks', '--graph-db-pack']).error,
      '--verify-fallbacks cannot be used with --graph-db-pack',
    );
  });

  it('pairs --compact with --task in both directions', () => {
    assert.equal(parseArgs(['--compact']).error, '--compact requires --task TEXT');
    assert.equal(parseArgs(['--task', 'fix it']).error, '--task is only valid with --compact');
    assert.equal(
      parseArgs(['--compact', '--task', 'fix it', '--verify-fallbacks']).error,
      '--compact cannot be used with --verify-fallbacks',
    );
    assert.equal(parseArgs(['--compact', '--task', 'fix it']).options.detail, 'compact');
  });

  it('names the flag and the variable when a fallback limit is not a positive integer', () => {
    assert.match(
      parseArgs(['--fallback-timeout-ms', '0']).error,
      /Set --fallback-timeout-ms N or OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N\.$/,
    );
  });
});
