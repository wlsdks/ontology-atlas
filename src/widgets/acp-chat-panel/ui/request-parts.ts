import { ANALYSIS_FINDINGS_INSTRUCTION } from '@/features/acp-session';

/**
 * A turn the app composed opens on the readable sentence; the full text stays one disclosure away.
 * The split is by marker, not length: only text this repository generates is folded.
 */
export interface RequestParts {
  /** The part a person is meant to read. Never empty — an unsplit request is all lead. */
  lead: string;
  /** The app-composed remainder, or `null` when there is none. */
  detail: string | null;
}

/**
 * Where an app-composed block starts: the exact opening of text a caller appends after
 * the readable sentence. A brief whose first line is the anchor folds nothing: no readable half
 * stands before it.
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
