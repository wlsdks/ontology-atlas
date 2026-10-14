import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The secrets rule is enforced by `permissions.deny` in `.claude/settings.json`. `.env` names are
 * enumerated, not globbed, because a deny rule cannot carry an exception for `.env.example`;
 * `.gitignore` is the source of truth for which names are secret.
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
    for (const rule of [
      "Read(**/*.pem)",
      "Read(**/*.p8)",
      "Read(**/*.p12)",
      "Read(**/*.key)",
      "Read(**/id_rsa)",
      "Read(**/id_ed25519)",
      "Read(**/id_ecdsa*)",
    ]) {
      expect(deny, `${rule} is missing from permissions.deny`).toContain(rule);
    }
  });

  it("denies the signing folder and the credential stores a session could reach", () => {
    for (const rule of [
      "Read(~/.ontology-atlas-signing/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.npmrc)",
      "Read(~/.netrc)",
      "Read(~/.aws/**)",
    ]) {
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
});
