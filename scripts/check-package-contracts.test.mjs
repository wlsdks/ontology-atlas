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
import { RELATION_TYPE_VALUES as CLI_RELATION_TYPE_VALUES } from '../cli/src/lib/relation-types.mjs';
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
import { assertPnpmScriptsExist } from './lib/pnpm-script-refs.mjs';
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

  it('keeps filtered integration scripts discoverable from development checks docs', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));
    const checksDoc = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf-8');
    const focusedNode = 'node scripts/run-focused-node-test.mjs';
    const nodeTest = 'node --test';

    assert.equal(pkg.scripts?.['integration:cli'], 'node --test cli/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:cli:entry'],
      `${focusedNode} --test-name-pattern "^(metadata|command inventory|subcommand --help|help|top-level command typos|init)" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:compile'],
      `${focusedNode} --test-name-pattern "compile" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:mcp-verify'],
      `${focusedNode} --test-name-pattern "mcp-verify" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:diagnosis'],
      `${focusedNode} --test-name-pattern "health|agent-brief|workspace-brief" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:graph-read'],
      `${focusedNode} --test-name-pattern "^(backlinks|path|explain|all-paths|reachability|pattern-walk|project-map|relation-check|orphans|query|match-nodes|match-edges|domain-matrix|overview|hubs|blast-radius|cycles|node|similar)" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:graph-write'],
      `${focusedNode} --test-name-pattern "^(rename|delete|merge|graph write commands)" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:repo-analysis'],
      `${focusedNode} --test-name-pattern "^(analyze|infer-imports|bootstrap|repo analysis commands)" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:local-vault'],
      `${focusedNode} --test-name-pattern "^(list|add|find|import|validate|local/frontmatter commands)" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:growth'],
      `${focusedNode} --test-name-pattern "growth" cli/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:cli:maintenance'],
      `${focusedNode} --test-name-pattern "maintenance" cli/src/integration.test.mjs`,
    );
    assert.equal(pkg.scripts?.['cli:mcp-verify'], 'node cli/src/index.mjs mcp-verify');
    assert.match(pkg.scripts?.['test:mcp:unit'] ?? '', /mcp\/src\/analyze\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:unit'] ?? '', /mcp\/src\/vault\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:unit'] ?? '', /mcp\/src\/json-rpc-lines\.test\.mjs/);
    assert.equal(pkg.scripts?.['integration:mcp'], 'node --test mcp/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:mcp:surface'],
      `${focusedNode} --test-name-pattern "^(tools/list|initialize|tools/call)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:repo-analysis'],
      `${focusedNode} --test-name-pattern "^(analyze_repo_structure|infer_imports)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:graph'],
      `${focusedNode} --test-name-pattern "^(compile_ontology|query_ontology)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:vault-read'],
      `${focusedNode} --test-name-pattern "^(list_concepts|find_evidence|find_backlinks|find_neighbors|find_path|find_orphans|get_concept|get_concepts|validate_vault)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:read'],
      `${focusedNode} --test-name-pattern "^(MCP read/query tools|query_concepts)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:write'],
      `${focusedNode} --test-name-pattern "^(add_concepts|add_concept/add_concepts|MCP slug conflicts|MCP write tools|add_relations|patch_concept|rename_concept|graph destructive writes|merge_concepts|delete_concept|add_relation)" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['integration:mcp:readme'],
      `${focusedNode} --test-name-pattern "README first exploration" mcp/src/integration.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['package:check'],
      'node scripts/check-package-contracts.mjs && pnpm test:cli:lib && pnpm perf:graph:check && node --test scripts/check-package-contracts.test.mjs',
    );
    assert.equal(pkg.scripts?.['perf:graph'], 'node scripts/perf-graph.mjs');
    assert.equal(pkg.scripts?.['perf:graph:check'], 'node scripts/perf-graph.mjs --check --n=1000');
    assert.equal(
      pkg.scripts?.['perf:graph:scale'],
      'node scripts/perf-graph.mjs --check --sizes=1000,5000 --runs=3 --max-compile-ms=1500 --max-query-ms=1500',
    );
    assert.equal(pkg.scripts?.['docs-vault:build'], 'node scripts/build-docs-vault.mjs');
    assert.equal(pkg.scripts?.['docs-vault:check'], 'node scripts/build-docs-vault.mjs --check');
    assert.equal(pkg.scripts?.['test:docs-vault'], 'node --test scripts/build-docs-vault.test.mjs');
    assert.equal(pkg.scripts?.['dogfood:compile'], 'node cli/src/index.mjs compile docs/ontology --summary --json');
    assert.equal(pkg.scripts?.['dogfood:compile-fix'], 'node scripts/dogfood-compile-fix.mjs');
    assert.equal(pkg.scripts?.['test:dogfood:args'], 'node --test scripts/lib/dogfood-args.test.mjs');
    assert.equal(
      pkg.scripts?.['test:dogfood:script-refs'],
      `${nodeTest} scripts/lib/pnpm-script-refs.test.mjs scripts/lib/test-name-pattern.test.mjs scripts/run-focused-node-test.test.mjs && ${focusedNode} --test-name-pattern "filtered integration scripts discoverable" scripts/check-package-contracts.test.mjs`,
    );
    assert.equal(pkg.scripts?.['checks:changed'], 'node scripts/suggest-focused-checks.mjs');
    assert.equal(
      pkg.scripts?.['test:checks:changed'],
      'node --test scripts/lib/focused-check-suggestions.test.mjs scripts/suggest-focused-checks.test.mjs',
    );
    assert.equal(pkg.scripts?.['test:dogfood:compile-fix'], 'node --test scripts/dogfood-compile-fix.test.mjs');
    assert.equal(pkg.scripts?.['dogfood:health'], 'node cli/src/index.mjs health docs/ontology --json');
    assert.equal(pkg.scripts?.['dogfood:agent'], 'node cli/src/index.mjs agent-brief docs/ontology --json');
    assert.equal(
      pkg.scripts?.['dogfood:agent-graph-db-pack'],
      'node cli/src/index.mjs agent-brief docs/ontology --graph-db-pack',
    );
    assert.equal(
      pkg.scripts?.['dogfood:agent-setup-gate'],
      'node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4',
    );
    assert.equal(pkg.scripts?.['dogfood:agent-fallbacks'], 'node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks');
    assert.equal(pkg.scripts?.['dogfood:brief'], 'node cli/src/index.mjs workspace-brief docs/ontology --json');
    assert.equal(pkg.scripts?.['dogfood:growth'], 'node cli/src/index.mjs growth docs/ontology --json');
    assert.equal(pkg.scripts?.['dogfood:maintenance'], 'node cli/src/index.mjs maintenance docs/ontology --json');
    assert.equal(pkg.scripts?.['dogfood:status'], 'node scripts/dogfood-status.mjs');
    assert.equal(pkg.scripts?.['test:dogfood:status'], 'node --test scripts/dogfood-status.test.mjs');
    assert.equal(pkg.scripts?.['dogfood:verify'], 'node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000');
    assert.equal(pkg.scripts?.['dogfood:help'], 'node scripts/dogfood-mcp-walk.mjs --help');
    assert.equal(pkg.scripts?.['dogfood:test'], 'node --test scripts/dogfood-mcp-walk.test.mjs');
    assert.equal(pkg.scripts?.['test:cli:args'], 'node --test cli/src/lib/cli-args.test.mjs');
    assert.equal(pkg.scripts?.['test:cli:lib'], 'node --test cli/src/lib/*.test.mjs');
    assert.equal(pkg.scripts?.['test:cli:mcp-call'], 'node --test cli/src/lib/mcp-call.test.mjs');
    assert.equal(pkg.scripts?.['test:contracts'], 'vitest run tests/contract');
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /scripts\/dogfood-mcp-walk\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /scripts\/check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /structuredContent/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /compile_ontology/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /tools\/list/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /row-label guidance/);
    assert.match(pkg.scripts?.['test:mcp:dogfood'] ?? '', /batch cap/);
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
      `${focusedNode} --test-name-pattern "dogfood timeout|timeout failures|dogfood response labels|dogfood help|dogfood arguments" scripts/dogfood-mcp-walk.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['test:mcp:maintenance'],
      `${focusedNode} --test-name-pattern "maintenance filter|maintenance cursor|maintenance missing-cursor|maintenance ready-cursor|maintenance resume-cursor|malformed maintenance_plan payloads|remaining maintenance buckets|current-page maintenance next actions" mcp/src/verify-script.test.mjs scripts/dogfood-mcp-walk.test.mjs`,
    );
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/suggestions\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/ontology-engine\.test\.mjs/);
    assert.equal(pkg.scripts?.['test:mcp:verify'], 'node --test mcp/src/verify-script.test.mjs');
    assert.equal(
      pkg.scripts?.['test:mcp:verify:first-contact'],
      `${focusedNode} --test-name-pattern "initialize instructions|strict unknown-tool|node-dependent first-contact|first-contact response labels|bootstrap and import-analysis|first-contact verify|destructive writer dry-run|patch_concept conflict guard|list_concepts reports vault warnings|validate_vault reports problem files|malformed validate_vault|first-contact diagnosis|health summary|health check advisories|failing health checks|workspace_brief growth count drift|workspace_brief next action sample drift|fail next actions" mcp/src/verify-script.test.mjs`,
    );
    assert.equal(
      pkg.scripts?.['test:mcp:verify:timeout'],
      `${focusedNode} --test-name-pattern "verify timeout|timeout failures|startup failures|direct verify usage|direct verify timeout|direct verify CLI args|empty verify vault" mcp/src/verify-script.test.mjs`,
    );
    assert.match(
      pkg.scripts?.['test:mcp:docs'] ?? '',
      /^node scripts\/run-focused-node-test\.mjs --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.doesNotMatch(
      pkg.scripts?.['test:mcp:docs'] ?? '',
      /--test-name-pattern "README\|/,
      'test:mcp:docs must list focused documentation contracts instead of a broad README token',
    );
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /root README honest/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /MCP registration templates/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /MCP README explicit/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /CLI README explicit/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /CLAUDE\.md a thin AGENTS wrapper/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /Firebase static hosting/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /docs-vault freshness check/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /dogfood MCP docs/);
    assert.equal(
      pkg.scripts?.['test:mcp:registration'],
      `${focusedNode} --test-name-pattern "MCP registration templates" scripts/check-package-contracts.test.mjs`,
    );
    assert.match(
      pkg.scripts?.['test:mcp:package'] ?? '',
      /^node scripts\/run-focused-node-test\.mjs --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /MCP npm test/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI npm test/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI MCP dependency/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI entrypoint/);
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /CLI mcp-verify wrapper/);
    assert.match(
      pkg.scripts?.['test:mcp:suggestions'] ?? '',
      /^node scripts\/run-focused-node-test\.mjs --test-name-pattern "[^"]+" mcp\/src\/suggestions\.test\.mjs mcp\/src\/ontology-engine\.test\.mjs$/,
    );

    for (const [scriptName, scriptBody] of Object.entries(pkg.scripts ?? {})) {
      if (scriptBody.includes('scripts/run-focused-node-test.mjs')) {
        assert.match(
          scriptBody,
          /scripts\/run-focused-node-test\.mjs --test-name-pattern "[^"]+" .+\.test\.mjs/,
          `${scriptName} must pass an explicit --test-name-pattern and test target to run-focused-node-test.mjs`,
        );
      }
      if (!scriptBody.includes('--test-name-pattern')) continue;
      assert.match(
        scriptBody,
        /(?:^|&& )node scripts\/run-focused-node-test\.mjs --test-name-pattern "[^"]+"/,
        `${scriptName} must use run-focused-node-test.mjs so zero matched tests fail`,
      );
    }

    for (const [scope, testFile] of [
      ['cli', 'cli/src/integration.test.mjs'],
      ['MCP', 'mcp/src/integration.test.mjs'],
    ]) {
      const pattern = `__omot_no_such_${scope.toLowerCase()}_integration_test__`;
      const result = spawnSync(process.execPath, [testFile], {
        cwd: process.cwd(),
        env: { ...process.env, OMOT_TEST_NAME_PATTERN: pattern },
        encoding: 'utf-8',
      });
      assert.equal(result.status, 1, `${testFile} must fail when its custom filter matches 0 tests`);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        new RegExp(`no ${scope} integration tests matched OMOT_TEST_NAME_PATTERN=${pattern}`),
      );
    }

    for (const heading of [
      '## Default Gate',
      '## Quick Matrix',
      '## Vault Checks',
      '## MCP And CLI Checks',
      '## Dogfood Shortcuts',
      '## Filtered Integration Runs',
      '## Source-Checkout Verify',
      '## Release Smoke',
    ]) {
      assert.match(checksDoc, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const command of [
      'pnpm test:mcp:docs',
      'pnpm vault:validate',
      'pnpm exec tsc --noEmit',
      'pnpm build',
      'pnpm bundle:check',
      'pnpm docs-vault:check',
      'pnpm test:docs-vault',
      'pnpm docs-vault:build',
      'pnpm package:check',
      'pnpm checks:changed',
      'pnpm test:checks:changed',
      'pnpm test:cli:args',
      'pnpm test:cli:lib',
      'pnpm test:cli:mcp-call',
      'pnpm test:contracts',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:maintenance',
      'pnpm test:mcp:package',
      'pnpm test:mcp:dogfood',
      'pnpm test:mcp:registration',
      'pnpm dogfood:compile',
      'pnpm dogfood:compile-fix',
      'pnpm dogfood:compile-fix -- --help',
      'pnpm test:dogfood:args',
      'pnpm test:dogfood:script-refs',
      'pnpm test:dogfood:compile-fix',
      'pnpm dogfood:health',
      'pnpm dogfood:agent',
      'pnpm dogfood:agent-graph-db-pack',
      'pnpm dogfood:agent-setup-gate',
      'pnpm dogfood:agent-fallbacks',
      'pnpm dogfood:brief',
      'pnpm dogfood:growth',
      'pnpm dogfood:maintenance',
      'pnpm dogfood:status',
      'pnpm dogfood:status -- --help',
      'pnpm test:dogfood:status',
      'pnpm dogfood:verify',
      'pnpm dogfood:walk',
      'pnpm dogfood:help',
      'pnpm smoke:packed-cli',
      'OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk',
      'OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli',
      'pnpm integration:cli',
      'pnpm integration:cli:entry',
      'pnpm integration:cli:mcp-verify',
      'pnpm integration:cli:diagnosis',
      'pnpm integration:cli:graph-read',
      'pnpm integration:cli:graph-write',
      'pnpm integration:cli:repo-analysis',
      'pnpm integration:cli:local-vault',
      'pnpm integration:cli:growth',
      'pnpm integration:cli:maintenance',
      'pnpm integration:mcp',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:graph',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:read',
      'pnpm integration:mcp:write',
      'OMOT_TEST_NAME_PATTERN="tools/list|initialize" pnpm integration:mcp',
      'pnpm integration:mcp:readme',
      'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
      'pnpm cli:mcp-verify -- --help',
      'npm run verify -- --vault <path> --timeout-ms 15000',
    ]) {
      assert.match(checksDoc, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(checksDoc, /\| CLI argument parsing \| `pnpm test:cli:args` \| `pnpm test:cli:lib` \|/);
    assert.match(checksDoc, /\| Static dogfood manifest \| `pnpm docs-vault:check` \| `pnpm test:docs-vault` \|/);
    assert.match(checksDoc, /pnpm docs-vault:check\s+# static dogfood manifest freshness/);
    assert.match(checksDoc, /pnpm test:docs-vault\s+# focused docs-vault build\/check helper contract/);
    assert.match(checksDoc, /pnpm docs-vault:build\s+# refresh static dogfood manifest and public md/);
    assert.match(checksDoc, /`pnpm checks:changed`\s+\| Suggest first focused checks from changed paths/);
    assert.match(checksDoc, /`pnpm checks:changed` reads tracked changes from `git diff --name-only HEAD`\s+plus untracked files from `git ls-files --others --exclude-standard`, excluding\s+local `\.agents\/` and `\.codex\/` agent state except shared repo skills,\s+Codex hooks, and Codex MCP config/);
    assert.match(checksDoc, /Pass paths after `--` to inspect a\s+planned\s+file set before editing/);
    assert.match(checksDoc, /Vault helper changes route to direct sibling\s+`pnpm exec node --test \.\.\.` checks when available, then to their narrow package\s+shortcuts: `pnpm test:docs-vault`, `pnpm test:vault:validate`, or\s+`pnpm test:vault:audit`/);
    assert.match(checksDoc, /Parser\/schema\/validator parity changes, including the shared\s+`tests\/fixtures\/vault-schema-cases\.mjs` fixture, route to\s+`pnpm test:contracts` before broader package or app checks/);
    assert.match(checksDoc, /CLI shared helper changes\s+do the same for `cli\/src\/lib\/<name>\.test\.mjs`, so run the printed direct\s+`pnpm exec node --test \.\.\.` command before `pnpm test:cli:lib`/);
    assert.match(checksDoc, /App\/source TypeScript changes under `app\/` or `src\/` first print a direct\s+Vitest sibling command \(`pnpm exec vitest run <path>\.test\.ts\[x\]`\)/);
    assert.match(checksDoc, /Source TypeScript files under `src\/\*\*\/\*\.ts\[x\]` also route to\s+`pnpm exec tsc --noEmit`/);
    assert.match(checksDoc, /E2E spec changes under `tests\/e2e\/` first print the exact Playwright command\s+\(`pnpm exec playwright test tests\/e2e\/<name>\.spec\.ts`\)/);
    assert.match(checksDoc, /`vitest\.config\.ts` \/ `vitest\.setup\.ts` changes route to a small config smoke:\s+`pnpm exec vitest run src\/shared\/lib\/cn\.test\.ts tests\/contract\/vault-schema\.contract\.test\.ts`/);
    assert.match(checksDoc, /`playwright\.config\.ts` changes route to the local-vault picker spec first/);
    assert.match(checksDoc, /`postcss\.config\.mjs` and `app\/globals\.css` route to the overflow sweep spec/);
    assert.match(checksDoc, /when `scripts\/check-bundle\.mjs`\s+changes, run `pnpm build` first and then `pnpm bundle:check`/);
    assert.match(checksDoc, /The macOS desktop readiness gate is scaffold-aware and local-first: when\s+`scripts\/check-desktop-readiness\.mjs`, `scripts\/desktop-doctor\.mjs`,\s+`scripts\/desktop-smoke\.mjs`, `scripts\/package-macos-dmg\.mjs`,\s+`scripts\/verify-macos-app-launch\.mjs`, `scripts\/verify-macos-dmg\.mjs`,\s+`scripts\/verify-macos-install-smoke\.mjs`,\s+`scripts\/check-macos-download-release\.mjs`,\s+`scripts\/check-macos-release-secrets\.mjs`, `scripts\/check-macos-release-tag\.mjs`,\s+`scripts\/check-macos-release-slot\.mjs`, `scripts\/check-macos-release-github\.mjs`,\s+`scripts\/sign-macos-app\.mjs`,\s+`scripts\/notarize-macos-dmg\.mjs`,\s+`src\/shared\/lib\/tauri-vault-fs\.ts`, `docs\/DESKTOP-MACOS\.md`, `src-tauri\/\*\*`,\s+`package\.json`, `\.github\/workflows\/release-macos\.yml`, or `next\.config\.ts`\s+changes, run `pnpm desktop:check`/);
    assert.match(checksDoc, /The installed app's native vault bridge is part of this same gate:\s+`src-tauri\/src\/lib\.rs` must expose folder-pick, directory-list, read, write,\s+file\/directory delete, mkdir, and exists commands, and\s+`src\/shared\/lib\/tauri-vault-fs\.ts` must wrap the same commands as a handle shim\s+through `@tauri-apps\/api\/core` `invoke` \/ `isTauri`, not private Tauri\s+internals/);
    assert.match(checksDoc, /The installed app must also keep first-run\s+entry local: `src\/views\/root-entry\/ui\/RootEntryPage\.tsx` routes Tauri sessions\s+without a restored vault to `\/docs\/\?intent=local` without rendering the hosted\s+marketing page, and `DocsVaultPage` opens the native picker once for that\s+intent/);
    assert.match(checksDoc, /Native vault bridge changes route to\s+`pnpm test:desktop:bridge`, which runs the WebView handle-shim tests plus\s+`cargo test --manifest-path src-tauri\/Cargo\.toml` for the Rust path guard/);
    assert.match(checksDoc, /`next\.config\.ts` is static-export source-of-truth; changes route to\s+`pnpm desktop:check`, `pnpm exec tsc --noEmit`, `pnpm build`, and then\s+`pnpm bundle:check`/);
    assert.match(checksDoc, /Next App Router entries under `app\/\*\*\/\*\.ts\[x\]` and `next-env\.d\.ts` route to\s+`pnpm exec tsc --noEmit`/);
    assert.match(checksDoc, /Locale routing under `src\/i18n\/\*\.ts` and message catalogs under\s+`messages\/\*\.json` route to `pnpm test:i18n:messages`/);
    assert.match(checksDoc, /`eslint\.config\.mjs` changes route to `pnpm lint`/);
    assert.match(checksDoc, /`tsconfig\.json` changes route\s+to `pnpm exec tsc --noEmit` plus the CLI\/MCP repo-analysis focused integrations/);
    assert.match(checksDoc, /GitHub quality-gate files \(`\.github\/workflows\/ci\.yml`,\s+`\.github\/PULL_REQUEST_TEMPLATE\.md`\) route to `pnpm test:mcp:docs` and\s+`pnpm test:mcp:package`, with `pnpm package:check` as the escalation/);
    assert.match(checksDoc, /`\.githooks\/pre-push` hook routes to `pnpm exec tsc --noEmit`/);
    assert.match(checksDoc, /Claude Code\/Codex agent rules and skills under `\.claude\/LOOP-PRINCIPLES\.md`,\s+`\.claude\/rules\/\*\.md`, `\.claude\/skills\/\*\/SKILL\.md`, and\s+`\.agents\/skills\/\*\/SKILL\.md` also route to\s+`pnpm test:dogfood:script-refs`/);
    assert.match(checksDoc, /Claude Code\/Codex hook wiring and publish guard changes under\s+`\.claude\/hooks\/\*\.sh`, `\.claude\/settings\.json`, `\.codex\/hooks\/\*\.sh`, or\s+`\.codex\/hooks\.json` route to `pnpm test:claude:hooks`/);
    assert.match(checksDoc, /Vault migration runner or migration files route to\s+`pnpm vault:migrate --list` first, and migration implementations also route to\s+`pnpm test:contracts`/);
    assert.match(checksDoc, /Any\s+`docs\/\*\*\/\*\.md` change routes to `pnpm docs-vault:check`, because\s+the static docs vault indexes the whole docs tree/);
    assert.match(checksDoc, /Root `pnpm-lock\.yaml` and MCP\/CLI package lockfiles route to\s+`pnpm test:mcp:package` plus `pnpm package:check` escalation/);
    assert.match(checksDoc, /MCP lockfile\s+changes still show `pnpm dogfood:verify` as an escalation because they touch the\s+agent runtime package directly; CLI lockfile changes stay on package contracts/);
    assert.match(checksDoc, /\| `pnpm package:check` \| Package files, lockfiles, entrypoints, docs contracts, and graph hot-path perf budget \|/);
    assert.match(checksDoc, /\| `pnpm bundle:check` \| Local-first static export bundle guard; run after `pnpm build` when `scripts\/check-bundle\.mjs` changed \|/);
    assert.match(checksDoc, /\| `pnpm desktop:check` \| macOS desktop Tauri scaffold readiness gate for static export, image mode, docs-vault freshness, CLI\/MCP verification, desktop-grade quality bar coverage, route smoke scope, and `src-tauri` shell files \|/);
    assert.match(checksDoc, /\| `pnpm desktop:doctor` \| Local machine prerequisite report for macOS desktop builds: Tauri CLI, Cargo, rustc, and Xcode command line tools \|/);
    assert.match(checksDoc, /\| `pnpm desktop:smoke` \| Built `out\/` payload smoke for the packaged root app entry, locale routes, `_next` assets, and offline desktop docs before launching or bundling the `\.app` \/ `\.dmg` \|/);
    assert.match(checksDoc, /\| `pnpm desktop:build:app` \| Build the Tauri `\.app` before optional release signing or local DMG packaging \|/);
    assert.match(checksDoc, /\| `pnpm desktop:verify-app` \| Launch the built `\.app` from its executable directory long enough to catch early Tauri\/WebView startup crashes, then terminate it \|/);
    assert.match(checksDoc, /\| `pnpm desktop:verify-install` \| Mount the DMG, copy the app to a temporary install folder, launch-smoke that copy from its executable directory, then clean it up \|/);
    assert.match(checksDoc, /\| `pnpm desktop:release-preflight` \| Local pre-tag macOS release gate: readiness, docs-vault, checker tests, bridge tests, runtime doctor, CLI\/MCP handoff, build, route smoke, DMG, and install smoke \|/);
    assert.match(checksDoc, /\| `pnpm desktop:release-slot` \| Fail closed before GitHub Release upload when the same tag already has a draft, prerelease, or public release \|/);
    assert.match(checksDoc, /\| `pnpm desktop:release-github` \| Operator-side GitHub release readiness check for gh auth, active release workflow, required Apple secret names, optional tag\/version alignment, and clean same-tag Release slot \|/);
    assert.match(checksDoc, /\| `pnpm desktop:release-status` \| Completion audit for PR review\/merge readiness, Apple release secret names, public stable Release state, and public DMG\/checksum download verification \|/);
    assert.match(checksDoc, /\| `pnpm test:desktop:bridge` \| WebView handle-shim tests plus Rust path-guard tests for the native vault bridge \|/);
    assert.match(checksDoc, /\| `pnpm desktop:release-secrets` \| Fail closed before tag release when any Apple signing or notarization secret is missing, blank, or structurally invalid \|/);
    assert.match(checksDoc, /\| `pnpm desktop:sign` \| Sign the built `\.app` with hardened runtime when `APPLE_SIGNING_IDENTITY` and a Developer ID certificate are available \|/);
    assert.match(checksDoc, /\| `pnpm desktop:notarize` \| Submit, staple, validate, and re-checksum the DMG when Apple notary credentials are available \|/);
    assert.match(checksDoc, /\| `pnpm desktop:verify-dmg` \| Mount and checksum smoke for the generated macOS DMG before GitHub Release upload \|/);
    assert.match(checksDoc, /\| `pnpm desktop:verify-release-dmg` \| Release-only DMG verifier that also requires app code signing, stapled notarization, and Gatekeeper assessment \|/);
    assert.match(checksDoc, /\| `pnpm desktop:verify-download` \| Public GitHub Release verifier for the hosted download CTA: requires non-draft reachable same-version Apple Silicon and Intel DMG assets, rejects unsupported extra `oh-my-ontology_\*\.dmg` names, and verifies matching `\.sha256` contents and downloaded bytes \|/);
    assert.match(checksDoc, /\| `pnpm test:desktop:check` \| Desktop readiness checker contract; use direct `pnpm exec node --test scripts\/check-desktop-readiness\.test\.mjs` first when printed \|/);
    assert.match(checksDoc, /\| `pnpm exec tsc --noEmit` \| TypeScript and Next config type safety \|/);
    assert.match(checksDoc, /\| `pnpm test:i18n:messages` \| Locale routing\/message catalog parity \|/);
    assert.match(checksDoc, /\| `pnpm test:claude:hooks` \| Claude Code\/Codex hook wiring and npm publish guard \|/);
    assert.match(checksDoc, /\| `pnpm exec vitest run <path>\.test\.ts\[x\]` \| Direct app\/source sibling test printed by `pnpm checks:changed` when available \|/);
    assert.match(checksDoc, /\| `pnpm exec vitest run src\/shared\/lib\/cn\.test\.ts tests\/contract\/vault-schema\.contract\.test\.ts` \| Vitest config\/setup smoke for jsdom setup plus contract discovery \|/);
    assert.match(checksDoc, /\| `pnpm exec playwright test tests\/e2e\/<name>\.spec\.ts` \| Direct E2E spec printed by `pnpm checks:changed` for changed Playwright specs \|/);
    assert.match(checksDoc, /\| `pnpm exec playwright test tests\/e2e\/local-vault-picker\.spec\.ts` \| Playwright config\/webServer smoke before broader E2E \|/);
    assert.match(checksDoc, /\| `pnpm exec playwright test tests\/e2e\/overflow-sweep\.spec\.ts` \| Global CSS\/PostCSS responsive overflow smoke \|/);
    assert.match(checksDoc, /\| `pnpm lint` \| ESLint and FSD boundary config \|/);
    assert.match(checksDoc, /\| `pnpm test:cli:lib` \| CLI shared helper contracts; use the direct sibling `pnpm exec node --test cli\/src\/lib\/<name>\.test\.mjs` first when `pnpm checks:changed` prints one \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli` \| Full CLI integration contracts; use when `cli\/src\/integration\.test\.mjs` itself changed \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:entry` \| CLI entrypoint, help, command inventory, and `init` contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:diagnosis` \| CLI `health` \/ `agent-brief` \/ `workspace-brief` diagnosis contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:graph-read` \| CLI read-only graph command contracts, including `match-nodes` \/ `match-edges` scans, `explain` relation evidence, `domain-matrix` coupling summaries, `reachability`, bounded `all-paths --plan` traversal guards, explicit `pattern-walk` traversals, and `project-map` containment summaries \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:graph-write` \| CLI graph write dry-run\/confirm safety contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:repo-analysis` \| CLI `analyze` \/ `infer-imports` \/ `bootstrap` code-to-vault contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:local-vault` \| CLI local vault `add` \/ `import` \/ `list` \/ `find` \/ `validate` contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:cli:growth` \| CLI `growth_plan` wrapper, candidate rendering, malformed payload, and argument contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp` \| Full MCP integration contracts; use when `mcp\/src\/integration\.test\.mjs` itself changed \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:surface` \| MCP JSON-RPC `tools\/list`, `initialize`, and `tools\/call` surface contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:repo-analysis` \| MCP `analyze_repo_structure` \/ `infer_imports` code-to-vault contracts; advisor routes those implementation files here before broader read\/query gates \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:graph` \| MCP `compile_ontology` \/ `query_ontology` graph artifact\/query contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:vault-read` \| MCP list\/get\/find\/path\/orphans\/validate vault read contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:read` \| MCP `query_concepts` and shared read\/query validation contracts \|/);
    assert.match(checksDoc, /\| `pnpm integration:mcp:write` \| MCP write tool handler contracts \|/);
    assert.match(checksDoc, /\| Dogfood MCP smoke \| `pnpm dogfood:status` \| `pnpm dogfood:verify` \|/);
    assert.match(checksDoc, /pnpm test:dogfood:status/);
    assert.match(checksDoc, /`pnpm dogfood:compile-fix` runs `compile --fix` against docs\/ontology and fails\s+if it leaves a git diff/);
    assert.match(checksDoc, /successful runs end with `\[dogfood:compile-fix\] docs\/ontology unchanged`/);
    assert.match(checksDoc, /does change the vault, it tells you to run `pnpm docs-vault:build` before rerunning\s+the shortcut/);
    assert.match(checksDoc, /`pnpm test:dogfood:args` checks the shared pnpm separator and nearest\s+`--help` hint helper without invoking any dogfood gate/);
    assert.match(checksDoc, /`pnpm\s+test:dogfood:script-refs` checks that help text and package script body\s+`pnpm \.\.\.` references still resolve to root package scripts/);
    assert.match(checksDoc, /`scripts\/lib\/test-name-pattern\.mjs` keeps focused filter parsing stable/);
    assert.match(checksDoc, /focused\s+Node test wrappers fail when a pattern matches 0 tests, print\s+matched counts for failed focused runs, and split setup\/import failures into\s+`setupFailures=N`/);
    assert.match(checksDoc, /scripts\/run-focused-node-test\.mjs/);
    assert.match(checksDoc, /focused\s+Node test wrappers fail when a pattern matches 0 tests/);
    assert.match(checksDoc, /signal-killed `node --test`\s+subprocess reports the signal plus target path/);
    assert.match(checksDoc, /wrapper also requires an\s+explicit pattern/);
    assert.match(checksDoc, /at least one test target/);
    assert.match(checksDoc, /Node test option values such as `--test-concurrency 1`\s+or `--test-timeout 1000` are not counted as targets/);
    assert.match(checksDoc, /missing split option\s+value cannot leak the following option value into the target list/);
    assert.match(checksDoc, /Focused runs with TAP summaries end with `matched=N` before the\s+broader file-level `tests=N`, even when a matched test fails/);
    assert.match(checksDoc, /File\s+setup\/import failures are reported separately as `setupFailures=N`/);
    assert.match(checksDoc, /`pnpm dogfood:status` runs the\s+cheap human-readable health \+ workspace-brief \+ agent-brief \+\s+maintenance gates together/);
    assert.match(checksDoc, /still prints workspace-brief, agent-brief, and maintenance when\s+health fails, then preserves the first failing exit code/);
    assert.match(checksDoc, /\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N/);
    assert.match(checksDoc, /focused follow-up line \(`pnpm dogfood:health`, `pnpm dogfood:brief`,\s+`pnpm dogfood:agent`, or `pnpm dogfood:maintenance` \+ `pnpm test:mcp:maintenance`\) plus a\s+`pnpm dogfood:verify` follow-up hint on failure/);
    assert.match(checksDoc, /Use `pnpm dogfood:compile-fix -- --help` \/ `pnpm dogfood:status -- --help`/);
    assert.match(checksDoc, /unsupported shortcut\s+arguments fail with exit 2 before any child check starts/);
    assert.match(checksDoc, /close `--help`\s+typos include a `Did you mean --help\?` hint/);
    assert.match(checksDoc, /Use\s+`pnpm dogfood:verify` for the full\s+installed-style dogfood vault gate/);
    assert.match(checksDoc, /`pnpm dogfood:test` only when the dogfood\s+helper itself changed/);
    assert.match(checksDoc, /Use `pnpm test:mcp:maintenance` when only `maintenance_plan` filter, cursor,\s+resume, or formatter behavior changed/);
    assert.match(checksDoc, /\| `pnpm test:mcp:suggestions` \| Enum and argument suggestion quality; use the direct sibling `pnpm exec node --test mcp\/src\/suggestions\.test\.mjs` first when `pnpm checks:changed` prints one \|/);
    assert.match(checksDoc, /CLI\/MCP verify help changes route to `pnpm test:dogfood:script-refs` too,\s+because those help surfaces list root `pnpm \.\.\.` shortcuts/);
    assert.match(checksDoc, /`pnpm checks:changed` routes dogfood shortcut helper changes to their direct\s+`pnpm exec node --test \.\.\.test\.mjs` test first, then `pnpm test:dogfood:args`,\s+`pnpm test:dogfood:script-refs`, or `pnpm test:dogfood:compile-fix` before\s+broader dogfood gates/);
    assert.match(checksDoc, /`pnpm test:mcp:docs` also guards Firebase Hosting config as static-only/);
    assert.match(checksDoc, /`pnpm test:mcp:docs` also guards\s+the tracked `.mcp.json`, `.mcp.json.example`, and `.codex\/config.toml`\s+source-checkout templates/);
    assert.match(checksDoc, /Use\s+`pnpm test:mcp:registration` when only those MCP registration templates changed/);
    assert.match(checksDoc, /Explicit root\/MCP\/CLI\/dogfood docs contracts plus Firebase static-hosting and MCP registration-template guards/);
    assert.match(checksDoc, /intentionally lists explicit test-name fragments/);
    assert.match(checksDoc, /instead\s+of a broad `README` token/);
    assert.match(checksDoc, /Do not append it after `pnpm integration:\* --`/);
    assert.match(checksDoc, /Committed root shortcuts that use `--test-name-pattern` should go through\s+`scripts\/run-focused-node-test\.mjs`/);
    assert.match(checksDoc, /strict argument\/enum handling/);

    const rootReadme = readFileSync('README.md', 'utf-8');
    const mcpReadme = readFileSync('mcp/README.md', 'utf-8');
    const cliReadme = readFileSync('cli/README.md', 'utf-8');
    const benchmarkReadme = readFileSync('docs/benchmark/README.md', 'utf-8');
    const migrationsReadme = readFileSync('scripts/migrations/README.md', 'utf-8');
    const claudeAgentDocs = [
      '.claude/LOOP-PRINCIPLES.md',
      '.claude/rules/architecture.md',
      '.claude/rules/design.md',
      '.claude/rules/documentation.md',
      '.claude/rules/forbidden.md',
      '.claude/rules/git.md',
      '.claude/rules/local-first.md',
      '.claude/rules/testing.md',
      '.claude/skills/firebase-deploy/SKILL.md',
      '.claude/skills/ontology-bootstrap/SKILL.md',
      '.claude/skills/ontology-extract/SKILL.md',
      '.claude/skills/ontology-sync/SKILL.md',
    ].map((file) => readFileSync(file, 'utf-8')).join('\n');
    assertPnpmScriptsExist(
      [rootReadme, checksDoc, mcpReadme, cliReadme, benchmarkReadme, migrationsReadme, claudeAgentDocs].join('\n'),
      pkg.scripts,
      { filteredScripts: { './mcp': mcpPkg.scripts } },
    );
    assertPnpmScriptsExist(Object.values(pkg.scripts).join('\n'), pkg.scripts);
  });

  it('keeps Firebase static hosting config local-first', () => {
    const firebaseConfig = JSON.parse(readFileSync('firebase.json', 'utf-8'));
    const firebaserc = JSON.parse(readFileSync('.firebaserc', 'utf-8'));
    const firebaseIgnore = readFileSync('.firebaseignore', 'utf-8');
    const gitignore = readFileSync('.gitignore', 'utf-8');
    const deployment = readFileSync('docs/DEPLOYMENT.md', 'utf-8');
    const skill = readFileSync('.claude/skills/firebase-deploy/SKILL.md', 'utf-8');
    const capability = readFileSync('docs/ontology/capabilities/firebase-deploy-skill.md', 'utf-8');

    const forbiddenTopLevel = ['functions', 'firestore', 'storage', 'database', 'emulators', 'extensions'];
    assert.deepEqual(
      forbiddenTopLevel.filter((key) => Object.hasOwn(firebaseConfig, key)),
      [],
      'firebase.json must remain Hosting-only',
    );
    assert.equal(Array.isArray(firebaseConfig.hosting), false, 'firebase.json must keep a single Hosting target');
    assert.deepEqual(
      Object.keys(firebaseConfig.hosting ?? {}).sort(),
      ['cleanUrls', 'headers', 'ignore', 'public', 'trailingSlash'].sort(),
    );
    assert.equal(firebaseConfig.hosting?.public, 'out');
    assert.equal(firebaseConfig.hosting?.cleanUrls, true);
    assert.equal(firebaseConfig.hosting?.trailingSlash, true);
    assert.equal(Object.hasOwn(firebaseConfig.hosting ?? {}, 'rewrites'), false);
    assert.equal(Object.hasOwn(firebaseConfig.hosting ?? {}, 'source'), false);
    assert.equal(Object.hasOwn(firebaseConfig.hosting ?? {}, 'frameworksBackend'), false);
    assert.equal(firebaserc.projects?.default, 'oh-my-ontology');

    for (const entry of ['node_modules/', '.next/', 'out/', '.git/', '.local-credentials/', '*.log']) {
      assert.match(firebaseIgnore, new RegExp(`^${regexEscape(entry)}$`, 'm'));
    }
    for (const entry of ['.env.prod', '.firebase/', '.local-credentials/']) {
      assert.match(gitignore, new RegExp(`^${regexEscape(entry)}$`, 'm'));
    }

    assert.match(deployment, /does not configure rewrites, Functions, Firestore, Storage, or auth/);
    assert.match(skill, /firebase deploy --only hosting/);
    assert.match(skill, /no Functions, Firestore, Storage, Auth, emulators, or server runtime/);
    assert.match(skill, /pnpm test:mcp:docs/);
    assert.match(capability, /static host only/);
    assert.match(capability, /Functions, Firestore, Storage, Auth, or committed credentials/);
  });

  it('keeps the docs-vault freshness check executable from source checkout', () => {
    const help = runNodeScript(['scripts/build-docs-vault.mjs', '--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/build-docs-vault\.mjs \[--check\]/);
    assert.match(help.stdout, /Verify generated outputs are current without writing/);
    assert.equal(help.stderr, '');

    const check = runNodeScript(['scripts/build-docs-vault.mjs', '--check']);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /\[docs-vault\] current · \d+ docs/);
    assert.equal(check.stderr, '');
  });

  it('keeps source-checkout MCP registration templates wired to the dogfood vault', () => {
    for (const file of ['.mcp.json', '.mcp.json.example']) {
      const config = JSON.parse(readFileSync(file, 'utf-8'));
      const server = config.mcpServers?.['oh-my-ontology'];

      assert.ok(server, `${file} must register the oh-my-ontology MCP server`);
      assert.equal(server.command, 'node');
      assert.deepEqual(server.args, ['./mcp/src/index.js']);
      assert.equal(server.env?.OMOT_VAULT, './docs/ontology');
    }

    const codexConfig = readFileSync('.codex/config.toml', 'utf-8');
    assert.match(codexConfig, /\[mcp_servers\.oh-my-ontology\]/);
    assert.match(codexConfig, /command\s*=\s*"node"/);
    assert.match(codexConfig, /args\s*=\s*\["\.\/mcp\/src\/index\.js"\]/);
    assert.match(codexConfig, /\[mcp_servers\.oh-my-ontology\.env\]/);
    assert.match(codexConfig, /OMOT_VAULT\s*=\s*"\.\/docs\/ontology"/);
  });

  it('keeps the root README mcp-verify shortcut executable from source checkout', () => {
    const result = runNodeScript(['cli/src/index.mjs', 'mcp-verify', '--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /oh-my-ontology mcp-verify \[vault\] \[--timeout-ms N\]/);
    assert.match(result.stdout, /tool inventory \(missing\/extra\/duplicate\/invalid names\)/);
    assert.match(result.stdout, /Focused checks:/);
    assert.match(result.stdout, /pnpm test:cli:args\s+CLI argument parser contract checks/);
    assert.match(result.stdout, /pnpm test:cli:mcp-call\s+CLI MCP wrapper parser\/spawn\/structuredContent contract checks/);
    assert.match(result.stdout, /pnpm integration:cli:mcp-verify/);
    assert.match(result.stdout, /pnpm dogfood:compile\s+Root checkout dogfood vault compile_ontology summary/);
    assert.match(
      result.stdout,
      /pnpm dogfood:compile-fix\s+Root checkout dogfood vault compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with \[dogfood:compile-fix\] docs\/ontology unchanged/,
    );
    assert.match(result.stdout, /pnpm test:dogfood:args\s+Narrow dogfood shortcut argument helper contract/);
    assert.match(result.stdout, /pnpm test:dogfood:script-refs\s+Narrow help\/package-script reference \+ focused filter parser\/wrapper summary contract/);
    assert.match(result.stdout, /pnpm test:dogfood:compile-fix\s+Narrow dogfood compile --fix idempotence runner contract/);
    assert.match(result.stdout, /pnpm test:mcp:registration\s+Narrow source-checkout .mcp.json\/.mcp.json.example\/.codex\/config.toml registration template contract/);
    assert.match(result.stdout, /pnpm dogfood:health\s+Root checkout dogfood vault health gate/);
    assert.match(result.stdout, /pnpm dogfood:brief\s+Root checkout dogfood vault workspace_brief snapshot/);
    assert.match(result.stdout, /pnpm dogfood:growth\s+Root checkout dogfood vault growth_plan JSON snapshot/);
    assert.match(result.stdout, /pnpm dogfood:maintenance\s+Root checkout dogfood vault maintenance_plan JSON snapshot/);
    assert.match(
      result.stdout,
      /pnpm dogfood:status\s+Root checkout dogfood vault human-readable health \+ brief \+ agent handoff \+ maintenance; ends with \[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N and focused hints before pnpm dogfood:verify on failure/,
    );
    assert.match(result.stdout, /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
    assert.match(result.stdout, /pnpm dogfood:verify\s+Root checkout dogfood vault verify shortcut/);
    assert.match(result.stdout, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000\s+Source-checkout dogfood verify with explicit args/);
    assert.match(result.stdout, /pnpm cli:mcp-verify -- --help\s+Source-checkout shortcut for this help from the repo root/);
    assert.match(result.stdout, /pnpm test:mcp:verify:first-contact\s+Narrow first-contact initialize-tool-inventory\/initialize-safety-recovery\/unknown-tool\/write-safety\/health-summary\/advisory\/read\/sample-shape helper gates/);
    assert.match(result.stdout, /pnpm test:mcp:maintenance\s+Narrow maintenance_plan filter\/cursor\/resume\/work-queue formatter gates/);
    assert.match(result.stdout, /pnpm test:mcp:verify:timeout\s+Narrow MCP verify timeout\/startup\/help\/empty-vault diagnostics/);
    assert.equal(result.stderr, '');
  });

  it('keeps the CLI entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('cli/src/index.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bexit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
    assert.match(source, /return runInit\(parsed\.target\)/);
  });

  it('keeps the MCP npm test verify entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('mcp/scripts/verify.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
    assert.match(source, /return 1/);
    assert.match(source, /return 0/);
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
    const toolNameSection = readme.split('Unknown tool names fail closed too.')[1]?.split('String-array options are strict too:')[0] ?? '';
    const scalarInputSection = readme.split('Scalar string options follow the same boundary across read and write tools:')[1]?.split('Boolean options are also validated explicitly')[0] ?? '';

    assert.match(row, /`health` \/ `workspace_brief` \/ `agent_brief` can tune their internal probes/);
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
    assert.match(toolNameSection, /`unknown_tool`/);
    assert.match(toolNameSection, /Did you mean "list_concepts"\?/);
    assert.match(toolNameSection, /allowed tool list/);
    assert.match(toolNameSection, /`tools\/call\.params\.name`/);
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
    assert.match(addConceptsFeature, /non-object row shape \/ unknown row field errors are isolated as `\{ok:false, error\}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field/);
    assert.match(addConceptsFeature, /structured `rowName` \/ `firstSeenAt`/);
    assert.match(addRelationsFeature, /non-object row shape \/ unknown row field errors are isolated as `\{ok:false, error\}` rows, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every offending field/);
    assert.match(addRelationsFeature, /structured `rowName` \/ `allowedFields` \/ `receivedFields`/);
    assert.match(addRelationsFeature, /structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
    assert.match(addRelationFeature, /type enum:/, 'FEATURES must label add_relation write relation enum values');
    assert.match(addRelationFeature, /rejected before endpoint slug resolution/, 'FEATURES must document add_relation type preflight');
    assert.match(addRelationFeature, /structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
    assert.match(addRelationRow, /`type`:/, 'MCP README must label add_relation write relation enum values');
    assert.match(addRelationRow, /rejected before endpoint slug resolution/, 'MCP README must document add_relation type preflight');
    assert.match(addRelationRow, /structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
    assert.match(addRelationsRow, /`type`:/, 'MCP README must label add_relations write relation enum values');
    assert.match(addConceptsRow, /`concepts\[n\]` row label/);
    assert.match(addConceptsRow, /unknown row fields surface/);
    assert.match(addConceptsRow, /Single unknown-field rows include `receivedField` plus one-row `unknownFields`/);
    assert.match(addConceptsRow, /multi unknown-field rows report every unknown field with nearest hints and `Received fields: \.\.\.`/);
    assert.match(addConceptsRow, /structured `rowName` \/ `firstSeenAt`/);
    assert.match(addRelationsRow, /`relations\[n\]` row label/);
    assert.match(addRelationsRow, /closest-value hint/);
    assert.match(addRelationsRow, /unknown row fields surface/);
    assert.match(addRelationsRow, /`rowName`/);
    assert.match(addRelationsRow, /Single unknown-field rows include `receivedField` plus one-row `unknownFields`/);
    assert.match(addRelationsRow, /multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and `Received fields: \.\.\.`/);
    assert.match(addRelationsRow, /`allowedFields`, `receivedFields`/);
    assert.match(addRelationsRow, /structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
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
      'MCP README must document every health/workspace_brief/agent_brief relation filter enum value',
    );
    assert.match(scalarInputSection, /`query_ontology\(\{ operation: "relation_check" \}\)`/);
    assert.match(scalarInputSection, /relation `type` is\s+validated before endpoint slug resolution/);
    assert.match(scalarInputSection, /empty or project-less\s+vaults where the requested endpoints do not exist/);
  });

  it('keeps CLI relation type validation aligned with MCP query filters', () => {
    assert.deepEqual(CLI_RELATION_TYPE_VALUES, RELATION_TYPE_VALUES);
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
    const mcpReadme = readFileSync('mcp/README.md', 'utf-8');
    const dogfoodMcpDoc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const featureLine = features.split('11. **compile_ontology**')[1]?.split('\n')[0] ?? '';
    const mcpReadmeRow = mcpReadme.split('| `compile_ontology` |')[1]?.split('\n')[0] ?? '';
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
    assert.match(mcpReadmeRow, /Canonicalization action `keys` are schema-bound to relation-array frontmatter keys/);
    assert.match(mcpReadmeRow, /action `frontmatter` is relation-array-only/);
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
    assert.match(statusSection, /add_relations` unknown type row errors include a closest-value hint/);
    assert.match(statusSection, /Did you mean "depends_on"\?/);
    assert.match(statusSection, /Runtime `unknown_tool` errors include the closest tool-name hint/);
    assert.match(statusSection, /Did you mean "list_concepts"\?/);
    assert.match(statusSection, /allowed tool list/);
  });

  it('keeps the MCP README explicit about focused source-checkout verification', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const section = readme.split('### Source-checkout verification')[1]?.split('### 2. Restart Claude Code')[0] ?? '';

    assert.match(section, /pnpm test:contracts/);
    assert.match(section, /pnpm integration:mcp:surface/);
    assert.match(section, /pnpm integration:mcp:repo-analysis/);
    assert.match(section, /pnpm integration:mcp:graph/);
    assert.match(section, /pnpm integration:mcp:vault-read/);
    assert.match(section, /pnpm integration:mcp:read/);
    assert.match(section, /pnpm integration:mcp:write/);
    assert.match(section, /pnpm integration:mcp:readme/);
    assert.match(section, /JSON-RPC `tools\/list`, `initialize`, and\s+`tools\/call` server surface/);
    assert.match(section, /code-to-vault analysis\s+handler contracts/);
    assert.match(section, /graph artifact\/query\s+handler contracts/);
    assert.match(section, /list\/get\/find\/path\/orphans\/validate vault read\s+contracts/);
    assert.match(section, /`query_concepts` and shared read\/query validation\s+contracts/);
    assert.match(section, /write tool handler contracts/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:registration/);
    assert.match(section, /source-checkout `.mcp.json`,\s+`.mcp.json.example`, and `.codex\/config.toml` templates/);
    assert.match(section, /pnpm test:mcp:dogfood/);
    assert.match(section, /pnpm test:mcp:dogfood:timeout/);
    assert.match(section, /pnpm test:mcp:maintenance/);
    assert.match(section, /pnpm test:mcp:package/);
    assert.match(section, /pnpm test:mcp:suggestions/);
    assert.match(section, /pnpm test:mcp:verify/);
    assert.match(section, /pnpm test:mcp:verify:first-contact/);
    assert.match(section, /first-contact health summary \/ advisory \/ next-action gates/);
    assert.match(section, /pnpm test:mcp:verify:timeout/);
    assert.match(section, /empty-vault fail-fast/);
    assert.match(section, /pnpm integration:cli:compile/);
    assert.match(section, /pnpm dogfood:compile/);
    assert.match(section, /pnpm dogfood:compile-fix/);
    assert.match(section, /pnpm test:dogfood:args/);
    assert.match(section, /pnpm test:dogfood:script-refs/);
    assert.match(section, /pnpm test:dogfood:compile-fix/);
    assert.match(section, /pnpm dogfood:health/);
    assert.match(section, /pnpm dogfood:agent/);
    assert.match(section, /pnpm dogfood:agent-graph-db-pack/);
    assert.match(section, /pnpm dogfood:agent-setup-gate/);
    assert.match(section, /pnpm dogfood:agent-fallbacks/);
    assert.match(section, /pnpm dogfood:brief/);
    assert.match(section, /pnpm dogfood:maintenance/);
    assert.match(section, /pnpm dogfood:status/);
    assert.match(section, /pnpm test:dogfood:status/);
    assert.match(section, /pnpm dogfood:verify/);
    assert.match(section, /pnpm dogfood:test/);
    assert.match(section, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000/);
    assert.match(section, /pnpm cli:mcp-verify -- --help/);
    assert.match(section, /`dogfood:compile` prints the dogfood vault `compile_ontology` summary JSON\s+snapshot/);
    assert.match(section, /`pnpm dogfood:compile-fix` runs dogfood `compile --fix`, fails if canonicalization leaves a docs\/ontology diff,\s+tells you to run `pnpm docs-vault:build`, and ends successful runs with `\[dogfood:compile-fix\] docs\/ontology unchanged`/);
    assert.match(section, /`pnpm test:dogfood:script-refs` checks help text and package script body `pnpm \.\.\.` references against root package scripts plus focused filter parsing and wrapper summaries/);
    assert.match(section, /`dogfood:health` prints the dogfood vault fail-closed `health` JSON gate/);
    assert.match(section, /`dogfood:agent-graph-db-pack` prints the dogfood vault shell-pasteable graph DB pack/);
    assert.match(section, /`dogfood:agent-setup-gate` prints the dogfood vault machine-readable agent setup gate with `ok` and `performanceOk`/);
    assert.match(section, /`dogfood:brief` prints the dogfood vault `workspace_brief` JSON snapshot/);
    assert.match(section, /`dogfood:growth` prints the dogfood vault `growth_plan` JSON snapshot/);
    assert.match(section, /`dogfood:maintenance` prints the dogfood vault `maintenance_plan` JSON snapshot/);
    assert.match(section, /`dogfood:status` always runs health \+ workspace-brief \+ agent-brief \+ maintenance, prints `\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N`,\s+preserves the first failing exit before escalating, and prints failed-child focused follow-ups \(`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance` \+ `pnpm test:mcp:maintenance`\) before the `pnpm dogfood:verify` follow-up hint on failure/);
    assert.match(section, /\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N/);
    assert.match(section, /`test:dogfood:status` checks that always-run shortcut contract without the full dogfood suite/);
    assert.match(section, /`pnpm dogfood:compile` is the shortest dogfood vault compiler snapshot/);
    assert.match(section, /`pnpm dogfood:health` is the shortest dogfood vault health gate/);
    assert.match(section, /`pnpm dogfood:brief` is the shortest dogfood vault first-contact snapshot/);
    assert.match(section, /`pnpm dogfood:growth` is the shortest dogfood vault growth candidate snapshot/);
    assert.match(section, /`pnpm dogfood:status` for the cheap human-readable health \+ first-contact \+ agent handoff \+ maintenance queue/);
    assert.match(section, /it still prints the brief, agent handoff, and maintenance after health fails, preserves the first failing exit,\s+and prints failed-child focused follow-ups before the `pnpm dogfood:verify`\s+follow-up hint on failure/);
    assert.match(section, /`pnpm dogfood:compile-fix -- --help` \/ `pnpm dogfood:status -- --help`/);
    assert.match(section, /shortcut usage without running those gates/);
    assert.match(section, /unsupported shortcut arguments fail\s+with exit 2 before starting the underlying checks/);
    assert.match(section, /close `--help` typos include\s+a `Did you mean --help\?` hint/);
    assert.match(section, /Use\s+`pnpm dogfood:verify` for the full installed-style dogfood vault gate/);
    assert.match(section, /`pnpm dogfood:test` only when the dogfood helper itself needs the full\s+regression suite beyond the focused `test:mcp:dogfood` gate/);
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
    assert.match(section, /initialize tool-inventory \+ safety\/recovery guidance gate/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /dogfood argument rejection,\s+timeout parsing, missing response labels, and retry help/);
    assert.match(section, /maintenance_plan filter enums, ready\/missing\s+cursor handling, resume-cursor behavior, dogfood work-queue shape gates, and\s+bucket \/ next-action formatter checks/);
    assert.match(section, /package-script, CLI entrypoint, dependency, and\s+tarball contract drift/);
    assert.match(section, /unsupported-argument\s+rejection/);
    assert.match(section, /strict relation filter\s+rejection/);
    assert.match(section, /strict add_relation type-preflight rejection \+ no-write metadata\s+evidence/);
    assert.match(section, /strict closest-value\s+summary/);
    assert.match(section, /stderr warning filtering/);
    assert.match(section, /verify helper contract/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /timeout parsing, startup failure\s+retry guidance, usage, empty-vault fail-fast, and retry diagnostics/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /pnpm exec node --test --test-name-pattern/);
    assert.match(section, /instead of appending the flag after `pnpm integration:mcp --`/);
    assert.match(section, /scripts\/run-focused-node-test\.mjs/);
    assert.match(section, /typoed patterns fail when they match 0\s+tests instead of silently passing as all skipped/);
    assert.match(section, /signal-killed `node --test`\s+subprocesses report the signal plus target path/);
    assert.match(section, /wrapper requires an\s+explicit pattern and at least one test target/);
    assert.match(section, /Node test option values such as `--test-concurrency 1`\s+or `--test-timeout 1000` are\s+not counted as targets/);
    assert.match(section, /missing split option\s+value cannot leak the following option value into the target list/);
    assert.match(section, /Focused runs\s+with TAP summaries end with `matched=N` before file-level `tests=N`, even when a\s+matched test fails/);
    assert.match(section, /File setup\/import failures are reported separately as\s+`setupFailures=N`/);
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
    assert.match(verifySection, /pnpm --filter \.\/mcp verify -- \.\.\/docs\/ontology --timeout-ms 15000/);
    assert.match(verifySection, /pnpm --filter \.\/mcp verify -- --help/);
    assert.match(verifySection, /explicit positional vault or `--vault` argument takes\s+precedence over `OMOT_VAULT`/);
    assert.match(verifySection, /`npm run verify -- --help` and `pnpm --filter \.\/mcp verify -- --help` print the same first-contact scope/);
    assert.match(verifySection, /direct verifier normalizes the leading pnpm separator before parsing flags/);
    assert.match(verifySection, /Filtered package invocations run from `mcp\/`, so the repo dogfood vault is `\.\.\/docs\/ontology`/);
    assert.match(verifySection, /missing vault paths fail before server startup/);
    assert.match(verifySection, /empty vault folders fail before later read smokes/);
    assert.match(verifySection, /direct read smokes for `list_concepts` project probe \/ `get_concept` \/\s+`get_concepts` \/ `find_evidence` \/ `find_backlinks` \/ `query_concepts` \/\s+limited `query_concepts` \/ `analyze_repo_structure` \/ `infer_imports` \/\s+`find_neighbors` \/ `find_path` \/ `find_orphans`/);
    assert.match(verifySection, /strict unknown-tool \/ unknown-argument \/ invalid-enum rejection/);
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
    assert.match(verifySection, /✓ initialize instructions — tool inventory plus first-contact safety and recovery guidance present/);
    assert.match(verifySection, /✓ tools\/list inventory names — missing\/extra\/duplicate\/invalid checks passed/);
    assert.match(verifySection, /✓ tools\/list schema contract — strict arguments \+ annotations \+ graph-query enums \+ graph kind enums\/descriptions \+ write relation enums \+ health tuning \+ post-write maintenance schema/);
    assert.match(verifySection, /✓ strict arguments — unknown tool argument rejected at runtime/);
    assert.match(verifySection, /✓ strict arguments — multiple unknown tool arguments reported together/);
    assert.match(verifySection, /✓ add_concepts — non-object, single\/multi unknown-field repair, Received fields, duplicate-slug rows isolated with input indexes, and invalid-only batches return no write metadata/);
    assert.match(verifySection, /✓ add_relations — non-object, single\/multi unknown-field repair, Received fields, invalid-type rows isolated with input indexes and closest-value hints, and invalid-only batches return no write metadata/);
    assert.match(verifySection, /✓ batch caps — get_concepts\/add_concepts\/add_relations reject 51 rows with invalid_arguments/);
    assert.match(verifySection, /✓ strict enums — invalid query operation rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict relation filters — invalid dependencyTypes rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict list_concepts filters — invalid kind rejected with closest-value hint/);
    assert.match(verifySection, /✓ strict query_concepts filters — invalid kind\/has-key rejected with closest-value hints/);
    assert.match(verifySection, /✓ strict find_neighbors filters — invalid relation types rejected before slug resolution with closest-value hint/);
    assert.match(verifySection, /✓ strict find_orphans filters — invalid kind\/excludeKinds rejected with closest-value hints/);
    assert.match(verifySection, /✓ strict relation_check — invalid type rejected before endpoint resolution with closest-value hint and structured repair/);
    assert.match(verifySection, /✓ strict add_relation — invalid type rejected before endpoint resolution with structured repair and no write metadata/);
    assert.match(verifySection, /✓ strict graph filters — invalid match_nodes\.kind\/sort, match_edges\.type, and recommend_relations\.kind rejected with narrowed diagnostics/);
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
      const tunedBriefActionLabel =
        tunedBriefAction.id && tunedBriefAction.kind && tunedBriefAction.id !== tunedBriefAction.kind
          ? `${tunedBriefAction.id}/${tunedBriefAction.kind}`
          : tunedBriefAction.id || tunedBriefAction.kind;
      assert.match(
        verifySection,
        new RegExp(
          `workspace_brief_tuned non-blocking advisory nextActions — ${tunedBriefActionLabel}:${tunedBriefAction.severity}:${tunedBriefAction.count} - ${regexEscape(tunedBriefAction.message)}`,
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
    assert.match(
      verifySection,
      new RegExp(`✓ read census consistency — ${compiled.nodeCount} nodes across list_kinds/list_concepts/compile_ontology/overview, ${Object.keys(compiled.byKind).length} kinds`),
    );
    assert.match(verifySection, /✓ destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(verifySection, new RegExp(regexEscape(`✓ structuredContent — ${structuredContentVerifySummary({
      hasNode: true,
      hasProject: true,
      hasGetConcept: true,
      hasFindBacklinks: true,
      hasDirectGraphReads: true,
      hasLimitedQueryConcepts: true,
      hasCompileIndexes: true,
      hasAllPaths: true,
      hasMaintenanceResumeSkipped: true,
      destructiveDryRunCount: 3,
    })}`)));
    assert.match(verifySection, /All passed — register \.mcp\.json with your MCP client and restart to use the 23 tools/);
    assert.match(verifySection, /`list_concepts`, a project-node `list_concepts` probe,\s+`get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`,\s+`query_concepts`, limited `query_concepts`, `analyze_repo_structure`,\s+`infer_imports`, `find_neighbors`, `find_path`, `find_orphans`,\s+`list_kinds`, `validate_vault`/);
    assert.match(verifySection, /batch success rows\s+and partial rows are verified during installation checks/);
    assert.match(verifySection, /`query_ontology\(\{operation:"neighbors"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"path"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"all_paths"\}\)`/);
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
    assert.match(verifySection, /`find_orphans\.kind` \/ `find_orphans\.excludeKinds`\s+node-kind enum schemas and root\/sentinel default description/);
    assert.match(verifySection, /write-safety schemas for\s+`expected_mtime`/);
    assert.match(verifySection, /destructive-tool `confirm` dry-run switches/);
    assert.match(verifySection, /`rename_concept\.overwrite`/);
    assert.match(verifySection, /`delete_concept\.force`/);
    assert.match(verifySection, /batch row isolation for non-object row shape,\s+unknown row field inputs with single-field structured repair plus all offending fields reported, reader\/writer 50-row batch cap\s+rejection with `invalid_arguments`/);
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
    assert.match(verifySection, /Empty\s+vault folders fail immediately after the `list_concepts` census/);
    assert.match(verifySection, /green MCP\s+wiring check against the wrong folder/);
    assert.match(verifySection, /`list_kinds` \/ `compile_ontology` \/ `overview`\s+census shape\/count mismatches/);
    assert.match(verifySection, /Missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /`workspace_brief\.nextActions`/);
    assert.match(verifySection, /`workspace_brief\.health\.checks`/);
    assert.match(verifySection, /`health\.checks`/);
  });

  it('keeps the MCP changelog aligned with the verify census gates', () => {
    const changelog = readFileSync('mcp/CHANGELOG.md', 'utf-8');
    const readme = readFileSync('mcp/README.md', 'utf-8');
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
    assert.match(verifySection, /`compile_ontology`, `overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `all_paths` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query execution with `neighbors`, node→project `path`, bounded `all_paths`, and `project_scope`/);
    assert.match(verifySection, /validates `path` hop\/edge alignment/);
    assert.match(verifySection, /dedicated `list_concepts` call before graph smoke/);
    assert.match(verifySection, /skips only the containment-specific `project_scope` smoke/);
    assert.match(verifySection, /treats empty vault folders as a first-contact configuration failure/);
    assert.match(verifySection, /green MCP wiring check against the wrong folder/);
    assert.match(verifySection, /cross-checks node census totals across `list_kinds`, `list_concepts`, `compile_ontology`, and `overview`/);
    assert.match(verifySection, /keeping `validate_vault\.scanned` as file-level health/);
    assert.match(verifySection, /dedicated `read census consistency` pass line/);
    assert.match(verifySection, /read surfaces agree/);
    assert.match(verifySection, /`maintenance 2\/2 \(resume skipped: no actions\)`/);
    assert.match(verifySection, /intentionally skipped resume-cursor smoke/);
    assert.match(verifySection, /missing or malformed first-contact diagnosis payloads/);
    assert.match(verifySection, /top-level `status`, `workspace_brief\.nextActions`,\s+`workspace_brief\.health\.checks`, `health\.checks`, tuned `workspace_brief\.health\.checks`, and tuned `health\.checks`/);
    assert.match(verifySection, /top-level diagnosis `status` must be `healthy` or `needs_attention`/);
    assert.match(verifySection, /requires every `workspace_brief\.nextActions` row to include non-empty `id` and `kind` plus `severity` in `info` \/ `warn` \/ `fail`/);
    assert.doesNotMatch(verifySection, /`id`\s+or\s+`kind`/);
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
    assert.match(verifySection, /`SIGTERM` and then\s+`SIGKILL`/);
    assert.match(verifySection, /`OMOT_VERIFY_KILL_GRACE_MS=N`/);
    assert.match(verifySection, /post-timeout cleanup\s+window/);
    assert.match(verifySection, /rejects missing vault paths before starting the MCP server/);
    assert.match(verifySection, /hints `\.\.\/docs\/ontology` for the dogfood vault/);
    assert.match(verifySection, /fails empty vault folders immediately after the `list_concepts` census/);
    assert.match(verifySection, /misleading downstream read-smoke failures/);
    assert.match(verifySection, /terminates by signal before first-contact completes/);
    assert.match(verifySection, /reports that signal\s+separately from timeout and startup failures/);
    assert.match(verifySection, /invalid timeout values fail before the server\s+starts and print\s+the received value plus a concrete retry example/i);
    assert.match(verifySection, /`npm run verify -- --timeout-ms 15000`/);
    assert.match(verifySection, /normalizes a leading pnpm separator/);
    assert.match(verifySection, /`pnpm --filter \.\/mcp verify -- --help` prints verify usage instead of failing with `Unknown option: --`/);
    assert.match(verifySection, /validates the installed `tools\/list` schema contract/);
    assert.match(verifySection, /`query_ontology\.operation` must stay required/);
    assert.match(verifySection, /graph engine runtime allow-lists/);
    assert.match(verifySection, /write relation\s+type enums for `add_relation` \/ `add_relations`/);
    assert.match(verifySection, /batch tools must keep their 50-row caps/);
    assert.match(verifySection, /validates the installed `find_orphans\.kind` \/ `find_orphans\.excludeKinds` node-kind enum schema and default description/);
    assert.match(verifySection, /write tools must keep their `expected_mtime` \/ `confirm` \/ `rename_concept\.overwrite` \/ `delete_concept\.force` safety schemas/);
    assert.match(verifySection, /validates `maintenance_plan\.summary` count fields and relationships plus `byPhase` \/ `bySeverity` \/ `byKind` bucket totals/);
    assert.match(verifySection, /validates `maintenance_plan\.cursor\.nextAfterActionId` and `cursor\.hasMore`/);
    assert.match(verifySection, /write tool descriptions keep compact `postWriteMaintenance` bucket summaries/);
    assert.match(verifySection, /`byPhase` \/ `bySeverity` \/ `byKind`/);
    assert.match(verifySection, /action `score`/);
    assert.match(verifySection, /executable `proposedAction`/);
    assert.match(verifySection, /current-page next action pointer guidance/);
    assert.match(verifySection, /single unknown-field rows include `receivedField` plus one-row `unknownFields`/);
    assert.match(verifySection, /multi unknown-field rows report every offending field with nearest hints and `Received fields: \.\.\.`/);
    assert.match(verifySection, /`concepts\[n\]` \/ `relations\[n\]` error labels/);
    assert.match(verifySection, /calls destructive dry-runs for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(verifySection, /previews stay non-writing and do not include `changed` or `postWriteMaintenance`/);
    assert.match(verifySection, /`initialize\.instructions` now names the destructive-write safety boundaries directly/);
    assert.match(verifySection, /`overwrite: true`/);
    assert.match(verifySection, /dangling referrers/);
    assert.match(verifySection, /`npm run verify` now fails when `initialize\.instructions` loses first-contact safety and recovery guidance/);
    assert.match(verifySection, /read-only diagnosis/);
    assert.match(verifySection, /`expected_mtime`/);
    assert.match(verifySection, /`force: true`/);
    assert.match(verifySection, /batch relation type recovery/);
    assert.match(verifySection, /Did you mean "depends_on"\?/);
    assert.match(verifySection, /strict-input typo recovery/);
    assert.match(verifySection, /`Did you mean "limit"\?` \/ `Did you mean "overview"\?`/);
    assert.match(readme, /row-level repair fields include `rowName` \/ `receivedField` \/ `unknownFields` \/ `allowedFields` \/ `receivedFields` \/ `firstSeenAt`/);
    assert.match(verifySection, /runtime negative smoke calls with invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"` inputs/);
  });

  it('keeps the CLI README explicit about mcp-verify help scope', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const tableRow = readme.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const agentSetupRow = readme.split('| `oh-my-ontology agent-setup [vault]` |')[1]?.split('\n')[0] ?? '';
    const growthRow = readme.split('| `oh-my-ontology growth [vault]` |')[1]?.split('\n')[0] ?? '';
    const maintenanceRow = readme.split('| `oh-my-ontology maintenance [vault]` |')[1]?.split('\n')[0] ?? '';
    const analyzeRow = readme.split('| `oh-my-ontology analyze [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = readme.split('| `oh-my-ontology infer-imports [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const compileRow = readme.split('| `oh-my-ontology compile [vault]` |')[1]?.split('\n')[0] ?? '';
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(tableRow, /project-node `list_concepts` probe/);
    assert.match(agentSetupRow, /`docs\.workflowGuide`/);
    assert.match(agentSetupRow, /`docs\.modeComparison`/);
    assert.match(agentSetupRow, /`docs\.postChangeSync`/);
    assert.match(agentSetupRow, /CLI-only \/ MCP-connected \/ graph DB pack \/ setup gate choices/);
    assert.match(tableRow, /23-tool inventory with missing\/extra\/duplicate\/invalid name checks/);
    assert.match(tableRow, /23-tool inventory with missing\/extra\/duplicate\/invalid name checks plus tools\/list schema strictness and annotation coverage/);
    assert.match(tableRow, /relation filter \/ `relation_check` closest-value rejection/);
    assert.match(tableRow, /destructive dry-run smoke for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(tableRow, /write-tool `postWriteMaintenance` `byPhase`\/`bySeverity`\/`byKind` buckets \+ `score`\/`proposedAction`\/next-action guidance/);
    assert.match(tableRow, /enum-validated `maintenance_plan` filters/);
    assert.match(tableRow, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(tableRow, /maintenance bucket \/ current-page next-action summaries/);
    assert.match(tableRow, /`query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`/);
    assert.match(tableRow, /`find_orphans`/);
    assert.match(tableRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(tableRow, /`neighbors`\/`path`\/`all_paths`\/`project_scope` graph-query smoke/);
    assert.match(readme, /Successful output prints a `read census consistency` line/);
    assert.match(readme, /listing, compiler, and overview read surfaces agree/);
    assert.match(growthRow, /MCP `growth_plan` candidates/);
    assert.match(growthRow, /relation recommendations, external element refs, dangling references, unassigned nodes, empty domains, and ignored external refs/);
    assert.match(growthRow, /candidate reasons, and proposed tool calls/);
    assert.match(growthRow, /kind-specific `proposedAction` mismatches/);
    assert.match(growthRow, /Malformed growth candidate payloads.*fail closed before JSON or human output/);
    assert.match(maintenanceRow, /MCP `maintenance_plan` cleanup\/repair work queue/);
    assert.match(maintenanceRow, /`--after-action-id`/);
    assert.match(maintenanceRow, /compile\/cycle\/canonicalize\/dangling\/relation\/external\/ignored-external summary counts/);
    assert.match(maintenanceRow, /phase\/severity\/kind bucket summaries/);
    assert.match(maintenanceRow, /current-page next action pointers/);
    assert.match(maintenanceRow, /`phase\/kind · severity · exec\|review` detail/);
    assert.match(maintenanceRow, /cursor\/filter dogfood/);
    assert.match(maintenanceRow, /filter echo drift/);
    assert.match(maintenanceRow, /pagination `limited` drift/);
    assert.match(maintenanceRow, /compiled-summary drift/);
    assert.match(maintenanceRow, /fail closed before JSON or human output/);
    assert.match(analyzeRow, /Top-level `rootPath` \/ `framework` \/ `skipped`/);
    assert.match(analyzeRow, /candidate `evidence\.source` payloads are validated before JSON or human output/);
    assert.match(analyzeRow, /MCP outputSchema drift fails closed/);
    assert.match(inferImportsRow, /file edge kind summary/);
    assert.match(inferImportsRow, /per-module `kindCounts`/);
    assert.match(inferImportsRow, /`tsconfig\.json` paths aliases/);
    assert.match(inferImportsRow, /fallback common `@\/\*` aliases/);
    assert.match(inferImportsRow, /`static` \/ `dynamic` \/ `require` \/ `reexport` \/ `side`/);
    assert.match(inferImportsRow, /static-heavy dependencies/);
    assert.match(inferImportsRow, /Malformed top-level `rootPath`, unresolved `reason` enum, or `kindCounts` payloads fail closed/);
    assert.match(inferImportsRow, /`--threshold N`/);
    assert.match(compileRow, /Large `--json` output is safe to consume through stdout pipes/);
    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /direct read smoke set/);
    assert.match(verifySection, /`get_concept`,\s+`get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited\s+`query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`,\s+`find_path`, and `find_orphans`/);
    assert.match(verifySection, /single-node, batch, search\/backlink,\s+limit-semantics, bootstrap\/import analysis, neighborhood, shortest-path, and\s+orphan coverage/);
    assert.match(verifySection, /`tools\/list` inventory names,\s+schema contract/);
    assert.match(verifySection, /annotation coverage \(`title` \/ `read` \/ `write` \/ `destructive` \/\s+`idempotent` \/ `local-only`\)/);
    assert.match(verifySection, /write-tool `postWriteMaintenance` `byPhase` \/ `bySeverity` \/\s+`byKind` bucket summaries plus `score` \/ executable `proposedAction` \/\s+current-page next action pointer guidance/);
    assert.match(verifySection, /runtime negative smokes with invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"` inputs/);
    assert.match(verifySection, /`list_concepts\.kind`/);
    assert.match(verifySection, /`query_concepts\.kind` \/ `query_concepts\.has-key`/);
    assert.match(verifySection, /`find_neighbors\.types`/);
    assert.match(verifySection, /`find_orphans\.kind` \/ `find_orphans\.excludeKinds`/);
    assert.match(verifySection, /`match_nodes\.kind`/);
    assert.match(verifySection, /`match_nodes\.sort`/);
    assert.match(verifySection, /`recommend_relations\.kind`/);
    assert.match(verifySection, /`match_edges\.type` \/\s+`match_edges\.fromKind` \/\s+`match_edges\.toKind`\s+typo and unsupported-kind rejection/);
    assert.match(verifySection, /relation type typos, and operation-specific kind mismatches fail with\s+diagnostics instead of\s+silently/);
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
    assert.match(verifySection, /fail closed instead of hanging forever/);
    assert.match(verifySection, /`OMOT_CLI_MCP_TIMEOUT_MS=N`/);
    assert.match(verifySection, /longer one-shot MCP call window/);
    assert.match(verifySection, /`SIGTERM` and then `SIGKILL`/);
    assert.match(verifySection, /`OMOT_CLI_MCP_KILL_GRACE_MS=N`/);
    assert.match(verifySection, /post-timeout cleanup window/);
    assert.match(verifySection, /outer timeout for `OMOT_MCP_VERIFY_PATH` overrides/);
    assert.match(verifySection, /custom verify script that stalls cannot hang/);
    assert.match(verifySection, /delegated verify script terminates by signal/);
    assert.match(verifySection, /reports the signal instead of returning a silent exit 1/);
    assert.match(verifySection, /node-to-project `path`/);
    assert.match(verifySection, /`path` hop\/edge alignment/);
    assert.match(verifySection, /Malformed `cycles` and `path`\s+payloads fail closed before machine output/);
    assert.match(verifySection, /Standalone `overview`, `hubs`, and\s+`blast-radius` commands also validate graph\/count\/ranking\/page payloads/);
    assert.match(verifySection, /`path` \/ `project_scope` calls/);
    assert.match(verifySection, /Vaults without a `kind: project`\s+node skip/);
    assert.match(verifySection, /empty vault\s+folders fail immediately after the `list_concepts` census/);
  });

  it('keeps the CLI README explicit about focused source-checkout verification', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const section = readme.split('### Source-checkout verification')[1]?.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[0] ?? '';

    assert.match(section, /pnpm test:cli:args/);
    assert.match(section, /narrow CLI argument parser contract/);
    assert.match(section, /flag, positional, integer, or CSV parsing/);
    assert.match(section, /pnpm test:cli:lib/);
    assert.match(section, /pnpm test:cli:mcp-call/);
    assert.match(section, /pnpm test:contracts/);
    assert.match(section, /pnpm integration:cli:mcp-verify/);
    assert.match(section, /pnpm integration:cli:growth/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:registration/);
    assert.match(section, /pnpm test:mcp:maintenance/);
    assert.match(section, /pnpm test:mcp:package/);
    assert.match(section, /package-script, CLI entrypoint, and tarball contract drift/);
    assert.match(section, /pnpm test:mcp:verify/);
    assert.match(section, /pnpm test:mcp:verify:first-contact/);
    assert.match(section, /destructive dry-run \/\s+`patch_concept`\s+conflict guard write-safety smoke/);
    assert.match(section, /health\s+summary \/ advisory \/ next-action gates/);
    assert.match(section, /pnpm test:mcp:verify:timeout/);
    assert.match(section, /empty-vault fail-fast/);
    assert.match(section, /test:cli:mcp-call/);
    assert.match(section, /integration:cli:entry/);
    assert.match(section, /CLI entrypoint, help, command inventory, and init contracts/);
    assert.match(section, /integration:cli:compile/);
    assert.match(section, /CLI compile \/ `--fix` canonicalization contracts/);
    assert.match(section, /pnpm dogfood:compile/);
    assert.match(section, /pnpm dogfood:compile-fix/);
    assert.match(section, /pnpm test:dogfood:script-refs/);
    assert.match(section, /pnpm test:dogfood:compile-fix/);
    assert.match(section, /pnpm dogfood:health/);
    assert.match(section, /pnpm dogfood:agent/);
    assert.match(section, /pnpm dogfood:agent-graph-db-pack/);
    assert.match(section, /pnpm dogfood:agent-setup-gate/);
    assert.match(section, /pnpm dogfood:agent-fallbacks/);
    assert.match(section, /pnpm dogfood:brief/);
    assert.match(section, /pnpm dogfood:maintenance/);
    assert.match(section, /pnpm dogfood:status/);
    assert.match(section, /pnpm test:dogfood:status/);
    assert.match(section, /pnpm dogfood:verify/);
    assert.match(section, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000/);
    assert.match(section, /pnpm cli:mcp-verify -- --help/);
    assert.match(section, /shared CLI helper contracts/);
    assert.match(section, /pnpm exec node --test cli\/src\/lib\/<name>\.test\.mjs/);
    assert.match(section, /run that first before the aggregate lib gate/);
    assert.match(section, /argument parsing/);
    assert.match(section, /command registry metadata/);
    assert.match(section, /MCP response unwrapping/);
    assert.match(section, /batch post-write maintenance metadata/);
    assert.match(section, /spawn failure mapping/);
    assert.match(section, /one-shot MCP call timeout guard/);
    assert.match(section, /installed MCP verification wrapper/);
    assert.match(section, /CLI growth_plan wrapper/);
    assert.match(section, /documentation drift/);
    assert.match(section, /source-checkout `.mcp.json`, `.mcp.json.example`, and\s+`.codex\/config.toml` templates/);
    assert.match(section, /maintenance_plan filter, cursor, resume,\s+work-queue shape, and bucket \/ next-action formatter contracts/);
    assert.match(section, /shared MCP verify helper contract/);
    assert.match(section, /first-contact initialize\s+safety\/recovery guidance, unknown-tool recovery, read smoke/);
    assert.match(section, /vault warning \/ `validate_vault`/);
    assert.match(section, /health\s+summary \/ advisory \/ next-action gates/);
    assert.match(section, /workspace_brief\.nextActions\[\]\.sample`\s+shape drift/);
    assert.match(section, /timeout parsing, startup failure retry\s+guidance, usage, empty-vault fail-fast, and retry diagnostics/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /pnpm exec node --test --test-name-pattern/);
    assert.match(section, /instead of appending the flag after `pnpm integration:cli --`/);
    assert.match(section, /scripts\/run-focused-node-test\.mjs/);
    assert.match(section, /typoed\s+patterns fail when they match 0\s+tests instead of silently passing as all skipped/);
    assert.match(section, /signal-killed `node --test`\s+subprocesses report the signal plus target path/);
    assert.match(section, /wrapper requires an\s+explicit pattern and at least one test target/);
    assert.match(section, /Node test option values such as `--test-concurrency 1`\s+or `--test-timeout 1000` are\s+not counted as targets/);
    assert.match(section, /missing split option\s+value cannot leak the following option value into the target list/);
    assert.match(section, /Focused runs\s+with TAP summaries end with `matched=N` before file-level `tests=N`, even when a\s+matched test fails/);
    assert.match(section, /File setup\/import failures are reported separately as\s+`setupFailures=N`/);
    assert.match(section, /`integration:cli:entry`\s+narrows CLI entrypoint, help, command inventory, and init contracts/);
    assert.match(section, /`integration:cli:compile`\s+narrows CLI compile \/ `--fix` canonicalization contracts/);
    assert.match(section, /`integration:cli:diagnosis`\s+narrows CLI health \/ agent-brief \/ workspace-brief diagnosis contracts/);
    assert.match(section, /`integration:cli:graph-read`\s+narrows read-only graph command contracts/);
    assert.match(section, /`integration:cli:graph-write`\s+narrows rename\/delete\/merge safety contracts/);
    assert.match(section, /`integration:cli:repo-analysis`\s+narrows analyze \/ infer-imports \/ bootstrap code-to-vault contracts/);
    assert.match(section, /`integration:cli:local-vault`\s+narrows local vault add\/import\/list\/find\/validate contracts/);
    assert.match(section, /`integration:cli:growth`\s+narrows the CLI growth_plan wrapper, candidate rendering, malformed payload, and argument contracts/);
    assert.match(section, /`dogfood:compile`\s+is the shortest root-checkout compiler summary JSON snapshot/);
    assert.match(section, /`dogfood:compile-fix`\s+runs root-checkout `compile --fix`, fails if canonicalization leaves a docs\/ontology diff,\s+points changed-vault failures at `pnpm docs-vault:build`, and ends successful runs\s+with `\[dogfood:compile-fix\] docs\/ontology unchanged`/);
    assert.match(section, /`test:dogfood:args`\s+checks shared dogfood shortcut argument helpers without invoking any gate/);
    assert.match(section, /`test:dogfood:script-refs`\s+checks help text and package script body `pnpm \.\.\.` references against root package scripts plus focused filter parsing and wrapper summaries/);
    assert.match(section, /`test:dogfood:compile-fix`\s+checks that idempotence guard without invoking the full dogfood suite/);
    assert.match(section, /`dogfood:health`\s+is the shortest root-checkout fail-closed health JSON gate/);
    assert.match(section, /`dogfood:agent-graph-db-pack`\s+prints\s+the shell-pasteable graph DB pack for docs\/ontology/);
    assert.match(section, /`dogfood:agent-setup-gate`\s+prints\s+the machine-readable agent setup gate for docs\/ontology with `ok` and `performanceOk`/);
    assert.match(section, /`dogfood:brief`\s+is\s+the shortest root-checkout first-contact JSON snapshot/);
    assert.match(section, /`dogfood:growth`\s+is the\s+shortest root-checkout growth_plan JSON snapshot/);
    assert.match(section, /`dogfood:maintenance`\s+is the\s+shortest root-checkout maintenance_plan JSON snapshot/);
    assert.match(section, /`dogfood:status` always\s+runs health \+ workspace-brief \+ agent-brief \+ maintenance, prints `\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N`,\s+preserves the first failing exit before escalating, and prints failed-child focused\s+follow-ups \(`pnpm dogfood:health`, `pnpm dogfood:brief`, `pnpm dogfood:agent`, or `pnpm dogfood:maintenance`\s+\+ `pnpm test:mcp:maintenance`\) before the `pnpm dogfood:verify` follow-up hint\s+on failure/);
    assert.match(section, /\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N/);
    assert.match(section, /`test:dogfood:status`\s+checks\s+that always-run shortcut contract without the full dogfood suite/);
    assert.match(section, /`dogfood:verify` is\s+the full root-checkout dogfood vault gate/);
    assert.match(section, /`pnpm dogfood:compile-fix -- --help`\s+and `pnpm dogfood:status -- --help` print shortcut usage without running those\s+gates/);
    assert.match(section, /unsupported shortcut arguments fail with exit 2 before any child check starts/);
    assert.match(section, /close `--help` typos include a `Did you mean --help\?` hint/);
    assert.match(section, /`dogfood:test` is the full dogfood\s+helper regression suite to use only when focused helper checks are not enough/);
    assert.match(section, /`cli:mcp-verify` is the root-checkout shortcut for the CLI wrapper/);
    assert.match(section, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000` when you need to pass\s+explicit verify args/);
    assert.match(section, /Vault arguments are passed without the extra `--`/);
    assert.match(section, /keep `-- --help`\s+for the help flag/);
  });

  it('keeps the CLI README explicit about installed batch row isolation gates', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('### Node.js API')[0] ?? '';

    assert.match(verifySection, /batch reader\/writer cap and row-isolation guidance for\s+`get_concepts`, `add_concepts`, and `add_relations`/);
    assert.match(verifySection, /non-object row shape, unknown row field reporting,\s+all offending unknown fields, duplicate `add_concepts` slug failures surfacing as row-level `ok:false`/);
    assert.match(verifySection, /instead of top-level tool errors/);
    assert.match(verifySection, /with no `postWriteMaintenance`/);
    assert.match(verifySection, /51-row batch cap rejection as structured `invalid_arguments`/);
    assert.match(verifySection, /structured `errorCode` values \(`unknown_argument` \/ `invalid_arguments`\)/);
    assert.match(verifySection, /stale `patch_concept\.expected_mtime` rejection with\s+`vault_conflict`/);
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
    const workspaceBriefSection = changelog.split('## 0.8.0 — 2026-05-14')[1]?.split('## 0.7.0')[0] ?? '';
    const productMcpHardeningSection = productChangelog.split('## 2026-05-18 — MCP first-contact and packed-smoke hardening')[1]?.split('## 2026-05-17')[0] ?? '';
    const productMaintenanceSection = productChangelog.split('## 2026-05-17 — CLI maintenance queue + focused verification')[1]?.split('## 2026-05-11')[0] ?? '';

    assert.match(changelog, /malformed `compile`, `cycles`, `path` hop\/edge payloads, `health\.checks`, `workspace_brief\.health\.checks`, and `workspace_brief\.nextActions` rows/);
    assert.match(workspaceBriefSection, /`oh-my-ontology workspace-brief \[vault\]` — status \+ hotspots top 5 \+ `project_scope` 포함 노드 수 \+ next actions 한 화면/);
    assert.doesNotMatch(workspaceBriefSection, /project 별 노드 수/);
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
    assert.match(verifySection, /`read census consistency` line/);
    assert.match(verifySection, /listing, compiler, and overview read surfaces agree/);
    assert.match(verifySection, /`workspace_brief\.nextActions\[\]\.sample` shape gate/);
    assert.match(verifySection, /real `add_relation` \/ `add_concept` inputs/);
    assert.match(verifySection, /`resolve_dangling_reference` rows/);
    assert.match(verifySection, /compact non-blocking advisory nextActions/);
    assert.match(verifySection, /issues\/unresolved\/cycles\/checks` health summaries/);
    assert.match(verifySection, /check `id:status:count` coverage/);
    assert.match(verifySection, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(verifySection, /`compile_ontology` summary \+ paginated full-artifact \+ indexed full-artifact smoke/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `all_paths` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query smoke for `neighbors`, node→project `path`, bounded `all_paths`, and `project_scope`/);
    assert.match(verifySection, /project-node probe before graph smoke/);
    assert.match(verifySection, /accepts valid project-less vaults/);
    assert.match(verifySection, /treats empty vault folders as a first-contact configuration failure/);
    assert.match(verifySection, /runtime unknown-tool, unknown-argument, and invalid-enum rejection smoke/);
    assert.match(verifySection, /batch writer row-isolation gate for `add_concepts` \/ `add_relations`/);
    assert.match(verifySection, /non-object row shape, unknown row field inputs with all offending fields reported/);
    assert.match(verifySection, /input index, all offending unknown fields, and closest-value hints for invalid relation types/);
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
    assert.match(maintenanceSection, /current-page next executable\/review pointers with phase\/kind, severity, and exec\/review detail/);
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
    assert.match(productMcpHardeningSection, /Batch unknown-field diagnostics/);
    assert.match(productMcpHardeningSection, /every offending unknown field, nearest field\s+hints, and `Received fields: \.\.\.`/);
    assert.match(productMcpHardeningSection, /invalid relation types as row-level `ok:false` results with closest-value\s+hints/);
    assert.match(productMcpHardeningSection, /First-contact guidance gate/);
    assert.match(productMcpHardeningSection, /`initialize\.instructions` must explain/);
    assert.match(productMcpHardeningSection, /Packed install smoke parity/);
    assert.match(productMcpHardeningSection, /installed CLI\/MCP\s+verify paths/);
    assert.match(productMcpHardeningSection, /Dogfood docs contract/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf-8');
    const releaseChecks = readme.split('## Release Smoke')[1] ?? '';

    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /project-less and\s+empty-vault paths/);
    assert.match(releaseChecks, /strict argument\/enum handling/);
    assert.match(releaseChecks, /destructive dry-runs/);
    assert.match(releaseChecks, /health\s+tuning/);
    assert.match(releaseChecks, /dependency-cycle failure behavior/);
    assert.match(releaseChecks, /get_concepts` success and partial rows/);
    assert.match(releaseChecks, /workspace_brief\.nextActions\[\]/);
    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(releaseChecks, /`health`, `agent_brief`, and `workspace_brief` tuned diagnosis flags/);
    assert.match(releaseChecks, /`neighbors`, `path`, `all_paths`, and `project_scope`/);
    assert.match(releaseChecks, /fail-closed/);
    assert.match(releaseChecks, /malformed `compile`, `cycles`, `path`,\s+`health`, `agent-brief`, and `workspace-brief` payloads/);
  });

  it('keeps development docs explicit about vault validator help', () => {
    const agents = readFileSync('AGENTS.md', 'utf-8');
    const readme = readFileSync('README.md', 'utf-8');
    const checksDoc = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf-8');
    const architecture = readFileSync('docs/ARCHITECTURE.md', 'utf-8');
    const prTemplate = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf-8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf-8');
    const vaultTooling = checksDoc.split('## Vault Checks')[1]?.split('## MCP And CLI Checks')[0] ?? '';

    assert.equal(pkg.scripts['test:vault:validate'], 'node --test scripts/validate-vault-script.test.mjs');
    assert.equal(pkg.scripts['test:vault:audit'], 'node --test scripts/audit-vault-paths.test.mjs');
    assert.match(workflow, /name: Vault validate \(dogfood frontmatter integrity\)\s+run: pnpm vault:validate/);
    assert.match(workflow, /name: Vault validator CLI contract\s+run: pnpm test:vault:validate/);
    assert.match(workflow, /name: Vault paths audit \(capability\/element 의 path 가 실 코드 일치\)\s+run: pnpm vault:audit/);
    assert.match(workflow, /name: Vault audit CLI contract\s+run: pnpm test:vault:audit/);
    assert.match(workflow, /name: Docs vault manifest freshness\s+run: pnpm docs-vault:check/);
    assert.match(vaultTooling, /pnpm vault:validate\s+# frontmatter integrity audit/);
    assert.match(vaultTooling, /pnpm vault:validate \/your\/vault/);
    assert.match(vaultTooling, /pnpm vault:validate -- --help/);
    assert.match(vaultTooling, /print validator usage without scanning/);
    assert.match(vaultTooling, /pnpm test:vault:validate/);
    assert.match(vaultTooling, /focused validator CLI argument contract/);
    assert.match(vaultTooling, /pnpm docs-vault:check/);
    assert.match(vaultTooling, /static dogfood manifest freshness/);
    assert.match(vaultTooling, /pnpm test:vault:audit/);
    assert.match(vaultTooling, /focused vault audit CLI argument contract/);
    assert.match(readme, /\*\*Static dogfood manifest\*\* \| `pnpm docs-vault:check` keeps committed `src\/entities\/docs-vault\/data\/manifest\.json` and `public\/docs-vault\/` in sync with `docs\/`/);
    assert.match(readme, /pnpm docs-vault:check\s+# committed docs-vault output freshness/);
    assert.match(readme, /CI runs `pnpm docs-vault:check`, `pnpm vault:validate`, `pnpm test:vault:validate`,\s+`pnpm vault:audit`, `pnpm test:vault:audit`, and `pnpm package:check`/);
    assert.match(agents, /pnpm test:vault:validate\s+# focused validator CLI argument contract/);
    assert.match(agents, /pnpm test:contracts\s+# focused cross-package contract suite/);
    assert.match(agents, /pnpm vault:audit\s+# capability\/element path drift guard \(R12\)/);
    assert.match(agents, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract/);
    assert.match(agents, /pnpm test:vault:audit\s+# vault audit CLI 인자 계약 focused test/);
    assert.match(agents, /pnpm test:contracts\s+# cross-package contract focused test/);
    assert.match(agents, /pnpm test:vault:validate\s+# validator CLI 인자 계약 focused test/);
    assert.match(architecture, /pnpm test:vault:validate\s+# focused validator CLI argument contract \(CI gate\)/);
    assert.match(architecture, /pnpm docs-vault:check\s+# verify committed docs-vault outputs are fresh \(CI gate\)/);
    assert.match(architecture, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract \(CI gate\)/);
    assert.match(architecture, /pnpm test:contracts\s+# focused cross-package parser\/schema\/validator contracts/);
    assert.match(architecture, /`docs-vault:check`, `vault:validate`, `test:vault:validate`, `vault:audit`, `test:vault:audit`, and `package:check` run in CI/);
    assert.match(prTemplate, /If `scripts\/validate-vault\.mjs`, vault validation docs, or CI validation gates changed: `pnpm test:vault:validate`/);
    assert.match(prTemplate, /If `scripts\/audit-vault-paths\.mjs`, dogfood path audit docs, or CI audit gates changed: `pnpm test:vault:audit`/);
    assert.match(prTemplate, /If `docs\/`, `public\/docs-vault\/`, or static dogfood manifest behavior changed: `pnpm docs-vault:check`/);
  });

  it('keeps CLAUDE.md a thin AGENTS wrapper', () => {
    const claude = readFileSync('CLAUDE.md', 'utf-8');
    const agentImports = [...claude.matchAll(/^@AGENTS\.md$/gm)];

    assert.equal(agentImports.length, 1);
    assert.match(claude, /AGENTS\.md[\s\S]*canonical/);
    assert.match(claude, /AGENTS\.md 가 single source of truth/);
    assert.match(claude, /thin wrapper/);
    assert.match(claude, /\.claude\/rules\/\*\.md/);
    assert.match(claude, /\.claude\/settings\.json/);
    assert.match(claude, /\.claude\/skills\/\*/);
    assert.doesNotMatch(claude, /## Project overview/);
    assert.doesNotMatch(claude, /## 프로젝트 개요/);
    assert.doesNotMatch(claude, /docs\/ontology\/\s+this project's own ontology vault/);
    assert.ok(claude.split('\n').length <= 25, 'CLAUDE.md should stay a small wrapper around AGENTS.md');
  });

  it('keeps the benchmark script-list task unfrozen', () => {
    const readme = readFileSync('docs/benchmark/README.md', 'utf-8');
    const tasks = readFileSync('docs/benchmark/tasks.md', 'utf-8');
    const section = tasks.split('### C2 — package.json scripts')[1]?.split('---')[0] ?? '';

    assert.match(readme, /pnpm benchmark --dry-run/);
    assert.match(readme, /pnpm benchmark:scale --dry-run/);
    assert.match(section, /Read `package\.json`, list all keys in `scripts`/);
    assert.match(section, /derive the count at measurement time/);
    assert.match(section, /`test:vault:validate`/);
    assert.match(section, /focused `test:mcp:\*` scripts/);
    assert.doesNotMatch(section, /All \d+ scripts/);
    assert.doesNotMatch(section, /\b12 scripts\b/);
  });

  it('keeps the root README dogfood snapshot aligned with the vault census', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const agentsGuide = readFileSync('AGENTS.md', 'utf-8');
    const dogfoodRow = readme.split('| **Dogfooding** |')[1]?.split('\n')[0] ?? '';
    const agentWorkflow = readme.split('## Agent Workflow')[1]?.split('## Web Routes')[0] ?? '';
    const helpfulCommands = readme.split('Helpful vault commands:')[1]?.split('### Vault tooling')[0] ?? '';
    const census = dogfoodVaultCensus(process.cwd());

    assert.match(dogfoodRow, new RegExp(`\\*\\*${census.total} nodes\\*\\*`));
    assert.match(dogfoodRow, new RegExp(`capabilities ${census.byKind.capabilities}`));
    assert.match(dogfoodRow, new RegExp(`domains ${census.byKind.domains}`));
    assert.match(dogfoodRow, new RegExp(`elements ${census.byKind.elements}`));
    assert.match(dogfoodRow, new RegExp(`project ${census.byKind.project}`));
    assert.match(dogfoodRow, new RegExp(`vault-readme ${census.byKind['vault-readme']}`));
    assert.match(
      agentsGuide,
      new RegExp(
        `${census.total} nodes \\(capability ${census.byKind.capabilities} · domain ${census.byKind.domains} · element ${census.byKind.elements} · project ${census.byKind.project} · vault-readme ${census.byKind['vault-readme']}\\)`,
      ),
    );
    assert.match(agentsGuide, new RegExp(`dogfood — ${census.total} nodes`));
    assert.match(
      agentsGuide,
      new RegExp(
        `${census.total} 노드 \\(capability ${census.byKind.capabilities} · domain ${census.byKind.domains} · element ${census.byKind.elements} · project ${census.byKind.project} · vault-readme ${census.byKind['vault-readme']}\\)`,
      ),
    );
    assert.match(helpfulCommands, /pnpm dogfood:status/);
    assert.match(helpfulCommands, /pnpm dogfood:compile-fix -- --help/);
    assert.match(helpfulCommands, /pnpm test:dogfood:args/);
    assert.match(helpfulCommands, /pnpm dogfood:status -- --help/);
    assert.match(helpfulCommands, /pnpm test:dogfood:status/);
    assert.match(helpfulCommands, /pnpm dogfood:verify/);
    assert.match(agentWorkflow, /`workspace-brief` is the cheap first-contact dashboard/);
    assert.match(agentWorkflow, /`PROJECT별 포함 노드 수 \(project_scope\)`/);
    assert.match(agentWorkflow, /health-check coverage as\s+`id:status:count`/);
    assert.match(agentWorkflow, /growth counts before the agent chooses where to read\s+deeper/);
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
    const checksDoc = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf-8');
    const initRow = doc.split('| `oh-my-ontology init [folder]` |')[1]?.split('\n')[0] ?? '';
    const listRow = doc.split('| `oh-my-ontology list [vault]` |')[1]?.split('\n')[0] ?? '';
    const addRow = doc.split('| `oh-my-ontology add <kind> <slug> --title="..."` |')[1]?.split('\n')[0] ?? '';
    const findRow = doc.split('| `oh-my-ontology find <query> [vault]` |')[1]?.split('\n')[0] ?? '';
    const validateRow = doc.split('| `oh-my-ontology validate [vault]` |')[1]?.split('\n')[0] ?? '';
    const importRow = doc.split('| `oh-my-ontology import <path...>` |')[1]?.split('\n')[0] ?? '';
    const backlinksRow = doc.split('| `oh-my-ontology backlinks <slug>` |')[1]?.split('\n')[0] ?? '';
    const queryRow = doc.split('| `oh-my-ontology query "<filter>"` |')[1]?.split('\n')[0] ?? '';
    const orphansRow = doc.split('| `oh-my-ontology orphans` |')[1]?.split('\n')[0] ?? '';
    const cliListRow = readme.split('| `oh-my-ontology list [vault]` |')[1]?.split('\n')[0] ?? '';
    const cliAddRow = readme.split('| `oh-my-ontology add <kind> <slug> --title="..."` |')[1]?.split('\n')[0] ?? '';
    const cliFindRow = readme.split('| `oh-my-ontology find <query> [vault]` |')[1]?.split('\n')[0] ?? '';
    const cliValidateRow = readme.split('| `oh-my-ontology validate [vault]` |')[1]?.split('\n')[0] ?? '';
    const cliImportRow = readme.split('| `oh-my-ontology import <path...>` |')[1]?.split('\n')[0] ?? '';
    const cliBacklinksRow = readme.split('| `oh-my-ontology backlinks <slug>` |')[1]?.split('\n')[0] ?? '';
    const cliQueryRow = readme.split('| `oh-my-ontology query "<filter>"` |')[1]?.split('\n')[0] ?? '';
    const cliOrphansRow = readme.split('| `oh-my-ontology orphans [vault]` |')[1]?.split('\n')[0] ?? '';
    const mcpVerifyRow = doc.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = doc.split('| `oh-my-ontology infer-imports [rootPath]` |')[1]?.split('\n')[0] ?? '';
    const implementationSection = doc.split('## 구현 단일 진실원')[1]?.split('## 회귀 차단')[0] ?? '';

    assert.match(initRow, /`--hlep` \/ `-help`/);
    assert.match(initRow, /closest-value hint/);
    assert.match(listRow, /enum-validated `--kind X` filter/);
    assert.match(listRow, /`--kind=capabilty`/);
    assert.match(listRow, /closest-value hint/);
    assert.match(addRow, /`kind` 는 enum-validated closest-value hint/);
    assert.match(addRow, /`--title -vault` \/ `--domain -json` 같은 flag-looking scalar/);
    assert.match(addRow, /dash-leading body text 는 보존/);
    assert.match(findRow, /enum-validated `--kind --json`/);
    assert.match(findRow, /`--kind=capabilty`/);
    assert.match(findRow, /closest-value hint/);
    assert.match(validateRow, /`--fail-on=empty-kind,`/);
    assert.match(validateRow, /fail-closed/);
    assert.match(importRow, /fallback `--kind` 와 frontmatter `kind` typo 는 closest-value hint/);
    assert.match(backlinksRow, /backlink-match row shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(queryRow, /`--operation growth_plan`/);
    assert.match(queryRow, /graph-level CLI command guidance/);
    assert.match(queryRow, /typed-filter result row shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(orphansRow, /enum-validated kind \/ exclude-kinds 필터/);
    assert.match(orphansRow, /orphan-list row shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(orphansRow, /`--exclude-kinds=project,capabilty`/);
    assert.match(orphansRow, /closest-value hint/);
    assert.match(cliListRow, /enum-validated `--kind X` filter with closest-value hints/);
    assert.match(cliAddRow, /`kind` is enum-validated with closest-value hints before writing/);
    assert.match(cliFindRow, /enum-validated `--kind X` filter with closest-value hints/);
    assert.match(cliValidateRow, /rejects empty CSV items such as `--fail-on=empty-kind,`/);
    assert.match(cliImportRow, /Frontmatter `kind` typos and fallback `--kind` typos fail with closest-value hints/);
    assert.match(cliBacklinksRow, /Malformed backlink-match payloads fail closed before JSON or human output/);
    assert.match(cliQueryRow, /MCP-style `--operation` misuse prints graph-level CLI command guidance/);
    assert.match(cliQueryRow, /Malformed typed-filter result payloads fail closed before JSON or human output/);
    assert.match(cliOrphansRow, /enum-validated `--kind X`/);
    assert.match(cliOrphansRow, /enum-validated `--exclude-kinds A,B`/);
    assert.match(cliOrphansRow, /Malformed orphan-list payloads fail closed before JSON or human output/);
    assert.match(inferImportsRow, /file edge kind summary/);
    assert.match(inferImportsRow, /module edge 별 `kindCounts`/);
    assert.match(inferImportsRow, /`tsconfig\.json` paths alias/);
    assert.match(inferImportsRow, /fallback common `@\/\*` alias/);
    assert.match(inferImportsRow, /`static` \/ `dynamic` \/ `require` \/ `reexport` \/ `side`/);
    assert.match(mcpVerifyRow, /실제 `neighbors` \/ node→project `path` \/ bounded `all_paths` \/ `project_scope` graph smoke/);
    assert.match(mcpVerifyRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(mcpVerifyRow, /project-node `list_concepts` probe/);
    assert.match(mcpVerifyRow, /relation filter \/ `relation_check` closest-value rejection/);
    assert.match(mcpVerifyRow, /destructive dry-run smoke for `rename_concept` \/ `merge_concepts` \/ `delete_concept`/);
    assert.match(mcpVerifyRow, /`query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`/);
    assert.match(mcpVerifyRow, /`find_orphans`/);
    assert.match(mcpVerifyRow, /성공 출력은 `read census consistency` line 으로 listing \/ compiler \/ overview read surface/);
    assert.match(mcpVerifyRow, /별도 limited `query_concepts` smoke/);
    assert.match(mcpVerifyRow, /`slug!=project, limit=1` semantics/);
    assert.match(mcpVerifyRow, /`add_concepts` \/ `add_relations` row-isolation runtime smoke/);
    assert.match(mcpVerifyRow, /`concepts\[n\]` \/ `relations\[n\]` row label/);
    assert.match(mcpVerifyRow, /`add_concepts` duplicate slug structured `rowName` \/ `firstSeenAt`/);
    assert.match(mcpVerifyRow, /unknown-field 모든 offending field \+ nearest field hint \+ `Received fields: \.\.\.`/);
    assert.match(mcpVerifyRow, /`Received fields: \.\.\.`/);
    assert.match(mcpVerifyRow, /invalid `add_relations` type closest-value hint/);
    assert.match(mcpVerifyRow, /top-level tool error 가 아니라 row-level `ok:false`/);
    assert.match(mcpVerifyRow, /unknown-field row 에 모든 offending field \/ nearest field hint \/ `Received fields: \.\.\.` 가 남는지/);
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
    assert.match(mcpVerifyRow, /fail-fast/);
    assert.match(mcpVerifyRow, /잘못된 timeout 값은 `Received: "1000ms"`/);
    assert.match(mcpVerifyRow, /`oh-my-ontology mcp-verify --timeout-ms 15000`/);
    assert.match(implementationSection, /query-result-contract\.mjs/);
    assert.match(implementationSection, /`complie` → `compile`, `hlep` → `help`, `--versoin` → `--version` 같은 closest-value hint/);
    assert.match(implementationSection, /실패 usage 는 stderr 로만 출력해 stdout 을 비워두므로/);
    assert.match(implementationSection, /`help <command>` 도 같은 registry 를 통해 해당 subcommand `--help` 로 위임/);
    assert.match(implementationSection, /unknown help topic 은 closest-value hint 와 stderr usage 로 실패/);
    assert.match(implementationSection, /`-json` \/ `-summary` 처럼 single-dash 로 들어온 long option typo/);
    assert.match(implementationSection, /vault\/path positional 로 오인하지 않고 unknown flag closest-value hint/);
    assert.match(implementationSection, /`--vault -json` \/ `--kind -json` \/ `--limit -json` 같은 flag value 자리에서도 required-value error/);
    assert.match(implementationSection, /negative numeric values such as `--depth -1` still reach the numeric range error/);
    assert.match(implementationSection, /CSV list 의 빈 항목 거부/);
    assert.match(implementationSection, /`--fail-on=empty-kind,` \/ `--component-types=dependencies,` \/ `--phases=repair,` \/ `--exclude-kinds=project,`/);
    assert.match(implementationSection, /`blast-radius --direction=incomng` 같은 enum typo 는 MCP 호출 전에 closest-value hint/);
    assert.match(implementationSection, /`path` found:false 와 hop\/edge alignment/);
    assert.match(implementationSection, /`health` \/ `agent_brief` \/ `workspace-brief` top-level diagnosis status/);
    assert.match(implementationSection, /`health\.checks` \/ `agent_brief\.health\.checks` \/ `workspace-brief\.health\.checks` 의 non-empty id\/status\/count coverage/);
    assert.match(implementationSection, /`agent_brief` readiness \/ entrypoint \/ firstCalls \/ playbook \/ writeGuardrails \/ resultContracts \/ writePolicy shape/);
    assert.match(implementationSection, /`resultContracts` 는 `all_paths` completeness fields 와 partial-evidence policy 를 필수화/);
    assert.match(doc, /health check \/ nextAction shape 이 malformed 인 diagnosis payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(doc, /`--help` 도 `--json` snapshot \/ shell-gate 실패 조건, project_scope 포함 노드 요약, health \/ growth 출력 계약, `NEXT ACTIONS` id\/kind label, tuning flag 를 설명/);
    assert.match(readme, /`PROJECT별 포함 노드 수 \(project_scope\)`/);
    assert.match(readme, /cannot be\s+mistaken for a loose project summary/);
    assert.match(implementationSection, /MCP tool name, 첫 mismatch path, parsed value, structuredContent value/);
    assert.match(implementationSection, /MCP spawn error \/ stdin write error \/ child process exit \/ child process signal \/ missing `tools\/call` response 도 tool name \/ vault root \/ entry path/);
    assert.match(implementationSection, /child `close` 이벤트에서 stdio drain 이후 파싱/);
    assert.match(implementationSection, /signal 종료는 missing-response fallback 이 아니라 `mcp terminated by SIGTERM` 같은 signal context/);
    assert.match(implementationSection, /`concepts\[n\]` \/ `relations\[n\]` fallback label/);
    assert.match(implementationSection, /`undefined` 를 노출하지 않고/);
    assert.match(implementationSection, /malformed `compile` \/ `query_concepts` \/ `find_backlinks` \/ `find_orphans` \/ `overview` \/ `match_nodes` \/ `match_edges` \/ `node_profile` \/ `similar_nodes` \/ `hubs` \/ `blast-radius` \/ `cycles` \/ `path` \/ `all_paths` \/ `growth_plan` \/ `maintenance_plan` \/ `agent_brief` \/ `health` \/ `workspace-brief` payload/);
    assert.match(implementationSection, /`relation-check` 는 relation type enum 을 MCP 호출 전에 검증/);
    assert.match(implementationSection, /`query_ontology\(relation_check\)` 의 `recommendation` \/ `matchingEdges` \/ `inverseEdges` \/ `schemaPattern` \/ `nearbyPatterns` \/ `proposedAction` payload shape/);
    assert.match(implementationSection, /fail-closed/);
    assert.match(doc, /`workspace-brief` non-json 의 `PROJECT별 포함 노드 수 \(project_scope\)` label, `HEALTH CHECKS` id:status:count coverage 와 `GROWTH` action/);
    assert.match(doc, /`NEXT ACTIONS` label 은 `id` 와 `kind` 가 다르면 `components\/health_check`/);
    assert.match(readme, /`NEXT ACTIONS` labels use `id\/kind` when those fields differ/);
    assert.match(doc, /`workspace-brief` non-json 의 `PROJECT별 포함 노드 수 \(project_scope\)` label/);
    assert.match(doc, /current-page next action pointer 와 `phase\/kind · severity · exec\|review` detail/);
    assert.match(doc, /`--help` 도 cursor \/ summary \/ bucket \/ next pointer 의 phase\/kind, severity, exec\/review detail 출력 계약을 설명/);
    assert.match(doc, /`workspace-brief --help` 의 `project_scope 포함 노드 요약`/);
    assert.match(doc, /`health` non-json 의 `pass:count` 출력/);
    assert.match(doc, /`health --help` 의 `pnpm dogfood:health` automation gate \/ failing health non-zero \/ `pnpm dogfood:status` 설명/);
    assert.match(doc, /`workspace-brief --help` 의 `project_scope 포함 노드 요약`, `pnpm dogfood:health` 선행 안내와 `pnpm dogfood:status` 반복 점검 안내/);
    assert.match(doc, /`HEALTH CHECKS` 라인에 `compile_issues:pass:0` 같은 id:status:count coverage/);
    assert.match(doc, /`PROJECT별 포함 노드 수 \(project_scope\)` 로 project containment count/);
    assert.match(doc, /mismatch path diagnostics/);
    assert.match(checksDoc, /`health --json`, `agent-brief --json`, and `workspace-brief --json` are fail-closed machine outputs/);
    assert.match(checksDoc, /malformed diagnosis payloads are command failures/);
    assert.match(checksDoc, /Focused diagnosis flags are forwarded to MCP `query_ontology`/);
    assert.match(checksDoc, /--dependency-types dependencies/);
    assert.match(checksDoc, /--component-types domains,domain,capabilities/);
    assert.match(checksDoc, /--component-limit 5 --node-limit 10/);
  });

  it('keeps dogfood MCP docs explicit about workspace brief health checks', () => {
    const readme = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const releaseChecks = readme.split('## Release Smoke')[1] ?? '';
    const dogfoodSection = doc.split('dogfood walk 는 `find_evidence.matches`')[1]?.split('기본 server wait')[0] ?? '';
    const queryOntologyRow = doc.split('| `query_ontology` |')[1]?.split('\n')[0] ?? '';
    const inferImportsRow = doc.split('| `infer_imports` |')[1]?.split('\n')[0] ?? '';

    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /tuned `workspace_brief`/);
    assert.match(dogfoodSection, /workspace_brief\.nextActions/);
    assert.match(dogfoodSection, /non-empty id \+ kind \+ severity/);
    assert.doesNotMatch(dogfoodSection, /non-empty id\/kind\/severity/);
    assert.match(dogfoodSection, /nextActions\[\]\.sample/);
    assert.match(dogfoodSection, /실행 액션 shape drift/);
    assert.match(dogfoodSection, /severity\/kind\/id\/count\/message/);
    assert.match(dogfoodSection, /workspace_brief non-blocking nextActions/);
    assert.match(dogfoodSection, /workspace_brief_tuned non-blocking nextActions/);
    assert.match(dogfoodSection, /`id\/kind:severity:count`/);
    assert.match(dogfoodSection, /`components\/health_check`/);
    assert.match(doc, /parser smoke subprocess 가 signal 로 종료되면/);
    assert.match(doc, /`parser test terminated by SIGTERM`/);
    assert.match(doc, /first-contact 완료 전 signal 종료는 timeout \/ startup 실패와 구분/);
    assert.match(doc, /`server terminated by SIGTERM before first-contact completed`/);
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
    assert.match(doc, /`match_nodes\.kind` \/ `match_edges\.fromKind` 는 표준 ontology kind enum/);
    assert.match(doc, /`match_edges\.type` 도 relation type enum/);
    assert.match(doc, /`match_edges\.toKind` 는 여기에 `external` \/ `unresolved` target kind 까지 포함한\s+edge target enum/);
    assert.match(doc, /cursor miss `reason`/);
    assert.match(queryOntologyRow, /ready page 의 `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(queryOntologyRow, /현재 page 안의 첫 executable\/review action/);
    assert.match(queryOntologyRow, /`match_nodes\.kind` and `match_edges\.fromKind` use the ontology node-kind enum/);
    assert.match(queryOntologyRow, /`match_edges\.type` uses the relation-type enum/);
    assert.match(queryOntologyRow, /`match_edges\.toKind` also accepts `external` and `unresolved` target kinds/);
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
    assert.match(doc, /Run pnpm dogfood:walk -- --help for usage/);
    assert.match(doc, /`pnpm dogfood:walk -- --help`[\s\S]*MCP server 를 띄우지 않고 usage, `pnpm dogfood:compile` \/ `pnpm dogfood:compile-fix` \/\s+`pnpm dogfood:health` \/ `pnpm dogfood:agent` \/ `pnpm dogfood:agent-graph-db-pack` \/ `pnpm dogfood:agent-setup-gate` \/ `pnpm dogfood:brief` \/ `pnpm dogfood:growth` \/ `pnpm dogfood:maintenance` \/ `pnpm dogfood:status` \/ `pnpm dogfood:verify` 순서의 더 가벼운 dogfood gate, installed-style verify gate,\s+focused check 경로를 출력/);
    assert.match(doc, /`dogfood:compile-fix` 성공 마지막 줄 `\[dogfood:compile-fix\] docs\/ontology unchanged` 와 `dogfood:status` 마지막 줄 `\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N` 및 실패 시 focused hint 후 `pnpm dogfood:verify` hint/);
    assert.match(doc, /`pnpm test:dogfood:args` \/ `pnpm test:dogfood:script-refs` \/ `pnpm test:dogfood:compile-fix` \/ `pnpm test:dogfood:status` \/ `pnpm test:mcp:maintenance`/);
    assert.match(doc, /maintenance-only queue contract 만 좁게 검증/);
    assert.match(doc, /도움말의 `pnpm test:mcp:dogfood` 설명도 compile\/index gate, tools\/list inventory name \/ annotation coverage, row-label guidance,\s+batch cap gates, invalid-only batch row repair \+ no-write metadata smoke, strict closest-value \/ unknown-tool repair summary, vault warning \/ `validate_vault` problem gate, first-contact health\/growth\/sample-shape gate, maintenance work-queue shape \/ formatter, initialize tool-inventory \+ safety\/recovery guidance, destructive dry-run, structuredContent, strict relation filter, strict add_relation type-preflight \+ no-write metadata, strict graph kind filter, stderr warning 범위/);
    assert.match(dogfoodSection, /OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk/);
    assert.match(doc, /`pnpm test:mcp:dogfood` 는 이 gate 판정의 focused subset, workspace_brief sample-shape gate, maintenance work-queue shape \/ formatter, initialize tool-inventory \+ safety\/recovery guidance, tools\/list inventory name \/ annotation coverage, row-label guidance summary, strict closest-value \/ unknown-tool repair summary, strict add_relation type-preflight \+ no-write metadata 를 fixture 로 검증/);
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
    assert.match(doc, /단일 unknown-field row 의\s+`receivedField` \+ 1-row `unknownFields` repair 안내/);
    assert.match(doc, /multi unknown-field row 의 모든\s+offending field \/ `allowedFields` \/ `receivedFields` \/ `Received fields: \.\.\.` 안내/);
    assert.match(doc, /`add_relations` type typo 의 structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
    assert.match(doc, /`add_concepts` duplicate slug\s+first-seen 안내/);
    assert.match(doc, /write row labels: pass/);
    assert.match(doc, /single\/multi-field 복구 안내가 살아 있는지 확인/);
    assert.match(doc, /schema gate 도 같은 summary helper 를 공유/);
    assert.match(doc, /strict arguments \+ annotations \+ graph-query enums \+ graph kind enums\/descriptions \+ write relation enums\s+\+ health tuning \+ post-write maintenance schema/);
    assert.match(doc, /batch repair 안내도\s+같은 gate 에 포함/);
    assert.match(doc, /strict enum \/ maintenance filter \/ relation filter \/ graph kind filter \/ sort \/ type smoke/);
    assert.match(doc, /`structuredContent\.valueName`, `receivedValue`, `suggestion`, `allowedValues`/);
    assert.match(doc, /`allowedValues` 는\s+일부 대표값이 아니라 해당 입력의 전체 enum 순서와 정확히 일치/);
    assert.match(doc, /설치 verify 의 strict unknown-tool \/ multi-argument smoke 도 전체 `allowedTools` \/ `allowedArguments` 를\s+정확히 비교/);
    assert.match(doc, /JSON-RPC integration test 도 unknown tool 의 전체 `allowedTools` 와 invalid enum \/ filter repair 의\s+전체 `allowedValues` 를 직접 비교/);
    assert.match(doc, /dogfood fixture 도 strict enum \/ unknown-tool repair summary 에 전체 operation enum 과 23-tool inventory 를 사용/);
    assert.match(doc, /`concepts\[n\] duplicate slug in input batch; first seen at concepts\[m\]`/);
    assert.match(doc, /strict relation filter \/ `relation_check` row/);
    assert.match(doc, /`dependencyTypes items depend_on->depends_on; allowed 9`/);
    assert.match(doc, /`relation_check` 의 `type depend_on->depends_on; allowed 9`/);
    assert.match(doc, /single-writer `add_relation` 의 `type depend_on->depends_on; allowed 8`/);
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
    assert.match(doc, /모든 offending field 와 nearest field hint/);
    assert.match(doc, /모든 offending field \/ nearest field hint/);
    assert.match(doc, /`Received fields: \.\.\.`/);
    assert.match(doc, /`add_concepts` \/ `add_relations` 는 non-object row 와 unknown row fields, invalid relation type row 를 넣어\s+top-level tool error 가 아니라 row-level `ok:false` 로 격리되는지 설치 검증에서\s+실제 호출로 확인/);
    assert.match(doc, /unknown-field row 에 모든 offending field \/ nearest field hint \/\s+`Received fields: \.\.\.` 가 남는지, 단일 unknown-field row 에 `receivedField` 와 1-row\s+`unknownFields` repair payload 가 남는지/);
    assert.match(doc, /relation type row 에 closest-value hint 가 남는지와\s+invalid-only smoke 에 `postWriteMaintenance` 가 없는지도 확인/);
    assert.match(doc, /`get_concepts` \/ `add_concepts` \/\s+`add_relations` 51-row batch 도 실제 호출해 `invalid_arguments` 로 거절되는지 확인/);
    assert.match(doc, /성공 로그도 `single\/multi unknown-field repair` 를 그대로 드러내/);
    assert.match(doc, /row-level repair 의\s+`rowName` \/ `receivedField` \/ `unknownFields` \/ `allowedFields` \/ `receivedFields` \/ `firstSeenAt` 안내와 batch repair 안내/);
    assert.match(doc, /`dogfood:walk` 도 같은 invalid-only `add_concepts` \/ `add_relations` row-repair smoke 를\s+실제 stdio 호출로 실행/);
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
    assert.match(dogfoodSection, /strict unknown-tool, unknown-argument, and invalid-enum rejection smoke/);
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
    assert.match(verifySection, /실제 `neighbors` \/[\s\S]*node→project `path` \/ bounded `all_paths` \/ `project_scope`/);
    assert.match(readFileSync('mcp/scripts/verify.mjs', 'utf-8'), /neighbors\/node-to-project path\/all_paths\/project_scope/);
    assert.match(verifySection, /project probe 덕분에 `project_scope` 는 project\s+노드가 있을 때 containment hard gate/);
    assert.match(verifySection, /project-node `list_concepts` probe/);
    assert.match(verifySection, /project probe 덕분에 `project_scope`/);
    assert.match(verifySection, /빈 vault 는 node-targeted graph\s+smoke 를 skip/);
    assert.match(verifySection, /strict schema\/runtime unknown-tool, unknown-argument, and invalid-enum rejection/);
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
    assert.match(smoke, /pnpm --filter .*mcp verify -- \\\[vault\\\] \\\[--timeout-ms N\\\]/);
    assert.match(smoke, /pnpm --filter .*mcp verify -- --help/);
    assert.match(smoke, /Run npm run verify from the mcp\\\/ package directory/);
    assert.match(smoke, /from the repo root, use node mcp\\\/scripts\\\/verify\\\.mjs or pnpm --filter .*mcp verify --/);
    assert.match(smoke, /Explicit \\\[vault\\\] or --vault arguments take precedence over OMOT_VAULT/);
    assert.match(smoke, /pnpm test:mcp:verify\\s\+MCP verify helper contract without the full integration suite/);
    assert.match(smoke, /pnpm test:mcp:verify:first-contact\\s\+Narrow first-contact initialize-tool-inventory\\\/initialize-safety-recovery\\\/unknown-tool\\\/write-safety\\\/health-summary\\\/advisory\\\/read\\\/sample-shape helper gates/);
    assert.match(smoke, /pnpm test:mcp:maintenance\\s\+Narrow maintenance_plan filter\\\/cursor\\\/resume\\\/work-queue formatter gates/);
    assert.match(smoke, /pnpm test:mcp:verify:timeout/);
    assert.match(smoke, /Narrow MCP verify timeout\\\/startup\\\/help\\\/empty-vault diagnostics/);
    assert.match(smoke, /pnpm test:dogfood:args\\s\+Narrow dogfood shortcut argument helper contract/);
    assert.match(smoke, /pnpm test:dogfood:script-refs\\s\+Narrow help\\\/package-script reference \\\+ focused filter parser\\\/wrapper summary contract/);
    assert.match(smoke, /pnpm test:mcp:registration\\s\+Narrow source-checkout .mcp.json\\\/.mcp.json.example\\\/.codex\\\/config.toml registration template contract/);
    assert.match(smoke, /pnpm dogfood:compile\\s\+Cheap root checkout compile_ontology summary snapshot/);
    assert.match(smoke, /pnpm dogfood:compile-fix\\s\+Cheap root checkout compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with \\\[dogfood:compile-fix\\\] docs\\\/ontology unchanged/);
    assert.match(smoke, /pnpm test:dogfood:compile-fix\\s\+Narrow dogfood compile --fix idempotence runner contract/);
    assert.match(smoke, /pnpm dogfood:health\\s\+Cheap root checkout health gate/);
    assert.match(smoke, /pnpm dogfood:brief\\s\+Cheap root checkout workspace_brief snapshot/);
    assert.match(smoke, /pnpm dogfood:growth\\s\+Cheap root checkout growth_plan snapshot/);
    assert.match(smoke, /pnpm dogfood:maintenance\\s\+Cheap root checkout maintenance_plan snapshot/);
    assert.match(smoke, /pnpm dogfood:status\\s\+Cheap root checkout health \\\+ workspace-brief \\\+ agent-brief \\\+ maintenance preflight with focused hints before full verify/);
    assert.match(smoke, /pnpm test:dogfood:status\\s\+Narrow dogfood status shortcut runner contract/);
    assert.match(smoke, /pnpm dogfood:verify\\s\+Root checkout dogfood vault installed-style verify gate/);
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
    assert.match(smoke, /missingDirectMcpVerifyVaultPath/);
    assert.match(smoke, /vault path does not exist: docs\\\/ontology/);
    assert.match(smoke, /use `\\\.\\\.\\\/docs\\\/ontology` for the dogfood vault/);
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
    assert.match(smoke, /add_concepts — non-object, single\\\/multi unknown-field repair, Received fields, duplicate-slug rows isolated with input indexes, and invalid-only batches return no write metadata/);
    assert.match(smoke, /add_relations — non-object, single\\\/multi unknown-field repair, Received fields, invalid-type rows isolated with input indexes and closest-value hints, and invalid-only batches return no write metadata/);
    assert.match(smoke, /batch caps — get_concepts\\\/add_concepts\\\/add_relations reject 51 rows with invalid_arguments/);
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
    assert.match(smoke, /neighbors\\\/node-to-project path\\\/all_paths\\\/project_scope graph-query smoke/);
    assert.match(smoke, /strict arguments — unknown tool argument rejected at runtime/);
    assert.match(smoke, /unknown-argument/);
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
    assert.match(smoke, /pnpm test:cli:mcp-call\\s\+CLI MCP wrapper parser\\\/spawn\\\/structuredContent contract checks/);
    assert.match(smoke, /pnpm integration:cli:mcp-verify/);
    assert.match(smoke, /pnpm dogfood:compile\\s\+Root checkout dogfood vault compile_ontology summary/);
    assert.match(smoke, /pnpm dogfood:compile-fix\\s\+Root checkout dogfood vault compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with \\\[dogfood:compile-fix\\\] docs\\\/ontology unchanged/);
    assert.match(smoke, /pnpm test:dogfood:script-refs\\s\+Narrow help\\\/package-script reference \\\+ focused filter parser\\\/wrapper summary contract/);
    assert.match(smoke, /pnpm test:dogfood:compile-fix\\s\+Narrow dogfood compile --fix idempotence runner contract/);
    assert.match(smoke, /pnpm test:mcp:registration\\s\+Narrow source-checkout .mcp.json\\\/.mcp.json.example\\\/.codex\\\/config.toml registration template contract/);
    assert.match(smoke, /pnpm dogfood:health\\s\+Root checkout dogfood vault health gate/);
    assert.match(smoke, /pnpm dogfood:brief\\s\+Root checkout dogfood vault workspace_brief snapshot/);
    assert.match(smoke, /pnpm dogfood:growth\\s\+Root checkout dogfood vault growth_plan JSON snapshot/);
    assert.match(smoke, /pnpm dogfood:maintenance\\s\+Root checkout dogfood vault maintenance_plan JSON snapshot/);
    assert.match(smoke, /pnpm dogfood:status\\s\+Root checkout dogfood vault human-readable health \\\+ brief \\\+ agent handoff \\\+ maintenance; ends with \\\[dogfood:status\\\] health:N · workspace-brief:N · agent-brief:N · maintenance:N and focused hints before pnpm dogfood:verify on failure/);
    assert.match(smoke, /pnpm test:dogfood:status\\s\+Narrow dogfood status shortcut runner contract/);
    assert.match(smoke, /pnpm dogfood:verify\\s\+Root checkout dogfood vault verify shortcut/);
    assert.match(smoke, /pnpm cli:mcp-verify docs\\\/ontology --timeout-ms 15000\\s\+Source-checkout dogfood verify with explicit args/);
    assert.match(smoke, /pnpm cli:mcp-verify -- --help\\s\+Source-checkout shortcut for this help from the repo root/);
    assert.match(smoke, /Installed CLI mcp-verify wrapper flow\\\/help\\\/failure checks/);
    assert.match(smoke, /pnpm test:mcp:verify\\s\+MCP verify helper contract without the full integration suite/);
    assert.match(smoke, /pnpm test:mcp:verify:first-contact\\s\+Narrow first-contact initialize-tool-inventory\\\/initialize-safety-recovery\\\/unknown-tool\\\/write-safety\\\/health-summary\\\/advisory\\\/read\\\/sample-shape helper gates/);
    assert.match(smoke, /pnpm test:mcp:verify:timeout/);
    assert.match(smoke, /Narrow MCP verify timeout\\\/startup\\\/help\\\/empty-vault diagnostics/);
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
    assert.match(smoke, /verify vault has 0 ontology nodes/);
    assert.match(smoke, /Point verify at a populated ontology vault/);
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
    const overviewRow = doc.split('| `oh-my-ontology overview [vault]` |')[1]?.split('\n')[0] ?? '';
    const hubsRow = doc.split('| `oh-my-ontology hubs [vault]` |')[1]?.split('\n')[0] ?? '';
    const blastRadiusRow = doc.split('| `oh-my-ontology blast-radius <slug>` |')[1]?.split('\n')[0] ?? '';
    const nodeRow = doc.split('| `oh-my-ontology node <slug>` |')[1]?.split('\n')[0] ?? '';
    const similarRow = doc.split('| `oh-my-ontology similar "<query>"` |')[1]?.split('\n')[0] ?? '';
    const matchNodesRow = doc.split('| `oh-my-ontology match-nodes [vault]` |')[1]?.split('\n')[0] ?? '';
    const matchEdgesRow = doc.split('| `oh-my-ontology match-edges [vault]` |')[1]?.split('\n')[0] ?? '';
    const domainMatrixRow = doc.split('| `oh-my-ontology domain-matrix [vault]` |')[1]?.split('\n')[0] ?? '';
    const facetsRow = doc.split('| `oh-my-ontology facets [vault]` |')[1]?.split('\n')[0] ?? '';
    const schemaRow = doc.split('| `oh-my-ontology schema` |')[1]?.split('\n')[0] ?? '';
    const patternWalkRow = doc.split('| `oh-my-ontology pattern-walk <slug>` |')[1]?.split('\n')[0] ?? '';
    const projectMapRow = doc.split('| `oh-my-ontology project-map <project>` |')[1]?.split('\n')[0] ?? '';
    const agentSetupRow = doc.split('| `oh-my-ontology agent-setup [vault]` |')[1]?.split('\n')[0] ?? '';
    const reachabilityRow = doc.split('| `oh-my-ontology reachability <slug>` |')[1]?.split('\n')[0] ?? '';
    const pathRow = doc.split('| `oh-my-ontology path <from> <to>` |')[1]?.split('\n')[0] ?? '';
    const allPathsRow = doc.split('| `oh-my-ontology all-paths <from> <to>` |')[1]?.split('\n')[0] ?? '';
    const relationCheckRow = doc.split('| `oh-my-ontology relation-check <from> <to> <type>` |')[1]?.split('\n')[0] ?? '';
    const growthRow = doc.split('| `oh-my-ontology growth` |')[1]?.split('\n')[0] ?? '';
    const cyclesRow = doc.split('| `oh-my-ontology cycles` |')[1]?.split('\n')[0] ?? '';
    const componentsRow = doc.split('| `oh-my-ontology components` |')[1]?.split('\n')[0] ?? '';
    const topologicalOrderRow = doc.split('| `oh-my-ontology topological-order` |')[1]?.split('\n')[0] ?? '';

    assert.match(doc, /CLI Developer Entry \(43 commands/);
    assert.match(doc, /총 43 명령/);
    assert.match(doc, /cli\/src\/commands\/growth\.mjs/);
    assert.match(doc, /cli\/src\/commands\/agent-setup\.mjs/);
    assert.match(doc, /cli\/src\/commands\/maintenance\.mjs/);
    assert.match(doc, /cli\/src\/commands\/all-paths\.mjs/);
    assert.match(doc, /cli\/src\/commands\/match-nodes\.mjs/);
    assert.match(doc, /cli\/src\/commands\/match-edges\.mjs/);
    assert.match(doc, /cli\/src\/commands\/domain-matrix\.mjs/);
    assert.match(doc, /cli\/src\/commands\/facets\.mjs/);
    assert.match(doc, /cli\/src\/commands\/schema\.mjs/);
    assert.match(doc, /cli\/src\/commands\/pattern-walk\.mjs/);
    assert.match(doc, /cli\/src\/commands\/project-map\.mjs/);
    assert.match(doc, /cli\/src\/commands\/components\.mjs/);
    assert.match(doc, /cli\/src\/commands\/topological-order\.mjs/);
    assert.match(doc, /cli\/src\/commands\/reachability\.mjs/);
    assert.match(doc, /cli\/src\/commands\/relation-check\.mjs/);
    assert.match(maintenanceRow, /MCP `query_ontology\(maintenance_plan\)`/);
    assert.match(maintenanceRow, /cursor miss 는 빈 page 와 `cursor\.found=false`/);
    assert.match(maintenanceRow, /phase\/severity\/kind bucket summary/);
    assert.match(maintenanceRow, /filter echo 배열/);
    assert.match(maintenanceRow, /pagination `limited`/);
    assert.match(maintenanceRow, /`compiledSummary`/);
    assert.match(maintenanceRow, /malformed 인 work-queue payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(overviewRow, /graph \/ count bucket \/ hub row shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(hubsRow, /ranking row shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(blastRadiusRow, /summary count \/ affected node page \/ edge page shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(nodeRow, /`--types A,B` 로 relation group 을 먼저 좁힌 뒤 `--limit N` 으로 hotspot 노드의 incoming\/outgoing edge, lineage, containment rows 를 1\.\.500 범위에서 조절/);
    assert.match(nodeRow, /`--no-external` \/ `--no-unresolved` 로 외부 파일 ref 나 dangling ref 를 edge 목록에서 숨긴다/);
    assert.match(nodeRow, /use --limit N for more/);
    assert.match(nodeRow, /node summary \/ degree \/ edge group \/ lineage page shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(similarRow, /match node \/ score \/ signal \/ shared-neighbor shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(matchNodesRow, /MCP `query_ontology\(match_nodes\)`/);
    assert.match(matchNodesRow, /`--plan` 은 `query_plan\(match_nodes\)`/);
    assert.match(matchNodesRow, /`estimate\.totalMatches`/);
    assert.match(matchNodesRow, /malformed node row shape 은 JSON 또는 human output 전 exit 2/);
    assert.match(matchEdgesRow, /MCP `query_ontology\(match_edges\)`/);
    assert.match(matchEdgesRow, /`--to-kind` 는 real node kind 외 `external` \/ `unresolved`/);
    assert.match(matchEdgesRow, /`estimate\.totalMatches`/);
    assert.match(matchEdgesRow, /malformed edge row shape 은 JSON 또는 human output 전 exit 2/);
    assert.match(domainMatrixRow, /MCP `query_ontology\(domain_matrix\)`/);
    assert.match(domainMatrixRow, /coupling audit playbook/);
    assert.match(domainMatrixRow, /connection별 relation bucket/);
    assert.match(domainMatrixRow, /malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(facetsRow, /MCP `query_ontology\(facets\)`/);
    assert.match(facetsRow, /kind\/domain\/degree bucket/);
    assert.match(facetsRow, /malformed graph bucket \/ top node \/ pattern payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(schemaRow, /MCP `query_ontology\(schema\)`/);
    assert.match(schemaRow, /from-kind \/ relation \/ to-kind/);
    assert.match(schemaRow, /malformed schema pattern payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(patternWalkRow, /MCP `query_ontology\(pattern_walk\)`/);
    assert.match(patternWalkRow, /`--pattern domains,capabilities`/);
    assert.match(patternWalkRow, /malformed pattern_walk payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(projectMapRow, /MCP `query_ontology\(project_map\)`/);
    assert.match(projectMapRow, /domain-by-domain/);
    assert.match(projectMapRow, /malformed project_map payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(agentSetupRow, /기존 vault 에 starter markdown 을 추가하지 않고/);
    assert.match(agentSetupRow, /`--write` 는 누락 파일만 생성/);
    assert.match(agentSetupRow, /`operation:"agent_setup"`/);
    assert.match(agentSetupRow, /`docs\.modeComparison`/);
    assert.match(agentSetupRow, /CLI-only \/ MCP-connected \/ Graph DB pack \/ setup gate/);
    assert.match(agentSetupRow, /`docs\.postChangeSync`/);
    assert.match(agentSetupRow, /global `codex mcp add/);
    assert.match(reachabilityRow, /MCP `query_ontology\(reachability\)`/);
    assert.match(reachabilityRow, /`--direction incoming\|outgoing\|both`/);
    assert.match(reachabilityRow, /`--plan` 은 `query_plan\(reachability\)`/);
    assert.match(reachabilityRow, /malformed layer \/ path \/ edge shape 은 JSON 또는 human output 전 exit 2/);
    assert.match(pathRow, /hop \/ edge alignment 가 malformed 인 `find_path` payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(allPathsRow, /MCP `query_ontology\(all_paths\)`/);
    assert.match(allPathsRow, /`limit` \/ `searchBudget` \/ `expandedStates` \/ `exhaustive` \/ `truncatedByBudget` \/ `totalPathsExact` \/ `evidence\.pathsComplete`/);
    assert.match(allPathsRow, /`--plan` 은 먼저 `query_plan\(all_paths\)` 를 실행/);
    assert.match(allPathsRow, /고비용 또는 warning plan 은 `--force` 없이는 enumeration 을 건너뛰어 performance guard/);
    assert.match(allPathsRow, /partial traversal 을 확정 근거로 오인하지 않게 한다/);
    assert.match(allPathsRow, /malformed query_plan advice \/ path row \/ evidence completeness shape 은 JSON 또는 human output 전 exit 2/);
    assert.match(relationCheckRow, /MCP `query_ontology\(relation_check\)`/);
    assert.match(relationCheckRow, /`proposedAction: \{ tool: "add_relation", args \}`/);
    assert.match(relationCheckRow, /`recommendation` \/ `matchingEdges` \/ `inverseEdges` \/ `schemaPattern` \/ `nearbyPatterns` \/ `proposedAction` shape 이 malformed 인 payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(growthRow, /MCP `query_ontology\(growth_plan\)`/);
    assert.match(growthRow, /relation recommendation \/ external element ref \/ dangling reference \/ unassigned node \/ empty domain \/ ignored external ref count/);
    assert.match(growthRow, /proposed tool call/);
    assert.match(growthRow, /`totalActions` 는 실행 가능한 relation\/external\/dangling 후보만 합산/);
    assert.match(growthRow, /kind-specific proposedAction endpoint\/slug\/kind 의미/);
    assert.match(growthRow, /malformed 인 growth payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(cyclesRow, /malformed cycle row 는 JSON 또는 human output 전 exit 2/);
    assert.match(componentsRow, /MCP `query_ontology\(components\)`/);
    assert.match(componentsRow, /`health --json` 의 내부 payload 를 파싱하지 않고/);
    assert.match(componentsRow, /malformed component payload 는 JSON 또는 human output 전 exit 2/);
    assert.match(topologicalOrderRow, /MCP `query_ontology\(topological_order\)`/);
    assert.match(topologicalOrderRow, /cycle 로 전체 order 가 막히면 exit 1/);
    assert.match(topologicalOrderRow, /malformed order \/ blocked payload 는 JSON 또는 human output 전 exit 2/);
    assert.doesNotMatch(regressionSection, /\*\*\d+ spawn-based\*\* integration test/);
    assert.match(doc, /`cli\/src\/lib\/mcp-call\.mjs` 의 thin wrapper/);
    assert.match(doc, /MCP `structuredContent` 를 먼저 사용하되/);
    assert.match(doc, /text JSON 과 `structuredContent` 가 둘 다 있으면 구조적으로 비교/);
    assert.match(doc, /mismatch 를 실패로 처리/);
    assert.match(doc, /JSON-RPC 응답은 child `close` 이벤트에서 stdio drain 이후 파싱/);
    assert.match(doc, /signal 종료는 missing-response fallback 이 아니라 `mcp terminated by SIGTERM` 같은 signal context/);
    assert.match(doc, /성공 응답은 text 없이 `structuredContent` 만 있어도 수용/);
    assert.match(doc, /`structuredContent` 가 없는 경우에만 text JSON 으로 fallback/);
    assert.match(doc, /delegated verify script 가 wrapper timeout 전 signal 로 종료되면 silent exit 1 이 아니라 `MCP verify script terminated by SIGTERM`/);
    assert.match(doc, /cli\/src\/lib\/mcp-call\.test\.mjs/);
    assert.match(regressionSection, /`pnpm test:cli:lib`/);
    assert.match(regressionSection, /`pnpm test:cli:args`/);
    assert.match(regressionSection, /narrow CLI argument parser contract/);
    assert.match(regressionSection, /CLI argument parsing 만 바꿀 때는 `pnpm test:cli:lib` 전체보다 이 gate/);
    assert.match(regressionSection, /`pnpm test:mcp:maintenance`/);
    assert.match(regressionSection, /`pnpm integration:cli:growth`/);
    assert.match(regressionSection, /`pnpm integration:cli:maintenance`/);
    assert.match(regressionSection, /`pnpm dogfood:growth`/);
    assert.match(regressionSection, /`pnpm dogfood:maintenance`/);
    assert.match(regressionSection, /focused CLI shared helper unit contracts/);
    assert.match(regressionSection, /focused MCP maintenance queue contract/);
    assert.match(regressionSection, /CLI maintenance command 와 maintenance 관련 installed verify subset/);
    assert.match(regressionSection, /full verify \/ dogfood suite 를 돌리지 않아도 된다/);
    assert.match(regressionSection, /`pnpm package:check` 도 이 gate 를 포함/);
    assert.match(regressionSection, /`cli\/src\/lib\/cli-args\.test\.mjs`/);
    assert.match(regressionSection, /`cli\/src\/lib\/repo-analysis-results\.test\.mjs`/);
    assert.match(regressionSection, /`analyze_repo_structure` top-level \/ 후보 배열 \/ evidence \/ skipped shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/import-analysis-results\.test\.mjs`/);
    assert.match(regressionSection, /`infer_imports` top-level `rootPath` \/ import graph \/ unresolved `reason` enum \/ `moduleEdges` shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/batch-results\.test\.mjs`/);
    assert.match(regressionSection, /batch writer 응답 row count \/ row shape \/ top-level `postWriteMaintenance` shape fail-closed 계약/);
    assert.match(regressionSection, /`cli\/src\/lib\/cli-commands\.test\.mjs`/);
    assert.match(regressionSection, /command registry \/ package description command count/);
    assert.match(regressionSection, /MCP `structuredContent` 와 text JSON parity/);
    assert.match(regressionSection, /spawn-based integration suite/);
    assert.match(regressionSection, /pnpm exec node --test --test-name-pattern/);
    assert.match(regressionSection, /pnpm integration:cli -- --test-name-pattern/);
    assert.match(regressionSection, /`pnpm integration:cli:mcp-verify`/);
    assert.match(regressionSection, /direct read smoke set\(`get_concept` \/ `get_concepts` \/ `find_evidence`/);
    assert.match(regressionSection, /limited `query_concepts` \/ `analyze_repo_structure` \/ `infer_imports` \/ `find_neighbors`/);
    assert.match(regressionSection, /`pnpm test:mcp:docs` 는 bare `README` token 이 아니라/);
    assert.match(regressionSection, /명시적 test-name fragments 만 나열/);
    assert.match(regressionSection, /`pnpm test:mcp:registration` 은 tracked `.mcp.json` \/ `.mcp.json.example` \/ `.codex\/config.toml` source-checkout template 만 좁게 검증/);
    assert.match(regressionSection, /`--test-concurrency 1` 또는 `--test-timeout 1000` 같은 Node test option value 를 target 으로 오인하지 않고, split option 값이 빠져도 다음 option value 를 target 으로 새지 않게 한다/);
    assert.match(
      doc,
      /`canonicalizationActions` 배열이 빠졌거나 `canonicalizationActionCount` 가 non-negative integer 가 아니거나 배열 길이와 갈라지거나 action row shape 이 malformed 인 compile 응답은 안전한 재정렬이 불가능하므로 patch 전 exit 2 로 실패/,
    );
    assert.match(
      doc,
      /action `frontmatter` 가 compiler relation-array key 밖의 필드를 patch 하려 하거나 `keys` 와 patch key 가 어긋나도 쓰기 전 실패/,
    );
    assert.match(regressionSection, /compile `--fix` canonicalization 경로/);
    assert.match(regressionSection, /patch 전 exit 2 실패/);
    assert.match(regressionSection, /paginated `compile_ontology` full-artifact smoke/);
    assert.match(regressionSection, /`mcp-verify --help` graph-query smoke \/ direct read smoke set\(`get_concept`, `get_concepts`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path` 포함\) \/ tools\/list inventory name \/ schema strictness \/ annotation coverage \/ strict argument\/enum smoke \/ relation filter \/ `relation_check` closest-value rejection \/ batch writer row-isolation smoke \/ destructive dry-run smoke/);
    assert.match(regressionSection, /root source-checkout shortcut `pnpm dogfood:compile`/);
    assert.match(regressionSection, /`compile --summary --json` compiler snapshot/);
    assert.match(regressionSection, /`pnpm dogfood:compile-fix` 는 docs\/ontology 에 `compile --fix` 를 실행한 뒤 canonicalization 이 git diff 를 남기면 실패하고 `pnpm docs-vault:build` 후 재실행하라는 recovery 를 보여주며 성공 시 `\[dogfood:compile-fix\] docs\/ontology unchanged` 요약으로 끝나며/);
    assert.match(regressionSection, /`pnpm dogfood:health` 는 docs\/ontology 의 `health --json` fail-closed health gate/);
    assert.match(regressionSection, /`pnpm dogfood:brief` 는 docs\/ontology 의 `workspace-brief --json` first-contact snapshot/);
    assert.match(regressionSection, /`pnpm dogfood:maintenance` 는 docs\/ontology 의 `maintenance --json` queue snapshot/);
    assert.match(regressionSection, /`pnpm dogfood:status` 는 health 가 non-zero 여도 workspace-brief 와 agent-brief 와 maintenance queue 를 계속 실행한 뒤 첫 실패 exit code 를 보존/);
    assert.match(regressionSection, /\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N/);
    assert.match(regressionSection, /`pnpm dogfood:status` 실패 출력은 `\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N` child status 요약 뒤에 실패 child 별 focused follow-up \(`pnpm dogfood:health` \/ `pnpm dogfood:brief` \/ `pnpm dogfood:agent` \/ `pnpm dogfood:maintenance` \+ `pnpm test:mcp:maintenance`\) 을 먼저 붙이고 `pnpm dogfood:verify` follow-up hint/);
    assert.match(regressionSection, /`pnpm dogfood:status -- --help` 도 같은 child→focused gate mapping 을 미리 보여줘/);
    assert.match(regressionSection, /`pnpm cli:mcp-verify -- --help` 의 Focused checks 도 `pnpm test:mcp:registration` row 와 `pnpm dogfood:status` row 를 표시/);
    assert.match(regressionSection, /registration template 만 바뀐 경우에는 docs gate 전체 대신 template-only gate 를 고르고/);
    assert.match(regressionSection, /status 실패 시에는 focused hint 후 `pnpm dogfood:verify` escalation 경로/);
    assert.match(regressionSection, /`pnpm test:dogfood:status` 는 그 shortcut 계약만 spawn 없이 검증/);
    assert.match(regressionSection, /`workspace-brief --json` first-contact snapshot/);
    assert.match(regressionSection, /`pnpm dogfood:verify` 는 반복 dogfood vault 검증용 full gate/);
    assert.match(regressionSection, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000`/);
    assert.match(regressionSection, /`pnpm cli:mcp-verify -- --help`/);
    assert.match(regressionSection, /Focused checks 에 `pnpm test:cli:args` 를 먼저 보여주/);
    assert.match(regressionSection, /argument parsing 변경 시 더 큰 CLI helper suite 로 바로 뛰지 않게 한다/);
    assert.match(regressionSection, /vault 인자는 추가 `--` 없이 넘기고 help flag 에만 `-- --help`/);
    assert.match(regressionSection, /timeout retry hint 는 `--vault <path>` 를 보존/);
    assert.match(regressionSection, /직접 `npm run verify -- --vault <path>` 경로도 같은 vault-preserving retry 계약/);
    assert.match(regressionSection, /write-tool post-write maintenance schema/);
    assert.match(regressionSection, /maintenance filter enum/);
    assert.match(regressionSection, /ready cursor \/ missing cursor 계약/);
    assert.match(regressionSection, /ready cursor \/ missing cursor scope/);
    assert.match(regressionSection, /focused first-contact sample-shape helper scope/);
  });

  it('keeps dogfood MCP capability docs aligned with focused integration shortcuts', () => {
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');

    assert.match(doc, /Node `--test-name-pattern`/);
    assert.match(doc, /pnpm exec node --test --test-name-pattern/);
    assert.match(doc, /pnpm integration:mcp -- --test-name-pattern/);
    assert.match(doc, /`pnpm integration:mcp:readme`/);
    assert.match(doc, /pattern 없는 wrapper 호출이나 target 없는 wrapper 호출도 exit 2 로 거부/);
    assert.match(doc, /`--test-concurrency 1` 또는 `--test-timeout 1000` 같은 Node test option value 를 target 으로 오인하지 않고, split option 값이 빠져도 다음 option value 를 target 으로 새지 않게 한다/);
    assert.match(doc, /script 가 명시적 pattern 과 target 을 넘기는지도 고정/);
    assert.match(doc, /`pnpm test:mcp:dogfood`/);
    assert.match(doc, /`pnpm test:mcp:dogfood:timeout`/);
    assert.match(doc, /`pnpm test:mcp:maintenance`/);
    assert.match(doc, /`pnpm test:mcp:verify`/);
    assert.match(doc, /`pnpm test:mcp:verify:first-contact`/);
    assert.match(doc, /unknown-tool recovery/);
    assert.match(doc, /CLI `mcp-verify` 문서도 delegated verify output 의 non-blocking advisory/);
    assert.match(doc, /issues\/unresolved\/cycles\/checks health summary/);
    assert.match(doc, /verify timeout \/ usage \/\s+empty-vault fail-fast 진단/);
    assert.match(doc, /`pnpm test:mcp:verify:timeout`/);
    assert.match(doc, /`nextActions\[\]\.sample` 실행 액션 shape/);
    assert.match(doc, /직접 verify help 도 이 focused check 들을 같이 보여줘/);
    assert.match(doc, /`tools\/list inventory names — missing\/extra\/duplicate\/invalid checks passed`/);
    assert.match(doc, /schema \/ annotation 검증에 묻히지 않게 한다/);
    assert.match(doc, /`read census consistency — \.\.\. across list_kinds\/list_concepts\/compile_ontology\/overview`/);
    assert.match(doc, /여러 read surface 가 같은 node census 를 본다는 증거/);
    assert.match(doc, /성공 출력도 read census consistency pass line 을 별도로 보여줘/);
    assert.match(doc, /verify helper 와\s+dogfood gate 의 maintenance 관련 subset 만 실행/);
    assert.match(doc, /`maintenance 2\/2 \(resume skipped: no actions\)`/);
    assert.match(doc, /마지막 줄만 봐도 skip 사유를 확인/);
    assert.match(doc, /`pnpm dogfood:compile` 은 repo root 의 가장 짧은 compiler snapshot/);
    assert.match(doc, /`pnpm dogfood:health` 는 repo root 의 가장 짧은 fail-closed health gate/);
    assert.match(doc, /`pnpm dogfood:brief` 는 repo root 의 가장 짧은 first-contact snapshot/);
    assert.match(doc, /`pnpm dogfood:growth` 는 repo root 의 가장 짧은 growth candidate snapshot/);
    assert.match(doc, /`pnpm dogfood:maintenance` 는 repo root 의 가장 짧은 maintenance queue snapshot/);
    assert.match(doc, /`pnpm dogfood:compile-fix` 는 repo root 의 `compile --fix` idempotence gate 로 canonicalization 이 docs\/ontology diff 를 남기면 실패하고 `pnpm docs-vault:build` 후 재실행하라는 recovery 를 보여주며/);
    assert.match(doc, /`pnpm dogfood:status` 는 health 가 non-zero 여도 workspace-brief 와 agent-brief 와 maintenance queue 까지 출력한 뒤 첫 실패 exit code 를 보존/);
    assert.match(doc, /\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N/);
    assert.match(doc, /`\[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N` 요약, 실패 child 별 focused follow-up \(`pnpm dogfood:health` \/ `pnpm dogfood:brief` \/ `pnpm dogfood:agent` \/ `pnpm dogfood:maintenance` \+ `pnpm test:mcp:maintenance`\), `pnpm dogfood:verify` follow-up hint/);
    assert.match(doc, /`--help` 에서도 child→focused gate mapping 을 미리 보여주고/);
    assert.match(doc, /`--help` 근접 오타는 `Did you mean --help\?` 힌트/);
    assert.match(doc, /full 설치형 검증은 `pnpm dogfood:verify`/);
    assert.match(doc, /`pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000` 로 풀어 쓴다/);
    assert.match(doc, /dogfood helper \/ structuredContent 출력 계약/);
    assert.match(doc, /initialize tool-inventory \+ safety\/recovery guidance gate/);
    assert.match(doc, /tools\/list inventory name \/ annotation coverage/);
    assert.match(doc, /strict `list_concepts\.kind` row/);
    assert.match(doc, /존재하지 않는 tool name 도 `unknown_tool` 로 fail-closed/);
    assert.match(doc, /Did you mean "list_concepts"\?/);
    assert.match(doc, /allowed tool\s+list/);
    assert.match(doc, /`tools\/call\.params\.name`/);
    assert.match(doc, /strict `query_concepts\.kind` \/ `query_concepts\.has-key` row/);
    assert.match(doc, /strict `find_neighbors\.types` row/);
    assert.match(doc, /strict `find_orphans\.kind` \/ `find_orphans\.excludeKinds` row/);
    assert.match(doc, /direct verify help 와 CLI wrapper help 도 이 `list_concepts\.kind` \/ `query_concepts\.kind` \/ `query_concepts\.has-key`/);
    assert.match(doc, /`match_nodes\.sort=outDegre`/);
    assert.match(doc, /`match_edges\.type=depend_on`/);
    assert.match(doc, /`recommend_relations\.kind` \/ `match_edges\.type` \/ `match_edges\.fromKind`/);
    assert.match(doc, /`recommend_relations\.kind=domain`/);
    assert.match(doc, /invalid sort, relation type typo, operation-specific mismatch 를 빈 결과로 삼키지 않는지/);
    assert.match(doc, /typo and unsupported-kind rejection/);
    assert.match(doc, /row-label guidance summary/);
    assert.match(doc, /focused subset, workspace_brief sample-shape gate, maintenance work-queue shape \/ formatter, initialize tool-inventory \+ safety\/recovery guidance, tools\/list inventory name \/ annotation coverage, row-label guidance summary, strict closest-value \/ unknown-tool repair summary, strict add_relation type-preflight \+ no-write metadata 를 fixture 로 검증/);
    assert.match(doc, /전체 helper 회귀가 필요할 때만\s+`pnpm dogfood:test`/);
    assert.match(doc, /strict relation filter/);
    assert.match(doc, /설치형 `pnpm cli:mcp-verify` 성공 로그도 strict `relation_check` \/ `add_relation`/);
    assert.match(doc, /`structuredContent\.valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/);
    assert.match(doc, /no-write metadata gate/);
    assert.match(doc, /`batch no-write metadata 2\/2`/);
    assert.match(doc, /`batch no-write metadata: 2\/2 absent`/);
    assert.match(doc, /MCP initialize first-contact instructions 의 bootstrap 절차도 같은 no-write 기준/);
    assert.match(doc, /dry validation evidence/);
    assert.match(doc, /initialize instruction gate 는 `EXPECTED_TOOLS`/);
    assert.match(doc, /agent-facing tool inventory/);
    assert.match(doc, /`pass \(tool inventory \+ safety\/recovery guidance\)`/);
    assert.match(doc, /`write metadata: absent` \/ `strict_add_relation_write_metadata: absent`/);
    assert.match(doc, /stderr warning filtering/);
    assert.match(doc, /first-contact README read-only/);
    assert.match(doc, /직접 verify help 는\s+`mcp\/` package directory 의 `npm run verify -- --help`, repo root 의\s+`node mcp\/scripts\/verify\.mjs --help`, 또는 root `pnpm --filter \.\/mcp verify -- --help`/);
    assert.match(doc, /root 에서 실제 vault 를 검증할 때는 `pnpm --filter \.\/mcp verify -- \[vault\] \[--timeout-ms N\]`/);
    assert.match(doc, /pnpm separator `--` 는 직접 verify parser 에서 정규화한다/);
    assert.match(doc, /filtered package invocation 은 `mcp\/` package cwd 에서 실행되므로 root dogfood vault 는\s+`\.\.\/docs\/ontology` 로 넘겨야 한다/);
    assert.match(doc, /missing vault path 는 MCP server 시작 전에 실패하고,\s+empty vault 는 `list_concepts` census 직후 실패/);
    assert.match(doc, /downstream read smoke 의 애매한\s+실패로 넘어가지 않는다/);
    assert.match(doc, /직접 verify help\(`mcp\/` 에서 `npm run verify -- --help`, repo root 에서\s+`node mcp\/scripts\/verify\.mjs --help` 또는 `pnpm --filter \.\/mcp verify -- --help`\)/);
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
    assert.match(wrapper, /spawn\(process\.execPath, \[verifyScript\]/);
    assert.doesNotMatch(wrapper, /spawn\('node', \[verifyScript\]/);
    assert.match(wrapper, /MCP verify wrapper timed out after \$\{wrapperTimeoutMs\}ms/);
    assert.match(wrapper, /MCP verify script terminated by \$\{signal\}/);
    assert.match(wrapper, /Check OMOT_MCP_VERIFY_PATH/);
    assert.match(wrapper, /proc\.kill\('SIGTERM'\)/);
    assert.match(wrapper, /proc\.kill\('SIGKILL'\)/);
    assert.match(wrapper, /oh-my-ontology mcp-verify\$\{vaultPart\} --timeout-ms 15000/);
    assert.match(wrapper, /--vault \$\{shellArg\(vaultArg\)\}/);
    assert.doesNotMatch(wrapper, /String\(flags\.timeoutMsRaw \?\? ''\)\.startsWith\('--'\)/);
    assert.match(wrapper, /replaceAll\("'", "'\\\\''"\)/);
    assert.match(verify, /OMOT_VERIFY_RETRY_EXAMPLE/);
    assert.match(verify, /DEFAULT_VERIFY_RETRY_EXAMPLE = 'npm run verify -- --timeout-ms 15000'/);
    assert.match(integration, /passes CLI retry hint to the verify script/);
    assert.match(integration, /times out a stalled verify script override/);
    assert.match(integration, /reports verify script signal exits/);
    assert.match(integration, /OMOT_MCP_VERIFY_PATH: verifyScript/);
    assert.match(integration, /MCP verify wrapper timed out after 50ms/);
    assert.match(integration, /MCP verify script terminated by SIGTERM/);
    assert.match(integration, /retry=\$\{process\.env\.OMOT_VERIFY_RETRY_EXAMPLE\}/);
    assert.match(integration, /oh-my-ontology mcp-verify --vault '.\+vault with space' --timeout-ms 15000/);
    assert.match(integration, /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);
    assert.match(integration, /--timeout-ms', '--vault', 'ontology'/);
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
