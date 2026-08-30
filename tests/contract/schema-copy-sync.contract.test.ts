import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **No CLI lib file re-implements an MCP module** (2026-08-30).
 *
 * This file used to assert the opposite: that `cli/src/lib/schema.mjs` stayed
 * *byte-identical* to `mcp/src/schema.mjs`. The 2026-08-13 hygiene sweep justified
 * that duplicate with "neither imports the other … each must be embedded in its own
 * execution entry point (the spawned MCP server, the directly executed CLI)".
 *
 * ⚠️ **That premise was already false when it was written.** `vault-sidecar.mjs`,
 * `architecture-record.mjs`, and `activity-log.mjs` in the same directory each
 * resolved their MCP twin at runtime — source checkout first, installed
 * `ontology-atlas-mcp` second — `cli/package.json` declares that dependency, and
 * `mcp/package.json`'s `files` already ships schema, validate, absorb, suggestions,
 * and parser. Five copies were being kept in step by hand for a constraint that had
 * a resolver sitting beside it.
 *
 * So the invariant is inverted. A byte-comparison gate can only notice drift after
 * someone writes it; making the second copy impossible removes the failure mode
 * instead of reporting it. Each file below must be a re-export through
 * `loadMcpModule(` and must declare no logic of its own — the moment somebody
 * pastes a function body back in, this fails.
 *
 * Ledger: `docs/DECISIONS.md`, 2026-08-30 ("The CLI executes the MCP modules
 * instead of copying them").
 */

const CLI_LIB = join(process.cwd(), "cli", "src", "lib");

/** Every CLI lib file whose implementation belongs to the MCP package. */
const SHIMS = [
  { cli: "schema.mjs", mcp: "schema.mjs" },
  { cli: "validate.mjs", mcp: "validate.mjs" },
  { cli: "absorb.mjs", mcp: "absorb.mjs" },
  { cli: "suggestions.mjs", mcp: "suggestions.mjs" },
  { cli: "parse-frontmatter.mjs", mcp: "parser.mjs" },
  { cli: "vault-sidecar.mjs", mcp: "vault-sidecar.mjs" },
  { cli: "architecture-record.mjs", mcp: "architecture-record.mjs" },
  { cli: "activity-log.mjs", mcp: "activity-log.mjs" },
];

/**
 * A body this gate refuses. `function` and `class` are the two ways a re-export
 * file could grow an implementation again; an arrow assigned to a `const` is the
 * third, so a `=>` outside a JSDoc block counts too. `activity-log.mjs` legitimately
 * wraps the module in two best-effort `async function`s, so it declares that
 * allowance explicitly rather than widening the rule for everyone.
 */
const LOGIC = /^\s*(export\s+)?(async\s+)?(function|class)\s/;

const readShim = (name: string) => readFileSync(join(CLI_LIB, name), "utf-8");

/** Source lines with block comments and line comments removed. */
function codeLines(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0);
}

describe("CLI lib does not re-implement an MCP module", () => {
  it.each(SHIMS)("$cli resolves mcp/src/$mcp through the shared loader", ({ cli, mcp }) => {
    const source = readShim(cli);
    expect(source, `${cli} must import the one resolution rule`).toContain(
      "from './mcp-module.mjs'",
    );
    expect(source, `${cli} must name the MCP module it stands for`).toContain(
      `loadMcpModule('${mcp}')`,
    );
  });

  it.each(SHIMS.filter((shim) => shim.cli !== "activity-log.mjs"))(
    "$cli declares no implementation of its own",
    ({ cli }) => {
      const offenders = codeLines(readShim(cli)).filter((line) => LOGIC.test(line));
      expect(offenders, `${cli} grew a body again — it must only re-export`).toEqual([]);
    },
  );

  it("activity-log.mjs only wraps the module in best-effort call sites", () => {
    // ⚠️ The one allowed exception, and it is bounded: the audit log must never
    // change a write's exit code, so its two entry points swallow failures. They
    // may call the MCP module; they may not reimplement the entry schema.
    const source = readShim("activity-log.mjs");
    const declared = codeLines(source)
      .filter((line) => LOGIC.test(line))
      .map((line) => line.trim());
    expect(declared).toEqual([
      "export async function readHeartbeatAgentName(vaultRoot) {",
      "export async function recordCliWrite(vaultRoot, { tool, target, summary, why = null }) {",
    ]);
  });

  it("the resolver tries the source checkout before the installed package", () => {
    // Idling guard: an empty or renamed resolver would make every check above
    // vacuous, since they only assert that a name appears.
    const resolver = readShim("mcp-module.mjs");
    expect(resolver).toContain("export async function loadMcpModule(");
    expect(resolver).toContain("../../../mcp/src");
    expect(resolver).toContain("ontology-atlas-mcp/src/");
    // Source checkout is tried first; the installed package is the fallback.
    expect(resolver.indexOf("../../../mcp/src")).toBeLessThan(
      resolver.indexOf("ontology-atlas-mcp/src/"),
    );
  });

  it("no other CLI lib file resolves an MCP module on its own", () => {
    // The point of one rule is that there is one. A second hand-written
    // `require.resolve('ontology-atlas-mcp/src/…')` for a *module* would reopen the
    // divergence this decision closed. Spawning the server binary
    // (`src/index.js`) is a different thing and stays allowed.
    const offenders: string[] = [];
    for (const name of ["schema.mjs", "validate.mjs", "absorb.mjs", "suggestions.mjs", "parse-frontmatter.mjs", "vault-sidecar.mjs", "architecture-record.mjs", "activity-log.mjs"]) {
      if (/ontology-atlas-mcp\/src\//.test(readShim(name))) offenders.push(name);
    }
    expect(offenders, "a shim wrote its own resolver instead of using mcp-module.mjs").toEqual([]);
  });
});
