import { parseAtlasToolCall } from '../tool-calls/atlas-tool-call';

/** Translates the Atlas read tool actually called into map state. Not the agent's sentences (one meaning has many wordings, and slugs get mentioned before a tool finishes): `tool_call.rawInput` is the exact argument, and only names that exist in the vault are passed. */
export type AcpMapIntent =
  | { kind: 'focus'; slug: string; toolCallId: string }
  | { kind: 'path'; from: string; to: string; toolCallId: string };

export interface AcpMapIntentEvent {
  kind: string;
  id: string;
  title?: string;
  rawInput?: unknown;
  [key: string]: unknown;
}

/** Only tools after the last user utterance. If `find_path` succeeds once in the turn, path intent beats `get_concept`, or the completed path would revert to a single last-read node. */
export function deriveAcpMapIntent(
  events: readonly AcpMapIntentEvent[],
  knownSlugs: ReadonlySet<string>,
): AcpMapIntent | null {
  if (knownSlugs.size === 0) return null;
  let turnStart = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.kind !== 'user') continue;
    turnStart = index + 1;
    break;
  }

  let focus: Extract<AcpMapIntent, { kind: 'focus' }> | null = null;
  let path: Extract<AcpMapIntent, { kind: 'path' }> | null = null;
  for (let index = turnStart; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.kind !== 'tool') continue;
    const call = parseAtlasToolCall(event.title, event.rawInput);
    const tool = call?.name === 'get_concept' || call?.name === 'find_path'
      ? call.name
      : null;
    const input = call?.input ?? null;
    if (!tool || !input) continue;
    if (tool === 'get_concept') {
      const slug = input.slug;
      if (typeof slug === 'string' && knownSlugs.has(slug)) {
        focus = { kind: 'focus', slug, toolCallId: event.id };
      }
      continue;
    }
    const from = input.from;
    const to = input.to;
    if (
      typeof from === 'string' &&
      typeof to === 'string' &&
      from !== to &&
      knownSlugs.has(from) &&
      knownSlugs.has(to)
    ) {
      path = { kind: 'path', from, to, toolCallId: event.id };
    }
  }
  return path ?? focus;
}
