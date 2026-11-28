import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  META_MODEL_RULES_EN as APP_META_MODEL_RULES_EN,
} from "../../../src/features/vault-agent/model/system-prompt";
import { githubAnchorSlug } from "../../../src/shared/lib/library/github-anchor-slug";
import golden from "../../fixtures/meaning-findings-golden.json";
import { serverGuides, serverInstructions, surfaceTools } from "../server-session/tool-surface";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const flat = (value: string) => value.replace(/\s+/g, " ").trim();

const SPEC_PATH = "docs/ONTOLOGY-ATLAS-SPEC.md";
const SPEC_ANCHOR = "#2-the-five-authorable-node-kinds-and-reserved-reader-kind";
const LOCAL_SPEC_POINTER = `${SPEC_PATH}${SPEC_ANCHOR}`;
const SERVER_META_MODEL_RULES_EN = serverGuides().texts.meta_model;

describe("Atlas meta-model — one public canon reaches every authoring channel", () => {
  it("the server's meta-model guide carries the one public reference", () => {
    expect(flat(SERVER_META_MODEL_RULES_EN)).toContain(LOCAL_SPEC_POINTER);
  });

  // The starters were recorded from the script server (`tests/fixtures/meaning-findings-golden.json`).
  it("there are five authorable kinds, and each starter points to the semantic contract", () => {
    const kinds = Object.keys(golden.starterBodies);
    expect(kinds).toHaveLength(5);
    for (const kind of kinds) {
      expect(golden.starterBodies[kind as keyof typeof golden.starterBodies], kind).toContain(LOCAL_SPEC_POINTER);
    }
  });

  it("the server's meta-model guide and the in-app agent receive the exact same compact boundary", () => {
    expect(APP_META_MODEL_RULES_EN).toBe(SERVER_META_MODEL_RULES_EN);

    // The `meta_model` guide topic serves it; the instructions and the tool table must not
    // carry a hand-copied duplicate.
    expect(serverInstructions()).not.toContain(flat(SERVER_META_MODEL_RULES_EN));
    for (const tool of surfaceTools()) {
      expect(flat(JSON.stringify(tool)), tool.name).not.toContain(flat(SERVER_META_MODEL_RULES_EN));
    }
  });

  it("the public canon owns the stable anchor consumed above", () => {
    // The anchor comes from the reference every channel carries; the SPEC's headings are
    // slugged with the rule GitHub renders, so a renamed heading breaks this.
    const anchor = LOCAL_SPEC_POINTER.split("#")[1] ?? "";
    expect(anchor.length, "reference carries no #anchor").toBeGreaterThan(0);
    const slugs = [...read(SPEC_PATH).matchAll(/^#{1,6}\s+(.+)$/gm)]
      .map((match) => githubAnchorSlug(match[1]));
    expect(slugs.length, `${SPEC_PATH}: no headings read`).toBeGreaterThanOrEqual(1);
    expect(slugs, `${SPEC_PATH} has no heading for #${anchor}`).toContain(anchor);
  });
});
