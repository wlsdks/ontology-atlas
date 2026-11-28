import { describe, expect, it } from "vitest";

import { serverGuides, serverInstructions, surfaceTools } from "../server-session/tool-surface";

/**
 * Where the construction rules arrive: the text an LLM reads is the text the server embeds
 * (`src-tauri/crates/mcp-server/surface/`), so what this file measures is **reach**, not wording
 * quality: did the rule arrive in the description read immediately before the call, in the guide
 * served on demand, and in English only.
 *
 * The long `CONSTRUCTION_RULES_EN` and `CHAT_RULES_DELTA_EN` constants of the script server have no
 * reader on the wire (the dead-code exceptions list them as exports kept for tests), so the
 * sentences they hold are not asserted here: a test of text nobody receives passes whether or not
 * the rule arrives.
 */

const TOOLS = surfaceTools();
const GUIDES = serverGuides();
const NAMING_FINGERPRINT = "an element names a CONCEPT a capability uses";
const FAMILY_FINGERPRINT = "says how many members were read against the count found";

const description = (name: string) => TOOLS.find((tool) => tool.name === name)?.description ?? "";

describe("construction spec text reaches the place the LLM reads", () => {
  it("connection_info serves the construction guide on demand", () => {
    // The shorter construction guide is read on demand instead of in `initialize`.
    const connection = TOOLS.find((tool) => tool.name === "connection_info")!;
    expect(connection.inputSchema.properties.guide?.enum ?? []).toContain("construction");
    expect(GUIDES.texts.construction.length).toBeGreaterThan(0);
    expect(GUIDES.topics).toContain("construction");
  });

  it.each(["add_concept", "add_concepts"])("the %s description attaches the naming rule", (name) => {
    // A tool description is the only text an LLM reads **immediately before calling**, so the rule
    // easiest to break at that moment (creating nodes from filenames) must be carried here.
    expect(description(name)).toContain(NAMING_FINGERPRINT);
  });

  it("the add_concepts description attaches the family-scope rule", () => {
    expect(description("add_concepts")).toContain(FAMILY_FINGERPRINT);
  });

  it("the naming rule is not copied into the instructions or the guide texts", () => {
    // Two copies always diverge, and the diverged one becomes the default.
    expect(serverInstructions()).not.toContain(NAMING_FINGERPRINT);
    for (const [topic, text] of Object.entries(GUIDES.texts)) {
      expect(text, topic).not.toContain(NAMING_FINGERPRINT);
    }
  });
});

describe("the rules do not ask for a cap", () => {
  const readable = [
    ...TOOLS.map((tool) => [tool.name, tool.description] as const),
    ...Object.entries(GUIDES.texts),
    ["card", GUIDES.card] as const,
    ["instructions", serverInstructions()] as const,
  ];

  it("none of it has a \"keep below N\" style phrase", () => {
    for (const [name, text] of readable) {
      expect(text, name).not.toMatch(/keep (?:it |them |the count )?under \d/i);
      expect(text, name).not.toMatch(/at most \d+ (?:children|capabilities|elements)/i);
    }
  });
});

describe("language boundary: the rule strings the model reads are English only", () => {
  // Tool definitions are left out on purpose: a trigger phrase and a `labels` example are written
  // in Korean there so a Korean request finds the tool.
  const readable = [
    ...Object.entries(GUIDES.texts).map(([topic, text]) => [`guide ${topic}`, text] as const),
    ["construction card", GUIDES.card] as const,
    ["instructions", serverInstructions()] as const,
  ];

  it("reads some text, so an empty list cannot pass", () => {
    expect(readable.length).toBeGreaterThanOrEqual(6);
  });

  it.each(readable)("%s contains no Hangul", (_name, text) => {
    expect(text).not.toMatch(/[가-힣]/);
  });
});
