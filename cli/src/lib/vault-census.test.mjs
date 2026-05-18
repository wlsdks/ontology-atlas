import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getVaultCensus, writeVaultCensus } from './vault-census.mjs';

describe('vault-census', () => {
  it('returns the list_kinds census payload from the MCP wrapper', async () => {
    const calls = [];
    const census = { total: 3, byKind: { project: 1, capability: 2 } };

    const result = await getVaultCensus('/tmp/vault', {
      call: async (...args) => {
        calls.push(args);
        return census;
      },
    });

    assert.equal(result, census);
    assert.deepEqual(calls, [['/tmp/vault', 'list_kinds', {}]]);
  });

  it('returns null for malformed payloads or MCP failures', async () => {
    assert.equal(
      await getVaultCensus('/tmp/vault', {
        call: async () => ({ total: '3', byKind: { project: 1 } }),
      }),
      null,
    );
    assert.equal(
      await getVaultCensus('/tmp/vault', {
        call: async () => {
          throw new Error('spawn failed');
        },
      }),
      null,
    );
  });

  it('prints a compact hierarchy-ordered census line', () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    try {
      writeVaultCensus({
        total: 4,
        byKind: {
          capability: 2,
          project: 1,
          document: 1,
          domain: 0,
        },
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(writes.join(''), /vault now has \x1b\[1m4\x1b\[0m/);
    assert.match(writes.join(''), /project=1 · capability=2 · document=1/);
  });

  it('does not write when census is absent', () => {
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    try {
      writeVaultCensus(null);
      writeVaultCensus({ total: '4', byKind: { project: 1 } });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.deepEqual(writes, []);
  });
});
