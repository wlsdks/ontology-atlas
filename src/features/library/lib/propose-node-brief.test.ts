import { describe, expect, it } from "vitest";

import { buildProposeNodeBrief } from "./propose-node-brief";

const CANDIDATE = { name: "Export Worker", kind: "element" as const, pages: ["wiki/architecture", "wiki/runbook"], why: "named on three pages" };
const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

describe("the propose-node brief writes one node through the card and nothing else", () => {
  for (const locale of ["en", "ko"]) {
    const brief = buildProposeNodeBrief({ candidate: CANDIDATE, locale, vaultRoot: VAULT_ROOT });

    it(`${locale}: names the candidate, its kind, its pages and the folder`, () => {
      expect(brief).toContain("Export Worker");
      expect(brief).toContain("element");
      expect(brief).toContain("- wiki/architecture.md");
      expect(brief).toContain("- wiki/runbook.md");
      expect(brief).toContain(VAULT_ROOT);
    });

    it(`${locale}: asks for exactly one add_concept, evidence as wiki links, and no wiki edits`, () => {
      expect(brief).toContain("add_concept");
      expect(brief).toContain("[[wiki/");
      expect(brief).toContain("describes:");
      expect(brief).toContain("list_concepts");
    });
  }

  it("says first what the map is, so a person or an organisation gets no node", () => {
    const brief = buildProposeNodeBrief({ candidate: CANDIDATE, locale: "en", vaultRoot: VAULT_ROOT });
    expect(brief).toContain("The map is the code's ontology");
    expect(brief).toContain("create no node and say so");
  });
});
