import type { AcpTurnCompletion } from "@/features/acp-session";
import { scopeNoteEffect } from "@/features/library-rounds";

const ANSWER_MAX_CHARS = 280;

export interface AgentTurnSummary {
  written: string[];
  refused: string[];
  called: string[];
  answer: string | null;
}

/** What a finished agent turn did, read from the notices the standing scope left and the agent's last words. */
export function summarizeAgentTurn(events: AcpTurnCompletion["events"]): AgentTurnSummary {
  const written: string[] = [];
  const refused: string[] = [];
  const called: string[] = [];
  const answer = [...events]
    .reverse()
    .find((event) => event.kind === "agent")?.text
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, ANSWER_MAX_CHARS) ?? null;
  for (const event of events) {
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
  };
}
