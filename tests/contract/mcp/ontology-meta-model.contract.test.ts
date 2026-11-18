import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  META_MODEL_RULES_EN as MCP_META_MODEL_RULES_EN,
} from "../../../mcp/src/construction/construction-rules.mjs";
import {
  ONTOLOGY_META_MODEL_REFERENCE as MCP_META_MODEL_REFERENCE,
  VAULT_KINDS as MCP_VAULT_KINDS,
  defaultBody as mcpDefaultBody,
} from "../../../mcp/src/schema.mjs";
/*
 * Only the names the CLI re-exports; `cli/src/lib/mcp-bridge/schema.mjs` executes `mcp/src/schema.mjs`, so
 * this proves the CLI reaches the canon.
 */
import {
  VAULT_KINDS as CLI_VAULT_KINDS,
  defaultBody as cliDefaultBody,
} from "../../../cli/src/lib/mcp-bridge/schema.mjs";
import {
  META_MODEL_RULES_EN as APP_META_MODEL_RULES_EN,
} from "../../../src/features/vault-agent/model/system-prompt";
import { githubAnchorSlug } from "../../../src/shared/lib/library/github-anchor-slug";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const flat = (value: string) => value.replace(/\s+/g, " ").trim();

const SPEC_PATH = "docs/ONTOLOGY-ATLAS-SPEC.md";
const SPEC_ANCHOR = "#2-the-five-authorable-node-kinds-and-reserved-reader-kind";
const LOCAL_SPEC_POINTER = `${SPEC_PATH}${SPEC_ANCHOR}`;

describe("Atlas meta-model — one public canon reaches every authoring channel", () => {
  it("schema mirrors expose one public reference and five authorable kinds", () => {
    expect(MCP_META_MODEL_REFERENCE).toContain(LOCAL_SPEC_POINTER);
    // `vault-schema.contract.test.ts` owns the kind list; this checks only that CLI and MCP agree.
    expect(CLI_VAULT_KINDS).toEqual(MCP_VAULT_KINDS);
  });

  it.each(MCP_VAULT_KINDS)("%s starter points to the semantic contract", (kind) => {
    expect(mcpDefaultBody(kind, "Example")).toContain(MCP_META_MODEL_REFERENCE);
    expect(cliDefaultBody(kind, "Example")).toBe(mcpDefaultBody(kind, "Example"));
  });

  it("source MCP and in-app agent receive the exact same compact boundary", () => {
    expect(APP_META_MODEL_RULES_EN).toBe(MCP_META_MODEL_RULES_EN);
    expect(flat(MCP_META_MODEL_RULES_EN)).toContain(flat(MCP_META_MODEL_REFERENCE));

    // The `meta_model` guide topic serves it by import; the instructions, the
    // entry point and the tool table must not carry a hand-copied duplicate.
    expect(read("mcp/src/tools/read.mjs")).toContain("meta_model: META_MODEL_RULES_EN,");
    const toolDefinitions = readdirSync(resolve(ROOT, "mcp/src/server/tool-definitions"))
      .filter((file) => file.endsWith(".mjs"))
      .map((file) => `mcp/src/server/tool-definitions/${file}`);
    for (const file of ["mcp/src/server/instructions.mjs", "mcp/src/server/registry.mjs", "mcp/src/index.js", ...toolDefinitions]) {
      expect(read(file)).not.toContain(flat(MCP_META_MODEL_RULES_EN));
    }
  });

  it("the public canon owns the stable anchor consumed above", () => {
    // The anchor comes from the schema's own reference; the SPEC's headings are
    // slugged with the rule GitHub renders, so a renamed heading breaks this.
    const anchor = MCP_META_MODEL_REFERENCE.split("#")[1] ?? "";
    expect(anchor.length, "reference carries no #anchor").toBeGreaterThan(0);
    const slugs = [...read(SPEC_PATH).matchAll(/^#{1,6}\s+(.+)$/gm)]
      .map((match) => githubAnchorSlug(match[1]));
    expect(slugs.length, `${SPEC_PATH}: no headings read`).toBeGreaterThanOrEqual(1);
    expect(slugs, `${SPEC_PATH} has no heading for #${anchor}`).toContain(anchor);
  });
});
