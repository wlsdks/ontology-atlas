import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dogfoodQueryExitCode, runDogfoodQuery } from './dogfood-query.mjs';

const writer = () => {
  const chunks = [];
  return { chunks, write: (text) => chunks.push(text) };
};

describe('dogfood query', () => {
  it('fails health on any failed check or a status short of healthy', () => {
    assert.equal(dogfoodQueryExitCode('health', { status: 'healthy', checks: [{ status: 'pass' }] }), 0);
    assert.equal(dogfoodQueryExitCode('health', { status: 'healthy', checks: [{ status: 'fail' }] }), 1);
    assert.equal(dogfoodQueryExitCode('health', { status: 'needs_attention', checks: [{ status: 'warn' }] }), 1);
    assert.equal(dogfoodQueryExitCode('health', { status: 'healthy', checks: [] }), 1);
  });

  it('fails the agent brief unless it is healthy and ready, and never fails a plan', () => {
    assert.equal(dogfoodQueryExitCode('agent-brief', { status: 'healthy', readiness: { status: 'ready' } }), 0);
    assert.equal(dogfoodQueryExitCode('agent-brief', { status: 'healthy', readiness: { status: 'needs_shape' } }), 1);
    assert.equal(dogfoodQueryExitCode('growth', {}), 0);
  });

  it('asks the server for the named check and prints JSON only when asked', async () => {
    const calls = [];
    const stdout = writer();
    const exitCode = await runDogfoodQuery(['--', 'workspace-brief', '--json'], {
      call: async (vault, tool, args) => {
        calls.push({ vault, tool, args });
        return { status: 'healthy', nextActions: [], health: { checks: [{ status: 'pass' }] } };
      },
      stdout,
      stderr: writer(),
    });
    assert.equal(exitCode, 0);
    assert.match(calls[0].vault, /docs\/ontology$/);
    assert.deepEqual([calls[0].tool, calls[0].args], ['query_ontology', { operation: 'workspace_brief' }]);
    assert.equal(JSON.parse(stdout.chunks.join('')).status, 'healthy');
  });

  it('rejects an unknown check before calling the server', async () => {
    const stderr = writer();
    const exitCode = await runDogfoodQuery(['agent-fallbacks'], {
      call: async () => assert.fail('must not call the server'),
      stdout: writer(),
      stderr,
    });
    assert.equal(exitCode, 2);
    assert.match(stderr.chunks.join(''), /usage: .*compile\|health\|workspace-brief\|agent-brief\|growth\|maintenance/);
  });
});
