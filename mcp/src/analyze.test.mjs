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
    assert.equal(result.proposalValidation.canWrite, true);
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
