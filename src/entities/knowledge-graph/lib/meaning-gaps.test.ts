import { describe, expect, it } from "vitest";

import {
  detectMeaningFindingGaps,
  detectMeaningGaps,
  type ConceptDocFacts,
} from "./meaning-gaps";

const doc = (partial: Partial<ConceptDocFacts> = {}): ConceptDocFacts => ({
  findings: [],
  domainRef: "billing",
  mtime: null,
  ...partial,
});

describe("detectMeaningGaps", () => {
  it("reports a missing meaning only for definition-missing findings", () => {
    expect(detectMeaningGaps({ kind: "capability" }, doc())).toEqual([]);
    expect(
      detectMeaningGaps({ kind: "capability" }, doc({ findings: ["definition-missing"] })),
    ).toEqual(["missing-definition"]);
  });

  it("does not treat other findings as missing meaning", () => {
    expect(
      detectMeaningGaps({ kind: "capability" }, doc({ findings: ["boundary-missing"] })),
    ).toEqual([]);
  });

  it("orders meaning before membership", () => {
    expect(
      detectMeaningGaps(
        { kind: "capability" },
        doc({ findings: ["definition-missing"], domainRef: null }),
      ),
    ).toEqual(["missing-definition", "missing-domain"]);
  });

  it("treats domains, projects and documents without a parent as complete", () => {
    expect(detectMeaningGaps({ kind: "domain" }, doc({ domainRef: null }))).toEqual([]);
  });
});

describe("detectMeaningFindingGaps", () => {
  it("maps codes to slot names in a fixed order", () => {
    expect(
      detectMeaningFindingGaps(
        doc({
          findings: [
            "slug-outside-kind-folder",
            "uncertainty-missing",
            "epistemic-exclusion",
            "boundary-missing",
          ],
        }),
      ),
    ).toEqual([
      "missing-boundary",
      "missing-uncertainty",
      "epistemic-exclusion",
      "slug-outside-kind-folder",
    ]);
  });

  it("emits one row when both boundaries are empty", () => {
    expect(
      detectMeaningFindingGaps(
        doc({ findings: ["boundary-missing", "boundary-missing"] }),
      ),
    ).toEqual(["missing-boundary"]);
  });

  it("excludes missing meaning, which has its own row", () => {
    expect(detectMeaningFindingGaps(doc({ findings: ["definition-missing"] }))).toEqual([]);
  });

  it("skips unknown codes without inventing a slot", () => {
    expect(detectMeaningFindingGaps(doc({ findings: ["folder-only-evidence"] }))).toEqual([]);
  });
});
