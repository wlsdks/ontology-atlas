import type { AcpTurnCompletion } from "@/features/acp-session";
import { scopeNoteEffect } from "@/features/library-rounds";

const ANSWER_MAX_CHARS = 280;
/** A recheck reply holds one answer per concept; anything longer is not one Atlas reads. */
const REPLY_MAX_CHARS = 256 * 1024;

export interface AgentTurnSummary {
  written: string[];
  refused: string[];
  called: string[];
  answer: string | null;
  /** The last message whole, for a reply Atlas parses. */
  reply: string | null;
  /** Repository paths a completed `analyze_repo_structure` call read through `sourceReads`. */
  sourceReads: string[];
}

function sourceReadPaths(rawInput: unknown): string[] {
  const reads = (rawInput as { sourceReads?: unknown } | null)?.sourceReads;
  if (!Array.isArray(reads)) return [];
  return reads.flatMap((read) => {
    const path = (read as { path?: unknown } | null)?.path;
    return typeof path === "string" && path.trim() ? [path.trim().replace(/^\.\//, "")] : [];
  });
}

/** What a finished agent turn did, read from the notices the standing scope left and the agent's last words. */
export function summarizeAgentTurn(events: AcpTurnCompletion["events"]): AgentTurnSummary {
  const written: string[] = [];
  const refused: string[] = [];
  const called: string[] = [];
  const last = [...events].reverse().find((event) => event.kind === "agent")?.text ?? null;
  const answer = last?.replace(/\s+/g, " ").trim().slice(0, ANSWER_MAX_CHARS) ?? null;
  const sourceReads: string[] = [];
  for (const event of events) {
    if (event.kind === "tool" && event.status === "completed") sourceReads.push(...sourceReadPaths(event.rawInput));
    if (event.kind !== "notice") continue;
    if (event.text === "auto-allowed" && event.detail) {
      const effect = scopeNoteEffect(event.detail);
      if (effect?.effect === "write") written.push(effect.target);
      if (effect?.effect === "call") called.push(effect.target);
    }
    if (event.text === "auto-refused" && event.detail) refused.push(event.detail);
  }
  return {
    written: [...new Set(written)],
    refused: [...new Set(refused)],
    called: [...new Set(called)],
    answer,
    reply: last && last.length <= REPLY_MAX_CHARS ? last : null,
    sourceReads: [...new Set(sourceReads)],
  };
}
