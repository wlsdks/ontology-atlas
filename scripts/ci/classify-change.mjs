#!/usr/bin/env node
/**
 * Builds one fail-closed CI impact plan from a Git diff. PRs and verified main push ranges pay for
 * affected evidence; scheduled runs, shared test configuration and changes to this planner run
 * the exhaustive lanes. Before merge the browser lane runs the mapped specs plus the merge smoke
 * set (`merge-smoke-specs.mjs`), and the full suite only when this planner, the browser executor or
 * a root dependency changed; every push to `main` runs it in full. `checks:changed` stays the
 * path -> check authority; the import graph says which test projects a change reaches.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { comparableBranch, usablePushBefore } from './plan-base.mjs';
import { verifyReviewedMainPush } from './reviewed-main-push.mjs';
import { importClosure, readTestReach } from '../lib/import-graph/test-reach.mjs';
import { filesNamedBy, packageScriptFiles } from '../lib/ci/package-script-files.mjs';
import { RUST_LINT_COMMAND } from '../lib/check-rules/desktop.mjs';

import {
  CI_PLANNER_SURFACE_PATTERNS,
  BROWSER_EXECUTION_SURFACE_PATTERNS,
  normalizeChangedPath,
  suggestFocusedChecks,
} from '../lib/ci/focused-check-suggestions.mjs';

export const FULL_LANE_COMMANDS = Object.freeze({
  gates: Object.freeze([
    'pnpm typecheck',
    'pnpm lint',
    'pnpm check:tokens',
    'pnpm test:check:tokens',
    'pnpm test:i18n:messages',
    // `package:check` runs every test under `cli/src/`, and the MCP lane's
    // `test:mcp:unit` every MCP unit test, so their single-file wrappers are not listed here.
    'pnpm package:check',
    'pnpm licenses:check',
    'pnpm notice:check',
    'pnpm test:meaning-corpus',
    'pnpm test:vault:migrate',
    'pnpm test:guide-examples',
    'pnpm agents:check',
    'pnpm vault:audit',
    'pnpm test:claude:hooks',
    'pnpm test:pr:land',
    'pnpm test:review:facts && pnpm test:brief:new',
    'pnpm test:decisions',
    'pnpm test:records',
    'pnpm test:harness:tokens',
    'pnpm test:web-scripts',
    'pnpm test:e2e:sleeps && pnpm e2e:sleeps:check',
    'pnpm test:changelog',
    'pnpm changelog:check',
    'pnpm dev-checks:check',
    'pnpm test:dev-checks',
    'pnpm test:checks:changed',
    'pnpm test:checks:proof',
    'pnpm test:ci:impact',
    'node --test scripts/ci/run-playwright-ci.test.mjs',
    'node --test scripts/ci/vitest-shard-sequencer.test.mjs',
    'node --test scripts/ci/prepush.test.mjs',
    'pnpm test:source:language',
    'pnpm test:docs:language',
    'pnpm test:docs:checks',
    'pnpm test:benchmark',
    'pnpm test:ui:audit',
    'pnpm test:vault:validate',
    'pnpm test:vault:audit',
    'pnpm test:vault:freshness',
    'pnpm test:dogfood:args',
    'pnpm test:dogfood:status',
    'pnpm test:dogfood:script-refs',
    'pnpm dogfood:test',
    'pnpm test:desktop:check',
    'pnpm docs-vault:check',
    'pnpm test:design:tokens',
    'pnpm test:docs-vault',
    // The committed connector catalogue and the generator's own translation tests. Same shape as
    // every other generate-and-diff snapshot in this lane: a hand edit cannot ship.
    'pnpm mcp:catalogue:check',
    'pnpm design:toc:check',
    'pnpm docs:language',
    'pnpm source:language',
    'pnpm docs:comment-refs',
    'pnpm docs:links',
    'pnpm docs:meta',
    'pnpm docs:move -- --check',
  ]),
  unit: Object.freeze(['pnpm knip', 'pnpm test:run']),
  mcp: Object.freeze([
    'pnpm test:mcp:unit',
    'pnpm integration:mcp',
    'pnpm test:mcp:rpc',
    'pnpm docs:surface:check',
    // The ecosystem channel's own agreement: the bundle ships the server's
    // declared files, the image's ownership label repeats the registry name, and
    // the release uploads the exact artifact the registry entry points at.
    'pnpm test:mcp:bundle',
    'pnpm dogfood:release-gate',
    // A new module reachable from the server must also be in mcp/package.json#files.
    'node scripts/packaging/check-package-contracts.mjs',
  ]),
});

const GENERATED = [
  /^public\/docs-vault\//,
  /^src\/entities\/docs-vault\/data\//,
];

// One source of truth with the advisor's own planner rule: a hand-copied pair disagrees.
const PLANNER_SURFACE = CI_PLANNER_SURFACE_PATTERNS;

const ROOT_ALL_LANE_INPUTS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^patches\//,
];

const ROOT_UNIT_FULL_INPUTS = [
  /^vitest\.config\.ts$/,
  /^vitest\.setup\.ts$/,
  /^tsconfig\.json$/,
];

const MCP_FULL_INPUTS = [
  /^mcp\/(?:package(?:-lock)?\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
];

const PLAYWRIGHT_SPEC_PATH = /^tests\/e2e\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.spec\.ts$/;

/**
 * Browser inputs whose reach no mapping can name. Before merge they run the merge smoke set with
 * both separately protected surfaces, not the full suite; the push to `main` runs everything.
 */
const E2E_BROAD_INPUTS = [
  /^playwright\.config\.ts$/,
  // The Vite build of the app folder: its document and its config shape every screen it serves.
  /^(?:index\.html|vite\.config\.ts)$/,
  /^\.github\/actions\/setup-playwright\//,
  /^scripts\/(?:web\/serve-built-folder|ci\/run-with-retry)(?:\.test)?\.mjs$/,
  // Path aliases and compiler options the bundler reads.
  /^tsconfig\.json$/,
];

/**
 * The scripts `pnpm build` runs (and the install's `prepare`), followed through `pnpm <script>`, the
 * steps those run by path, and their imports, with the two configs that import build code. A change
 * to any of them can change the folders every browser job tests, so each is a broad browser input.
 */
export function browserBuildFiles(root = '.') {
  const started = packageScriptFiles(['build', 'build:unless-built', 'prepare'], root);
  return [...importClosure([...started, ...filesNamedBy(started, root), 'vite.config.ts', 'playwright.config.ts'], root)].sort();
}

let browserBuild;
const isBrowserBuildFile = (path) => (browserBuild ??= new Set(browserBuildFiles())).has(path);

const KNOWN_PATHS = [
  /^(?:app|assets|cli|docs|docs-i18n|examples|mcp|messages|patches|public|samples|script|scripts|src|src-tauri|tests)\//,
  /^\.(?:agents|claude|codex|github|githooks)\//,
  /^\.(?:bun-version|env\.example|gitattributes|gitignore|mcp\.json(?:\.example)?|nvmrc)$/,
  /^(?:AGENTS|CLAUDE|CODE_OF_CONDUCT|CONTRIBUTING|NOTICE|README(?:\.(?:ja|ko|zh))?|SECURITY)\.md$/,
  /^LICENSE$/,
  /^(?:eslint\.config\.mjs|index\.html|package\.json|playwright\.config\.ts|pnpm-lock\.yaml|pnpm-workspace\.yaml|rust-toolchain\.toml|tsconfig\.json|vite\.config\.ts|vitest\.config\.ts|vitest\.setup\.ts)$/,
  // A third-party directory reads this at the repository root and nothing here builds from it,
  // so it is known and drives no lane. `glama.json` names who may maintain the Glama listing.
  /^glama\.json$/,
];

const ROOT_VITEST_INPUTS = [
  /^(?:app|src)\//,
  /^tests\/fixtures\//,
];

const BROWSER_INPUTS = [
  /*
   * Every non-test source file reaches the browser: a model or lib module (the starter writer, the
   * agent runtime) can break first run or sending as surely as a component, and affected Vitest
   * does not render either. An unmapped one runs the merge smoke set.
   */
  /^app\//,
  /^src\//,
  /^messages\//,
  /^public\//,
  /^assets\//,
  /^(?:index\.html|playwright\.config\.ts|vite\.config\.ts)$/,
  /^tests\/e2e\//,
];

const STATIC_EXPORT_INPUTS = [
  /^playwright\.config\.ts$/,
  /^scripts\/web\/serve-built-folder\.mjs$/,
  /^tests\/e2e\/contextual-meaning-editor\.spec\.ts$/,
  /^src\/features\/ontology-change-review\//,
];

const WEB_SURFACE_INPUTS = [
  /^playwright\.config\.ts$/,
  /^messages\//,
  /^public\/(?!docs-vault\/)/,
  /^app\/(?:globals\.css|styles\/[^/]+\.css)/,
  /^src\/app\//,
  /^src\/views\/(?:download|first-run|root-entry)\//,
  /^src\/widgets\/gateway-chrome\//,
  /^src\/features\/first-run-starter\//,
  /^src\/shared\/(?:ui\/|lib\/(?:desktop-shell|tauri-))/,
  /^src-tauri\//,
  /^tests\/e2e\/web-surface-smoke\.spec\.ts$/,
];

const PLAYWRIGHT_PREFIX = 'pnpm exec playwright test ';

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function unique(values) {
  return [...new Set(values)];
}

function isGenerated(path) {
  return matchesAny(path, GENERATED);
}

function isSourceTest(path) {
  return /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(path);
}

function isBrowserInput(path) {
  if (isGenerated(path)) return false;
  if (/^(?:app|src)\//.test(path) && isSourceTest(path)) return false;
  return matchesAny(path, BROWSER_INPUTS);
}

/**
 * Commands that need a Tauri toolchain, which no Linux lane has (no GTK/WebKitGTK headers).
 * `windows-beta-check.yml` lints Rust on Windows and macOS, so leaving them out here is routing,
 * not a skipped gate.
 */
export const NATIVE_TOOLCHAIN_COMMANDS = Object.freeze([RUST_LINT_COMMAND]);

function commandLane(command) {
  if (NATIVE_TOOLCHAIN_COMMANDS.includes(command)) return 'native';
  if (command.startsWith(PLAYWRIGHT_PREFIX)) return 'e2e';
  if (
    command === 'pnpm knip' ||
    /^pnpm (?:exec )?vitest\b/.test(command) ||
    /^pnpm test:(?:run|contracts)\b/.test(command)
  ) {
    return 'unit';
  }
  if (
    /^pnpm integration:mcp(?::|$)/.test(command) ||
    /^pnpm test:mcp:(?:unit|verify|dogfood|maintenance|suggestions)(?::|$)/.test(command) ||
    command === 'pnpm docs:surface:check' ||
    /^pnpm exec node --test mcp\/src\//.test(command)
  ) {
    return 'mcp';
  }
  return 'gates';
}

function playwrightSpecs(command) {
  if (!command.startsWith(PLAYWRIGHT_PREFIX)) return [];
  return command
    .slice(PLAYWRIGHT_PREFIX.length)
    .trim()
    .split(/\s+/)
    .filter((token) => PLAYWRIGHT_SPEC_PATH.test(token));
}

function vitestFileArguments(command) {
  const selection = /^pnpm exec vitest (?:run|related)\s+(.*)$/.exec(command);
  if (!selection || selection[1].includes('&&')) return [];
  return selection[1].split(/\s+/).filter((token) => token && !token.startsWith('-'));
}

function coversOnly(files, changed) {
  return files.length > 0 && files.every((path) => changed.has(path));
}

function exactContractFiles(command) {
  if (!/^pnpm (?:exec vitest run|test:run)\b/.test(command)) return [];
  return command
    .split(/\s+/)
    .filter((token) => /^tests\/contract\/(?:vault-format|design-tokens|agent-chat|security|desktop|control-adoption|layout|routes|controls|harness|agent-instructions|mcp|analysis|architecture|brand|vault-data|map|typography|messages|ci-gates|cli|library|copy|motion|settings|release\/)?[A-Za-z0-9._/-]+\.test\.ts$/.test(token));
}

/**
 * Contracts that run before every merge whatever the change: the security boundary and the
 * vault write format. Every other contract runs before merge only when the import graph says it
 * reaches a changed file, and in full after the merge (`--main-push=full`) and nightly.
 */
export const CORE_CONTRACT_DIRECTORIES = Object.freeze(['tests/contract/security', 'tests/contract/vault-format']);

/**
 * The forbidden patterns `.claude/rules/forbidden.md` says are rejected before merge, and the
 * parity check that keeps that list in step with `docs/DESIGN-SYSTEM.md`. They read the tree or
 * the composed catalogues, so no import edge reaches them; together they take about a second.
 */
export const FORBIDDEN_PATTERN_CONTRACTS = Object.freeze([
  'tests/contract/agent-instructions/design-donts-parity.contract.test.ts',
  'tests/contract/copy/label-decoration.contract.test.ts',
  'tests/contract/design-tokens/design-inline-hex-guard.test.ts',
  'tests/contract/motion/infinite-motion.contract.test.ts',
  'tests/contract/motion/reduced-motion-equivalent.contract.test.ts',
  'tests/contract/routes/retired-routes.contract.test.ts',
]);

export function coreContractFiles(list = (directory) => (existsSync(directory) ? readdirSync(directory, { recursive: true }) : [])) {
  return unique([
    ...CORE_CONTRACT_DIRECTORIES.flatMap((directory) =>
      list(directory).map((name) => `${directory}/${String(name).replaceAll('\\', '/')}`),
    ),
    ...FORBIDDEN_PATTERN_CONTRACTS.filter((path) => list(path.slice(0, path.lastIndexOf('/'))).some((name) => path.endsWith(`/${name}`))),
  ]).filter((path) => CONTRACT_FILE.test(path)).sort();
}

/**
 * Ratchets count a pattern across the tree and compare with the merge base, so no import edge
 * reaches them; a change to a kind of file they count runs them all (about 6 s). A ratchet is a
 * contract named `*ratchet*` or one that reads `tests/contract/lib/ratchet-base.ts`.
 */
const RATCHET_INPUTS = [/^(?:src|app)\/.+\.(?:tsx?|css)$/, /^messages\//];

export function ratchetContractFiles(root = '.') {
  const directory = `${root}/tests/contract`;
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .map((name) => `tests/contract/${String(name).replaceAll('\\', '/')}`)
    .filter((path) => CONTRACT_FILE.test(path))
    .filter((path) => path.includes('ratchet') || readFileSync(`${root}/${path}`, 'utf8').includes('lib/ratchet-base'))
    .sort();
}

/** A message part reaches its readers through the composed catalogue built from it. */
function withMessageComposites(list) {
  return unique([
    ...list,
    ...list.filter((path) => /^messages\/[^/]+\/[^/]+\.json$/.test(path)).map((path) => `messages/${path.split('/')[1]}.json`),
  ]);
}

/**
 * The whole-graph dead-code analyzer runs before merge only when its own scope or adapter
 * changed; for every other change it runs after the merge with the rest of the full set.
 */
const KNIP_SELF_INPUTS = [/^scripts\/quality\/dead-code\//];

const CONTRACT_FILE = /^tests\/contract\/(?:vault-format|design-tokens|agent-chat|security|desktop|control-adoption|layout|routes|controls|harness|agent-instructions|mcp|analysis|architecture|brand|vault-data|map|typography|messages|ci-gates|cli|library|copy|motion|settings|release\/)?.+\.test\.ts$/;

function unitPlan({ paths, existingPaths, deletedPaths, suggestions, full }) {
  if (full || paths.some((path) => matchesAny(path, ROOT_UNIT_FULL_INPUTS))) {
    return {
      mode: 'full',
      affected: false,
      contract: 'full',
      contractFiles: [],
      knip: true,
      extraCommands: [],
      needsMcp: true,
    };
  }

  const rows = suggestions.commands.filter(
    (row) => commandLane(row.command) === 'unit' && !(row.paths.length > 0 && row.paths.every(isGenerated)),
  );
  /*
   * `checks:changed` recommends the full `pnpm test:contracts` locally because some contracts scan
   * the tree from disk. Before merge the planner narrows it to the contracts the import graph
   * reaches plus the core; the full sweep runs after the merge.
   */
  const reach = readTestReach();
  const sources = (list) => list.filter((path) => !isGenerated(path));
  const reachedContracts = reach
    .testsReaching(withMessageComposites([...sources(existingPaths), ...sources(deletedPaths)]))
    .contract.filter((path) => !deletedPaths.includes(path));
  const contractFiles = unique([
    ...existingPaths.filter((path) => CONTRACT_FILE.test(path)),
    ...rows.flatMap((row) => exactContractFiles(row.command)),
    ...reachedContracts,
    ...(paths.some((path) => !isGenerated(path) && matchesAny(path, RATCHET_INPUTS)) ? ratchetContractFiles() : []),
    // The core runs for every change that is not only regenerated output.
    ...(paths.some((path) => !isGenerated(path)) ? coreContractFiles() : []),
  ]).sort();
  const knip = rows.some((row) => row.command === 'pnpm knip') && paths.some((path) => matchesAny(path, KNIP_SELF_INPUTS));
  const graphPaths = existingPaths.filter((path) => !isGenerated(path) && !matchesAny(path, ROOT_VITEST_INPUTS));
  const affected =
    paths.some((path) => !isGenerated(path) && matchesAny(path, ROOT_VITEST_INPUTS)) ||
    (graphPaths.length > 0 && reach.testsReaching(graphPaths).unit.length > 0);
  const changed = new Set(paths);
  const extraCommands = unique(
    rows
      .map((row) => row.command)
      .filter(
        (command) =>
          command !== 'pnpm knip' &&
          command !== 'pnpm test:contracts' &&
          exactContractFiles(command).length === 0 &&
          // The sharded `vitest run --changed` already selects every suite importing a changed
          // file; a row naming only changed files would repeat it unsharded on shard 1.
          !(affected && coversOnly(vitestFileArguments(command), changed)),
      ),
  );
  const contract = contractFiles.length > 0 ? 'focused' : 'skip';
  const mode =
    affected ? 'affected' : contract !== 'skip' || knip || extraCommands.length > 0 ? 'focused' : 'skip';

  return {
    mode,
    affected,
    contract,
    contractFiles,
    knip,
    extraCommands,
    needsMcp: contract !== 'skip' || knip,
  };
}

/**
 * The measurement lane: the Vitest `perf` project, on a runner of its own, because a ratio
 * measured beside other work pays unevenly. `affected` lets Vitest's `--changed` graph pick the
 * files; it is planned only when the import graph says a measurement reaches a changed file.
 * A deletion a measurement still reaches runs everything: `--changed` cannot see a vanished file.
 */
function perfPlan({ paths, existingPaths, deletedPaths, full }) {
  if (full || paths.some((path) => matchesAny(path, ROOT_UNIT_FULL_INPUTS))) return { mode: 'full' };
  const reach = readTestReach();
  const sources = (list) => list.filter((path) => !isGenerated(path));
  const stale = reach.testsReaching(sources(deletedPaths)).perf.filter((test) => !deletedPaths.includes(test));
  if (stale.length > 0) return { mode: 'full' };
  const relevant = reach.testsReaching(sources(existingPaths)).perf.length > 0;
  return { mode: relevant ? 'affected' : 'skip' };
}

/**
 * Drops a focused wrapper (`run-focused-node-test.mjs --test-name-pattern … <file>`) when another
 * planned script runs that whole file: every case the wrapper selects already runs there.
 */
export function withoutSubsetsOfWholeFiles(commands, scripts) {
  const body = (command) => scripts[/^pnpm ([a-z][a-z0-9:-]*)$/.exec(command)?.[1]] ?? '';
  const wholeFiles = new Set(commands
    .map((command) => /^node --test (\S+\.test\.mjs)$/.exec(body(command))?.[1])
    .filter(Boolean));
  return commands.filter((command) => {
    const focused = /^node scripts\/ci\/run-focused-node-test\.mjs --test-name-pattern "[^"]*" (\S+\.test\.mjs)$/.exec(body(command));
    return !focused || !wholeFiles.has(focused[1]);
  });
}

function mcpPlan({ suggestions, full }) {
  if (full) {
    return { mode: 'full', commands: [...FULL_LANE_COMMANDS.mcp] };
  }
  let commands = unique(
    suggestions.commands
      .filter((row) => commandLane(row.command) === 'mcp')
      .map((row) => row.command),
  );
  if (commands.includes('pnpm test:mcp:unit')) {
    commands = commands.filter((command) => !/^pnpm exec node --test mcp\/src\//.test(command));
  }
  const scripts = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {} : {};
  commands = withoutSubsetsOfWholeFiles(commands, scripts);
  return { mode: commands.length > 0 ? 'focused' : 'skip', commands };
}

function e2ePlan({ paths, suggestions, full, broadPaths = [] }) {
  if (full) {
    return {
      mode: 'full',
      specs: [],
      unmappedPaths: [],
      staticExport: true,
      webSurface: true,
    };
  }

  const rows = suggestions.commands.filter((row) => commandLane(row.command) === 'e2e');
  const broad = broadPaths.length > 0;
  const staticExport =
    broad ||
    paths.some((path) => matchesAny(path, STATIC_EXPORT_INPUTS)) ||
    rows.some((row) =>
      playwrightSpecs(row.command).includes('tests/e2e/contextual-meaning-editor.spec.ts'),
    );
  const webSurface =
    broad ||
    paths.some((path) => matchesAny(path, WEB_SURFACE_INPUTS)) ||
    rows.some((row) =>
      playwrightSpecs(row.command).includes('tests/e2e/web-surface-smoke.spec.ts'),
    );
  const delegated = new Set([
    ...(staticExport ? ['tests/e2e/contextual-meaning-editor.spec.ts'] : []),
    ...(webSurface ? ['tests/e2e/web-surface-smoke.spec.ts'] : []),
  ]);
  const specs = unique(rows.flatMap((row) => playwrightSpecs(row.command)))
    .filter((spec) => !delegated.has(spec))
    .sort();
  // A path counts as mapped only when a row sends it to a spec the shards run; one mapped only to
  // a separately protected surface job would otherwise leave every shard idle.
  const mappedPaths = new Set(rows
    .filter((row) => !row.additive && playwrightSpecs(row.command).some((spec) => !delegated.has(spec)))
    .flatMap((row) => row.paths));
  const browserInputs = paths.filter(isBrowserInput);
  const unmappedPaths = unique([...browserInputs.filter((path) => !mappedPaths.has(path)), ...broadPaths]);
  const mode = unmappedPaths.length > 0 ? 'smoke' : specs.length > 0 ? 'targeted' : 'skip';

  return { mode, specs, unmappedPaths, staticExport, webSurface };
}

function gatesPlan({ suggestions, full }) {
  if (full) {
    return { run: true, commands: [...FULL_LANE_COMMANDS.gates], needsMcp: true };
  }
  const commands = unique(
    suggestions.commands
      .filter((row) => commandLane(row.command) === 'gates')
      .map((row) => row.command),
  );
  // These scripts spawn the source MCP server, so a gates lane without mcp/node_modules dies (checks.yml
  // gates `pnpm --dir mcp install` on this flag). A script test whose imports enter mcp/ needs the same
  // install, so any command whose files' import closure enters mcp/ raises it too.
  const commandFiles = commands.flatMap((command) => command.split(/\s+/).filter((token) => /^(?:scripts|cli|tests)\/.+\.[cm]?js$/.test(token)));
  const needsMcp =
    commands.some((command) =>
      /^pnpm (?:licenses:check|notice:check|test:(?:architecture|claude:hooks)|dogfood:(?:agent|brief|compile|growth|health|maintenance|status|verify|walk)|smoke:(?:onboarding|memory-loop))\b/.test(
        command,
      ),
    ) || [...importClosure(commandFiles)].some((path) => path.startsWith('mcp/'));
  // The PO pilot sunset and decision-ledger diff are cheap standing checks, so
  // every comparable PR keeps this required lane alive even with no mapping.
  // `vault:audit` (0.05 s) is standing too: a vault `path:` breaks when any file it names is moved
  // or deleted, and the rename-aware diff above names only a moved file's new path.
  return { run: true, commands: unique([...commands, 'pnpm vault:audit']), needsMcp };
}

/**
 * @param {{ files?: string[], deletedFiles?: string[], forceFull?: boolean }} [options]
 */
export function buildImpactPlan({ files = [], deletedFiles = [], forceFull = false, fullReason = null } = {}) {
  const paths = unique([...files, ...deletedFiles].map(normalizeChangedPath).filter(Boolean));
  const existing = unique(files.map(normalizeChangedPath).filter(Boolean));
  const deleted = unique(deletedFiles.map(normalizeChangedPath).filter(Boolean));
  const unknownPaths = paths.filter((path) => !matchesAny(path, KNOWN_PATHS));
  const plannerChanged = paths.some((path) => !isSourceTest(path) && matchesAny(path, PLANNER_SURFACE));
  const rootAllChanged = paths.some((path) => matchesAny(path, ROOT_ALL_LANE_INPUTS));
  const full = forceFull || plannerChanged || rootAllChanged || unknownPaths.length > 0;
  const suggestions = suggestFocusedChecks(existing, { deletedPaths: deleted });
  const unit = unitPlan({
    paths,
    existingPaths: existing,
    deletedPaths: deleted,
    suggestions,
    full,
  });
  const mcp = mcpPlan({
    suggestions,
    full: full || paths.some((path) => matchesAny(path, MCP_FULL_INPUTS)),
  });
  // The browser suite runs in full before merge only when the planner or the executor that splits
  // it changed: otherwise the change's own specs and the merge smoke set, and `main` runs the rest.
  // A dependency (a Vite or three.js bump, a patch) can move any screen, so it runs everything too.
  const e2eFull = forceFull || plannerChanged || rootAllChanged ||
    paths.some((path) => !isSourceTest(path) && matchesAny(path, BROWSER_EXECUTION_SURFACE_PATTERNS));
  const broadPaths = full
    ? paths.filter((path) => !matchesAny(path, KNOWN_PATHS))
    : paths.filter((path) =>
      (!isSourceTest(path) && (matchesAny(path, E2E_BROAD_INPUTS) || isBrowserBuildFile(path))) ||
      (path.startsWith('tests/e2e/') && !PLAYWRIGHT_SPEC_PATH.test(path)));
  const e2e = e2ePlan({ paths, suggestions, full: e2eFull, broadPaths });
  const gates = gatesPlan({ suggestions, full });
  const perf = perfPlan({ paths, existingPaths: existing, deletedPaths: deleted, full });

  return {
    version: 1,
    full,
    paths,
    unknownPaths,
    reason: forceFull
      ? fullReason ?? 'no safe comparison or exhaustive event — all lanes'
      : plannerChanged
        ? 'CI impact authority changed — exhaustive self-verification'
        : rootAllChanged
          ? 'root dependency or script contract changed — exhaustive lanes'
          : unknownPaths.length > 0
            ? `unclassified paths fail closed: ${unknownPaths.slice(0, 3).join(', ')}`
            : 'comparable change — affected evidence only',
    lanes: { gates, unit, perf, mcp, e2e },
  };
}

/**
 * @param {{
 *   base?: string | null,
 *   head?: string | null,
 *   files?: string[],
 *   deletedFiles?: string[],
 *   eventName?: string,
 * }} input
 */
export function decide({ base, head, files = [], deletedFiles = [], eventName = 'pull_request', mainPushFull = false }) {
  // A merge group stacks pull requests on today's main, a tree nothing has built: it is exhaustive
  // by name, not by the `eventName !== 'pull_request'` fallthrough below.
  const mergeGroup = eventName === 'merge_group';
  // Before merge a train runs the affected checks plus a fixed core; the rest of the full set
  // runs here, on the merged tree, so main's own run is where an unaffected suite turns red.
  const postMerge = eventName === 'push' && mainPushFull;
  // A manual run given a branch to compare with plans like a pull request against it.
  const comparedDispatch = eventName === 'workflow_dispatch' && Boolean(base);
  const forceFull = mergeGroup || postMerge ||
    (!['pull_request', 'push'].includes(eventName) && !comparedDispatch) || !base || (head && base === head);
  const fullReason = mergeGroup
    ? 'merge group: this combination has never been built — exhaustive lanes'
    : postMerge
      ? 'post-merge run on main: the full set behind the affected pre-merge checks'
      : null;
  return buildImpactPlan({ files, deletedFiles, forceFull, fullReason });
}

export function reuseReviewedMainPlan(plan, proof, { eventName, base, head } = {}) {
  if (eventName !== 'push' || !base || !head || proof?.skip !== true || proof.commit !== head ||
      !/^[a-f0-9]{40}$/.test(proof.tree ?? '') || !/^[a-f0-9]{40}$/.test(proof.reviewedHead ?? '') ||
      !Number.isSafeInteger(proof.pullRequest) || proof.pullRequest < 1 || plan.unknownPaths.length > 0) return plan;
  const idle = buildImpactPlan();
  idle.lanes.gates = { ...idle.lanes.gates, run: false, commands: [] };
  return {
    ...plan,
    full: false,
    reason: `exact Git tree already passed required CI in PR #${proof.pullRequest}`,
    lanes: idle.lanes,
    reusedFrom: { pullRequest: proof.pullRequest, commit: head, tree: proof.tree, reviewedHead: proof.reviewedHead },
  };
}

/**
 * After merge the browser lane is exhaustive: every push to `main` runs the full suite, the
 * post-merge measurements and both separately protected surfaces, even when the other lanes reuse
 * the train's reviewed tree. A red result is announced by `pnpm pr:land`, not by a gate.
 */
export function fullBrowserAfterMerge(plan, { eventName } = {}) {
  if (eventName !== 'push') return plan;
  return {
    ...plan,
    reason: `${plan.reason}; browser suite in full after merge`,
    lanes: {
      ...plan.lanes,
      e2e: { mode: 'full', specs: [], unmappedPaths: [], staticExport: true, webSurface: true },
    },
  };
}

export function unitUsesAllShards(unit) {
  return (
    unit.mode === 'full' ||
    unit.affected === true ||
    unit.contract === 'full' ||
    (unit.extraCommands ?? []).some(isRelatedSweep)
  );
}

/** A `vitest related` row is a file sweep like the affected run, so every shard takes a share. */
export function isRelatedSweep(command) {
  return /^pnpm exec vitest related /.test(command);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function resolveBase(explicit, { fallback = true } = {}) {
  for (const ref of (fallback ? [explicit, 'origin/main', 'main'] : [explicit]).filter(Boolean)) {
    try {
      return git(['merge-base', 'HEAD', ref]);
    } catch {
      // Try the next comparable ref. The caller fails closed if none exists.
    }
  }
  return null;
}

function changedFiles(base, filter) {
  if (!base) return [];
  const output = git(['diff', '--name-only', `--diff-filter=${filter}`, `${base}...HEAD`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

export function encodePlan(plan) {
  return Buffer.from(JSON.stringify(plan), 'utf8').toString('base64url');
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new Error(`unsupported CI impact plan: ${label} must be nonblank strings`);
  }
}

export function validatePlan(plan) {
  const reject = (message) => {
    throw new Error(`unsupported CI impact plan: ${message}`);
  };
  if (!plan || typeof plan !== 'object' || plan.version !== 1 || !plan.lanes) {
    reject('version or lanes');
  }
  if (typeof plan.full !== 'boolean' || typeof plan.reason !== 'string' || !plan.reason) {
    reject('full verdict or reason');
  }
  requireStringArray(plan.paths, 'paths');
  requireStringArray(plan.unknownPaths, 'unknownPaths');

  const { gates, unit, perf, mcp, e2e } = plan.lanes;
  const reused = plan.reusedFrom;
  if (reused && (!Number.isSafeInteger(reused.pullRequest) || reused.pullRequest < 1 ||
      !['commit', 'tree', 'reviewedHead'].every((key) => /^[a-f0-9]{40}$/.test(reused[key] ?? '')))) {
    reject('reviewed tree provenance');
  }
  if (!gates || (gates.run !== true && !(reused && gates.run === false)) || typeof gates.needsMcp !== 'boolean') {
    reject('gates verdict');
  }
  requireStringArray(gates.commands, 'gates.commands');

  if (
    !unit ||
    !['skip', 'focused', 'affected', 'full'].includes(unit.mode) ||
    typeof unit.affected !== 'boolean' ||
    !['skip', 'focused', 'full'].includes(unit.contract) ||
    typeof unit.knip !== 'boolean' ||
    typeof unit.needsMcp !== 'boolean'
  ) {
    reject('unit verdict');
  }
  requireStringArray(unit.contractFiles, 'unit.contractFiles');
  requireStringArray(unit.extraCommands, 'unit.extraCommands');
  if (unit.contractFiles.some((path) => !/^tests\/contract\/(?:vault-format|design-tokens|agent-chat|security|desktop|control-adoption|layout|routes|controls|harness|agent-instructions|mcp|analysis|architecture|brand|vault-data|map|typography|messages|ci-gates|cli|library|copy|motion|settings|release\/)?[A-Za-z0-9._/-]+\.test\.ts$/.test(path))) {
    reject('unsafe contract file');
  }
  if (unit.mode === 'skip' && (unit.affected || unit.contract !== 'skip' || unit.knip || unit.extraCommands.length > 0)) {
    reject('unit skip contains work');
  }
  if (unit.mode === 'affected' && !unit.affected) reject('affected unit mode has no graph work');
  if (unit.contract === 'focused' && unit.contractFiles.length === 0) {
    reject('focused contract mode has no files');
  }

  if (!perf || !['skip', 'affected', 'full'].includes(perf.mode)) reject('perf verdict');

  if (!mcp || !['skip', 'focused', 'full'].includes(mcp.mode)) reject('MCP verdict');
  requireStringArray(mcp.commands, 'mcp.commands');
  if ((mcp.mode === 'skip') !== (mcp.commands.length === 0)) reject('MCP mode/command mismatch');

  if (
    !e2e ||
    !['skip', 'targeted', 'smoke', 'full'].includes(e2e.mode) ||
    typeof e2e.staticExport !== 'boolean' ||
    typeof e2e.webSurface !== 'boolean'
  ) {
    reject('Playwright verdict');
  }
  requireStringArray(e2e.specs, 'e2e.specs');
  requireStringArray(e2e.unmappedPaths, 'e2e.unmappedPaths');
  if (e2e.specs.some((path) => !/^tests\/e2e\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9._-]+\.spec\.ts$/.test(path))) {
    reject('unsafe Playwright spec');
  }
  if (e2e.mode === 'targeted' && (e2e.specs.length === 0 || e2e.unmappedPaths.length > 0)) {
    reject('targeted Playwright mode is incomplete');
  }
  if (e2e.mode === 'smoke' && e2e.unmappedPaths.length === 0) {
    reject('smoke Playwright mode has no fail-closed path');
  }
  if (e2e.mode === 'skip' && (e2e.specs.length > 0 || e2e.unmappedPaths.length > 0)) {
    reject('Playwright skip contains suite work');
  }

  // A reused tree verifies nothing again, except the browser suite after merge, which is exhaustive.
  const browserAfterMerge = e2e.mode === 'full' && e2e.staticExport && e2e.webSurface;
  const browserIdle = e2e.mode === 'skip' && !e2e.staticExport && !e2e.webSurface;
  if (reused && (plan.full || gates.run || gates.commands.length || unit.mode !== 'skip' ||
      perf.mode !== 'skip' || mcp.mode !== 'skip' || !(browserIdle || browserAfterMerge))) {
    reject('reviewed tree reuse contains unverified lane work');
  }

  if (
    plan.full &&
    (gates.commands.length === 0 ||
      unit.mode !== 'full' ||
      perf.mode !== 'full' ||
      mcp.mode !== 'full' ||
      !['full', 'smoke'].includes(e2e.mode) ||
      !e2e.staticExport ||
      !e2e.webSurface)
  ) {
    reject('global full verdict contains a narrowed lane');
  }
  if (!plan.full && plan.unknownPaths.length > 0) reject('unknown paths did not fail closed');
  return plan;
}

/**
 * The plan handed to every lane through one environment variable. Lanes read only the lane
 * verdicts, and Linux caps a single environment string at 128 KiB, so the changed-path list
 * (99 % of a 3,469-file plan) stays with the planner's log.
 */
export function encodeLanePlan(plan) {
  return encodePlan({ ...plan, paths: [] });
}

export function decodePlan(encoded) {
  if (!encoded) throw new Error('CI impact plan is missing');
  const plan = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return validatePlan(plan);
}

function emit(plan, base = null) {
  validatePlan(plan);
  const { gates, unit, perf, mcp, e2e } = plan.lanes;
  const summary =
    `gates=${gates.run} unit=${unit.mode} perf=${perf.mode} mcp=${mcp.mode} ` +
    `playwright=${e2e.mode} static=${e2e.staticExport} web=${e2e.webSurface}`;
  console.log(`[ci-impact] ${summary} — ${plan.reason}`);
  if (e2e.unmappedPaths.length > 0) {
    console.log(`[ci-impact] Playwright fail-closed paths: ${e2e.unmappedPaths.join(', ')}`);
  }
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const values = {
    plan: encodeLanePlan(plan),
    gates: gates.run,
    gates_needs_mcp: gates.needsMcp,
    unit: unit.mode,
    unit_needs_mcp: unit.needsMcp,
    unit_sharded: unitUsesAllShards(unit),
    // The exact commit every lane compares with, so a lane never re-reads a moved branch.
    base: base && /^[a-f0-9]{40}$/.test(base) ? base : '',
    perf: perf.mode,
    mcp: mcp.mode,
    playwright: e2e.mode,
    static: e2e.staticExport,
    web: e2e.webSurface,
  };
  appendFileSync(
    output,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
}

if (process.argv[1]?.endsWith('classify-change.mjs')) {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const mainPushFull = process.argv.includes('--main-push=full');
  const compareTo = process.argv.find((arg) => arg.startsWith('--compare-to='))?.slice('--compare-to='.length) ?? '';
  const eventName =
    process.argv.find((arg) => arg.startsWith('--event='))?.slice('--event='.length) ||
    process.env.GITHUB_EVENT_NAME ||
    'pull_request';
  // A push must use its exact previous tip, never origin/main (already HEAD).
  // Missing/deleted history fails closed; do not fall back to another range.
  let base;
  if (eventName === 'push') {
    try {
      const before = usablePushBefore(process.env.PUSH_BEFORE);
      if (!before) throw new Error('missing push base');
      base = git(['rev-parse', '--verify', `${before}^{commit}`]);
      git(['merge-base', '--is-ancestor', base, 'HEAD']);
    } catch { base = null; }
  } else if (eventName === 'workflow_dispatch') {
    // Only an explicit, plain branch name compares; anything else stays an exhaustive run.
    base = comparableBranch(compareTo)
      ? resolveBase(`origin/${compareTo}`, { fallback: false })
      : null;
  } else {
    base = resolveBase(baseArg?.trim());
  }
  let head = null;
  try {
    head = git(['rev-parse', 'HEAD']);
  } catch {
    // `decide` treats a missing comparison as exhaustive.
  }
  const files = changedFiles(base, 'ACMRTUXB');
  const deletedFiles = changedFiles(base, 'D');
  const plan = decide({ base, head, files, deletedFiles, eventName, mainPushFull });
  let proof;
  if (eventName === 'push' && base && head && !mainPushFull) {
    proof = await verifyReviewedMainPush({
      eventName, ref: process.env.GITHUB_REF, sha: head,
      currentTreeSha: git(['rev-parse', 'HEAD^{tree}']),
    });
    console.log(`[ci-impact] main-push reuse: ${proof.reason}`);
  } else if (eventName === 'pull_request' && base && process.env.GITHUB_ACTIONS === 'true' &&
      files.some((path) => /^scripts\/(?:lib\/)?ci\/reviewed-main-push(?:\.test)?\.mjs$/.test(path))) {
    // Exercise the real read-only Actions credential when this reader changes.
    // This diagnostic never replaces the PR's own verification plan.
    const credentialProbe = await verifyReviewedMainPush({
      eventName: 'push', ref: 'refs/heads/main', sha: base,
      currentTreeSha: git(['rev-parse', `${base}^{tree}`]),
    });
    console.log(`[ci-impact] read-only credential probe: ${JSON.stringify(credentialProbe)}`);
  }
  const reviewed = reuseReviewedMainPlan(plan, proof, { eventName, base, head });
  emit(process.argv.includes('--full-browser-after-merge') ? fullBrowserAfterMerge(reviewed, { eventName }) : reviewed, base);
}
