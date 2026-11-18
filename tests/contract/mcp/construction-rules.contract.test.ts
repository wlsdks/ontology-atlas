import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_RULES_DELTA_EN,
  CONSTRUCTION_RULES_EN,
  ELEMENT_NAMING_RULE_BATCH_EN,
  ELEMENT_NAMING_RULE_EN,
  denseParentActionMessage,
} from "../../../mcp/src/construction/construction-rules.mjs";
import { NODE_ELIGIBILITY_GATE } from "../../../mcp/src/schema.mjs";

/**
 * The "text is authoritative" gate for the construction rules.
 *
 * The header of `mcp/src/construction/construction-rules.mjs` names this file itself, saying
 * *"until this gate exists, this file is a proposal, not the source of truth"*.
 * That was accurate — the four strings had zero consumers for a while, and a
 * sentence nobody reads is not a spec.
 *
 * So what this file measures is not wording quality but **reach and singularity**:
 * did it arrive where the LLM actually reads, and did it arrive by import or by
 * hand-copying. Without measuring the latter, "single source" is a phrase that
 * lives only in a comment.
 */

/**
 * The files the rules have to reach: the `initialize` instructions, the tool
 * table and the per-family tool definitions. They left `index.js` when the entry
 * point became wiring only, so all are read and joined — a gate that read only
 * one of them could go green because the text moved rather than because it
 * arrived.
 */
const TOOL_DEFINITION_FILES = readdirSync(resolve(__dirname, "../../../mcp/src/server/tool-definitions"))
  .filter((file) => file.endsWith(".mjs"))
  .map((file) => `server/tool-definitions/${file}`);
const SERVER_SOURCE = ["server/instructions.mjs", "server/registry.mjs", "index.js", ...TOOL_DEFINITION_FILES]
  .map((file) => readFileSync(resolve(__dirname, "../../../mcp/src", file), "utf-8"))
  .join("\n");

/** Phrases that occur only in the source of truth and would not be retyped by hand. */
const RULES_FINGERPRINT = "count alone is not evidence of";

/**
 * Line breaks are not the contract; the meaning is. The source is hard-wrapped, so
 * a phrase spanning a line break breaks `toContain` — that is a width change, not a
 * spec change. Whitespace is folded before comparing.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}
const NAMING_FINGERPRINT = "an element names a CONCEPT a capability uses";
const BATCH_FINGERPRINT = "Rows whose `title` is a bare file path";

describe("construction spec text reaches the place the LLM reads", () => {
  it("connection_info serves the construction guide by import, not a copy", () => {
    // The bridge procedure below stays with the in-app agent; an MCP client reads
    // the shorter construction guide on demand instead of in `initialize`.
    const read = readFileSync(resolve(__dirname, "../../../mcp/src/tools/read.mjs"), "utf-8");
    expect(read).toMatch(
      /import \{[\s\S]*?CONSTRUCTION_GUIDE_EN[\s\S]*?\} from '\.\.\/construction\/construction-card\.mjs';/,
    );
    expect(read).toContain("construction: CONSTRUCTION_GUIDE_EN,");
  });

  it("add_concept and add_concepts descriptions attach the naming rule", () => {
    // A tool description is the only text an LLM reads **immediately before calling**,
    // so the rule easiest to break at that moment (creating nodes from filenames) must
    // be carried here.
    expect(SERVER_SOURCE).toContain("ELEMENT_NAMING_RULE_EN");
    expect(SERVER_SOURCE).toContain("ELEMENT_NAMING_RULE_BATCH_EN");
  });

  it("really imports the naming rules", () => {
    expect(SERVER_SOURCE).toMatch(
      /import \{[\s\S]*?ELEMENT_NAMING_RULE_EN[\s\S]*?\} from '(?:\.\.\/)+construction\/construction-rules\.mjs';/,
    );
  });
});

describe("a single canonical source: derived, not copied", () => {
  // It is the same `mcp/` package, so a real import is possible. Copying when import
  // is available is an accident, not a convention — two copies always diverge, and
  // the diverged one becomes the default.
  it.each([
    ["CONSTRUCTION_RULES_EN", RULES_FINGERPRINT],
    ["ELEMENT_NAMING_RULE_EN", NAMING_FINGERPRINT],
    ["ELEMENT_NAMING_RULE_BATCH_EN", BATCH_FINGERPRINT],
  ])("the sentence of %s is not duplicated as a literal in the server source", (_name, fingerprint) => {
    expect(SERVER_SOURCE).not.toContain(fingerprint);
  });

  it("the fingerprint sentence exists on the canonical side, otherwise the check above passes silently once the fingerprint rots", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain(RULES_FINGERPRINT);
    expect(ELEMENT_NAMING_RULE_EN).toContain(NAMING_FINGERPRINT);
    expect(ELEMENT_NAMING_RULE_BATCH_EN).toContain(BATCH_FINGERPRINT);
  });
});

describe("value source: numbers come from schema.mjs", () => {
  it("the bootstrap trigger is interpolated rather than hard-coded", () => {
    const { domain_to_capability: d2c, capability_to_element: c2e } =
      NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER;
    expect(CONSTRUCTION_RULES_EN).toContain(`about ${d2c} capabilities`);
    expect(CONSTRUCTION_RULES_EN).toContain(`about ${c2e} elements`);
    // Changing the constant must move the sentence with it. Verified by looking for a
    // literal reference in the source — comparing only numbers passes even when the
    // same value was hard-coded by coincidence.
    const source = readFileSync(
      resolve(__dirname, "../../../mcp/src/construction/construction-rules.mjs"),
      "utf-8",
    );
    expect(source).toContain(
      "${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.domain_to_capability}",
    );
    expect(source).toContain(
      "${NODE_ELIGIBILITY_GATE.BOOTSTRAP_FANOUT_TRIGGER.capability_to_element}",
    );
  });
});

describe("the Goodhart-prevention sentence is alive", () => {
  it("capability evidence is split into path, and graph children into element slug", () => {
    const rules = flat(CONSTRUCTION_RULES_EN);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).toContain("one canonical implementation entry point in `path:`");
    expect(rules).toContain("`elements:` contains only slugs of real element nodes");
    expect(rules).not.toContain("the path itself, which counts");
    expect(rules).not.toContain("file path straight into `elements:`");
  });

  // A number here is a verification threshold, not a target; without these sentences it reads as
  // 'keep it under N', which a model satisfies with empty buckets.
  it("states it is a trigger rather than a cap", () => {
    expect(CONSTRUCTION_RULES_EN).toContain("NOT a limit");
    expect(CONSTRUCTION_RULES_EN).toContain("There is no maximum number of children");
  });

  it("has a \"leave it alone\" branch", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("create NOTHING");
  });

  it("states plainly that it does not block writes", () => {
    expect(CONSTRUCTION_RULES_EN).toContain("does not block writes");
  });

  it("has no \"keep below N\" style phrase", () => {
    for (const text of [
      CONSTRUCTION_RULES_EN,
      ELEMENT_NAMING_RULE_EN,
      ELEMENT_NAMING_RULE_BATCH_EN,
      CHAT_RULES_DELTA_EN,
    ]) {
      expect(text).not.toMatch(/keep (?:it |them |the count )?under \d/i);
      expect(text).not.toMatch(/at most \d+ (?:children|capabilities|elements)/i);
    }
  });

  it("presents the prefix as a hint rather than a condition", () => {
    // Measurement shows this signal is wrong in both directions —
    // `topology-kind-color-*` ×4 were legitimate siblings, and the 92 that were
    // actually broken shared no prefix at all.
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("do NOT treat this as the condition");
    expect(CONSTRUCTION_RULES_EN).toContain("THIS IS THE TEST");
  });
});

describe("language boundary: strings the model reads are English only", () => {
  it.each([
    ["CONSTRUCTION_RULES_EN", CONSTRUCTION_RULES_EN],
    ["ELEMENT_NAMING_RULE_EN", ELEMENT_NAMING_RULE_EN],
    ["ELEMENT_NAMING_RULE_BATCH_EN", ELEMENT_NAMING_RULE_BATCH_EN],
    ["CHAT_RULES_DELTA_EN", CHAT_RULES_DELTA_EN],
  ])("%s contains no Hangul", (_name, text) => {
    expect(text).not.toMatch(/[가-힣]/);
  });
});

/**
 * Bridge nodes: the name must travel with the four qualifying conditions; recommending a bridge
 * without qualification approves an empty bucket.
 */
describe("bridge node: the name and its qualifying conditions go together", () => {
  it("has a name", () => {
    expect(flat(CONSTRUCTION_RULES_EN)).toContain("BRIDGE NODE");
  });

  it("all four qualifying conditions are present", () => {
    const rules = flat(CONSTRUCTION_RULES_EN);
    // ① Name the shared behaviour — merely sharing a location is not a bridge
    expect(rules).toContain("names a shared BEHAVIOR");
    expect(rules).toMatch(/"Group A"/);
    expect(rules).toContain("they are empty buckets");
    // ② Create it only if it can be stated in one sentence
    expect(rules).toContain("state that behavior in ONE sentence");
    // ③ The bridge itself must be semantically exclusive of its siblings
    expect(rules).toContain("bridge itself passes (a) against its own siblings");
    // ④ Actually reparent after creating it — left empty, it is the empty bucket
    expect(rules).toContain("reparent the children afterwards");
    expect(rules).toContain("reported for retirement");
  });

  it("carries an exit saying nothing is created unless all four are met", () => {
    // Without this sentence only "create a bridge" remains, which is an instruction to
    // manufacture empty buckets.
    expect(flat(CONSTRUCTION_RULES_EN)).toContain(
      "IF you cannot satisfy all four: create NOTHING",
    );
  });

  it("the density warning points at the bridge without restating the qualifying conditions", () => {
    const message = flat(
      denseParentActionMessage({
        parentSlug: "capabilities/x",
        count: 9,
        childKind: "element",
        trigger: 6,
        basis: "bootstrap",
        evidence: "a single session filled this parent",
      }),
    );
    expect(message).toContain("BRIDGE NODE");
    // The four conditions live in the source of truth and are only pointed at here —
    // written in two places they diverge.
    expect(message).toContain("the construction rules list the four conditions");
    expect(message).not.toContain("names a shared BEHAVIOR");
    expect(message).not.toContain("ONE sentence");
  });
});
