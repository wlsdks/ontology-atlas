import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advisoryNextActionsSummary,
  diagnosisBlockingFailure,
  diagnosisIssueCount,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  EXPECTED_WRITE_TOOLS,
  expectedToolSplitLabel,
  firstContactErrorFailure,
  hasAllFirstContactResponses,
  hasFirstContactErrorResponse,
  parseVerifyTimeoutMs,
  serverStartupFailure,
  validateVaultFailure,
  verifyTimeoutFailure,
  vaultWarningsFailure,
} from '../scripts/verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

describe('verify.mjs first-contact gates', () => {
  it('keeps package metadata tool count aligned with verify inventory', () => {
    const described = MCP_PKG.description.match(/(\d+) tools \((\d+) read \+ (\d+) write\)/);
    assert.ok(described, 'package description must include tool count and read/write split');
    assert.equal(described[1], String(EXPECTED_TOOLS.length));
    assert.equal(described[2], String(EXPECTED_READ_TOOLS.length));
    assert.equal(described[3], String(EXPECTED_WRITE_TOOLS.length));
    assert.equal(expectedToolSplitLabel(), `${described[2]} read + ${described[3]} write`);
  });

  it('parses verify timeout env as a strict positive integer', () => {
    assert.equal(parseVerifyTimeoutMs(undefined), 8000);
    assert.equal(parseVerifyTimeoutMs(''), 8000);
    assert.equal(parseVerifyTimeoutMs('15000'), 15000);
  });

  it('rejects partial or non-positive verify timeout env values', () => {
    assert.equal(parseVerifyTimeoutMs('1000ms'), false);
    assert.equal(parseVerifyTimeoutMs('0'), false);
    assert.equal(parseVerifyTimeoutMs('-1'), false);
    assert.equal(parseVerifyTimeoutMs('nope'), false);
  });

  it('formats actionable timeout failures', () => {
    assert.equal(
      verifyTimeoutFailure(1),
      'server verify timed out after 1ms. Increase OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.',
    );
  });

  it('formats startup failures before initialize separately from timeouts', () => {
    assert.equal(serverStartupFailure('Vault root not found'), 'server failed before initialize. stderr: Vault root not found');
    assert.equal(serverStartupFailure(''), 'no initialize response');
  });

  it('detects when all first-contact JSON-RPC responses arrived', () => {
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5, 6]
          .map((id) => JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
          .join('\n'),
      ),
      true,
    );
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5].map((id) => JSON.stringify({ jsonrpc: '2.0', id, result: {} })).join('\n'),
      ),
      false,
    );
  });

  it('detects first-contact JSON-RPC error responses before timeout', () => {
    const stdout = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'vault failed' } }),
    ].join('\n');
    assert.equal(hasFirstContactErrorResponse(stdout), true);
    assert.equal(
      firstContactErrorFailure({ id: 3, error: { message: 'vault failed' } }),
      'list_concepts returned JSON-RPC error: vault failed',
    );
  });

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

  it('fails malformed list_concepts vaultWarnings payloads', () => {
    assert.equal(vaultWarningsFailure({ vaultWarnings: [] }), 'list_concepts vaultWarnings malformed');
    assert.equal(
      vaultWarningsFailure({ vaultWarnings: { warningCount: 0 } }),
      'list_concepts vaultWarnings missing errorCount',
    );
    assert.equal(
      vaultWarningsFailure({ vaultWarnings: { errorCount: 0 } }),
      'list_concepts vaultWarnings missing warningCount',
    );
  });

  it('accepts clean validate_vault payloads', () => {
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} } }), null);
  });

  it('fails when validate_vault reports problem files', () => {
    assert.equal(
      validateVaultFailure({ scanned: 3, summary: { problemFiles: 2, errorFiles: 1, warningFiles: 1, byCode: {} } }),
      'validate_vault found 2 problem file(s) — errors 1, warnings 1',
    );
  });

  it('fails malformed validate_vault payloads', () => {
    assert.equal(validateVaultFailure({ summary: { problemFiles: 0 } }), 'validate_vault response missing scanned count');
    assert.equal(validateVaultFailure({ scanned: -1, summary: { problemFiles: 0 } }), 'validate_vault response missing scanned count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: {} }), 'validate_vault response missing problemFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: -1 } }), 'validate_vault response missing problemFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, warningFiles: 0 } }), 'validate_vault response missing errorFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: -1, warningFiles: 0 } }), 'validate_vault response missing errorFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0 } }), 'validate_vault response missing warningFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: -1 } }), 'validate_vault response missing warningFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0 } }), 'validate_vault response missing byCode aggregate');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: [] } }), 'validate_vault response missing byCode aggregate');
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

  it('reads health issue count from the current health summary shape', () => {
    assert.equal(diagnosisIssueCount({ summary: { issues: 3 } }), 3);
    assert.equal(diagnosisIssueCount({ summary: { compileIssues: 2 } }), 2);
    assert.equal(diagnosisIssueCount({ summary: {} }), 0);
  });

  it('formats non-blocking workspace brief next actions for verify output', () => {
    assert.equal(advisoryNextActionsSummary(null), null);
    assert.equal(
      advisoryNextActionsSummary([
        { id: 'compile_issues', severity: 'warn' },
        { kind: 'add_missing_relations', severity: 'warn' },
        { kind: 'materialize_external_elements', severity: 'info' },
        { kind: 'resolve_dangling_references', severity: 'fail' },
      ]),
      'compile_issues:warn, add_missing_relations:warn, materialize_external_elements:info',
    );
    assert.equal(
      advisoryNextActionsSummary([
        { kind: 'a', severity: 'info' },
        { kind: 'b', severity: 'warn' },
        { kind: 'c', severity: 'info' },
        { kind: 'd', severity: 'warn' },
      ], 2),
      'a:info, b:warn, +2 more',
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

  it('accepts workspace_brief responses with warn next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          nextActions: [
            { kind: 'health_check', severity: 'warn', id: 'compile_issues' },
            { kind: 'add_missing_relations', severity: 'warn', count: 2 },
          ],
        },
        'workspace_brief',
      ),
      null,
    );
  });

  it('fails workspace_brief responses with fail next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          nextActions: [
            { kind: 'health_check', severity: 'info', id: 'components' },
            { kind: 'resolve_dangling_references', severity: 'fail', count: 1 },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief has actionable nextActions: resolve_dangling_references',
    );
  });
});
