import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { suggestFocusedChecks } from '../../scripts/lib/focused-check-suggestions.mjs';

const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const WORKFLOW = readFileSync('.github/workflows/checks.yml', 'utf8');
const PRE_PUSH = readFileSync('.githooks/pre-push', 'utf8');
const README = readFileSync('README.md', 'utf8');
const DEVELOPMENT_CHECKS = readFileSync('docs/DEVELOPMENT-CHECKS.md', 'utf8');
const ANALYZER_CONFIG = readFileSync('scripts/quality/dead-code/scope-configs.mjs', 'utf8');
const ROOT_LOCK = readFileSync('pnpm-lock.yaml', 'utf8');
const ANALYZER_ADAPTER = 'scripts/quality/dead-code/check.mjs';
const COMMAND = 'pnpm knip';

function jobBody(name: string): string {
  const start = WORKFLOW.indexOf(`  ${name}:`);
  expect(start, `Checks workflow must define the ${name} job`).toBeGreaterThanOrEqual(0);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/^  [a-z][a-z0-9_-]*:/m);
  return WORKFLOW.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe('dead-code gate wiring', () => {
  it('keeps the package command pointed at the analyzer adapter', () => {
    expect(PACKAGE.scripts.knip).toBe(`node ${ANALYZER_ADAPTER}`);
  });

  it('recommends the analyzer for every owned JavaScript/TypeScript scope', () => {
    const paths = [
      'src/shared/lib/example.ts',
      'scripts/quality/dead-code/check.mjs',
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
      const commands = Array.from(
        suggestFocusedChecks([path]).commands,
        (row: { command: string }) => row.command,
      );
      expect(commands.filter((command) => command === COMMAND), `${path} must recommend ${COMMAND}`).toHaveLength(1);
    }
  });

  it('runs the analyzer as a repo-wide pre-push lane', () => {
    expect(PRE_PUSH).toContain("lane dead_code 'pnpm knip'");
  });

  it('runs the analyzer in Unit · Contract only after both dependency installs', () => {
    const gates = jobBody('gates');
    const unit = jobBody('unit');
    const mcp = jobBody('mcp');

    expect(gates).not.toContain(COMMAND);
    expect(mcp).not.toContain(COMMAND);
    expect(WORKFLOW.match(/run: pnpm knip/g)).toHaveLength(1);
    expect(unit.indexOf('pnpm install --frozen-lockfile')).toBeGreaterThanOrEqual(0);
    expect(unit.indexOf('pnpm --dir mcp install --frozen-lockfile')).toBeGreaterThanOrEqual(0);
    expect(unit.indexOf(COMMAND)).toBeGreaterThan(unit.indexOf('pnpm --dir mcp install --frozen-lockfile'));
  });

  it('keeps the package command discoverable in contributor docs', () => {
    for (const document of [README, DEVELOPMENT_CHECKS]) {
      expect(document).toContain(COMMAND);
    }
  });

  it('keeps the analyzer version sourced from the exact locked Knip release', () => {
    const match = ANALYZER_CONFIG.match(/export const KNIP_VERSION = '([^']+)'/);
    expect(match?.[1], 'scope config must declare the analyzer version').toBeTruthy();
    const version = match![1];

    expect(PACKAGE.devDependencies?.knip).toBe(version);
    expect(ROOT_LOCK).toContain(`knip@${version}:`);
  });
});
