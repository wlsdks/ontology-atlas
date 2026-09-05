import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

/**
 * **Body-section size ratchet for the dogfood vault — it can never grow.**
 *
 * **Why** (measured 2026-08-25):
 *
 * A vault node holds two different things, and only one of them is worth
 * storing. Decisions — which capability belongs to which domain, what is
 * explicitly excluded, which limit must not be crossed — do not exist anywhere
 * in the source. Descriptions of what the code does can be re-derived by any
 * agent that reads the code, so paying context for them buys nothing.
 *
 * The failure this gate exists to stop is not "too much description". It is
 * **a decision wearing a descriptive heading**. `capabilities/mcp-server.md`
 * carried a single `## Core Flow` section of 12,865 bytes: five lines of actual
 * flow, followed by twenty-two paragraphs of hard limits, fail-closed rules and
 * per-language scan boundaries. Every one of those rules was real and
 * unrecoverable from the source — and an agent had to read 12 KB of prose named
 * "Core Flow" to reach any of them.
 *
 * Splitting that one file moved the whole vault from 37.5% decision content to
 * 45.7%, without editing a single sentence. Three more files took it to 51.4%.
 *
 * **Why a byte cap and not a heading vocabulary.** A fixed list of allowed
 * headings would be enforceable but wrong: the vault's best sections
 * (`Identity Boundaries`, `Active Tool Inventory Contract`, `Inclusions /
 * Exclusions`) were all invented for one node. Size is the honest proxy — a
 * section that outgrows the cap is holding more than one idea, whatever it is
 * called. The fix is always to name the second idea, never to delete it.
 *
 * ⚠️ **When the worst section shrinks, lower the cap with it.** Otherwise every
 * split becomes new headroom, and the second test below fails on purpose to
 * make that impossible to forget.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const VAULT_ROOT = join(REPO_ROOT, "docs", "ontology");

/**
 * **The worst surviving section, in bytes** (`Behaviour Contract` in
 * `capabilities/acp-runtime.md`, 5,952 B).
 *
 * That section is five language scan contracts — Python, Go, C/Autotools, Rust,
 * It is the honest current ceiling, not a target.
 */
const SECTION_BYTE_CAP = 6_000;

/**
 * **The gap the cap is allowed to sit above reality.**
 *
 * A cap far above the worst real section is a gate that can never fire. This
 * keeps the ratchet within sight of the thing it measures.
 */
const CAP_HEADROOM = 400;

/**
 * **`## Competency answers` is exempt — it is parsed, not authored.**
 *
 * `src/shared/lib/project-meaning-evidence.ts` matches this heading exactly, and
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
