import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract that **the secrets rule has a mechanism**.
 *
 * `.claude/rules/local-first.md` says never to scan password, credential or key
 * files from the user's disk, and `.claude/rules/forbidden.md` says never to
 * commit service accounts, API keys or `.env*` files. Until 2026-08-24 both
 * sentences were prose and nothing else. `.gitignore` stops a secret being
 * committed; nothing stopped one being read into a transcript and sent to a
 * model, which is the direction that actually leaks.
 *
 * A `permissions.deny` rule is the right instrument. It needs no path to
 * resolve, unlike a hook, and it applies without waiting for workspace trust,
 * unlike an allow rule. Claude Code evaluates deny ahead of ask, allow, and any
 * PreToolUse hook decision.
 *
 * The `.env` names are enumerated rather than globbed on purpose: a deny rule
 * cannot carry an exception, and `.env.example` is tracked, documented, and
 * scanned by the source-language gate, so `Read(.env.*)` would blind the
 * repository to its own file. That makes `.gitignore` the source of truth for
 * which names are secret, and this derives the expectation from it rather than
 * repeating the list a third time.
 */

const ROOT = process.cwd();
const settings = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8")) as {
  permissions?: { deny?: string[] };
};
const deny = settings.permissions?.deny ?? [];

function gitignoredEnvNames(): string[] {
  return readFileSync(join(ROOT, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\.env(\.|$)/.test(line))
    .sort();
}

describe("secret read guard", () => {
  it("denies every .env name .gitignore treats as a secret", () => {
    const ignored = gitignoredEnvNames();
    expect(ignored.length, ".gitignore lists no .env names — this sweep would pass vacuously").
      toBeGreaterThanOrEqual(3);
    const missing = ignored.filter((name) => !deny.includes(`Read(${name})`));
    expect(
      missing,
      `.gitignore hides these from Git but nothing stops an agent reading them:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("leaves the tracked placeholder readable — a deny rule cannot carry an exception", () => {
    expect(deny).not.toContain("Read(.env.*)");
    expect(deny).not.toContain("Read(.env*)");
    expect(deny.some((rule) => /^Read\(\.env\.example/.test(rule))).toBe(false);
  });

  it("denies private key material wherever it sits", () => {
    for (const rule of ["Read(**/*.pem)", "Read(**/id_rsa)", "Read(**/id_ed25519)"]) {
      expect(deny, `${rule} is missing from permissions.deny`).toContain(rule);
    }
  });

  it("uses only rule forms Claude Code consults for file paths", () => {
    // Path rules are checked against Read and Edit only. A Write, Glob or
    // NotebookEdit path rule is accepted, never consulted, and warns at startup,
    // so writing one here would be a guard that looks present and does nothing.
    for (const rule of deny) {
      expect(rule, `${rule} is not a Read/Edit/Bash/WebFetch rule`).toMatch(
        /^(Read|Edit|Bash|WebFetch)\(/,
      );
    }
  });

  it("keeps the standing rules pointing at a mechanism, not just prose", () => {
    const localFirst = readFileSync(join(ROOT, ".claude/rules/local-first.md"), "utf8");
    expect(localFirst).toMatch(/permissions\.deny|settings\.json/);
  });
});
