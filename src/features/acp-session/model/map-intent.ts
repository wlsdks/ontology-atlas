import { MCP_SERVER_NAME } from '@/shared/config';

import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

/**
 * Translates the Atlas read tool actually called by ACP into map state.
 *
 * Does not parse sentences from the agent's answer. Sentences can express the same meaning
 * in multiple ways, and plausible slugs can be mentioned even before the tool finishes. In contrast,
 * `tool_call.rawInput` is the exact argument received by the tool. By passing only names
 * that actually exist in the current vault, the map can point to the same object without guessing.
 */
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

const ATLAS_SERVER_NAMES = new Set([VAULT_MCP_SERVER_NAME, MCP_SERVER_NAME]);

function atlasToolName(title: string | undefined): 'get_concept' | 'find_path' | null {
  if (!title) return null;
  for (const serverName of ATLAS_SERVER_NAMES) {
    const prefix = `mcp__${serverName}__`;
    if (!title.startsWith(prefix)) continue;
    const name = title.slice(prefix.length);
    if (name === 'get_concept' || name === 'find_path') return name;
  }
  return null;
}

function recordInput(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Only look at tools after the last user utterance. If `find_path` succeeds even once in the same turn,
 * path intent takes precedence over `get_concept` for subsequent explanation — otherwise
 * the completed path reverts to a single last-read node.
 */
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
    const tool = atlasToolName(event.title);
    const input = recordInput(event.rawInput);
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
