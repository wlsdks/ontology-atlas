// R16 (b3) — analyzeRepoStructure unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
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
    // 슬러그는 평평한 role 이름 — 위치는 path/evidence 가 나른다 (2026-08-01 판정).
    assert.deepEqual(
      [...r.elements.map((e) => e.slug)].sort(),
      ['elements/header', 'elements/home', 'elements/user'],
    );
    const userEl = r.elements.find((e) => e.slug === 'elements/user');
    assert.equal(userEl.path, 'src/entities/user');
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
    // index.ts → element — 슬러그는 평평하게, 파일 위치는 path 로.
    const apiEl = r.elements.find((e) => e.slug === 'elements/api-entry');
    assert.ok(apiEl, 'api index.ts → element 후보');
    assert.equal(apiEl.path, 'src/api/index.ts');
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

test('README.rst provides bounded mission evidence without promoting documentation sections to domains', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      [
        'Vehicle Diagnostics Toolkit',
        '===========================',
        '',
        'A Python toolkit that lets developers issue standardized diagnostic requests.',
        '',
        'Documentation',
        '-------------',
        '',
        'The complete reference is published separately.',
        '',
        'Installation',
        '------------',
        '',
        'Install the package with pip.',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.semanticEvidence.find(
      (row) => row.source === 'README.rst',
    );

    assert.equal(result.project.title, 'Vehicle Diagnostics Toolkit');
    assert.equal(evidence?.role, 'mission');
    assert.equal(evidence?.title, 'Vehicle Diagnostics Toolkit');
    assert.match(evidence?.excerpt ?? '', /standardized diagnostic requests/);
    assert.deepEqual(result.domains, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('README.rst accepts punctuation title adornments and excludes directive code blocks from evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      [
        'Protocol Client',
        '###############',
        '',
        '.. image:: https://example.invalid/badge.svg',
        '',
        'A client that issues standardized protocol requests.',
        '',
        'Example',
        '-------',
        '',
        '.. code-block:: python',
        '',
        '   import secret_runtime',
        '   raise RuntimeError("example only")',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.semanticEvidence.find(
      (row) => row.source === 'README.rst',
    );

    assert.equal(result.project.title, 'Protocol Client');
    assert.equal(evidence?.title, 'Protocol Client');
    assert.match(evidence?.excerpt ?? '', /standardized protocol requests/);
    assert.doesNotMatch(
      evidence?.excerpt ?? '',
      /image::|code-block::|secret_runtime|RuntimeError/,
    );
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

test('semantic evidence discovery admits a root architecture contract', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-app' }));
    writeFileSync(
      join(r, 'ARCHITECTURE.md'),
      [
        '# Runtime architecture',
        '',
        '## Entry points',
        '',
        'The desktop entry delegates durable work to the service boundary.',
        '',
        '## Dependency direction',
        '',
        'The entry layer depends on services; services never import the entry layer.',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.semanticEvidence.find(
      (row) => row.source === 'ARCHITECTURE.md',
    );

    assert.equal(evidence?.role, 'architecture');
    assert.match(evidence?.excerpt ?? '', /entry layer depends on services/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery admits bounded introduction docs from a documentation site', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-toolkit' }));
    mkdirSync(join(r, 'site', 'cli'), { recursive: true });
    mkdirSync(join(r, 'site', 'library'), { recursive: true });
    writeFileSync(
      join(r, 'site', 'cli', 'introduction.md'),
      '# Command-line workflow\n\nValidate and format configuration files from one command-line interface.\n',
    );
    writeFileSync(
      join(r, 'site', 'library', 'overview.md'),
      '# Embeddable library\n\nEmbed the same validation behavior in another application.\n',
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const sources = new Map(
      result.semanticEvidence.map((row) => [row.source, row.role]),
    );

    assert.equal(sources.get('site/cli/introduction.md'), 'product-contract');
    assert.equal(sources.get('site/library/overview.md'), 'product-contract');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery skips oversized Markdown before reading it', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-toolkit' }));
    mkdirSync(join(r, 'docs'), { recursive: true });
    writeFileSync(
      join(r, 'docs', 'overview.md'),
      `# Oversized product contract\n\n${'x'.repeat(256 * 1024)}`,
    );
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'docs/overview.md'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path === join(root, 'docs', 'overview.md') &&
          row.reason === 'semantic-evidence-skip: docs/overview.md exceeds 262144 bytes',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery stops an in-repository directory symlink cycle', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-toolkit' }));
    mkdirSync(join(r, 'docs'), { recursive: true });
    writeFileSync(
      join(r, 'docs', 'overview.md'),
      '# Product overview\n\nOne current product contract should be admitted once.\n',
    );
    symlinkSync(join(r, 'docs'), join(r, 'docs', 'loop'));
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(
      result.semanticEvidence.filter((row) => row.source === 'docs/overview.md').length,
      1,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path === join(root, 'docs', 'loop') &&
          row.reason === 'semantic-evidence-skip: docs/loop repeats a visited directory',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery reports a broken documentation symlink instead of aborting', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-toolkit' }));
    mkdirSync(join(r, 'docs'), { recursive: true });
    writeFileSync(
      join(r, 'docs', 'overview.md'),
      '# Product overview\n\nThe readable document should still reach the packet.\n',
    );
    symlinkSync(join(r, 'missing.md'), join(r, 'docs', 'broken.md'));
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'docs/overview.md'),
      true,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path === join(root, 'docs', 'broken.md') &&
          row.reason === 'semantic-evidence-skip: docs/broken.md cannot resolve inside repository root',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery stops at the whole-walk entry budget', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-toolkit' }));
    mkdirSync(join(r, 'docs'), { recursive: true });
    for (let index = 0; index < 1001; index += 1) {
      writeFileSync(join(r, 'docs', `noise-${String(index).padStart(4, '0')}.txt`), 'noise');
    }
    writeFileSync(
      join(r, 'docs', 'overview.md'),
      '# Product overview\n\nThis file sorts after the bounded noise entries.\n',
    );
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'docs/overview.md'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path === join(root, 'docs') &&
          row.reason === 'semantic-evidence-skip: docs reached 1000 entry walk budget',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic evidence discovery rejects documentation symlinks that escape the repository', () => {
  const outside = mkdtempSync(join(tmpdir(), 'ontology-atlas-semantic-outside-'));
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'portable-app' }));
    writeFileSync(
      join(outside, 'ARCHITECTURE.md'),
      '# External architecture\n\nThis must not enter the repository evidence packet.\n',
    );
    symlinkSync(join(outside, 'ARCHITECTURE.md'), join(r, 'ARCHITECTURE.md'));
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'ARCHITECTURE.md'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path === join(root, 'ARCHITECTURE.md') &&
          row.reason === 'semantic-evidence-skip: ARCHITECTURE.md resolves outside repository root',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('setup.py contributes a bounded static package contract without executing or admitting dynamic fields', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      [
        'Diagnostic Client',
        '=================',
        '',
        'A client library for standardized device diagnostics.',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'setup.py'),
      [
        'raise RuntimeError("setup.py must never execute during analysis")',
        'setup(',
        "    name='diagnostic-client',",
        "    description='Standardized device diagnostic requests',",
        "    python_requires='>=3.9',",
        '    version=load_version(),',
        "    install_requires=['transport-lib'],",
        ')',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.semanticEvidence.find(
      (row) => row.source === 'setup.py',
    );

    assert.equal(evidence?.role, 'package-contract');
    assert.match(evidence?.excerpt ?? '', /Package: diagnostic-client/);
    assert.match(
      evidence?.excerpt ?? '',
      /Description: Standardized device diagnostic requests/,
    );
    assert.match(evidence?.excerpt ?? '', /Python: >=3\.9/);
    assert.doesNotMatch(evidence?.excerpt ?? '', /load_version|transport-lib|RuntimeError/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('static setup.py name replaces a generic folder slug while README.rst remains the display title', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      'Protocol Client\n###############\n\nA protocol diagnostic client.\n',
    );
    writeFileSync(
      join(r, 'setup.py'),
      ['setup(', "    name='protocol-client',", ')'].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(result.project.slug, 'protocol-client');
    assert.equal(result.project.title, 'Protocol Client');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup.py symlink outside the repository is rejected before project identity or evidence admission', () => {
  const outside = withRepo((r) => {
    writeFileSync(
      join(r, 'setup.py'),
      ['setup(', "    name='escaped-package',", ')'].join('\n'),
    );
  });
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      'Contained Client\n================\n\nA contained client.\n',
    );
    symlinkSync(join(outside, 'setup.py'), join(r, 'setup.py'));
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.notEqual(result.project.slug, 'escaped-package');
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'setup.py'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('setup.py') &&
          row.reason ===
            'package-contract-skip: setup.py resolves outside repository root',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('root Cargo package contract is admissible evidence for a feature capability proposal', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.md'),
      '# Calc Kit\n\nTeams use Calc Kit for repeatable scientific calculations.\n',
    );
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "calc-kit"',
        'version = "0.1.0"',
        'description = "Repeatable scientific calculations"',
        '',
        '[features]',
        'default = ["complex"]',
        'complex = ["dep:num-complex"]',
        'plot = ["dep:plotters"]',
        '',
      ].join('\n'),
    );
  });
  try {
    const proposal = {
      project: {
        slug: 'calc-kit',
        title: 'Calc Kit',
        definition: 'A library for repeatable scientific calculations.',
        evidence: ['README.md'],
        confidence: 0.9,
      },
      domains: [{
        slug: 'domains/library-configuration',
        title: 'Library Configuration',
        definition: 'The responsibility boundary for selecting optional library behavior.',
        evidence: ['README.md'],
        confidence: 0.9,
      }],
      capabilities: [{
        slug: 'capabilities/optional-feature-selection',
        title: 'Optional Feature Selection',
        definition: 'Let consumers select optional calculation and plotting behavior.',
        domain: 'domains/library-configuration',
        evidence: ['Cargo.toml'],
        confidence: 0.9,
      }],
      elements: [],
      relations: [],
      competencyAnswers: {
        scope: {
          answer: 'Rust teams performing scientific calculations.',
          status: 'answered',
          witnesses: {
            concepts: ['calc-kit'],
            relations: [],
            evidence: ['README.md'],
            paths: [],
          },
        },
        domains: {
          answer: 'Library Configuration owns optional behavior selection.',
          status: 'visible-gap',
          gap: 'No project-to-domain relation witness is attached yet.',
          witnesses: {
            concepts: ['domains/library-configuration'],
            relations: [],
            evidence: ['README.md'],
            paths: [],
          },
        },
        abilities: {
          answer: 'Consumers select complex-number and plotting support.',
          status: 'visible-gap',
          gap: 'No domain-to-capability relation witness is attached yet.',
          witnesses: {
            concepts: ['capabilities/optional-feature-selection'],
            relations: [],
            evidence: ['Cargo.toml'],
            paths: [],
          },
        },
        evidence: {
          answer: 'README and the root Cargo package contract.',
          status: 'visible-gap',
          gap: 'No canonical implementation path is attached yet.',
          witnesses: {
            concepts: ['capabilities/optional-feature-selection'],
            relations: [],
            evidence: ['README.md', 'Cargo.toml'],
            paths: [],
          },
        },
        impact: {
          answer: 'Changing feature mappings may change available optional behavior.',
          status: 'visible-gap',
          gap: 'No typed dependency relation proves the change impact.',
          witnesses: {
            concepts: ['capabilities/optional-feature-selection'],
            relations: [],
            evidence: ['Cargo.toml'],
            paths: [],
          },
        },
      },
    };
    const result = analyzeRepoStructure(root, { proposal });
    const cargoEvidence = result.semanticEvidence.find(
      (row) => row.source === 'Cargo.toml',
    );

    assert.ok(
      cargoEvidence,
      'root Cargo.toml package contract must enter semanticEvidence',
    );
    assert.equal(cargoEvidence.role, 'package-contract');
    assert.match(cargoEvidence.excerpt, /default.*complex/);
    assert.match(cargoEvidence.excerpt, /plot.*dep:plotters/);
    assert.ok(
      result.semanticEvidence.some((row) => row.source === 'README.md'),
      'package contract must not displace the mission evidence',
    );
    assert.equal(result.proposalValidation.canWrite, false);
    assert.ok(result.proposalValidation.reviewPlan);
    assert.equal(result.proposalValidation.writePlan, undefined);
    assert.equal(result.proposalValidation.constructionLifecycle.writeEligibility, 'reviewable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('virtual Cargo workspace is reported as skipped instead of becoming package evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Workspace\n\nA multi-package workspace.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[workspace]\nmembers = ["crates/core", "crates/cli"]\n',
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'Cargo.toml'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('Cargo.toml') &&
          row.reason === 'package-contract-skip: root Cargo.toml has no [package] table',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('root Cargo feature declarations retain typed Rust cfg provenance without claiming runtime impact', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'README.md'), '# Conditional Package\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "conditional-package"',
        '',
        '[features]',
        'zero-copy = []',
        'portable = []',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      [
        '#[cfg(feature = "zero-copy")]',
        'mod enabled;',
        '#[cfg(not(feature = "zero-copy"))]',
        'mod fallback;',
        '#[cfg(all(feature = "zero-copy", target_os = "linux"))]',
        'mod linux_only;',
        '#[cfg_attr(feature = "zero-copy", doc(hidden))]',
        'pub struct Conditional;',
        '#[cfg(feature = "portable")]',
        'mod portable;',
        '',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.configurationEvidence;
    assert.equal(evidence.contract, 'rustFeatureConfigurationEvidence:v1');
    assert.equal(evidence.status, 'observed');
    assert.equal(evidence.writePolicy.writeAllowed, false);
    assert.equal(evidence.claimBoundary.runtimeImpact, false);
    assert.equal(evidence.claimBoundary.semanticDependency, false);
    assert.equal(evidence.coverage.predicateEvaluation, false);

    const pkg = evidence.packages.find((row) => row.manifest === 'Cargo.toml');
    assert.equal(pkg.packageName, 'conditional-package');
    const feature = pkg.features.find((row) => row.name === 'zero-copy');
    assert.deepEqual(feature.directMappings, []);
    assert.equal(feature.referenceCount, 4);
    assert.deepEqual(feature.byForm, { cfg: 3, cfg_attr: 1 });
    assert.deepEqual(feature.byPolarity, {
      positive: 2,
      negative: 1,
      compound: 1,
      unknown: 0,
    });
    assert.deepEqual(
      feature.references.map((row) => ({
        line: row.line,
        form: row.form,
        meaning: row.meaning,
        polarity: row.polarity,
        predicate: row.predicate,
      })),
      [
        {
          line: 1,
          form: 'cfg',
          meaning: 'conditional_inclusion',
          polarity: 'positive',
          predicate: 'feature = "zero-copy"',
        },
        {
          line: 3,
          form: 'cfg',
          meaning: 'conditional_inclusion',
          polarity: 'negative',
          predicate: 'not(feature = "zero-copy")',
        },
        {
          line: 5,
          form: 'cfg',
          meaning: 'conditional_inclusion',
          polarity: 'compound',
          predicate: 'all(feature = "zero-copy", target_os = "linux")',
        },
        {
          line: 7,
          form: 'cfg_attr',
          meaning: 'conditional_attribute',
          polarity: 'positive',
          predicate: 'feature = "zero-copy"',
        },
      ],
    );
    assert.ok(feature.references.every((row) => row.path === 'src/lib.rs'));
    assert.ok(feature.references.every((row) => row.sourceRole === 'production'));
    assert.equal(feature.referencesLimited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust crate-level inner cfg attributes retain the same typed feature provenance', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[package]\nname = "inner-attributes"\n\n[features]\nportable = []\n',
    );
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      '#![cfg(feature = "portable")]\n#![cfg_attr(feature = "portable", no_std)]\npub fn portable() {}\n',
    );
  });
  try {
    const feature = analyzeRepoStructure(root)
      .configurationEvidence.packages[0].features[0];
    assert.equal(feature.referenceCount, 2);
    assert.deepEqual(feature.byForm, { cfg: 1, cfg_attr: 1 });
    assert.deepEqual(feature.references.map((row) => row.line), [1, 2]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('virtual Cargo workspace admits only repo-contained literal direct members and reports rejected scope', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'crates', 'core', 'src'), { recursive: true });
    writeFileSync(join(r, 'README.md'), '# Bounded Workspace\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[workspace]',
        'members = [',
        '  "crates/core",',
        '  "crates/*",',
        '  "../outside",',
        ']',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'crates', 'core', 'Cargo.toml'),
      [
        '[package]',
        'name = "workspace-core"',
        '',
        '[features]',
        'fast = []',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'crates', 'core', 'src', 'lib.rs'),
      '#[cfg(feature = "fast")]\npub fn fast() {}\n',
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(result.configurationEvidence.status, 'limited');
    assert.equal(result.configurationEvidence.coverage.workspaceMode, 'literal_direct_members');
    assert.equal(result.configurationEvidence.coverage.workspaceMembersDeclared, 3);
    assert.equal(result.configurationEvidence.coverage.workspaceMembersEligible, 1);
    assert.equal(result.configurationEvidence.coverage.workspaceMembersSkipped, 2);
    assert.deepEqual(result.configurationEvidence.unsupportedWorkspaceMembers, [
      { member: '../outside', reason: 'outside-root' },
      { member: 'crates/*', reason: 'glob-not-supported' },
    ]);
    assert.deepEqual(
      result.configurationEvidence.packages.map((row) => row.manifest),
      ['crates/core/Cargo.toml'],
    );
    const feature = result.configurationEvidence.packages[0].features.find(
      (row) => row.name === 'fast',
    );
    assert.equal(feature.referenceCount, 1);
    assert.equal(feature.references[0].path, 'crates/core/src/lib.rs');
    assert.equal(feature.references[0].line, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo workspace member symlink escape is reported as outside-root', () => {
  const outside = mkdtempSync(join(tmpdir(), 'ontology-atlas-rust-member-outside-'));
  const root = withRepo((r) => {
    mkdirSync(join(outside, 'src'), { recursive: true });
    writeFileSync(join(outside, 'Cargo.toml'), '[package]\nname = "outside-member"\n');
    writeFileSync(join(outside, 'src', 'lib.rs'), 'pub fn outside() {}\n');
    mkdirSync(join(r, 'crates'), { recursive: true });
    symlinkSync(outside, join(r, 'crates', 'escaped'));
    writeFileSync(join(r, 'Cargo.toml'), '[workspace]\nmembers = ["crates/escaped"]\n');
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.deepEqual(evidence.unsupportedWorkspaceMembers, [
      { member: 'crates/escaped', reason: 'outside-root' },
    ]);
    assert.equal(evidence.packages.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('root Cargo package does not absorb cfg evidence owned by a workspace member', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    mkdirSync(join(r, 'crates', 'member', 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "workspace-root"',
        '',
        '[features]',
        'root-only = []',
        'member-only = []',
        '',
        '[workspace]',
        'members = ["crates/member"]',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      '#[cfg(feature = "root-only")]\npub fn root() {}\n',
    );
    writeFileSync(
      join(r, 'crates', 'member', 'Cargo.toml'),
      '[package]\nname = "workspace-member"\n\n[features]\nmember-only = []\n',
    );
    writeFileSync(
      join(r, 'crates', 'member', 'src', 'lib.rs'),
      '#[cfg(feature = "member-only")]\npub fn member() {}\n',
    );
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    const rootPackage = evidence.packages.find((row) => row.packageName === 'workspace-root');
    const memberPackage = evidence.packages.find((row) => row.packageName === 'workspace-member');
    assert.equal(
      rootPackage.features.find((row) => row.name === 'member-only').referenceCount,
      0,
    );
    assert.equal(
      memberPackage.features.find((row) => row.name === 'member-only').referenceCount,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace root listed as a member is counted once without duplicate package evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "single-root"',
        '',
        '[features]',
        'only = []',
        '',
        '[workspace]',
        'members = ["."]',
        '',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src', 'lib.rs'), '#[cfg(feature = "only")]\npub fn only() {}\n');
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(evidence.coverage.workspaceMembersDeclared, 1);
    assert.equal(evidence.coverage.workspaceMembersEligible, 1);
    assert.equal(evidence.coverage.workspaceMembersSkipped, 0);
    assert.equal(evidence.packages.length, 1);
    assert.equal(evidence.packages[0].features[0].referenceCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust feature and workspace evidence stays explicitly bounded', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    const features = Array.from({ length: 60 }, (_, index) =>
      `feature-${String(index).padStart(2, '0')} = [${Array.from(
        { length: 110 },
        (__, mappingIndex) => `"dep:${index}-${mappingIndex}"`,
      ).join(', ')}]`,
    );
    const members = Array.from(
      { length: 130 },
      (_, index) => `"missing/member-${String(index).padStart(3, '0')}"`,
    );
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "bounded-root"',
        '',
        '[features]',
        ...features,
        '',
        '[workspace]',
        `members = [${members.join(', ')}]`,
        '',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src', 'lib.rs'), 'pub fn bounded() {}\n');
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(evidence.status, 'limited');
    assert.equal(evidence.coverage.workspaceMembersDeclared, 130);
    assert.equal(evidence.coverage.workspaceMembersConsidered, 100);
    assert.equal(evidence.coverage.workspaceMembersLimited, true);
    assert.equal(evidence.unsupportedWorkspaceMembers.length, 50);
    assert.equal(evidence.unsupportedWorkspaceMembersLimited, true);
    assert.equal(evidence.packages[0].featuresDeclared, 60);
    assert.equal(evidence.packages[0].features.length, 48);
    assert.equal(evidence.packages[0].featuresLimited, true);
    assert.equal(evidence.packages[0].features[0].directMappingsCount, 110);
    assert.equal(evidence.packages[0].features[0].directMappings.length, 100);
    assert.equal(evidence.packages[0].features[0].directMappingsLimited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust source inventory stops at the declared repository-wide file budget', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[package]\nname = "source-budget"\n\n[features]\nbounded = []\n',
    );
    for (let index = 0; index < 5002; index += 1) {
      writeFileSync(join(r, 'src', `unit-${String(index).padStart(4, '0')}.rs`), 'pub fn item() {}\n');
    }
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(evidence.status, 'limited');
    assert.equal(evidence.coverage.sourceFileLimit, 5000);
    assert.equal(evidence.coverage.sourceFilesScanned, 5000);
    assert.equal(evidence.coverage.sourceFilesDiscovered, 5001);
    assert.equal(evidence.coverage.sourceFilesLimited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust feature evidence ignores comment and string lookalikes while surfacing unsupported predicates', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[package]\nname = "lexical-safety"\n\n[features]\nsafe = []\n',
    );
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      [
        '// #[cfg(feature = "safe")]',
        '/* #[cfg(feature = "safe")] */',
        'const LOOKALIKE: &str = r#"#[cfg(feature = "safe")]"#;',
        '#[cfg(feature = "safe\\u{2d}")]',
        'mod unsupported;',
        '#[cfg(feature = "safe")]',
        'mod real;',
        '#[cfg_attr(docsrs, doc(cfg(feature = "safe")))]',
        'pub struct DocsOnly;',
        '',
      ].join('\n'),
    );
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(evidence.status, 'limited');
    const feature = evidence.packages[0].features.find((row) => row.name === 'safe');
    assert.equal(feature.referenceCount, 1);
    assert.equal(feature.references[0].line, 6);
    assert.deepEqual(evidence.unsupportedPredicates, {
      count: 1,
      samples: [
        {
          path: 'src/lib.rs',
          line: 4,
          form: 'cfg',
          predicate: 'feature = "safe\\u{2d}"',
          reason: 'non-literal-feature-name',
        },
      ],
      limited: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust cfg evidence ignores .rs fixtures outside conventional Cargo target roots', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    mkdirSync(join(r, 'fixtures'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[package]\nname = "target-roots"\n\n[features]\nreal = []\n',
    );
    writeFileSync(join(r, 'src', 'lib.rs'), '#[cfg(feature = "real")]\npub fn real() {}\n');
    writeFileSync(
      join(r, 'fixtures', 'lookalike.rs'),
      '#[cfg(feature = "real")]\npub fn fixture() {}\n',
    );
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(
      evidence.coverage.scope,
      'literal_cfg_feature_attributes_in_conventional_cargo_targets',
    );
    assert.equal(evidence.packages[0].features[0].referenceCount, 1);
    assert.equal(evidence.packages[0].features[0].references[0].path, 'src/lib.rs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust cfg evidence surfaces literal feature predicates absent from the package declaration', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'Cargo.toml'),
      '[package]\nname = "undeclared-feature"\n\n[features]\ndeclared = []\n',
    );
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      '#[cfg(feature = "missing")]\nmod missing;\n#[cfg(feature = "declared")]\nmod declared;\n',
    );
  });
  try {
    const evidence = analyzeRepoStructure(root).configurationEvidence;
    assert.equal(evidence.status, 'limited');
    assert.equal(evidence.packages[0].features[0].referenceCount, 1);
    assert.deepEqual(evidence.unsupportedPredicates, {
      count: 1,
      samples: [
        {
          path: 'src/lib.rs',
          line: 1,
          form: 'cfg',
          predicate: 'feature = "missing"',
          reason: 'feature-not-declared-in-scanned-table',
        },
      ],
      limited: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('oversized Cargo manifest is skipped before it enters semantic evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Oversized\n\nA bounded packet.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "oversized"',
        'description = "' + 'x'.repeat(300_000) + '"',
        '',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'Cargo.toml'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('Cargo.toml') &&
          row.reason === 'package-contract-skip: Cargo.toml exceeds 262144 bytes',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo manifest symlink outside the repository root is skipped', () => {
  const outside = mkdtempSync(join(tmpdir(), 'ontology-atlas-cargo-outside-'));
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Contained\n\nLocal package evidence.\n');
    writeFileSync(
      join(outside, 'Cargo.toml'),
      '[package]\nname = "outside"\n',
    );
    symlinkSync(join(outside, 'Cargo.toml'), join(r, 'Cargo.toml'));
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'Cargo.toml'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('Cargo.toml') &&
          row.reason === 'package-contract-skip: Cargo.toml resolves outside repository root',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('malformed Cargo package or feature contract is skipped fail-closed', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Broken\n\nA broken manifest fixture.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "broken"',
        '',
        '[features]',
        'complex = ["dep:num-complex"',
        '',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    assert.equal(
      result.semanticEvidence.some((row) => row.source === 'Cargo.toml'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('Cargo.toml') &&
          row.reason === 'package-contract-skip: malformed Cargo.toml package/features contract',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('multiline Cargo feature arrays remain a bounded package contract', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Multiline\n\nA Rust package.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "multiline"',
        '',
        '[features]',
        'default = [',
        '  "rand",',
        '  "serde",',
        ']',
        'parallel = ["dep:rayon"]',
        '',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const cargoEvidence = result.semanticEvidence.find(
      (row) => row.source === 'Cargo.toml',
    );
    assert.match(cargoEvidence.excerpt, /default.*rand, serde/);
    assert.match(cargoEvidence.excerpt, /parallel.*dep:rayon/);
    assert.equal(
      result.skipped.some((row) => row.path.endsWith('Cargo.toml')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-allowlisted multiline package fields do not block Cargo contract evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Allowlist\n\nA Rust package.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        'name = "allowlist"',
        'keywords = [',
        '  "science",',
        '  "math",',
        ']',
        'include = [',
        '  "src/**",',
        ']',
        '',
        '[features]',
        'default = ["science"]',
        '',
      ].join('\n'),
    );
  });
  try {
    const result = analyzeRepoStructure(root);
    const cargoEvidence = result.semanticEvidence.find(
      (row) => row.source === 'Cargo.toml',
    );
    assert.match(cargoEvidence.excerpt, /default.*science/);
    assert.doesNotMatch(cargoEvidence.excerpt, /keywords|src\/\*\*/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo package contract reports omitted feature declarations within the excerpt bound', () => {
  const root = withRepo((r) => {
    const featureLines = Array.from(
      { length: 60 },
      (_, index) => `f${String(index).padStart(2, '0')} = []`,
    );
    writeFileSync(join(r, 'README.md'), '# Bounded\n\nA Rust package.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      ['[package]', 'name = "bounded"', '', '[features]', ...featureLines, ''].join('\n'),
    );
  });
  try {
    const cargoEvidence = analyzeRepoStructure(root).semanticEvidence.find(
      (row) => row.source === 'Cargo.toml',
    );
    assert.ok(cargoEvidence.excerpt.length <= 1200);
    assert.match(cargoEvidence.excerpt, /Feature declarations omitted: 12/);
    assert.doesNotMatch(cargoEvidence.excerpt, /f59/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo package identity metadata stays bounded and visible', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), '# Metadata\n\nA Rust package.\n');
    writeFileSync(
      join(r, 'Cargo.toml'),
      [
        '[package]',
        `name = "${'n'.repeat(120)}"`,
        `version = "${'1'.repeat(120)}"`,
        'edition = "2024"',
        'rust-version = "1.85"',
        '',
      ].join('\n'),
    );
  });
  try {
    const cargoEvidence = analyzeRepoStructure(root).semanticEvidence.find(
      (row) => row.source === 'Cargo.toml',
    );
    assert.ok(cargoEvidence.title.length <= 100);
    assert.match(cargoEvidence.title, /… package contract$/);
    assert.match(cargoEvidence.excerpt, /Version: 1+…/);
    assert.match(cargoEvidence.excerpt, /Edition: 2024/);
    assert.match(cargoEvidence.excerpt, /Rust version: 1\.85/);
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
        '## 한국어', // bare language-name header — translated-README section
        '## English', // bare language-name header — translated-README section
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
    // workspace 멤버 이름이 곧 슬러그 — 위치는 path/evidence 로 (2026-08-01 판정).
    assert.deepEqual(
      r.elements.map((element) => element.slug),
      [
        'elements/api',
        'elements/web',
        'elements/attunement',
        'elements/shared',
      ],
    );
    assert.deepEqual(
      r.elements.map((element) => element.path),
      ['apps/api', 'apps/web', 'packages/attunement', 'packages/shared'],
    );
    assert.deepEqual(
      r.suggestedRelations.map((relation) => relation.to),
      r.elements.map((element) => element.slug),
    );
    assert.deepEqual(
      analyzeRepoStructure(root, { ignore: ['packages'] }).elements.map(
        (element) => element.slug,
      ),
      ['elements/api', 'elements/web'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('최상위 독립 패키지(mcp/·cli/ 류)가 요소 후보로 잡힌다 — package.json 이 판별자', () => {
  // 2026-08-01 실측: analyze 가 src/ FSD 레이어만 걸어 이 저장소의 에이전트
  // 표면(mcp/, cli/)이 재생성 볼트에서 통째로 빠졌다. 도구의 시야가 곧
  // 볼트의 사정거리가 되므로, 사정거리 회귀는 여기서 잡는다.
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'host-app' }));
    writeFileSync(join(r, 'README.md'), '# Host\n\n## Serving\n');
    mkdirSync(join(r, 'src/features/serve'), { recursive: true });
    // 독립 패키지 둘 — 제안돼야 한다.
    mkdirSync(join(r, 'mcp'), { recursive: true });
    writeFileSync(join(r, 'mcp', 'package.json'), '{"name":"host-mcp"}\n');
    mkdirSync(join(r, 'cli'), { recursive: true });
    writeFileSync(join(r, 'cli', 'package.json'), '{"name":"host-cli"}\n');
    // package.json 없는 최상위 폴더 — 제안되면 안 된다 (덮는 것이 목적이 아니다).
    mkdirSync(join(r, 'scripts'), { recursive: true });
    writeFileSync(join(r, 'scripts', 'run.mjs'), '');
    mkdirSync(join(r, 'tests'), { recursive: true });
  });
  try {
    const r = analyzeRepoStructure(root);
    const rootPkgSlugs = r.elements
      .filter((e) => e.path === 'mcp' || e.path === 'cli')
      .map((e) => e.slug)
      .sort();
    assert.deepEqual(rootPkgSlugs, ['elements/cli', 'elements/mcp']);
    assert.equal(
      r.elements.some((e) => e.slug.includes('scripts') || e.slug.includes('tests')),
      false,
    );
    // containment spine 에도 실린다.
    assert.ok(r.suggestedRelations.some((rel) => rel.to === 'elements/mcp'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('top-level Python package becomes implementation evidence without promoting test packages or capabilities', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      'Diagnostic Client\n=================\n\nA diagnostic protocol client.\n',
    );
    writeFileSync(
      join(r, 'setup.py'),
      [
        'setup(',
        "    name='diagnostic-client',",
        "    description='Diagnostic protocol client',",
        ')',
      ].join('\n'),
    );
    mkdirSync(join(r, 'diagnostic_client'), { recursive: true });
    writeFileSync(join(r, 'diagnostic_client/__init__.py'), '');
    mkdirSync(join(r, 'test'), { recursive: true });
    writeFileSync(join(r, 'test/__init__.py'), '');
  });
  try {
    const result = analyzeRepoStructure(root);
    const pythonPackage = result.elements.find(
      (row) => row.slug === 'elements/diagnostic-client',
    );

    assert.equal(pythonPackage?.title, 'Diagnostic Client');
    assert.equal(pythonPackage?.path, 'diagnostic_client');
    assert.equal(pythonPackage?.evidence.source, 'diagnostic_client');
    assert.equal(result.elements.some((row) => row.slug === 'elements/test'), false);
    assert.equal(result.capabilities.some((row) => row.slug.includes('diagnostic')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Python import boundaries become bounded element evidence without mirroring unused files', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      'Diagnostic Client\n=================\n\nA diagnostic protocol client.\n',
    );
    writeFileSync(
      join(r, 'setup.py'),
      [
        'setup(',
        "    name='diagnostic-client',",
        ')',
      ].join('\n'),
    );
    mkdirSync(join(r, 'diagnostic_client/services'), { recursive: true });
    writeFileSync(join(r, 'diagnostic_client/__init__.py'), '');
    writeFileSync(
      join(r, 'diagnostic_client/client.py'),
      'from . import transport\nfrom .services import requests\nfrom .services import SecurityAccess\n',
    );
    writeFileSync(join(r, 'diagnostic_client/transport.py'), '');
    writeFileSync(join(r, 'diagnostic_client/services/__init__.py'), '');
    writeFileSync(join(r, 'diagnostic_client/services/requests.py'), '');
    writeFileSync(join(r, 'diagnostic_client/services/SecurityAccess.py'), '');
    writeFileSync(join(r, 'diagnostic_client/unused.py'), '');
  });
  try {
    const result = analyzeRepoStructure(root);
    const evidence = result.elements
      .map(({ slug, path }) => ({ slug, path }))
      .sort((a, b) => a.slug.localeCompare(b.slug));

    assert.deepEqual(evidence, [
      { slug: 'elements/client', path: 'diagnostic_client/client.py' },
      { slug: 'elements/diagnostic-client', path: 'diagnostic_client' },
      {
        slug: 'elements/security-access',
        path: 'diagnostic_client/services/SecurityAccess.py',
      },
      { slug: 'elements/services', path: 'diagnostic_client/services' },
      { slug: 'elements/transport', path: 'diagnostic_client/transport.py' },
    ]);
    assert.equal(
      result.elements.some((row) => row.path === 'diagnostic_client/unused.py'),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Python import boundary paths can support a validated impact proposal', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'README.rst'),
      'Diagnostic Client\n=================\n\nA diagnostic protocol client for application developers.\n',
    );
    writeFileSync(
      join(r, 'setup.py'),
      [
        'setup(',
        "    name='diagnostic-client',",
        ')',
      ].join('\n'),
    );
    mkdirSync(join(r, 'diagnostic_client/services'), { recursive: true });
    writeFileSync(join(r, 'diagnostic_client/__init__.py'), '');
    writeFileSync(
      join(r, 'diagnostic_client/client.py'),
      [
        'from .services import requests',
        'from .services import detail_one',
        'from .services import detail_two',
        'from .services import detail_three',
        'from .services import detail_four',
      ].join('\n'),
    );
    writeFileSync(join(r, 'diagnostic_client/services/__init__.py'), '');
    writeFileSync(join(r, 'diagnostic_client/services/requests.py'), '');
    for (const name of ['detail_one', 'detail_two', 'detail_three', 'detail_four']) {
      writeFileSync(join(r, `diagnostic_client/services/${name}.py`), '');
    }
  });
  try {
    const dependency = {
      from: 'elements/client',
      to: 'elements/services',
      type: 'depends_on',
    };
    const containment = {
      projectDomain: {
        from: 'diagnostic-client',
        to: 'domains/diagnostics',
        type: 'contains',
      },
      domainCapability: {
        from: 'domains/diagnostics',
        to: 'capabilities/request-execution',
        type: 'contains',
      },
    };
    const relation = (edge, why, evidence) => ({
      ...edge,
      why,
      evidence,
      confidence: 0.9,
    });
    const answer = (text, witnesses) => ({
      answer: text,
      status: 'answered',
      witnesses: {
        concepts: witnesses.concepts ?? [],
        relations: witnesses.relations ?? [],
        evidence: witnesses.evidence ?? [],
        paths: witnesses.paths ?? [],
      },
    });
    const proposal = {
      project: {
        slug: 'diagnostic-client',
        title: 'Diagnostic Client',
        definition: 'A protocol client that lets applications issue diagnostic requests.',
        evidence: ['README.rst'],
        confidence: 0.9,
      },
      domains: [{
        slug: 'domains/diagnostics',
        title: 'Diagnostics',
        definition: 'The responsibility boundary for diagnostic request behavior.',
        evidence: ['README.rst'],
        confidence: 0.8,
      }],
      capabilities: [{
        slug: 'capabilities/request-execution',
        title: 'Request Execution',
        definition: 'Create diagnostic requests and interpret their responses.',
        domain: 'domains/diagnostics',
        path: 'diagnostic_client/client.py',
        evidence: ['README.rst'],
        confidence: 0.8,
      }],
      elements: [
        {
          slug: 'elements/client',
          title: 'Client',
          definition: 'The concrete request execution entrypoint.',
          domain: 'domains/diagnostics',
          path: 'diagnostic_client/client.py',
          evidence: ['diagnostic_client/client.py'],
          confidence: 0.9,
        },
        {
          slug: 'elements/services',
          title: 'Services',
          definition: 'The concrete service behavior package used by the client.',
          domain: 'domains/diagnostics',
          path: 'diagnostic_client/services',
          evidence: ['diagnostic_client/services'],
          confidence: 0.9,
        },
      ],
      relations: [
        relation(containment.projectDomain, 'The project contains the diagnostics responsibility.', ['README.rst']),
        relation(containment.domainCapability, 'Diagnostics contains request execution.', ['README.rst']),
        relation(dependency, 'The client statically imports the services package.', ['diagnostic_client/client.py']),
      ],
      competencyAnswers: {
        scope: answer('Application developers use the client to issue diagnostic requests.', {
          concepts: ['diagnostic-client'],
          evidence: ['README.rst'],
        }),
        domains: answer('Diagnostics owns diagnostic request behavior.', {
          concepts: ['domains/diagnostics'],
          relations: [containment.projectDomain],
          evidence: ['README.rst'],
        }),
        abilities: answer('Request execution creates requests and interprets responses.', {
          concepts: ['capabilities/request-execution'],
          relations: [containment.domainCapability],
          evidence: ['README.rst'],
        }),
        evidence: answer('The client module is the concrete implementation entrypoint.', {
          concepts: ['capabilities/request-execution', 'elements/client'],
          evidence: ['diagnostic_client/client.py'],
          paths: ['diagnostic_client/client.py'],
        }),
        impact: answer('Changing services can affect client request execution.', {
          concepts: ['elements/client', 'elements/services'],
          relations: [dependency],
          evidence: ['diagnostic_client/client.py'],
        }),
      },
    };

    const result = analyzeRepoStructure(root, { proposal });

    assert.equal(
      result.proposalValidation.canWrite,
      false,
      JSON.stringify(result.proposalValidation.findings),
    );
    assert.ok(result.proposalValidation.reviewPlan);
    assert.equal(result.proposalValidation.writePlan, undefined);
    assert.equal(result.proposalValidation.constructionLifecycle.writeEligibility, 'reviewable');
    assert.equal(
      result.proposalValidation.gates.competencyQuestionsAnswered,
      true,
      JSON.stringify(result.proposalValidation.findings),
    );
    assert.equal(
      result.proposalValidation.findings.some((row) =>
        ['unknown-citation', 'missing-impact-dependency-witness'].includes(row.code)),
      false,
    );

    const exactNestedDependency = {
      from: 'elements/client',
      to: 'elements/service-requests',
      type: 'depends_on',
    };
    const exactNested = structuredClone(proposal);
    exactNested.elements.push({
      slug: 'elements/service-requests',
      title: 'Service requests',
      definition: 'The selected service request implementation imported by the client.',
      domain: 'domains/diagnostics',
      path: 'diagnostic_client/services/requests.py',
      evidence: ['diagnostic_client/services/requests.py'],
      confidence: 0.9,
    });
    exactNested.relations[2] = relation(
      exactNestedDependency,
      'The client statically imports the selected service request module.',
      ['diagnostic_client/client.py', 'diagnostic_client/services/requests.py'],
    );
    exactNested.competencyAnswers.impact.witnesses.concepts = [
      'elements/client',
      'elements/service-requests',
    ];
    exactNested.competencyAnswers.impact.witnesses.relations = [exactNestedDependency];
    exactNested.competencyAnswers.impact.witnesses.evidence = [
      'diagnostic_client/client.py',
      'diagnostic_client/services/requests.py',
    ];

    const exactNestedResult = analyzeRepoStructure(root, { proposal: exactNested });
    assert.equal(exactNestedResult.proposalValidation.canWrite, false);
    assert.ok(exactNestedResult.proposalValidation.reviewPlan);
    assert.equal(
      exactNestedResult.elements.some(
        (row) => row.path === 'diagnostic_client/services/requests.py',
      ),
      false,
    );

    const reversedExactDependency = {
      from: 'elements/service-requests',
      to: 'elements/client',
      type: 'depends_on',
    };
    const reversedExact = structuredClone(exactNested);
    reversedExact.relations[2] = relation(
      reversedExactDependency,
      'The selected service request module statically imports the client.',
      ['diagnostic_client/services/requests.py', 'diagnostic_client/client.py'],
    );
    reversedExact.competencyAnswers.impact.witnesses.relations = [
      reversedExactDependency,
    ];

    const reversedExactResult = analyzeRepoStructure(root, {
      proposal: reversedExact,
    });
    assert.equal(reversedExactResult.proposalValidation.canWrite, false);
    assert.ok(
      reversedExactResult.proposalValidation.findings.some(
        (row) => row.code === 'unobserved-python-import-dependency',
      ),
    );

    const overSelectedLimit = structuredClone(exactNested);
    for (const name of ['detail-one', 'detail-two', 'detail-three', 'detail-four']) {
      const path = `diagnostic_client/services/${name.replace('-', '_')}.py`;
      overSelectedLimit.elements.push({
        slug: `elements/${name}`,
        title: name,
        definition: 'A selectively proposed exact import endpoint.',
        domain: 'domains/diagnostics',
        path,
        evidence: [path],
        confidence: 0.7,
      });
    }
    const overSelectedLimitResult = analyzeRepoStructure(root, {
      proposal: overSelectedLimit,
    });
    assert.equal(overSelectedLimitResult.proposalValidation.canWrite, false);
    assert.ok(
      overSelectedLimitResult.proposalValidation.findings.some(
        (row) => row.code === 'python-selected-import-element-limit',
      ),
    );

    const reversedDependency = {
      from: 'elements/services',
      to: 'elements/client',
      type: 'depends_on',
    };
    const unsupported = structuredClone(proposal);
    unsupported.relations[2] = relation(
      reversedDependency,
      'The services package imports the client.',
      ['diagnostic_client/services'],
    );
    unsupported.competencyAnswers.impact.witnesses.relations = [reversedDependency];
    unsupported.competencyAnswers.impact.witnesses.evidence = ['diagnostic_client/services'];

    const unsupportedResult = analyzeRepoStructure(root, { proposal: unsupported });
    assert.equal(unsupportedResult.proposalValidation.canWrite, false);
    assert.ok(
      unsupportedResult.proposalValidation.findings.some(
        (row) => row.code === 'unobserved-python-import-dependency',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Python import element evidence is capped and reports omitted boundaries', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'pkg'), { recursive: true });
    writeFileSync(join(r, 'pkg/__init__.py'), '');
    const moduleNames = Array.from({ length: 14 }, (_, index) => `module_${index + 1}`);
    writeFileSync(
      join(r, 'pkg/hub.py'),
      moduleNames.map((name) => `from . import ${name}`).join('\n'),
    );
    for (const name of moduleNames) {
      writeFileSync(join(r, `pkg/${name}.py`), '');
    }
  });
  try {
    const result = analyzeRepoStructure(root);
    const importBoundaries = result.elements.filter((row) => row.path !== 'pkg');

    assert.equal(importBoundaries.length, 12);
    assert.ok(importBoundaries.some((row) => row.slug === 'elements/hub'));
    assert.ok(
      result.skipped.some(
        (row) => row.reason === 'python-import-element-limit: omitted 3 lower-ranked boundaries',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repository-escaping Python package symlinks do not become implementation evidence', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, '__init__.py'), '');
    writeFileSync(join(r, 'client.py'), '');
  });
  const root = withRepo((r) => {
    symlinkSync(outside, join(r, 'escaped_package'));
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.equal(
      result.elements.some((row) => row.path === 'escaped_package'),
      false,
    );
    assert.ok(
      result.skipped.some(
        (row) =>
          row.path.endsWith('escaped_package') &&
          row.reason === 'python-package-skip: path resolves outside repository root',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('Markdown setext H2 is not mistaken for the project title', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'README.md'), 'Installation\n------------\n\nUse pip.\n');
  });
  try {
    const result = analyzeRepoStructure(root);

    assert.notEqual(result.project.title, 'Installation');
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
      { from: 'domains/accounts', to: 'elements/session', type: 'contains' },
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
      { from: 'domains/claim-review', to: 'elements/claim', type: 'contains' },
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
      'elements/header',
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
    assert.deepEqual(
      r.extractionContract.competencyQuestions.map((question) => question.id),
      ['scope', 'domains', 'abilities', 'evidence', 'impact'],
    );
    assert.deepEqual(
      r.extractionContract.competencyQuestions.map((question) => question.type),
      ['scoping', 'scoping', 'validation', 'validation', 'relationship'],
    );
    assert.deepEqual(
      r.extractionContract.competencyQuestions.find(
        (question) => question.id === 'impact',
      ).requiredWitnesses,
      ['concepts', 'relations', 'evidence'],
    );
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
