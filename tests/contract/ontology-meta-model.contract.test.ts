import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  META_MODEL_RULES_EN as MCP_META_MODEL_RULES_EN,
} from "../../mcp/src/construction-rules.mjs";
import {
  ONTOLOGY_META_MODEL_REFERENCE as MCP_META_MODEL_REFERENCE,
  VAULT_KINDS as MCP_VAULT_KINDS,
  defaultBody as mcpDefaultBody,
} from "../../mcp/src/schema.mjs";
import {
  ONTOLOGY_META_MODEL_REFERENCE as CLI_META_MODEL_REFERENCE,
  VAULT_KINDS as CLI_VAULT_KINDS,
  defaultBody as cliDefaultBody,
} from "../../cli/src/lib/schema.mjs";
import {
  META_MODEL_RULES_EN as APP_META_MODEL_RULES_EN,
} from "../../src/features/vault-agent/model/system-prompt";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const flat = (value: string) => value.replace(/\s+/g, " ").trim();

const SPEC_PATH = "docs/ONTOLOGY-ATLAS-SPEC.md";
const SPEC_ANCHOR = "#2-the-five-authorable-node-kinds-and-reserved-reader-kind";
const LOCAL_SPEC_POINTER = `${SPEC_PATH}${SPEC_ANCHOR}`;

describe("Atlas meta-model — one public canon reaches every authoring channel", () => {
  it("schema mirrors expose one public reference and five authorable kinds", () => {
    expect(CLI_META_MODEL_REFERENCE).toBe(MCP_META_MODEL_REFERENCE);
    expect(MCP_META_MODEL_REFERENCE).toContain(LOCAL_SPEC_POINTER);
    expect(CLI_VAULT_KINDS).toEqual(MCP_VAULT_KINDS);
    expect(MCP_VAULT_KINDS).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "document",
    ]);
  });

  it.each(MCP_VAULT_KINDS)("%s starter points to the semantic contract", (kind) => {
    expect(mcpDefaultBody(kind, "Example")).toContain(MCP_META_MODEL_REFERENCE);
    expect(cliDefaultBody(kind, "Example")).toBe(mcpDefaultBody(kind, "Example"));
  });

  it("source MCP and in-app agent receive the exact same compact boundary", () => {
    expect(APP_META_MODEL_RULES_EN).toBe(MCP_META_MODEL_RULES_EN);
    expect(flat(MCP_META_MODEL_RULES_EN)).toContain(flat(MCP_META_MODEL_REFERENCE));

    const indexSource = read("mcp/src/index.js");
    expect(indexSource).toContain("${META_MODEL_RULES_EN}");
    expect(indexSource).not.toContain(flat(MCP_META_MODEL_RULES_EN));
  });

  it("compact boundary exposes current broader/is_a support without inventing an API", () => {
    const rules = flat(MCP_META_MODEL_RULES_EN);
    expect(rules).toMatch(/five authorable kinds/i);
    expect(rules).toMatch(/vault-readme.*reserved/i);
    expect(rules).toMatch(/broader.*narrower.*direct broader/i);
    expect(rules).toMatch(/UI.*is_a/i);
    expect(rules).toMatch(/not.*add_relation/i);
    expect(rules).toMatch(/get_concept.*mtime.*full post-change.*broader/i);
    expect(rules).toMatch(/patch_concept.*expected_mtime.*validate_vault/i);
    expect(rules).toMatch(/no.*inverse.*transitive.*inference/i);
    expect(rules).toMatch(/RDF.*OWL.*SKOS.*SHACL.*conformance/i);
  });

  it("kind and is_a counterevidence is present at the tool decision point", () => {
    const rules = flat(MCP_META_MODEL_RULES_EN);
    expect(rules).toMatch(/folder.*package.*team.*workflow.*not.*domain.*capability/i);
    expect(rules).toMatch(/same domain.*name similarity.*folder nesting.*not.*is_a/i);
    expect(rules).toMatch(/every valid example.*broader definition/i);
  });

  it.each([
    ".agents/skills/ontology-bootstrap/SKILL.md",
    ".claude/skills/ontology-bootstrap/SKILL.md",
    ".agents/skills/ontology-field-trial/SKILL.md",
    ".claude/skills/ontology-field-trial/SKILL.md",
    ".agents/skills/ontology-bootstrap/guides/meaning-extraction.md",
    ".claude/skills/ontology-bootstrap/guides/meaning-extraction.md",
  ])("%s points to the public canon instead of owning another kind table", (path) => {
    expect(read(path)).toContain(LOCAL_SPEC_POINTER);
  });

  it.each([
    ".agents/skills/ontology-bootstrap/SKILL.md",
    ".claude/skills/ontology-bootstrap/SKILL.md",
  ])("%s keeps proposal boundaries in the MCP array shape", (path) => {
    const skill = flat(read(path));
    expect(skill).toMatch(/includes.*excludes.*JSON string arrays.*never prose scalars/i);
  });

  it("the public canon owns the stable anchor consumed above", () => {
    expect(read(SPEC_PATH)).toContain(
      "## 2. The five authorable node kinds and reserved reader kind",
    );
  });
});
