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
    assert.match(verifySection, /✓ tools\/list schema contract — strict arguments \+ graph-query enums/);
    assert.match(verifySection, /✓ strict arguments — unknown tool argument rejected at runtime/);
    assert.match(verifySection, /✓ get_concepts — 2 ok rows, 1 partial rows/);
    assert.match(verifySection, /✓ list_kinds/);
    assert.match(verifySection, /✓ workspace_brief — healthy \(28 nodes, nextActions 0, healthChecks 5\)/);
    assert.match(verifySection, /✓ health — healthy \(5 checks: compile_issues:pass/);
    assert.match(verifySection, /✓ neighbors — project/);
    assert.match(verifySection, /✓ path — project/);
    assert.match(verifySection, /✓ project_scope — project/);
    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /batch success rows\s+and partial rows are verified during installation checks/);
    assert.match(verifySection, /`query_ontology\(\{operation:"neighbors"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"path"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"project_scope"\}\)`/);
    assert.match(verifySection, /`additionalProperties:false`/);
    assert.match(verifySection, /required `query_ontology\.operation`/);
    assert.match(verifySection, /`query_ontology\.operation` \/[\s\S]*`query_ontology\.targetOperation` enums/);
    assert.match(verifySection, /same 50-row cap used by `get_concepts`, `add_concepts`,\s+and `add_relations`/);
    assert.match(verifySection, /write-safety schemas for `expected_mtime`/);
    assert.match(verifySection, /destructive-tool `confirm` dry-run switches/);
    assert.match(verifySection, /runtime negative call with `list_concepts\.lmit`/);
    assert.match(verifySection, /project-less vaults skip/);
    assert.match(verifySection, /Empty vaults skip node-targeted graph smoke/);
    assert.match(verifySection, /`list_kinds` \/ `compile_ontology` \/ `overview`\s+census shape\/count mismatches/);
    assert.match(verifySection, /Missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /`workspace_brief\.nextActions`/);
    assert.match(verifySection, /`workspace_brief\.health\.checks`/);
    assert.match(verifySection, /`health\.checks`/);
  });

  it('keeps the MCP changelog aligned with the verify census gates', () => {
    const changelog = readFileSync('mcp/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Fixed — package tarball runtime files')[1]?.split('## 0.11.0')[0] ?? '';

    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /success-row \/ partial-row contract drift/);
    assert.match(verifySection, /`compile_ontology`, `overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query execution with `neighbors`, self-`path`, and `project_scope`/);
    assert.match(verifySection, /skips only the containment-specific `project_scope` smoke/);
    assert.match(verifySection, /accepts empty vault folders by skipping node-targeted graph smoke/);
    assert.match(verifySection, /cross-checks `list_kinds` census totals/);
    assert.match(verifySection, /`list_concepts`, `validate_vault`, `compile_ontology`, and `overview`/);
    assert.match(verifySection, /missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /`workspace_brief\.nextActions`, `workspace_brief\.health\.checks`, `health\.checks`/);
    assert.match(verifySection, /requires every `workspace_brief\.nextActions` row to include a non-empty `id` or `kind` plus non-empty `severity`/);
    assert.match(verifySection, /requires every health check row to include non-empty `id` and `status`/);
    assert.match(verifySection, /prints the validated `workspace_brief\.health\.checks` count/);
    assert.match(verifySection, /health check `id:status` coverage/);
    assert.match(verifySection, /validates the installed `tools\/list` schema contract/);
    assert.match(verifySection, /`query_ontology\.operation` must stay required/);
    assert.match(verifySection, /graph engine runtime allow-lists/);
    assert.match(verifySection, /batch tools must keep their 50-row caps/);
    assert.match(verifySection, /write tools must keep their `expected_mtime` \/ `confirm` safety schemas/);
    assert.match(verifySection, /runtime negative smoke call with invalid `list_concepts\.lmit` arguments/);
  });

  it('keeps the CLI README explicit about mcp-verify help scope', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /`tools\/list` schema contract/);
    assert.match(verifySection, /runtime negative smoke with an invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /Batch tool caps/);
    assert.match(verifySection, /Write-safety schema/);
    assert.match(verifySection, /get_concepts/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /stdout/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors`/);
    assert.match(verifySection, /`path` \/ `project_scope` calls/);
    assert.match(verifySection, /Vaults without a `kind: project` node skip/);
    assert.match(verifySection, /empty vault folders skip\s+node-targeted graph smoke/);
  });

  it('keeps the CLI changelog aligned with the mcp-verify census scope', () => {
    const changelog = readFileSync('cli/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Added — `mcp-verify` command')[1]?.split('### Added — `compile`')[0] ?? '';

    assert.match(verifySection, /`list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query smoke for `neighbors`, self-`path`, and `project_scope`/);
    assert.match(verifySection, /accepts valid project-less vaults/);
    assert.match(verifySection, /accepts empty vault folders/);
    assert.match(verifySection, /runtime unknown-argument rejection smoke/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';

    assert.match(releaseChecks, /pnpm dogfood:walk/);
    assert.match(releaseChecks, /strict unknown-argument rejection/);
    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /get_concepts` with discovered slugs plus one\s+missing slug/);
    assert.match(releaseChecks, /batch-read\s+partial-row contract/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /graph-query and strict-argument smoke scope/);
    assert.match(releaseChecks, /actual `neighbors`, self-`path`, and\s+`project_scope` calls/);
    assert.match(releaseChecks, /project-less and empty-vault verify paths/);
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
    assert.match(releaseChecks, /fail-closed/);
    assert.match(releaseChecks, /malformed `cycles`/);
    assert.match(releaseChecks, /`path`, `health`, or `workspace-brief` payloads/);
    assert.match(releaseChecks, /workspace_brief\.nextActions/);
    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(releaseChecks, /validate_vault` problem files/);
  });

  it('keeps dogfood CLI docs explicit about fail-closed graph diagnostics', () => {
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const mcpVerifyRow = doc.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const implementationSection = doc.split('## 구현 단일 진실원')[1]?.split('## 회귀 차단')[0] ?? '';

    assert.match(mcpVerifyRow, /실제 `neighbors` \/ self-`path` \/ `project_scope` graph smoke/);
    assert.match(mcpVerifyRow, /project-less vault/);
    assert.match(mcpVerifyRow, /empty vault/);
    assert.match(mcpVerifyRow, /node-targeted graph smoke/);
    assert.match(implementationSection, /query-result-contract\.mjs/);
    assert.match(implementationSection, /malformed `cycles` \/ `path` \/ `health` \/ `workspace-brief` payload/);
    assert.match(implementationSection, /fail-closed/);
  });

  it('keeps dogfood MCP docs explicit about workspace brief health checks', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';
    const dogfoodSection = doc.split('dogfood walk 는 `find_evidence.matches`')[1]?.split('기본 server wait')[0] ?? '';

    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /workspace_brief\.nextActions/);
    assert.match(dogfoodSection, /health\.checks/);
    assert.match(dogfoodSection, /identifier\/severity/);
    assert.match(dogfoodSection, /id\/status\/count/);
    assert.match(dogfoodSection, /`project_map` query_plan/);
    assert.match(dogfoodSection, /실제\s+`project_map` 실행/);
    assert.match(dogfoodSection, /`neighbors`/);
    assert.match(dogfoodSection, /`path`/);
    assert.match(dogfoodSection, /`project_scope`/);
    assert.match(dogfoodSection, /`domain_profile`/);
    assert.match(dogfoodSection, /`domain_matrix`/);
    assert.match(dogfoodSection, /`components`/);
    assert.match(dogfoodSection, /`reachability`/);
    assert.match(dogfoodSection, /`impact`/);
    assert.match(dogfoodSection, /`blast_radius`/);
    assert.match(dogfoodSection, /`subgraph`/);
    assert.match(dogfoodSection, /`schema`/);
    assert.match(dogfoodSection, /`facets`/);
    assert.match(dogfoodSection, /`match_nodes`/);
    assert.match(dogfoodSection, /`match_edges`/);
    assert.match(dogfoodSection, /`node_profile`/);
    assert.match(dogfoodSection, /`centrality`/);
    assert.match(dogfoodSection, /`communities`/);
    assert.match(dogfoodSection, /`similar_nodes`/);
    assert.match(dogfoodSection, /`explain_relation`/);
    assert.match(dogfoodSection, /`lineage`/);
    assert.match(dogfoodSection, /`containment_tree`/);
    assert.match(dogfoodSection, /`cycles`/);
    assert.match(dogfoodSection, /`topological_order`/);
    assert.match(dogfoodSection, /`relation_check`/);
    assert.match(dogfoodSection, /`recommend_relations`/);
    assert.match(dogfoodSection, /strict unknown-argument rejection smoke/);
    assert.match(dogfoodSection, /`growth_plan`/);
    assert.match(dogfoodSection, /`maintenance_plan`/);

    const verifySection = doc.split('환경변수 `OMOT_VAULT`')[1]?.split('`get_concepts` 는')[0] ?? '';
    assert.match(verifySection, /실제 `neighbors` \/[\s\S]*self-`path` \/ `project_scope`/);
    assert.match(verifySection, /project\s+노드가 있을 때만 containment hard gate/);
    assert.match(verifySection, /빈 vault 는 node-targeted graph\s+smoke 를 skip/);
    assert.match(verifySection, /strict schema\/runtime unknown-argument rejection/);
  });

  it('keeps packed CLI smoke aligned with installed hard gates', () => {
    const smoke = readFileSync('scripts/smoke-packed-cli.mjs', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const smokeSection = doc.split('scripts/smoke-packed-cli.mjs —')[1]?.split('scripts/check-package-contracts.mjs')[0] ?? '';

    assert.match(smoke, /runRaw\(cliBin, \['cycles', cycleVault, '--json'\]/);
    assert.match(smoke, /assert\.equal\(blockingCycles\.status, 1\)/);
    assert.match(smoke, /runRaw\(cliBin, \['compile', danglingVault, '--json'\]/);
    assert.match(smoke, /assert\.equal\(blockingCompile\.status, 1\)/);
    assert.match(smoke, /\['path', 'capabilities\/a', 'capabilities\/b', disconnectedVault, '--json'\]/);
    assert.match(smoke, /assert\.equal\(missingPath\.status, 1\)/);
    assert.match(smoke, /workspace_brief — \.\*healthChecks/);
    assert.match(smoke, /health — \.\*compile_issues:\(pass\|warn\)/);
    assert.match(smoke, /health — \.\*checks/);
    assert.match(smoke, /neighbors\\\/path\\\/project_scope graph-query smoke/);
    assert.match(smoke, /runtime unknown-argument rejection smoke/);
    assert.match(smoke, /project_scope — skipped \\\(no project node in vault\\\)/);
    assert.match(smoke, /neighbors\\\/path — skipped \\\(vault has no nodes\\\)/);
    assert.match(smokeSection, /cycles --json/);
    assert.match(smokeSection, /compile --json/);
    assert.match(smokeSection, /path --json/);
    assert.match(smokeSection, /health check count/);
    assert.match(smokeSection, /`overview`\/`project_map` query_plan \/ `neighbors` \/ `path` \//);
    assert.match(smokeSection, /`project_scope` smoke/);
    assert.match(smokeSection, /strict argument smoke/);
    assert.match(smokeSection, /project-less vault/);
    assert.match(smokeSection, /empty vault/);
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
