#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import { analyzeRepoStructure } from '../mcp/src/analyze.mjs';
import { inferImports } from '../mcp/src/infer-imports.mjs';
import { loadOmotIgnore } from '../mcp/src/omot-ignore.mjs';
import {
  expectedToolsListAnnotationSummary,
  structuredContentVerifySummary,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
} from '../mcp/scripts/verify.mjs';
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  queryCompiledOntology,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../mcp/src/ontology-engine.mjs';
import { compileOntology } from '../mcp/src/ontology-compiler.mjs';
import { collectNeighborRefs, findBacklinks, loadVaultDocs } from '../mcp/src/vault.mjs';
import {
  checkPackage,
  checkMcpLeanTarballFiles,
  importedSpecifiers,
  isCoveredByFiles,
  isPublishRuntimeScript,
  packageEntrypoints,
  parseScriptFileRefs,
} from './check-package-contracts.mjs';
import { dogfoodVaultCensus, dogfoodVaultCensusFromDocs } from './lib/vault-census.mjs';

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

function markdownEnumList(values) {
  return values.map((value) => `\`${value}\``).join(' / ');
}

function normalizedMarkdownIncludes(markdown, expected) {
  return markdown.replace(/\s+/g, ' ').includes(expected);
}

function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEvidenceCount(docs, query) {
  const needle = query.toLowerCase();
  return docs.filter((doc) => {
    const docTitle = String(doc.frontmatter.title || doc.frontmatter.name || '').toLowerCase();
    const inFrontmatter =
      docTitle.includes(needle) ||
      String(doc.frontmatter.capabilities || '').toLowerCase().includes(needle) ||
      String(doc.frontmatter.elements || '').toLowerCase().includes(needle);
    return inFrontmatter || doc.body.toLowerCase().includes(needle);
  }).length;
}

function importKindSummary(kindCounts) {
  const ordered = ['static', 'dynamic', 'require', 'reexport', 'side'];
  const known = ordered
    .filter((kind) => Number.isInteger(kindCounts?.[kind]) && kindCounts[kind] > 0)
    .map((kind) => `${kind}:${kindCounts[kind]}`);
  const extra = Object.entries(kindCounts ?? {})
    .filter(([kind, count]) => !ordered.includes(kind) && Number.isInteger(count) && count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}:${count}`);
  return [...known, ...extra].join('/');
}

function healthCheckSummary(checks) {
  return checks.map((check) => `${check.id}:${check.status}:${check.count}`).join(', ');
}

function runNodeScript(args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
}

describe('package contract helpers', () => {
  it('keeps the root README honest about the three visual views plus MCP', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const section = readme.split('## Three views plus MCP, one vault')[1]?.split('## Quick start')[0] ?? '';

    assert.match(section, /rendered three ways and exposed to agents through MCP/);
    assert.match(section, /\*\*Topology\*\*/);
    assert.match(section, /\*\*Tree\*\*/);
    assert.match(section, /\*\*ERD builder\*\*/);
    assert.match(section, /\*\*MCP\*\*/);
    assert.match(section, /All four read and write the same `\.md` files/);
    assert.doesNotMatch(readme, /## Three views, one vault/);
    assert.doesNotMatch(readme, /## Four surfaces, one vault/);
  });

  it('keeps filtered integration scripts discoverable from the root README', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const readme = readFileSync('README.md', 'utf-8');

    assert.equal(pkg.scripts?.['integration:cli'], 'node --test cli/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:cli:mcp-verify'],
      'node --test --test-name-pattern "mcp-verify" cli/src/integration.test.mjs',
    );
    assert.equal(
      pkg.scripts?.['integration:cli:maintenance'],
      'node --test --test-name-pattern "maintenance" cli/src/integration.test.mjs',
    );
    assert.equal(pkg.scripts?.['dogfood:verify'], 'node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000');
    assert.equal(pkg.scripts?.['cli:mcp-verify'], 'node cli/src/index.mjs mcp-verify');
    assert.equal(pkg.scripts?.['integration:mcp'], 'node --test mcp/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:mcp:readme'],
      'node --test --test-name-pattern "README first exploration" mcp/src/integration.test.mjs',
    );
    assert.equal(
      pkg.scripts?.['package:check'],
      'node scripts/check-package-contracts.mjs && pnpm test:cli:lib && node --test scripts/check-package-contracts.test.mjs',
    );
    assert.equal(pkg.scripts?.['test:cli:lib'], 'node --test cli/src/lib/*.test.mjs');
    assert.equal(pkg.scripts?.['test:contracts'], 'vitest run tests/contract');
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /scripts\/dogfood-mcp-walk\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /scripts\/check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /structuredContent/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /compile_ontology/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /row-label guidance/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /vault warnings/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /validate_vault problem/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /unhealthy first-contact/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /failing health checks/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /warn\/fail next actions/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /malformed workspace_brief/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /malformed maintenance_plan payloads/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /remaining maintenance buckets/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /current-page maintenance next actions/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /stderr warnings/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /dogfood help/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /dogfood arguments/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /dogfood timeout/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /timeout failures/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /dogfood response labels/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /destructive dogfood dry-run/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /strict relation filters/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /strict add_relation/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /strict graph kind filter/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /strict closest-value smoke/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /malformed initialize/);
    assert.equal(
      pkg.scripts?.['test:mcp:dogfood:timeout'],
      'node --test --test-name-pattern "dogfood timeout|timeout failures|dogfood response labels|dogfood help" scripts/dogfood-mcp-walk.test.mjs',
    );
    assert.equal(
      pkg.scripts?.['test:mcp:maintenance'],
      'node --test --test-name-pattern "maintenance filter|maintenance cursor|maintenance missing-cursor|maintenance ready-cursor|maintenance resume-cursor|malformed maintenance_plan payloads|remaining maintenance buckets|current-page maintenance next actions" mcp/src/verify-script.test.mjs scripts/dogfood-mcp-walk.test.mjs',
    );
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/suggestions\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/ontology-engine\.test\.mjs/);
    assert.equal(pkg.scripts?.['test:mcp:verify'], 'node --test mcp/src/verify-script.test.mjs');
    assert.equal(
      pkg.scripts?.['test:mcp:verify:first-contact'],
      'node --test --test-name-pattern "initialize instructions|first-contact response labels|bootstrap and import-analysis|first-contact verify|list_concepts reports vault warnings|validate_vault reports problem files|malformed validate_vault|first-contact diagnosis|health summary|health check advisories|failing health checks|workspace_brief growth count drift|workspace_brief next action sample drift|fail next actions" mcp/src/verify-script.test.mjs',
    );
    assert.equal(
      pkg.scripts?.['test:mcp:verify:timeout'],
      'node --test --test-name-pattern "verify timeout|timeout failures|startup failures|direct verify usage|direct verify timeout|direct verify CLI args" mcp/src/verify-script.test.mjs',
    );
    assert.match(
      pkg.scripts?.['test:mcp:docs'] ?? '',
      /^node --test --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /dogfood MCP docs/);
    assert.match(
      pkg.scripts?.['test:mcp:package'] ?? '',
      /^node --test --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /MCP npm test/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI npm test/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI MCP dependency/);
    assert.match(
      pkg.scripts?.['test:mcp:suggestions'] ?? '',
      /^node --test --test-name-pattern "[^"]+" mcp\/src\/suggestions\.test\.mjs mcp\/src\/ontology-engine\.test\.mjs$/,
    );
    assert.match(readme, /pnpm package:check\s+# MCP\/CLI package files contract \+ CLI lib \+ docs self-test/);
    assert.match(readme, /pnpm test:cli:lib\s+# focused CLI shared helper unit contracts/);
    assert.match(readme, /pnpm test:contracts\s+# focused cross-package contract tests/);
    assert.match(readme, /pnpm test:mcp:docs/);
    assert.match(readme, /pnpm test:mcp:dogfood/);
    assert.match(readme, /structuredContent\/compile\/row-label\/vault-warning\/health\/sample-shape\/maintenance work-queue\+formatter\/initialize\+batch-relation\/destructive dry-run\/help\/argument\/timeout\/strict relation\/closest-value\/stderr checks/);
    assert.match(readme, /pnpm test:mcp:dogfood:timeout\s+# narrow dogfood timeout\/help retry diagnostics/);
    assert.match(readme, /pnpm test:mcp:maintenance\s+# narrow maintenance_plan filter\/cursor\/work-queue\+formatter gates/);
    assert.match(readme, /pnpm test:mcp:package\s+# focused MCP\/CLI package-script\/dependency\/tarball contract checks/);
    assert.match(readme, /pnpm test:mcp:suggestions/);
    assert.match(readme, /pnpm test:mcp:verify/);
    assert.match(readme, /pnpm test:mcp:verify:first-contact\s+# narrow MCP verify first-contact initialize-hint\/health-summary\/advisory\/read\/sample gates/);
    assert.match(readme, /pnpm test:mcp:verify:timeout\s+# narrow MCP verify timeout\/startup\/help diagnostics/);
    assert.match(readme, /pnpm dogfood:verify\s+# root checkout installed-style verify over docs\/ontology/);
    assert.match(readme, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000\s+# root checkout dogfood verify/);
    assert.match(readme, /pnpm cli:mcp-verify -- --help\s+# root checkout shortcut for installed mcp-verify help scope/);
    assert.match(readme, /timeout mistakes, the error reports the\s+received value/);
    assert.match(readme, /`npm run verify -- --timeout-ms 15000`/);
    assert.match(readme, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli/);
    assert.match(readme, /pnpm integration:cli:mcp-verify/);
    assert.match(readme, /pnpm integration:cli:maintenance\s+# narrow CLI maintenance command integration gates/);
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="tools\/list\|initialize" pnpm integration:mcp/);
    assert.match(readme, /pnpm integration:mcp:readme/);
    assert.match(readme, /pnpm exec node --test --test-name-pattern "README first exploration" mcp\/src\/integration\.test\.mjs/);
    assert.match(readme, /dogfood-helper/);
    assert.match(readme, /custom runners also honor Node's `--test-name-pattern`/);
    assert.match(readme, /integration:cli:mcp-verify/);
    assert.match(readme, /integration:cli:maintenance/);
    assert.match(readme, /integration:mcp:readme/);
    assert.match(readme, /`cli:mcp-verify`\s+is a source-checkout shortcut for the CLI wrapper/);
    assert.match(readme, /`dogfood:verify` is the\s+shorter repeatable alias for the same dogfood vault check/);
    assert.match(readme, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000`\s+runs the installed-style\s+verify against this repo's dogfood vault from the repo root/);
    assert.match(readme, /`pnpm cli:mcp-verify -- --help` only for help output/);
    assert.match(readme, /vault arguments are passed\s+without the extra `--`/);
    assert.match(readme, /runs `workspace_brief`, tuned `workspace_brief`, `health`, and tuned `health`/);
    assert.match(readme, /`health` and `workspace-brief` also accept focused diagnosis tuning flags/);
    assert.match(readme, /`--dependency-types A,B`, `--component-types A,B`, `--component-limit N`/);
    assert.match(readme, /graph-query, destructive\s+dry-run, post-write bucket guidance, strict argument \/ enum rejection,\s+annotations, write relation enums, and health tuning schema scope/);
    assert.match(readme, /graph-query, destructive dry-run, post-write bucket, strict argument \/ enum,\s+annotation, write relation enum, and health tuning smoke scope/);
  });

  it('keeps the root README mcp-verify shortcut executable from source checkout', () => {
    const result = runNodeScript(['cli/src/index.mjs', 'mcp-verify', '--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /oh-my-ontology mcp-verify \[vault\] \[--timeout-ms N\]/);
    assert.match(result.stdout, /Focused checks:/);
    assert.match(result.stdout, /pnpm integration:cli:mcp-verify/);
    assert.match(result.stdout, /pnpm dogfood:verify\s+Root checkout dogfood vault verify shortcut/);
    assert.match(result.stdout, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000\s+Source-checkout dogfood verify with explicit args/);
    assert.match(result.stdout, /pnpm cli:mcp-verify -- --help\s+Source-checkout shortcut for this help from the repo root/);
    assert.match(result.stdout, /pnpm test:mcp:verify:first-contact\s+Narrow first-contact initialize-hint\/health-summary\/advisory\/read\/sample-shape helper gates/);
    assert.equal(result.stderr, '');
  });

  it('keeps the CLI MCP dependency aligned with the local MCP package version', () => {
    const cliPkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(cliPkg.dependencies?.['oh-my-ontology-mcp'], `^${mcpPkg.version}`);
  });

  it('keeps the MCP first-call prompt read-only', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const firstCallSection = readme.split('## First call after registering with Claude Code')[1]?.split('## Design principles')[0] ?? '';
    const validateVaultRow = readme.split('| `validate_vault` |')[1]?.split('\n')[0] ?? '';

    assert.match(firstCallSection, /mcp__oh-my-ontology__list_kinds/);
    assert.match(firstCallSection, /mcp__oh-my-ontology__list_concepts/);
    assert.match(firstCallSection, /validate_vault\(\{\}\)/);
    assert.match(firstCallSection, /query_ontology\(\{ operation: "workspace_brief" \}\)/);
    assert.match(firstCallSection, /targetOperation: "overview"/);
    assert.match(firstCallSection, /targetOperation: "project_map"/);
    assert.match(firstCallSection, /read-only calls respond cleanly/);
    assert.doesNotMatch(firstCallSection, /add_concept/);
    assert.doesNotMatch(firstCallSection, /those four tools/);
    assert.match(validateVaultRow, /first-contact before writes/);
    assert.match(validateVaultRow, /`outputSchema` restricts both `issues\[\]\.code` and `summary\.byCode` keys/);
  });

  it('keeps the MCP README explicit about get_concepts partial rows', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const row = readme.split('| `get_concepts` |')[1]?.split('\n')[0] ?? '';

    assert.match(row, /Missing or invalid slug rows return/);
    assert.match(row, /rather than aborting the batch/);
    assert.match(row, /later valid slugs still resolve/);
  });

  it('keeps the MCP README aligned with health tuning controls', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const row = readme.split('| `query_ontology` |')[1]?.split('\n')[0] ?? '';
    const addConceptRow = readme.split('| `add_concept` |')[1]?.split('\n')[0] ?? '';
    const featureRow = features.split('12. **query_ontology**')[1]?.split('\n')[0] ?? '';
    const strictInputSection = readme.split('String-array options are strict too:')[1]?.split('Scalar string options')[0] ?? '';
    const scalarInputSection = readme.split('Scalar string options follow the same boundary across read and write tools:')[1]?.split('Boolean options are also validated explicitly')[0] ?? '';

    assert.match(row, /`health` \/ `workspace_brief` can tune their internal probes/);
    assert.match(row, /`phases`, `severities`, and `kinds` are enum-validated/);
    assert.match(row, /ready pages with `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(row, /cursor miss `reason`/);
    assert.match(row, /current-page `nextExecutableAction` \/ `nextReviewAction`/);
    assert.match(row, /count-safe summary fields/);
    assert.match(row, /`byPhase` \/ `bySeverity` \/ `byKind` remaining-queue buckets/);
    assert.match(addConceptRow, /`operation:"maintenance_plan"`/);
    assert.match(addConceptRow, /`sideEffect:false`/);
    assert.match(addConceptRow, /`filters`/);
    assert.match(addConceptRow, /`limited`/);
    assert.match(addConceptRow, /next action pointers/);
    assert.match(addConceptRow, /`score`/);
    assert.match(addConceptRow, /executable `proposedAction`/);
    assert.match(featureRow, /explicit `cursor\.reason` metadata/);
    assert.match(featureRow, /count-safe summary fields/);
    assert.match(featureRow, /`byPhase` \/ `bySeverity` \/ `byKind` remaining-queue buckets/);
    assert.match(featureRow, /current-page `nextExecutableAction`/);
    assert.match(featureRow, /current-page `nextReviewAction`/);
    assert.match(featureRow, /ready pages report `cursor\.found=true` with `cursor\.reason=null`/);
    assert.match(featureRow, /unknown cursors return an empty page with `cursor\.found=false`/);
    assert.match(featureRow, /zero remaining actions, and no next actions/);
    assert.match(featureRow, /`relation_check` validates relation `type` before endpoint slug resolution/);
    assert.match(featureRow, /relation typos such as `depend_on` still return nearest-value hints/);
    assert.match(featureRow, /empty or project-less vaults/);

    for (const toolName of [
      'add_concept',
      'add_concepts',
      'patch_concept',
      'add_relation',
      'add_relations',
      'delete_concept',
      'rename_concept',
      'merge_concepts',
    ]) {
      const featureSuffix = features.split(`**${toolName}**`)[1] ?? '';
      const nextToolStart = featureSuffix.search(/\n\d+\. \*\*/);
      const toolText = featureSuffix === ''
        ? ''
        : nextToolStart === -1
          ? featureSuffix
          : featureSuffix.slice(0, nextToolStart);
      assert.match(toolText, /compact `postWriteMaintenance`/, `${toolName} documents compact post-write maintenance`);
      assert.match(toolText, /action `score`/, `${toolName} documents maintenance action score`);
      assert.match(toolText, /executable `proposedAction`/, `${toolName} documents executable proposedAction`);
      assert.match(toolText, /current-page next action pointers/, `${toolName} documents current-page next action pointers`);
    }
    const addConceptsFeature = features.split('2. **add_concepts**')[1]?.split('\n')[0] ?? '';
    const addRelationsFeature = features.split('5. **add_relations**')[1]?.split('\n')[0] ?? '';
    const addRelationFeature = features.split('4. **add_relation**')[1]?.split('\n').slice(0, 3).join('\n') ?? '';
    const addConceptsRow = readme.split('| `add_concepts` |')[1]?.split('\n')[0] ?? '';
    const addRelationRow = readme.split('| `add_relation` |')[1]?.split('\n')[0] ?? '';
    const addRelationsRow = readme.split('| `add_relations` |')[1]?.split('\n')[0] ?? '';
    assert.match(addConceptsFeature, /non-object row shape \/ unknown row field errors are isolated as `\{ok:false, error\}` rows/);
    assert.match(addRelationsFeature, /non-object row shape \/ unknown row field errors are isolated as `\{ok:false, error\}` rows/);
    assert.match(addRelationFeature, /type enum:/, 'FEATURES must label add_relation write relation enum values');
    assert.match(addRelationRow, /`type`:/, 'MCP README must label add_relation write relation enum values');
    assert.match(addRelationsRow, /`type`:/, 'MCP README must label add_relations write relation enum values');
    assert.match(addConceptsRow, /`concepts\[n\]` row label/);
    assert.match(addConceptsRow, /`Received fields: \.\.\.`/);
    assert.match(addRelationsRow, /`relations\[n\]` row label/);
    assert.match(addRelationsRow, /closest-value hint/);
    assert.match(addRelationsRow, /`Received fields: \.\.\.`/);
    for (const value of WRITE_RELATION_TYPE_VALUES) {
      assert.match(addRelationFeature, new RegExp(`\`${value}\``), `FEATURES documents add_relation type ${value}`);
      assert.match(addRelationRow, new RegExp(`\`${value}\``), `MCP README documents add_relation type ${value}`);
      assert.match(addRelationsRow, new RegExp(`\`${value}\``), `MCP README documents add_relations type ${value}`);
    }
    for (const option of [
      'componentLimit',
      'cycleLimit',
      'recommendationLimit',
      'orderLimit',
      'nodeLimit',
      'dependencyTypes',
      'componentTypes',
    ]) {
      assert.match(row, new RegExp(`\`${option}\``));
    }
    assert.ok(
      normalizedMarkdownIncludes(
        strictInputSection,
        `\`maintenance_plan.phases\` is additionally limited to ${markdownEnumList(MAINTENANCE_PHASE_VALUES)}`,
      ),
      'MCP README must document every maintenance_plan.phases enum value',
    );
    assert.ok(
      normalizedMarkdownIncludes(
        strictInputSection,
        `\`maintenance_plan.severities\` is limited to ${markdownEnumList(MAINTENANCE_SEVERITY_VALUES)}`,
      ),
      'MCP README must document every maintenance_plan.severities enum value',
    );
    assert.ok(
      normalizedMarkdownIncludes(
        strictInputSection,
        `\`maintenance_plan.kinds\` is limited to ${markdownEnumList(MAINTENANCE_KIND_VALUES)}`,
      ),
      'MCP README must document every maintenance_plan.kinds enum value',
    );
    assert.ok(
      normalizedMarkdownIncludes(
        strictInputSection,
        `\`dependencyTypes\` and \`componentTypes\` (${markdownEnumList(RELATION_TYPE_VALUES)})`,
      ),
      'MCP README must document every health/workspace_brief relation filter enum value',
    );
    assert.match(scalarInputSection, /`query_ontology\(\{ operation: "relation_check" \}\)`/);
    assert.match(scalarInputSection, /relation `type` is\s+validated before endpoint slug resolution/);
    assert.match(scalarInputSection, /empty or project-less\s+vaults where the requested endpoints do not exist/);
  });

  it('keeps docs aligned with repo analysis MCP argument names', () => {
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const mcpReadme = readFileSync('mcp/README.md', 'utf-8');
    const analyzeLine = features.split('14. **analyze_repo_structure**')[1]?.split('\n')[0] ?? '';
    const inferLine = features.split('15. **infer_imports**')[1]?.split('\n')[0] ?? '';
    const mcpInferRow = mcpReadme.split('| `infer_imports` |')[1]?.split('\n')[0] ?? '';

    assert.match(analyzeLine, /`?\{ rootPath\?, maxDepth\?, ignore\? \}`?/);
    assert.match(inferLine, /`?\{ rootPath\?, sourceFolders\?, ignore\?, maxFiles\? \}`?/);
    assert.match(inferLine, /`kindCounts`/);
    assert.match(inferLine, /`empty`, `relative-not-found`, or `alias-not-found`/);
    assert.match(inferLine, /`static`, `dynamic`, `require`, `reexport`, and `side`/);
    assert.match(inferLine, /`tsconfig\.json` paths/);
    assert.match(inferLine, /fallback common `@\/\*` aliases/);
    assert.match(mcpInferRow, /relative imports/);
    assert.match(mcpInferRow, /`tsconfig\.json` `compilerOptions\.paths` aliases/);
    assert.match(mcpInferRow, /fallback common `@\/\*` aliases/);
    assert.match(mcpInferRow, /schema-bound `reason` values: `empty`, `relative-not-found`, or `alias-not-found`/);
    assert.match(mcpInferRow, /`outputSchema` restricts `kindCounts` to `static`, `dynamic`, `require`, `reexport`, and `side`/);
    assert.doesNotMatch(analyzeLine + inferLine, /repoRoot/);
  });

  it('keeps docs aligned with find_orphans root defaults', () => {
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const line = features.split('9. **find_orphans**')[1]?.split('\n')[0] ?? '';

    assert.match(line, /defaults exclude `project` and `vault-readme`/);
    assert.match(line, /excludeKinds: \[\]/);
    assert.doesNotMatch(line, /defaults exclude `vault-readme`\)/);
  });

  it('keeps docs aligned with find_neighbors defaults', () => {
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const line = features.split('6. **find_neighbors**')[1]?.split('\n')[0] ?? '';

    assert.match(line, /`includeNodes` defaults true/);
    assert.match(line, /`limit` defaults 100\/max 500/);
    assert.match(line, /depends_on` are normalized to stored graph keys/);
  });

  it('keeps docs aligned with compile_ontology large-vault options', () => {
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const dogfoodMcpDoc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const featureLine = features.split('11. **compile_ontology**')[1]?.split('\n')[0] ?? '';
    const dogfoodRow = dogfoodMcpDoc.split('| `compile_ontology` |')[1]?.split('\n')[0] ?? '';

    assert.match(featureLine, /includeIndexes\?/);
    assert.match(featureLine, /summary\?/);
    assert.match(featureLine, /nodesLimit\?/);
    assert.match(featureLine, /nodesOffset\?/);
    assert.match(featureLine, /edgesLimit\?/);
    assert.match(featureLine, /edgesOffset\?/);
    assert.match(featureLine, /node\/edge pagination for large vaults/);
    assert.match(dogfoodRow, /`summary:true`/);
    assert.match(dogfoodRow, /`nodesLimit` \/ `nodesOffset` \/ `edgesLimit` \/ `edgesOffset`/);
    assert.match(dogfoodRow, /limit max 500/);
  });

  it('keeps the MCP README explicit about destructive write safety switches', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const deleteRow = readme.split('| `delete_concept` |')[1]?.split('\n')[0] ?? '';
    const renameRow = readme.split('| `rename_concept` |')[1]?.split('\n')[0] ?? '';
    const statusSection = readme.split('## Status')[1]?.split('## Troubleshooting')[0] ?? '';

    assert.match(deleteRow, /confirm:true/);
    assert.match(deleteRow, /force:true/);
    assert.match(deleteRow, /backlinks/);
    assert.match(renameRow, /confirm:true/);
    assert.match(renameRow, /newSlug/);
    assert.match(renameRow, /overwrite:true/);
    assert.match(renameRow, /already exists/);
    assert.match(statusSection, /initialize instructions/);
    assert.match(statusSection, /overwrite: true/);
    assert.match(statusSection, /force: true/);
    assert.match(statusSection, /dangling referrers/);
  });

  it('keeps the MCP README explicit about focused source-checkout verification', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const section = readme.split('### Source-checkout verification')[1]?.split('### 2. Restart Claude Code')[0] ?? '';

    assert.match(section, /pnpm test:contracts/);
    assert.match(section, /pnpm integration:mcp:readme/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:dogfood/);
    assert.match(section, /pnpm test:mcp:dogfood:timeout/);
    assert.match(section, /pnpm test:mcp:maintenance/);
    assert.match(section, /pnpm test:mcp:suggestions/);
    assert.match(section, /pnpm test:mcp:verify/);
    assert.match(section, /pnpm test:mcp:verify:first-contact/);
    assert.match(section, /first-contact health summary \/ advisory \/ next-action gates/);
    assert.match(section, /pnpm test:mcp:verify:timeout/);
    assert.match(section, /pnpm dogfood:verify/);
    assert.match(section, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000/);
    assert.match(section, /pnpm cli:mcp-verify -- --help/);
    assert.match(section, /`pnpm dogfood:verify` is the shortest dogfood vault\s+gate/);
    assert.match(readme, /invalid timeout values fail before the server\s+starts and print\s+the received value plus a concrete retry example/i);
    assert.match(readme, /`npm run verify -- --timeout-ms 15000`/);
    assert.match(readme, /verifier is called with an\s+explicit vault, timeout retry hints preserve that vault/);
    assert.match(readme, /`npm run verify -- --vault <path> --timeout-ms 15000`/);
    assert.match(readme, /`oh-my-ontology mcp-verify --vault <path>\s+--timeout-ms 15000`/);
    assert.match(readme, /From the repo root, prefer the CLI wrapper for the dogfood vault/);
    assert.match(readme, /pnpm dogfood:verify/);
    assert.match(readme, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000/);
    assert.match(readme, /Inside mcp\/, the package-local verifier has the same smoke scope/);
    assert.match(section, /first-contact read-only MCP flow/);
    assert.match(section, /documentation drift/);
    assert.match(section, /help output/);
    assert.match(section, /row-label guidance summary/);
    assert.match(section, /initialize\/batch relation type guidance gate/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /dogfood timeout parsing, missing\s+response labels, and retry help/);
    assert.match(section, /maintenance_plan filter enums, ready\/missing\s+cursor handling, resume-cursor behavior, dogfood work-queue shape gates, and\s+bucket \/ next-action formatter checks/);
    assert.match(section, /unsupported-argument\s+rejection/);
    assert.match(section, /strict relation filter\s+rejection/);
    assert.match(section, /strict closest-value\s+summary/);
    assert.match(section, /stderr warning filtering/);
    assert.match(section, /verify helper contract/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /timeout parsing, startup failure\s+retry guidance, usage, and retry diagnostics/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /Node `--test-name-pattern`/);
  });

  it('keeps the MCP verify README aligned with first-contact census gates', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const verifySection = readme.split('### One-line verify CLI')[1]?.split('### Manual verification')[0] ?? '';
    const ontologyRoot = join(process.cwd(), 'docs', 'ontology');
    const dogfoodDocs = loadVaultDocs(ontologyRoot);
    const census = dogfoodVaultCensusFromDocs(dogfoodDocs);
    const kindSummary = [
      `capability:${census.byKind.capabilities}`,
      `domain:${census.byKind.domains}`,
      `element:${census.byKind.elements}`,
      `project:${census.byKind.project}`,
      `vault-readme:${census.byKind['vault-readme']}`,
    ].join(', ');
    const scopedNodes = census.total - census.byKind['vault-readme'];
    const projectDoc = dogfoodDocs.find((doc) => doc.slug === 'project');
    assert.ok(projectDoc, 'dogfood vault has a project node');
    const projectOutgoingEdgeCount = collectNeighborRefs(projectDoc).length;
    const projectOutgoingEdgeLabel = projectOutgoingEdgeCount === 1 ? 'edge' : 'edges';
    const compiled = compileOntology(dogfoodDocs, {
      includeIndexes: true,
    });
    const projectBacklinkCount = findBacklinks(join(process.cwd(), 'docs', 'ontology'), 'project').length;
    const projectBacklinkLabel = projectBacklinkCount === 1 ? 'backlink' : 'backlinks';
    const projectEvidenceCount = findEvidenceCount(dogfoodDocs, 'project');
    const projectQueryCount = census.byKind.project;
    const limitedQueryTotal = census.total - 1;
    const graphHashPrefix = compiled.graphHash.slice(0, 12);
    const indexOutCount = Object.keys(compiled.indexes.out).length;
    const indexInCount = Object.keys(compiled.indexes.in).length;
    const indexEdgeCount = Object.keys(compiled.indexes.edgeById).length;
    const neighborSmoke = queryCompiledOntology(compiled, {
      operation: 'neighbors',
      slug: 'elements/file-system-access-api',
    });
    const neighborSmokeLine = `elements/file-system-access-api \\(${neighborSmoke.edges.length}/${neighborSmoke.total} edges, limited ${neighborSmoke.limited}\\)`;
    const projectScope = queryCompiledOntology(compiled, {
      operation: 'project_scope',
      slug: 'project',
    });
    const overview = queryCompiledOntology(compiled, { operation: 'overview', limit: 5 });
    const diagnosisOptions = { omotIgnorePatterns: loadOmotIgnore(ontologyRoot) };
    const workspaceBrief = queryCompiledOntology(compiled, { operation: 'workspace_brief' }, diagnosisOptions);
    const tunedWorkspaceBrief = queryCompiledOntology(compiled, {
      operation: 'workspace_brief',
      limit: 3,
      ...VERIFY_TUNED_HEALTH_ARGS,
      nodeLimit: VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
    }, diagnosisOptions);
    const health = queryCompiledOntology(compiled, { operation: 'health' }, diagnosisOptions);
    const tunedHealth = queryCompiledOntology(compiled, {
      operation: 'health',
      ...VERIFY_TUNED_HEALTH_ARGS,
    }, diagnosisOptions);
    const analyzedRepo = analyzeRepoStructure(process.cwd(), { maxDepth: 2 });
    const inferredImports = inferImports(process.cwd());
    const topModuleEdge = inferredImports.moduleEdges[0];
    const topModuleEdgeSummary = `${topModuleEdge.from}->${topModuleEdge.to} x${topModuleEdge.count} \\(${importKindSummary(topModuleEdge.kindCounts)}\\)`;

    assert.match(verifySection, /npm run verify -- \.\.\/docs\/ontology/);
    assert.match(verifySection, /npm run verify -- --vault \.\.\/docs\/ontology/);
    assert.match(verifySection, /npm run verify -- \.\.\/docs\/ontology --timeout-ms 15000/);
    assert.match(verifySection, /npm run verify -- --help/);
    assert.match(verifySection, /explicit positional vault or `--vault` argument takes\s+precedence over `OMOT_VAULT`/);
    assert.match(verifySection, /`npm run verify -- --help` prints the same first-contact scope/);
    assert.match(verifySection, /direct read smokes for `list_concepts` project probe \/ `get_concept` \/\s+`get_concepts` \/ `find_evidence` \/ `find_backlinks` \/ `query_concepts` \/\s+limited `query_concepts` \/ `analyze_repo_structure` \/ `infer_imports` \/\s+`find_neighbors` \/ `find_path` \/ `find_orphans`/);
    assert.match(verifySection, /strict unknown-argument \/ invalid-enum rejection/);
    assert.match(verifySection, /`list_concepts\.lmit` plus `list_concepts\.summry`/);
    assert.match(verifySection, /reports multiple unknown tool arguments together/);
    assert.match(verifySection, /single-row `add_relation` negative smoke uses missing endpoints plus a\s+typoed relation type/);
    assert.match(verifySection, /maintenance_plan cursor handling \(ready page \+\s+missing `afterActionId`\)/);
    assert.match(verifySection, /ready page must keep `cursor\.found=true`,\s+`cursor\.reason=null`/);
    assert.match(verifySection, /missing cursor still reports `cursor\.found=false`,\s+reason, empty page, `cursor\.nextAfterActionId=null`, and `cursor\.hasMore=false`/);
    assert.match(verifySection, /`nextAfterActionId` must match the last\s+returned action, and `hasMore` must match the remaining page state/);
    assert.match(verifySection, /valid\s+`afterActionId` resume request from the first returned action id/);
    assert.match(verifySection, /resumed page repeats that cursor action or `remainingActions` does not\s+advance/);
    assert.match(verifySection, /`nextExecutableAction` \/\s+`nextReviewAction` point only at the first executable\/review action in the\s+current returned page/);
    assert.match(verifySection, /including the action id, executable flag, `phase`, `kind`,\s+and `severity`/);
    assert.match(verifySection, /maintenance summary counts \(`totalActions`,\s+`filteredActions`, `remainingActions`, `executableActions`, `reviewActions`\)/);
    assert.match(verifySection, /`byPhase` \/ `bySeverity` \/ `byKind`\s+bucket totals against `remainingActions`/);
    assert.match(verifySection, /catches\s+work-queue drift/);
    assert.match(verifySection, /Successful\s+verify logs print the same bucket summary and current-page executable\/review\s+next-action summary/);
    assert.match(verifySection, /list_concepts\/project probe\/get_concept\/get_concepts\/find_evidence\/find_backlinks\/query_concepts\/limited query_concepts\/analyze_repo_structure\/infer_imports\/find_neighbors\/find_path\/find_orphans\/list_kinds/);
    assert.match(verifySection, /✓ initialize instructions — first-contact safety guidance present/);
    assert.match(verifySection, /✓ tools\/list schema contract — strict arguments \+ annotations \+ graph-query enums \+ graph kind enums \+ write relation enums \+ health tuning \+ post-write bucket guidance/);
    assert.match(verifySection, /✓ strict arguments — unknown tool argument rejected at runtime/);
    assert.match(verifySection, /✓ strict arguments — multiple unknown tool arguments reported together/);
    assert.match(verifySection, /✓ add_concepts — non-object, unknown-field, and duplicate-slug rows isolated with input indexes/);
    assert.match(verifySection, /✓ add_relations — non-object, unknown-field, and invalid-type rows isolated with input indexes and closest-value hints/);
    assert.match(verifySection, /✓ strict enums — invalid query operation rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict relation filters — invalid dependencyTypes rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict relation_check — invalid type rejected before endpoint resolution with closest-value hint/);
    assert.match(verifySection, /✓ strict add_relation — invalid type rejected before endpoint resolution without writing/);
    assert.match(verifySection, /✓ strict graph kind filters — invalid match_nodes\.kind rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict graph edge kind filters — invalid match_edges\.fromKind\/toKind rejected with closest-value hints/);
    assert.match(verifySection, /✓ maintenance cursor — missing afterActionId reported .*phase none; severity none; kind none; executable none; review none/);
    assert.match(verifySection, /✓ maintenance cursor — ready page stable .*phase none; severity none; kind none; executable none; review none/);
    assert.match(verifySection, /✓ maintenance cursor — ready page stable/);
    assert.match(verifySection, /maintenance cursor — resume skipped \(ready page has no actions\)/);
    assert.match(verifySection, new RegExp(`✓ get_concept — project \\(${projectOutgoingEdgeCount} outgoing ${projectOutgoingEdgeLabel}\\)`));
    assert.match(verifySection, /✓ get_concepts — 2 ok rows, 1 partial row/);
    assert.match(verifySection, new RegExp(`✓ find_evidence — ${countLabel(projectEvidenceCount, 'evidence result')} for "project"`));
    assert.match(verifySection, new RegExp(`✓ find_backlinks — project \\(${projectBacklinkCount} ${projectBacklinkLabel}\\)`));
    assert.match(
      verifySection,
      new RegExp(`✓ query_concepts — ${countLabel(projectQueryCount, 'query result')} / ${countLabel(projectQueryCount, 'total query result')}`),
    );
    assert.match(
      verifySection,
      new RegExp(`✓ query_concepts limited — ${countLabel(1, 'query result')} / ${countLabel(limitedQueryTotal, 'total query result')} \\(limited true\\)`),
    );
    assert.match(
      verifySection,
      new RegExp(
        `✓ analyze_repo_structure — ${analyzedRepo.framework} \\(${countLabel(analyzedRepo.domains.length, 'domain candidate')}, ${countLabel(analyzedRepo.capabilities.length, 'capability candidate')}, ${countLabel(analyzedRepo.elements.length, 'element candidate')}\\)`,
      ),
    );
    assert.match(
      verifySection,
      new RegExp(`✓ infer_imports — ${countLabel(inferredImports.filesScanned, 'file')} scanned, ${countLabel(inferredImports.moduleEdges.length, 'module edge')} \\(${topModuleEdgeSummary}`),
    );
    assert.match(verifySection, new RegExp(`✓ find_neighbors — ${neighborSmokeLine}`));
    assert.match(verifySection, /✓ find_path — elements\/file-system-access-api → project \(2 hops, 2 edges\)/);
    assert.match(verifySection, /✓ find_orphans — 0 orphans \(root\/sentinel defaults excluded\)/);
    assert.match(verifySection, /✓ project probe — 1 project node/);
    assert.match(verifySection, new RegExp(`✓ list_concepts — vault total ${census.total} nodes`));
    assert.match(verifySection, new RegExp(`✓ list_kinds — ${census.total} nodes \\(${kindSummary}\\)`));
    assert.match(verifySection, new RegExp(`✓ validate_vault — ${census.files} files, 0 problem files`));
    assert.match(
      verifySection,
      new RegExp(
        `✓ workspace_brief — ${workspaceBrief.status} \\(${census.total} nodes, ${countLabel(workspaceBrief.nextActions.length, 'next action')}, ${countLabel(workspaceBrief.health.checks.length, 'health check')}, growth actions:${workspaceBrief.growth.totalActions} external:${workspaceBrief.growth.externalElementRefs} ignoredExternal:${workspaceBrief.growth.externalElementRefsIgnored}\\)`,
      ),
    );
    assert.match(
      verifySection,
      new RegExp(
        `✓ workspace_brief_tuned — ${tunedWorkspaceBrief.status} \\(${census.total} nodes, ${countLabel(tunedWorkspaceBrief.nextActions.length, 'next action')}, ${countLabel(tunedWorkspaceBrief.health.checks.length, 'health check')}, growth actions:${tunedWorkspaceBrief.growth.totalActions} external:${tunedWorkspaceBrief.growth.externalElementRefs} ignoredExternal:${tunedWorkspaceBrief.growth.externalElementRefsIgnored}; ${regexEscape(tunedWorkspaceBriefScopeOutputSummary())}\\)`,
      ),
    );
    const tunedBriefAction = tunedWorkspaceBrief.nextActions[0];
    if (tunedBriefAction) {
      assert.match(
        verifySection,
        new RegExp(
          `workspace_brief_tuned non-blocking advisory nextActions — ${tunedBriefAction.id}:${tunedBriefAction.severity}:${tunedBriefAction.count} - ${regexEscape(tunedBriefAction.message)}`,
        ),
      );
    } else {
      assert.doesNotMatch(verifySection, /workspace_brief_tuned non-blocking advisory nextActions/);
    }
    assert.match(
      verifySection,
      new RegExp(
        `✓ health — ${health.status} \\(issues:${health.summary.issues}, unresolved:${health.summary.unresolvedEdges}, cycles:${health.summary.dependencyCycles}, ${countLabel(health.checks.length, 'check')}: ${healthCheckSummary(health.checks)}\\)`,
      ),
    );
    assert.match(
      verifySection,
      new RegExp(
        `✓ health_tuned — ${tunedHealth.status} \\(issues:${tunedHealth.summary.issues}, unresolved:${tunedHealth.summary.unresolvedEdges}, cycles:${tunedHealth.summary.dependencyCycles}, ${countLabel(tunedHealth.checks.length, 'check')}: ${healthCheckSummary(tunedHealth.checks)}; ${regexEscape(tunedHealthScopeOutputSummary())}\\)`,
      ),
    );
    assert.match(verifySection, new RegExp(`✓ compile_ontology — graph ${graphHashPrefix} \\(${compiled.nodeCount} nodes, ${compiled.edgeCount} edges, issues ${compiled.issueCount}\\)`));
    assert.match(verifySection, new RegExp(`✓ compile_ontology page — 1/${compiled.nodeCount} nodes, 1/${compiled.edgeCount} edges`));
    assert.match(
      verifySection,
      new RegExp(
        `✓ compile_ontology indexes — out ${indexOutCount}, in ${indexInCount}, edgeById ${indexEdgeCount}, aliases ${compiled.aliasCount}, edges ${compiled.resolvedEdgeCount}/${compiled.externalEdgeCount}/${compiled.unresolvedEdgeCount}`,
      ),
    );
    assert.match(verifySection, new RegExp(`✓ overview — graph ${graphHashPrefix} \\(${compiled.nodeCount} nodes, ${compiled.edgeCount} edges, hubs ${overview.hubs.length}\\)`));
    assert.match(verifySection, new RegExp(`✓ overview query_plan — aggregate_scan \\(medium, nodes ${compiled.nodeCount}, edges ${compiled.edgeCount}\\)`));
    assert.match(verifySection, new RegExp(`✓ project_map query_plan — aggregate_scan \\(medium, nodes ${compiled.nodeCount}, edges ${compiled.edgeCount}\\)`));
    assert.match(verifySection, new RegExp(`✓ neighbors — ${neighborSmokeLine}`));
    assert.match(verifySection, /✓ path — elements\/file-system-access-api → project \(2 hops, 2 edges\)/);
    assert.doesNotMatch(verifySection, /✓ path — project → project/);
    assert.match(verifySection, new RegExp(`✓ project_scope — project \\(${scopedNodes} nodes, internalEdges ${projectScope.summary.internalEdges}\\)`));
    assert.match(verifySection, /✓ destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(verifySection, new RegExp(regexEscape(`✓ structuredContent — ${structuredContentVerifySummary({
      hasNode: true,
      hasProject: true,
      hasGetConcept: true,
      hasFindBacklinks: true,
      hasDirectGraphReads: true,
      hasLimitedQueryConcepts: true,
      hasCompileIndexes: true,
      destructiveDryRunCount: 3,
    })}`)));
    assert.match(verifySection, /All passed — register \.mcp\.json with your MCP client and restart to use the 23 tools/);
    assert.match(verifySection, /`list_concepts`, a project-node `list_concepts` probe,\s+`get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`,\s+`query_concepts`, limited `query_concepts`, `analyze_repo_structure`,\s+`infer_imports`, `find_neighbors`, `find_path`, `find_orphans`,\s+`list_kinds`, `validate_vault`/);
    assert.match(verifySection, /batch success rows\s+and partial rows are verified during installation checks/);
    assert.match(verifySection, /`query_ontology\(\{operation:"neighbors"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"path"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"project_scope"\}\)`/);
    assert.match(verifySection, /indexed compile smoke verifies index shape, count alignment, edge membership,\s+known-slug references, and resolved\/external\/unresolved edge breakdowns/);
    assert.match(verifySection, /requires every exercised direct read, write row-isolation smoke,\s+destructive dry-run smoke, maintenance cursor, and\s+`query_ontology` graph-query response to include `structuredContent`, and\s+compares that payload with the text JSON payload/);
    assert.match(verifySection, /summarizes the\s+direct-read, write, maintenance-cursor, and graph-query `structuredContent` coverage/);
    assert.match(verifySection, /project-node `list_concepts` probe/);
    assert.match(verifySection, /`kind: project`/);
    assert.match(verifySection, /`list_kinds\.byKind\.project`/);
    assert.match(verifySection, /`additionalProperties:false`/);
    assert.match(verifySection, /`annotations\.title` display name/);
    assert.match(verifySection, /`annotations\.readOnlyHint` read\/write split/);
    assert.match(verifySection, /`annotations\.destructiveHint`/);
    assert.match(verifySection, /`annotations\.openWorldHint:false`/);
    assert.match(verifySection, /`annotations\.idempotentHint`/);
    assert.match(verifySection, /required `query_ontology\.operation`/);
    assert.match(verifySection, /`query_ontology\.operation` \/[\s\S]*`query_ontology\.targetOperation` enums/);
    assert.match(verifySection, /`list_kinds`\s+`outputSchema` and matching `structuredContent` census payload/);
    assert.match(verifySection, /`validate_vault`\s+`outputSchema` and matching `structuredContent` health payload/);
    assert.match(verifySection, /`list_concepts`\s+`outputSchema` and matching `structuredContent` node table payload/);
    assert.match(verifySection, /`get_concept`\s+`outputSchema` for single-node detail payloads/);
    assert.match(verifySection, /`get_concepts`\s+`outputSchema` and matching `structuredContent` batch payload/);
    assert.match(verifySection, /`find_evidence`\s+`outputSchema` and matching `structuredContent` evidence-match payload/);
    assert.match(verifySection, /`find_backlinks`\s+`outputSchema` and matching `structuredContent` backlink-match payload/);
    assert.match(verifySection, /`find_neighbors`\s+`outputSchema` and matching `structuredContent` local-neighborhood payload/);
    assert.match(verifySection, /`find_path`\s+`outputSchema` and matching `structuredContent` shortest-path payload/);
    assert.match(verifySection, /`find_orphans`\s+`outputSchema` and matching `structuredContent` orphan-list payload/);
    assert.match(verifySection, /`query_concepts`\s+`outputSchema` and matching `structuredContent` typed-filter payload/);
    assert.match(verifySection, /`compile_ontology`\s+`outputSchema` and matching `structuredContent` graph-summary \/ full-artifact payload/);
    assert.match(verifySection, /`analyze_repo_structure`\s+`outputSchema` and matching `structuredContent` bootstrap-candidate payload/);
    assert.match(verifySection, /`infer_imports`\s+`outputSchema` and matching `structuredContent` import-graph payload/);
    assert.match(verifySection, /`add_concept`,\s+`add_relation`, and `patch_concept` single writer `outputSchema` contracts/);
    assert.match(verifySection, /`add_concepts`\s+and `add_relations` batch writer `outputSchema` row contracts/);
    assert.match(verifySection, /`rename_concept`,\s+`merge_concepts`, and `delete_concept` destructive writer dry-run\/confirm `outputSchema`\s+contracts/);
    assert.match(verifySection, /same 50-row cap used by `get_concepts`, `add_concepts`,\s+and `add_relations`/);
    assert.match(verifySection, /`find_orphans\.excludeKinds` string-array\s+schema and root\/sentinel default description/);
    assert.match(verifySection, /write-safety schemas for\s+`expected_mtime`/);
    assert.match(verifySection, /destructive-tool `confirm` dry-run switches/);
    assert.match(verifySection, /`rename_concept\.overwrite`/);
    assert.match(verifySection, /`delete_concept\.force`/);
    assert.match(verifySection, /batch row isolation for non-object row shape,\s+unknown row field inputs/);
    assert.match(verifySection, /invalid `add_relations` type hints/);
    assert.match(verifySection, /`concepts\[n\]` \/\s+`relations\[n\]` error labels/);
    assert.match(verifySection, /Destructive dry-run smoke calls `rename_concept`, `merge_concepts`, and\s+`delete_concept` against live vault slugs without writing/);
    assert.match(verifySection, /preview is missing or includes `changed` or `postWriteMaintenance`/);
    assert.match(verifySection, /row-level `ok:false`\s+results[\s\S]*closest-value hints for invalid relation types[\s\S]*top-level\s+tool error/);
    assert.match(verifySection, /`initialize\.instructions` gate fails/);
    assert.match(verifySection, /read-only diagnosis flow/);
    assert.match(verifySection, /`newSlug` \/ `overwrite: true` safety/);
    assert.match(verifySection, /`delete_concept\.force` \/ dangling\s+referrers safety/);
    assert.match(verifySection, /strict-input typo recovery guidance/);
    assert.match(verifySection, /`Did you mean "limit"\?`/);
    assert.match(verifySection, /`Did you mean "overview"\?`/);
    assert.match(verifySection, /`Received arguments: \.\.\.`/);
    assert.match(verifySection, /Batch repair\s+guidance is gated as well/);
    assert.match(verifySection, /`concepts\[n\] duplicate slug in input batch; first seen at concepts\[m\]`/);
    assert.match(verifySection, /Maintenance work-queue\s+guidance is gated too/);
    assert.match(verifySection, /enum-validated\s+`maintenance_plan` filters/);
    assert.match(verifySection, /ready cursor pages with `cursor\.found=true` plus\s+`cursor\.reason=null`/);
    assert.match(verifySection, /unknown `afterActionId` cursor misses/);
    assert.match(verifySection, /`cursor\.found=false` plus `cursor\.reason`/);
    assert.match(verifySection, /runtime negative calls with `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"`/);
    assert.match(verifySection, /`maintenance_plan\.afterActionId="maint_missing"`/);
    assert.match(verifySection, /`cursor\.found=false`/);
    assert.match(verifySection, /Successful verify output prints the\s+accepted `phases` \/ `severities` \/ `kinds` enum lists/);
    assert.match(readme, /strict maintenance filters — invalid phase\/severity\/kind rejected at runtime \(phases=validate\/repair\/link\/materialize\/review; severities=fail\/warn\/info; kinds=inspect_compile_issue\/break_dependency_cycle\/canonicalize_graph_arrays\/resolve_dangling_reference\/add_missing_relation\/materialize_external_element\/unassigned_node\/empty_domain\)/);
    assert.match(verifySection, /project-less vaults skip/);
    assert.match(verifySection, /Empty\s+vaults skip node-targeted graph smoke/);
    assert.match(verifySection, /`list_kinds` \/ `compile_ontology` \/ `overview`\s+census shape\/count mismatches/);
    assert.match(verifySection, /Missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /`workspace_brief\.nextActions`/);
    assert.match(verifySection, /`workspace_brief\.health\.checks`/);
    assert.match(verifySection, /`health\.checks`/);
  });

  it('keeps the MCP changelog aligned with the verify census gates', () => {
    const changelog = readFileSync('mcp/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Fixed — package tarball runtime files')[1]?.split('## 0.11.0')[0] ?? '';

    assert.match(verifySection, /`list_concepts`, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /`get_concept`/);
    assert.match(verifySection, /single-node detail payload drift/);
    assert.match(verifySection, /success-row \/ partial-row contract drift/);
    assert.match(verifySection, /`find_evidence`, `find_backlinks`, and `query_concepts`/);
    assert.match(verifySection, /limit:1` query that must report `limited:true`/);
    assert.match(verifySection, /search, backlink-impact, typed-filter row-shape, limit-semantics, and `structuredContent` drift/);
    assert.match(verifySection, /direct `find_neighbors` and `find_path`/);
    assert.match(verifySection, /local-neighborhood and shortest-path read-tool drift/);
    assert.match(verifySection, /paginated `compile_ontology\(\{nodesLimit:1, edgesLimit:1\}\)`/);
    assert.match(verifySection, /`compile_ontology`, `overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query execution with `neighbors`, node→project `path`, and `project_scope`/);
    assert.match(verifySection, /validates `path` hop\/edge alignment/);
    assert.match(verifySection, /dedicated `list_concepts` call before graph smoke/);
    assert.match(verifySection, /skips only the containment-specific `project_scope` smoke/);
    assert.match(verifySection, /accepts empty vault folders by skipping node-targeted graph smoke/);
    assert.match(verifySection, /cross-checks node census totals across `list_kinds`, `list_concepts`, `compile_ontology`, and `overview`/);
    assert.match(verifySection, /keeping `validate_vault\.scanned` as file-level health/);
    assert.match(verifySection, /missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /top-level `status`, `workspace_brief\.nextActions`,\s+`workspace_brief\.health\.checks`, `health\.checks`, tuned `workspace_brief\.health\.checks`, and tuned `health\.checks`/);
    assert.match(verifySection, /top-level diagnosis `status` must be `healthy` or `needs_attention`/);
    assert.match(verifySection, /requires every `workspace_brief\.nextActions` row to include a non-empty `id` or `kind` plus `severity` in `info` \/ `warn` \/ `fail`/);
    assert.match(verifySection, /requires every health check row to include non-empty `id` plus `status` in `pass` \/ `warn` \/ `fail` \/ `info`/);
    assert.match(verifySection, /optional `count` fields must be non-negative integers/);
    assert.match(verifySection, /`workspace_brief\.nextActions\[\]\.sample` includes executable examples/);
    assert.match(verifySection, /`add_missing_relations` samples are `add_relation` calls with\s+`from` \/ `to` \/ `type`/);
    assert.match(verifySection, /`materialize_external_elements` samples are\s+`add_concept` calls for `kind:"element"`/);
    assert.match(verifySection, /`resolve_dangling_references` samples keep the\s+`resolve_dangling_reference` row shape with score and reason/);
    assert.match(verifySection, /prints the validated `workspace_brief\.health\.checks` count/);
    assert.match(verifySection, /compact advisory list with label\/severity\/count\/message detail/);
    assert.match(verifySection, /health check `id:status:count` coverage/);
    assert.match(verifySection, /accepts direct vault arguments/);
    assert.match(verifySection, /explicit direct arguments take precedence over the environment variable/);
    assert.match(verifySection, /`npm run verify -- --vault \.\.\/vault`/);
    assert.match(verifySection, /supports `--timeout-ms` or `OMOT_VERIFY_TIMEOUT_MS`/);
    assert.match(verifySection, /suggest increasing `--timeout-ms` or `OMOT_VERIFY_TIMEOUT_MS`/);
    assert.match(verifySection, /Real timeout failures suggest the same\s+retry shape/);
    assert.match(verifySection, /invalid timeout values fail before the server\s+starts and print\s+the received value plus a concrete retry example/i);
    assert.match(verifySection, /`npm run verify -- --timeout-ms 15000`/);
    assert.match(verifySection, /validates the installed `tools\/list` schema contract/);
    assert.match(verifySection, /`query_ontology\.operation` must stay required/);
    assert.match(verifySection, /graph engine runtime allow-lists/);
    assert.match(verifySection, /write relation\s+type enums for `add_relation` \/ `add_relations`/);
    assert.match(verifySection, /batch tools must keep their 50-row caps/);
    assert.match(verifySection, /validates the installed `find_orphans\.excludeKinds` schema and default description/);
    assert.match(verifySection, /write tools must keep their `expected_mtime` \/ `confirm` \/ `rename_concept\.overwrite` \/ `delete_concept\.force` safety schemas/);
    assert.match(verifySection, /validates `maintenance_plan\.summary` count fields and relationships plus `byPhase` \/ `bySeverity` \/ `byKind` bucket totals/);
    assert.match(verifySection, /validates `maintenance_plan\.cursor\.nextAfterActionId` and `cursor\.hasMore`/);
    assert.match(verifySection, /write tool descriptions keep compact `postWriteMaintenance` bucket summaries/);
    assert.match(verifySection, /`byPhase` \/ `bySeverity` \/ `byKind`/);
    assert.match(verifySection, /action `score`/);
    assert.match(verifySection, /executable `proposedAction`/);
    assert.match(verifySection, /current-page next action pointer guidance/);
    assert.match(verifySection, /`concepts\[n\]` \/ `relations\[n\]` error labels/);
    assert.match(verifySection, /calls destructive dry-runs for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(verifySection, /previews stay non-writing and do not include `changed` or `postWriteMaintenance`/);
    assert.match(verifySection, /`initialize\.instructions` now names the destructive-write safety boundaries directly/);
    assert.match(verifySection, /`overwrite: true`/);
    assert.match(verifySection, /dangling referrers/);
    assert.match(verifySection, /`npm run verify` now fails when `initialize\.instructions` loses first-contact safety guidance/);
    assert.match(verifySection, /read-only diagnosis/);
    assert.match(verifySection, /`expected_mtime`/);
    assert.match(verifySection, /`force: true`/);
    assert.match(verifySection, /strict-input typo recovery/);
    assert.match(verifySection, /`Did you mean "limit"\?` \/ `Did you mean "overview"\?`/);
    assert.match(verifySection, /runtime negative smoke calls with invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"` inputs/);
  });

  it('keeps the CLI README explicit about mcp-verify help scope', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const tableRow = readme.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const maintenanceRow = readme.split('| `oh-my-ontology maintenance [vault]` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = readme.split('| `oh-my-ontology infer-imports [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(tableRow, /project-node `list_concepts` probe/);
    assert.match(tableRow, /tools\/list annotation coverage/);
    assert.match(tableRow, /relation filter \/ `relation_check` closest-value rejection/);
    assert.match(tableRow, /destructive dry-run smoke for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(tableRow, /write-tool `postWriteMaintenance` `byPhase`\/`bySeverity`\/`byKind` buckets \+ `score`\/`proposedAction`\/next-action guidance/);
    assert.match(tableRow, /enum-validated `maintenance_plan` filters/);
    assert.match(tableRow, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(tableRow, /maintenance bucket \/ current-page next-action summaries/);
    assert.match(tableRow, /`query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`/);
    assert.match(tableRow, /`find_orphans`/);
    assert.match(tableRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(tableRow, /`neighbors`\/`path`\/`project_scope` graph-query smoke/);
    assert.match(maintenanceRow, /MCP `maintenance_plan` cleanup\/repair work queue/);
    assert.match(maintenanceRow, /`--after-action-id`/);
    assert.match(maintenanceRow, /compile\/cycle\/canonicalize\/dangling\/relation\/external\/ignored-external summary counts/);
    assert.match(maintenanceRow, /phase\/severity\/kind bucket summaries/);
    assert.match(maintenanceRow, /current-page next action pointers/);
    assert.match(maintenanceRow, /cursor\/filter dogfood/);
    assert.match(inferImportsRow, /file edge kind summary/);
    assert.match(inferImportsRow, /per-module `kindCounts`/);
    assert.match(inferImportsRow, /`tsconfig\.json` paths aliases/);
    assert.match(inferImportsRow, /fallback common `@\/\*` aliases/);
    assert.match(inferImportsRow, /`static` \/ `dynamic` \/ `require` \/ `reexport` \/ `side`/);
    assert.match(inferImportsRow, /static-heavy dependencies/);
    assert.match(inferImportsRow, /`--threshold N`/);
    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /direct read smoke set/);
    assert.match(verifySection, /`get_concept`,\s+`get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited\s+`query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`,\s+`find_path`, and `find_orphans`/);
    assert.match(verifySection, /single-node, batch, search\/backlink,\s+limit-semantics, bootstrap\/import analysis, neighborhood, shortest-path, and\s+orphan coverage/);
    assert.match(verifySection, /`tools\/list` schema contract/);
    assert.match(verifySection, /annotation coverage \(`title` \/ `read` \/ `write` \/ `destructive` \/\s+`idempotent` \/ `local-only`\)/);
    assert.match(verifySection, /write-tool `postWriteMaintenance` `byPhase` \/ `bySeverity` \/\s+`byKind` bucket summaries plus `score` \/ executable `proposedAction` \/\s+current-page next action pointer guidance/);
    assert.match(verifySection, /runtime negative smokes with invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"` inputs/);
    assert.match(verifySection, /`maintenance_plan` cursor contract/);
    assert.match(verifySection, /`cursor\.found=true` with `cursor\.reason=null`/);
    assert.match(verifySection, /`nextAfterActionId`\s+matching the last returned action, and `hasMore` matching the remaining page\s+state/);
    assert.match(verifySection, /ready page has actions, verify resumes from the first returned action\s+id/);
    assert.match(verifySection, /resumed page repeats that cursor action or leaves\s+`remainingActions` unadvanced/);
    assert.match(verifySection, /`cursor\.found=false`/);
    assert.match(verifySection, /`nextAfterActionId=null` \/ `hasMore=false`/);
    assert.match(verifySection, /`nextExecutableAction` \/ `nextReviewAction`\s+point only at the first executable\/review action in the current returned page/);
    assert.match(verifySection, /Successful maintenance cursor lines also print bucket summaries and\s+current-page executable\/review next-action summaries/);
    assert.match(verifySection, /enum-validated\s+`maintenance_plan\.phases` \/ `maintenance_plan\.severities` \/\s+`maintenance_plan\.kinds` filters/);
    assert.match(verifySection, /strict work-queue\s+checks before starting the MCP server/);
    assert.match(verifySection, /Batch tool caps/);
    assert.match(verifySection, /Write-safety schema/);
    assert.match(verifySection, /get_concepts/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /bootstrap\/import analysis payload drift/);
    assert.match(verifySection, /orphan-cleanup drift/);
    assert.match(verifySection, /probes `kind: project` directly before graph smoke/);
    assert.match(verifySection, /`list_kinds\.byKind\.project`/);
    assert.match(verifySection, /Node census totals are cross-checked across `list_kinds`, `list_concepts`,\s+`compile_ontology`, and `overview`/);
    assert.match(verifySection, /`validate_vault\.scanned` remains file-level\s+health/);
    assert.match(verifySection, /validates both default and tuned\s+`workspace_brief\.health\.checks`/);
    assert.match(verifySection, /prints tuned `workspace_brief` output\s+beside `health` \/ tuned `health`/);
    assert.match(verifySection, /`issues\/unresolved\/cycles\/checks` plus check `id:status:count` coverage/);
    assert.match(verifySection, /verified health scope without opening the raw MCP payload/);
    assert.match(verifySection, /stdout/);
    assert.match(verifySection, /paginated `compile_ontology\(\{nodesLimit:1, edgesLimit:1\}\)`/);
    assert.match(verifySection, /graph index payloads, index membership, and edge breakdown counts/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors`/);
    assert.match(verifySection, /Invalid timeout values print the received value/);
    assert.match(verifySection, /`oh-my-ontology mcp-verify --timeout-ms 15000`/);
    assert.match(verifySection, /wrapper was called with an explicit vault, timeout retry hints preserve that\s+vault in the retry command as `--vault <path>`/);
    assert.match(verifySection, /node-to-project `path`/);
    assert.match(verifySection, /`path` hop\/edge alignment/);
    assert.match(verifySection, /`path` \/ `project_scope` calls/);
    assert.match(verifySection, /Vaults without a `kind: project`\s+node skip/);
    assert.match(verifySection, /empty vault\s+folders skip\s+node-targeted graph smoke/);
  });

  it('keeps the CLI README explicit about focused source-checkout verification', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const section = readme.split('### Source-checkout verification')[1]?.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[0] ?? '';

    assert.match(section, /pnpm test:cli:lib/);
    assert.match(section, /pnpm test:contracts/);
    assert.match(section, /pnpm integration:cli:mcp-verify/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:maintenance/);
    assert.match(section, /pnpm test:mcp:package/);
    assert.match(section, /pnpm test:mcp:verify/);
    assert.match(section, /pnpm test:mcp:verify:first-contact/);
    assert.match(section, /health summary \/ advisory \/ next-action gates/);
    assert.match(section, /pnpm test:mcp:verify:timeout/);
    assert.match(section, /pnpm dogfood:verify/);
    assert.match(section, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000/);
    assert.match(section, /pnpm cli:mcp-verify -- --help/);
    assert.match(section, /shared CLI helper contracts/);
    assert.match(section, /argument parsing/);
    assert.match(section, /command registry metadata/);
    assert.match(section, /MCP response unwrapping/);
    assert.match(section, /installed MCP verification wrapper/);
    assert.match(section, /documentation drift/);
    assert.match(section, /maintenance_plan filter, cursor, resume,\s+work-queue shape, and bucket \/ next-action formatter contracts/);
    assert.match(section, /shared MCP verify helper contract/);
    assert.match(section, /first-contact initialize\s+batch relation type guidance, read smoke/);
    assert.match(section, /vault warning \/ `validate_vault`/);
    assert.match(section, /health summary \/ advisory \/ next-action gates/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /timeout parsing, startup failure retry\s+guidance, usage, and retry diagnostics/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /Node `--test-name-pattern`/);
    assert.match(section, /`dogfood:verify` is the shortest root-checkout dogfood vault gate/);
    assert.match(section, /`cli:mcp-verify` is the root-checkout shortcut for the CLI wrapper/);
    assert.match(section, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000` when you need to pass\s+explicit verify args/);
    assert.match(section, /Vault arguments are passed without the extra `--`/);
    assert.match(section, /keep `-- --help`\s+for the help flag/);
  });

  it('keeps the CLI README explicit about installed batch row isolation gates', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('### Node.js API')[0] ?? '';

    assert.match(verifySection, /batch writer row isolation guidance for `add_concepts` and\s+`add_relations`/);
    assert.match(verifySection, /non-object row shape, unknown row field, and\s+duplicate `add_concepts` slug failures surfacing as row-level `ok:false`/);
    assert.match(verifySection, /instead of top-level tool errors/);
    assert.match(verifySection, /with no `postWriteMaintenance`/);
    assert.match(verifySection, /destructive writer dry-runs for `rename_concept`,\s+`merge_concepts`, and `delete_concept`/);
    assert.match(verifySection, /every\s+planned response to be present/);
    assert.match(verifySection, /`ok:false` \/ `dryRun:true` preview\s+with no `changed` or `postWriteMaintenance`/);
  });

  it('keeps the CLI README explicit about graph write safety switches', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const renameRow = readme.split('| `oh-my-ontology rename <oldSlug> <newSlug>` |')[1]?.split('\n')[0] ?? '';
    const deleteRow = readme.split('| `oh-my-ontology delete <slug>` |')[1]?.split('\n')[0] ?? '';

    assert.match(renameRow, /--confirm/);
    assert.match(renameRow, /--overwrite/);
    assert.match(renameRow, /existing target slug/);
    assert.match(deleteRow, /--confirm/);
    assert.match(deleteRow, /--force/);
    assert.match(deleteRow, /backlinks/);
  });

  it('keeps the CLI README explicit about batch failure fallback labels', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const bootstrapRow = readme.split('| `oh-my-ontology bootstrap [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const analyzeRow = readme.split('| `oh-my-ontology analyze [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = readme.split('| `oh-my-ontology infer-imports [rootPath]` |')[1]?.split('\n')[0] ?? '';

    assert.match(bootstrapRow, /Batch row-level failures without `slug` \/ `from` \/ `to` \/ `type`/);
    assert.match(bootstrapRow, /`concepts\[n\]` \/ `relations\[n\]` fallback labels instead of `undefined`/);
    assert.match(analyzeRow, /batch row-level failures without identifying fields/);
    assert.match(analyzeRow, /`concepts\[n\]` \/ `relations\[n\]` fallback labels instead of `undefined`/);
    assert.match(inferImportsRow, /prints `relations\[n\]` fallback labels for row-level failures without relation fields/);
  });

  it('keeps the CLI changelog aligned with the mcp-verify census scope', () => {
    const changelog = readFileSync('cli/CHANGELOG.md', 'utf-8');
    const productChangelog = readFileSync('docs/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Added — `mcp-verify` command')[1]?.split('### Added — `maintenance`')[0] ?? '';
    const maintenanceSection = changelog.split('### Added — `maintenance` 명령')[1]?.split('### Added — `compile`')[0] ?? '';
    const productMcpHardeningSection = productChangelog.split('## 2026-05-18 — MCP first-contact and packed-smoke hardening')[1]?.split('## 2026-05-17')[0] ?? '';
    const productMaintenanceSection = productChangelog.split('## 2026-05-17 — CLI maintenance queue + focused verification')[1]?.split('## 2026-05-11')[0] ?? '';

    assert.match(changelog, /malformed `compile`, `cycles`, `path` hop\/edge payloads, `health\.checks`, `workspace_brief\.health\.checks`, and `workspace_brief\.nextActions` rows/);
    assert.match(verifySection, /`list_concepts`, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /`get_concept` smoke/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /runtime smokes for `find_evidence`, `find_backlinks`, and `query_concepts`/);
    assert.match(verifySection, /search, backlink-impact, typed-filter row shapes, limit semantics, and `structuredContent`/);
    assert.match(verifySection, /runtime smokes for `analyze_repo_structure` and `infer_imports`/);
    assert.match(verifySection, /bootstrap-candidate and import-graph payloads plus `structuredContent`/);
    assert.match(verifySection, /runtime smokes for direct `find_neighbors` and `find_path`/);
    assert.match(verifySection, /daily local-neighborhood and shortest-path read tools/);
    assert.match(verifySection, /split between node census checks/);
    assert.match(verifySection, /file-level `validate_vault\.scanned` health/);
    assert.match(verifySection, /`workspace_brief\.nextActions\[\]\.sample` shape gate/);
    assert.match(verifySection, /real `add_relation` \/ `add_concept` inputs/);
    assert.match(verifySection, /`resolve_dangling_reference` rows/);
    assert.match(verifySection, /compact non-blocking advisory nextActions/);
    assert.match(verifySection, /issues\/unresolved\/cycles\/checks` health summaries/);
    assert.match(verifySection, /check `id:status:count` coverage/);
    assert.match(verifySection, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(verifySection, /`compile_ontology` summary \+ paginated full-artifact \+ indexed full-artifact smoke/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query smoke for `neighbors`, node→project `path`, and `project_scope`/);
    assert.match(verifySection, /project-node probe before graph smoke/);
    assert.match(verifySection, /accepts valid project-less vaults/);
    assert.match(verifySection, /accepts empty vault folders/);
    assert.match(verifySection, /runtime unknown-argument and invalid-enum rejection smoke/);
    assert.match(verifySection, /batch writer row-isolation gate for `add_concepts` \/ `add_relations`/);
    assert.match(verifySection, /non-object row shape, unknown row field, and duplicate `add_concepts` slug failures/);
    assert.match(verifySection, /row-level `ok:false` results with `concepts\[n\]` \/ `relations\[n\]` error labels instead of top-level tool errors, with no `postWriteMaintenance`/);
    assert.match(verifySection, /destructive dry-run smoke for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(verifySection, /every planned preview response is present, stays non-writing, and does not include `changed` or `postWriteMaintenance`/);
    assert.match(verifySection, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(verifySection, /valid `maintenance_plan\.afterActionId` resume smoke/);
    assert.match(verifySection, /repeated cursor actions or non-advancing `remainingActions`/);
    assert.match(verifySection, /`cursor\.found=false`/);
    assert.match(verifySection, /`cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(maintenanceSection, /`oh-my-ontology maintenance \[vault\]/);
    assert.match(maintenanceSection, /`query_ontology\(\{operation: 'maintenance_plan'\}\)`/);
    assert.match(maintenanceSection, /remaining\/filtered\/total counts/);
    assert.match(maintenanceSection, /cursor state/);
    assert.match(maintenanceSection, /phase\/severity\/kind bucket summaries/);
    assert.match(maintenanceSection, /current-page next executable\/review pointers/);
    assert.match(maintenanceSection, /`pnpm integration:cli:maintenance`/);
    assert.match(maintenanceSection, /maintenance-related installed verify cases/);
    assert.match(maintenanceSection, /신규 integration test 3건/);
    assert.match(productMaintenanceSection, /`oh-my-ontology maintenance`/);
    assert.match(productMaintenanceSection, /`query_ontology\(\{operation:"maintenance_plan"\}\)`/);
    assert.match(productMaintenanceSection, /phase \/ severity\s+\/ kind bucket summaries/);
    assert.match(productMaintenanceSection, /`pnpm integration:cli:maintenance`/);
    assert.match(productMaintenanceSection, /First-contact sample gate/);
    assert.match(productMaintenanceSection, /`workspace_brief\.nextActions\[\]\.sample` executable shapes/);
    assert.match(productMaintenanceSection, /real `add_relation` \/ `add_concept` inputs/);
    assert.match(productMaintenanceSection, /27-command CLI surface/);
    assert.match(productMcpHardeningSection, /Batch relation type hints/);
    assert.match(productMcpHardeningSection, /invalid relation types as row-level `ok:false` results with closest-value\s+hints/);
    assert.match(productMcpHardeningSection, /First-contact guidance gate/);
    assert.match(productMcpHardeningSection, /`initialize\.instructions` must explain/);
    assert.match(productMcpHardeningSection, /Packed install smoke parity/);
    assert.match(productMcpHardeningSection, /installed CLI\/MCP\s+verify paths/);
    assert.match(productMcpHardeningSection, /Dogfood docs contract/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';

    assert.match(releaseChecks, /pnpm dogfood:walk/);
    assert.match(releaseChecks, /pnpm dogfood:walk -- --help\s+# print dogfood usage without starting MCP/);
    assert.match(releaseChecks, /strict unknown-argument and invalid-enum rejection/);
    assert.match(releaseChecks, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(releaseChecks, /`--help` \/ timeout\s+failures print the same retry shape/);
    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /get_concepts` with discovered slugs plus one\s+missing slug/);
    assert.match(releaseChecks, /batch-read\s+partial-row contract/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /graph-query, destructive\s+dry-run, post-write bucket guidance, strict argument \/ enum rejection,\s+annotations, write relation enums, and health tuning schema scope/);
    assert.match(releaseChecks, /actual `neighbors`, node→project `path`, and\s+`project_scope` calls/);
    assert.match(releaseChecks, /project-less and empty-vault\s+verify paths/);
    assert.match(releaseChecks, /flow\/help\/failure/);
    assert.match(releaseChecks, /dependency-cycle vault/);
    assert.match(releaseChecks, /get_concepts` success\/partial rows/);
    assert.match(releaseChecks, /workspace-brief --json`\s+exits 1/);
    assert.match(releaseChecks, /fail-severity nextActions/);
    assert.match(releaseChecks, /compile --json` exits 1/);
    assert.match(releaseChecks, /unresolved graph references/);
    assert.match(releaseChecks, /cycles --json` exits 1/);
    assert.match(releaseChecks, /dependency cycles/);
    assert.match(releaseChecks, /path --json` exits 1/);
    assert.match(releaseChecks, /found:false/);
    assert.match(releaseChecks, /fail-closed/);
    assert.match(releaseChecks, /malformed `compile`,\s+`cycles`/);
    assert.match(releaseChecks, /`path`, `health`, or `workspace-brief` payloads/);
    assert.match(releaseChecks, /top-level diagnosis `status` must be `healthy` or `needs_attention`/);
    assert.match(releaseChecks, /workspace_brief\.nextActions/);
    assert.match(releaseChecks, /workspace_brief\.nextActions\[\]\.sample` executable shapes/);
    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(releaseChecks, /path edge check/);
    assert.match(releaseChecks, /tuned `workspace_brief` \/ tuned `health` gates regress/);
    assert.match(releaseChecks, /validate_vault` problem files/);
  });

  it('keeps the root README explicit about vault validator help', () => {
    const agents = readFileSync('AGENTS.md', 'utf-8');
    const readme = readFileSync('README.md', 'utf-8');
    const architecture = readFileSync('docs/ARCHITECTURE.md', 'utf-8');
    const prTemplate = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf-8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf-8');
    const vaultTooling = readme.split('### Vault tooling')[1]?.split('### Package / MCP release checks')[0] ?? '';

    assert.equal(pkg.scripts['test:vault:validate'], 'node --test scripts/validate-vault-script.test.mjs');
    assert.equal(pkg.scripts['test:vault:audit'], 'node --test scripts/audit-vault-paths.test.mjs');
    assert.match(workflow, /name: Vault validate \(dogfood frontmatter integrity\)\s+run: pnpm vault:validate/);
    assert.match(workflow, /name: Vault validator CLI contract\s+run: pnpm test:vault:validate/);
    assert.match(workflow, /name: Vault paths audit \(capability\/element 의 path 가 실 코드 일치\)\s+run: pnpm vault:audit/);
    assert.match(workflow, /name: Vault audit CLI contract\s+run: pnpm test:vault:audit/);
    assert.match(vaultTooling, /pnpm vault:validate\s+# frontmatter integrity audit/);
    assert.match(vaultTooling, /pnpm vault:validate \/your\/vault/);
    assert.match(vaultTooling, /pnpm vault:validate -- --help/);
    assert.match(vaultTooling, /print validator usage without scanning/);
    assert.match(vaultTooling, /pnpm test:vault:validate/);
    assert.match(vaultTooling, /focused validator CLI argument contract/);
    assert.match(vaultTooling, /pnpm test:vault:audit/);
    assert.match(vaultTooling, /focused vault audit CLI argument contract/);
    assert.match(readme, /CI runs `pnpm vault:validate`, `pnpm test:vault:validate`,\s+`pnpm vault:audit`, `pnpm test:vault:audit`, and `pnpm package:check`/);
    assert.match(agents, /pnpm test:vault:validate\s+# focused validator CLI argument contract/);
    assert.match(agents, /pnpm test:contracts\s+# focused cross-package contract suite/);
    assert.match(agents, /pnpm vault:audit\s+# capability\/element path drift guard \(R12\)/);
    assert.match(agents, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract/);
    assert.match(agents, /pnpm test:vault:audit\s+# vault audit CLI 인자 계약 focused test/);
    assert.match(agents, /pnpm test:contracts\s+# cross-package contract focused test/);
    assert.match(agents, /pnpm test:vault:validate\s+# validator CLI 인자 계약 focused test/);
    assert.match(architecture, /pnpm test:vault:validate\s+# focused validator CLI argument contract \(CI gate\)/);
    assert.match(architecture, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract \(CI gate\)/);
    assert.match(architecture, /pnpm test:contracts\s+# focused cross-package parser\/schema\/validator contracts/);
    assert.match(architecture, /`vault:validate`, `test:vault:validate`, `vault:audit`, `test:vault:audit`, and `package:check` run in CI/);
    assert.match(prTemplate, /If `scripts\/validate-vault\.mjs`, vault validation docs, or CI validation gates changed: `pnpm test:vault:validate`/);
    assert.match(prTemplate, /If `scripts\/audit-vault-paths\.mjs`, dogfood path audit docs, or CI audit gates changed: `pnpm test:vault:audit`/);
  });

  it('keeps the benchmark script-list task unfrozen', () => {
    const tasks = readFileSync('docs/benchmark/tasks.md', 'utf-8');
    const section = tasks.split('### C2 — package.json scripts')[1]?.split('---')[0] ?? '';

    assert.match(section, /Read `package\.json`, list all keys in `scripts`/);
    assert.match(section, /derive the count at measurement time/);
    assert.match(section, /`test:vault:validate`/);
    assert.match(section, /focused `test:mcp:\*` scripts/);
    assert.doesNotMatch(section, /All \d+ scripts/);
    assert.doesNotMatch(section, /\b12 scripts\b/);
  });

  it('keeps the root README dogfood snapshot aligned with the vault census', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const dogfoodRow = readme.split('| **Dogfooding** |')[1]?.split('\n')[0] ?? '';
    const census = dogfoodVaultCensus(process.cwd());

    assert.match(dogfoodRow, new RegExp(`\\*\\*${census.total} nodes\\*\\*`));
    assert.match(dogfoodRow, new RegExp(`capabilities ${census.byKind.capabilities}`));
    assert.match(dogfoodRow, new RegExp(`domains ${census.byKind.domains}`));
    assert.match(dogfoodRow, new RegExp(`elements ${census.byKind.elements}`));
    assert.match(dogfoodRow, new RegExp(`project ${census.byKind.project}`));
    assert.match(dogfoodRow, new RegExp(`vault-readme ${census.byKind['vault-readme']}`));
  });

  it('keeps current dogfood vault count docs aligned with the vault census', () => {
    const census = dogfoodVaultCensus(process.cwd());
    const backlog = readFileSync('docs/BACKLOG.md', 'utf-8');
    const direction = readFileSync('docs/PRODUCT-DIRECTION.md', 'utf-8');
    const hnPost = readFileSync('docs/launch/HN-POST.md', 'utf-8');
    const demoStoryboard = readFileSync('docs/launch/DEMO-GIF-STORYBOARD.md', 'utf-8');

    assert.match(backlog, new RegExp(`dogfood ${census.total} 노드`));
    assert.match(direction, new RegExp(`dogfood vault — ${census.total} nodes`));
    assert.match(hnPost, new RegExp(`dogfood vault — ${census.total} nodes`));
    assert.match(demoStoryboard, new RegExp(`dogfood vault \\(${census.total} 노드\\)`));
  });

  it('keeps dogfood CLI docs explicit about fail-closed graph diagnostics', () => {
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const readme = readFileSync('cli/README.md', 'utf-8');
    const mcpVerifyRow = doc.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = doc.split('| `oh-my-ontology infer-imports [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const implementationSection = doc.split('## 구현 단일 진실원')[1]?.split('## 회귀 차단')[0] ?? '';

    assert.match(inferImportsRow, /file edge kind summary/);
    assert.match(inferImportsRow, /module edge 별 `kindCounts`/);
    assert.match(inferImportsRow, /`tsconfig\.json` paths alias/);
    assert.match(inferImportsRow, /fallback common `@\/\*` alias/);
    assert.match(inferImportsRow, /`static` \/ `dynamic` \/ `require` \/ `reexport` \/ `side`/);
    assert.match(mcpVerifyRow, /실제 `neighbors` \/ node→project `path` \/ `project_scope` graph smoke/);
    assert.match(mcpVerifyRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(mcpVerifyRow, /project-node `list_concepts` probe/);
    assert.match(mcpVerifyRow, /relation filter \/ `relation_check` closest-value rejection/);
    assert.match(mcpVerifyRow, /destructive dry-run smoke for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(mcpVerifyRow, /`query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`/);
    assert.match(mcpVerifyRow, /`find_orphans`/);
    assert.match(mcpVerifyRow, /별도 limited `query_concepts` smoke/);
    assert.match(mcpVerifyRow, /`slug!=project, limit=1` semantics/);
    assert.match(mcpVerifyRow, /`add_concepts` \/ `add_relations` row-isolation runtime smoke/);
    assert.match(mcpVerifyRow, /`concepts\[n\]` \/ `relations\[n\]` row label/);
    assert.match(mcpVerifyRow, /`add_concepts` duplicate slug first-seen label/);
    assert.match(mcpVerifyRow, /`Received fields: \.\.\.`/);
    assert.match(mcpVerifyRow, /invalid `add_relations` type closest-value hint/);
    assert.match(mcpVerifyRow, /top-level tool error 가 아니라 row-level `ok:false`/);
    assert.match(mcpVerifyRow, /invalid relation type row 에 closest-value hint 가 남는지와 invalid-only smoke 에 `postWriteMaintenance` 가 없는지도 확인/);
    assert.match(mcpVerifyRow, /write-tool `postWriteMaintenance` `byPhase` \/ `bySeverity` \/ `byKind` bucket \+ `score` \/ executable `proposedAction` \/ current-page next-action guidance/);
    assert.match(mcpVerifyRow, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(mcpVerifyRow, /`nextAfterActionId`\/`hasMore` page-state alignment/);
    assert.match(mcpVerifyRow, /maintenance bucket \/ current-page next-action summaries/);
    assert.match(mcpVerifyRow, /`maintenance_plan\.phases` \/ `maintenance_plan\.severities` \/ `maintenance_plan\.kinds` enum filter/);
    assert.match(mcpVerifyRow, /`cursor\.found=false`/);
    assert.match(mcpVerifyRow, /첫 executable\/review page action alignment/);
    assert.match(mcpVerifyRow, /zero remaining actions 계약/);
    assert.match(mcpVerifyRow, /`project_scope` hard gate 를 놓치지 않는다/);
    assert.match(mcpVerifyRow, /project-less vault/);
    assert.match(mcpVerifyRow, /empty vault/);
    assert.match(mcpVerifyRow, /node-targeted graph smoke/);
    assert.match(mcpVerifyRow, /잘못된 timeout 값은 `Received: "1000ms"`/);
    assert.match(mcpVerifyRow, /`oh-my-ontology mcp-verify --timeout-ms 15000`/);
    assert.match(implementationSection, /query-result-contract\.mjs/);
    assert.match(implementationSection, /`path` found:false 와 hop\/edge alignment/);
    assert.match(implementationSection, /`health` \/ `workspace-brief` top-level diagnosis status/);
    assert.match(implementationSection, /`health\.checks` \/ `workspace-brief\.health\.checks` 의 non-empty id\/status\/count coverage/);
    assert.match(implementationSection, /MCP tool name, 첫 mismatch path, parsed value, structuredContent value/);
    assert.match(implementationSection, /MCP spawn error \/ child process exit \/ missing `tools\/call` response 도 tool name \/ vault root \/ entry path/);
    assert.match(implementationSection, /`concepts\[n\]` \/ `relations\[n\]` fallback label/);
    assert.match(implementationSection, /`undefined` 를 노출하지 않고/);
    assert.match(implementationSection, /malformed `compile` \/ `cycles` \/ `path` \/ `health` \/ `workspace-brief` payload/);
    assert.match(implementationSection, /fail-closed/);
    assert.match(doc, /`workspace-brief` non-json 의 `HEALTH CHECKS` id:status:count coverage 와 `GROWTH` action/);
    assert.match(doc, /`health` non-json 의 `pass:count` 출력/);
    assert.match(doc, /`HEALTH CHECKS` 라인에 `compile_issues:pass:0` 같은 id:status:count coverage/);
    assert.match(doc, /mismatch path diagnostics/);
    assert.match(readme, /Non-JSON `workspace-brief` also prints a `GROWTH` line/);
    assert.match(readme, /`actions`, `relations`, `dangling`, `external`, and `ignoredExternal` counts/);
    assert.match(readme, /Both commands forward focused diagnosis tuning flags to MCP `query_ontology`/);
    assert.match(readme, /`--dependency-types A,B`, `--component-types A,B`, `--component-limit N`/);
  });

  it('keeps dogfood MCP docs explicit about workspace brief health checks', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';
    const dogfoodSection = doc.split('dogfood walk 는 `find_evidence.matches`')[1]?.split('기본 server wait')[0] ?? '';
    const queryOntologyRow = doc.split('| `query_ontology` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = doc.split('| `infer_imports` |')[1]?.split('\n')[0] ?? '';

    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /tuned `workspace_brief`/);
    assert.match(dogfoodSection, /workspace_brief\.nextActions/);
    assert.match(dogfoodSection, /nextActions\[\]\.sample/);
    assert.match(dogfoodSection, /실행 액션 shape drift/);
    assert.match(dogfoodSection, /severity\/kind\/id\/count\/message/);
    assert.match(dogfoodSection, /workspace_brief non-blocking nextActions/);
    assert.match(dogfoodSection, /workspace_brief_tuned non-blocking nextActions/);
    assert.match(dogfoodSection, /workspace_brief_tuned scope/);
    assert.match(dogfoodSection, /`componentTypes=domains\/domain\/capabilities\/dependencies`, `nodeLimit=3`/);
    assert.match(dogfoodSection, /label:severity:count/);
    assert.match(dogfoodSection, /health checks/);
    assert.match(dogfoodSection, /health_tuned checks/);
    assert.match(dogfoodSection, /id:status:count/);
    assert.match(dogfoodSection, /optional `count` 는 non-negative integer/);
    assert.match(dogfoodSection, /component rows/);
    assert.match(dogfoodSection, /componentId:size:firstSlug/);
    assert.match(dogfoodSection, /node-limited row/);
    assert.match(dogfoodSection, /health\.checks/);
    assert.match(doc, /`orderLimit`, `nodeLimit`, `dependencyTypes`, `componentTypes`/);
    assert.match(doc, /`dependencyTypes` \/ `componentTypes` 도 relation type enum 을 MCP\s+schema 로 노출/);
    assert.match(doc, /`match_nodes\.kind`, `match_edges\.fromKind`, `match_edges\.toKind` 도 표준\s+ontology kind enum/);
    assert.match(doc, /cursor miss `reason`/);
    assert.match(queryOntologyRow, /ready page 의 `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(queryOntologyRow, /현재 page 안의 첫 executable\/review action/);
    assert.match(queryOntologyRow, /`match_nodes\.kind`, `match_edges\.fromKind`, and `match_edges\.toKind` are enum-validated/);
    assert.match(queryOntologyRow, /unknown cursor 의 `cursor\.found=false` \/ cursor miss `reason`/);
    assert.match(queryOntologyRow, /count-safe summary fields/);
    assert.match(queryOntologyRow, /`byPhase` \/ `bySeverity` \/ `byKind` remaining-queue buckets/);
    assert.match(inferImportsRow, /`kindCounts`/);
    assert.match(dogfoodSection, /identifier\/severity/);
    assert.match(dogfoodSection, /id\/status\/count/);
    assert.match(dogfoodSection, /`edges\[\]\.from`/);
    assert.match(dogfoodSection, /`edges\[\]\.to`/);
    assert.match(dogfoodSection, /`edges\[\]\.via`/);
    assert.match(dogfoodSection, /설치 verify 의 `query_ontology\(path\)` smoke/);
    assert.match(dogfoodSection, /hop\/edge alignment/);
    assert.match(doc, /`query_ontology` graph-query 응답은 `structuredContent`\s+누락을 실패로 처리하고 text JSON payload 와 `structuredContent` payload 의\s+구조적 일치 여부도 비교/);
    assert.match(doc, /positional vault argument 는 받지 않고 이 repo 의 dogfood vault 만\s+검증하므로 잘못된 인자는 MCP server 를 띄우기 전에 실패/);
    assert.match(doc, /`pnpm dogfood:walk -- --help`[\s\S]*MCP server 를 띄우지 않고 usage 와\s+focused check 경로를 출력/);
    assert.match(doc, /도움말의 `pnpm test:mcp:dogfood` 설명도 compile\/index gate, tools\/list annotation coverage, row-label guidance,\s+strict closest-value summary, vault warning \/ `validate_vault` problem gate, first-contact health\/growth\/sample-shape gate, maintenance work-queue shape \/ formatter, initialize\/batch relation type guidance, destructive dry-run, structuredContent, strict relation filter, stderr warning 범위/);
    assert.match(dogfoodSection, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(doc, /`pnpm test:mcp:dogfood` 는 이 gate 판정의 focused subset, workspace_brief sample-shape gate, maintenance work-queue shape \/ formatter, initialize\/batch relation type guidance, tools\/list annotation coverage, row-label guidance summary, strict closest-value summary, strict add_relation type-preflight 를 fixture 로 검증/);
    assert.match(doc, /전체 helper 회귀가 필요할 때만\s+`pnpm dogfood:test`/);
    assert.match(doc, /진짜 timeout 실패도 `npm run verify -- --timeout-ms 15000` 재시도 예시를\s+같이 보여준다/);
    assert.match(doc, /오류 출력은\s+`Received: "1000ms"` 와 `npm run verify -- --timeout-ms 15000` 같은 재시도 예시/);
    assert.match(doc, /`npm run verify -- --vault <path> --timeout-ms 15000` 형태로 같은 vault 를 보존/);
    assert.match(doc, /key 순서 차이를 false mismatch 로 보지 않으며/);
    assert.match(doc, /dogfood 의 direct read \/ analysis tool 응답도 `structuredContent` 누락과\s+text JSON 구조 drift 를 같은 fail-closed 계약으로 검증/);
    assert.match(doc, /verify helper 와 dogfood helper 는 같은\s+`structuredContentParityStatus` 판정 helper 를 공유/);
    assert.match(doc, /project probe 도 화면 출력과 최종\s+direct-tool `structuredContent` summary 에 포함/);
    assert.match(doc, /섹션별 structuredContent 상태는 `pass` \/ `missing` \/\s+`mismatch` 로 구분/);
    assert.match(doc, /null payload 도 missing 으로 판정/);
    assert.match(doc, /정상 MCP connection stderr 는 성공 로그에서 숨기고/);
    assert.match(doc, /\[stderr warnings\]/);
    assert.match(doc, /설치 verify 도 first-contact direct read \/ write row-isolation smoke \/ destructive dry-run smoke \/\s+`query_ontology` smoke \/ maintenance cursor 응답의 `structuredContent` 누락과 text JSON drift 를 같은\s+fail-closed 계약으로 검증/);
    assert.match(doc, /direct read \/ maintenance cursor \/\s+write \/ graph-query `structuredContent` coverage 요약/);
    assert.match(dogfoodSection, /project-node `list_concepts` probe/);
    assert.match(dogfoodSection, /project-node `list_concepts` probe 도 fail-closed/);
    assert.match(dogfoodSection, /`kind: project`/);
    assert.match(dogfoodSection, /`list_kinds\.byKind\.project`/);
    assert.match(doc, /dogfood walk 도 `tools\/list` 를 직접 호출/);
    assert.match(doc, /installed verify 의 `toolsListSchemaFailure`/);
    assert.match(doc, /`additionalProperties:false`, tool annotations, graph-query enum,\s+health tuning option/);
    assert.match(doc, /maintenance next pointer description drift/);
    assert.match(doc, /row-label guidance/);
    assert.match(doc, /`add_concepts` duplicate\s+slug first-seen 안내/);
    assert.match(doc, /write row labels: pass/);
    assert.match(doc, /schema gate 도 같은 summary helper 를 공유/);
    assert.match(doc, /strict arguments \+ annotations \+ graph-query enums \+ graph kind enums \+ write relation enums\s+\+ health tuning \+ post-write bucket guidance/);
    assert.match(doc, /batch repair 안내도\s+같은 gate 에 포함/);
    assert.match(doc, /`concepts\[n\] duplicate slug in input batch; first seen at concepts\[m\]`/);
    assert.match(doc, /strict relation filter \/ `relation_check` row/);
    assert.match(doc, /`depend_on -> depends_on`/);
    assert.match(doc, /`Received arguments: \.\.\.`/);
    assert.match(doc, /`tools\/list` 의 `annotations\.title`/);
    assert.match(doc, /`annotations\.readOnlyHint`/);
    assert.match(doc, /`annotations\.destructiveHint`/);
    assert.match(doc, /`annotations\.openWorldHint:false`/);
    assert.match(doc, /`annotations\.idempotentHint`/);
    assert.match(doc, /`list_kinds` 는 `outputSchema` 와 동일한 `structuredContent` census payload/);
    assert.match(doc, /`list_concepts` 도 `outputSchema` 와 동일한 `structuredContent` node table payload/);
    assert.match(doc, /`get_concept` 도 single-node detail payload 의 `outputSchema`/);
    assert.match(doc, /`get_concepts` 도 `outputSchema` 와 동일한 `structuredContent` batch payload/);
    assert.match(doc, /`find_evidence` 도 `outputSchema` 와 동일한 `structuredContent` evidence-match payload/);
    assert.match(doc, /`find_backlinks` 도 `outputSchema` 와 동일한 `structuredContent` backlink-match payload/);
    assert.match(doc, /`find_neighbors` 도 `outputSchema` 와 동일한 `structuredContent` local-neighborhood payload/);
    assert.match(doc, /`find_path` 도 `outputSchema` 와 동일한 `structuredContent` shortest-path payload/);
    assert.match(doc, /`find_orphans` 도 `outputSchema` 와 동일한 `structuredContent` orphan-list payload/);
    assert.match(doc, /`query_concepts` 도 `outputSchema` 와 동일한 `structuredContent` typed-filter payload/);
    assert.match(doc, /dogfood walk 는 `slug!=project, limit=1` 도 직접 호출해 `limited:true` query semantics/);
    assert.match(doc, /`compile_ontology` 도 `outputSchema` 와 동일한 `structuredContent` graph-summary \/ full-artifact payload/);
    assert.match(doc, /full graph arrays \/ pagination \/ canonicalization action/);
    assert.match(doc, /indexed full-artifact smoke 는 `out` \/ `in` membership 이 `edgeById` 와 맞는지/);
    assert.match(doc, /edge resolved\/external\/unresolved breakdown 이 summary count 와 맞는지도 fail-closed/);
    assert.match(doc, /`analyze_repo_structure` 도 `outputSchema` 와 동일한 `structuredContent` bootstrap-candidate payload/);
    assert.match(doc, /`infer_imports` 도 `outputSchema` 와 동일한 `structuredContent` import-graph payload/);
    assert.match(doc, /verify \/ dogfood walk 는 상위 module edge 의 `kindCounts` 도 출력/);
    assert.match(doc, /`unresolved\.reason` \/ `kindCounts` `outputSchema` 도 같은 enum\/key set 으로 닫혀 있는지 확인/);
    assert.match(inferImportsRow, /`tsconfig\.json` `compilerOptions\.paths`/);
    assert.match(inferImportsRow, /fallback common `@\/\*` alias/);
    assert.match(inferImportsRow, /내부 edge 로 resolve/);
    assert.match(inferImportsRow, /`alias-not-found` unresolved/);
    assert.match(doc, /`analyze_repo_structure` \/ `infer_imports` 도 실제 repo root 를 대상으로 호출해\s+bootstrap 후보와 import graph payload 의 shape \/ `structuredContent` 계약이\s+dogfood walk 뿐 아니라 설치 verify 에서도 깨지지 않게 한다/);
    assert.match(doc, /`add_concept` \/ `add_relation` \/ `patch_concept` 도 single writer `outputSchema`/);
    assert.match(doc, /`add_concepts` \/ `add_relations` 도 batch writer `outputSchema` row 계약/);
    assert.match(doc, /row-level non-object \/ blank \/ padded \/ unknown-field 입력은 해당 row 만 실패/);
    assert.match(doc, /row-level non-object \/ unknown-field 입력도 해당 row 만 실패/);
    assert.match(doc, /`concepts\[n\]` \/ `relations\[n\]` row label/);
    assert.match(doc, /`Received fields: \.\.\.`/);
    assert.match(doc, /`add_concepts` \/ `add_relations` 는 non-object row 와 unknown row field, invalid relation type row 를 넣어\s+top-level tool error 가 아니라 row-level `ok:false` 로 격리되는지 설치 검증에서\s+실제 호출로 확인/);
    assert.match(doc, /relation type row 에 closest-value hint 가 남는지와\s+invalid-only smoke 에 `postWriteMaintenance` 가 없는지도 확인/);
    assert.match(doc, /initialize first-contact 안내도 같은 batch relation type closest-value hint 를 설명해야 하며,\s+verify helper 가 안내 문구 drift 를 별도 실패로 처리/);
    assert.match(doc, /`rename_concept` \/ `merge_concepts` \/ `delete_concept` 도 destructive writer\s+dry-run\/confirm `outputSchema`/);
    assert.match(doc, /`validate_vault` 도 `outputSchema` 와 동일한 `structuredContent` health payload/);
    assert.match(doc, /issue-code enum\/key set/);
    assert.match(doc, /15 read \/ 8 write split/);
    assert.match(doc, /annotation drift/);
    assert.match(doc, /`query_ontology` tool 설명과\s+`afterActionId` schema description 도 `maintenance_plan` cursor 의 `nextAfterActionId` \/\s+`hasMore` pagination metadata 를 안내/);
    assert.match(doc, /MCP `initialize\.instructions` 의 `query_ontology\.operation`\s+안내와 `query_plan\.targetOperation` 안내도 같은 allow-list 에서 생성/);
    assert.match(doc, /`maintenance_plan` work-queue 안내도 first-contact 에 포함/);
    assert.match(doc, /ready cursor 의 `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(doc, /ready cursor 의 `cursor\.nextAfterActionId` \/ `cursor\.hasMore`/);
    assert.match(doc, /ready cursor 의 `nextAfterActionId` 가 마지막\s+page action 과 맞고 `hasMore` 가 remaining page state 와 맞는지/);
    assert.match(doc, /첫 action id 로 유효한 `afterActionId`\s+resume 요청/);
    assert.match(doc, /resumed page 가 그 cursor action 을 반복하거나\s+`remainingActions` 를 전진시키지 못하면 실패/);
    assert.match(doc, /`nextAfterActionId=null` \/ `hasMore=false`/);
    assert.match(doc, /unknown `afterActionId`\s+cursor 의 `cursor\.found=false`/);
    assert.match(doc, /`cursor\.reason`[\s\S]*계약/);
    assert.match(doc, /compact `postWriteMaintenance` 반환 \(`operation` \/ `sideEffect:false` \/ `filters` \/ `limited` \/ cursor \/ `byPhase`·`bySeverity`·`byKind` bucket \/ action `score` \/ executable `proposedAction` 포함\)/);
    assert.match(doc, /dogfood walk 는\s+`totalActions` \/ `filteredActions` \/ `remainingActions` summary 관계와/);
    assert.match(doc, /`byPhase` \/ `bySeverity` \/ `byKind` bucket 합계도 검증/);
    assert.match(doc, /source checkout MCP work\s+queue count drift 를 fail-fast/);
    assert.match(doc, /installed verify 의 `maintenance_plan` cursor smoke 도 `totalActions` \/ `filteredActions` \//);
    assert.match(doc, /post-write work queue summary 가 drift 나도 설치 경로에서 fail-fast/);
    assert.match(doc, /같은 smoke 는\s+`byPhase` \/ `bySeverity` \/ `byKind` bucket 합계와 `remainingActions` 관계도 확인/);
    assert.match(doc, /성공 로그도 같은 bucket 요약과 현재 page 의 executable\/review next-action 요약/);
    assert.match(doc, /dogfood walk 출력도 같은 bucket 을 phase \/ severity \/ kind 요약으로 보여줘/);
    assert.match(doc, /현재 page 의 `nextExecutableAction` \/ `nextReviewAction`/);
    assert.match(doc, /id phase\/kind:severity 와 executable tool 요약/);
    assert.match(doc, /tools\/list schema description 도 같은 detail field 계약을\s+설명/);
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
    assert.match(dogfoodSection, /strict unknown-argument and invalid-enum rejection smoke/);
    assert.match(dogfoodSection, /`growth_plan`/);
    assert.match(dogfoodSection, /`maintenance_plan`/);
    assert.match(dogfoodSection, /missing `maintenance_plan\.afterActionId` cursor/);
    assert.ok(
      normalizedMarkdownIncludes(
        dogfoodSection,
        `\`maintenance_plan.phases\` 는 ${markdownEnumList(MAINTENANCE_PHASE_VALUES)}`,
      ),
      'dogfood MCP docs must document every maintenance_plan.phases enum value',
    );
    assert.ok(
      normalizedMarkdownIncludes(
        dogfoodSection,
        `\`maintenance_plan.severities\` 는 ${markdownEnumList(MAINTENANCE_SEVERITY_VALUES)}`,
      ),
      'dogfood MCP docs must document every maintenance_plan.severities enum value',
    );
    assert.ok(
      normalizedMarkdownIncludes(
        dogfoodSection,
        `\`maintenance_plan.kinds\` 는 ${markdownEnumList(MAINTENANCE_KIND_VALUES)}`,
      ),
      'dogfood MCP docs must document every maintenance_plan.kinds enum value',
    );
    assert.match(dogfoodSection, /`kinds: \["add_mising_relation"\]`/);

    const verifySection = doc.split('환경변수 `OMOT_VAULT`')[1]?.split('`get_concepts` 는')[0] ?? '';
    assert.match(verifySection, /실제 `neighbors` \/[\s\S]*node→project `path` \/ `project_scope`/);
    assert.match(readFileSync('mcp/scripts/verify.mjs', 'utf-8'), /neighbors\/node-to-project path\/project_scope/);
    assert.match(verifySection, /project probe 덕분에 `project_scope` 는 project\s+노드가 있을 때 containment hard gate/);
    assert.match(verifySection, /project-node `list_concepts` probe/);
    assert.match(verifySection, /project probe 덕분에 `project_scope`/);
    assert.match(verifySection, /빈 vault 는 node-targeted graph\s+smoke 를 skip/);
    assert.match(verifySection, /strict schema\/runtime unknown-argument and invalid-enum rejection/);
    assert.match(verifySection, /compact `postWriteMaintenance` 의 `byPhase` \/ `bySeverity` \/ `byKind` bucket, action `score`, executable `proposedAction`, and current-page next action pointer guidance/);
    assert.match(dogfoodSection, /설치 verify 성공 로그도 허용된 phases \/\s+severities \/ kinds enum 목록을 함께 출력/);
  });

  it('keeps packed CLI smoke aligned with installed hard gates', () => {
    const smoke = readFileSync('scripts/smoke-packed-cli.mjs', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');
    const smokeSection = doc.split('scripts/smoke-packed-cli.mjs —')[1]?.split('scripts/check-package-contracts.mjs')[0] ?? '';

    assert.match(smoke, /runRaw\(cliBin, \['cycles', cycleVault, '--json'\]/);
    assert.match(smoke, /installed CLI cycles fail gate/);
    assert.match(smoke, /runRaw\(cliBin, \['compile', danglingVault, '--json'\]/);
    assert.match(smoke, /installed CLI compile dangling json/);
    assert.match(smoke, /\['path', 'capabilities\/a', 'capabilities\/b', disconnectedVault, '--json'\]/);
    assert.match(smoke, /installed CLI path disconnected graph/);
    assert.match(smoke, /const installedCliDir =/);
    assert.match(smoke, /installed CLI package npm test/);
    assert.match(smoke, /node --test src\\\/lib\\\/\\\*\\\.test\\\.mjs/);
    assert.match(smoke, /# fail 0/);
    assert.match(smoke, /workspace_brief — \.\*next actions, \.\*health checks/);
    assert.match(smoke, /directMcpVerify/);
    assert.match(smoke, /directMcpVerifyVaultFlag/);
    assert.match(smoke, /env: \{ OMOT_VAULT: emptyVault \}/);
    assert.match(smoke, /assert\.equal\(missingVerifyOverride\.stdout, ''\)/);
    assert.match(smoke, /assert\.equal\(directoryVerifyOverride\.stdout, ''\)/);
    assert.match(smoke, /vault total 5 nodes/);
    assert.match(smoke, /expectedToolsListAnnotationSummary/);
    assert.match(smoke, /expectedToolsListAnnotationRe/);
    assert.equal(expectedToolsListAnnotationSummary(), '23/23 titled; 15/15 read; 8/8 write; 3/3 destructive; 2/2 idempotent; 23/23 local-only');
    assert.match(smoke, /--vault requires a path value/);
    assert.match(smoke, /npm run verify -- \\\[vault\\\] \\\[--timeout-ms N\\\]/);
    assert.match(smoke, /npm run verify -- --vault path --timeout-ms 15000/);
    assert.match(smoke, /Run npm run verify from the mcp\\\/ package directory/);
    assert.match(smoke, /from the repo root, use the node mcp\\\/scripts\\\/verify\\\.mjs form/);
    assert.match(smoke, /Explicit \\\[vault\\\] or --vault arguments take precedence over OMOT_VAULT/);
    assert.match(smoke, /pnpm test:mcp:verify\\s\+MCP verify helper contract without the full integration suite/);
    assert.match(smoke, /pnpm test:mcp:verify:first-contact\\s\+Narrow first-contact initialize-hint\\\/health-summary\\\/advisory\\\/read\\\/sample-shape helper gates/);
    assert.match(smoke, /pnpm test:mcp:verify:timeout/);
    assert.match(smoke, /Narrow MCP verify timeout\\\/startup\\\/help diagnostics/);
    assert.match(smoke, /verify timeout must be a positive integer/);
    assert.match(smoke, /invalidCliMcpVerifyTimeout/);
    assert.match(smoke, /missingCliMcpVerifyTimeout/);
    assert.match(smoke, /nextFlagCliMcpVerifyTimeout/);
    assert.match(smoke, /missingCliMcpVerifyVault/);
    assert.match(smoke, /nextFlagCliMcpVerifyVault/);
    assert.match(smoke, /duplicateCliMcpVerifyVault/);
    assert.match(smoke, /typoCliMcpVerifyTimeout/);
    assert.match(smoke, /invalidCliMcpVerifyEnvTimeout/);
    assert.match(smoke, /const cliMcpVerifyArgs =/);
    assert.match(smoke, /assert\.deepEqual\(cliMcpVerifyArgs/);
    assert.match(smoke, /installed CLI mcp-verify primary/);
    assert.match(smoke, /function assertStatus/);
    assert.match(smoke, /installed CLI mcp-verify invalid timeout flag/);
    assert.match(smoke, /installed CLI missing MCP entry override/);
    assert.match(smoke, /installed CLI maintenance work queue/);
    assert.match(smoke, /installedMaintenancePayload\.operation, 'maintenance_plan'/);
    assert.match(smoke, /installedMaintenancePayload\.summary\.dependencyCycles, 1/);
    assert.match(smoke, /installed CLI maintenance summary output/);
    assert.match(smoke, /summary:\.\*cycles:1/);
    assert.match(smoke, /ignoredExternal:0/);
    assert.match(smoke, /installed CLI workspace-brief cycle gate/);
    assert.match(smoke, /missingDirectMcpVerifyTimeout/);
    assert.match(smoke, /typoDirectMcpVerifyTimeout/);
    assert.match(smoke, /typoDirectMcpVerifyVault/);
    assert.match(smoke, /duplicateFlagDirectMcpVerifyVault/);
    assert.match(smoke, /duplicatePositionalDirectMcpVerifyVault/);
    assert.match(smoke, /invalidEnvDirectMcpVerifyVault/);
    assert.match(smoke, /const mcpVerifyArgs =/);
    assert.match(smoke, /silent: true/);
    assert.match(smoke, /assert\.deepEqual\(mcpVerifyArgs/);
    assert.match(smoke, /installed MCP verify positional vault primary/);
    assert.match(smoke, /installed MCP verify invalid env timeout/);
    assert.match(smoke, /assert\.equal\(invalidMcpVerifyTimeout\.stdout, ''\)/);
    assert.match(smoke, /assert\.equal\(invalidDirectMcpVerifyVault\.stdout, ''\)/);
    assert.match(smoke, /Received: "1000ms"/);
    assert.match(smoke, /Received: undefined/);
    assert.match(smoke, /Received: "--vault"/);
    assert.match(smoke, /pass vault as either positional argument or --vault, not both/);
    assert.match(smoke, /unknown flag: --timout-ms=1000\\\. Did you mean --timeout-ms\\\?/);
    assert.match(smoke, /Unknown option: --timout-ms=1000\\\. Did you mean --timeout-ms\\\?/);
    assert.match(smoke, /Unknown option: --vualt\\\. Did you mean --vault\\\?/);
    assert.match(smoke, /Unexpected extra vault argument:/);
    assert.match(smoke, /OMOT_VAULT requires a path value/);
    assert.match(smoke, /--timeout-ms N/);
    assert.match(smoke, /OMOT_VERIFY_TIMEOUT_MS=N/);
    assert.match(smoke, /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);
    assert.match(smoke, /assert\.doesNotMatch\(invalidCliMcpVerifyEnvTimeout\.stderr, \/npm run verify -- --timeout-ms 15000\/\)/);
    assert.match(smoke, /npm run verify -- --vault \.\+\[\/\\\\\]ontology --timeout-ms 15000/);
    assert.match(smoke, /health — \.\*compile_issues:\(pass\|warn\)/);
    assert.match(smoke, /health — \.\*checks/);
    assert.match(smoke, /workspace_brief_tuned — \.\*next actions, \.\*health checks/);
    assert.match(smoke, /tunedHealthScopeOutputSummary/);
    assert.match(smoke, /tunedWorkspaceBriefScopeOutputSummary/);
    assert.match(smoke, /new RegExp\(regexEscape\(tunedHealthScopeOutputSummary\(\)\)\)/);
    assert.match(smoke, /new RegExp\(regexEscape\(tunedWorkspaceBriefScopeOutputSummary\(\)\)\)/);
    assert.match(smoke, /tunedDiagnosisScopeRe/);
    assert.match(smoke, /tunedWorkspaceBriefScopeRe/);
    assert.match(smoke, /health_tuned — \.\*compile_issues:\(pass\|warn\)/);
    assert.match(smoke, /health_tuned — \.\*checks/);
    assert.match(smoke, /compile_ontology page — 1\\\/5 nodes, 1\\\/\\d\+ edges/);
    assert.match(
      smoke,
      /compile_ontology indexes — out \\d\+, in \\d\+, edgeById \\d\+, aliases \\d\+, edges \\d\+\\\/\\d\+\\\/\\d\+/,
    );
    assert.match(smoke, /strict arguments — unknown tool argument rejected at runtime/);
    assert.match(smoke, /strict arguments — multiple unknown tool arguments reported together/);
    assert.match(smoke, /add_concepts — non-object, unknown-field, and duplicate-slug rows isolated with input indexes/);
    assert.match(smoke, /add_relations — non-object, unknown-field, and invalid-type rows isolated with input indexes and closest-value hints/);
    assert.match(smoke, /destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(smoke, /structuredContentVerifySummary/);
    assert.match(smoke, /installedVerifyStructuredContentRe/);
    assert.match(smoke, /hasMaintenanceResume: true/);
    assert.match(smoke, /writeMaintenanceResumeVault/);
    assert.match(smoke, /cliMaintenanceResumeMcpVerify/);
    assert.match(smoke, /directMcpMaintenanceResumeVerify/);
    assert.match(smoke, /maintenance cursor — ready page stable \\\(1 remaining action/);
    assert.match(smoke, /kind add_missing_relation:1/);
    assert.match(smoke, /maintenance cursor — resume afterActionId advanced/);
    assert.match(doc, /batch writer row-isolation smoke/);
    assert.match(doc, /invalid `add_relations` type closest-value hint/);
    assert.match(smoke, /neighbors\\\/node-to-project path\\\/project_scope graph-query smoke/);
    assert.match(smoke, /runtime unknown-argument/);
    assert.match(smoke, /invalid-enum rejection/);
    assert.match(smoke, /destructive writer dry-runs with every planned response present and no changed\\\/postWriteMaintenance/);
    assert.match(smoke, /destructive writer dry-runs for rename_concept\\\/merge_concepts\\\/delete_concept/);
    assert.ok(smoke.includes(String.raw`write-tool postWriteMaintenance byPhase\/bySeverity\/byKind buckets \+ score\/proposedAction\/next-action guidance`));
    assert.ok(smoke.includes('maintenance_plan cursor smoke'));
    assert.match(smoke, /Maintenance filters are enum-validated for phases\\\/severities\\\/kinds/);
    assert.match(smoke, /cursor smoke checks both cursor\\\.found=true with cursor\\\.reason=null and cursor\\\.found=false/);
    assert.match(smoke, /ready cursor has actions, verify resumes from the first returned action id/);
    assert.match(smoke, /zero remaining actions, and no next actions/);
    assert.match(smoke, /nextExecutableAction \\\/ nextReviewAction point only at the first executable\\\/review action in the current returned page/);
    assert.match(smoke, /Successful maintenance cursor lines print bucket summaries plus current-page executable\\\/review next-action summaries/);
    assert.match(smoke, /pnpm integration:cli:mcp-verify/);
    assert.match(smoke, /pnpm dogfood:verify\\s\+Root checkout dogfood vault verify shortcut/);
    assert.match(smoke, /pnpm cli:mcp-verify docs\\\/ontology --timeout-ms 15000\\s\+Source-checkout dogfood verify with explicit args/);
    assert.match(smoke, /pnpm cli:mcp-verify -- --help\\s\+Source-checkout shortcut for this help from the repo root/);
    assert.match(smoke, /Installed CLI mcp-verify wrapper flow\\\/help\\\/failure checks/);
    assert.match(smoke, /pnpm test:mcp:verify\\s\+MCP verify helper contract without the full integration suite/);
    assert.match(smoke, /pnpm test:mcp:verify:first-contact\\s\+Narrow first-contact initialize-hint\\\/health-summary\\\/advisory\\\/read\\\/sample-shape helper gates/);
    assert.match(smoke, /pnpm test:mcp:verify:timeout/);
    assert.match(smoke, /Narrow MCP verify timeout\\\/startup\\\/help diagnostics/);
    assert.match(smoke, /Successful cursor lines print bucket summaries plus current-page executable\\\/review next-action summaries/);
    assert.match(smoke, /maintenance cursor — missing afterActionId reported/);
    assert.match(smoke, /maintenance cursor — ready page stable/);
    assert.ok(smoke.includes('directMcpVerify.stdout, /maintenance cursor'));
    assert.ok(smoke.includes('directMcpVerifyVaultFlag.stdout, /maintenance cursor'));
    assert.match(smoke, /project_scope — skipped \\\(no project node in vault\\\)/);
    assert.match(smoke, /path — elements\\\/example → project \\\(1 hop, 1 edge\\\)/);
    assert.ok(smoke.includes('directMcpVerify.stdout, /compile_ontology page'));
    assert.ok(smoke.includes('directMcpVerifyVaultFlag.stdout, /compile_ontology page'));
    assert.match(smoke, /directMcpVerify\.stdout,\s*\/compile_ontology indexes/);
    assert.match(smoke, /directMcpVerifyVaultFlag\.stdout,\s*\/compile_ontology indexes/);
    assert.match(smoke, /path — domains\\\/core → domains\\\/core \\\(0 hops, 0 edges\\\)/);
    assert.match(smoke, /neighbors\\\/path — skipped \\\(vault has no nodes\\\)/);
    assert.match(smokeSection, /cycles --json/);
    assert.match(smokeSection, /CLI package `npm test`/);
    assert.match(smokeSection, /compile --json/);
    assert.match(smokeSection, /path --json/);
    assert.match(smokeSection, /blocking `workspace-brief` non-json 의 `HEALTH CHECKS`/);
    assert.match(smoke, /assert\.match\(blockingBriefText\.stdout, \/GROWTH\/\)/);
    assert.match(smokeSection, /blocking `health` non-json 의 `dependency_cycles fail:1` coverage/);
    assert.match(smokeSection, /health check count/);
    assert.match(smokeSection, /installed tuned diagnosis scope/);
    assert.match(smokeSection, /componentTypes=domains\/domain\/capabilities\/dependencies/);
    assert.match(smokeSection, /`overview`\/`project_map` query_plan \/ `neighbors` \/ `path` \//);
    assert.match(smokeSection, /`project_scope` smoke/);
    assert.match(smokeSection, /strict argument\/enum smoke/);
    assert.match(smokeSection, /bucket \/ current-page next-action summary/);
    assert.match(smokeSection, /project-less vault/);
    assert.match(smokeSection, /empty vault/);
    assert.match(smoke, /installed CLI workspace-brief health coverage/);
    assert.match(smoke, /dependency_cycles:fail:1/);
    assert.match(smoke, /installed CLI health check coverage/);
    assert.match(smoke, /dependency_cycles\\s\+fail:1/);
  });

  it('keeps MCP npm test runnable from the lean published tarball', () => {
    const pkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(pkg.scripts?.test, 'node --test src/parser.test.mjs');
    assert.equal(pkg.scripts?.verify, 'node scripts/verify.mjs');
    assert.match(pkg.scripts?.['test:all'] ?? '', /src\/ontology-engine\.test\.mjs/);
    assert.match(pkg.scripts?.['test:all'] ?? '', /src\/suggestions\.test\.mjs/);
    assert.equal(isCoveredByFiles('src/parser.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/verify.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/json-rpc-lines.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/suggestions.test.mjs', pkg.files), false);
    assert.equal(isCoveredByFiles('src/verify-script.test.mjs', pkg.files), false);
  });

  it('keeps CLI npm test runnable from the published tarball', () => {
    const pkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
    const integration = readFileSync('cli/src/integration.test.mjs', 'utf-8');

    assert.equal(pkg.scripts?.test, 'node --test src/lib/*.test.mjs');
    assert.match(integration, /Source-checkout only/);
    assert.match(integration, /pnpm integration:cli/);
    assert.doesNotMatch(integration.split('\n').slice(0, 6).join('\n'), /npm test/);
    assert.equal(isCoveredByFiles('src/lib/cli-args.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/batch-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/batch-results.test.mjs', pkg.files), true);
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
    const maintenanceRow = doc.split('| `oh-my-ontology maintenance` |')[1]?.split('\n')[0] ?? '';

    assert.match(doc, /CLI Developer Entry \(27 commands/);
    assert.match(doc, /총 27 명령/);
    assert.match(doc, /cli\/src\/commands\/maintenance\.mjs/);
    assert.match(maintenanceRow, /MCP `query_ontology\(maintenance_plan\)`/);
    assert.match(maintenanceRow, /cursor miss 는 빈 page 와 `cursor\.found=false`/);
    assert.match(maintenanceRow, /phase\/severity\/kind bucket summary/);
    assert.doesNotMatch(regressionSection, /\*\*\d+ spawn-based\*\* integration test/);
    assert.match(doc, /`cli\/src\/lib\/mcp-call\.mjs` 의 thin wrapper/);
    assert.match(doc, /MCP `structuredContent` 를 먼저 사용하되/);
    assert.match(doc, /text JSON 과 `structuredContent` 가 둘 다 있으면 구조적으로 비교/);
    assert.match(doc, /mismatch 를 실패로 처리/);
    assert.match(doc, /성공 응답은 text 없이 `structuredContent` 만 있어도 수용/);
    assert.match(doc, /`structuredContent` 가 없는 경우에만 text JSON 으로 fallback/);
    assert.match(doc, /cli\/src\/lib\/mcp-call\.test\.mjs/);
    assert.match(regressionSection, /`pnpm test:cli:lib`/);
    assert.match(regressionSection, /`pnpm test:mcp:maintenance`/);
    assert.match(regressionSection, /`pnpm integration:cli:maintenance`/);
    assert.match(regressionSection, /focused CLI shared helper unit contracts/);
    assert.match(regressionSection, /focused MCP maintenance queue contract/);
    assert.match(regressionSection, /CLI maintenance command 와 maintenance 관련 installed verify subset/);
    assert.match(regressionSection, /full verify \/ dogfood suite 를 돌리지 않아도 된다/);
    assert.match(regressionSection, /`pnpm package:check` 도 이 gate 를 포함/);
    assert.match(regressionSection, /`cli\/src\/lib\/cli-args\.test\.mjs`/);
    assert.match(regressionSection, /`cli\/src\/lib\/repo-analysis-results\.test\.mjs`/);
    assert.match(regressionSection, /`analyze_repo_structure` 후보 배열 shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/import-analysis-results\.test\.mjs`/);
    assert.match(regressionSection, /`infer_imports` import graph \/ `moduleEdges` shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/batch-results\.test\.mjs`/);
    assert.match(regressionSection, /batch writer 응답 row count \/ row shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/cli-commands\.test\.mjs`/);
    assert.match(regressionSection, /command registry \/ package description command count/);
    assert.match(regressionSection, /MCP `structuredContent` 와 text JSON parity/);
    assert.match(regressionSection, /spawn-based integration suite/);
    assert.match(regressionSection, /Node `--test-name-pattern`/);
    assert.match(regressionSection, /`pnpm integration:cli:mcp-verify`/);
    assert.match(regressionSection, /direct read smoke set\(`get_concept` \/ `get_concepts` \/ `find_evidence`/);
    assert.match(regressionSection, /limited `query_concepts` \/ `analyze_repo_structure` \/ `infer_imports` \/ `find_neighbors`/);
    assert.match(
      doc,
      /`canonicalizationActions` 배열이 빠졌거나 `canonicalizationActionCount` 와 배열 길이가 갈라지거나 action row shape 이 malformed 인 compile 응답은 안전한 재정렬이 불가능하므로 patch 전 exit 2 로 실패/,
    );
    assert.match(regressionSection, /paginated `compile_ontology` full-artifact smoke/);
    assert.match(regressionSection, /`mcp-verify --help` graph-query smoke \/ direct read smoke set\(`get_concept`, `get_concepts`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path` 포함\) \/ tools\/list annotation coverage \/ strict argument\/enum smoke \/ relation filter \/ `relation_check` closest-value rejection \/ batch writer row-isolation smoke \/ destructive dry-run smoke/);
    assert.match(regressionSection, /root source-checkout shortcut `pnpm dogfood:verify`/);
    assert.match(regressionSection, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000`/);
    assert.match(regressionSection, /`pnpm cli:mcp-verify -- --help`/);
    assert.match(regressionSection, /vault 인자는 추가 `--` 없이 넘기고 help flag 에만 `-- --help`/);
    assert.match(regressionSection, /timeout retry hint 는 `--vault <path>` 를 보존/);
    assert.match(regressionSection, /직접 `npm run verify -- --vault <path>` 경로도 같은 vault-preserving retry 계약/);
    assert.match(regressionSection, /write-tool post-write bucket guidance/);
    assert.match(regressionSection, /maintenance filter enum/);
    assert.match(regressionSection, /ready cursor \/ missing cursor 계약/);
    assert.match(regressionSection, /ready cursor \/ missing cursor scope/);
    assert.match(regressionSection, /focused first-contact sample-shape helper scope/);
  });

  it('keeps dogfood MCP capability docs aligned with focused integration shortcuts', () => {
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');

    assert.match(doc, /Node `--test-name-pattern`/);
    assert.match(doc, /`pnpm integration:mcp:readme`/);
    assert.match(doc, /`pnpm test:mcp:dogfood`/);
    assert.match(doc, /`pnpm test:mcp:dogfood:timeout`/);
    assert.match(doc, /`pnpm test:mcp:maintenance`/);
    assert.match(doc, /`pnpm test:mcp:verify`/);
    assert.match(doc, /`pnpm test:mcp:verify:first-contact`/);
    assert.match(doc, /CLI `mcp-verify` 문서도 delegated verify output 의 non-blocking advisory/);
    assert.match(doc, /issues\/unresolved\/cycles\/checks health summary/);
    assert.match(doc, /`pnpm test:mcp:verify:timeout`/);
    assert.match(doc, /`nextActions\[\]\.sample` 실행 액션 shape/);
    assert.match(doc, /직접 verify help 도 이 focused check 들을 같이 보여줘/);
    assert.match(doc, /verify helper 와\s+dogfood gate 의 maintenance 관련 subset 만 실행/);
    assert.match(doc, /`pnpm dogfood:verify` 가 repo root 의 짧은 gate/);
    assert.match(doc, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000` 로 풀어 쓴다/);
    assert.match(doc, /dogfood helper \/ structuredContent 출력 계약/);
    assert.match(doc, /initialize\/batch relation type guidance gate/);
    assert.match(doc, /tools\/list annotation coverage/);
    assert.match(doc, /row-label guidance summary/);
    assert.match(doc, /focused subset, workspace_brief sample-shape gate, maintenance work-queue shape \/ formatter, initialize\/batch relation type guidance, tools\/list annotation coverage, row-label guidance summary, strict closest-value summary, strict add_relation type-preflight 를 fixture 로 검증/);
    assert.match(doc, /전체 helper 회귀가 필요할 때만\s+`pnpm dogfood:test`/);
    assert.match(doc, /strict relation filter/);
    assert.match(doc, /stderr warning filtering/);
    assert.match(doc, /first-contact README read-only/);
    assert.match(doc, /직접 verify help 는\s+`mcp\/` package directory 의 `npm run verify -- --help` 또는 repo root 의\s+`node mcp\/scripts\/verify\.mjs --help`/);
    assert.match(doc, /직접 verify help\(`mcp\/` 에서 `npm run verify -- --help`, repo root 에서\s+`node mcp\/scripts\/verify\.mjs --help`\)/);
    assert.match(doc, /설치 verify 의 tuned diagnosis 라인도\s+`dependencyTypes=dependencies`,\s+`componentTypes=domains\/domain\/capabilities\/dependencies` scope 를 같이 출력/);
    assert.match(doc, /`list_concepts` project probe \/ `get_concept` \/ `get_concepts` \//);
    assert.match(doc, /`query_concepts` \/ limited\s+`query_concepts` \/ `analyze_repo_structure` \/ `infer_imports` \/ `find_neighbors`/);
    assert.match(doc, /별도 limited `query_concepts` smoke 로 `slug!=project, limit=1`/);
    assert.match(doc, /ready `maintenance_plan` cursor 와\s+missing `maintenance_plan\.afterActionId` cursor handling 범위/);
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

  it('keeps the CLI mcp-verify wrapper forwarding CLI retry hints', () => {
    const wrapper = readFileSync('cli/src/commands/mcp-verify.mjs', 'utf-8');
    const integration = readFileSync('cli/src/integration.test.mjs', 'utf-8');
    const verify = readFileSync('mcp/scripts/verify.mjs', 'utf-8');

    assert.match(wrapper, /OMOT_VERIFY_RETRY_EXAMPLE: mcpVerifyRetryExample\(vaultArg\)/);
    assert.match(wrapper, /oh-my-ontology mcp-verify\$\{vaultPart\} --timeout-ms 15000/);
    assert.match(wrapper, /--vault \$\{shellArg\(vaultArg\)\}/);
    assert.match(wrapper, /String\(flags\.timeoutMsRaw \?\? ''\)\.startsWith\('--'\)/);
    assert.match(wrapper, /replaceAll\("'", "'\\\\''"\)/);
    assert.match(verify, /OMOT_VERIFY_RETRY_EXAMPLE/);
    assert.match(verify, /DEFAULT_VERIFY_RETRY_EXAMPLE = 'npm run verify -- --timeout-ms 15000'/);
    assert.match(integration, /passes CLI retry hint to the verify script/);
    assert.match(integration, /retry=\$\{process\.env\.OMOT_VERIFY_RETRY_EXAMPLE\}/);
    assert.match(integration, /oh-my-ontology mcp-verify --vault '.\+vault with space' --timeout-ms 15000/);
    assert.match(integration, /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);
    assert.match(integration, /doesNotMatch\(stripAnsi\(r\.stderr\), \/npm run verify -- --timeout-ms 15000\/\)/);
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
