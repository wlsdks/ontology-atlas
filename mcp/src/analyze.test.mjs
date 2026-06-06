// R16 (b3) — analyzeRepoStructure unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeRepoStructure } from './analyze.mjs';

function withRepo(setup) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-analyze-'));
  setup(root);
  return root;
}

test('FSD repo — features/ + entities/ → capabilities, widgets/ + views/ → elements', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'package.json'),
      JSON.stringify({ name: 'my-app', description: 'Sample' }),
    );
    writeFileSync(
      join(r, 'README.md'),
      '# My App\n\n## Authentication\n\n## Billing\n\n## Usage\n',
    );
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    mkdirSync(join(r, 'src/features/billing'), { recursive: true });
    mkdirSync(join(r, 'src/entities/user'), { recursive: true });
    mkdirSync(join(r, 'src/widgets/header'), { recursive: true });
    mkdirSync(join(r, 'src/views/home'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.framework, 'fsd');
    assert.deepEqual(
      [...r.capabilities.map((c) => c.slug)].sort(),
      ['capabilities/auth', 'capabilities/billing', 'capabilities/user'],
    );
    assert.deepEqual(
      [...r.elements.map((e) => e.slug)].sort(),
      ['elements/src/views/home', 'elements/src/widgets/header'],
    );
    assert.deepEqual(
      r.domains.map((d) => d.slug),
      ['domains/authentication', 'domains/billing'],
    );
    assert.equal(r.project.slug, 'my-app');
    assert.equal(r.project.title, 'Sample');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Generic repo — src/ depth-1 folders → capabilities', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'gen' }));
    writeFileSync(join(r, 'README.md'), '# Gen\n\n## API\n\n## DB\n');
    mkdirSync(join(r, 'src/api'), { recursive: true });
    mkdirSync(join(r, 'src/db'), { recursive: true });
    writeFileSync(join(r, 'src/api/index.ts'), '');
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.framework, 'generic');
    assert.deepEqual(
      r.capabilities.map((c) => c.slug).sort(),
      ['capabilities/api', 'capabilities/db'],
    );
    // index.ts → element
    const apiEl = r.elements.find((e) => e.slug.endsWith('api/index.ts'));
    assert.ok(apiEl, 'api index.ts → element 후보');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('No package.json — README H1 fallback for project title', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Cool Lib\n\n## Stuff\n');
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.project.title, 'Cool Lib');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Malformed package.json — README fallback plus skipped parse diagnostic', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), '{"name": ');
    writeFileSync(join(r, 'README.md'), '# Recoverable App\n');
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.project.title, 'Recoverable App');
    assert.match(r.project.slug, /^ontology-atlas-analyze-/);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].path, /package\.json$/);
    assert.match(r.skipped[0].reason, /^package-json-parse-error:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Generic README sections (Usage / Installation / Tests) skipped from domains', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.md'),
      '# X\n\n## Usage\n\n## Installation\n\n## Tests\n\n## Real Domain\n',
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(
      r.domains.map((d) => d.slug),
      ['domains/real-domain'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Narrative / language-guide / sentence README H2s skipped from domains', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.md'),
      [
        '# X',
        '',
        '## Why It Exists', // question/narrative prefix
        '## What It Does', // narrative prefix
        '## How The Memory Works', // narrative prefix
        '## Three views plus MCP, one vault', // sentence (comma)
        '## 한국어 가이드', // language guide
        '## English Guide', // language guide
        '## Billing', // real domain — kept
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(
      r.domains.map((d) => d.slug),
      ['domains/billing'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Ignored folders skip — node_modules / .git / dist', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/real'), { recursive: true });
    mkdirSync(join(r, 'src/node_modules'), { recursive: true });
    mkdirSync(join(r, 'src/.cache'), { recursive: true });
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'x' }));
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(
      r.capabilities.map((c) => c.slug),
      ['capabilities/real'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Empty dir — project synthesized from basename, no candidates', () => {
  const root = withRepo(() => {});
  try {
    const r = analyzeRepoStructure(root);
    assert.ok(r.project, 'always returns project candidate');
    assert.equal(r.capabilities.length, 0);
    assert.equal(r.domains.length, 0);
    assert.equal(r.elements.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Suggested relations — project contains each capability', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'app' }));
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    mkdirSync(join(r, 'src/features/billing'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.suggestedRelations.length, 2);
    assert.ok(
      r.suggestedRelations.every(
        (rel) => rel.from === 'app' && rel.type === 'contains',
      ),
    );
    assert.deepEqual(
      r.suggestedRelations.map((rel) => rel.to).sort(),
      ['capabilities/auth', 'capabilities/billing'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('README domain and feature with same name do not collide', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'notes' }));
    writeFileSync(join(r, 'README.md'), '# Notes\n\n## Capture\n');
    mkdirSync(join(r, 'src/features/capture'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(r.domains.map((d) => d.slug), ['domains/capture']);
    assert.deepEqual(r.capabilities.map((c) => c.slug), ['capabilities/capture']);
    assert.equal(r.capabilities[0].domain, 'domains/capture');
    assert.equal(r.suggestedRelations[0].to, 'capabilities/capture');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Meaning gate separates business ontology candidates from implementation evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'shop' }));
    writeFileSync(join(r, 'README.md'), '# Shop\n\n## Checkout\n\n## Inventory\n');
    mkdirSync(join(r, 'src/features/checkout'), { recursive: true });
    mkdirSync(join(r, 'src/features/theme-toggle'), { recursive: true });
    mkdirSync(join(r, 'src/widgets/header'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.meaningGate.policy, 'business-first');
    assert.equal(r.meaningGate.sourceStructureRole, 'implementation-evidence');
    assert.deepEqual(r.meaningGate.businessOntology.domains, [
      'domains/checkout',
      'domains/inventory',
    ]);
    assert.deepEqual(r.meaningGate.businessOntology.capabilities, [
      'capabilities/checkout',
    ]);
    assert.deepEqual(r.meaningGate.implementationEvidence.elements, [
      'elements/src/widgets/header',
    ]);
    assert.deepEqual(r.meaningGate.implementationEvidence.reviewRequiredCapabilities, [
      {
        slug: 'capabilities/theme-toggle',
        reason: 'no README/domain evidence for business meaning',
        evidence: { source: 'src/features/theme-toggle' },
      },
    ]);
    assert.ok(
      r.meaningGate.reviewQuestions.some((question) =>
        question.includes('business/product'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid analyze options are rejected instead of coerced', () => {
  const root = withRepo(() => {});
  try {
    assert.throws(
      () => analyzeRepoStructure(` ${root}`),
      /rootPath must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => analyzeRepoStructure(root, { maxDepth: 11 }),
      /maxDepth must be <= 10/,
    );
    assert.throws(
      () => analyzeRepoStructure(root, { maxDepth: 1.5 }),
      /maxDepth must be a non-negative integer/,
    );
    assert.throws(
      () => analyzeRepoStructure(root, { ignore: ['dist', 7] }),
      /ignore must be an array of strings/,
    );
    assert.throws(
      () => analyzeRepoStructure(root, { ignore: ['dist', ' '] }),
      /ignore items must be non-empty strings/,
    );
    assert.throws(
      () => analyzeRepoStructure(root, { ignore: Array.from({ length: 201 }, (_, index) => `skip-${index}`) }),
      /ignore must contain at most 200 items/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
