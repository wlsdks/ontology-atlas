/**
 * "Is this the right folder?" — the typed, browser-callable half of source
 * inference.
 *
 * The desktop app does not need to walk the filesystem to answer this. One
 * `inspect_project_source` call on the **vault root** already climbs to the
 * enclosing git repository (`src-tauri/src/lib.rs`), so its result *is* the
 * candidate. This module turns that result into the same proposal shape the
 * MCP tool returns, so a screen and an agent describe the same thing with the
 * same words.
 *
 * It deliberately never confirms. Binding a wrong root mints a receipt whose
 * `verified_current` would be a lie, and `finalize_project_meaning` trusts that
 * receipt — so the write stays an explicit act.
 */

import { inferProjectSourceProposal } from "./project-source-inference.mjs";
import type { ProjectSourceReceipt } from "./project-source-receipt";

export type ProjectSourceCandidateMarker =
  | "enclosing_git_repository"
  | "ancestor_project_manifest";

export type ProjectSourceProposalReason =
  | ProjectSourceCandidateMarker
  | "no_enclosing_source";

export type ProjectSourceConfidence = "high" | "medium" | "low";

export interface ProjectSourceCandidate {
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

/**
 * The screen's one call.
 *
 * @param inspection result of inspecting the **vault root** (not a picked
 *   folder). `null` means the probe was unavailable — treated as "no proposal",
 *   never as "no source".
 */
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

/** Re-rate a proposal once the candidate has actually been measured. */
