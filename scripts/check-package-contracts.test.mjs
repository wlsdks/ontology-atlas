#!/usr/bin/env node
//
// **This file's criterion** (2026-08-01, owner's decision — `docs/DECISIONS.md`):
//
//   Check only what a machine can generate. Never check a sentence a human wrote.
//
// The previous version was 3,419 lines with 2,126 assertions, of which 1,915 (90%)
// asked "does the README contain this sentence". Those pins **failed to catch what
// they were for** — when a tool's behaviour changed and the docs did not, the
// sentence was unchanged and it passed — and they **blocked improvement**: rewriting
// a document in better words turned it red. This file itself repeatedly carried
// comments saying the gate was wrong and the document was right.
//
// Only three kinds remain:
//   1. Comparison against values derived from code (enums, counts, versions,
//      computed summary strings)
//   2. Referential integrity (does a `pnpm ...` a document names exist, does a node
//      the vault README names exist, does a glob cover everything on disk)
//   3. Executability (does the script actually run) + package structure (tarball,
//      entry points)
//
// What the prose *describes* is now covered by two other nets:
//   - `pnpm docs:surface:check` — regenerates the surface from the registry and
//     diffs it, then checks the registered tool/command names appear in the README.
//   - `pnpm docs:links` — broken links and citations of files that do not exist.
//
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import {
  expectedToolsListAnnotationSummary,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
} from '../mcp/scripts/verify.mjs';
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../mcp/src/ontology-engine.mjs';
import { RELATION_TYPE_VALUES as CLI_RELATION_TYPE_VALUES } from '../cli/src/lib/relation-types.mjs';
import { SERVER_VERSION } from '../mcp/src/server-version.mjs';
import { parseMcpToolMetadataFromDescription } from '../cli/src/lib/mcp-metadata.mjs';
import {
  checkPackage,
  checkMcpLeanTarballFiles,
  importedSpecifiers,
  isCoveredByFiles,
  isPublishRuntimeScript,
  packageEntrypoints,
  parseScriptFileRefs,
} from './check-package-contracts.mjs';
import { assertPnpmScriptsExist } from './lib/pnpm-script-refs.mjs';

function withPackage(pkg, files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-package-contract-'));
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

function markdownEnumList(values) {
  return values.map((value) => `\`${value}\``).join(' / ');
}

function normalizedMarkdownIncludes(markdown, expected) {
  return markdown.replace(/\s+/g, ' ').includes(expected);
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runNodeScript(args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
}

function generatedSurface() {
  return JSON.parse(readFileSync('docs/.generated/mcp-surface.json', 'utf-8'));
}

describe('package contract helpers', () => {
  /**
   * **Referential integrity — does a `pnpm ...` a document names exist?**
   *
   * This is not a prose pin: the expectation is `package.json`'s script list, which a
   * machine produces. The previous version kept about 150
   * `assert.equal(pkg.scripts[x], '...')` assertions beside this one, duplicating each
   * script body verbatim. That was not a contract but a **mirror** — a
   * human-authored string written in two places, so changing one only forces you to
   * change the other.
   */
  it('keeps every pnpm command named in the docs resolvable to a real root script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));
    /*
     * Derived, not listed. The hand-written array this replaces named seven of
     * ten rules and three of twenty skills, and no seat brief at all: thirty-five
     * of the forty-five agent files that can cite a `pnpm` command were outside
     * the gate (measured 2026-08-24). A list of files to check rots the same way
     * every hand-maintained list in this repository has, and the fix is the same
     * one `documentation.md` names — compute both sides.
     */
    const agentFiles = [
      ...readdirSync('.claude/rules').filter((name) => name.endsWith('.md'))
        .map((name) => join('.claude/rules', name)),
      ...readdirSync('.claude/agents').filter((name) => name.endsWith('.md'))
        .map((name) => join('.claude/agents', name)),
      ...readdirSync('.claude/skills', { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const dir = join('.claude/skills', entry.name);
          return readdirSync(dir, { recursive: true })
            .filter((name) => String(name).endsWith('.md'))
            .map((name) => join(dir, String(name)));
        }),
    ].sort();
    assert.ok(
      agentFiles.length >= 40,
      `agent-file sweep found only ${agentFiles.length} files — an empty sweep would pass vacuously`,
    );

    const docs = [
      'README.md',
      'docs/DEVELOPMENT-CHECKS.md',
      'mcp/README.md',
      'cli/README.md',
      'docs/benchmark/README.md',
      'scripts/migrations/README.md',
      ...agentFiles,
    ]
      .map((file) => readFileSync(file, 'utf-8'))
      .join('\n');

    assertPnpmScriptsExist(docs, pkg.scripts, { filteredScripts: { './mcp': mcpPkg.scripts } });
    // A `pnpm ...` one script calls from another must hold the same integrity.
    assertPnpmScriptsExist(Object.values(pkg.scripts).join('\n'), pkg.scripts);
  });

  /**
   * Measures whether discovery **actually covers everything** — "the script string
   * looks like a glob" and "that glob matches every file on disk" are different
   * claims.
   *
   * Without this check, `test:mcp:unit` listing 21 files while silently omitting 6 of
   * 27 would have passed (one of the omitted, `verify-script.test.mjs`, was actually
   * failing, and no workflow ran MCP so nobody saw it).
   */
  it('MCP unit script reaches every unit test file on disk', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const command = pkg.scripts?.['test:mcp:unit'] ?? '';
    const discovered = execSync(command.replace(/^node --test /, 'echo '), {
      encoding: 'utf-8',
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((file) => basename(file))
      .sort();

    const onDisk = readdirSync('mcp/src')
      .filter((file) => file.endsWith('.test.mjs'))
      .filter((file) => file !== 'integration.test.mjs')
      .sort();

    assert.deepEqual(discovered, onDisk);
  });

  it('keeps push and PR GitHub CI disabled while preserving local verification scripts', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

    assert.equal(existsSync('.github/workflows/ci.yml'), false);
    assert.equal(existsSync('scripts/check-ci-workflow.mjs'), false);
    assert.equal(existsSync('scripts/check-ci-workflow.test.mjs'), false);
    assert.equal(packageJson.scripts['ci:check'], undefined);
    assert.equal(packageJson.scripts['ci:workflow-check'], undefined);
  });

  it('keeps the docs-vault freshness check executable from source checkout', () => {
    const help = runNodeScript(['scripts/build-docs-vault.mjs', '--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/build-docs-vault\.mjs \[--check\]/);
    assert.equal(help.stderr, '');

    const check = runNodeScript(['scripts/build-docs-vault.mjs', '--check']);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /\[docs-vault\] current · \d+ docs/);
    assert.equal(check.stderr, '');
  });

  /** The regenerate-and-diff net itself must actually run from a source checkout. */
  it('keeps the generated docs surface check executable from source checkout', () => {
    const help = runNodeScript(['scripts/build-docs-surface.mjs', '--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/build-docs-surface\.mjs \[--check\]/);
    assert.equal(help.stderr, '');

    const links = runNodeScript(['scripts/check-doc-links.mjs', '--help']);
    assert.equal(links.status, 0);
    assert.match(links.stdout, /Usage: node scripts\/check-doc-links\.mjs \[--external\]/);
    assert.equal(links.stderr, '');
  });

  it('keeps source-checkout MCP registration templates wired to the dogfood vault', () => {
    for (const file of ['.mcp.json', '.mcp.json.example']) {
      const config = JSON.parse(readFileSync(file, 'utf-8'));
      const server = config.mcpServers?.['ontology-atlas'];

      assert.ok(server, `${file} must register the ontology-atlas MCP server`);
      assert.equal(server.command, 'node');
      assert.deepEqual(server.args, ['./mcp/src/index.js']);
      assert.equal(server.env?.OATLAS_VAULT, './docs/ontology');
    }

    const codexConfig = readFileSync('.codex/config.toml', 'utf-8');
    assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\]/);
    assert.match(codexConfig, /command\s*=\s*"node"/);
    assert.match(codexConfig, /args\s*=\s*\["\.\/mcp\/src\/index\.js"\]/);
    assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\.env\]/);
    assert.match(codexConfig, /OATLAS_VAULT\s*=\s*"\.\/docs\/ontology"/);
  });

  /**
   * Checks that the shortcuts the README advertises **actually run**. The 30-odd
   * assertions pinning each help line verbatim were removed — help text is prose a
   * human wrote, and pinning it breaks the gate when the wording improves.
   *
   * What that gives up: a help text listing a shortcut that does not exist is not
   * caught here. `assertPnpmScriptsExist` covers that instead, via
   * `pnpm test:dogfood:script-refs`, which runs against the help text.
   */
  it('keeps the root README mcp-verify shortcut executable from source checkout', () => {
    const result = runNodeScript(['cli/src/index.mjs', 'mcp-verify', '--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /ontology-atlas mcp-verify \[vault\] \[--timeout-ms N\]/);
    assert.equal(result.stderr, '');
  });

  it('keeps the CLI entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('cli/src/index.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bexit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
  });

  it('keeps the MCP npm test verify entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('mcp/scripts/verify.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
  });

  it('keeps the CLI MCP dependency aligned with the local MCP package version', () => {
    const cliPkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(cliPkg.dependencies?.['ontology-atlas-mcp'], `^${mcpPkg.version}`);
  });

  it('keeps CLI relation type validation aligned with MCP query filters', () => {
    assert.deepEqual(CLI_RELATION_TYPE_VALUES, RELATION_TYPE_VALUES);
  });

  /**
   * **An enum is exactly the values the code holds.** The expected string is built
   * from the engine's array, so adding a value fails here unless the docs follow —
   * this is the argument/enum-consistency kind, categorically different from a prose
   * pin.
   */
  it('keeps every relation and maintenance enum value documented from the engine', () => {
    const mcpReadme = readFileSync('mcp/README.md', 'utf-8');
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const strictInputSection = mcpReadme.split('String-array options are strict too:')[1]?.split('Scalar string options')[0] ?? '';
    const addRelationRow = mcpReadme.split('| `add_relation` |')[1]?.split('\n')[0] ?? '';
    const addRelationsRow = mcpReadme.split('| `add_relations` |')[1]?.split('\n')[0] ?? '';
    const addRelationFeature = features.split('4. **add_relation**')[1]?.split('\n').slice(0, 3).join('\n') ?? '';

    assert.notEqual(strictInputSection, '', 'MCP README lost the strict string-array options section — move this anchor');
    assert.notEqual(addRelationRow, '', 'MCP README lost the add_relation row — move this anchor');

    for (const value of WRITE_RELATION_TYPE_VALUES) {
      assert.match(addRelationFeature, new RegExp(`\`${value}\``), `FEATURES documents add_relation type ${value}`);
      assert.match(addRelationRow, new RegExp(`\`${value}\``), `MCP README documents add_relation type ${value}`);
      assert.match(addRelationsRow, new RegExp(`\`${value}\``), `MCP README documents add_relations type ${value}`);
    }

    const enumClaims = [
      [strictInputSection, `\`maintenance_plan.phases\` is additionally limited to ${markdownEnumList(MAINTENANCE_PHASE_VALUES)}`],
      [strictInputSection, `\`maintenance_plan.severities\` is limited to ${markdownEnumList(MAINTENANCE_SEVERITY_VALUES)}`],
      [strictInputSection, `\`maintenance_plan.kinds\` is limited to ${markdownEnumList(MAINTENANCE_KIND_VALUES)}`],
      [strictInputSection, `\`dependencyTypes\` and \`componentTypes\` (${markdownEnumList(RELATION_TYPE_VALUES)})`],
    ];
    for (const [section, expected] of enumClaims) {
      assert.ok(normalizedMarkdownIncludes(section, expected), `MCP README must document: ${expected}`);
    }

  });

  /**
   * The **scope summary strings of the tuned brief/diagnostic are computed by
   * verify** — the README transcript must contain that computed result verbatim. It
   * does not change as the vault grows, so it cannot rot.
   */
  it('keeps the MCP verify README quoting the tuned-scope summaries the code computes', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const verifySection = readme.split('### One-line verify CLI')[1]?.split('### Manual verification')[0] ?? '';

    assert.notEqual(verifySection, '', 'mcp/README.md lost the "One-line verify CLI" section — move this anchor');
    assert.match(verifySection, new RegExp(regexEscape(tunedWorkspaceBriefScopeOutputSummary())));
    assert.match(verifySection, new RegExp(regexEscape(tunedHealthScopeOutputSummary())));
  });

  /**
   * **Counts on the public contract** — the tool inventory and the annotation census.
   * These change only when a tool is registered or removed, and that change is
   * deliberate, so docs and smoke tests should follow it.
   */
  it('keeps the tools/list annotation census on its published contract', () => {
    assert.equal(
      expectedToolsListAnnotationSummary(),
      '36/36 titled; 20/20 read; 16/16 write; 9/9 destructive; 3/3 idempotent; 36/36 local-only',
    );
  });

  /**
   * `mcp/package.json`'s description is the source from which the launch-docs gate
   * (`src/shared/lib/launch-docs-current.test.ts`) derives the current tool count.
   * That string is human-written, so **without tying it to the registry here** the
   * whole derived gate silently passes with a stale number as its truth.
   */
  it('keeps the MCP package description counts anchored to the generated registry surface', () => {
    const surface = generatedSurface();
    const metadata = parseMcpToolMetadataFromDescription(
      JSON.parse(readFileSync('mcp/package.json', 'utf-8')).description,
    );

    assert.ok(metadata, 'mcp/package.json description must state the current tool surface');
    assert.equal(Number(metadata.toolCount), surface.mcp.toolCount);
    assert.equal(Number(metadata.readCount), surface.mcp.readToolCount);
    assert.equal(Number(metadata.writeCount), surface.mcp.writeToolCount);
  });

  it('keeps CLAUDE.md a thin AGENTS wrapper', () => {
    const claude = readFileSync('CLAUDE.md', 'utf-8');
    const agentImports = [...claude.matchAll(/^@AGENTS\.md$/gm)];

    assert.equal(agentImports.length, 1);
    // This is the structural invariant "CLAUDE.md does not duplicate AGENTS.md's
    // sections", not a wording pin, so it survives a rewrite of the prose. The import
    // bridge itself is guarded separately by `pnpm agents:check`.
    assert.doesNotMatch(claude, /## Project overview/);
    assert.doesNotMatch(claude, /## 프로젝트 개요/);
  });

  /**
   * **Referential integrity of the vault README.** The previous gate required this
   * document to contain particular sentences (a prose pin), while the incident it
   * actually wanted to catch was "the vault was regenerated and the README now points
   * at a node that is gone". A machine can decide that.
   */
  it('keeps the self-ontology README naming nodes that exist without freezing surface counts', () => {
    const readme = readFileSync('docs/ontology/README.md', 'utf-8');
    const referenced = [...readme.matchAll(/`((?:domains|capabilities|elements)\/[a-z0-9-]+|[a-z0-9-]+\.md)`/g)].map(
      (match) => match[1],
    );

    assert.ok(referenced.length >= 3, 'the vault README should point at real entry points');
    for (const slug of new Set(referenced)) {
      const file = slug.endsWith('.md') ? `docs/ontology/${slug}` : `docs/ontology/${slug}.md`;
      assert.ok(existsSync(file), `docs/ontology/README.md points at a node that does not exist: ${slug}`);
    }
    assert.doesNotMatch(readme, /\b\d+\s+MCP tools\b/i);
    assert.doesNotMatch(readme, /\b\d+\s+CLI commands\b/i);
  });

  it('keeps dogfood CLI capability and MCP capability nodes concise and delegates inventories to their generated public sources', () => {
    const cliDoc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const mcpDoc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const cliTitle = cliDoc.match(/^title:\s*(.+)$/m)?.[1] ?? '';
    const mcpTitle = mcpDoc.match(/^title:\s*(.+)$/m)?.[1] ?? '';
    const cliHeading = cliDoc.match(/^#\s+(.+)$/m)?.[1] ?? '';
    const mcpHeading = mcpDoc.match(/^#\s+(.+)$/m)?.[1] ?? '';

    assert.notEqual(cliTitle, '', 'CLI capability must retain a frontmatter title');
    assert.notEqual(mcpTitle, '', 'MCP capability must retain a frontmatter title');
    assert.doesNotMatch(cliTitle, /\b\d+\s+commands\b/i, 'semantic node titles must not freeze the CLI inventory');
    assert.doesNotMatch(mcpTitle, /\b\d+\s+tools\b/i, 'semantic node titles must not freeze the MCP inventory');
    assert.doesNotMatch(cliHeading, /\b\d+\s+commands\b/i, 'semantic node headings must not freeze the CLI inventory');
    assert.doesNotMatch(mcpHeading, /\b\d+\s+tools\b/i, 'semantic node headings must not freeze the MCP inventory');
    assert.match(cliDoc, /`cli\/README\.md`/, 'CLI capability must point to the detailed public contract');
    assert.match(mcpDoc, /`mcp\/README\.md`/, 'MCP capability must point to the detailed public contract');
    assert.doesNotMatch(mcpDoc, /`maintenance_plan\.(?:phases|severities|kinds)`/,
      'meaning nodes must not duplicate generated maintenance enum inventories');
  });

  it('keeps the embedded SERVER_VERSION in sync with mcp/package.json', () => {
    const pkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));
    const source = readFileSync('mcp/src/index.js', 'utf-8');

    assert.equal(SERVER_VERSION, pkg.version);
    assert.equal(isCoveredByFiles('src/server-version.mjs', pkg.files), true);
    assert.match(source, /import \{ SERVER_VERSION \} from '\.\/server-version\.mjs'/);
    assert.doesNotMatch(source, /version: '\d+\.\d+\.\d+'/);
  });

  it('keeps MCP npm test runnable from the lean published tarball', () => {
    const pkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(pkg.scripts?.test, 'node --test src/parser.test.mjs');
    assert.equal(isCoveredByFiles('src/parser.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/verify.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/json-rpc-lines.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/suggestions.test.mjs', pkg.files), false);
    assert.equal(isCoveredByFiles('src/verify-script.test.mjs', pkg.files), false);
  });

  it('keeps CLI npm test runnable from the published tarball', () => {
    const pkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
    const cliLibTests = readdirSync('cli/src/lib')
      .filter((file) => file.endsWith('.test.mjs'))
      .sort();

    assert.equal(isCoveredByFiles('src/lib/cli-args.test.mjs', pkg.files), true);
    assert.ok(cliLibTests.length > 0, 'CLI test script must have concrete lib test subjects');
    for (const testFile of cliLibTests) {
      assert.equal(existsSync(join('cli/src/lib', testFile)), true, `${testFile} must still exist`);
      assert.equal(isCoveredByFiles(`src/lib/${testFile}`, pkg.files), true, `${testFile} must ship for CLI npm test`);
    }
    assert.equal(isCoveredByFiles('src/lib/import-analysis-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/import-analysis-results.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/repo-analysis-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/repo-analysis-results.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/cli-commands.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/mcp-call.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/index.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/commands/mcp-verify.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/cli-commands.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('templates/vault/project.md', pkg.files), true);
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
