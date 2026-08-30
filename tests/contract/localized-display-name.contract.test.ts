import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { hasBrokenTextEncoding } from "@/shared/lib/locale-display-name";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";

const ROOT = join(process.cwd(), "docs", "ontology");

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("dogfood localized display names", () => {
  it("contains no decoder controls or replacement characters", () => {
    const displayRows: Array<{ path: string; key: string; value: string }> = [];
    for (const path of markdownFiles(ROOT)) {
      const { frontmatter } = parseFrontmatter(readFileSync(path, "utf8"));
      for (const [key, value] of Object.entries(frontmatter)) {
        if (!/^display_[a-z]{2}$/.test(key) || typeof value !== "string") continue;
        displayRows.push({ path: relative(process.cwd(), path), key, value });
      }
    }

    expect(displayRows.length, "the gate scanned no localized display names").toBeGreaterThan(0);
    expect(
      displayRows.filter(({ value }) => hasBrokenTextEncoding(value)),
      "localized names must remain readable UTF-8 text",
    ).toEqual([]);
  });
});
