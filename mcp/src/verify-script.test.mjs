import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  diagnosisBlockingFailure,
  validateVaultFailure,
  vaultWarningsFailure,
} from '../scripts/verify.mjs';

describe('verify.mjs first-contact gates', () => {
  it('accepts clean list_concepts payloads', () => {
    assert.equal(vaultWarningsFailure({ total: 1 }), null);
    assert.equal(vaultWarningsFailure({ vaultWarnings: { errorCount: 0, warningCount: 0 } }), null);
  });

  it('fails when list_concepts reports vault warnings', () => {
    assert.equal(
      vaultWarningsFailure({ vaultWarnings: { errorCount: 1, warningCount: 2 } }),
      'list_concepts vaultWarnings present — errors 1, warnings 2',
    );
  });

  it('accepts clean validate_vault payloads', () => {
    assert.equal(validateVaultFailure({ summary: { problemFiles: 0 } }), null);
  });

  it('fails when validate_vault reports problem files', () => {
    assert.equal(
      validateVaultFailure({ summary: { problemFiles: 2, errorFiles: 1, warningFiles: 1 } }),
      'validate_vault found 2 problem file(s) — errors 1, warnings 1',
    );
  });

  it('fails malformed validate_vault payloads', () => {
    assert.equal(validateVaultFailure({}), 'validate_vault response missing summary');
  });

  it('accepts healthy first-contact diagnosis responses', () => {
    assert.equal(
      diagnosisBlockingFailure('health', { operation: 'health', status: 'healthy' }, 'health'),
      null,
    );
  });

  it('accepts advisory needs_attention diagnosis responses', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'needs_attention',
          checks: [{ id: 'relation_recommendations', status: 'warn' }],
        },
        'health',
      ),
      null,
    );
  });

  it('fails unexpected diagnosis operations', () => {
    assert.equal(
      diagnosisBlockingFailure('health', { operation: 'workspace_brief', status: 'healthy' }, 'health'),
      'health returned unexpected operation: workspace_brief',
    );
  });

  it('fails diagnosis responses with failing health checks', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          health: { checks: [{ id: 'dependency_cycles', status: 'fail' }] },
        },
        'workspace_brief',
      ),
      'workspace_brief has failing health checks: dependency_cycles',
    );
  });
});
