#!/usr/bin/env node
/**
 * Build one fail-closed CI impact plan from a Git diff.
 *
 * PRs pay for evidence that can see their changed paths. Pushes to main, shared
 * test configuration, and changes to this planner itself run the exhaustive
 * lanes. The focused mapping is not duplicated here: `checks:changed` remains
 * the repository's path -> check authority and this module assigns those checks
 * to CI lanes.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
  CI_PLANNER_SURFACE_PATTERNS,
  normalizeChangedPath,
  suggestFocusedChecks,
} from './lib/focused-check-suggestions.mjs';

export const FULL_LANE_COMMANDS = Object.freeze({
  gates: Object.freeze([
    'pnpm po:pilot -- --check',
    'pnpm exec tsc --noEmit',
    'pnpm lint',
    'pnpm check:tokens',
    'pnpm test:check:tokens',
    'pnpm test:i18n:messages',
    'pnpm package:check',
    'pnpm test:meaning-corpus',
    'pnpm test:vault:migrate',
    'pnpm test:guide-examples',
    'pnpm agents:check',
    'pnpm vault:audit',
    'pnpm test:claude:hooks',
    'pnpm test:harness:report',
    'pnpm test:harness:smoke',
    'pnpm test:checks:changed',
    'pnpm test:ci:impact',
    'pnpm test:source:language',
    'pnpm test:docs:language',
    'pnpm test:docs:checks',
    'pnpm test:benchmark',
    'pnpm test:skills:audit',
    'pnpm test:cli:args',
    'pnpm test:cli:mcp-call',
    'pnpm test:architecture',
    'pnpm test:mcp:verify',
    'pnpm test:vault:validate',
    'pnpm test:vault:audit',
    'pnpm test:vault:freshness',
    'pnpm test:dogfood:args',
    'pnpm test:dogfood:status',
    'pnpm test:dogfood:graph-db',
    'pnpm test:dogfood:script-refs',
    'pnpm test:dogfood:compile-fix',
    'pnpm dogfood:test',
    'pnpm test:desktop:check',
    'pnpm docs-vault:check',
    'pnpm test:docs-vault',
    'pnpm gateway:specimen:check',
    'pnpm design:toc:check',
    'pnpm docs:language',
    'pnpm source:language',
    'pnpm docs:links',
  ]),
  unit: Object.freeze(['pnpm knip', 'pnpm test:run']),
  mcp: Object.freeze([
    'pnpm integration:cli:setup',
    'pnpm test:mcp:unit',
    'pnpm integration:mcp',
    'pnpm docs:surface:check',
    'pnpm dogfood:release-gate',
  ]),
});

const GENERATED = [
  /^public\/docs-vault\//,
  /^src\/entities\/docs-vault\/data\//,
];

// One source of truth with the advisor's own planner rule — a hand-copied pair
// disagreed about setup-playwright/action.yml until the 2026-09-01 review.
const PLANNER_SURFACE = CI_PLANNER_SURFACE_PATTERNS;

const ROOT_ALL_LANE_INPUTS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
];

const ROOT_UNIT_FULL_INPUTS = [
  /^vitest\.config\.ts$/,
  /^vitest\.setup\.ts$/,
  /^tsconfig\.json$/,
];

const MCP_FULL_INPUTS = [
  /^mcp\/(?:package(?:-lock)?\.json|pnpm-lock\.yaml)$/,
];

const E2E_FULL_INPUTS = [
  /^playwright\.config\.ts$/,
  /^next\.config\.ts$/,
  /^postcss\.config\.mjs$/,
  /^\.github\/actions\/setup-playwright\//,
  /^scripts\/(?:serve-static-export|run-with-retry)(?:\.test)?\.mjs$/,
  /^tests\/e2e\/(?![^/]+\.spec\.ts$)/,
];

const KNOWN_PATHS = [
  /^(?:app|assets|cli|docs|mcp|messages|public|samples|script|scripts|src|src-tauri|tests)\//,
  /^\.(?:agents|claude|codex|github|githooks)\//,
  /^\.(?:env\.example|gitattributes|gitignore|mcp\.json(?:\.example)?|nvmrc)$/,
  /^(?:AGENTS|CLAUDE|CODE_OF_CONDUCT|CONTRIBUTING|NOTICE|README|SECURITY)\.md$/,
  /^LICENSE$/,
  /^(?:eslint\.config\.mjs|next\.config\.ts|package\.json|playwright\.config\.ts|pnpm-lock\.yaml|postcss\.config\.mjs|tsconfig\.json|vitest\.config\.ts|vitest\.setup\.ts)$/,
];

const ROOT_VITEST_INPUTS = [
  /^(?:app|src)\//,
  /^messages\//,
  /^tests\/fixtures\//,
];

const BROWSER_INPUTS = [
  /^app\//,
  /^src\/.*\.(?:tsx|css)$/,
  /*
   * Plain .ts inside a `ui/` segment is rendering code by FSD convention —
   * pointer handlers, canvas renderers, layout math — and the "pure TypeScript
   * relies on affected units" rule below it does not hold there (2026-09-01
   * review: a rewrite of the map's pan/zoom handlers planned zero browser
   * evidence). Model/lib .ts stays with affected Vitest, as designed.
   */
  /^src\/.*\/ui\/.*\.ts$/,
  /^messages\//,
  /^public\//,
  /^assets\//,
  /^(?:next\.config\.ts|postcss\.config\.mjs|playwright\.config\.ts)$/,
  /^tests\/e2e\//,
];

const STATIC_EXPORT_INPUTS = [
  /^playwright\.config\.ts$/,
  /^next\.config\.ts$/,
  /^scripts\/serve-static-export(?:\.test)?\.mjs$/,
  /^tests\/e2e\/contextual-meaning-editor\.spec\.ts$/,
  /^src\/features\/ontology-change-review\//,
];

const WEB_SURFACE_INPUTS = [
  /^playwright\.config\.ts$/,
  /^next\.config\.ts$/,
  /^messages\//,
  /^public\/(?!docs-vault\/)/,
  /^app\/(?:globals\.css|\[locale\]\/(?:page|download\/|not-found|error|global-error))/,
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

function commandLane(command) {
  if (command.startsWith(PLAYWRIGHT_PREFIX)) return 'e2e';
  if (
    command === 'pnpm knip' ||
    /^pnpm (?:exec )?vitest\b/.test(command) ||
    /^pnpm test:(?:run|contracts)\b/.test(command)
  ) {
    return 'unit';
  }
  if (
    /^pnpm integration:(?:mcp|cli)(?::|$)/.test(command) ||
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
    .filter((token) => /^tests\/e2e\/[A-Za-z0-9._-]+\.spec\.ts$/.test(token));
}

function exactContractFiles(command) {
  if (!/^pnpm (?:exec vitest run|test:run)\b/.test(command)) return [];
  return command
    .split(/\s+/)
    .filter((token) => /^tests\/contract\/[A-Za-z0-9._/-]+\.test\.ts$/.test(token));
}

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

  const rows = suggestions.commands.filter((row) => commandLane(row.command) === 'unit');
  const broadContractRows = rows.filter((row) => row.command === 'pnpm test:contracts');
  const broadContractInputs = broadContractRows.flatMap((row) => row.paths);
  const contractFull = broadContractInputs.some(
    (path) =>
      deletedPaths.includes(path) || !/^tests\/contract\/.+\.test\.ts$/.test(path),
  );
  const contractFiles = contractFull
    ? []
    : unique([
        ...existingPaths.filter((path) => /^tests\/contract\/.+\.test\.ts$/.test(path)),
        ...rows.flatMap((row) => exactContractFiles(row.command)),
      ]).sort();
  const knip = rows.some((row) => row.command === 'pnpm knip');
  const affected = paths.some(
    (path) => !isGenerated(path) && matchesAny(path, ROOT_VITEST_INPUTS),
  );
  const extraCommands = unique(
    rows
      .map((row) => row.command)
      .filter(
        (command) =>
          command !== 'pnpm knip' &&
          command !== 'pnpm test:contracts' &&
          exactContractFiles(command).length === 0 &&
          !/^pnpm exec vitest run (?:app|src)\//.test(command),
      ),
  );
  const contract = contractFull ? 'full' : contractFiles.length > 0 ? 'focused' : 'skip';
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
  return { mode: commands.length > 0 ? 'focused' : 'skip', commands };
}

function e2ePlan({ paths, suggestions, full }) {
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
  const mappedPaths = new Set(rows.flatMap((row) => row.paths));
  const browserInputs = paths.filter(isBrowserInput);
  const unmappedPaths = browserInputs.filter((path) => !mappedPaths.has(path));
  const staticExport =
    paths.some((path) => matchesAny(path, STATIC_EXPORT_INPUTS)) ||
    rows.some((row) =>
      playwrightSpecs(row.command).includes('tests/e2e/contextual-meaning-editor.spec.ts'),
    );
  const webSurface =
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
  // smoke:onboarding and smoke:memory-loop spawn the source MCP server
  // (2026-09-01 review: without them here, a PR touching those scripts got a
  // gates lane that died on missing mcp/node_modules — a false red no rerun
  // fixes, because checks.yml gates `pnpm --dir mcp install` on this flag).
  const needsMcp = commands.some((command) =>
    /^pnpm (?:test:(?:architecture|claude:hooks)|dogfood:(?:agent|brief|graph-db|health|maintenance|status|verify|walk)|smoke:(?:onboarding|memory-loop))\b/.test(
      command,
    ),
  );
  // The PO pilot sunset and decision-ledger diff are cheap standing checks, so
  // every comparable PR keeps this required lane alive even with no mapping.
  return { run: true, commands, needsMcp };
}

/**
 * @param {{ files?: string[], deletedFiles?: string[], forceFull?: boolean }} [options]
 */
export function buildImpactPlan({ files = [], deletedFiles = [], forceFull = false } = {}) {
  const paths = unique([...files, ...deletedFiles].map(normalizeChangedPath).filter(Boolean));
  const existing = unique(files.map(normalizeChangedPath).filter(Boolean));
  const deleted = unique(deletedFiles.map(normalizeChangedPath).filter(Boolean));
  const unknownPaths = paths.filter((path) => !matchesAny(path, KNOWN_PATHS));
  const plannerChanged = paths.some((path) => matchesAny(path, PLANNER_SURFACE));
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
  const e2e = e2ePlan({
    paths,
    suggestions,
    full: full || paths.some((path) => matchesAny(path, E2E_FULL_INPUTS)),
  });
  const gates = gatesPlan({ suggestions, full });

  return {
    version: 1,
    full,
    paths,
    unknownPaths,
    reason: forceFull
      ? 'no safe PR comparison or default-branch push — exhaustive lanes'
      : plannerChanged
        ? 'CI impact authority changed — exhaustive self-verification'
        : rootAllChanged
          ? 'root dependency or script contract changed — exhaustive lanes'
          : unknownPaths.length > 0
            ? `unclassified paths fail closed: ${unknownPaths.slice(0, 3).join(', ')}`
            : 'comparable change — affected evidence only',
    lanes: { gates, unit, mcp, e2e },
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
export function decide({ base, head, files = [], deletedFiles = [], eventName = 'pull_request' }) {
  const forceFull = eventName !== 'pull_request' || !base || (head && base === head);
  return buildImpactPlan({ files, deletedFiles, forceFull });
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function resolveBase(explicit) {
  for (const ref of [explicit, 'origin/main', 'main'].filter(Boolean)) {
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

  const { gates, unit, mcp, e2e } = plan.lanes;
  if (!gates || gates.run !== true || typeof gates.needsMcp !== 'boolean') {
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
  if (unit.contractFiles.some((path) => !/^tests\/contract\/[A-Za-z0-9._/-]+\.test\.ts$/.test(path))) {
    reject('unsafe contract file');
  }
  if (unit.mode === 'skip' && (unit.affected || unit.contract !== 'skip' || unit.knip || unit.extraCommands.length > 0)) {
    reject('unit skip contains work');
  }
  if (unit.mode === 'affected' && !unit.affected) reject('affected unit mode has no graph work');
  if (unit.contract === 'focused' && unit.contractFiles.length === 0) {
    reject('focused contract mode has no files');
  }

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
  if (e2e.specs.some((path) => !/^tests\/e2e\/[A-Za-z0-9._-]+\.spec\.ts$/.test(path))) {
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

  if (
    plan.full &&
    (gates.commands.length === 0 ||
      unit.mode !== 'full' ||
      mcp.mode !== 'full' ||
      e2e.mode !== 'full' ||
      !e2e.staticExport ||
      !e2e.webSurface)
  ) {
    reject('global full verdict contains a narrowed lane');
  }
  if (!plan.full && plan.unknownPaths.length > 0) reject('unknown paths did not fail closed');
  return plan;
}

export function decodePlan(encoded) {
  if (!encoded) throw new Error('CI impact plan is missing');
  const plan = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return validatePlan(plan);
}

function emit(plan) {
  validatePlan(plan);
  const { gates, unit, mcp, e2e } = plan.lanes;
  const summary =
    `gates=${gates.run} unit=${unit.mode} mcp=${mcp.mode} ` +
    `playwright=${e2e.mode} static=${e2e.staticExport} web=${e2e.webSurface}`;
  console.log(`[ci-impact] ${summary} — ${plan.reason}`);
  if (e2e.unmappedPaths.length > 0) {
    console.log(`[ci-impact] Playwright fail-closed paths: ${e2e.unmappedPaths.join(', ')}`);
  }
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const values = {
    plan: encodePlan(plan),
    gates: gates.run,
    gates_needs_mcp: gates.needsMcp,
    unit: unit.mode,
    unit_needs_mcp: unit.needsMcp,
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
  const eventName =
    process.argv.find((arg) => arg.startsWith('--event='))?.slice('--event='.length) ||
    process.env.GITHUB_EVENT_NAME ||
    'pull_request';
  const base = resolveBase(baseArg?.trim());
  let head = null;
  try {
    head = git(['rev-parse', 'HEAD']);
  } catch {
    // `decide` treats a missing comparison as exhaustive.
  }
  const files = changedFiles(base, 'ACMRTUXB');
  const deletedFiles = changedFiles(base, 'D');
  emit(decide({ base, head, files, deletedFiles, eventName }));
}
