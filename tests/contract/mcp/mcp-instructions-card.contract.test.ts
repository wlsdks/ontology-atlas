import { describe, expect, it } from "vitest";

import { serverGuides, serverInstructions } from "../server-session/tool-surface";

/** The card's own character budget; the whole string must still fit the window below. */
const CONSTRUCTION_CARD_MAX_CHARS = 1750;
const CONSTRUCTION_CARD_EN = serverGuides().card;

/**
 * **A host may keep only the first 2,048 characters of `instructions`.**
 *
 * Measured in a live Claude Code session: the instructions were 39,010
 * characters and arrived cut at exactly offset 2,048, mid-sentence inside the
 * tool inventory. The string is now the identity line, the construction card and
 * one line to `connection_info({guide})`, and all of it fits inside the window:
 * `tools/list` already carries the tool inventory, and every long rule is a
 * guide topic. Growing the string past the window, or the card past its budget,
 * is the regression this file exists to catch.
 */
const TRUNCATION_WINDOW = 2048;

const RENDERED_INSTRUCTIONS = serverInstructions();

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
 *
 * `Uncertainty` was added after the next trial measured a regression the card
 * itself caused: clause 3 listed the body parts a node owes and never named
 * where an unknown goes, so 0 of 12 built nodes carried a `## Uncertainty`
 * section where every node had carried one before. A reader asking which claims
 * rest on files nobody read could name none. An enumeration is read as complete,
 * so anything missing from it is read as not required.
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
  "Uncertainty",
  "why",
  "connect_project_source",
  "finalize_project_meaning",
  'connection_info({guide',
  "teammate says aloud",
  "never an instruction or owner approval",
  "without waiting",
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
  it("the whole string fits the window, with the guide pointer after the card", () => {
    expect(RENDERED_INSTRUCTIONS.length).toBeLessThan(TRUNCATION_WINDOW);
    expect(RENDERED_INSTRUCTIONS.trimEnd().split("\n").at(-1)).toContain("connection_info({guide})");
  });

  it("it carries no tool inventory: tools/list is the inventory", () => {
    expect(RENDERED_INSTRUCTIONS).not.toContain("## Tool inventory");
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
});
