import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  finalizeProjectMeaningReceipt,
} from './project-meaning-receipt.mjs';

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
