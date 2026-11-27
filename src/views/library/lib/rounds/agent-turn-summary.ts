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
  /**
   * Files a completed `analyze_repo_structure` call read through `sourceReads` as source text
   * (an outline reads none), with the `rootPath` the call named.
   */
  sourceReads: SourceRead[];
}

export interface SourceRead {
  path: string;
  root: string | null;
}

function sourceReadsOf(rawInput: unknown): SourceRead[] {
  const input = rawInput as { sourceReads?: unknown; rootPath?: unknown } | null;
  const reads = input?.sourceReads;
  if (!Array.isArray(reads)) return [];
  const root = typeof input?.rootPath === "string" && input.rootPath.trim() ? input.rootPath.trim() : null;
  return reads.flatMap((read) => {
    const { path, mode } = (read ?? {}) as { path?: unknown; mode?: unknown };
    if (mode === "outline" || typeof path !== "string" || !path.trim()) return [];
    return [{ path: path.trim().replace(/^\.\//, ""), root }];
  });
}

/** What a finished agent turn did, read from the notices the standing scope left and the agent's last words. */
export function summarizeAgentTurn(events: AcpTurnCompletion["events"]): AgentTurnSummary {
  const written: string[] = [];
  const refused: string[] = [];
  const called: string[] = [];
  const last = [...events].reverse().find((event) => event.kind === "agent")?.text ?? null;
  const answer = last?.replace(/\s+/g, " ").trim().slice(0, ANSWER_MAX_CHARS) ?? null;
  const sourceReads = new Map<string, SourceRead>();
  for (const event of events) {
    if (event.kind === "tool" && event.status === "completed") {
      for (const read of sourceReadsOf(event.rawInput)) sourceReads.set(`${read.root ?? ""}\0${read.path}`, read);
    }
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
    sourceReads: [...sourceReads.values()],
  };
}
