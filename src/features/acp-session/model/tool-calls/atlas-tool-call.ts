import { MCP_SERVER_NAME } from '@/shared/config';

import { VAULT_MCP_SERVER_NAME } from '../runtime-wiring/vault-mcp-server';

export interface AtlasToolCall {
  name: string;
  input: Record<string, unknown> | null;
  titleStyle: 'double-underscore' | 'dotted';
}

const ATLAS_SERVER_NAMES = [VAULT_MCP_SERVER_NAME, MCP_SERVER_NAME] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Claude exposes `mcp__server__tool` with arguments in `rawInput`; Codex `mcp.server.tool` as an `execute` row wrapping them.
 * The dotted form is accepted only when the envelope agrees character-for-character with the title,
 * so an arbitrary execute row cannot impersonate an Atlas read.
 */
export function parseAtlasToolCall(
  title: string | undefined,
  rawInput: unknown,
): AtlasToolCall | null {
  if (!title) return null;
  for (const server of ATLAS_SERVER_NAMES) {
    const doubleUnderscorePrefix = `mcp__${server}__`;
    if (title.startsWith(doubleUnderscorePrefix)) {
      const name = title.slice(doubleUnderscorePrefix.length);
      if (!name || name.includes('__')) return null;
      return {
        name,
        input: record(rawInput),
        titleStyle: 'double-underscore',
      };
    }

    const dottedPrefix = `mcp.${server}.`;
    if (!title.startsWith(dottedPrefix)) continue;
    const name = title.slice(dottedPrefix.length);
    const envelope = record(rawInput);
    const input = record(envelope?.arguments);
    if (
      !name
      || name.includes('.')
      || envelope?.server !== server
      || envelope.tool !== name
      || input === null
    ) {
      return null;
    }
    return { name, input, titleStyle: 'dotted' };
  }
  return null;
}
