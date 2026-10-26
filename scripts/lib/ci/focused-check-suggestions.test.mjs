import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { relatedMessagesCommand } from '../check-rules/i18n.mjs';
import { rules as SECURITY_RULES } from '../check-rules/security.mjs';

import {
  CHECK_RULES_DIRECTORY,
  composeCheckRules,
  formatFocusedCheckSuggestions,
  loadCheckRules,
  normalizeChangedPath,
  suggestFocusedChecks,
} from './focused-check-suggestions.mjs';

const SOURCE_LANGUAGE_COMMAND = 'pnpm source:language';
const DEAD_CODE_COMMAND = 'pnpm knip';
const COMMENT_REFS_COMMAND = 'pnpm docs:comment-refs';
const COMMENT_BYTES_COMMAND = 'pnpm exec vitest run tests/contract/ci-gates/source-comment-bytes.contract.test.ts';

function commandNames(result) {
  return result.commands.map((row) => row.command);
}

// The source-language gate is intentionally cross-cutting. Domain-specific tests
// keep asserting their own exact ordering, while one dedicated test below owns
// the invariant that every supported source path adds this shared gate exactly once.
// Per-file lint of changed scripts, tests and packages applies to every such path, like the
// source-language scan, so domain assertions leave it out; its own test pins it.
const isScriptLint = (command) => command.startsWith('pnpm exec eslint --max-warnings 0 --no-warn-ignored ');

const SECURITY_COMMAND = SECURITY_RULES[0].command;
const TEST_HYGIENE_COMMAND =
  'pnpm exec vitest run tests/contract/ci-gates/test-title-language.contract.test.ts tests/contract/ci-gates/source-comment-bytes.contract.test.ts';
const IME_ENTER_GUARD_COMMAND = 'pnpm exec vitest run tests/contract/controls/ime-enter-guard.contract.test.ts';
const TOKEN_GATES_COMMAND =
  'pnpm exec vitest run tests/contract/design-tokens/unused-token-ratchet.contract.test.ts tests/contract/design-tokens/undeclared-token-ref.contract.test.ts tests/contract/design-tokens/design-doc-token-integrity.contract.test.ts';

// Import-graph rows are facts about this repository's imports; one test below owns them.
function ruleCommands(result) {
  return result.commands.filter((row) => !row.importGraph).map((row) => row.command);
}

function domainCommands(result) {
  return ruleCommands(result).filter(
    (command) =>
      command !== SOURCE_LANGUAGE_COMMAND &&
      command !== COMMENT_REFS_COMMAND &&
      command !== COMMENT_BYTES_COMMAND &&
      command !== DEAD_CODE_COMMAND &&
      command !== SECURITY_COMMAND &&
      command !== TEST_HYGIENE_COMMAND &&
      command !== IME_ENTER_GUARD_COMMAND &&
      !isScriptLint(command),
  );
}

describe('focused check suggestions', () => {
  it('routes shared skill procedures and recording guidance to their existing checks', () => {
    const subjects = [
      ['.agents/skills/ui-build/workflow.md', 'pnpm test:design-gates'],
      ['.agents/skills/ui-proof/guides/motion-verify.md', 'pnpm test:design-gates'],
      ['docs/engineering/motion-recording.md', 'pnpm test:design-gates'],
      ['.agents/skills/product-check/workflow.md', 'pnpm test:po'],
      ['.agents/skills/product-check/workflow.md', 'pnpm po:pilot -- --check'],
      ['.agents/skills/ontology-bootstrap/workflow.md', 'pnpm test:dogfood:script-refs'],
    ];
    assert.ok(subjects.length > 0);
    for (const [path, command] of subjects) {
      assert.ok(existsSync(path), path);
      const commands = commandNames(suggestFocusedChecks([path]));
      assert.ok(commands.includes(command), `${path} -> ${command}`);
    }
  });
  it('covers construction registry, replay delegation and rendered guide consumers', () => {
    const subjects = [
      ['mcp/src/server/registry.mjs', 'pnpm test:mcp:unit'],
      ['mcp/src/server/tool-definitions/read.mjs', 'pnpm test:mcp:unit'],
      ['mcp/src/server/tool-definitions/read.mjs', 'pnpm docs:surface:check'],
      ['mcp/src/server/tool-definitions/read.mjs', 'pnpm integration:mcp:surface'],
      ['mcp/src/server/tool-schemas/git-results.mjs', 'pnpm test:mcp:unit'],
      ['mcp/src/server/tool-schemas/git-results.mjs', 'pnpm docs:surface:check'],
      ['mcp/src/server/tool-schemas/git-results.mjs', 'pnpm integration:mcp:surface'],
      ['mcp/src/server/tool-schemas/destructive-preview.mjs', 'pnpm integration:mcp:write'],
      ['mcp/src/tools/repo-analysis.mjs', 'pnpm integration:mcp:repo-analysis'],
      ['.claude/skills/ontology-field-trial/scripts/acp-replay.sh', 'pnpm exec vitest run tests/contract/agent-instructions/field-trial-replay-scripts.contract.test.ts'],
      ['scripts/lib/benchmark/construction-prompts.mjs', 'pnpm exec vitest run tests/contract/agent-instructions/field-trial-replay-scripts.contract.test.ts'],
      ['docs/guide/body-backed-construction.md', 'pnpm exec vitest run tests/contract/routes/guide-inbody-links.contract.test.ts'],
    ];
    assert.ok(subjects.length > 0);
    for (const [path, command] of subjects) {
      assert.ok(existsSync(path), path);
      assert.ok(commandNames(suggestFocusedChecks([path])).includes(command), `${path} -> ${command}`);
      assert.ok(commandNames(suggestFocusedChecks([], { deletedPaths: [path] })).includes(command), `deleted ${path} -> ${command}`);
    }
  });
  it('lints changed scripts, tests and packages that the full lint lane covers', () => {
    const lint = (paths) => commandNames(suggestFocusedChecks(paths)).find(isScriptLint);
    // A scripts-only change once planned no lint and landed a warning on main (train #1921).
    assert.equal(
      lint(['scripts/landing/pr-land.test.mjs', 'tests/e2e/settle.ts', 'mcp/src/index.js']),
      'pnpm exec eslint --max-warnings 0 --no-warn-ignored scripts/landing/pr-land.test.mjs tests/e2e/settle.ts mcp/src/index.js',
    );
    assert.equal(lint(['src/shared/lib/cn.ts']), undefined, 'src and app keep their own lint command');
    assert.equal(lint(['docs/README.md']), undefined, 'non-code paths plan no lint');
  });

  it('normalizes paths for git and shell input', () => {
    assert.equal(normalizeChangedPath('./mcp\\scripts\\verify.mjs'), 'mcp/scripts/verify.mjs');
    assert.equal(normalizeChangedPath('  docs/ontology/project.md  '), 'docs/ontology/project.md');
  });

  it('suggests the narrow registration gate for source-checkout MCP templates', () => {
    const result = suggestFocusedChecks(['.mcp.json', '.mcp.json.example']);

    // `.mcp.json` is also what `agents:check` measures agent-brief MCP grants
    // against, so both gates are correct here.
    assert.deepEqual(domainCommands(result), ['pnpm test:mcp:registration', 'pnpm agents:check']);
    assert.deepEqual(result.escalations, []);
  });

  it('suggests docs-vault, docs contract, dogfood status, and the gateway specimen for dogfood ontology docs', () => {
    const result = suggestFocusedChecks(['docs/ontology/capabilities/mcp-server.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:build',
      'pnpm exec vitest run tests/contract/vault-data/bundled-vault-budget.contract.test.ts',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
      'pnpm vault:validate',
      // The gateway renders one vault file verbatim and states the vault's node count, so any
      // vault edit can invalidate the committed copy of it.
      'pnpm gateway:specimen:check',
      'pnpm test:run tests/contract/copy/em-dash-ratchet.contract.test.ts',
      'pnpm test:run tests/contract/vault-data/vault-section-shape.contract.test.ts',
    ]);
  });

  it('suggests docs-vault freshness for any markdown doc indexed by the static docs vault', () => {
    const result = suggestFocusedChecks(['docs/FEATURES.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:build',
      'pnpm exec vitest run tests/contract/vault-data/bundled-vault-budget.contract.test.ts',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm docs:meta && pnpm docs:move -- --check',
    ]);
  });

  it('suggests the living-document metadata gate for living docs only, never for frozen history or vault nodes', () => {
    const meta = 'pnpm docs:meta && pnpm docs:move -- --check';
    for (const living of ['docs/contracts/analysis-records.md', 'docs/features/map/canvas.md', 'docs/records/README.md', 'docs/.moved.json', 'scripts/lib/docs/doc-types.mjs']) {
      assert.ok(commandNames(suggestFocusedChecks([living])).includes(meta), living);
    }
    for (const frozen of ['docs/DECISIONS.md', 'docs/records/decisions/x.md', 'docs/ontology/capabilities/x.md', 'docs/audits/x.md']) {
      assert.ok(!commandNames(suggestFocusedChecks([frozen])).includes(meta), frozen);
    }
  });

  it('suggests the Markdown language gate for prose and for its implementation', () => {
    const prose = suggestFocusedChecks(['CONTRIBUTING.md']);
    assert.deepEqual(domainCommands(prose), [
      'pnpm docs:language',
      'pnpm docs:links',
    ]);

    const gate = suggestFocusedChecks([
      'scripts/quality/markdown-language/inventory.mjs',
      'scripts/quality/markdown-language/inventory.test.mjs',
    ]);
    assert.deepEqual(domainCommands(gate), [
      'pnpm exec node --test scripts/quality/markdown-language/inventory.test.mjs',
      'pnpm docs:language',
      'pnpm test:docs:language',
    ]);
  });

  it('suggests the source-comment language gate for every supported source family', () => {
    const result = suggestFocusedChecks([
      'src/shared/lib/example.ts',
      'src-tauri/src/example.rs',
      'app/globals.css',
      'docs/prototypes/example.html',
      '.github/workflows/checks.yml',
      '.claude/hooks/example.sh',
      '.env.example',
    ]);
    assert.equal(
      commandNames(result).filter((command) => command === SOURCE_LANGUAGE_COMMAND).length,
      1,
    );

    const gate = suggestFocusedChecks([
      'scripts/quality/source-language/source-paths.mjs',
      'scripts/quality/source-language/inventory.test.mjs',
    ]);
    assert.deepEqual(ruleCommands(gate).filter((command) => command !== DEAD_CODE_COMMAND && command !== COMMENT_REFS_COMMAND && command !== COMMENT_BYTES_COMMAND && command !== TEST_HYGIENE_COMMAND && !isScriptLint(command)), [
      'pnpm exec node --test scripts/quality/source-language/inventory.test.mjs',
      SOURCE_LANGUAGE_COMMAND,
      'pnpm test:source:language',
      'pnpm design:ontology',
      'pnpm desktop:check',
    ]);

    assert.ok(!commandNames(suggestFocusedChecks(['messages/ko.json'])).includes(SOURCE_LANGUAGE_COMMAND));
  });

  it('ratchets comment bytes for every changed source, through the test hygiene pair for tests', () => {
    const CASES = [
      [['.github/workflows/checks.yml'], COMMENT_BYTES_COMMAND],
      [['src/views/architecture/model/harness-anatomy.ts'], COMMENT_BYTES_COMMAND],
      [['src/shared/lib/cn.test.ts'], TEST_HYGIENE_COMMAND],
    ];
    for (const [paths, expected] of CASES) {
      assert.ok(commandNames(suggestFocusedChecks(paths)).includes(expected), paths.join(', '));
    }
  });

  it('checks comment citations when source or Markdown changes, once', () => {
    const CASES = [
      [['src/views/architecture/model/harness-anatomy.ts', 'docs/FEATURES.md'], 1],
      [['docs/FEATURES.md'], 1],
      [['messages/ko.json'], 0],
    ];
    for (const [paths, expected] of CASES) {
      assert.equal(commandNames(suggestFocusedChecks(paths)).filter((command) => command === COMMENT_REFS_COMMAND).length, expected, paths.join(', '));
    }
  });

  it('suggests the test-source ratchets once for every test source and never for other code', () => {
    const tests = [
      'src/shared/lib/cn.test.ts',
      'src/widgets/example/ui/Example.test.tsx',
      'tests/e2e/app-shell/rail-destinations.spec.ts',
      'tests/contract/layout/page-frame.contract.test.ts',
      'scripts/desktop/desktop-smoke.test.mjs',
      'mcp/src/analyze.test.mjs',
      'cli/src/integration.test.mjs',
    ];
    assert.equal(
      commandNames(suggestFocusedChecks(tests)).filter((command) => command === TEST_HYGIENE_COMMAND).length,
      1,
    );
    for (const path of tests) {
      assert.ok(commandNames(suggestFocusedChecks([path])).includes(TEST_HYGIENE_COMMAND), path);
    }
    for (const path of ['src/shared/lib/cn.ts', 'scripts/desktop/desktop-smoke.mjs', 'tests/e2e/settle.ts', 'app/globals.css']) {
      assert.ok(!commandNames(suggestFocusedChecks([path])).includes(TEST_HYGIENE_COMMAND), path);
    }
  });

  it('suggests the dead-code analyzer once for every scope, manifest, and analyzer config', () => {
    const paths = [
      'src/shared/lib/example.ts',
      'scripts/quality/dead-code/check.mjs',
      'scripts/quality/dead-code/baseline.json',
      'scripts/quality/dead-code/exceptions.json',
      'cli/src/lib/example.mjs',
      'mcp/src/example.mjs',
      'mcp/scripts/verify.mjs',
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'cli/package.json',
      'cli/pnpm-lock.yaml',
      'mcp/package.json',
      'mcp/pnpm-lock.yaml',
      'next.config.ts',
      'tsconfig.json',
      'vitest.config.ts',
      'playwright.config.ts',
      'postcss.config.mjs',
    ];

    for (const path of paths) {
      const count = commandNames(suggestFocusedChecks([path]))
        .filter((command) => command === DEAD_CODE_COMMAND).length;
      assert.equal(count, 1, `${path} must recommend ${DEAD_CODE_COMMAND} exactly once`);
    }
  });

  it('plans the IME Enter guard for TypeScript sources that the full contract suite misses', () => {
    const plans = (path) => commandNames(suggestFocusedChecks([path]));
    for (const path of ['src/shared/lib/example.ts', 'src/widgets/example/ui/use-example-keys.ts', 'app/sitemap.ts']) {
      assert.equal(plans(path).filter((command) => command === IME_ENTER_GUARD_COMMAND).length, 1, path);
    }
    assert.ok(plans('src/widgets/example/ui/Example.tsx').includes('pnpm test:contracts'));
    assert.ok(!plans('src/shared/lib/example.test.ts').includes(IME_ENTER_GUARD_COMMAND));
  });

  it('suggests narrow vault tooling tests for vault helper scripts', () => {
    const result = suggestFocusedChecks([
      'scripts/docs-vault/build-docs-vault.mjs',
      'scripts/vault/validate-vault.mjs',
      'scripts/vault/audit-vault-paths.test.mjs',
      'scripts/vault/migrate-vault.mjs',
      'scripts/migrations/2026-05-04-trim-frontmatter-values.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/docs-vault/build-docs-vault.test.mjs',
      'pnpm exec node --test scripts/vault/validate-vault-script.test.mjs',
      'pnpm exec node --test scripts/vault/audit-vault-paths.test.mjs',
      'pnpm test:docs-vault',
      'pnpm test:vault:validate',
      'pnpm test:vault:audit',
      // The generator decides the shape of the bundled vault data, so the desktop static budget
      // measurement is suggested with it.
      'pnpm build && pnpm desktop:perf',
      'pnpm test:vault:migrate',
      'pnpm vault:migrate --list',
      'pnpm test:contracts',
    ]);
  });

  it('wires the concurrent-ledger resolver to its runtime test and docs-vault suite', () => {
    const result = suggestFocusedChecks(['scripts/docs-vault/resolve-docs-vault-conflicts.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/docs-vault/resolve-docs-vault-conflicts.test.mjs',
      'pnpm test:docs-vault',
    ]);
  });

  it('suggests the desktop static budget measurement when bundled vault data changes', () => {
    const result = suggestFocusedChecks([
      'src/entities/docs-vault/data/gateway-content.json',
    ]);

    assert.ok(
      result.commands.some((row) => row.command === 'pnpm build && pnpm desktop:perf'),
      'bundled vault data must trigger the desktop budget measurement',
    );
  });

  it('suggests direct locale message validation before the package shortcut', () => {
    const result = suggestFocusedChecks(['scripts/i18n/validate-messages.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/i18n/validate-messages.test.mjs',
      'pnpm test:i18n:messages',
    ]);
  });

  it('suggests the executable frontmatter-example gate for public guide changes', () => {
    const result = suggestFocusedChecks(['docs/guide/relations.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:build',
      'pnpm exec vitest run tests/contract/vault-data/bundled-vault-budget.contract.test.ts',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm docs:meta && pnpm docs:move -- --check',
      'pnpm test:guide-examples',
      'pnpm exec vitest run tests/contract/routes/guide-inbody-links.contract.test.ts',
      'pnpm test:run tests/contract/copy/em-dash-ratchet.contract.test.ts',
    ]);
  });

  it('suggests the offline guide-example gate for the external judgment probe', () => {
    for (const path of ['examples/external-judgment/probe.mjs', 'examples/external-judgment/probe.test.mjs']) {
      assert.ok(commandNames(suggestFocusedChecks([path])).includes('pnpm test:guide-examples'), path);
    }
  });

  it('suggests cross-package contracts for parser schema and validator drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/schema.mjs',
      'cli/src/lib/mcp-bridge/parse-frontmatter.mjs',
      'src/shared/lib/vault-document/validate-vault-document.ts',
      'tests/fixtures/validate-vault-cases.mjs',
      'tests/fixtures/vault-schema-cases.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/shared/lib/vault-document/validate-vault-document.ts',
      'pnpm test:contracts',
      'pnpm test:mcp:unit',
      'pnpm typecheck',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
  });

  it('suggests MCP unit tests for core implementation drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/ontology-compiler.test.mjs',
      'mcp/src/vault/documents.mjs',
      'mcp/scripts/json-rpc-lines.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/vault/vault.test.mjs',
      'pnpm exec node --test mcp/src/json-rpc-lines.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('discovers a new MCP source and sibling test without a hand-maintained allowlist', () => {
    const result = suggestFocusedChecks([
      'mcp/src/agent-brief/task-navigation-evidence.mjs',
      'mcp/src/agent-brief/task-navigation-evidence.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/agent-brief/task-navigation-evidence.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests lifecycle, qualification, and meaning tests for ontology construction drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/construction/construction-lifecycle.mjs',
      'mcp/src/construction/construction-qualification.mjs',
      'mcp/src/meaning/meaning-evaluation.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/construction/construction-lifecycle.test.mjs',
      'pnpm exec node --test mcp/src/construction/construction-qualification.test.mjs',
      'pnpm exec node --test mcp/src/meaning/meaning-evaluation.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests the source-hidden fixture contract for fixture or test changes', () => {
    const result = suggestFocusedChecks([
      'tests/fixtures/source-hidden-field-trial/v1.json',
      'mcp/src/meaning/source-hidden-field-trial.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/meaning/source-hidden-field-trial.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP surface integration for server entrypoint changes', () => {
    const result = suggestFocusedChecks(['mcp/src/index.js']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests broad MCP integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['mcp/src/integration.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:mcp:rpc',
      'pnpm integration:mcp',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP read integration for read/query tool implementation changes', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault/documents.mjs',
      'mcp/src/query.mjs',
      'mcp/src/ontology-engine.mjs',
      'mcp/src/ontology-compiler.mjs',
      'mcp/src/analyze.mjs',
      'mcp/src/infer-imports.mjs',
      'mcp/src/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/vault/vault.test.mjs',
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm exec node --test mcp/src/validate.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP graph integration for graph artifact/query handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/ontology-compiler.mjs',
      'mcp/src/ontology-engine.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests read integration, not graph integration, for the query_concepts DSL parser', () => {
    const result = suggestFocusedChecks(['mcp/src/query.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:read',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP repo-analysis integration for code-to-vault handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/infer-imports.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('routes architecture changes through the cross-surface gate and rendered workflow', () => {
    const result = suggestFocusedChecks([
      'mcp/src/architecture/architecture-profile.mjs',
      'cli/src/commands/repo-analysis/architecture.mjs',
      'src/views/architecture/ui/ArchitectureWorkbench.tsx',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/views/architecture/ui/ArchitectureWorkbench.tsx',
      'pnpm test:cli:commands',
      'pnpm test:architecture',
      'pnpm exec playwright test tests/e2e/harness/architecture-workbench.spec.ts',
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/architecture/architecture-profile.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm typecheck',
      'pnpm integration:cli:repo-analysis',
      'pnpm vault:validate',
      'pnpm exec playwright test tests/e2e/harness/architecture-role-ledger.spec.ts',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP write integration for server write handler changes', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault/documents.mjs',
      'mcp/src/index.js',
      'mcp/src/vault/redirect-backlinks.test.mjs',
      'mcp/src/vault/conflict-detection.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm exec node --test mcp/src/vault/vault.test.mjs',
      'pnpm exec node --test mcp/src/vault/redirect-backlinks.test.mjs',
      'pnpm exec node --test mcp/src/vault/conflict-detection.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP vault-read integration for vault read handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault/documents.mjs',
      'mcp/src/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/vault/vault.test.mjs',
      'pnpm exec node --test mcp/src/validate.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('deduplicates direct MCP unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'mcp/src/infer-imports.mjs',
      'mcp/src/infer-imports.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'mcp/src/infer-imports.mjs',
      'mcp/src/infer-imports.test.mjs',
    ]);
  });

  it('routes each infer-imports family module to its own test and to repo-analysis integration', () => {
    const result = suggestFocusedChecks([
      'mcp/src/infer-imports/go-imports.mjs',
      'mcp/src/infer-imports/path-confinement.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/infer-imports/go-imports.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports/confined-source-fs.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
  });

  it('suggests direct MCP suggestions tests before the broader suggestions gate', () => {
    const result = suggestFocusedChecks([
      'mcp/src/suggestions.mjs',
      'mcp/src/suggestions.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/suggestions.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm test:mcp:suggestions',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'mcp/src/suggestions.mjs',
      'mcp/src/suggestions.test.mjs',
    ]);
  });

  it('suggests direct CLI lib unit tests before aggregate CLI lib gate', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/captured-summary.mjs',
      'cli/src/lib/query-result-contract/path-queries.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test cli/src/lib/captured-summary.test.mjs',
      'pnpm exec node --test cli/src/lib/query-result-contract/path-queries.test.mjs',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
  });

  it('routes a result contract family file to the test that covers it', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/query-result-contract/project-source-meaning.mjs',
      'cli/src/lib/query-result-contract/graph-traversal.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test cli/src/lib/query-result-contract/agent-brief/agent-brief.test.mjs',
      'pnpm exec node --test cli/src/lib/query-result-contract/graph-traversal.test.mjs',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
  });

  it('deduplicates direct CLI lib unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/mcp-bridge/mcp-call.mjs',
      'cli/src/lib/mcp-bridge/mcp-call.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:mcp-call',
      'pnpm exec node --test cli/src/lib/mcp-bridge/mcp-call.test.mjs',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands.find((row) => row.command.endsWith('cli/src/lib/mcp-bridge/mcp-call.test.mjs')).paths, [
      'cli/src/lib/mcp-bridge/mcp-call.mjs',
      'cli/src/lib/mcp-bridge/mcp-call.test.mjs',
    ]);
  });

  it('suggests focused CLI entry integration for dispatch and command inventory changes', () => {
    const result = suggestFocusedChecks([
      'cli/src/index.mjs',
      'cli/src/lib/cli-commands.mjs',
      'cli/src/lib/cli-commands.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm exec node --test cli/src/lib/cli-commands.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:entry',
      'pnpm vault:validate',
    ]);
  });

  it('suggests broad CLI integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['cli/src/integration.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm integration:cli',
      'pnpm vault:validate',
    ]);
  });

  it('suggests setup integration for agent config repair helpers', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/agent-setup/agent-config.mjs',
      'cli/src/lib/agent-setup/agent-config.test.mjs',
      'cli/src/commands/agent-setup/agent-setup.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:cli:lib',
      'pnpm integration:cli:setup',
      'pnpm vault:validate',
    ]);
  });

  it('suggests narrow dogfood helper tests before broader dogfood gates', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/dogfood-walk/dogfood-args.mjs',
      'scripts/dogfood/dogfood-compile-fix.test.mjs',
      'scripts/dogfood/dogfood-status.mjs',
      'scripts/dogfood/dogfood-graph-db-pack.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/lib/dogfood-walk/dogfood-args.test.mjs',
      'pnpm exec node --test scripts/dogfood/dogfood-compile-fix.test.mjs',
      'pnpm exec node --test scripts/dogfood/dogfood-status.test.mjs',
      'pnpm exec node --test scripts/dogfood/dogfood-graph-db-pack.test.mjs',
      'pnpm test:dogfood:args',
      'pnpm test:dogfood:compile-fix',
      'pnpm test:dogfood:status',
      'pnpm test:dogfood:graph-db',
      'pnpm test:mcp:maintenance',
      'pnpm vault:validate',
    ]);
  });

  it('suggests direct script helper unit tests before broader script-ref gates', () => {
    const result = suggestFocusedChecks([
      'scripts/ci/run-focused-node-test.mjs',
      'scripts/ci/run-focused-node-test.test.mjs',
      'scripts/lib/ci/focused-check-suggestions.mjs',
      'scripts/lib/pnpm-script-refs.mjs',
      'scripts/lib/ci/test-name-pattern.mjs',
      'scripts/lib/ci/test-name-pattern.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:ci:impact',
      'pnpm exec node --test scripts/ci/run-focused-node-test.test.mjs',
      'pnpm exec node --test scripts/lib/ci/focused-check-suggestions.test.mjs',
      'pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs',
      'pnpm exec node --test scripts/lib/ci/test-name-pattern.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:checks:changed',
    ]);
    assert.deepEqual(
      result.commands.find(
        (row) => row.command === 'pnpm exec node --test scripts/ci/run-focused-node-test.test.mjs',
      )?.paths,
      [
      'scripts/ci/run-focused-node-test.mjs',
      'scripts/ci/run-focused-node-test.test.mjs',
      ],
    );
    assert.deepEqual(
      result.commands.find(
        (row) => row.command === 'pnpm exec node --test scripts/lib/ci/test-name-pattern.test.mjs',
      )?.paths,
      [
      'scripts/lib/ci/test-name-pattern.mjs',
      'scripts/lib/ci/test-name-pattern.test.mjs',
      ],
    );
  });

  it('suggests script-reference checks when dogfood help text changes', () => {
    const result = suggestFocusedChecks(['scripts/dogfood/dogfood-mcp-walk.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/dogfood/dogfood-mcp-walk.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:dogfood:timeout',
      'pnpm test:mcp:dogfood',
      'pnpm vault:validate',
    ]);
  });

  it('suggests agent hook tests for Claude Code and Codex hook wiring changes', () => {
    const result = suggestFocusedChecks([
      '.claude/settings.json',
      '.claude/hooks/block-npm-publish.sh',
      '.claude/hooks/inject-ontology-summary.sh',
      '.codex/hooks.json',
      '.codex/hooks/block-npm-publish.sh',
      '.codex/hooks/inject-ontology-summary.sh',
      'scripts/harness/claude-hooks.test.mjs',
    ]);

    // Every path here is also inventoried by `agent-files`, and `.claude/settings.json`
    // carries the `permissions.deny` rules the secret-read guard derives from
    // `.gitignore`, so all three gates apply.
    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/harness/claude-hooks.test.mjs',
      'pnpm test:claude:hooks',
      'pnpm agents:check',
      'pnpm exec vitest run tests/contract/harness/agent-files.contract.test.ts tests/contract/agent-instructions/nested-agents-pointers.contract.test.ts tests/contract/agent-instructions/skill-routing.contract.test.ts tests/contract/agent-instructions/rules-path-scope.contract.test.ts tests/contract/security/secret-read-guard.contract.test.ts tests/contract/ci-gates/node-test-reachability.contract.test.ts tests/contract/agent-instructions/agent-file-citations.contract.test.ts',
    ]);
  });

  it('routes the GitHub Pages deploy workflow to the desktop readiness contract', () => {
    const result = suggestFocusedChecks(['.github/workflows/deploy-pages.yml']);

    const commands = domainCommands(result);
    assert.ok(commands.includes('pnpm test:desktop:check'));
    assert.doesNotMatch(commands.join(' '), /firebase|bundle:check/i);
  });

  it('routes installed-app WebView verifier changes to the desktop contract suite', () => {
    const result = suggestFocusedChecks([
      'scripts/verify-macos/verify-macos-app-launch.mjs',
      'scripts/verify-macos/verify-macos-app-launch.payload-contract.test.mjs',
      'scripts/lib/verify-macos/payload-contract.mjs',
    ]);

    assert.ok(
      result.commands.some((row) => row.command === 'pnpm test:desktop:check'),
      'WebView verifier changes must run the suite that includes its payload contract',
    );
  });

  it('routes every ACP launch-boundary input to the registry compatibility gate', () => {
    const subjects = [
      'scripts/registry-snapshots/build-acp-registry.mjs',
      'scripts/registry-snapshots/build-acp-registry.test.mjs',
      'src-tauri/src/acp-registry.json',
      'src-tauri/src/acp.rs',
      'src-tauri/src/acp/isolation.rs',
      'src-tauri/src/acp/runtime_environment/tests.rs',
      '.github/workflows/release-macos.yml',
    ];
    assert.ok(subjects.length > 0, 'the ACP launch-boundary subject inventory must not be empty');
    for (const subject of subjects) {
      assert.ok(
        commandNames(suggestFocusedChecks([subject])).includes('pnpm acp:registry:check'),
        `${subject} must recommend the ACP registry compatibility gate`,
      );
    }
    assert.ok(
      !commandNames(suggestFocusedChecks(['src/views/home/ui/HomePage.tsx'])).includes(
        'pnpm acp:registry:check',
      ),
      'an unrelated screen must not trigger a network registry scan',
    );
  });

  it('suggests desktop readiness checks for macOS desktop distribution files', () => {
    const result = suggestFocusedChecks([
      'scripts/desktop/check-desktop-readiness.mjs',
      'scripts/desktop/check-desktop-readiness.test.mjs',
      'scripts/desktop/desktop-doctor.mjs',
      'scripts/desktop/desktop-doctor.test.mjs',
      'scripts/desktop/desktop-smoke.mjs',
      'scripts/desktop/desktop-smoke.test.mjs',
      'scripts/verify-macos/verify-macos-dmg.mjs',
      'scripts/verify-macos/verify-macos-install-smoke.mjs',
      'scripts/lib/macos-artifact/macos-dmg-layout.mjs',
      'scripts/lib/desktop-release/redact-command.mjs',
      'scripts/download/check-macos-download-release.mjs',
      'docs/DESKTOP-MACOS.md',
      'src/shared/lib/vault-folder/tauri-vault-fs.ts',
      'src/shared/lib/vault-folder/tauri-vault-fs.test.ts',
      'src/views/root-entry/ui/RootEntryPage.tsx',
      'src/views/root-entry/ui/RootEntryPage.test.tsx',
      'src/views/docs-vault/lib/persistence.ts',
      'src/views/docs-vault/ui/DocsVaultPage.tsx',
      'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx',
      'src-tauri/src/lib.rs',
      'src-tauri/tauri.conf.json',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/desktop/check-desktop-readiness.test.mjs',
      'pnpm exec node --test scripts/desktop/desktop-doctor.test.mjs',
      'pnpm exec node --test scripts/desktop/desktop-smoke.test.mjs',
      'pnpm exec node --test scripts/verify-macos/verify-macos-install-smoke.test.mjs',
      'pnpm exec node --test scripts/lib/macos-artifact/macos-dmg-layout.test.mjs',
      'pnpm exec node --test scripts/lib/desktop-release/redact-command.test.mjs',
      'pnpm exec eslint --max-warnings 0 src/shared/lib/vault-folder/tauri-vault-fs.ts src/shared/lib/vault-folder/tauri-vault-fs.test.ts ' +
        'src/views/root-entry/ui/RootEntryPage.tsx src/views/root-entry/ui/RootEntryPage.test.tsx ' +
        'src/views/docs-vault/lib/persistence.ts src/views/docs-vault/ui/DocsVaultPage.tsx ' +
        'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx',
      'pnpm exec vitest run src/shared/lib/vault-folder/tauri-vault-fs.test.ts',
      'pnpm exec vitest run src/views/root-entry/ui/RootEntryPage.test.tsx',
      'pnpm docs-vault:build',
      'pnpm exec vitest run tests/contract/vault-data/bundled-vault-budget.contract.test.ts',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm docs:meta && pnpm docs:move -- --check',
      'pnpm test:desktop:check',
      'pnpm test:desktop:runtime',
      'pnpm test:desktop:bridge',
      'pnpm desktop:check',
      'pnpm test:contracts',
      // This set includes `src/views/docs-vault/**`, so the docs e2e comes with it.
      'pnpm exec playwright test tests/e2e/library/docs/docs-deeplink.spec.ts ' +
        'tests/e2e/design-audits/document-scroll-lock.spec.ts tests/e2e/vault-session/vault-truth-telling.spec.ts',
      // A desktop change does not verify the web, which is unattended, so the smoke test is suggested in
      // the same set.
      'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
      'pnpm typecheck',
      'pnpm exec playwright test tests/e2e/settings/settings-reading-layout.spec.ts',
      'pnpm exec playwright test tests/e2e/design-audits/scroll-end-gap.spec.ts',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/desktop/check-desktop-readiness.mjs',
      'scripts/desktop/check-desktop-readiness.test.mjs',
    ]);
  });

  it('routes the docs vault page modules to the desktop readiness gate', () => {
    for (const path of [
      'src/views/docs-vault/ui/DocsVaultHeader.tsx',
      'src/views/docs-vault/ui/DocsVaultDocumentPane.tsx',
      'src/views/docs-vault/ui/DocsVaultSidebar.tsx',
      'src/views/docs-vault/model/use-docs-vault-source.tsx',
      'src/views/docs-vault/model/use-doc-write-actions.ts',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes('pnpm desktop:check'),
        path,
      );
    }
  });

  it('runs the native bridge tests for code split out of the crate root', () => {
    for (const path of ['src-tauri/src/vault/write.rs', 'src-tauri/src/webview_verify/mod.rs']) {
      assert.ok(commandNames(suggestFocusedChecks([path])).includes('pnpm test:desktop:bridge'), path);
    }
  });

  it('points the Agents destination at the three e2e specs that drive it', () => {
    /*
     * Without this rule none of these files suggests a Playwright spec, while
     * `mcp-connector-add.spec.ts` proves the `install=` deep link still opens the connectors dialog.
     * Delete the rule and this goes red.
     */
    const command =
      'pnpm exec playwright test tests/e2e/agents/mcp-connector-add.spec.ts ' +
      'tests/e2e/agents/agent-connect-panel-census.spec.ts tests/e2e/web-surface-smoke.spec.ts';
    for (const path of [
      'src/views/agents/ui/AgentsPage.tsx',
      'src/views/mcp/ui/McpPage.tsx',
      'src/views/mcp-redirect/ui/McpRedirectPage.tsx',
      'src/app/agents-workspace/index.tsx',
      'src/features/mcp-connectors/ui/ConnectorsPanel.tsx',
      'src/widgets/app-settings-menu/ui/AgentSetupSection.tsx',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes(command),
        `${path} suggested no e2e for the Agents destination`,
      );
    }
  });

  it('points the runtime list only at the spec that measures it', () => {
    // Naming the connectors specs here would be a mapping that does not measure this file:
    // only the web smoke registers the card a browser draws instead of the runtime list.
    const commands = domainCommands(
      suggestFocusedChecks(['src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx']),
    );
    assert.ok(commands.includes('pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts'));
    assert.ok(!commands.some((command) => command.includes('mcp-connector-add')));
  });

  it('points folder-switch and download-hero changes at the leak specs that measure them', () => {
    const cases = [
      ['src/entities/vault-session/model/local-vault/use-local-vault.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/entities/vault-session/model/local-vault/use-vault-choice.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/entities/vault-session/model/local-vault/use-vault-doc-writes.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/entities/vault-session/model/local-vault/use-local-vault.ts', 'tests/e2e/web-surface-smoke.spec.ts'],
      ['src/entities/vault-session/model/local-vault/vault-sidecars.ts', 'tests/e2e/web-surface-smoke.spec.ts'],
      ['src/features/vault-switch/ui/VaultSwitchRailTile.tsx', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/views/home/model/trail/use-past-trails.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/widgets/ontology-map/ui/camera/use-topology-camera-navigation.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/widgets/ontology-map/ui/camera/use-topology-overview-navigation.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/widgets/ontology-map/ui/camera/use-topology-viewport-lifecycle.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/shared/lib/derived-hook.ts', 'tests/e2e/vault-session/vault-switch-release.spec.ts'],
      ['src/views/download/lib/hero-atlas-scene.ts', 'tests/e2e/gateway/download-hero-release.spec.ts'],
      ['src/views/download/ui/HeroAtlas.tsx', 'tests/e2e/gateway/download-hero-release.spec.ts'],
    ];
    for (const [path, spec] of cases) {
      assert.ok(existsSync(path), `${path} moved; move its mapping with it`);
      assert.ok(commandNames(suggestFocusedChecks([path])).includes(`pnpm exec playwright test ${spec}`), `${path} → ${spec}`);
    }
  });

  it('routes the vault session files the desktop readiness gate reads to that gate', () => {
    for (const path of ['src/entities/vault-session/model/local-vault/use-vault-choice.ts', 'src/entities/vault-session/model/local-vault/vault-sidecars.ts']) {
      assert.ok(existsSync(path), `${path} moved; move its mapping with it`);
      assert.ok(domainCommands(suggestFocusedChecks([path])).includes('pnpm desktop:check'), path);
    }
  });

  it('suggests the web surface smoke when a desktop capability bridge changes', () => {
    const result = suggestFocusedChecks(['src/shared/lib/llm-connection/tauri-secrets.ts']);

    const commands = domainCommands(result);
    assert.ok(commands.includes('pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts'));
  });

  it('suggests ontology design guard checks when the design surface guard changes', () => {
    const result = suggestFocusedChecks([
      'scripts/design/check-ontology-design-surface.mjs',
      'scripts/design/check-ontology-design-surface.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/design/check-ontology-design-surface.test.mjs',
      'pnpm design:ontology',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/design/check-ontology-design-surface.mjs',
      'scripts/design/check-ontology-design-surface.test.mjs',
    ]);
  });

  it('automatically suggests the ontology design guard when Insights changes', () => {
    const result = suggestFocusedChecks([
      'src/views/ontology-insights/lib/insights-tab-state.ts',
    ]);

    assert.ok(domainCommands(result).includes('pnpm design:ontology'));
  });

  it('suggests static export gates when Next config changes', () => {
    const result = suggestFocusedChecks(['next.config.ts']);

    assert.deepEqual(domainCommands(result), [
      'pnpm desktop:check',
      'pnpm typecheck',
      'pnpm build',
    ]);
  });

  /*
   * The shell renders above every page's `Suspense` boundary, so a hook that defers to the client
   * there breaks the prerender of routes it never touched; only a real export catches it. The rule
   * is narrow in both directions because `pnpm build` is the slowest command the advisor recommends.
   */
  it('suggests a real export when the app shell changes, and not for an ordinary page', () => {
    const shell = suggestFocusedChecks(['src/app/providers/AppShell.tsx']);
    assert.ok(
      shell.commands.some((row) => row.command === 'pnpm build'),
      'a shell change must ask for a real static export',
    );

    const page = suggestFocusedChecks(['src/views/agents/ui/AgentsPage.tsx']);
    assert.ok(
      !page.commands.some((row) => row.command === 'pnpm build'),
      'an ordinary page must not drag the slowest command in the advisor with it',
    );
  });

  it('suggests lint, contracts, and the a11y ratchets for Next app route entries', () => {
    const result = suggestFocusedChecks([
      'app/layout.tsx',
      'app/page.tsx',
      'app/sitemap.ts',
      'app/[locale]/docs/page.tsx',
      'next-env.d.ts',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 app/layout.tsx app/page.tsx app/sitemap.ts app/[locale]/docs/page.tsx',
      'pnpm test:contracts',
      'pnpm typecheck',
      'pnpm exec playwright test tests/e2e/design-audits/a11y-ratchet.spec.ts tests/e2e/design-audits/contrast-ratchet.spec.ts',
      'pnpm decisions:check',
    ]);
  });

  // A new view file plus a new route must suggest the lint carrying the design spec, the contracts
  // that classify routes, and the two ratchets that measure, not only `pnpm typecheck`.
  it('suggests the design and a11y gates for a brand-new view and route', () => {
    const result = suggestFocusedChecks([
      'src/views/brand-new-surface/ui/BrandNewPage.tsx',
      'app/[locale]/brand-new/page.tsx',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/views/brand-new-surface/ui/BrandNewPage.tsx app/[locale]/brand-new/page.tsx',
      'pnpm test:contracts',
      'pnpm typecheck',
      'pnpm exec playwright test tests/e2e/design-audits/a11y-ratchet.spec.ts tests/e2e/design-audits/contrast-ratchet.spec.ts',
      'pnpm decisions:check',
      'pnpm exec playwright test tests/e2e/design-audits/scroll-end-gap.spec.ts',
    ]);
  });

  it('suggests i18n message parity and typecheck for locale routing changes', () => {
    const result = suggestFocusedChecks([
      'src/i18n/routing.ts',
      'src/i18n/request.ts',
      'src/i18n/navigation.ts',
      'messages/en.json',
      'messages/ko.json',
      'scripts/i18n/validate-messages.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/i18n/validate-messages.test.mjs',
      'pnpm exec eslint --max-warnings 0 src/i18n/routing.ts src/i18n/request.ts src/i18n/navigation.ts',
      'pnpm typecheck',
      'pnpm test:desktop:check',
      'pnpm test:i18n:messages',
      'pnpm test:contracts',
    ]);
  });

  it('suggests lint when ESLint config changes', () => {
    const result = suggestFocusedChecks(['eslint.config.mjs']);

    assert.deepEqual(domainCommands(result), ['pnpm lint']);
  });

  it('suggests typecheck and repo-analysis gates when TS config changes', () => {
    const result = suggestFocusedChecks(['tsconfig.json']);

    assert.deepEqual(domainCommands(result), [
      'pnpm integration:mcp:repo-analysis',
      'pnpm typecheck',
      'pnpm integration:cli:repo-analysis',
    ]);
  });

  it('routes every E2E scope surface to the direct workflow contracts', () => {
    const command =
      'pnpm exec vitest run tests/contract/ci-gates/e2e-change-scope.contract.test.ts tests/contract/ci-gates/e2e-suite-split.contract.test.ts tests/contract/ci-gates/ci-bounded-network.contract.test.ts';
    const paths = [
      '.github/workflows/e2e.yml',
      '.github/actions/setup-playwright/action.yml',
      'tests/contract/ci-gates/e2e-change-scope.contract.test.ts',
      'tests/contract/ci-gates/e2e-suite-split.contract.test.ts',
      'tests/contract/ci-gates/ci-bounded-network.contract.test.ts',
    ];

    assert.ok(paths.length > 0, 'the E2E scope surface inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes(command),
        `${path} must recommend the E2E workflow contracts`,
      );
    }
  });

  it('suggests docs and package contracts for GitHub quality-gate files', () => {
    const result = suggestFocusedChecks([
      '.github/workflows/release-macos.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ]);

    assert.deepEqual(domainCommands(result), [
      // The release workflow is also where the MCP ecosystem bundle is built and
      // uploaded, so editing it re-checks that the registry entry still points at
      // an artifact the release actually carries.
      'pnpm test:mcp:bundle && pnpm mcp:registry:check',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
      'pnpm acp:registry:check',
      // A workflow is where a node:test suite becomes reachable or stops being
      // reachable, so editing one re-checks that nothing now runs nowhere.
      'pnpm exec vitest run tests/contract/harness/agent-files.contract.test.ts tests/contract/agent-instructions/nested-agents-pointers.contract.test.ts tests/contract/agent-instructions/skill-routing.contract.test.ts tests/contract/agent-instructions/rules-path-scope.contract.test.ts tests/contract/security/secret-read-guard.contract.test.ts tests/contract/ci-gates/node-test-reachability.contract.test.ts tests/contract/agent-instructions/agent-file-citations.contract.test.ts',
      'pnpm test:mcp:package',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm package:check']);
  });

  it('suggests docs contracts for GitHub community templates', () => {
    const result = suggestFocusedChecks([
      '.github/DISCUSSIONS-CATEGORIES.md',
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/config.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/ISSUE_TEMPLATE/onboarding_friction.yml',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
    ]);
    assert.deepEqual(result.escalations, []);
  });

  it('runs a changed test and every suite and contract that reaches a changed file through imports', () => {
    const result = suggestFocusedChecks([
      'src/shared/lib/cn.ts',
      'src/shared/lib/cn.test.ts',
      'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
    ]);
    const row = (prefix) => result.commands.find((item) => item.command.startsWith(prefix));
    assert.deepEqual(row('pnpm exec vitest run src/').paths, ['src/shared/lib/cn.test.ts']);
    assert.deepEqual(row('pnpm exec vitest related ').paths, ['src/shared/lib/cn.ts', 'src/widgets/docs-vault/ui/DocsVaultEditor.tsx']);
    assert.match(row('pnpm exec vitest related ').command, /--exclude='tests\/contract\/\*\*'/);
    // A `.tsx` change already runs the whole contract suite, so no contract is named.
    assert.ok(commandNames(result).includes('pnpm test:contracts'));
    assert.equal(result.commands.filter((item) => item.importGraph).length, 1);

    // MCP code joins the Vitest rows when a suite or contract reaches it.
    const mcp = suggestFocusedChecks(['mcp/src/architecture/architecture-profile.mjs']).commands.filter((item) => item.importGraph);
    assert.match(mcp[0].command, /^pnpm exec vitest related .* mcp\/src\/architecture\/architecture-profile\.mjs$/);
    assert.ok(mcp[1].command.split(' ').includes('tests/contract/harness/architecture-profile.contract.test.ts'));
    assert.deepEqual(mcp[1].paths, ['mcp/src/architecture/architecture-profile.mjs']);

    // A deleted file is gone from Vitest's graph; the suites still importing it run by name.
    const deleted = suggestFocusedChecks([], { deletedPaths: ['mcp/src/architecture/architecture-profile.mjs'] }).commands;
    const stale = 'src/views/architecture/model/analysis-architecture-record.test.ts';
    assert.ok(deleted.some((item) => item.importGraph && item.command.split(' ').includes(stale)));
  });

  it('suggests lint, related suites and typecheck for app/source TypeScript files without sibling tests', () => {
    const result = suggestFocusedChecks([
      'src/shared/config/site.ts',
      'src/shared/lib/theme.ts',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/shared/config/site.ts src/shared/lib/theme.ts',
      'pnpm typecheck',
    ]);
  });

  it('keeps personal-save and verified-status journeys on their entry owners', () => {
    for (const path of ['src/views/first-run/ui/FirstRunPage.tsx', 'src/views/home/ui/TopologyCommandChrome.tsx', 'src/features/agent-activity/ui/AgentActivityChip.tsx']) {
      const result = suggestFocusedChecks([path]);
      const row = result.commands.find((r) => r.command.includes('retired-game-storage.spec.ts'));
      assert.ok(row, `missing retirement journey for ${path}`);
      assert.match(row.command, /agent-mascot-presence\.spec\.ts/);
    }
  });

  it('suggests the map viewport framing E2E for the exact camera-obstacle source owners', () => {
    const paths = [
      'src/widgets/ontology-map/interaction/free-area.ts',
      'src/views/home/ui/HomePage.tsx',
    ];
    const command = 'pnpm exec playwright test tests/e2e/map/camera/map-viewport-reframe.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests the insights count E2E for the analysis model, board model, page, workspace, and board', () => {
    const paths = [
      'src/views/ontology-insights/lib/analysis-model.ts',
      'src/views/ontology-insights/lib/analysis-board.ts',
      'src/views/ontology-insights/ui/OntologyInsightsPage.tsx',
      'src/views/ontology-insights/ui/analysis/AnalysisWorkspace.tsx',
      'src/views/ontology-insights/ui/analysis/ProjectBoard.tsx',
    ];
    const command = 'pnpm exec playwright test tests/e2e/insights/insights-badge-agreement.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests both framing and legacy-route E2Es for their shared HomePage owner', () => {
    const result = suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']);
    const commands = commandNames(result).filter(
      (command) =>
        command.includes('tests/e2e/map/camera/map-viewport-reframe.spec.ts') ||
        command.includes('tests/e2e/gateway/ontology-ui.spec.ts'),
    );

    assert.deepEqual(commands, [
      'pnpm exec playwright test tests/e2e/map/camera/map-viewport-reframe.spec.ts',
      'pnpm exec playwright test tests/e2e/gateway/ontology-ui.spec.ts',
    ]);
  });

  it('suggests the contextual meaning-editor E2E for the exact change-review owner', () => {
    const paths = ['src/features/ontology-change-review/ui/OntologyChangeReview.tsx'];
    const command = 'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests the touch-target E2E for the selected-node panel owner', () => {
    const paths = ['src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx'];
    const command = 'pnpm exec playwright test tests/e2e/gateway/touch-target-contract.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('does not broaden installed-audit E2E mappings to neighboring tests or helpers', () => {
    const protectedCommands = new Set([
      'pnpm exec playwright test tests/e2e/map/camera/map-viewport-reframe.spec.ts',
      'pnpm exec playwright test tests/e2e/insights/insights-badge-agreement.spec.ts',
      'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts',
      'pnpm exec playwright test tests/e2e/gateway/ontology-ui.spec.ts',
      'pnpm exec playwright test tests/e2e/gateway/touch-target-contract.spec.ts',
    ]);
    const result = suggestFocusedChecks([
      'src/widgets/ontology-map/interaction/free-area.test.ts',
      'src/views/home/model/inspector/use-node-datasheet-model.ts',
      'src/views/ontology-insights/lib/analysis-model.test.ts',
      'src/views/ontology-insights/ui/analysis/AnalysisRecords.tsx',
      'src/features/ontology-change-review/ui/OntologyChangeReview.test.tsx',
      'src/widgets/ontology-map/ui/OntologyMapDetailPanel.test.tsx',
    ]);

    assert.deepEqual(
      commandNames(result).filter((command) => protectedCommands.has(command)),
      [],
    );
  });

  it('suggests direct Playwright specs for changed e2e tests', () => {
    const result = suggestFocusedChecks([
      'tests/e2e/gateway/ontology-ui.spec.ts',
      'tests/e2e/vault-session/local-vault-picker.spec.ts',
    ]);

    /*
     * `tsc` is appended: e2e specs are TypeScript and `tsconfig.json` includes every .ts file, so CI's
     * `tsc --noEmit` checks them. The direct spec still comes first.
     */
    assert.deepEqual(domainCommands(result), [
      'pnpm exec playwright test tests/e2e/gateway/ontology-ui.spec.ts',
      'pnpm exec playwright test tests/e2e/vault-session/local-vault-picker.spec.ts',
      // A spec may not add a fixed sleep.
      'pnpm test:e2e:sleeps && pnpm e2e:sleeps:check',
      'pnpm typecheck',
    ]);
  });

  it('suggests focused smoke checks for test runner config changes', () => {
    const vitest = suggestFocusedChecks(['vitest.config.ts', 'vitest.setup.ts']);

    assert.deepEqual(domainCommands(vitest), [
      'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-format/vault-schema.contract.test.ts',
    ]);

    const playwright = suggestFocusedChecks(['playwright.config.ts']);

    assert.deepEqual(domainCommands(playwright), [
      'pnpm exec playwright test tests/e2e/vault-session/local-vault-picker.spec.ts',
    ]);
  });

  it('suggests the token gates and overflow smoke for global styling changes', () => {
    const result = suggestFocusedChecks(['postcss.config.mjs', 'app/globals.css', 'app/styles/tokens.css']);

    assert.deepEqual(domainCommands(result), [
      'pnpm check:tokens',
      TOKEN_GATES_COMMAND,
      'pnpm exec playwright test tests/e2e/design-audits/overflow-sweep.spec.ts',
      'pnpm exec playwright test tests/e2e/typography/hangul-tracking.spec.ts',
      'pnpm exec playwright test tests/e2e/typography/prose-measure-calibration.spec.ts',
      'pnpm exec playwright test tests/e2e/settings/text-zoom-ramp.spec.ts',
    ]);
    assert.ok(!commandNames(suggestFocusedChecks(['postcss.config.mjs'])).includes(TOKEN_GATES_COMMAND));
  });

  it('suggests focused benchmark and onboarding smoke checks', () => {
    const result = suggestFocusedChecks([
      'scripts/benchmark/benchmark.mjs',
      'scripts/benchmark/benchmark-change-flow.mjs',
      'scripts/benchmark/benchmark-scale.mjs',
      'scripts/perf/perf-vault.mjs',
      'scripts/perf/perf-graph.mjs',
      'scripts/dogfood/smoke-clean-onboarding.mjs',
      'scripts/dogfood/smoke-memory-loop.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/benchmark/benchmark-change-flow.test.mjs',
      'pnpm benchmark --dry-run',
      'pnpm benchmark:change-flow --dry-run',
      'pnpm benchmark:scale --dry-run',
      'node scripts/perf/perf-vault.mjs 10',
      'node --test scripts/perf/perf-graph.test.mjs',
      'pnpm perf:graph:check',
      'pnpm perf:graph:scale',
      'pnpm smoke:onboarding',
      'pnpm smoke:memory-loop',
    ]);
  });

  it('suggests script-reference checks for docs whose pnpm references are scanned', () => {
    const result = suggestFocusedChecks([
      'README.md',
      'docs/DEVELOPMENT-CHECKS.md',
      'docs/benchmark/README.md',
      'mcp/README.md',
      'cli/README.md',
      'scripts/migrations/README.md',
      '.claude/rules/testing.md',
      '.claude/skills/ontology-bootstrap/SKILL.md',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:build',
      'pnpm exec vitest run tests/contract/vault-data/bundled-vault-budget.contract.test.ts',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm docs:meta && pnpm docs:move -- --check',
      'pnpm docs:surface:check',
      'pnpm vault:migrate --list',
      'pnpm test:dogfood:script-refs',
      'pnpm dev-checks:check',
      // `.claude/rules/testing.md` and the skill are agent files, and a rule's
      // globs are what the nested `AGENTS.md` pointers derive from.
      'pnpm agents:check',
      'pnpm exec vitest run tests/contract/harness/agent-files.contract.test.ts tests/contract/agent-instructions/nested-agents-pointers.contract.test.ts tests/contract/agent-instructions/skill-routing.contract.test.ts tests/contract/agent-instructions/rules-path-scope.contract.test.ts tests/contract/security/secret-read-guard.contract.test.ts tests/contract/ci-gates/node-test-reachability.contract.test.ts tests/contract/agent-instructions/agent-file-citations.contract.test.ts',
      'pnpm test:mcp:docs',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI and MCP verify gates without jumping straight to full suites', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/agent-setup/mcp-verify.mjs',
      'mcp/scripts/verify.mjs',
      'scripts/packaging/smoke-packed-cli.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm integration:cli:mcp-verify',
      'pnpm test:mcp:package',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), [
      'pnpm package:check',
      'pnpm dogfood:verify',
    ]);
  });

  it('routes the split verify modules like the verify entry', () => {
    assert.deepEqual(
      domainCommands(suggestFocusedChecks(['mcp/scripts/verify/checks/compile.mjs'])),
      domainCommands(suggestFocusedChecks(['mcp/scripts/verify.mjs'])),
    );
  });

  it('runs source-checkout MCP dependency guard tests from every implementation path', () => {
    assert.deepEqual(
      domainCommands(suggestFocusedChecks(['cli/src/lib/mcp-bridge/mcp-module.mjs'])),
      [
        'pnpm exec node --test cli/src/lib/mcp-bridge/mcp-module.test.mjs',
        'pnpm test:cli:lib',
        'pnpm vault:validate',
      ],
    );
    assert.deepEqual(
      domainCommands(
        suggestFocusedChecks(['scripts/lib/dogfood-walk/check-mcp-source-dependencies.mjs']),
      ),
      [
        'pnpm exec node --test scripts/lib/dogfood-walk/check-mcp-source-dependencies.test.mjs',
        'pnpm test:dogfood:script-refs',
      ],
    );
  });

  it('suggests package contracts for lockfile changes', () => {
    const rootLock = suggestFocusedChecks(['pnpm-lock.yaml']);

    assert.deepEqual(domainCommands(rootLock), ['pnpm test:mcp:package', 'pnpm licenses:check', 'pnpm notice:check']);
    assert.deepEqual(rootLock.escalations.map((row) => row.command), ['pnpm package:check']);

    const mcpLock = suggestFocusedChecks(['mcp/pnpm-lock.yaml']);

    assert.ok(domainCommands(mcpLock).includes('pnpm test:mcp:package'));
    assert.deepEqual(mcpLock.escalations.map((row) => row.command), ['pnpm package:check', 'pnpm dogfood:verify']);
  });

  it('suggests narrow MCP verify tests before the full verify helper gate', () => {
    const result = suggestFocusedChecks([
      'mcp/scripts/verify.mjs',
      'mcp/src/verify-script.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/verify-script.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused CLI diagnosis integration for health, agent-brief, and workspace-brief commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/diagnosis/health.mjs',
      'cli/src/commands/diagnosis/agent-brief.mjs',
      'cli/src/commands/diagnosis/workspace-brief.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:diagnosis',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI graph-read integration for read-only graph commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/graph-traversal/backlinks.mjs',
      'cli/src/commands/graph-traversal/path.mjs',
      'cli/src/commands/graph-traversal/all-paths.mjs',
      'cli/src/commands/graph-write/relation-check.mjs',
      'cli/src/commands/graph-query/node-profile.mjs',
      'cli/src/commands/graph-query/similar.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:graph-read',
      'pnpm vault:validate',
    ]);
  });

  it('suggests CLI plan output unit and graph-read integration for query_plan output helpers', () => {
    const result = suggestFocusedChecks(['cli/src/lib/query-plan-output.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test cli/src/lib/query-plan-output.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:graph-read',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI graph-write integration for destructive graph commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/graph-write/rename.mjs',
      'cli/src/commands/graph-write/delete.mjs',
      'cli/src/commands/graph-write/merge.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:graph-write',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI repo-analysis integration for code-to-vault commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/repo-analysis/analyze.mjs',
      'cli/src/commands/repo-analysis/infer-imports.mjs',
      'cli/src/commands/repo-analysis/bootstrap.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:repo-analysis',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI local vault integration for frontmatter commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/local-vault/add.mjs',
      'cli/src/commands/local-vault/import.mjs',
      'cli/src/commands/local-vault/list.mjs',
      'cli/src/commands/local-vault/find.mjs',
      'cli/src/commands/local-vault/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:contracts',
      'pnpm integration:cli:local-vault',
      'pnpm vault:validate',
    ]);
  });

  it('suggests the advisor self-test when the focused-check advisor changes', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/ci/focused-check-suggestions.mjs',
      'scripts/ci/suggest-focused-checks.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/lib/ci/focused-check-suggestions.test.mjs',
      'pnpm exec node --test scripts/ci/suggest-focused-checks.test.mjs',
      'pnpm test:ci:impact',
      'pnpm test:checks:changed',
    ]);
  });

  it('routes every CI impact surface to its planner and executor contract', () => {
    const paths = [
      'scripts/ci/classify-change.mjs',
      'scripts/ci/classify-change.test.mjs',
      'scripts/ci/run-ci-lane.mjs',
      'scripts/ci/run-ci-lane.test.mjs',
      'scripts/lib/ci/focused-check-suggestions.mjs',
      'scripts/lib/ci/focused-check-suggestions.test.mjs',
      'scripts/ci/suggest-focused-checks.mjs',
      'scripts/ci/suggest-focused-checks.test.mjs',
      '.github/workflows/checks.yml',
      '.github/workflows/e2e.yml',
      '.github/actions/setup-playwright/action.yml',
    ];

    assert.ok(paths.length > 0, 'CI impact surface inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes('pnpm test:ci:impact'),
        `${path} must recommend the CI impact contract`,
      );
    }
  });

  it('routes every active PO policy surface to the outcome-router and sunset contracts', () => {
    const commands = ['pnpm test:po', 'pnpm po:pilot -- --check'];
    const paths = [
      'scripts/lib/records/po-risk-router.mjs',
      'scripts/records/po-risk-router.mjs',
      'scripts/lib/records/po-pilot.mjs',
      'scripts/records/po-pilot.mjs',
      'scripts/records/check-decision-record.mjs',
      'tests/contract/agent-instructions/po-route.contract.test.ts',
      'tests/contract/agent-instructions/reviewer-wiring.contract.test.ts',
      'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md',
      'docs/PO-PILOT.md',
      '.claude/skills/product-check/SKILL.md',
      '.agents/skills/product-check/SKILL.md',
      '.claude/agents/reviewer.md',
      '.agents/agents/reviewer.md',
      'AGENTS.md',
      'package.json',
    ];

    assert.ok(paths.length > 0, 'the PO policy path inventory must not be empty');
    for (const path of paths) {
      const suggested = commandNames(suggestFocusedChecks([path]));
      for (const command of commands) {
        assert.ok(suggested.includes(command), `${path} must recommend ${command}`);
      }
    }
  });

  it('routes every active design policy surface to the fact-derived proof contracts', () => {
    const paths = [
      'scripts/lib/design/design-proof-router.mjs',
      'scripts/design/design-proof-router.mjs',
      'scripts/lib/design/design-spec-census.mjs',
      'scripts/records/check-decision-record.mjs',
      'tests/contract/agent-instructions/design-proof-router.contract.test.ts',
      'tests/contract/agent-instructions/design-spec-ledger.contract.test.ts',
      'tests/contract/agent-instructions/reviewer-wiring.contract.test.ts',
      'docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md',
      '.claude/skills/ui-build/SKILL.md',
      '.agents/skills/ui-proof/SKILL.md',
      '.claude/agents/design-guardian.md',
      '.agents/agents/reviewer.md',
      '.claude/rules/design.md',
      'AGENTS.md',
      'package.json',
    ];

    assert.ok(paths.length > 0, 'the design policy path inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes('pnpm test:design-gates'),
        `${path} must recommend the design gate contracts`,
      );
    }
  });

  it('suggests docs contracts when the shared package contract test changes', () => {
    const result = suggestFocusedChecks([
      'scripts/packaging/check-package-contracts.mjs',
      'scripts/packaging/check-package-contracts.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/packaging/check-package-contracts.test.mjs',
      'pnpm test:mcp:package',
      'pnpm test:mcp:docs',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/packaging/check-package-contracts.mjs',
      'scripts/packaging/check-package-contracts.test.mjs',
    ]);
  });

  it('formats no-change and mapped suggestions for terminal use', () => {
    assert.match(formatFocusedCheckSuggestions(suggestFocusedChecks([])), /no changed paths/);

    const output = formatFocusedCheckSuggestions(suggestFocusedChecks(['scripts/dogfood/dogfood-status.mjs']));
    assert.match(output, /\[focused-checks\] 1 changed path/);
    assert.match(output, /pnpm test:dogfood:status/);
    assert.match(output, /pnpm test:mcp:maintenance/);
    assert.match(output, /pnpm vault:validate/);
  });

  it('recommends the grid check when the gateway board, chrome or origin changes', () => {
    // Editing the gateway layout must suggest its grid check; a check the advisor cannot point at does
    // not exist.
    const grid = 'pnpm exec playwright test tests/e2e/gateway/download-gateway-grid.spec.ts';
    for (const path of [
      'src/views/download/ui/DownloadPage.tsx',
      'src/widgets/gateway-chrome/ui/GatewayNav.tsx',
      'src/widgets/gateway-chrome/ui/GatewayReadingLinks.tsx',
      'src/shared/lib/public-pages/gateway-frame.ts',
    ]) {
      assert.ok(
        suggestFocusedChecks([path]).commands.some((s) => s.command === grid),
        `${path} changed but the gateway grid check is not recommended`,
      );
    }
    // Idling guard — a rule that attaches to any path is noise, not a rule.
    assert.ok(
      !suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']).commands.some((s) => s.command === grid),
      'the grid check is recommended for screens unrelated to the gateway; the rule is too broad',
    );
  });

  it('recommends the capability-claim gate too when the copy catalog changes', () => {
    // Editing the message catalogue must also suggest the desktop gate that pins capability claims,
    // not only catalogue consistency.
    const commands = commandNames(suggestFocusedChecks(['messages/ko.json']));
    assert.ok(commands.includes('pnpm test:i18n:messages'), 'the catalog consistency check is not recommended');
    assert.ok(
      commands.includes('pnpm test:desktop:check'),
      'copy changed but the capability-claim gate is not recommended',
    );
    // Idling guard — a rule that attaches to any path is noise, not a rule.
    assert.ok(
      !suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']).commands.some(
        (s) => s.command === 'pnpm test:desktop:check',
      ),
      'the desktop gate is recommended for screens unrelated to copy; the rule is too broad',
    );
  });

  /**
   * `tsconfig` decides the reach of type checking, not the advisor: vitest does not check types, and
   * `tsconfig.json` includes every .ts file, so test files need `tsc` too.
   */
  it('recommends the type check for everything tsconfig covers, test files included', () => {
    const typecheck = (path) =>
      suggestFocusedChecks([path]).commands.some(
        (s) => s.command === 'pnpm typecheck',
      );

    assert.ok(typecheck('tests/contract/release/release-preflight.contract.test.ts'), 'tests/**');
    assert.ok(typecheck('src/shared/lib/cn.test.ts'), 'a test file in src');

    // What already worked still works — confirming the reach was widened without narrowing.
    assert.ok(typecheck('src/shared/lib/cn.ts'), 'product code in src');
    assert.ok(typecheck('app/[locale]/agents/page.tsx'), 'app/**');
    assert.ok(typecheck('tsconfig.json'), 'tsconfig itself');
  });

  it('does not recommend the type check for untyped files, so it is not merely widened', () => {
    const typecheck = (path) =>
      suggestFocusedChecks([path]).commands.some(
        (s) => s.command === 'pnpm typecheck',
      );
    assert.ok(!typecheck('docs/DECISIONS.md'));
    assert.ok(!typecheck('scripts/docs-vault/build-docs-vault.mjs'));
  });

  /**
   * Do not use a readout as a gate: `dogfood:status` exits 1 on an immature graph, which would block
   * every vault-editing push for an unrelated reason.
   */
  it('also recommends the copy gate for Markdown rendered on screen', () => {
    // The integrity check and the copy check measure different things: an em dash in vault prose
    // passes `vault:validate`.
    const prose = 'pnpm test:run tests/contract/copy/em-dash-ratchet.contract.test.ts';
    for (const path of [
      'docs/ontology/elements/agents-destination.md',
      'docs/guide/getting-started.md',
      'samples/storefront/domains/catalog.md',
      'docs/CHANGELOG.md',
    ]) {
      const commands = domainCommands(suggestFocusedChecks([path]));
      assert.ok(commands.includes(prose), `the copy gate is not recommended for ${path}`);
    }
    // Does not drag in the vault's non-markdown files.
    const other = commandNames(suggestFocusedChecks(['src/views/agents/ui/AgentsPage.tsx']));
    assert.ok(!other.includes(prose), 'the copy gate is recommended for an unrelated code change');
  });

  it('recommends the check that reports only what is broken for vault changes', () => {
    const commands = commandNames(suggestFocusedChecks(['docs/ontology/README.md']));
    assert.ok(commands.includes('pnpm vault:validate'), 'the integrity check is not recommended');
    assert.ok(
      // `test:dogfood:status` (that script's unit tests) is a legitimate gate — it
      // measures whether the script runs correctly, not whether the graph is mature.
      !commands.includes('pnpm dogfood:status'),
      'readiness reading material is recommended as a gate; it still exits 1 even when less mature',
    );
  });
});

describe('agent-file surface', () => {
  it('recommends the agent-file gate for every tree it inventories', () => {
    for (const path of [
      'CLAUDE.md',
      'AGENTS.md',
      'src/AGENTS.md',
      '.claude/agents/reviewer.md',
      '.claude/skills/product-check/SKILL.md',
      '.claude/settings.json',
      '.agents/skills/product-check/SKILL.md',
      '.agents/agents/reviewer.md',
      '.codex/hooks.json',
      '.mcp.json',
      'cli/src/lib/agent-setup/agent-files.mjs',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes('pnpm agents:check'),
        `${path} must recommend pnpm agents:check`,
      );
    }
  });

  it('leaves the starter-vault templates out — they are product data', () => {
    for (const path of ['cli/templates/vault/AGENTS.md', 'cli/templates/vault-ko/AGENTS.md']) {
      assert.ok(
        !domainCommands(suggestFocusedChecks([path])).includes('pnpm agents:check'),
        `${path} is a shipped starter vault, not this repository's agent surface`,
      );
    }
  });

  it('recommends the hook tests for every hook script, not a chosen two', () => {
    for (const path of [
      '.claude/hooks/block-unsafe-git.sh',
      '.claude/hooks/block-generated-edit.sh',
      '.claude/hooks/block-npm-publish.sh',
      '.claude/hooks/inject-ontology-summary.sh',
      '.claude/hooks/fast-sensor.sh',
      '.codex/hooks/block-unsafe-git.sh',
      '.githooks/commit-msg',
      '.githooks/commit-msg-language.mjs',
      '.codex/hooks/block-secret-read.sh',
      '.gitignore',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes('pnpm test:claude:hooks'),
        `${path} must recommend pnpm test:claude:hooks`,
      );
    }
  });

  it('recommends the paired contracts when either implementation moves alone', () => {
    const contract =
      'pnpm exec vitest run tests/contract/harness/agent-files.contract.test.ts tests/contract/agent-instructions/nested-agents-pointers.contract.test.ts tests/contract/agent-instructions/skill-routing.contract.test.ts tests/contract/agent-instructions/rules-path-scope.contract.test.ts tests/contract/security/secret-read-guard.contract.test.ts tests/contract/ci-gates/node-test-reachability.contract.test.ts tests/contract/agent-instructions/agent-file-citations.contract.test.ts';
    for (const path of [
      'cli/src/lib/agent-setup/agent-files.mjs',
      'src/entities/agent-files/model/agent-files.ts',
      'tests/fixtures/agent-files-cases.mjs',
      '.claude/rules/testing.md',
      'src/AGENTS.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/rules/forbidden.md',
      '.claude/settings.json',
      '.gitignore',
      '.claude/skills/product-check/SKILL.md',
      '.agents/skills/product-check/SKILL.md',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes(contract),
        `${path} must recommend the agent-files and nested-pointer contracts`,
      );
    }
  });
});

describe('deleted paths participate in rule matching without reaching file-reading commands', () => {
  // Deletions must still take part in rule matching: a deletion-only change must not print "nothing
  // to run" (a deleted route still needs decisions:check, a deleted vault doc docs-vault:check).
  it('a deleted vault doc still suggests the docs-vault and ledger checks', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['docs/ontology/capabilities/gone.md'],
    });
    const commands = suggestions.commands.map((c) => c.command);
    assert.ok(commands.includes('pnpm docs-vault:build'), commands.join('\n'));
    assert.deepEqual(suggestions.deletedPaths, ['docs/ontology/capabilities/gone.md']);
  });

  it('a deleted route file still suggests decisions:check', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['app/[locale]/foo/page.tsx'],
    });
    const commands = suggestions.commands.map((c) => c.command);
    assert.ok(commands.includes('pnpm decisions:check'), commands.join('\n'));
  });

  it('no per-file command embeds a deleted path', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['src/views/gone/ui/GonePage.tsx'],
    });
    for (const c of suggestions.commands) {
      assert.ok(!c.command.includes('GonePage'), c.command);
    }
  });
});

describe('rule files under scripts/lib/check-rules are the registry', () => {
  // A new check is a new file in the registry directory; this proves the file alone is enough.
  it('picks up a new rule file without editing any other file', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'check-rules-'));
    try {
      const directory = join(scratch, 'check-rules');
      cpSync(CHECK_RULES_DIRECTORY, directory, { recursive: true });
      const before = await loadCheckRules(pathToFileURL(`${directory}/`));
      writeFileSync(
        join(directory, 'zz-new-area.mjs'),
        [
          'export const rules = [',
          "  { command: 'pnpm test:new-area', reason: 'new area changed', matches: [/^new-area\\//] },",
          '];',
          'export const directTests = {',
          "  script: [['scripts/new-area.mjs', 'scripts/new-area.test.mjs']],",
          '};',
          '',
        ].join('\n'),
      );
      const after = await loadCheckRules(pathToFileURL(`${directory}/`));

      assert.deepEqual(after.rules.slice(0, -1), before.rules);
      assert.equal(after.rules.at(-1).command, 'pnpm test:new-area');
      assert.ok(after.rules.at(-1).matches[0].test('new-area/x.mjs'));
      assert.equal(after.directTests.script.bySource.get('scripts/new-area.mjs'), 'scripts/new-area.test.mjs');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('sorts by order, then file name, then position, with unordered rules last', () => {
    const rule = (command, order) => ({ command, reason: command, matches: [/x/], ...(order === undefined ? {} : { order }) });
    const { rules } = composeCheckRules([
      { name: 'b.mjs', module: { rules: [rule('b-unordered'), rule('b-20', 20)] } },
      { name: 'a.mjs', module: { rules: [rule('a-20', 20), rule('a-unordered'), rule('a-10', 10)] } },
    ]);
    assert.deepEqual(
      rules.map((row) => row.command),
      ['a-10', 'a-20', 'b-20', 'a-unordered', 'b-unordered'],
    );
  });

  it('refuses a malformed rule or two files mapping one source to different tests', () => {
    assert.throws(
      () => composeCheckRules([{ name: 'bad.mjs', module: { rules: [{ command: 'x', reason: 'y', matches: ['not-a-regexp'] }] } }]),
      /check-rules\/bad\.mjs: rules\[0\]/,
    );
    assert.throws(
      () =>
        composeCheckRules([
          { name: 'a.mjs', module: { directTests: { script: [['s.mjs', 'a.test.mjs']] } } },
          { name: 'b.mjs', module: { directTests: { script: [['s.mjs', 'b.test.mjs']] } } },
        ]),
      /check-rules\/b\.mjs: s\.mjs already maps to a\.test\.mjs/,
    );
  });

  it('treats a rule file as advisor and CI-planner surface', () => {
    const commands = commandNames(suggestFocusedChecks(['scripts/lib/check-rules/mcp.mjs']));
    assert.ok(commands.includes('pnpm test:checks:changed'), commands.join('\n'));
    assert.ok(commands.includes('pnpm test:ci:impact'), commands.join('\n'));
  });
});

describe('security surfaces', () => {
  const securityRow = (path) =>
    suggestFocusedChecks([path]).commands.find((row) => row.command === SECURITY_COMMAND);

  it('asks for the security lens where untrusted input meets a capability', () => {
    for (const path of [
      'mcp/src/vault/documents.mjs',
      'src-tauri/src/lib.rs',
      '.github/workflows/checks.yml',
      'pnpm-lock.yaml',
      'mcp/pnpm-lock.yaml',
      'src/shared/lib/desktop-shell/tauri-external-link.ts',
      'src/features/acp-session/model/acp-client.ts',
    ]) {
      assert.match(securityRow(path)?.reason ?? '', /`security` lens/, path);
    }
  });

  it('runs the security contracts without the lens where vault or agent text is rendered', () => {
    for (const path of ['src/widgets/docs-vault/ui/DocsVaultViewer.tsx', 'src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx']) {
      const row = securityRow(path);
      assert.ok(row, path);
      assert.doesNotMatch(row.reason, /`security` lens/, path);
    }
  });

  it('stays silent outside every security surface', () => {
    for (const path of ['src/shared/lib/cn.ts', 'mcp/src/vault/vault.test.mjs', 'docs/README.md', 'cli/src/index.mjs']) {
      assert.equal(securityRow(path), undefined, path);
    }
  });
});

describe('message catalogue related-tests rule', () => {
  it('names the composite of every locale it is given', () => {
    assert.equal(
      relatedMessagesCommand(['en', 'ja', 'ko', 'zh']),
      "pnpm exec vitest related --run --passWithNoTests --exclude='tests/contract/**' messages/en.json messages/ja.json messages/ko.json messages/zh.json",
    );
    assert.equal(relatedMessagesCommand(), relatedMessagesCommand(['en', 'ja', 'ko', 'zh']));
  });
});

describe('node tests for a changed script', () => {
  const commandsFor = (paths) => suggestFocusedChecks(paths).commands.map((item) => item.command);

  it('suggests the tests that import the script by its resolved path, not by its file name', () => {
    const markdown = commandsFor(['scripts/quality/markdown-language/inventory.mjs']);
    assert.ok(markdown.includes('pnpm exec node --test scripts/quality/markdown-language/inventory.test.mjs'));
    assert.ok(!markdown.includes('pnpm exec node --test scripts/quality/source-language/inventory.test.mjs'));
    assert.ok(commandsFor(['scripts/lib/design/ui-audit-checks.mjs']).includes('pnpm exec node --test scripts/design/ui-audit.test.mjs'));
  });

  it('lists a command once even when two rules reach it', () => {
    const commands = commandsFor(['scripts/lib/ci/focused-check-suggestions.mjs', 'scripts/ci/suggest-focused-checks.mjs']);
    assert.equal(commands.length, new Set(commands).size);
  });
});

describe('files changed only in comments', () => {
  it('keep their lint and language checks but run none of their tests', () => {
    const paths = ['tests/e2e/map/camera/map-viewport-reframe.spec.ts', 'src/widgets/ontology-map/interaction/free-area.ts', 'scripts/harness/review-facts.mjs'];
    const all = suggestFocusedChecks(paths).commands.map((item) => item.command);
    const skipped = suggestFocusedChecks(paths, { commentOnlyPaths: paths }).commands.map((item) => item.command);
    const tests = (commands) => commands.filter((command) => /playwright test|vitest related|node --test/.test(command));
    assert.ok(tests(all).length >= 3);
    assert.deepEqual(tests(skipped), []);
    assert.ok(skipped.some((command) => command.includes('source-comment-bytes')), 'comment ratchets still run');
    const config = suggestFocusedChecks(['eslint.config.mjs'], { commentOnlyPaths: ['eslint.config.mjs'] }).commands.map((item) => item.command);
    assert.ok(!config.includes('pnpm lint'), 'a comment in the lint config does not rerun the whole lint');
    assert.ok(skipped.includes(SOURCE_LANGUAGE_COMMAND));
    assert.ok(skipped.some((command) => command.startsWith('pnpm exec eslint')));
  });
});


describe('rendered UI audit coverage', () => {
  it('routes each audit implementation file to numerical and real-browser probes', () => {
    const paths = [
      'scripts/design/ui-audit.mjs',
      'scripts/design/ui-audit.test.mjs',
      'scripts/lib/design/ui-audit-probe.mjs',
      'scripts/lib/design/ui-audit-checks.mjs',
    ];
    assert.equal(paths.filter(existsSync).length, 4);
    for (const path of paths) {
      const commands = commandNames(suggestFocusedChecks([path]));
      assert.ok(commands.includes('pnpm test:ui:audit'), path);
      assert.ok(commands.includes('pnpm exec playwright test tests/e2e/design-audits/ui-audit-probe.spec.ts'), path);
    }
  });
});
