#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
} from '../mcp/src/ontology-engine.mjs';
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

function markdownEnumList(values) {
  return values.map((value) => `\`${value}\``).join(' / ');
}

function normalizedMarkdownIncludes(markdown, expected) {
  return markdown.replace(/\s+/g, ' ').includes(expected);
}

describe('package contract helpers', () => {
  it('keeps filtered integration scripts discoverable from the root README', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const readme = readFileSync('README.md', 'utf-8');

    assert.equal(pkg.scripts?.['integration:cli'], 'node --test cli/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:cli:mcp-verify'],
      'node --test --test-name-pattern "mcp-verify" cli/src/integration.test.mjs',
    );
    assert.equal(pkg.scripts?.['integration:mcp'], 'node --test mcp/src/integration.test.mjs');
    assert.equal(
      pkg.scripts?.['integration:mcp:readme'],
      'node --test --test-name-pattern "README first exploration" mcp/src/integration.test.mjs',
    );
    assert.match(pkg.scripts?.['test:mcp:package'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /check-package-contracts\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/suggestions\.test\.mjs/);
    assert.match(pkg.scripts?.['test:mcp:suggestions'] ?? '', /mcp\/src\/ontology-engine\.test\.mjs/);
    assert.equal(pkg.scripts?.['test:mcp:verify'], 'node --test mcp/src/verify-script.test.mjs');
    assert.match(
      pkg.scripts?.['test:mcp:docs'] ?? '',
      /^node --test --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.match(pkg.scripts?.['test:mcp:docs'] ?? '', /dogfood MCP docs/);
    assert.match(
      pkg.scripts?.['test:mcp:package'] ?? '',
      /^node --test --test-name-pattern "[^"]+" scripts\/check-package-contracts\.test\.mjs$/,
    );
    assert.match(
      pkg.scripts?.['test:mcp:suggestions'] ?? '',
      /^node --test --test-name-pattern "[^"]+" mcp\/src\/suggestions\.test\.mjs mcp\/src\/ontology-engine\.test\.mjs$/,
    );
    assert.match(readme, /pnpm test:mcp:docs/);
    assert.match(readme, /pnpm test:mcp:package/);
    assert.match(readme, /pnpm test:mcp:suggestions/);
    assert.match(readme, /pnpm test:mcp:verify/);
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="mcp-verify" pnpm integration:cli/);
    assert.match(readme, /pnpm integration:cli:mcp-verify/);
    assert.match(readme, /OMOT_TEST_NAME_PATTERN="tools\/list\|initialize" pnpm integration:mcp/);
    assert.match(readme, /pnpm integration:mcp:readme/);
    assert.match(readme, /pnpm exec node --test --test-name-pattern "README first exploration" mcp\/src\/integration\.test\.mjs/);
    assert.match(readme, /custom runners also honor Node's `--test-name-pattern`/);
    assert.match(readme, /integration:cli:mcp-verify/);
    assert.match(readme, /integration:mcp:readme/);
    assert.match(readme, /runs `workspace_brief`, tuned `workspace_brief`, `health`, and tuned `health`/);
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

    assert.match(row, /`health` \/ `workspace_brief` can tune their internal probes/);
    assert.match(row, /`phases`, `severities`, and `kinds` are enum-validated/);
    assert.match(row, /ready pages with `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(row, /cursor miss `reason`/);
    assert.match(row, /current-page `nextExecutableAction` \/ `nextReviewAction`/);
    assert.match(addConceptRow, /`operation:"maintenance_plan"`/);
    assert.match(addConceptRow, /`sideEffect:false`/);
    assert.match(addConceptRow, /`filters`/);
    assert.match(addConceptRow, /`limited`/);
    assert.match(addConceptRow, /next action pointers/);
    assert.match(addConceptRow, /`score`/);
    assert.match(addConceptRow, /executable `proposedAction`/);
    assert.match(featureRow, /explicit `cursor\.reason` metadata/);
    assert.match(featureRow, /current-page `nextExecutableAction`/);
    assert.match(featureRow, /current-page `nextReviewAction`/);
    assert.match(featureRow, /ready pages report `cursor\.found=true` with `cursor\.reason=null`/);
    assert.match(featureRow, /unknown cursors return an empty page with `cursor\.found=false`/);
    assert.match(featureRow, /zero remaining actions, and no next actions/);

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

    assert.match(section, /pnpm integration:mcp:readme/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:suggestions/);
    assert.match(section, /pnpm test:mcp:verify/);
    assert.match(section, /first-contact read-only MCP flow/);
    assert.match(section, /documentation drift/);
    assert.match(section, /verify helper contract/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /Node `--test-name-pattern`/);
  });

  it('keeps the MCP verify README aligned with first-contact census gates', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const verifySection = readme.split('### One-line verify CLI')[1]?.split('### Manual verification')[0] ?? '';
    const census = dogfoodVaultCensus(process.cwd());
    const kindSummary = [
      `capability:${census.byKind.capabilities}`,
      `domain:${census.byKind.domains}`,
      `element:${census.byKind.elements}`,
      `project:${census.byKind.project}`,
      `vault-readme:${census.byKind['vault-readme']}`,
    ].join(', ');
    const scopedNodes = census.total - census.byKind['vault-readme'];

    assert.match(verifySection, /npm run verify -- \.\.\/docs\/ontology/);
    assert.match(verifySection, /npm run verify -- --vault \.\.\/docs\/ontology/);
    assert.match(verifySection, /npm run verify -- \.\.\/docs\/ontology --timeout-ms 15000/);
    assert.match(verifySection, /npm run verify -- --help/);
    assert.match(verifySection, /explicit positional vault or `--vault` argument takes\s+precedence over `OMOT_VAULT`/);
    assert.match(verifySection, /`npm run verify -- --help` prints the same first-contact scope/);
    assert.match(verifySection, /strict unknown-argument \/ invalid-enum rejection/);
    assert.match(verifySection, /maintenance_plan cursor handling \(ready page \+\s+missing `afterActionId`\)/);
    assert.match(verifySection, /ready page must keep `cursor\.found=true`,\s+`cursor\.reason=null`/);
    assert.match(verifySection, /missing cursor still reports `cursor\.found=false`,\s+reason, empty page/);
    assert.match(verifySection, /`nextExecutableAction` \/\s+`nextReviewAction` point only at the first executable\/review action in the\s+current returned page/);
    assert.match(verifySection, /list_concepts\/project probe\/get_concepts\/find_orphans\/list_kinds/);
    assert.match(verifySection, /✓ initialize instructions — first-contact safety guidance present/);
    assert.match(verifySection, /✓ tools\/list schema contract — strict arguments \+ graph-query enums \+ health tuning \+ post-write guidance/);
    assert.match(verifySection, /✓ strict arguments — unknown tool argument rejected at runtime/);
    assert.match(verifySection, /✓ strict enums — invalid query operation rejected with closest-value hint/);
    assert.match(verifySection, /✓ maintenance cursor — missing afterActionId reported/);
    assert.match(verifySection, /✓ maintenance cursor — ready page stable/);
    assert.match(verifySection, /✓ get_concepts — 2 ok rows, 1 partial row/);
    assert.match(verifySection, /✓ find_orphans — 0 orphans \(root\/sentinel defaults excluded\)/);
    assert.match(verifySection, /✓ project probe — 1 project node/);
    assert.match(verifySection, new RegExp(`✓ list_concepts — vault total ${census.total} nodes`));
    assert.match(verifySection, new RegExp(`✓ list_kinds — ${census.total} nodes \\(${kindSummary}\\)`));
    assert.match(verifySection, new RegExp(`✓ validate_vault — ${census.files} files, 0 problem files`));
    assert.match(verifySection, new RegExp(`✓ workspace_brief — healthy \\(${census.total} nodes, 0 next actions, 5 health checks\\)`));
    assert.match(verifySection, new RegExp(`✓ workspace_brief_tuned — healthy \\(${census.total} nodes, 1 next action, 5 health checks\\)`));
    assert.match(verifySection, /workspace_brief_tuned advisory nextActions — components:info:6 - The resolved ontology graph has disconnected actionable islands\./);
    assert.match(verifySection, /✓ health — healthy \(5 checks: compile_issues:pass:0/);
    assert.match(verifySection, /✓ health_tuned — healthy \(5 checks: compile_issues:pass:0/);
    assert.match(verifySection, /✓ neighbors — elements\/file-system-access-api/);
    assert.match(verifySection, /✓ path — elements\/file-system-access-api → project \(2 hops, 2 edges\)/);
    assert.doesNotMatch(verifySection, /✓ path — project → project/);
    assert.match(verifySection, new RegExp(`✓ project_scope — project \\(${scopedNodes} nodes, internalEdges`));
    assert.match(verifySection, /`list_concepts`, a project-node `list_concepts` probe,\s+`get_concepts`, `find_orphans`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /batch success rows\s+and partial rows are verified during installation checks/);
    assert.match(verifySection, /`query_ontology\(\{operation:"neighbors"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"path"\}\)`/);
    assert.match(verifySection, /`query_ontology\(\{operation:"project_scope"\}\)`/);
    assert.match(verifySection, /project-node `list_concepts` probe/);
    assert.match(verifySection, /`kind: project`/);
    assert.match(verifySection, /`list_kinds\.byKind\.project`/);
    assert.match(verifySection, /`additionalProperties:false`/);
    assert.match(verifySection, /required `query_ontology\.operation`/);
    assert.match(verifySection, /`query_ontology\.operation` \/[\s\S]*`query_ontology\.targetOperation` enums/);
    assert.match(verifySection, /same 50-row cap used by `get_concepts`, `add_concepts`,\s+and `add_relations`/);
    assert.match(verifySection, /`find_orphans\.excludeKinds` string-array\s+schema and root\/sentinel default description/);
    assert.match(verifySection, /write-safety schemas for\s+`expected_mtime`/);
    assert.match(verifySection, /destructive-tool `confirm` dry-run switches/);
    assert.match(verifySection, /`rename_concept\.overwrite`/);
    assert.match(verifySection, /`delete_concept\.force`/);
    assert.match(verifySection, /`initialize\.instructions` gate fails/);
    assert.match(verifySection, /read-only diagnosis flow/);
    assert.match(verifySection, /`newSlug` \/ `overwrite: true` safety/);
    assert.match(verifySection, /`delete_concept\.force` \/ dangling\s+referrers safety/);
    assert.match(verifySection, /strict-input typo recovery guidance/);
    assert.match(verifySection, /`Did you mean "limit"\?`/);
    assert.match(verifySection, /`Did you mean "overview"\?`/);
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

    assert.match(verifySection, /`list_concepts`, `get_concepts`, `find_orphans`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /success-row \/ partial-row contract drift/);
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
    assert.match(verifySection, /prints the validated `workspace_brief\.health\.checks` count/);
    assert.match(verifySection, /compact advisory list with label\/severity\/count\/message detail/);
    assert.match(verifySection, /health check `id:status:count` coverage/);
    assert.match(verifySection, /accepts direct vault arguments/);
    assert.match(verifySection, /explicit direct arguments take precedence over the environment variable/);
    assert.match(verifySection, /`npm run verify -- --vault \.\.\/vault`/);
    assert.match(verifySection, /supports `--timeout-ms` or `OMOT_VERIFY_TIMEOUT_MS`/);
    assert.match(verifySection, /suggest increasing `--timeout-ms` or `OMOT_VERIFY_TIMEOUT_MS`/);
    assert.match(verifySection, /validates the installed `tools\/list` schema contract/);
    assert.match(verifySection, /`query_ontology\.operation` must stay required/);
    assert.match(verifySection, /graph engine runtime allow-lists/);
    assert.match(verifySection, /batch tools must keep their 50-row caps/);
    assert.match(verifySection, /validates the installed `find_orphans\.excludeKinds` schema and default description/);
    assert.match(verifySection, /write tools must keep their `expected_mtime` \/ `confirm` \/ `rename_concept\.overwrite` \/ `delete_concept\.force` safety schemas/);
    assert.match(verifySection, /write tool descriptions keep compact `postWriteMaintenance` action `score`/);
    assert.match(verifySection, /executable `proposedAction`/);
    assert.match(verifySection, /current-page next action pointer guidance/);
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
    const verifySection = readme.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[1]?.split('The vault is a plain folder')[0] ?? '';

    assert.match(tableRow, /project-node `list_concepts` probe/);
    assert.match(tableRow, /enum-validated `maintenance_plan` filters/);
    assert.match(tableRow, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(tableRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(tableRow, /`neighbors`\/`path`\/`project_scope` graph-query smoke/);
    assert.match(verifySection, /mcp-verify --help/);
    assert.match(verifySection, /graph-query smoke contract/);
    assert.match(verifySection, /`tools\/list` schema contract/);
    assert.match(verifySection, /runtime negative smokes with invalid `list_concepts\.lmit`/);
    assert.match(verifySection, /`query_ontology\.operation="overveiw"` inputs/);
    assert.match(verifySection, /`maintenance_plan` cursor contract/);
    assert.match(verifySection, /`cursor\.found=true` with `cursor\.reason=null`/);
    assert.match(verifySection, /`cursor\.found=false`/);
    assert.match(verifySection, /`nextExecutableAction` \/ `nextReviewAction`\s+point only at the first executable\/review action in the current returned page/);
    assert.match(verifySection, /enum-validated\s+`maintenance_plan\.phases` \/ `maintenance_plan\.severities` \/\s+`maintenance_plan\.kinds` filters/);
    assert.match(verifySection, /strict work-queue\s+checks before starting the MCP server/);
    assert.match(verifySection, /Batch tool caps/);
    assert.match(verifySection, /Write-safety schema/);
    assert.match(verifySection, /get_concepts/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /probes `kind: project` directly before graph smoke/);
    assert.match(verifySection, /`list_kinds\.byKind\.project`/);
    assert.match(verifySection, /Node census totals are cross-checked across `list_kinds`, `list_concepts`,\s+`compile_ontology`, and `overview`/);
    assert.match(verifySection, /`validate_vault\.scanned` remains file-level\s+health/);
    assert.match(verifySection, /validates both default and tuned\s+`workspace_brief\.health\.checks`/);
    assert.match(verifySection, /prints tuned `workspace_brief` output\s+beside `health` \/ tuned `health`/);
    assert.match(verifySection, /stdout/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors`/);
    assert.match(verifySection, /node-to-project `path`/);
    assert.match(verifySection, /`path` hop\/edge alignment/);
    assert.match(verifySection, /`path` \/ `project_scope` calls/);
    assert.match(verifySection, /Vaults without a `kind: project`\s+node skip/);
    assert.match(verifySection, /empty vault\s+folders skip\s+node-targeted graph smoke/);
  });

  it('keeps the CLI README explicit about focused source-checkout verification', () => {
    const readme = readFileSync('cli/README.md', 'utf-8');
    const section = readme.split('### Source-checkout verification')[1]?.split('`oh-my-ontology mcp-verify [vault]` is the fastest')[0] ?? '';

    assert.match(section, /pnpm integration:cli:mcp-verify/);
    assert.match(section, /pnpm test:mcp:docs/);
    assert.match(section, /pnpm test:mcp:package/);
    assert.match(section, /installed MCP verification wrapper/);
    assert.match(section, /documentation drift/);
    assert.match(section, /OMOT_TEST_NAME_PATTERN/);
    assert.match(section, /Node `--test-name-pattern`/);
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

  it('keeps the CLI changelog aligned with the mcp-verify census scope', () => {
    const changelog = readFileSync('cli/CHANGELOG.md', 'utf-8');
    const verifySection = changelog.split('### Added — `mcp-verify` command')[1]?.split('### Added — `compile`')[0] ?? '';

    assert.match(changelog, /malformed `compile`, `cycles`, `path` hop\/edge payloads, `health\.checks`, `workspace_brief\.health\.checks`, and `workspace_brief\.nextActions` rows/);
    assert.match(verifySection, /`list_concepts`, `get_concepts`, `find_orphans`, `list_kinds`, `validate_vault`/);
    assert.match(verifySection, /partial-row contract drift/);
    assert.match(verifySection, /split between node census checks/);
    assert.match(verifySection, /file-level `validate_vault\.scanned` health/);
    assert.match(verifySection, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(verifySection, /`overview`, `overview`\/`project_map` query_plan, and actual `neighbors` \/ `path` \/ `project_scope` graph-query smoke/);
    assert.match(verifySection, /core graph-query smoke for `neighbors`, node→project `path`, and `project_scope`/);
    assert.match(verifySection, /project-node probe before graph smoke/);
    assert.match(verifySection, /accepts valid project-less vaults/);
    assert.match(verifySection, /accepts empty vault folders/);
    assert.match(verifySection, /runtime unknown-argument and invalid-enum rejection smoke/);
    assert.match(verifySection, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(verifySection, /`cursor\.found=false`/);
    assert.match(verifySection, /`cursor\.found=true` \/ `cursor\.reason=null`/);
  });

  it('documents dogfood validation as a release gate', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';

    assert.match(releaseChecks, /pnpm dogfood:walk/);
    assert.match(releaseChecks, /strict unknown-argument and invalid-enum rejection/);
    assert.match(releaseChecks, /pnpm smoke:packed-cli/);
    assert.match(releaseChecks, /get_concepts` with discovered slugs plus one\s+missing slug/);
    assert.match(releaseChecks, /batch-read\s+partial-row contract/);
    assert.match(releaseChecks, /mcp-verify --help/);
    assert.match(releaseChecks, /graph-query and strict argument\/enum smoke scope/);
    assert.match(releaseChecks, /actual `neighbors`, node→project `path`, and\s+`project_scope` calls/);
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
    assert.match(releaseChecks, /malformed `compile`,\s+`cycles`/);
    assert.match(releaseChecks, /`path`, `health`, or `workspace-brief` payloads/);
    assert.match(releaseChecks, /top-level diagnosis `status` must be `healthy` or `needs_attention`/);
    assert.match(releaseChecks, /workspace_brief\.nextActions/);
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
    assert.match(agents, /pnpm vault:audit\s+# capability\/element path drift guard \(R12\)/);
    assert.match(agents, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract/);
    assert.match(agents, /pnpm test:vault:audit\s+# vault audit CLI 인자 계약 focused test/);
    assert.match(agents, /pnpm test:vault:validate\s+# validator CLI 인자 계약 focused test/);
    assert.match(architecture, /pnpm test:vault:validate\s+# focused validator CLI argument contract \(CI gate\)/);
    assert.match(architecture, /pnpm test:vault:audit\s+# focused vault audit CLI argument contract \(CI gate\)/);
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
    const mcpVerifyRow = doc.split('| `oh-my-ontology mcp-verify [vault]` |')[1]?.split('\n')[0] ?? '';
    const implementationSection = doc.split('## 구현 단일 진실원')[1]?.split('## 회귀 차단')[0] ?? '';

    assert.match(mcpVerifyRow, /실제 `neighbors` \/ node→project `path` \/ `project_scope` graph smoke/);
    assert.match(mcpVerifyRow, /`workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`/);
    assert.match(mcpVerifyRow, /project-node `list_concepts` probe/);
    assert.match(mcpVerifyRow, /ready `maintenance_plan` cursor \+ missing `maintenance_plan\.afterActionId` cursor smoke/);
    assert.match(mcpVerifyRow, /`maintenance_plan\.phases` \/ `maintenance_plan\.severities` \/ `maintenance_plan\.kinds` enum filter/);
    assert.match(mcpVerifyRow, /`cursor\.found=false`/);
    assert.match(mcpVerifyRow, /첫 executable\/review page action alignment/);
    assert.match(mcpVerifyRow, /zero remaining actions 계약/);
    assert.match(mcpVerifyRow, /`project_scope` hard gate 를 놓치지 않는다/);
    assert.match(mcpVerifyRow, /project-less vault/);
    assert.match(mcpVerifyRow, /empty vault/);
    assert.match(mcpVerifyRow, /node-targeted graph smoke/);
    assert.match(implementationSection, /query-result-contract\.mjs/);
    assert.match(implementationSection, /`path` found:false 와 hop\/edge alignment/);
    assert.match(implementationSection, /`health` \/ `workspace-brief` top-level diagnosis status/);
    assert.match(implementationSection, /malformed `compile` \/ `cycles` \/ `path` \/ `health` \/ `workspace-brief` payload/);
    assert.match(implementationSection, /fail-closed/);
  });

  it('keeps dogfood MCP docs explicit about workspace brief health checks', () => {
    const readme = readFileSync('README.md', 'utf-8');
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const releaseChecks = readme.split('### Package / MCP release checks')[1]?.split('## Verifiable promises')[0] ?? '';
    const dogfoodSection = doc.split('dogfood walk 는 `find_evidence.matches`')[1]?.split('기본 server wait')[0] ?? '';
    const queryOntologyRow = doc.split('| `query_ontology` |')[1]?.split('\n')[0] ?? '';

    assert.match(releaseChecks, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /workspace_brief\.health\.checks/);
    assert.match(dogfoodSection, /tuned `workspace_brief`/);
    assert.match(dogfoodSection, /workspace_brief\.nextActions/);
    assert.match(dogfoodSection, /severity\/kind\/id\/count\/message/);
    assert.match(dogfoodSection, /workspace_brief nextActions/);
    assert.match(dogfoodSection, /workspace_brief_tuned nextActions/);
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
    assert.match(doc, /cursor miss `reason`/);
    assert.match(queryOntologyRow, /ready page 의 `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(queryOntologyRow, /현재 page 안의 첫 executable\/review action/);
    assert.match(queryOntologyRow, /unknown cursor 의 `cursor\.found=false` \/ cursor miss `reason`/);
    assert.match(dogfoodSection, /identifier\/severity/);
    assert.match(dogfoodSection, /id\/status\/count/);
    assert.match(dogfoodSection, /`edges\[\]\.from`/);
    assert.match(dogfoodSection, /`edges\[\]\.to`/);
    assert.match(dogfoodSection, /`edges\[\]\.via`/);
    assert.match(dogfoodSection, /설치 verify 의 `query_ontology\(path\)` smoke/);
    assert.match(dogfoodSection, /hop\/edge alignment/);
    assert.match(dogfoodSection, /project-node `list_concepts` probe/);
    assert.match(dogfoodSection, /project-node `list_concepts` probe 도 fail-closed/);
    assert.match(dogfoodSection, /`kind: project`/);
    assert.match(dogfoodSection, /`list_kinds\.byKind\.project`/);
    assert.match(doc, /MCP `initialize\.instructions` 의 `query_ontology\.operation`\s+안내와 `query_plan\.targetOperation` 안내도 같은 allow-list 에서 생성/);
    assert.match(doc, /`maintenance_plan` work-queue 안내도 first-contact 에 포함/);
    assert.match(doc, /ready cursor 의 `cursor\.found=true` \/ `cursor\.reason=null`/);
    assert.match(doc, /unknown `afterActionId` cursor 의 `cursor\.found=false`/);
    assert.match(doc, /`cursor\.reason` 계약/);
    assert.match(doc, /compact `postWriteMaintenance` 반환 \(`operation` \/ `sideEffect:false` \/ `filters` \/ `limited` \/ cursor \/ action `score` \/ executable `proposedAction` 포함\)/);
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
    assert.match(dogfoodSection, /설치 verify 성공 로그도 허용된 phases \/\s+severities \/ kinds enum 목록을 함께 출력/);
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
    assert.match(smoke, /workspace_brief — \.\*next actions, \.\*health checks/);
    assert.match(smoke, /directMcpVerify/);
    assert.match(smoke, /directMcpVerifyVaultFlag/);
    assert.match(smoke, /env: \{ OMOT_VAULT: emptyVault \}/);
    assert.match(smoke, /vault total 5 nodes/);
    assert.match(smoke, /--vault requires a path value/);
    assert.match(smoke, /npm run verify -- \\\[vault\\\] \\\[--timeout-ms N\\\]/);
    assert.match(smoke, /npm run verify -- --vault path --timeout-ms 15000/);
    assert.match(smoke, /Explicit \\\[vault\\\] or --vault arguments take precedence over OMOT_VAULT/);
    assert.match(smoke, /verify timeout must be a positive integer/);
    assert.match(smoke, /health — \.\*compile_issues:\(pass\|warn\)/);
    assert.match(smoke, /health — \.\*checks/);
    assert.match(smoke, /workspace_brief_tuned — \.\*next actions, \.\*health checks/);
    assert.match(smoke, /health_tuned — \.\*compile_issues:\(pass\|warn\)/);
    assert.match(smoke, /health_tuned — \.\*checks/);
    assert.match(smoke, /neighbors\\\/node-to-project path\\\/project_scope graph-query smoke/);
    assert.match(smoke, /runtime unknown-argument/);
    assert.match(smoke, /invalid-enum rejection/);
    assert.ok(smoke.includes('maintenance_plan cursor smoke'));
    assert.match(smoke, /Maintenance filters are enum-validated for phases\\\/severities\\\/kinds/);
    assert.match(smoke, /cursor smoke checks both cursor\\\.found=true with cursor\\\.reason=null and cursor\\\.found=false/);
    assert.match(smoke, /zero remaining actions, and no next actions/);
    assert.match(smoke, /nextExecutableAction \\\/ nextReviewAction point only at the first executable\\\/review action in the current returned page/);
    assert.match(smoke, /maintenance cursor — missing afterActionId reported/);
    assert.match(smoke, /maintenance cursor — ready page stable/);
    assert.ok(smoke.includes('directMcpVerify.stdout, /maintenance cursor'));
    assert.ok(smoke.includes('directMcpVerifyVaultFlag.stdout, /maintenance cursor'));
    assert.match(smoke, /project_scope — skipped \\\(no project node in vault\\\)/);
    assert.match(smoke, /path — elements\\\/example → project \\\(1 hop, 1 edge\\\)/);
    assert.match(smoke, /path — domains\\\/core → domains\\\/core \\\(0 hops, 0 edges\\\)/);
    assert.match(smoke, /neighbors\\\/path — skipped \\\(vault has no nodes\\\)/);
    assert.match(smokeSection, /cycles --json/);
    assert.match(smokeSection, /compile --json/);
    assert.match(smokeSection, /path --json/);
    assert.match(smokeSection, /health check count/);
    assert.match(smokeSection, /`overview`\/`project_map` query_plan \/ `neighbors` \/ `path` \//);
    assert.match(smokeSection, /`project_scope` smoke/);
    assert.match(smokeSection, /strict argument\/enum smoke/);
    assert.match(smokeSection, /project-less vault/);
    assert.match(smokeSection, /empty vault/);
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
    assert.match(regressionSection, /Node `--test-name-pattern`/);
    assert.match(regressionSection, /`pnpm integration:cli:mcp-verify`/);
    assert.match(regressionSection, /maintenance filter enum/);
    assert.match(regressionSection, /ready cursor \/ missing cursor 계약/);
    assert.match(regressionSection, /ready cursor \/ missing cursor scope/);
  });

  it('keeps dogfood MCP capability docs aligned with focused integration shortcuts', () => {
    const doc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');

    assert.match(doc, /Node `--test-name-pattern`/);
    assert.match(doc, /`pnpm integration:mcp:readme`/);
    assert.match(doc, /`pnpm test:mcp:verify`/);
    assert.match(doc, /first-contact README read-only/);
    assert.match(doc, /직접 verify help\(`npm run verify -- --help`\)/);
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
