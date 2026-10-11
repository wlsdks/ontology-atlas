import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * An agent file never cites a deleted file. Covers the backticked path form (`agents:check` covers
 * `@references`). A basename resolves anywhere in the tree on purpose; only files that exist nowhere
 * fail.
 */

const ROOT = process.cwd();
const SOURCES = [".claude/agents", ".claude/skills", ".claude/rules", ".agents/agents", ".agents/skills"];

const CITATION = /`([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:md|mjs|js|ts|tsx|json|sh|css|toml|yml))`/g;

/**
 * Cited names that are examples rather than locations. Each is a placeholder the
 * surrounding sentence introduces as one, so a reader is never sent looking.
 */
const ILLUSTRATIVE = new Set(["domains/foo.md"]);

const tracked = new Set(
  execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean),
);
const trackedBasenames = new Set([...tracked].map((path) => path.split("/").pop() as string));

function resolves(ref: string, from: string): boolean {
  if (ILLUSTRATIVE.has(ref)) return true;
  if (tracked.has(ref) || existsSync(join(ROOT, ref))) return true;
  const beside = relative(ROOT, join(ROOT, from, "..", ref));
  if (tracked.has(beside) || existsSync(join(ROOT, beside))) return true;
  if ([...tracked].some((path) => path.endsWith(`/${ref}`))) return true;
  return trackedBasenames.has(ref.split("/").pop() as string);
}

function citations(): { file: string; ref: string }[] {
  const found: { file: string; ref: string }[] = [];
  for (const dir of SOURCES) {
    // A tracked file deleted in the working tree (not yet staged) has no text to cite from.
    for (const file of [...tracked].filter((path) => path.startsWith(`${dir}/`) && path.endsWith(".md") && existsSync(join(ROOT, path)))) {
      for (const match of readFileSync(join(ROOT, file), "utf8").matchAll(CITATION)) {
        found.push({ file, ref: match[1] });
      }
    }
  }
  return found;
}

const all = citations();

describe("agent file citations", () => {
  it("has citations to protect — an empty sweep would pass vacuously", () => {
    expect(all.length).toBeGreaterThanOrEqual(100);
  });

  it("cites no file that exists nowhere in the repository", () => {
    const broken = all.filter(({ ref, file }) => !resolves(ref, file));
    const detail = broken.map(({ file, ref }) => `  ${file} -> ${ref}`).join("\n");
    expect(
      broken,
      `these send an agent to a file that does not exist:\n${detail}\n`
        + "Point at the file that owns the behaviour now, or drop the citation. A reader "
        + "that follows a dead path gets no error, only nothing.",
    ).toEqual([]);
  });

  it("keeps the illustrative list honest — a placeholder that became real is stale", () => {
    const stale = [...ILLUSTRATIVE].filter(
      (ref) => tracked.has(ref) || [...tracked].some((path) => path.endsWith(`/${ref}`)),
    );
    expect(stale, `these are treated as examples but now exist:\n${stale.join("\n")}`).toEqual([]);
  });
});
