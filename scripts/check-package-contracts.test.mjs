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

  it('keeps the CLI README explicit about mcp-verify help scope', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /stdout/);
    assert.match(verifySection, /overview query_plan/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';

    assert.match(releaseChecks, /pnpm dogfood:walk/);
    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /graph-query smoke scope/);
    assert.match(releaseChecks, /validate_vault` problem files/);
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
