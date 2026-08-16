/**
 * Project source connect — cross-package contract.
 *
 * Three surfaces can now bind a project to its code: the macOS app (in-memory
 * graph), the MCP server, and the CLI. A receipt minted by one and read by
 * another must mean the same thing, and the prescription printed by one must
 * be callable on the other. These are the pins that make that true.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { deriveProjectSourceWitnesses } from "../../src/views/home/lib/project-source-witnesses";
import { deriveProjectSourceWitnessesFromDocs } from "../../mcp/src/project-source-witnesses.mjs";
import { extractProjectMeaningEvidencePaths as extractMcpMeaningEvidence } from "../../mcp/src/project-meaning-evidence.mjs";
import { buildProjectSourceReceipt } from "../../src/shared/lib/project-source-receipt";
import { extractProjectMeaningEvidencePaths as extractAppMeaningEvidence } from "../../src/shared/lib/project-meaning-evidence";
import { buildProjectSourceReceipt as mintMcp } from "../../mcp/src/project-source-mint.mjs";
import { projectSourceRemedy } from "../../mcp/src/project-source-remedy.mjs";
import { proposeProjectSourceFromInspection } from "../../src/shared/lib/project-source-proposal";

const ROOT = path.resolve(__dirname, "../..");
const SURFACE = JSON.parse(
  readFileSync(path.join(ROOT, "docs/.generated/mcp-surface.json"), "utf8"),
) as { mcp: { tools: { name: string }[] }; cli: { commands: string[] } };

/**
 * Every action id the receipt vocabulary can emit. Duplicated here on purpose:
 * this list is the *claim* that nothing was quietly dropped, so it must not be
 * imported from the module under test.
 */
const NEXT_ACTION_IDS = [
  "connect_source",
  "repair_source_binding",
  "measure_source",
  "record_source_role",
  "repair_source_path",
  "review_inventory_limit",
  "remeasure_source",
  "use_current_evidence",
] as const;

const DOCS = [
  {
    slug: "music-streaming",
    frontmatter: { kind: "project", slug: "music-streaming", title: "Music", path: "src/app" },
    body: [
      "## Competency answers",
      "",
      "### scope — answered",
      "",
      "What outcome defines this project?",
      "",
      "People can play music.",
      "",
      "- Evidence: `README.md`, `docs/PRODUCT.md`",
      "- Paths: `src/play/engine.ts`",
    ].join("\n"),
    meaningEvidencePaths: ["docs/PRODUCT.md", "README.md", "src/play/engine.ts"],
  },
  {
    slug: "capabilities/play",
    frontmatter: {
      kind: "capability",
      title: "Play",
      path: "src/play",
      elements: ["src/play/engine.ts", "elements/engine"],
    },
  },
  { slug: "elements/engine", frontmatter: { kind: "element", title: "src/play/engine.ts" } },
  { slug: "elements/mixer", frontmatter: { kind: "element", title: "src/play/mixer.ts" } },
  { slug: "domains/audio", frontmatter: { kind: "domain", title: "Audio" } },
];

const NODES = [
  { id: "project:music-streaming", kind: "project", title: "Music", projectIds: [], agentSlug: "music-streaming" },
  { id: "capability:play", kind: "capability", title: "Play", projectIds: ["music-streaming"], agentSlug: "capabilities/play" },
  { id: "element:engine", kind: "element", title: "src/play/engine.ts", projectIds: ["music-streaming"], agentSlug: "elements/engine" },
  { id: "element:mixer", kind: "element", title: "src/play/mixer.ts", projectIds: ["music-streaming"], agentSlug: "elements/mixer" },
  { id: "domain:audio", kind: "domain", title: "Audio", projectIds: ["music-streaming"], agentSlug: "domains/audio" },
];

describe("witness derivation parity", () => {
  it("derives the same source claims in the app and in the MCP server", () => {
    const fromGraph = deriveProjectSourceWitnesses({
      projectSlug: "music-streaming",
      // The app's node type carries more fields than this fixture needs.
      nodes: NODES as never,
      docs: DOCS as never,
    });
    const fromDocs = deriveProjectSourceWitnessesFromDocs({
      projectSlug: "music-streaming",
      docs: DOCS,
    });
    // A non-empty set is part of the claim — an equality that compares two
    // empty arrays proves nothing.
    expect(fromDocs.length).toBeGreaterThanOrEqual(4);
    expect(fromDocs).toEqual(fromGraph);
    expect(
      fromDocs
        .filter((witness) => witness.path === "src/play/engine.ts")
        .map((witness) => witness.nodeSlug),
    ).toEqual(["capabilities/play", "music-streaming", "elements/engine"]);
  });
});

describe("persisted competency evidence parity", () => {
  it("extracts only exact competency Evidence/Paths rows and fails closed on malformed paths", () => {
    const body = [
      "## Evidence",
      "",
      "Mention src/ghost.ts in ordinary prose.",
      "",
      "## Competency answers",
      "",
      "### scope — answered",
      "",
      "Question",
      "",
      "Answer",
      "",
      "- Evidence: `README.md`, `docs/PRODUCT.md`",
      "- Paths: `src/review`",
      "",
      "## Next",
      "",
      "- Evidence: `src/outside.ts`",
    ].join("\n");
    const expected = ["docs/PRODUCT.md", "README.md", "src/review"];
    expect(extractMcpMeaningEvidence(body)).toEqual(expected);
    expect(extractAppMeaningEvidence(body)).toEqual(expected);

    const malformed = body.replace("`src/review`", "`../secret` ");
    expect(extractMcpMeaningEvidence(malformed)).toEqual([]);
    expect(extractAppMeaningEvidence(malformed)).toEqual([]);
  });
});

describe("receipt minting parity", () => {
  const probe = {
    sourceId: "sha256:abc",
    kind: "git" as const,
    revision: "deadbeef",
    fingerprint: "sha256:def",
    dirty: false,
    truncated: false,
    files: ["src/app/page.tsx", "src/play/engine.ts"],
  };
  const witnesses = deriveProjectSourceWitnessesFromDocs({ projectSlug: "music-streaming", docs: DOCS });

  it("mints byte-identical receipts from the browser entry and the MCP entry", () => {
    const input = {
      projectSlug: "music-streaming",
      graphHash: "project-graph-v1:0000abcd",
      probe,
      witnesses,
      measuredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(JSON.stringify(buildProjectSourceReceipt(input))).toEqual(JSON.stringify(mintMcp(input)));
  });

  it("marks a declared path that is not in the source as unsupported", () => {
    const receipt = mintMcp({
      projectSlug: "music-streaming",
      graphHash: "project-graph-v1:0000abcd",
      probe,
      witnesses,
      measuredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(receipt.witnessSummary.missing).toBeGreaterThan(0);
    expect(receipt.status).toBe("review_required");
  });
});

describe("diagnosis is executable", () => {
  it("gives every next-action id a registered tool and a registered command", () => {
    const toolNames = new Set(SURFACE.mcp.tools.map((tool) => tool.name));
    const commands = new Set(SURFACE.cli.commands);
    expect(toolNames.size).toBeGreaterThan(30);

    for (const id of NEXT_ACTION_IDS) {
      const remedy = projectSourceRemedy({ projectSlug: "p", nextAction: { id } });
      expect(remedy.actionId).toBe(id);
      if (id === "use_current_evidence") {
        expect(remedy.resolvable).toBe(false);
        continue;
      }
      expect(remedy.tool?.name, id).toBeTruthy();
      expect(toolNames.has(remedy.tool!.name), `${id} → ${remedy.tool!.name}`).toBe(true);
      expect(commands.has(remedy.cli!.command), `${id} → ${remedy.cli!.command}`).toBe(true);
    }
  });

  it("registers the reversal, not just the write", () => {
    const toolNames = new Set(SURFACE.mcp.tools.map((tool) => tool.name));
    expect(toolNames.has("connect_project_source")).toBe(true);
    expect(toolNames.has("disconnect_project_source")).toBe(true);
    expect(new Set(SURFACE.cli.commands).has("connect-source")).toBe(true);
    expect(new Set(SURFACE.cli.commands).has("disconnect-source")).toBe(true);
  });
});

describe("browser-side proposal", () => {
  it("turns one vault-root inspection into the enclosing repository candidate", () => {
    const proposal = proposeProjectSourceFromInspection({
      vaultRootPath: "/Users/me/code/app/docs/ontology",
      inspection: { rootPath: "/Users/me/code/app", kind: "git" },
      witnessSummary: { total: 10, supported: 10, missing: 0 },
    });
    expect(proposal.status).toBe("proposed");
    expect(proposal.candidate?.rootPath).toBe("/Users/me/code/app");
    expect(proposal.candidate?.ancestorDepth).toBe(2);
    expect(proposal.confidence).toBe("high");
  });

  it("refuses to propose the vault as its own source when no repository was found", () => {
    const proposal = proposeProjectSourceFromInspection({
      vaultRootPath: "/Users/me/notes",
      inspection: { rootPath: "/Users/me/notes", kind: "folder" },
    });
    expect(proposal.status).toBe("none");
    expect(proposal.reason).toBe("no_enclosing_source");
  });
});
