import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PROJECT_MEANING_RECEIPT_VERSION,
  PROJECT_MEANING_STATE_RELATIVE_PATH,
  finalizeProjectMeaningReceipt,
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
  renderProjectCompetencyMarkdown,
} from './project-meaning-receipt.mjs';

const GRAPH_HASH = 'project-graph-v1:1234abcd';
const SOURCE_FINGERPRINT = 'source-fingerprint:v1';
const MEASURED_AT = '2026-08-02T06:00:00.000Z';

function competencyBody(overrides = {}) {
  const rows = {
    scope: {
      answer: 'The project helps a user understand one product system.',
      witnesses: ['- Concepts: `projects/demo`', '- Evidence: `README.md`'],
    },
    domains: {
      answer: 'The product domain owns the workbench boundary.',
      witnesses: [
        '- Concepts: `domains/product`',
        '- Relations: `projects/demo` --contains--> `domains/product`',
        '- Evidence: `README.md`',
      ],
    },
    abilities: {
      answer: 'The workbench capability realizes that responsibility.',
      witnesses: [
        '- Concepts: `capabilities/workbench`',
        '- Relations: `domains/product` --contains--> `capabilities/workbench`',
        '- Evidence: `src/workbench.ts`',
      ],
    },
    evidence: {
      answer: 'The workbench module is the implementation entrypoint.',
      witnesses: [
        '- Concepts: `capabilities/workbench`',
        '- Evidence: `src/workbench.ts`',
        '- Paths: `src/workbench.ts`',
      ],
    },
    impact: {
      answer: 'The workbench depends on the project boundary.',
      witnesses: [
        '- Concepts: `capabilities/workbench`',
        '- Relations: `capabilities/workbench` --depends_on--> `projects/demo`',
        '- Evidence: `src/workbench.ts`',
      ],
    },
    ...overrides,
  };
  const questions = {
    scope: 'What product/system outcome and user problem define the ontology scope?',
    domains: 'Which stable business responsibilities or decision boundaries form its domains?',
    abilities: 'Which observable abilities realize those outcomes inside each domain?',
    evidence: 'Which source artifacts provide implementation evidence for each ability?',
    impact: 'Which typed dependencies explain change impact across the model?',
  };
  return `# Demo\n\n## Competency answers\n\n${Object.entries(rows).map(([id, row]) => [
    `### ${id} — ${row.status ?? 'answered'}`,
    '',
    questions[id] ?? 'Unknown question?',
    '',
    row.answer,
    '',
    ...row.witnesses,
    ...(row.gap ? [`- Gap: ${row.gap}`] : []),
  ].join('\n')).join('\n\n')}\n`;
}

function inventory(overrides = {}) {
  return {
    contract: 'meaningWitnessInventory:v1',
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    concepts: [
      'projects/demo',
      'domains/product',
      'capabilities/workbench',
    ],
    relations: [
      { from: 'projects/demo', to: 'domains/product', type: 'contains' },
      { from: 'domains/product', to: 'capabilities/workbench', type: 'contains' },
      { from: 'capabilities/workbench', to: 'projects/demo', type: 'depends_on' },
    ],
    evidence: ['README.md', 'src/workbench.ts'],
    paths: ['src/workbench.ts'],
    ...overrides,
  };
}

function source(overrides = {}) {
  return {
    status: 'verified_current',
    currentness: 'current',
    receiptContractVersion: 1,
    graphHash: GRAPH_HASH,
    sourceId: 'git:demo',
    sourceRevision: 'abc123',
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
    topGapId: null,
    ...overrides,
  };
}

function withVault(run) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-project-meaning-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('parses the deterministic five-section competency Markdown', () => {
  const parsed = parseProjectCompetencyMarkdown(competencyBody());

  assert.equal(parsed.questions.length, 5);
  assert.deepEqual(parsed.questions[0], {
    id: 'scope',
    status: 'answered',
    answer: 'The project helps a user understand one product system.',
    witnesses: {
      concepts: ['projects/demo'],
      relations: [],
      evidence: ['README.md'],
      paths: [],
    },
    unresolvedWitnesses: [],
  });
  assert.deepEqual(parsed.questions[4].witnesses.relations, [
    { from: 'capabilities/workbench', to: 'projects/demo', type: 'depends_on' },
  ]);
});

test('canonical competency Markdown renderer round-trips through the strict parser', () => {
  const parsed = parseProjectCompetencyMarkdown(competencyBody());
  const answers = Object.fromEntries(parsed.questions.map((row) => [row.id, {
    answer: row.answer,
    status: row.status,
    witnesses: row.witnesses,
    ...(row.gap === undefined ? {} : { gap: row.gap }),
  }]));
  const rendered = renderProjectCompetencyMarkdown(answers);

  assert.equal(rendered.startsWith('## Competency answers\n\n### scope — answered'), true);
  assert.deepEqual(parseProjectCompetencyMarkdown(rendered), parsed);
});

test('finalize persists only provenance and a fresh reader re-derives verified current', () => withVault((root) => {
  const body = competencyBody();
  const receipt = finalizeProjectMeaningReceipt({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  });

  assert.equal(receipt.version, PROJECT_MEANING_RECEIPT_VERSION);
  const state = JSON.parse(readFileSync(join(root, PROJECT_MEANING_STATE_RELATIVE_PATH), 'utf8'));
  assert.deepEqual(Object.keys(state).sort(), ['receipts', 'version']);
  assert.equal(state.version, PROJECT_MEANING_RECEIPT_VERSION);
  assert.equal(state.receipts.length, 1);
  const persisted = state.receipts[0];
  assert.deepEqual(Object.keys(persisted).sort(), [
    'bodyDigest',
    'evaluator',
    'graphHash',
    'markdownContract',
    'measuredAt',
    'projectSlug',
    'sourceFingerprint',
    'version',
  ]);
  assert.equal(JSON.stringify(persisted).includes('The project helps'), false);

  const assessment = readProjectMeaningAssessment({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    structure: { status: 'ready' },
    source: source(),
    inventory: inventory(),
  });

  assert.equal(assessment.status, 'verified_current');
  assert.equal(assessment.dimensions.competency.status, 'answered');
}));

test('body digest binds the receipt to the entire current project Markdown', () => withVault((root) => {
  const body = competencyBody();
  finalizeProjectMeaningReceipt({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  });

  const assessment = readProjectMeaningAssessment({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body.replace('# Demo', '# Demo renamed outside competency answers'),
    graphHash: GRAPH_HASH,
    structure: { status: 'ready' },
    source: source(),
    inventory: inventory(),
  });

  assert.equal(assessment.status, 'invalid');
}));

test('one envelope preserves at most one receipt for each project', () => withVault((root) => {
  const first = {
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: competencyBody(),
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  };
  finalizeProjectMeaningReceipt(first);
  finalizeProjectMeaningReceipt({
    ...first,
    projectSlug: 'projects/second',
    measuredAt: '2026-08-02T07:00:00.000Z',
  });
  finalizeProjectMeaningReceipt({
    ...first,
    measuredAt: '2026-08-02T08:00:00.000Z',
  });

  const state = JSON.parse(readFileSync(join(root, PROJECT_MEANING_STATE_RELATIVE_PATH), 'utf8'));
  assert.deepEqual(state.receipts.map(({ projectSlug }) => projectSlug).sort(), [
    'projects/demo',
    'projects/second',
  ]);
  assert.equal(
    state.receipts.find(({ projectSlug }) => projectSlug === 'projects/demo').measuredAt,
    '2026-08-02T08:00:00.000Z',
  );
}));

test('missing, changed, drifted, malformed, or future receipts stay fail closed', () => withVault((root) => {
  const body = competencyBody();
  const input = {
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    structure: { status: 'ready' },
    source: source(),
    inventory: inventory(),
  };
  assert.notEqual(readProjectMeaningAssessment(input).status, 'verified_current');

  finalizeProjectMeaningReceipt({
    vaultRoot: root,
    projectSlug: input.projectSlug,
    projectBody: body,
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  });
  assert.notEqual(readProjectMeaningAssessment({ ...input, projectBody: `${body}\nexternal edit\n` }).status, 'verified_current');
  assert.equal(readProjectMeaningAssessment({
    ...input,
    graphHash: 'project-graph-v1:ffffffff',
    source: source({ graphHash: 'project-graph-v1:ffffffff' }),
    inventory: inventory({ graphHash: 'project-graph-v1:ffffffff' }),
  }).status, 'review_required');
  assert.equal(readProjectMeaningAssessment({
    ...input,
    source: source({ sourceFingerprint: 'source-fingerprint:v2' }),
    inventory: inventory({ sourceFingerprint: 'source-fingerprint:v2' }),
  }).status, 'review_required');
  assert.equal(readProjectMeaningAssessment({
    ...input,
    source: source({ currentness: 'unavailable' }),
  }).status, 'review_required');
  assert.notEqual(readProjectMeaningAssessment({
    ...input,
    inventory: inventory({ sourceFingerprint: undefined }),
  }).status, 'verified_current');

  const path = join(root, PROJECT_MEANING_STATE_RELATIVE_PATH);
  const futureReceiptState = JSON.parse(readFileSync(path, 'utf8'));
  futureReceiptState.receipts[0].version = 999;
  writeFileSync(path, JSON.stringify(futureReceiptState), 'utf8');
  assert.notEqual(readProjectMeaningAssessment(input).status, 'verified_current');
  writeFileSync(path, '{broken', 'utf8');
  assert.notEqual(readProjectMeaningAssessment(input).status, 'verified_current');
  writeFileSync(path, JSON.stringify({ version: 999 }), 'utf8');
  assert.notEqual(readProjectMeaningAssessment(input).status, 'verified_current');
}));

test('malformed competency rows fail closed', () => {
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace('### impact — answered', '### unknown — answered'),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace('- Concepts: `projects/demo`', '- Concepts: projects/demo'),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace('- Evidence: `README.md`', '- Mystery: `README.md`'),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace('- Evidence: `README.md`', '- Evidence: `README.md`, `README.md`'),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace(
      '- Concepts: `domains/product`\n- Relations: `projects/demo` --contains--> `domains/product`',
      '- Relations: `projects/demo` --contains--> `domains/product`\n- Concepts: `domains/product`',
    ),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    `${competencyBody()}\n### scope — answered\n\nDuplicate\n`,
  ));
});

test('declared gaps are stable unresolved markers and must agree with status', () => {
  const partial = competencyBody({
    impact: {
      status: 'partial',
      answer: 'The impact boundary is not fully evidenced yet.',
      witnesses: [
        '- Concepts: `capabilities/workbench`',
        '- Evidence: `src/workbench.ts`',
      ],
      gap: 'A typed dependency still needs confirmation.',
    },
  });
  assert.deepEqual(
    parseProjectCompetencyMarkdown(partial).questions[4].unresolvedWitnesses,
    ['declared_gap'],
  );
  assert.throws(() => parseProjectCompetencyMarkdown(
    competencyBody().replace(
      '- Relations: `capabilities/workbench` --depends_on--> `projects/demo`\n- Evidence: `src/workbench.ts`',
      '- Relations: `capabilities/workbench` --depends_on--> `projects/demo`\n- Evidence: `src/workbench.ts`\n- Gap: answered rows cannot declare gaps',
    ),
  ));
  assert.throws(() => parseProjectCompetencyMarkdown(
    partial.replace('- Gap: A typed dependency still needs confirmation.', ''),
  ));
});

test('malformed existing state blocks overwrite and a temp write failure preserves the receipt', () => withVault((root) => {
  const body = competencyBody();
  const args = {
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  };
  const path = join(root, PROJECT_MEANING_STATE_RELATIVE_PATH);
  mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
  writeFileSync(path, '{broken', 'utf8');
  assert.throws(() => finalizeProjectMeaningReceipt(args), /existing/i);
  assert.equal(readFileSync(path, 'utf8'), '{broken');

  rmSync(path);
  finalizeProjectMeaningReceipt(args);
  const before = readFileSync(path, 'utf8');
  mkdirSync(`${path}.tmp`);
  assert.throws(() => finalizeProjectMeaningReceipt({
    ...args,
    measuredAt: '2026-08-02T07:00:00.000Z',
  }));
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.equal(existsSync(path), true);
}));

test('duplicate project receipts make the envelope malformed and block overwrite', () => withVault((root) => {
  const args = {
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: competencyBody(),
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
  };
  finalizeProjectMeaningReceipt(args);
  const path = join(root, PROJECT_MEANING_STATE_RELATIVE_PATH);
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.receipts.push({ ...state.receipts[0] });
  const malformed = `${JSON.stringify(state)}\n`;
  writeFileSync(path, malformed, 'utf8');

  assert.throws(() => finalizeProjectMeaningReceipt(args), /existing/i);
  assert.equal(readFileSync(path, 'utf8'), malformed);
}));

test('receipt and assessment do not leak body, absolute roots, remotes, or raw witnesses', () => withVault((root) => {
  const body = competencyBody();
  finalizeProjectMeaningReceipt({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    sourceFingerprint: SOURCE_FINGERPRINT,
    measuredAt: MEASURED_AT,
    remote: 'git@private.example:secret/repo.git',
  });
  const assessment = readProjectMeaningAssessment({
    vaultRoot: root,
    projectSlug: 'projects/demo',
    projectBody: body,
    graphHash: GRAPH_HASH,
    structure: { status: 'ready', rootPath: '/Users/private/repo' },
    source: source({ rootPath: '/Users/private/repo', remote: 'git@private.example:secret/repo.git' }),
    inventory: inventory(),
  });
  const serialized = `${readFileSync(join(root, PROJECT_MEANING_STATE_RELATIVE_PATH), 'utf8')}\n${JSON.stringify(assessment)}`;
  assert.equal(serialized.includes('/Users/private'), false);
  assert.equal(serialized.includes('private.example'), false);
  assert.equal(serialized.includes('The project helps'), false);
  assert.equal(serialized.includes('src/workbench.ts'), false);
}));
