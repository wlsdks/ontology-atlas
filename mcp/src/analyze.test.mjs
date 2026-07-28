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

test('FSD repo — features/ → capabilities, entities/widgets/views → implementation elements', () => {
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
      ['capabilities/auth', 'capabilities/billing'],
    );
    assert.deepEqual(
      [...r.elements.map((e) => e.slug)].sort(),
      ['elements/src/entities/user', 'elements/src/views/home', 'elements/src/widgets/header'],
    );
    assert.deepEqual(
      r.domains.map((d) => d.slug),
      ['domains/authentication', 'domains/billing'],
    );
    assert.equal(r.project.slug, 'my-app');
    assert.equal(r.project.title, 'My App');
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

test('README title ignores fenced shell comments and supports centered HTML H1', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'muse' }));
    writeFileSync(
      join(r, 'README.md'),
      [
        '<h1 align="center">Muse</h1>',
        '',
        '```bash',
        '# Requirements: Node.js 22',
        'pnpm install',
        '```',
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.project.title, 'Muse');
    const readmeEvidence = r.semanticEvidence.find((row) => row.source === 'README.md');
    assert.equal(readmeEvidence.role, 'mission');
    assert.equal(readmeEvidence.title, 'Muse');
    assert.doesNotMatch(readmeEvidence.excerpt, /Requirements: Node\.js/);
    assert.equal(r.extractionContract.qualityGates.semanticEvidenceAvailable, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery ranks generic product/strategy docs without project-specific paths', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-app' }));
    mkdirSync(join(r, 'docs/strategy'), { recursive: true });
    mkdirSync(join(r, 'docs/goals'), { recursive: true });
    writeFileSync(
      join(r, 'docs/strategy/north-star.md'),
      '# North Star\n\n## User need\n\nProduct goal: preserve a user workflow across sessions.\n',
    );
    writeFileSync(
      join(r, 'docs/goals/backlog.md'),
      '# Backlog\n\nImplementation plan and roadmap items.\n',
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.ok(
      r.semanticEvidence.some(
        (row) =>
          row.source === 'docs/strategy/north-star.md' &&
          row.role === 'product-contract',
      ),
    );
    assert.ok(
      r.semanticEvidence.every((row) => row.source !== 'docs/goals/backlog.md'),
    );
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
        '## Providers and local path', // operational setup section
        '## Provider Management', // real domain — kept
        '## Providers and local marketplace', // real domain — kept
        '## Provider and offline services', // real domain — kept
        '## Billing', // real domain — kept
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(
      r.domains.map((d) => d.slug),
      [
        'domains/provider-management',
        'domains/providers-and-local-marketplace',
        'domains/provider-and-offline-services',
        'domains/billing',
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pnpm workspace — operational README sections stay out of domains and workspace packages become elements', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'package.json'),
      JSON.stringify({ name: 'muse', packageManager: 'pnpm@10.18.0' }),
    );
    writeFileSync(
      join(r, 'README.md'),
      [
        '# Muse',
        '',
        '## 📊 Muse in numbers',
        '## ⚡ Install and quick start',
        '## 🔧 Core capabilities',
        '## 🧩 Providers and local path',
        '## ✅ Verification',
        '## 📖 Documentation',
        '## 💬 Community and support',
        '',
      ].join('\n'),
    );
    mkdirSync(join(r, 'apps', 'api'), { recursive: true });
    mkdirSync(join(r, 'apps', 'web'), { recursive: true });
    mkdirSync(join(r, 'packages', 'attunement'), { recursive: true });
    mkdirSync(join(r, 'packages', 'shared'), { recursive: true });
    writeFileSync(join(r, 'apps', 'api', 'package.json'), '{"name":"@muse/api"}\n');
    writeFileSync(join(r, 'apps', 'web', 'package.json'), '{"name":"@muse/web"}\n');
    writeFileSync(
      join(r, 'packages', 'attunement', 'package.json'),
      '{"name":"@muse/attunement"}\n',
    );
    writeFileSync(join(r, 'packages', 'shared', 'package.json'), '{"name":"@muse/shared"}\n');
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.framework, 'generic');
    assert.deepEqual(r.domains, []);
    assert.deepEqual(
      r.elements.map((element) => element.slug),
      [
        'elements/apps/api',
        'elements/apps/web',
        'elements/packages/attunement',
        'elements/packages/shared',
      ],
    );
    assert.deepEqual(
      r.suggestedRelations.map((relation) => relation.to),
      r.elements.map((element) => element.slug),
    );
    assert.deepEqual(
      analyzeRepoStructure(root, { ignore: ['packages'] }).elements.map(
        (element) => element.slug,
      ),
      ['elements/apps/api', 'elements/apps/web'],
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
    assert.deepEqual(r.suggestedRelations, [
      { from: 'notes', to: 'domains/capture', type: 'contains' },
      { from: 'domains/capture', to: 'capabilities/capture', type: 'contains' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('A sole README domain is the deterministic parent for otherwise unmatched code candidates', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'bootstrap-app' }));
    writeFileSync(join(r, 'README.md'), '# Bootstrap App\n\n## Accounts\n');
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    writeFileSync(join(r, 'src/features/auth/index.ts'), 'export const auth = true;\n');
    mkdirSync(join(r, 'src/entities/session'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.capabilities[0].domain, 'domains/accounts');
    assert.equal(r.elements[0].domain, 'domains/accounts');
    assert.deepEqual(r.suggestedRelations, [
      { from: 'bootstrap-app', to: 'domains/accounts', type: 'contains' },
      { from: 'domains/accounts', to: 'capabilities/auth', type: 'contains' },
      { from: 'domains/accounts', to: 'elements/src/entities/session', type: 'contains' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Business containment spine — fuzzy domain match connects project → domain → nodes', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'claims' }));
    writeFileSync(join(r, 'README.md'), '# Claims\n\n## Evidence Intake\n\n## Claim Review\n');
    mkdirSync(join(r, 'src/features/capture-evidence'), { recursive: true });
    mkdirSync(join(r, 'src/features/review-claims'), { recursive: true });
    mkdirSync(join(r, 'src/entities/claim'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.capabilities[0].domain, 'domains/evidence-intake');
    assert.equal(r.capabilities[1].domain, 'domains/claim-review');
    assert.equal(r.elements[0].domain, 'domains/claim-review');
    assert.deepEqual(r.suggestedRelations, [
      { from: 'claims', to: 'domains/evidence-intake', type: 'contains' },
      { from: 'claims', to: 'domains/claim-review', type: 'contains' },
      { from: 'domains/evidence-intake', to: 'capabilities/capture-evidence', type: 'contains' },
      { from: 'domains/claim-review', to: 'capabilities/review-claims', type: 'contains' },
      { from: 'domains/claim-review', to: 'elements/src/entities/claim', type: 'contains' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Meaning gate separates shared ontology, business proposals, and implementation evidence', () => {
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
    assert.deepEqual(r.meaningGate.businessOntology.domains, []);
    assert.deepEqual(r.meaningGate.businessOntology.capabilities, []);
    assert.deepEqual(
      r.meaningGate.proposedBusinessOntology.domains.map((row) => row.slug),
      ['domains/checkout', 'domains/inventory'],
    );
    assert.deepEqual(
      r.meaningGate.proposedBusinessOntology.capabilities.map((row) => row.slug),
      ['capabilities/checkout', 'capabilities/theme-toggle'],
    );
    assert.deepEqual(r.meaningGate.implementationEvidence.elements, [
      'elements/src/widgets/header',
    ]);
    assert.deepEqual(r.meaningGate.implementationEvidence.reviewRequiredCapabilities, [
      {
        slug: 'capabilities/checkout',
        reason: 'source folder is implementation evidence, not proof of a shared capability meaning',
        evidence: { source: 'src/features/checkout' },
      },
      {
        slug: 'capabilities/theme-toggle',
        reason: 'source folder is implementation evidence, not proof of a shared capability meaning',
        evidence: { source: 'src/features/theme-toggle' },
      },
    ]);
    assert.ok(
      r.meaningGate.reviewQuestions.some((question) =>
        question.includes('business/product'),
      ),
    );
    assert.equal(r.extractionContract.standard, 'formal-explicit-shared-conceptualization');
    assert.equal(r.extractionContract.status, 'evidence-gathering');
    assert.equal(r.extractionContract.assertionPolicy.automaticBusinessAssertions, 0);
    assert.equal(r.extractionContract.assertionPolicy.humanApprovalRequired, true);
    assert.equal(r.extractionContract.qualityGates.proposedBusinessConcepts, 4);
    assert.equal(r.extractionContract.qualityGates.uncertaintyExplicit, true);
    assert.equal(r.extractionContract.competencyQuestions.length, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Meaning gate uses existing ontology capability docs as business evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workbench' }));
    mkdirSync(join(r, 'src/features/theme-toggle'), { recursive: true });
    mkdirSync(join(r, 'docs/ontology/capabilities'), { recursive: true });
    writeFileSync(
      join(r, 'docs/ontology/capabilities/theme-toggle.md'),
      [
        '---',
        'kind: capability',
        'title: Theme Toggle',
        '---',
        '',
        '# Theme Toggle',
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(r.meaningGate.businessOntology.capabilities, [
      'capabilities/theme-toggle',
    ]);
    assert.deepEqual(r.meaningGate.implementationEvidence.reviewRequiredCapabilities, []);
    assert.deepEqual(r.meaningGate.businessOntology.evidence, [
      {
        slug: 'capabilities/theme-toggle',
        kind: 'capability',
        source: 'docs/ontology/capabilities/theme-toggle.md',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Meaning gate uses existing ontology domain docs as business evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workbench' }));
    mkdirSync(join(r, 'docs/ontology/domains'), { recursive: true });
    writeFileSync(
      join(r, 'docs/ontology/domains/operations.md'),
      [
        '---',
        'kind: domain',
        'title: Operations',
        '---',
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(r.meaningGate.businessOntology.domains, [
      'domains/operations',
    ]);
    assert.deepEqual(r.meaningGate.businessOntology.evidence, [
      {
        slug: 'domains/operations',
        kind: 'domain',
        source: 'docs/ontology/domains/operations.md',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Default starter ontology nodes are not counted as shared business evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'new-app' }));
    mkdirSync(join(r, 'docs/ontology/domains'), { recursive: true });
    mkdirSync(join(r, 'docs/ontology/capabilities'), { recursive: true });
    writeFileSync(
      join(r, 'docs/ontology/domains/example-domain.md'),
      '---\nkind: domain\ntitle: Example domain\n---\n',
    );
    writeFileSync(
      join(r, 'docs/ontology/capabilities/example-capability.md'),
      '---\nkind: capability\ntitle: Example capability\n---\n',
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(r.meaningGate.businessOntology.domains, []);
    assert.deepEqual(r.meaningGate.businessOntology.capabilities, []);
    assert.equal(r.extractionContract.status, 'scope-discovery-required');
    assert.equal(r.extractionContract.qualityGates.sharedBusinessConceptsAvailable, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Meaning gate maps code folders through existing ontology capability elements', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workbench' }));
    mkdirSync(join(r, 'src/features/data-source-mode'), { recursive: true });
    mkdirSync(join(r, 'docs/ontology/capabilities'), { recursive: true });
    writeFileSync(
      join(r, 'docs/ontology/capabilities/mode-aware-adapter.md'),
      [
        '---',
        'kind: capability',
        'title: Mode-Aware Adapter',
        'elements:',
        '  - src/features/data-source-mode',
        '---',
        '',
      ].join('\n'),
    );
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.deepEqual(r.meaningGate.businessOntology.capabilities, [
      'capabilities/mode-aware-adapter',
    ]);
    assert.deepEqual(r.meaningGate.implementationEvidence.reviewRequiredCapabilities, []);
    assert.deepEqual(r.meaningGate.businessOntology.evidence, [
      {
        slug: 'capabilities/mode-aware-adapter',
        kind: 'capability',
        source: 'docs/ontology/capabilities/mode-aware-adapter.md',
      },
    ]);
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

/**
 * `shared/` 하나 때문에 아무것도 못 찾던 결함 (2026-07-28 도그푸딩 실측).
 *
 * `fsdMarkers` 에 `shared` 가 들어 있어서, **아무 TS/Node 프로젝트에나 흔한**
 * `src/shared/` 폴더 하나만 있어도 framework 가 `fsd` 로 판정됐다. 그런데
 * FSD 모드가 실제로 훑는 폴더는 `features/entities/widgets/views` 뿐이라,
 * 그중 아무것도 없으면 **capabilities 0 · elements 0** 을 조용히 반환한다.
 * 응답 어디에도 "framework 판정 때문에 0 이다" 라는 말이 없다.
 *
 * 같은 호출 안의 `inferImports` 는 같은 저장소에서 auth·tasks·db·notifications
 * 를 정확히 뽑아낸다 — **두 도구가 같은 저장소를 두고 서로 다른 말을 한다.**
 *
 * 규율로 승격: **판정이 읽을 것을 바꾸지 못하면 그 판정을 하지 않는다.**
 * FSD 로 부르는 유일한 결과가 "훑을 폴더가 없다" 라면 그 이름은 억제 말고는
 * 하는 일이 없다.
 */
test('src/shared 하나로 FSD 라 부르지 않는다 — 훑을 폴더가 없으면 일반 경로로 간다', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'taskflow', description: 'x' }));
    writeFileSync(join(r, 'README.md'), '# Taskflow\n');
    // 실제 도그푸딩 픽스처의 모양 — 기능 폴더가 src/ 바로 아래에 있고,
    // 흔한 이름의 shared/ 가 하나 섞여 있다.
    mkdirSync(join(r, 'src/auth'), { recursive: true });
    mkdirSync(join(r, 'src/tasks'), { recursive: true });
    mkdirSync(join(r, 'src/notifications'), { recursive: true });
    mkdirSync(join(r, 'src/db'), { recursive: true });
    mkdirSync(join(r, 'src/shared'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.notEqual(r.framework, 'fsd');
    const slugs = r.capabilities.map((c) => c.slug).sort();
    for (const expected of ['capabilities/auth', 'capabilities/db', 'capabilities/notifications', 'capabilities/tasks']) {
      assert.ok(slugs.includes(expected), `${expected} 가 후보에 없다: ${slugs.join(', ')}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// 진짜 FSD 는 계속 FSD 여야 한다 — 고치면서 반대편을 깨뜨리지 않았는지.
test('훑을 폴더가 하나라도 있으면 여전히 FSD 다 (lean FSD 포함)', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'lean', description: 'x' }));
    writeFileSync(join(r, 'README.md'), '# Lean\n');
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    mkdirSync(join(r, 'src/shared'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    assert.equal(r.framework, 'fsd');
    assert.ok(r.capabilities.some((c) => c.slug === 'capabilities/auth'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
