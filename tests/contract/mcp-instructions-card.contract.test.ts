import { describe, expect, it } from "vitest";

import {
  CONSTRUCTION_CARD_EN,
  CONSTRUCTION_CARD_MAX_CHARS,
} from "../../mcp/src/construction-card.mjs";
import {
  SERVER_INSTRUCTIONS_TEMPLATE,
  TOOL_INVENTORY_PLACEHOLDER,
} from "../../mcp/src/server/instructions.mjs";
import { TOOLS_FOR_LIST } from "../../mcp/src/server/registry.mjs";
import { buildToolInventorySection } from "../../mcp/src/tool-inventory.mjs";

/**
 * **A host may keep only the first 2,048 characters of `instructions`.**
 *
 * Measured in a live Claude Code session: the ontology-atlas instructions were
 * 39,010 characters and arrived cut at exactly offset 2,048, mid-sentence inside
 * the tool inventory. The meta-model boundary (2,818), the construction
 * lifecycle (4,621), the starting workflows (7,029), write-tool safety (30,024)
 * and the construction rules (35,606) never reached the attached agent at all.
 *
 * So the construction card is not merely first — it has to *end* before that
 * cut, composed exactly the way `mcp/src/server/instance.mjs` composes the
 * string it hands the client. Reordering the sections later is fine; pushing the
 * card past the window is the regression this file exists to catch.
 */
const TRUNCATION_WINDOW = 2048;

/** Composed exactly as `mcp/src/server/instance.mjs` does. */
const RENDERED_INSTRUCTIONS = SERVER_INSTRUCTIONS_TEMPLATE.replace(
  TOOL_INVENTORY_PLACEHOLDER,
  buildToolInventorySection(TOOLS_FOR_LIST),
);

const SURVIVING_WINDOW = RENDERED_INSTRUCTIONS.slice(0, TRUNCATION_WINDOW);

/**
 * Clauses a model that reads only the surviving window still needs: what the
 * five kinds are, where a node's slug lives, what every written node owes, what
 * a relation owes, where the write sequence ends, the refusal that must not be
 * faked, and how to reach everything the host dropped.
 *
 * The slug clauses were added after a trial run: with slug shape unstated, the
 * builder wrote every node flat at the vault root (`slug: option-declaration`)
 * instead of under its kind folder, and nothing in the surviving window said
 * otherwise.
 */
const REQUIRED_CLAUSES = [
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "domains/",
  "capabilities/",
  "elements/",
  "never a code path",
  "Includes",
  "Excludes",
  "why",
  "connect_project_source",
  "finalize_project_meaning",
  'connection_info({guide',
  "independent evaluator",
];

/**
 * Numbering defects inside one ordered list block.
 *
 * A list block runs until an unindented line that is neither numbered nor blank —
 * a heading or a paragraph. Wrapped continuation lines are indented, so they keep
 * the block open. Within a block the numbers must strictly increase: workflow B
 * shipped two steps both labelled "2.", which reads to a model as one step
 * restated rather than two calls to make.
 */
function listNumberingDefects(text: string): string[] {
  const defects: string[] = [];
  let previous: number | null = null;
  for (const line of text.split("\n")) {
    const numbered = /^(\d+)\. /.exec(line);
    if (numbered) {
      const current = Number(numbered[1]);
      if (previous !== null && current <= previous) {
        defects.push(`${previous}. is followed by ${current}. at "${line.slice(0, 70)}"`);
      }
      previous = current;
      continue;
    }
    if (line.trim() === "" || /^\s/.test(line)) continue;
    previous = null;
  }
  return defects;
}

describe("construction card — it survives a truncating host", () => {
  it("the renderer under test is the real one, not an empty string", () => {
    expect(RENDERED_INSTRUCTIONS.length).toBeGreaterThan(TRUNCATION_WINDOW * 4);
    expect(RENDERED_INSTRUCTIONS).toContain("## Tool inventory (");
  });

  it("the card fits its own budget", () => {
    expect(CONSTRUCTION_CARD_EN.length).toBeLessThanOrEqual(CONSTRUCTION_CARD_MAX_CHARS);
  });

  it("the whole card is inside the first 2,048 characters", () => {
    expect(SURVIVING_WINDOW).toContain(CONSTRUCTION_CARD_EN);
  });

  it("one short identity line precedes it and nothing else does", () => {
    const [identity] = RENDERED_INSTRUCTIONS.split("\n");
    expect(identity.startsWith("ontology-atlas — ")).toBe(true);
    expect(identity.length).toBeLessThan(120);
    expect(RENDERED_INSTRUCTIONS.indexOf(CONSTRUCTION_CARD_EN)).toBeLessThanOrEqual(
      identity.length + 2,
    );
  });

  it.each(REQUIRED_CLAUSES)("the surviving window still says %s", (clause) => {
    expect(SURVIVING_WINDOW).toContain(clause);
  });
});

describe("instructions — a list a model can follow", () => {
  it("no ordered list repeats or rewinds a number", () => {
    expect(listNumberingDefects(RENDERED_INSTRUCTIONS)).toEqual([]);
  });

  it("the defect detector is not blind — it catches a planted repeat", () => {
    expect(listNumberingDefects("1. first\n2. second\n2. also second\n")).toHaveLength(1);
  });

  it("no heading letter is used twice", () => {
    const letters = [...RENDERED_INSTRUCTIONS.matchAll(/^### ([A-Z])\. /gm)].map(
      (match) => match[1],
    );
    expect(letters.length).toBeGreaterThan(0);
    expect(new Set(letters).size).toBe(letters.length);
  });
});
