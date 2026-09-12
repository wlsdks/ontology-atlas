import { ANALYSIS_FINDINGS_INSTRUCTION } from '@/features/acp-session';

/**
 * **A turn the app wrote on the person's behalf still opens on the sentence they can read.**
 *
 * Some turns in this transcript are not typed. The workbench's 「Analyze with AI」 door sends a
 * request the app composes: one readable instruction, then the scope as JSON, then the
 * response-format contract — around 1,200 characters, of which the first sixty are the only part
 * a person is meant to read. Drawn whole, that block is the tallest thing in the conversation and
 * the answer to it starts below the fold.
 *
 * ⚠️ **Nothing is removed.** The 2026-08-24 decision that a caller may send on the person's behalf
 * rests on the sentence landing in the transcript **as their own turn**, so the full text stays one
 * disclosure away, verbatim and in one piece. What changes is only which half is standing.
 *
 * The split is by **marker, not by length**: a long typed question is a long typed question, and
 * truncating it would be the panel deciding what somebody meant to say. Only text the app itself
 * generates is folded, and every marker below is a literal this repository writes.
 */
export interface RequestParts {
  /** The part a person is meant to read. Never empty — an unsplit request is all lead. */
  lead: string;
  /** The app-composed remainder, or `null` when there is none. */
  detail: string | null;
}

/**
 * Where an app-composed block starts. Each is the exact opening of something a caller in this
 * repository appends after the readable sentence:
 *
 * - `Scope:` — `AnalysisWorkbench.request()` serialises the analysis scope as JSON.
 * - `Continue analysis ` — the follow-up sentence naming a record id and its read tool.
 * - `Selected relation:` — `HomePage`'s map context, a relation triple as JSON.
 * - `Architecture task context:` — the architecture workbench's typed handoff packet, followed by
 *   its instruction sentences. It has to be listed here *and* stand after the readable sentence in
 *   `buildArchitectureAgentPrompt`: a marker on line 0 folds nothing.
 * - `Folder:` / `폴더:` — the anchor line every Library brief writes before its instructions
 *   (`compile-brief`, `lint-brief`, `propose-node-brief`, and the three that open on it). ⚠️
 *   Pressing 「서식 맞는지 확인」 opened the dock on ~2,000 characters of schema, fenced blocks and
 *   taxonomy rules (installed app, 2026-09-13). A brief whose *first* line is this anchor folds
 *   nothing, by the rule above, and that is the honest outcome: there is no readable half in front
 *   of it to stand on.
 * - the response-format contract — `ANALYSIS_FINDINGS_INSTRUCTION`'s own first line, taken from
 *   the constant rather than copied, so the two cannot drift apart.
 */
const APP_BLOCK_MARKERS = [
  'Scope:',
  'Continue analysis ',
  'Selected relation:',
  'Architecture task context:',
  'Folder: ',
  '폴더: ',
  ANALYSIS_FINDINGS_INSTRUCTION.split('\n')[0],
] as const;

export function splitAppRequest(text: string): RequestParts {
  const lines = text.split('\n');
  const at = lines.findIndex((line) =>
    APP_BLOCK_MARKERS.some((marker) => line.trimStart().startsWith(marker)),
  );
  // No marker, or the very first line is one: there is no readable half to stand on its own, and a
  // disclosure whose summary is the whole content is a click that buys nothing.
  if (at <= 0) return { lead: text, detail: null };
  const lead = lines.slice(0, at).join('\n').trimEnd();
  const detail = lines.slice(at).join('\n').trim();
  if (!lead.trim() || !detail) return { lead: text, detail: null };
  return { lead, detail };
}
