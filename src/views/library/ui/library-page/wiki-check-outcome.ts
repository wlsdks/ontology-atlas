import {
  parseLintCandidates,
  parseLintFindings,
  type LintFinding,
  type LintNodeCandidate,
} from "@/features/library";
import type { WorkRun, WorkRunOutcome } from "@/features/work-run";
import type { AcpTurnCompletion } from "@/features/acp-session";

export interface WikiCheckPayload {
  findings: LintFinding[];
  candidates: LintNodeCandidate[];
}

const EMPTY_PAYLOAD: WikiCheckPayload = { findings: [], candidates: [] };

/** Whether the answer ends with the machine-readable block the brief asks for, whatever it lists. */
function hasReportBlock(text: string | null): boolean {
  const blocks = [...String(text ?? "").matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
  return blocks.some((block) => {
    try {
      const parsed: unknown = JSON.parse(block[1] ?? "");
      if (!parsed || typeof parsed !== "object") return false;
      const report = parsed as Record<string, unknown>;
      return Array.isArray(report.findings) || Array.isArray(report.nodeCandidates)
        || (typeof report.counts === "object" && report.counts !== null);
    } catch {
      return false;
    }
  });
}

/**
 * The agent's answer as a check result. Without the machine-readable list the answer is not read
 * as "nothing to fix": a clean report states its zero counts.
 */
export function wikiCheckReport(text: string | null): WorkRunOutcome {
  const findings = parseLintFindings(text);
  const candidates = parseLintCandidates(text);
  if (!hasReportBlock(text)) return { kind: "unreadable" };
  const pages = new Set([...findings.flatMap((finding) => finding.pages), ...candidates.flatMap((candidate) => candidate.pages)]);
  return {
    kind: "report",
    report: { itemCount: findings.length + candidates.length, pageCount: pages.size, payload: { findings, candidates } satisfies WikiCheckPayload },
  };
}

/** Stop ends the turn as cancelled; a closed session or an error ends it before it reported. */
export function wikiCheckOutcome(completion: Pick<AcpTurnCompletion, "outcome" | "stopReason" | "events">): WorkRunOutcome {
  if (completion.outcome === "cancelled" && completion.stopReason !== "session_closed") return { kind: "stopped" };
  if (completion.outcome !== "completed") return { kind: "failed" };
  const lastAgentText = [...completion.events].reverse().find((event) => event.kind === "agent");
  return wikiCheckReport(lastAgentText?.kind === "agent" ? lastAgentText.text : null);
}

export function wikiCheckPayload(run: WorkRun | null): WikiCheckPayload {
  return (run?.report?.payload as WikiCheckPayload | undefined) ?? EMPTY_PAYLOAD;
}

/** A tool's path as the folder stores it, or null when it lies outside the folder. */
export function folderRelativePage(target: string, vaultRoot: string | null): string | null {
  const path = target.trim().replaceAll("\\", "/");
  const root = vaultRoot?.replace(/\/+$/, "") ?? null;
  const relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) return null;
  return relative.startsWith("wiki/") && relative.endsWith(".md") ? relative.slice(0, -3) : relative;
}
