#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import {
  checkPackage,
  checkMcpLeanTarballFiles,
  importedSpecifiers,
  isCoveredByFiles,
  isPublishRuntimeScript,
  packageEntrypoints,
  parseScriptFileRefs,
} from './check-package-contracts.mjs';
import { dogfoodVaultCensus } from './lib/vault-census.mjs';

function withPackage(pkg, files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'omot-package-contract-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('package contract helpers', () => {
  it('keeps filtered integration scripts discoverable from the root README', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const readme = readFileSync('README.md', 'utf-8');

    assert.equal(pkg.scripts?.['integration:cli'], 'node --test cli/src/integration.test.mjs');
    assert.equal(pkg.scripts?.['integration:mcp'], 'node --test mcp/src/integration.test.mjs');
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli/);
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="tools\/list\|initialize" pnpm integration:mcp/);
  });

  it('keeps the MCP first-call prompt read-only', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const firstCallSection = readme.split('## First call after registering with Claude Code')[1]?.split('## Design principles')[0] ?? '';
    const validateVaultRow = readme.split('| `validate_vault` |')[1]?.split('\n')[0] ?? '';

    assert.match(firstCallSection, /validate_vault\(\{\}\)/);
    assert.match(firstCallSection, /query_ontology\(\{ operation: "workspace_brief" \}\)/);
    assert.match(firstCallSection, /read-only calls respond cleanly/);
    assert.doesNotMatch(firstCallSection, /add_concept/);
    assert.doesNotMatch(firstCallSection, /those four tools/);
    assert.match(validateVaultRow, /first-contact before writes/);
  });

  it('keeps the MCP README explicit about get_concepts partial rows', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const row = readme.split('| `get_concepts` |')[1]?.split('\n')[0] ?? '';

    assert.match(row, /Missing or invalid slug rows return/);
    assert.match(row, /rather than aborting the batch/);
    assert.match(row, /later valid slugs still resolve/);
  });

  it('keeps the MCP verify README aligned with first-contact census gates', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const verifySection = readme.split('### One-line verify CLI')[1]?.split('### Manual verification')[0] ?? '';

    assert.match(verifySection, /list_concepts\/get_concepts\/list_kinds/);
    assert.match(verifySection, /✓ get_concepts — 2 ok rows, 1 partial rows/);
    assert.match(verifySection, /✓ list_kinds/);
    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /batch success rows\s+and partial rows are verified during installation checks/);
    assert.match(verifySection, /`list_kinds` \/ `compile_ontology` \/ `overview`\s+census shape\/count mismatches/);
  });

  it('keeps the MCP changelog aligned with the verify census gates', () => {
    const changelog = readFileSync('mcp/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Fixed — package tarball runtime files')[1]?.split('## 0.11.0')[0] ?? '';

    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /success-row \/ partial-row contract drift/);
    assert.match(verifySection, /`compile_ontology`, `overview`, and `overview query_plan`/);
    assert.match(verifySection, /cross-checks `list_kinds` census totals/);
    assert.match(verifySection, /`list_concepts`, `validate_vault`, `compile_ontology`, and `overview`/);
  });

  it('keeps the CLI README explicit about mcp-verify help scope', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /get_concepts/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /stdout/);
    assert.match(verifySection, /overview query_plan/);
  });

  it('keeps the CLI changelog aligned with the mcp-verify census scope', () => {
    const changelog = readFileSync('cli/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Added — `mcp-verify` command')[1]?.split('### Added — `compile`')[0] ?? '';

    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /`overview`, and `overview query_plan`/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';

    assert.match(releaseChecks, /pnpm dogfood:walk/);
    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /get_concepts` with discovered slugs plus one\s+missing slug/);
    assert.match(releaseChecks, /batch-read\s+partial-row contract/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /graph-query smoke scope/);
    assert.match(releaseChecks, /flow\/help\/failure/);
    assert.match(releaseChecks, /dependency-cycle vault/);
    assert.match(releaseChecks, /get_concepts` success\/partial rows/);
    assert.match(releaseChecks, /workspace-brief --json` exits 1/);
    assert.match(releaseChecks, /fail-severity nextActions/);
    assert.match(releaseChecks, /compile --json` exits 1/);
    assert.match(releaseChecks, /unresolved graph references/);
    assert.match(releaseChecks, /cycles --json` exits 1/);
    assert.match(releaseChecks, /dependency cycles/);
    assert.match(releaseChecks, /path --json` exits 1/);
    assert.match(releaseChecks, /found:false/);
    assert.match(releaseChecks, /validate_vault` problem files/);
  });

  it('keeps the self-ontology README census aligned with the vault files', () => {
    const readme = readFileSync('docs/ontology/README.md', 'utf-8');
    const census = dogfoodVaultCensus(process.cwd());

    assert.match(readme, new RegExp(`총 ${census.total} 노드`));
    assert.match(readme, new RegExp(`도메인 ${census.byKind.domains}개`));
    assert.match(readme, new RegExp(`capability ${census.byKind.capabilities}개`));
    assert.match(readme, new RegExp(`element ${census.byKind.elements}개`));
  });

  it('keeps dogfood CLI capability docs from freezing integration test counts', () => {
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const regressionSection = doc.split('## 회귀 차단')[1] ?? '';

    assert.doesNotMatch(regressionSection, /\*\*\d+ spawn-based\*\* integration test/);
    assert.match(regressionSection, /spawn-based integration suite/);
  });

  it('parses package script file references', () => {
    assert.deepEqual(parseScriptFileRefs('node --test src/a.test.mjs scripts/check.mjs'), [
      'src/a.test.mjs',
      'scripts/check.mjs',
    ]);
  });

  it('ignores test scripts when deriving publish runtime entrypoints', () => {
    assert.equal(isPublishRuntimeScript('start'), true);
    assert.equal(isPublishRuntimeScript('verify'), true);
    assert.equal(isPublishRuntimeScript('test'), false);
    assert.equal(isPublishRuntimeScript('test:smoke'), false);

    withPackage(
      {
        name: 'scripts',
        main: 'src/index.mjs',
        scripts: {
          verify: 'node scripts/verify.mjs',
          test: 'node src/integration.test.mjs',
          'test:smoke': 'node src/parser.test.mjs',
        },
        files: ['src/index.mjs', 'scripts/verify.mjs'],
      },
      {
        'src/index.mjs': 'export const ok = true;\n',
        'scripts/verify.mjs': 'export const verify = true;\n',
        'src/integration.test.mjs': 'throw new Error("not runtime");\n',
        'src/parser.test.mjs': 'throw new Error("not runtime");\n',
      },
      (dir) => {
        const entrypoints = packageEntrypoints(
          {
            main: 'src/index.mjs',
            scripts: {
              verify: 'node scripts/verify.mjs',
              test: 'node src/integration.test.mjs',
              'test:smoke': 'node src/parser.test.mjs',
            },
          },
          dir,
        ).map((entry) => entry.replace(`${dir}/`, ''));

        assert.deepEqual(entrypoints.sort(), ['scripts/verify.mjs', 'src/index.mjs']);
      },
    );
  });

  it('parses static side-effect, re-export, multiline, and dynamic imports', () => {
    const source = `
import './side-effect.mjs';
export { value as reexported } from './re-export.mjs';
import {
  value,
} from './multi-line.mjs';
const mod = await import('./dynamic.mjs');
writeFileSync('fixture.mjs', "import './not-real.mjs';");
`;

    assert.deepEqual(importedSpecifiers(source).sort(), [
      './side-effect.mjs',
      './re-export.mjs',
      './multi-line.mjs',
      './dynamic.mjs',
    ].sort());
  });

  it('parses CLI command registry runner entries as reachable command modules', () => {
    const source = `
function runner(moduleFile, exportName) {
  return { modulePath: \`./commands/\${moduleFile}\`, moduleFile, exportName };
}
export const CLI_COMMAND_RUNNERS = Object.freeze({
  list: runner('list.mjs', 'runList'),
  'mcp-verify': runner("mcp-verify.mjs", 'runMcpVerify'),
});
`;

    assert.deepEqual(importedSpecifiers(source).sort(), [
      '../commands/list.mjs',
      '../commands/mcp-verify.mjs',
    ].sort());
  });

  it('matches files entries by exact file, directory, and glob', () => {
    assert.equal(isCoveredByFiles('src/index.mjs', ['src/index.mjs']), true);
    assert.equal(isCoveredByFiles('src/lib/a.mjs', ['src/lib']), true);
    assert.equal(isCoveredByFiles('src/lib/a.test.mjs', ['src/lib/*.test.mjs']), true);
    assert.equal(isCoveredByFiles('src/lib/a.test.mjs', ['src/*.test.mjs']), false);
  });

  it('allows only the parser smoke fixture in the MCP tarball', () => {
    assert.doesNotThrow(() =>
      checkMcpLeanTarballFiles(['src/index.js', 'src/parser.mjs', 'src/parser.test.mjs']),
    );

    assert.throws(
      () => checkMcpLeanTarballFiles(['src/index.js', 'src/*.test.mjs']),
      /must not use broad test globs/,
    );

    assert.throws(
      () => checkMcpLeanTarballFiles(['src/index.js', 'src/integration.test.mjs']),
      /only src\/parser\.test\.mjs may ship/,
    );
  });
});

describe('checkPackage', () => {
  it('passes when reachable files and files entries match', () => {
    withPackage(
      {
        name: 'ok',
        main: 'src/index.mjs',
        files: ['src/index.mjs', 'src/lib'],
      },
      {
        'src/index.mjs': "import './lib/util.mjs';\n",
        'src/lib/util.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.doesNotThrow(() => checkPackage({ label: 'ok', dir }, { silent: true }));
      },
    );
  });

  it('fails when a reachable import is missing from files', () => {
    withPackage(
      {
        name: 'missing-reachable',
        main: 'src/index.mjs',
        files: ['src/index.mjs'],
      },
      {
        'src/index.mjs': "import './lib/util.mjs';\n",
        'src/lib/util.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.throws(
          () => checkPackage({ label: 'missing-reachable', dir }, { silent: true }),
          /src\/lib\/util\.mjs is reachable/,
        );
      },
    );
  });

  it('fails when a files entry matches nothing', () => {
    withPackage(
      {
        name: 'stale-entry',
        main: 'src/index.mjs',
        files: ['src/index.mjs', 'src/missing/*.mjs'],
      },
      {
        'src/index.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.throws(
          () => checkPackage({ label: 'stale-entry', dir }, { silent: true }),
          /entry does not match any package file: src\/missing\/\*\.mjs/,
        );
      },
    );
  });
});
