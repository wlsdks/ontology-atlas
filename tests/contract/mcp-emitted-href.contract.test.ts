import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate against the agent-facing packages handing out an address nothing serves.
 *
 * `query_ontology { operation: "builder_context" }` emitted
 * `/ontology/studio/?node=…` — a **retired legacy redirect** — to every agent that
 * asked where meaning is edited. The vault's own `ontology-edit-redirect` element
 * says of those addresses: "neither old address is a navigation destination or write
 * surface". The MCP server was contradicting the ontology it exists to serve.
 *
 * Three PO council seats found it independently on 2026-08-24 while rejecting an OS
 * URL scheme, and the council named fixing this as the one repair to do instead:
 * the requester's own defect class — "a prescribed action name with no executor" —
 * found alive, in MCP output.
 *
 * **Why a contract test rather than lint.** The offence is a string literal that is
 * perfectly valid code; nothing about `'/ontology/studio/'` is syntactically wrong.
 * What makes it a defect is a routing decision recorded in `AGENTS.md` and
 * `.claude/rules/forbidden.md`, which ESLint cannot read.
 *
 * **Why only `mcp/` and `cli/`.** These are the surfaces that hand addresses to
 * someone who cannot see the app. `app/` and `src/` legitimately contain the retired
 * routes, because that is where the redirects themselves live.
 */

const repoRoot = join(import.meta.dirname, '..', '..');

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
    const engine = readFileSync(join(repoRoot, 'mcp/src/ontology-engine.mjs'), 'utf8');
    expect(engine).toMatch(/href: `\/topology\/\?p=\$\{encodeURIComponent\(focusParam\)\}/);
  });

  it('names no retired route in any address the MCP or CLI surfaces emit', () => {
    const offenders = scanned
      .map((path) => ({ path: relative(repoRoot, path), body: readFileSync(path, 'utf8') }))
      .flatMap(({ path, body }) =>
        body
          .split('\n')
          .map((line, index) => ({ path, line: line.trim(), number: index + 1 }))
          // Position decides, not the glyph — the same discriminator the retired-npm-channel gate
          // uses. A retired route inside a comment is a quotation, and explaining what an address
          // replaced is exactly how this repository documents a repair. Inside code it is an
          // instruction to an agent, and that still fires. Only whole comment lines are excused;
          // a trailing comment on a line of code is not, because the code is what ships.
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
