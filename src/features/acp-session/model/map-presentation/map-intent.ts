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

/** The one slug a single-concept read names: `get_concepts` with one slug, or the retired `get_concept`. A batch read names no single focus. */
function singleReadSlug(name: string, input: Record<string, unknown>): unknown {
  if (name === 'get_concept') return input.slug;
  if (name !== 'get_concepts' || !Array.isArray(input.slugs) || input.slugs.length !== 1) return undefined;
  return input.slugs[0];
}

/** A path read: `query_ontology` with `operation: 'path'`, or the retired `find_path`. */
function isPathRead(name: string, input: Record<string, unknown>): boolean {
  return name === 'find_path' || (name === 'query_ontology' && input.operation === 'path');
}

/** Only tools after the last user utterance. If a path read succeeds once in the turn, path intent beats a single-concept read, or the completed path would revert to a single last-read node. */
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
    const input = call?.input ?? null;
    if (!call || !input) continue;
    const slug = singleReadSlug(call.name, input);
    if (slug !== undefined) {
      if (typeof slug === 'string' && knownSlugs.has(slug)) {
        focus = { kind: 'focus', slug, toolCallId: event.id };
      }
      continue;
    }
    if (!isPathRead(call.name, input)) continue;
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
