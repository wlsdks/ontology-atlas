import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The message files never enter client JavaScript through a static import: only
 * `standalone-messages.ts` may import them, and it and its importers must be server code.
 */
const ROOT = process.cwd();
const SCAN_DIRS = ["src", "app"];
const ALLOWED_IMPORTER = "src/i18n/standalone-messages.ts";
const MESSAGE_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*messages\/[a-z]{2}\.json['"]/mu;
const PICKER_IMPORT =
  /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*(?:i18n\/standalone-messages)['"]/mu;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "data" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx|mts|js|jsx|mjs)$/u.test(name) && !/\.test\.|\.spec\./u.test(name)) out.push(path);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir))).map((path) => ({
  rel: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));
const isClient = (text: string) => /^\s*['"]use client['"]/u.test(text);

describe("message files stay out of client bundles", () => {
  it("scans real source", () => {
    expect(FILES.length, "no source scanned; the checks below would idle").toBeGreaterThan(200);
  });

  it("only the server-side picker imports the message files statically", () => {
    const importers = FILES.filter((f) => MESSAGE_IMPORT.test(f.text)).map((f) => f.rel);
    expect(importers).toEqual([ALLOWED_IMPORTER]);
  });

  it("the picker and every module that imports it are server code", () => {
    const picker = FILES.find((f) => f.rel === ALLOWED_IMPORTER);
    expect(picker && isClient(picker.text)).toBe(false);
    const users = FILES.filter((f) => f.rel !== ALLOWED_IMPORTER && PICKER_IMPORT.test(f.text));
    expect(users.length, "no user of the picker found; the check would idle").toBeGreaterThan(0);
    const clientUsers = users.filter((f) => isClient(f.text)).map((f) => f.rel);
    expect(clientUsers).toEqual([]);
  });
});
