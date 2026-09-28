import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const ENGINE = "src/shared/motion/shared-element.ts";
const CSS_NAMES = new Set(["none", "app-pane"]);

function filesUnder(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)))
    .filter((file) => !/\.test\.tsx?$/.test(file));
}

const SCRIPTS = [...filesUnder("src", [".ts", ".tsx"]), ...filesUnder("app", [".ts", ".tsx"])];
const STYLES = filesUnder("app", [".css"]);
const read = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("view-transition engine", () => {
  it("scans the real tree", () => {
    expect(SCRIPTS.length).toBeGreaterThan(500);
    expect(STYLES.length).toBeGreaterThan(5);
    expect(SCRIPTS).toContain(ENGINE);
  });

  it("names view-transition elements only inside the morph engine", () => {
    const offenders = SCRIPTS.filter(
      (file) => file !== ENGINE && /viewTransitionName|view-transition-name/.test(read(file)),
    );
    expect(offenders).toEqual([]);
    expect(read(ENGINE)).toMatch(/viewTransitionName/);
  });

  it("gives stylesheets no view-transition name beyond the pane and none", () => {
    const names = STYLES.flatMap((file) =>
      [...read(file).matchAll(/view-transition-name:\s*([^;]+);/g)].map((match) => ({ file, name: match[1]!.trim() })),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter(({ name }) => !CSS_NAMES.has(name))).toEqual([]);
  });

  it("never uses React ViewTransition or transitionTypes", () => {
    const offenders = SCRIPTS.filter((file) => {
      const text = read(file);
      return /import\s*\{[^}]*\bViewTransition\b[^}]*\}\s*from\s*["']react["']/.test(text)
        || /<ViewTransition\b/.test(text)
        || /\btransitionTypes\b/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
