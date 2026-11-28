/**
 * Project source connect — cross-package contract.
 *
 * Three surfaces can now bind a project to its code: the macOS app (in-memory
 * graph), the MCP server, and the CLI. A receipt minted by one and read by
 * another must mean the same thing, and the prescription printed by one must
 * be callable on the other. The app's side runs here; the script server's
 * answers for the same documents are recorded in
 * `tests/fixtures/project-source-golden.json`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { underCollation } from "../../helpers/under-collation";
import { deriveProjectSourceWitnesses } from "../../../src/features/project-source-binding/lib/project-source-witnesses";
import { buildProjectSourceReceipt } from "../../../src/shared/lib/project-source/project-source-receipt";
import { extractProjectMeaningEvidencePaths as extractAppMeaningEvidence } from "../../../src/shared/lib/project-source/project-meaning-evidence";
import { proposeProjectSourceFromInspection } from "../../../src/shared/lib/project-source/project-source-proposal";
import {
  LOCALE_DOCS,
  LOCALE_NODES,
  MUSIC_DOCS,
  MUSIC_NODES,
  NEXT_ACTION_IDS,
  RECEIPT_PROBE,
  ROOT_CLAIM_DOCS,
  ROOT_CLAIM_NODES,
} from "../../fixtures/project-source-cases.mjs";
import golden from "../../fixtures/project-source-golden.json";

const ROOT = path.resolve(__dirname, "../../..");
const SURFACE = JSON.parse(
  readFileSync(path.join(ROOT, "docs/.generated/mcp-surface.json"), "utf8"),
) as { mcp: { tools: { name: string; arguments: string[] }[] }; cli: { commands: string[] } };

const DOCS = MUSIC_DOCS;
const NODES = MUSIC_NODES;

describe("witness derivation parity", () => {
  it("decodes source-range Evidence paths without treating the URI as a filesystem path", () => {
    const sourcePath = `${"segment/".repeat(54)}file.ts`;
    const reference = `source:${sourcePath}#L1-L2@sha256:${"a".repeat(64)}`;
    const body = `## Competency answers\n\n- Evidence: \`README.md\`, \`${reference}\`\n- Paths: \`src/main.ts\``;
    const expected = [sourcePath, "README.md", "src/main.ts"].sort();
    expect(extractAppMeaningEvidence(body)).toEqual(expected);
  });

  it("derives the source claims the script server recorded for the same documents", () => {
    const fromGraph = deriveProjectSourceWitnesses({
      projectSlug: "music-streaming",
      // The app's node type carries more fields than this fixture needs.
      nodes: NODES as never,
      docs: DOCS as never,
    });
    const fromDocs = golden.witnesses.music;
    // A non-empty set is part of the claim — an equality that compares two
    // empty arrays proves nothing.
    expect(fromDocs.length).toBeGreaterThanOrEqual(4);
    expect(fromGraph).toEqual(fromDocs);
    expect(
      fromGraph
        .filter((witness) => witness.path === "src/play/engine.ts")
        .map((witness) => witness.nodeSlug),
    ).toEqual(["capabilities/play", "music-streaming", "elements/engine"]);
  });

  it("keeps repository-root and single-segment directory claims identical to the recorded ones", () => {
    const fromGraph = deriveProjectSourceWitnesses({
      projectSlug: "music-streaming",
      nodes: ROOT_CLAIM_NODES as never,
      docs: ROOT_CLAIM_DOCS as never,
    });
    expect(fromGraph).toEqual(golden.witnesses.rootClaims);
    expect(fromGraph.map((witness) => witness.path)).toEqual([
      "transform",
      ".",
      "generate",
      "jsonschema",
      "transform",
    ]);
  });

  it("orders witnesses as the recorded ones whatever the machine locale", () => {
    const witnessIds = (locale: string) => underCollation(locale, () =>
      deriveProjectSourceWitnesses({ projectSlug: "music-streaming", nodes: LOCALE_NODES as never, docs: LOCALE_DOCS as never }).map((witness) => witness.id),
    );
    const english = witnessIds("en");
    expect(english).toHaveLength(2);
    expect(english).toEqual(golden.witnesses.locale.map((witness: { id: string }) => witness.id));
    expect(witnessIds("ko")).toEqual(english);
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
      "- Paths: `.`, `src/review`",
      "",
      "## Next",
      "",
      "- Evidence: `src/outside.ts`",
    ].join("\n");
    const expected = [".", "docs/PRODUCT.md", "README.md", "src/review"];
    expect(extractAppMeaningEvidence(body)).toEqual(expected);

    const malformed = body.replace("`src/review`", "`../secret` ");
    expect(extractAppMeaningEvidence(malformed)).toEqual([]);
  });
});

describe("receipt minting parity", () => {
  const probe = RECEIPT_PROBE as Parameters<typeof buildProjectSourceReceipt>[0]["probe"];
  const witnesses = golden.witnesses.music;
  const input = {
    projectSlug: "music-streaming",
    graphHash: "project-graph-v1:0000abcd",
    probe,
    witnesses,
    measuredAt: "2026-01-01T00:00:00.000Z",
  };

  it("mints the receipt the script server minted from the same inputs, byte for byte", () => {
    expect(JSON.stringify(buildProjectSourceReceipt(input))).toEqual(golden.receiptJson);
  });

  it("marks a declared path that is not in the source as unsupported", () => {
    const receipt = buildProjectSourceReceipt(input);
    expect(receipt.witnessSummary.missing).toBeGreaterThan(0);
    expect(receipt.status).toBe("review_required");
  });
});

describe("diagnosis is executable", () => {
  it("gives every next-action id a registered tool", () => {
    const toolNames = new Set(SURFACE.mcp.tools.map((tool) => tool.name));
    expect(toolNames.size).toBeGreaterThan(20);
    expect(Object.keys(golden.remedyTools).sort()).toEqual([...NEXT_ACTION_IDS].sort());

    for (const id of NEXT_ACTION_IDS) {
      const remedy = golden.remedyTools[id as keyof typeof golden.remedyTools];
      if (id === "use_current_evidence") {
        expect(remedy).toEqual({ resolvable: false, tool: null });
        continue;
      }
      expect(remedy.tool, id).toBeTruthy();
      expect(toolNames.has(remedy.tool!), `${id} → ${remedy.tool}`).toBe(true);
    }
  });

  it("registers the reversal, not just the write", () => {
    const toolNames = new Set(SURFACE.mcp.tools.map((tool) => tool.name));
    expect(toolNames.has("connect_project_source")).toBe(true);
    expect(toolNames.has("disconnect_project_source")).toBe(true);
    const connect = SURFACE.mcp.tools.find((tool) => tool.name === "connect_project_source");
    expect(connect?.arguments).not.toContain("disconnect");
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
