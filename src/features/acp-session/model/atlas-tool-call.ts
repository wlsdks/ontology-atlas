import { MCP_SERVER_NAME } from '@/shared/config';

import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

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
 * Normalizes the two MCP tool-call envelopes observed from the supported ACP
 * adapters without trusting a title-shaped ordinary command.
 *
 * Claude exposes `mcp__server__tool` and places the arguments directly in
 * `rawInput`. Codex exposes `mcp.server.tool`, labels the ACP row as `execute`,
 * and wraps arguments with the same server/tool identity. The dotted form is
 * accepted only when that envelope agrees character-for-character with the
 * title, so an arbitrary execute row cannot impersonate an Atlas read.
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
