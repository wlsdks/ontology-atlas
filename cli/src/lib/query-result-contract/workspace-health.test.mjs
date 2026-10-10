import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertHealthShape,
  assertWorkspaceBriefShape,
  healthResultExitCode,
  workspaceBriefExitCode,
} from './workspace-health.mjs';

describe('workspace-health', () => {
  it('rejects malformed health and workspace_brief payloads before CLI output', () => {
    const health = {
      operation: 'health',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      checks: [{ id: 'compile_issues', status: 'pass', count: 0 }],
    };
    const workspaceBrief = {
      operation: 'workspace_brief',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'warn' }],
      health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      growth: { totalActions: 0 },
    };

    assert.equal(assertHealthShape(health), health);
    assert.equal(assertWorkspaceBriefShape(workspaceBrief), workspaceBrief);
    assert.throws(
      () => assertHealthShape({ ...health, checks: [{ id: 'compile_issues', status: 'pass' }] }),
      /health checks\[0\] has an invalid health-check shape/,
    );
    assert.throws(
      () => assertHealthShape({ ...health, summary: null }),
      /health summary must be an object/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, nextActions: [{ kind: 'cleanup', severity: 'fatal' }] }),
      /workspace_brief nextActions\[0\] has an invalid next-action shape/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, nextActions: [{ id: 'cleanup', severity: 'warn' }] }),
      /workspace_brief nextActions\[0\] has an invalid next-action shape/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, health: { checks: [] } }),
      /workspace_brief health\.checks must be a non-empty array/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, growth: [] }),
      /workspace_brief growth must be an object when present/,
    );
  });

  it('blocks health and workspace_brief results that represent broken gates', () => {
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] }), 0);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'pass', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'needs_attention' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: -1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: '  ', status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fial', count: 0 }] }), 1);

    assert.equal(
      workspaceBriefExitCode({
        status: 'needs_attention',
        nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'warn' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      0,
    );
    assert.equal(
      workspaceBriefExitCode({ status: 'ok', nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({
        status: 'healthy',
        nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'fail' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ health: { checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [] }), 1);
    assert.equal(
      workspaceBriefExitCode({
        nextActions: [{ kind: 'cleanup', severity: 'fatal' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ nextActions: [{ severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [{ id: 'cleanup', severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [{ id: 'cleanup', kind: '  ', severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [], health: { checks: [] } }), 1);
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues' }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'warning' }] } }),
      1,
    );
  });
});
