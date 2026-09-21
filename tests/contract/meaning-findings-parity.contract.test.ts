import { describe, expect, it } from "vitest";
import {
  boundaryFindings as boundaryMcp,
  definitionFinding as definitionMcp,
  epistemicExclusionFinding as epistemicMcp,
  uncertaintyFinding as uncertaintyMcp,
} from "../../mcp/src/meaning-findings.mjs";
import { defaultBody, folderForKind } from "../../mcp/src/schema.mjs";
import {
  BODY_BOUNDARY_SECTIONS as BOUNDARY_TS,
  BODY_DEFINITION_SECTIONS as DEFINITION_TS,
  BODY_UNCERTAINTY_SECTIONS as UNCERTAINTY_TS,
  KIND_BODY_TEMPLATES,
  folderForKind as folderTs,
  isEpistemicExclusionBoundary as epistemicRuleTs,
  meaningFindings as meaningFindingsTs,
  parseBodySections,
} from "@/shared/lib/meaning-findings";
import {
  BODY_BOUNDARY_SECTIONS as BOUNDARY_MCP,
  BODY_DEFINITION_SECTIONS as DEFINITION_MCP,
  BODY_UNCERTAINTY_SECTIONS as UNCERTAINTY_MCP,
  isEpistemicExclusionBoundary as epistemicRuleMcp,
} from "../../mcp/src/construction-rules.mjs";

/**
 * **The body half of the validator contract.**
 *
 * `mcp/src/meaning-findings.mjs` is the canonical judgement and reaches for
 * `node:fs`, so the browser cannot execute it; `src/shared/lib/meaning-findings.ts`
 * is the port. Two implementations of one rule drift — that is the accident this
 * repository already recorded for the parser and for the frontmatter validator —
 * so both run over one fixture table here and must return the same code set for
 * every body.
 *
 * Only `folder-only-evidence` is absent from both sides of the comparison: it
 * asks the filesystem whether a cited path is a directory, which the port
 * deliberately does not do.
 *
 * Every row exists because it once decided something:
 *  - the `## Definition`-first shape, which the qualification lane writes and an
 *    earlier version of the rule accused 15 of 16 nodes over;
 *  - the title-restatement shape, the review falsifier for the length-only rule;
 *  - the three evidence-limit phrasings a real builder produced;
 *  - a placeholder-only `## Uncertainty`, because a slot is not an answer;
 *  - a fenced `##` comment, which must not invent a section that is not there.
 */

interface BodyCase {
  name: string;
  kind: string;
  title: string;
  slug?: string;
  body: string;
  /** The codes both implementations must return, sorted. */
  expected: string[];
}

/** A capability body with every meaning question answered — the negative baseline. */
const FULL_CAPABILITY_BODY =
  "# Vault Compiler\n\n" +
  "Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n" +
  "## Includes\n\n" +
  "- Reading frontmatter relations from every document in the folder\n\n" +
  "## Excludes\n\n" +
  "- Drawing the result on screen, which the map surface owns\n\n" +
  "## Uncertainty\n\n" +
  "- Whether a folder with symlinked subtrees behaves the same was never measured\n";

const CASES: BodyCase[] = [
  {
    name: "a capability that answers every question is clean",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: FULL_CAPABILITY_BODY,
    expected: [],
  },
  {
    name: "the shape the qualification lane writes: nothing above the first `##`, definition under a heading",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body:
      "# Vault Compiler\n\n" +
      "## Definition\n\n" +
      "Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n" +
      "## Includes\n\n- Reading frontmatter relations from every document\n\n" +
      "## Excludes\n\n- Drawing the result on screen, which the map owns\n\n" +
      "## Uncertainty\n\n- The symlinked-subtree case was never measured\n",
    expected: [],
  },
  {
    name: "a body that opens straight into headings has no definition",
    kind: "element",
    title: "Token Rotator",
    slug: "elements/token-rotator",
    body: "# Token Rotator\n\n## Uncertainty\n\n- The refresh path was never opened\n",
    expected: ["definition-missing"],
  },
  {
    name: "a definition that only restates the title is still missing (the review falsifier)",
    kind: "element",
    title: "Bottom Tab Bar",
    slug: "elements/bottom-tab-bar",
    body:
      "# Bottom Tab Bar\n\n" +
      "Mobile and web bottom tab navigation bar for the app.\n\n" +
      "## Uncertainty\n\n- The tablet layout was not measured\n",
    expected: ["definition-missing"],
  },
  {
    name: "the untouched starter scaffold fails every body check at once",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: defaultBody("capability", "Vault Compiler") as string,
    expected: ["boundary-missing", "boundary-missing", "definition-missing", "uncertainty-missing"],
  },
  {
    name: "a capability with no `## Excludes` misses one boundary side",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body:
      "# Vault Compiler\n\n" +
      "Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n" +
      "## Includes\n\n- Reading frontmatter relations from every document\n\n" +
      "## Uncertainty\n\n- The symlinked-subtree case was never measured\n",
    expected: ["boundary-missing"],
  },
  {
    name: "`## Out of scope` is read as the excludes side, not as a scope heading",
    kind: "domain",
    title: "Agent Integration",
    slug: "domains/agent-integration",
    body:
      "# Agent Integration\n\n" +
      "Owns how an outside coding agent reaches this vault and what it is allowed to change.\n\n" +
      "## In scope\n\n- The stdio MCP child this product starts itself\n\n" +
      "## Out of scope\n\n- The coding agent's own provider traffic, which Atlas never sees\n\n" +
      "## Uncertainty\n\n- The Windows launcher path was not exercised\n",
    expected: [],
  },
  {
    name: "an exclusion naming a survey that did not inspect is an evidence limit",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: FULL_CAPABILITY_BODY.replace(
      "- Drawing the result on screen, which the map surface owns",
      "- The retry queue, which this survey did not inspect",
    ),
    expected: ["epistemic-exclusion"],
  },
  {
    name: "an exclusion naming a file that was not read is an evidence limit",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: FULL_CAPABILITY_BODY.replace(
      "- Drawing the result on screen, which the map surface owns",
      "- `typings/index.d.ts`, the TypeScript surface, which was not read",
    ),
    expected: ["epistemic-exclusion"],
  },
  {
    name: "an exclusion naming something not carried as a node is an evidence limit",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: FULL_CAPABILITY_BODY.replace(
      "- Drawing the result on screen, which the map surface owns",
      "- `index.js`, the package front door, which is not carried as a node in this first pass",
    ),
    expected: ["epistemic-exclusion"],
  },
  {
    name: "an ordinary product boundary is not accused of being an evidence limit",
    kind: "capability",
    title: "Vault Compiler",
    slug: "capabilities/vault-compiler",
    body: FULL_CAPABILITY_BODY.replace(
      "- Drawing the result on screen, which the map surface owns",
      "- Flags, which are options rather than positional arguments",
    ),
    expected: [],
  },
  {
    name: "an `## Uncertainty` holding only the template placeholder is empty",
    kind: "element",
    title: "Token Rotator",
    slug: "elements/token-rotator",
    body:
      "# Token Rotator\n\n" +
      "Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n" +
      "## Uncertainty\n\n- <what you did not read or could not check>\n",
    expected: ["uncertainty-missing"],
  },
  {
    name: "`## Open questions` counts as the same section",
    kind: "element",
    title: "Token Rotator",
    slug: "elements/token-rotator",
    body:
      "# Token Rotator\n\n" +
      "Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n" +
      "## Open questions\n\n- Whether the refresh window survives a clock change\n",
    expected: [],
  },
  {
    name: "a fenced `##` comment does not invent a section",
    kind: "element",
    title: "Token Rotator",
    slug: "elements/token-rotator",
    body:
      "# Token Rotator\n\n" +
      "Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n" +
      "```sh\n## Uncertainty\necho not a heading\n```\n",
    expected: ["uncertainty-missing"],
  },
  {
    name: "a project carries no definition, boundary, or uncertainty duty",
    kind: "project",
    title: "Ontology Atlas",
    slug: "ontology-atlas",
    body: "# Ontology Atlas\n\nA local-first codebase ontology.\n",
    expected: [],
  },
  {
    name: "a flat slug groups with nothing",
    kind: "element",
    title: "Token Rotator",
    slug: "token-rotator",
    body:
      "# Token Rotator\n\n" +
      "Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n" +
      "## Uncertainty\n\n- The older app build's deep-link fallback was not read\n",
    expected: ["slug-outside-kind-folder"],
  },
];

/** The canonical module's five body judgements, flattened to a sorted code list. */
function mcpCodes(bodyCase: BodyCase): string[] {
  const input = {
    kind: bodyCase.kind,
    slug: bodyCase.slug ?? "",
    title: bodyCase.title,
    body: bodyCase.body,
  };
  const findings = [
    definitionMcp(input),
    ...boundaryMcp(input),
    uncertaintyMcp(input),
    epistemicMcp(input),
  ].filter(Boolean) as Array<{ code: string }>;
  const codes = findings.map((finding) => finding.code);
  /*
   * `slug-outside-kind-folder` lives in `vault.mjs`'s write gate rather than in
   * `meaning-findings.mjs`, so the canonical rule is read from the schema it is
   * built on — `folderForKind` plus a prefix test, the same two lines the gate
   * runs. Comparing the port against a re-typed literal would prove nothing.
   */
  const folder = folderForKind(bodyCase.kind) as string;
  if (bodyCase.slug && folder && !bodyCase.slug.startsWith(folder)) {
    codes.push("slug-outside-kind-folder");
  }
  return codes.sort();
}

describe("meaning findings — the mcp module and the browser port agree", () => {
  for (const bodyCase of CASES) {
    it(bodyCase.name, () => {
      const fromMcp = mcpCodes(bodyCase);
      const fromTs = meaningFindingsTs({
        kind: bodyCase.kind,
        slug: bodyCase.slug,
        title: bodyCase.title,
        body: bodyCase.body,
      })
        .map((finding) => finding.code)
        .sort();
      expect(fromTs).toEqual(fromMcp);
      expect(fromTs).toEqual([...bodyCase.expected].sort());
    });
  }
});

describe("the constants the two implementations decide with", () => {
  it("the starter template for every kind is byte-identical to the schema's", () => {
    for (const kind of Object.keys(KIND_BODY_TEMPLATES)) {
      expect(KIND_BODY_TEMPLATES[kind]("Sample Title"), kind).toBe(
        defaultBody(kind, "Sample Title"),
      );
    }
  });

  it("every schema kind that has a starter body is mirrored in the port", () => {
    // A new authorable kind must appear on both sides, or the placeholder
    // derivation silently stops recognising its scaffold.
    for (const kind of ["project", "domain", "capability", "element", "document"]) {
      expect(Object.keys(KIND_BODY_TEMPLATES)).toContain(kind);
      expect(folderTs(kind)).toBe(folderForKind(kind));
    }
  });

  it("the heading synonym lists match", () => {
    expect([...DEFINITION_TS]).toEqual([...DEFINITION_MCP]);
    expect([...UNCERTAINTY_TS]).toEqual([...UNCERTAINTY_MCP]);
    expect([...BOUNDARY_TS.includes]).toEqual([...BOUNDARY_MCP.includes]);
    expect([...BOUNDARY_TS.excludes]).toEqual([...BOUNDARY_MCP.excludes]);
  });

  it("the epistemic-exclusion rule answers identically, sentence by sentence", () => {
    const sentences = [
      "the test suite and the examples folder, which this survey did not inspect",
      "`typings/index.d.ts`, the TypeScript surface, which was not read",
      "`index.js`, the package front door, which is not carried as a node in this first pass",
      "remote vaults are not mentioned in this scan",
      "Atlas does not sync folders between machines",
      "flags, which are options rather than positional arguments",
      "rendering the graph, which the map surface owns",
    ];
    for (const sentence of sentences) {
      expect(epistemicRuleTs(sentence), sentence).toBe(epistemicRuleMcp(sentence));
    }
  });

  it("a fenced block never becomes a section on either side", () => {
    const { sections } = parseBodySections("```\n## Uncertainty\n```\n\n## Includes\n\n- real\n");
    expect(sections.map((section) => section.heading)).toEqual(["Includes"]);
  });
});
