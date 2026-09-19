import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";

/**
 * **Every drift code a scanner can emit has a sentence in both catalogues.**
 *
 * `agent-files.ts` is the one place that emits these findings, and each carries an English
 * `message` written for a contributor reading a scanner. Two screens show them to a person:
 * the Harness guides view and the Analysis board's guidance panel. Without a catalogue entry a
 * code falls back to that raw English sentence, which is how a Korean screen came to print
 * "duplicated skill file diverged between .claude/skills and .agents/skills" in the middle of
 * its own chrome (design audit, 2026-09-20).
 *
 * The expectation is derived from the code rather than hand-written here, so a twelfth code
 * added next year fails this test instead of quietly shipping English.
 */
const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "entities", "agent-files", "model", "agent-files.ts"),
  "utf8",
);

function emittedCodes(): string[] {
  const codes = new Set<string>();
  for (const [, code] of SOURCE.matchAll(/\bcode: '([a-z0-9-]+)'/g)) codes.add(code);
  return [...codes].sort();
}

describe("agent drift codes are readable in both languages", () => {
  it("finds the codes in the one file that emits them", () => {
    const codes = emittedCodes();
    // Idling guard — a renamed field would make every assertion below vacuous.
    expect(codes.length, "no drift code was found; the scanner's shape changed").toBeGreaterThan(5);
    expect(codes).toContain("skill-copy-diverged");
  });

  for (const [locale, catalogue] of [
    ["en", en],
    ["ko", ko],
  ] as const) {
    it(`${locale} has a sentence for every code`, () => {
      const messages = (catalogue as { agentFiles: { drift: Record<string, string> } }).agentFiles.drift;
      const missing = emittedCodes().filter((code) => !messages[code]?.trim());
      expect(
        missing,
        `these drift codes would print the scanner's own English inside ${locale} chrome: ${missing.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("ko does not simply repeat the English sentence", () => {
    const enDrift = (en as { agentFiles: { drift: Record<string, string> } }).agentFiles.drift;
    const koDrift = (ko as { agentFiles: { drift: Record<string, string> } }).agentFiles.drift;
    const untranslated = Object.keys(enDrift).filter((code) => koDrift[code] === enDrift[code]);
    expect(untranslated, "a Korean entry that is byte-identical to the English one is not a translation").toEqual([]);
  });
});
