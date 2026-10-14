import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  finalizeProjectMeaningReceipt,
  renderProjectCompetencyMarkdown,
} from './project-meaning-receipt.mjs';
import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';
import { assertAgentBriefResponseShape } from '../../cli/src/lib/query-result-contract/agent-brief/agent-brief.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = join(here, 'project-meaning-receipt.mjs');

const graphHash = 'project-graph-v1:deadbeef';
const sourceFingerprint = 'source-fingerprint-a';

const projectBody = `## Definition

Synthetic checkout used only for the restart contract.

## Competency answers

### scope — answered

What product/system outcome and user problem define the ontology scope?

The project enables a bounded checkout outcome.

- Concepts: \`demo\`
- Evidence: \`README.md\`

### domains — answered

Which stable business responsibilities or decision boundaries form its domains?

Payments owns the charging boundary.

- Concepts: \`domains/payments\`
- Relations: \`demo\` --contains--> \`domains/payments\`
- Evidence: \`README.md\`

### abilities — answered

Which observable abilities realize those outcomes inside each domain?

Charge realizes the payment outcome.

- Concepts: \`capabilities/charge\`
- Relations: \`domains/payments\` --contains--> \`capabilities/charge\`
- Evidence: \`src/charge.mjs\`

### evidence — answered

Which source artifacts provide implementation evidence for each ability?

The charge module is the implementation entrypoint.

- Concepts: \`capabilities/charge\`
- Evidence: \`src/charge.mjs\`
- Paths: \`src/charge.mjs\`

### impact — answered

Which typed dependencies explain change impact across the model?

Checkout depends on charging.

- Concepts: \`capabilities/checkout\`, \`capabilities/charge\`
- Relations: \`capabilities/checkout\` --depends_on--> \`capabilities/charge\`
- Evidence: \`src/checkout.mjs\`
`;

const inventory = {
  contract: 'meaningWitnessInventory:v1',
  graphHash,
  sourceFingerprint,
  concepts: [
    'demo',
    'domains/payments',
    'capabilities/charge',
    'capabilities/checkout',
  ],
  relations: [
    { from: 'demo', to: 'domains/payments', type: 'contains' },
    { from: 'domains/payments', to: 'capabilities/charge', type: 'contains' },
    { from: 'capabilities/checkout', to: 'capabilities/charge', type: 'depends_on' },
  ],
  evidence: ['README.md', 'src/charge.mjs', 'src/checkout.mjs'],
  paths: ['src/charge.mjs'],
};

const source = {
  status: 'verified_current',
  currentness: 'current',
  topGapId: null,
  receiptContractVersion: 1,
  graphHash,
  sourceId: 'source-a',
  sourceRevision: 'revision-a',
  sourceFingerprint,
  measuredAt: '2026-08-02T00:00:00.000Z',
};

test('a fresh Node process re-derives the same current meaning without source re-analysis', () => {
  const vaultRoot = mkdtempSync(join(tmpdir(), 'atlas-meaning-restart-'));
  try {
    const finalized = finalizeProjectMeaningReceipt({
      vaultRoot,
      projectSlug: 'demo',
      projectBody,
      graphHash,
      sourceFingerprint,
      measuredAt: '2026-08-02T00:00:01.000Z',
    });
    assert.equal(finalized.version, 1);

    const inputPath = join(vaultRoot, 'restart-input.json');
    writeFileSync(inputPath, JSON.stringify({
      vaultRoot,
      projectSlug: 'demo',
      projectBody,
      graphHash,
      structure: { status: 'ready' },
      source,
      inventory,
    }));
    const program = `
      import { readFileSync } from 'node:fs';
      import { readProjectMeaningAssessment } from ${JSON.stringify(modulePath)};
      const input = JSON.parse(readFileSync(process.argv[1], 'utf8'));
      process.stdout.write(JSON.stringify(readProjectMeaningAssessment(input)));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', program, inputPath], {
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.status, 'verified_current');
    assert.equal(result.provenance.graphHash, graphHash);
    assert.equal(JSON.stringify(result).includes(vaultRoot), false);
    assert.equal(JSON.stringify(result).includes(projectBody), false);

    const stored = readFileSync(join(vaultRoot, '.ontology-atlas/project-meaning.json'), 'utf8');
    assert.equal(stored.includes(projectBody), false);
    assert.equal(stored.includes('bounded checkout outcome'), false);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});

test('fresh MCP readers keep edited answers unconfirmed until explicit finalization', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-meaning-recovery-'));
  const vaultRoot = join(root, 'vault');
  const sourceRoot = join(root, 'source');
  const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, 'index.js');
  const call = async (calls) => {
    const { responses } = await runJsonRpcProcess({
      command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
      env: { ...process.env, OATLAS_VAULT: vaultRoot, OATLAS_REPO_ROOT: sourceRoot },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
          protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'receipt-recovery-test', version: '1' },
        } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ...calls.map(([name, args], index) => ({
          jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name, arguments: args },
        })),
      ],
    });
    return calls.map((_, index) => {
      const response = responses.find(({ id }) => id === index + 2);
      assert.ok(response?.result && !response.result.isError, JSON.stringify(response));
      return response.result.structuredContent ?? JSON.parse(response.result.content[0].text);
    });
  };
  try {
    for (const directory of [vaultRoot, join(vaultRoot, 'domains'), join(vaultRoot, 'capabilities'), sourceRoot]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(sourceRoot, 'README.md'), '# Receipt recovery fixture\n');
    writeFileSync(join(sourceRoot, 'charge.mjs'), 'export function charge() { return 1; }\n');
    const answers = renderProjectCompetencyMarkdown(Object.fromEntries(
      ['scope', 'domains', 'abilities', 'evidence', 'impact'].map((id) => [id, {
        status: 'partial', answer: `The ${id} claim needs review.`, gap: 'The fixture does not accept this claim.',
        witnesses: { concepts: [], relations: [], evidence: [], paths: [] },
      }]),
    ));
    const documents = [
      ['demo', 'kind: project\ntitle: Demo\ndomains: [domains/payments]\npath: README.md', `## Definition\n\nA bounded payment fixture.\n\n${answers}`],
      ['domains/payments', 'kind: domain\ntitle: Payments\ncapabilities: [capabilities/charge]', 'Payments owns charging.'],
      ['capabilities/charge', 'kind: capability\ntitle: Charge\ndomain: domains/payments\npath: charge.mjs', 'Charges one payment.'],
    ];
    for (const [index, [slug, fields, body]] of documents.entries()) {
      writeFileSync(join(vaultRoot, `${slug}.md`), `---\nuid: 00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}\nslug: ${slug}\n${fields}\n---\n\n${body}\n`);
    }
    const projectPath = join(vaultRoot, 'demo.md');
    const receiptPath = join(vaultRoot, '.ontology-atlas/project-meaning.json');
    const [bound] = await call([['connect_project_source', { projectSlug: 'demo', rootPath: sourceRoot, confirm: true }]]);
    assert.equal(bound.projectSource.currentness, 'current');
    const [initial] = await call([['finalize_project_meaning', { projectSlug: 'demo', expected_mtime: statSync(projectPath).mtimeMs }]]);
    assert.equal(initial.meaningAssessment.status, 'needs_evidence');
    const receiptBefore = readFileSync(receiptPath, 'utf8');
    const edited = readFileSync(projectPath, 'utf8').replace('A bounded payment fixture.', 'A revised bounded payment fixture.');
    writeFileSync(projectPath, edited);
    const [health, workspace, full, compact] = await call([
      ['query_ontology', { operation: 'health' }],
      ['query_ontology', { operation: 'workspace_brief' }],
      ['query_ontology', { operation: 'agent_brief', project: 'demo' }],
      ['query_ontology', { operation: 'agent_brief', project: 'demo', detail: 'compact', task: 'Review payment evidence' }],
    ]);
    assertAgentBriefResponseShape(full);
    assertAgentBriefResponseShape(compact);
    for (const assessment of [full.meaningAssessment, compact.currentness.meaning]) {
      assert.equal(assessment.status, 'review_required');
      assert.equal(assessment.topGap.id, 'competency_body_changed');
      assert.equal(assessment.nextAction.id, 'reevaluate_competency');
    }
    assert.equal(full.projectSource.currentness, 'current');
    assert.equal(health.status, 'needs_attention');
    assert.equal(workspace.status, 'needs_attention');
    for (const checks of [health.checks, workspace.health.checks]) {
      assert.equal(checks.find(({ id }) => id === 'meaning_assessment').status, 'warn');
    }
    assert.equal(readFileSync(receiptPath, 'utf8'), receiptBefore);
    assert.equal(readFileSync(projectPath, 'utf8'), edited);
    assert.equal(JSON.stringify(full.meaningAssessment).includes(sourceRoot), false);
    const [finalized] = await call([['finalize_project_meaning', { projectSlug: 'demo', expected_mtime: statSync(projectPath).mtimeMs }]]);
    assert.equal(finalized.meaningAssessment.status, 'needs_evidence');
    const [after] = await call([['query_ontology', { operation: 'agent_brief', project: 'demo' }]]);
    assert.equal(after.meaningAssessment.topGap.id, 'competency_question_incomplete');
    assert.equal(after.meaningAssessment.status, 'needs_evidence');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
