import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

/**
 * Body-section size ratchet for the dogfood vault: it can never grow. A byte cap, not a heading
 * vocabulary, because a section that outgrows the cap holds more than one idea. When the worst
 * section shrinks, lower the cap with it.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const VAULT_ROOT = join(REPO_ROOT, "docs", "ontology");

/**
 * The worst surviving section in bytes (`Verify the agent loop` in `README.md`); the honest current
 * ceiling, not a target.
 */
const SECTION_BYTE_CAP = 1_800;

/**
 * How far the cap may sit above the worst real section: a cap far above it is a gate that can never
 * fire.
 */
const CAP_HEADROOM = 100;

/**
 * **`## Competency answers` is exempt — it is parsed, not authored.**
 *
 * `src/shared/lib/project-source/project-meaning-evidence.ts` matches this heading exactly, and
 * MCP `finalize_project_meaning` owns its contents. Its size follows the number
 * of qualified domains and capabilities, so capping it would cap the graph.
 */
const EXEMPT_HEADINGS = new Set(["Competency answers"]);

type Section = { readonly file: string; readonly heading: string; readonly bytes: number };

function markdownFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // App-owned raw analysis history is metadata, not an authored ontology node.
    if (entry.isDirectory() && entry.name === '.ontology-atlas') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFilesUnder(full));
    else if (entry.name.endsWith(".md")) found.push(full);
  }
  return found.sort();
}

function sectionsOf(file: string): Section[] {
  const raw = readFileSync(file, "utf8");
  const body = /^---\n[\s\S]*?\n---\n?([\s\S]*)$/.exec(raw)?.[1] ?? raw;
  const parts = body.split(/^## (.+)$/m);
  const relative = file.slice(REPO_ROOT.length + 1);
  const sections: Section[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    if (EXEMPT_HEADINGS.has(heading)) continue;
    sections.push({
      file: relative,
      heading,
      bytes: Buffer.byteLength(parts[i + 1] ?? "", "utf8"),
    });
  }
  return sections;
}

const ALL_SECTIONS = markdownFilesUnder(VAULT_ROOT).flatMap(sectionsOf);

describe("dogfood vault body sections hold one idea each", () => {
  it('excludes raw analysis metadata while retaining an oversized authored section', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-section-scope-'));
    try {
      mkdirSync(join(root, '.ontology-atlas', 'analyses'), { recursive: true });
      mkdirSync(join(root, 'capabilities'));
      const largeBody = `## One idea\n${'x'.repeat(SECTION_BYTE_CAP + 1)}\n`;
      const node = join(root, 'capabilities', 'review.md');
      writeFileSync(node, largeBody);
      writeFileSync(join(root, '.ontology-atlas', 'analyses', 'run.md'), largeBody);
      expect(markdownFilesUnder(root)).toEqual([node]);
      expect(markdownFilesUnder(root).flatMap(sectionsOf).filter((section) => section.bytes > SECTION_BYTE_CAP)).toHaveLength(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("reads a vault that actually has sections", () => {
    expect(ALL_SECTIONS.length, "the vault walk found no `##` sections").toBeGreaterThan(100);
  });

  it("keeps every section under the cap", () => {
    const over = ALL_SECTIONS.filter((s) => s.bytes > SECTION_BYTE_CAP)
      .sort((a, b) => b.bytes - a.bytes)
      .map((s) => `${s.file} · ## ${s.heading} · ${s.bytes} B`);

    expect(
      over,
      `A vault section outgrew ${SECTION_BYTE_CAP} B. It is holding more than one idea.\n` +
        "Name the second idea under its own heading rather than deleting the text:\n" +
        "rules and limits belong under `Constraints: <topic>` or `<topic> Contract`,\n" +
        "and what is left under the descriptive heading is the part an agent could\n" +
        "have re-derived from the source anyway.\n" +
        over.join("\n"),
    ).toEqual([]);
  });

  it("keeps the cap within sight of the worst real section", () => {
    const worst = ALL_SECTIONS.reduce((a, b) => (b.bytes > a.bytes ? b : a));

    expect(
      SECTION_BYTE_CAP - worst.bytes,
      `The cap sits ${SECTION_BYTE_CAP - worst.bytes} B above the worst real section ` +
        `(${worst.file} · ## ${worst.heading} · ${worst.bytes} B), so it can no longer fire. ` +
        `Lower SECTION_BYTE_CAP to ${Math.ceil((worst.bytes + 1) / 100) * 100}.`,
    ).toBeLessThanOrEqual(CAP_HEADROOM);
  });
});
