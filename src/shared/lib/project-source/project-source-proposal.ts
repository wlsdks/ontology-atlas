/**
 * `inspect_project_source` on the vault root already climbs to the enclosing repository; this gives
 * its result the MCP tool's proposal shape. It never confirms: `finalize_project_meaning` trusts
 * the receipt a binding mints, so binding stays an explicit act.
 */

import { inferProjectSourceProposal } from "./project-source-inference.mjs";
import type { ProjectSourceReceipt } from "./project-source-receipt";

type ProjectSourceCandidateMarker =
  | "enclosing_git_repository"
  | "ancestor_project_manifest";

type ProjectSourceProposalReason =
  | ProjectSourceCandidateMarker
  | "no_enclosing_source";

type ProjectSourceConfidence = "high" | "medium" | "low";

interface ProjectSourceCandidate {
  rootPath: string;
  kind: "git" | "folder";
  marker: ProjectSourceCandidateMarker;
  /** Directory levels between the candidate and the vault root (0 = the vault). */
  ancestorDepth: number;
  evidence: string[];
}

export interface ProjectSourceProposal {
  contract: "projectSourceInference:v1";
  status: "proposed" | "none";
  candidate: ProjectSourceCandidate | null;
  alternatives: ProjectSourceCandidate[];
  confidence: ProjectSourceConfidence;
  reason: ProjectSourceProposalReason;
  /** supported / total declared paths, or null when nothing is declared yet. */
  supportRatio: number | null;
  witnessSummary: ProjectSourceReceipt["witnessSummary"] | null;
  vaultIsSourceRoot: boolean;
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function ancestorDepth(candidateRoot: string, vaultRoot: string): number {
  const candidate = normalizedPath(candidateRoot);
  const vault = normalizedPath(vaultRoot);
  if (candidate === vault) return 0;
  if (!vault.startsWith(`${candidate}/`)) return 0;
  return vault.slice(candidate.length + 1).split("/").filter(Boolean).length;
}

/** `inspection` is of the vault root; `null` means the probe was unavailable, never "no source". */
export function proposeProjectSourceFromInspection(input: {
  vaultRootPath: string;
  inspection: { rootPath: string; kind: "git" | "folder" } | null;
  witnessSummary?: ProjectSourceReceipt["witnessSummary"] | null;
}): ProjectSourceProposal {
  const candidates: ProjectSourceCandidate[] = [];
  const inspection = input.inspection;
  // A `folder` probe that resolved to the vault itself found no repository —
  // it hashed the notes, not the code. Proposing it would bind the vault to
  // itself and every witness would be missing.
  if (
    inspection
    && inspection.kind === "git"
    && normalizedPath(inspection.rootPath) !== ""
  ) {
    candidates.push({
      rootPath: inspection.rootPath,
      kind: "git",
      marker: "enclosing_git_repository",
      ancestorDepth: ancestorDepth(inspection.rootPath, input.vaultRootPath),
      evidence: [".git"],
    });
  }
  return inferProjectSourceProposal({
    vaultRootPath: input.vaultRootPath,
    candidates,
    witnessSummary: input.witnessSummary ?? null,
  }) as ProjectSourceProposal;
}
