import { describe, expect, it } from "vitest";
import {
  boundaryFindings,
  definitionFinding,
  epistemicExclusionFinding,
  folderForKind,
  isEpistemicExclusionBoundary,
  meaningFindings,
  parseBodySections,
  slugOutsideKindFolderFinding,
  uncertaintyFinding,
} from "./meaning-findings";

/**
 * The browser port's own behaviour. Whether it *agrees with the canonical
 * module* is a different question and belongs to
 * `tests/contract/meaning-findings-parity.contract.test.ts`, which runs both
 * over one table; this file pins the edges that make each rule what it is.
 */

const DEFINED =
  "Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.";

describe("parseBodySections", () => {
  it("the `#` title is neither lead nor section — a node does not define itself by its name", () => {
    const { lead, sections } = parseBodySections(`# Vault Compiler\n\n${DEFINED}\n`);
    expect(lead).toEqual([DEFINED]);
    expect(sections).toEqual([]);
  });

  it("a `##` inside a fenced block does not invent a section", () => {
    const { sections } = parseBodySections("```sh\n## Uncertainty\n```\n\n## Includes\n\n- real\n");
    expect(sections.map((section) => section.heading)).toEqual(["Includes"]);
  });

  it("the starter template's trailing reference line is furniture, not prose", () => {
    const { lead } = parseBodySections(
      "# X\n\nKind and relation contract: https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind\n",
    );
    expect(lead).toEqual([]);
  });
});

describe("definitionFinding", () => {
  it("prose before the first `##` counts", () => {
    expect(
      definitionFinding({ kind: "element", title: "Vault Compiler", body: `# Vault Compiler\n\n${DEFINED}\n` }),
    ).toBeNull();
  });

  it("a `## Definition` section counts too — the shape the qualification lane writes", () => {
    expect(
      definitionFinding({
        kind: "element",
        title: "Vault Compiler",
        body: `# Vault Compiler\n\n## Definition\n\n${DEFINED}\n`,
      }),
    ).toBeNull();
  });

  it("eight words that only rearrange the title do not count", () => {
    expect(
      definitionFinding({
        kind: "element",
        title: "Bottom Tab Bar",
        body: "# Bottom Tab Bar\n\nMobile and web bottom tab navigation bar for the app.\n",
      }),
    ).toMatchObject({ code: "definition-missing" });
  });

  it("a project is not asked for one", () => {
    expect(definitionFinding({ kind: "project", title: "Atlas", body: "# Atlas\n" })).toBeNull();
  });
});

describe("boundaryFindings", () => {
  it("names the side that is missing, one finding each", () => {
    const findings = boundaryFindings({
      kind: "capability",
      title: "Ability",
      body: `# Ability\n\n${DEFINED}\n`,
    });
    expect(findings.map((finding) => finding.key)).toEqual(["includes", "excludes"]);
  });

  it("`## Out of scope` is the negative side, not a `scope` heading", () => {
    const findings = boundaryFindings({
      kind: "capability",
      title: "Ability",
      body:
        `# Ability\n\n${DEFINED}\n\n## In scope\n\n- reading the folder\n\n` +
        "## Out of scope\n\n- drawing it, which the map owns\n",
    });
    expect(findings).toEqual([]);
  });

  it("the template's own placeholder bullet still counts as empty", () => {
    const findings = boundaryFindings({
      kind: "capability",
      title: "Ability",
      body:
        `# Ability\n\n${DEFINED}\n\n## Includes\n\n- <one thing this capability can do>\n\n` +
        "## Excludes\n\n- <one nearby ability this capability does not provide>\n",
    });
    expect(findings).toHaveLength(2);
  });

  it("an element states no boundary", () => {
    expect(boundaryFindings({ kind: "element", title: "Role", body: "# Role\n" })).toEqual([]);
  });
});

describe("uncertaintyFinding", () => {
  it("every synonym heading is the same section", () => {
    for (const heading of ["Uncertainty", "Open questions", "Unknowns", "Not checked", "Confidence"]) {
      expect(
        uncertaintyFinding({
          kind: "element",
          title: "Role",
          body: `# Role\n\n${DEFINED}\n\n## ${heading}\n\n- the retry path was never opened\n`,
        }),
        heading,
      ).toBeNull();
    }
  });

  it("a slot is not an answer", () => {
    expect(
      uncertaintyFinding({
        kind: "element",
        title: "Role",
        body: `# Role\n\n${DEFINED}\n\n## Uncertainty\n\n- <what you did not read or could not check>\n`,
      }),
    ).toMatchObject({ code: "uncertainty-missing" });
  });
});

describe("isEpistemicExclusionBoundary", () => {
  it("separates what the writer did not see from what the product does not do", () => {
    expect(isEpistemicExclusionBoundary("the examples folder, which this survey did not inspect")).toBe(true);
    expect(isEpistemicExclusionBoundary("`typings/index.d.ts`, which was not read")).toBe(true);
    expect(isEpistemicExclusionBoundary("Atlas does not sync folders between machines")).toBe(false);
    expect(isEpistemicExclusionBoundary("flags, which are options rather than positional arguments")).toBe(false);
  });

  it("quotes the offending bullets so the writer can find them", () => {
    const finding = epistemicExclusionFinding({
      kind: "capability",
      title: "Ability",
      body:
        `# Ability\n\n${DEFINED}\n\n## Includes\n\n- reading the folder\n\n` +
        "## Excludes\n\n- the retry queue, which this survey did not inspect\n- drawing it, which the map owns\n",
    });
    expect(finding?.refs).toEqual(["the retry queue, which this survey did not inspect"]);
  });
});

describe("slugOutsideKindFolderFinding", () => {
  it("stays silent when nobody stated where the file sits", () => {
    expect(slugOutsideKindFolderFinding({ kind: "element" })).toBeNull();
  });

  it("names what the same node would be called inside its folder", () => {
    expect(slugOutsideKindFolderFinding({ kind: "element", slug: "token-rotator" })).toMatchObject({
      refs: ["elements/token-rotator"],
    });
  });

  it("a project and a document live at the root by design", () => {
    expect(folderForKind("project")).toBe("");
    expect(slugOutsideKindFolderFinding({ kind: "project", slug: "atlas" })).toBeNull();
    expect(slugOutsideKindFolderFinding({ kind: "document", slug: "decisions" })).toBeNull();
  });
});

describe("meaningFindings", () => {
  it("an unwritten capability fails every question at once, and none of them blocks", () => {
    const codes = meaningFindings({
      kind: "capability",
      slug: "capabilities/ability",
      title: "Ability",
      body: "# Ability\n",
    }).map((finding) => finding.code);
    expect(codes.sort()).toEqual([
      "boundary-missing",
      "boundary-missing",
      "definition-missing",
      "uncertainty-missing",
    ]);
  });

  it("a kind nobody wrote is not judged", () => {
    expect(meaningFindings({ kind: "  ", body: "# X\n" })).toEqual([]);
  });
});
