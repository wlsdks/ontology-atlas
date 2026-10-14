import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The agent-facing packages must not hand out retired addresses. Only `mcp/` and `cli/` are scanned:
 * they give addresses to someone who cannot see the app, while `app/` and `src/` host the redirects.
 */

const repoRoot = join(import.meta.dirname, '..', '..', '..');

/** Verbatim from `.claude/rules/forbidden.md` "Routing" plus decision (91). */
const RETIRED_ADDRESS = new RegExp(
  [
    String.raw`["'\`]\/(?:`,
    [
      'login',
      'signup',
      'account',
      'reset-password',
      String.raw`settings\/`,
      String.raw`admin\/`,
      String.raw`review\/`,
      String.raw`diagnostics\/`,
      String.raw`knowledge\/`,
      String.raw`skills\b`,
      // The two legacy redirects. `/ontology/insights` is live and must never match.
      String.raw`ontology\/(?:studio|edit)\b`,
      String.raw`ontology\/?(?=["'\`?])`,
    ].join('|'),
    ')',
  ].join(''),
);

function sourceFiles(packageDir: string): string[] {
  const root = join(repoRoot, packageDir, 'src');
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => /\.(mjs|js)$/.test(path) && !/\.test\.mjs$/.test(path));
}

const scanned = [...sourceFiles('mcp'), ...sourceFiles('cli')];

describe('addresses handed to agents point at live surfaces', () => {
  it('scans a real file set that still contains the emitting module', () => {
    // Without this the gate passes loudest when it is broken: a renamed directory would
    // scan nothing at all and report a clean sweep. The anchor must be present by name.
    expect(scanned.length).toBeGreaterThan(10);
    expect(scanned.map((path) => relative(repoRoot, path))).toContain(
      'mcp/src/ontology-engine.mjs',
    );
  });

  it('still emits a builder address, and it is a live one', () => {
    // A positive assertion, so deleting the emission cannot be mistaken for fixing it.
    const composition = readFileSync(join(repoRoot, 'mcp/src/ontology-engine.mjs'), 'utf8');
    expect(composition).toMatch(/\bcreateTraversalAnalysis\(\{/);
    const engine = readFileSync(join(repoRoot, 'mcp/src/ontology-engine/traversal-analysis.mjs'), 'utf8');
    expect(engine).toMatch(/href: `\/topology\/\?p=\$\{encodeURIComponent\(focusParam\)\}/);
  });

  it('names no retired route in any address the MCP or CLI surfaces emit', () => {
    const offenders = scanned
      .map((path) => ({ path: relative(repoRoot, path), body: readFileSync(path, 'utf8') }))
      .flatMap(({ path, body }) =>
        body
          .split('\n')
          .map((line, index) => ({ path, line: line.trim(), number: index + 1 }))
          // Position decides, not the glyph: a retired route inside a comment is a quotation and is excused,
          // inside code it is an instruction to an agent. A trailing comment on a code line is not excused.
          .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*'))
          .filter(({ line }) => RETIRED_ADDRESS.test(line)),
      );

    expect(
      offenders,
      `retired routes reached an agent-facing surface:\n${offenders
        .map((hit) => `  ${hit.path}:${hit.number} — ${hit.line}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('does not mistake the live /ontology/insights route for a retired one', () => {
    // The bans are prefix-shaped, so this is the case that decides whether the pattern is
    // usable at all. A gate that fires on a live route gets deleted rather than obeyed.
    expect(RETIRED_ADDRESS.test(`'/ontology/insights'`)).toBe(false);
    expect(RETIRED_ADDRESS.test(`'/topology/?p=domain%3Aauth&workbench=edit'`)).toBe(false);
    expect(RETIRED_ADDRESS.test(`'/ontology/studio/?node=x'`)).toBe(true);
    expect(RETIRED_ADDRESS.test(`'/ontology/'`)).toBe(true);
  });
});
