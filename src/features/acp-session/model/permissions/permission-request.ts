import type { AcpPermissionVerdict } from '@/shared/lib/agent-chat/tauri-acp';

import { asRecord } from '../adapter-json';
import type { CorrelatedMcpToolContext } from './mcp-tool-correlation';

export interface AcpPermissionRequest {
  /** Exact JSON-RPC request id. Numeric zero is valid and is never replaced. */
  requestId?: string | number | null;
  sessionId?: string | null;
  title: string | null;
  toolCallId: string | null;
  /** The identifier (such as `mcp__atlas-vault__add_concept`); policy reads it because an MCP tool call has no file path. */
  toolName: string | null;
  toolKind: string | null;
  filePath: string | null;
  /**
   * The paths the tool call names in ACP's `locations`, in order and without repeats. A Codex file
   * edit states its files only here. The card shows them and words itself by them; policy keeps
   * reading `filePath`, because an edit that moves a file can write a path this list does not hold.
   */
  statedPaths?: readonly string[];
  rawInput: Record<string, unknown>;
  reviewKind: 'permission' | 'ontology-write';
  /** Rust's inside-the-folder verdict on `filePath`, computed once before asking; absent means unjudged. */
  pathVerdict?: AcpPermissionVerdict;
  writerCorrelation?: { status: 'verified'; server: string; tool: string; toolCall: 'structured-mcp'; approval: 'structured-mcp' };
  options: Array<{ optionId: string; kind: string; name: string | null }>;
}

/**
 * The tool's identifier, structured fields first and the title as fallback. This does not break the rule against
 * judging policy by title: an identifier is read, not a sentence written for a person (`allow_always`'s `_meta`
 * carries `targets[].toolName`).
 */
function readToolName(params: Record<string, unknown>): string | null {
  const options = Array.isArray(params.options) ? params.options : [];
  for (const entry of options) {
    const changes = asRecord(asRecord(asRecord(entry)._meta).permission).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const targets = asRecord(change).targets;
      if (!Array.isArray(targets)) continue;
      for (const target of targets) {
        const t = asRecord(target);
        if (t.type === 'tool' && typeof t.toolName === 'string') return t.toolName;
      }
    }
  }
  const title = asRecord(params.toolCall).title;
  return typeof title === 'string' ? title : null;
}

/** The argument name differs per tool: our server uses `filePath`, claude built-ins `file_path`; folder sweeps take `rootPath`. */
export const PATH_ARGUMENT_KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'] as const;

function readPathArg(rawInput: Record<string, unknown>): string | null {
  for (const key of PATH_ARGUMENT_KEYS) {
    const value = rawInput[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

const HIDDEN_OR_CONTROL_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

/**
 * Only an edit's `locations` are the files it changes. A command's are what it reads and a sandbox
 * request's what it asks to reach, so wording the card by them would call a shell command or a
 * wider sandbox "a change to a file in this folder". A path carrying a hidden or control character
 * drops the whole list, and the card falls back to its outside wording and the request's own title.
 */
function readStatedPaths(toolCall: Record<string, unknown>): string[] {
  if (toolCall.kind !== 'edit') return [];
  const locations = Array.isArray(toolCall.locations) ? toolCall.locations : [];
  const paths = locations.flatMap((entry) => {
    const path = asRecord(entry).path;
    return typeof path === 'string' && path.trim() ? [path] : [];
  });
  if (paths.some((path) => HIDDEN_OR_CONTROL_CHARACTER.test(path))) return [];
  return [...new Set(paths)];
}

/** A server-side elicitation reaches ACP with no `toolCall.title`; `codex-acp` puts the message in `toolCall.content[]`. */
function readPermissionTitle(toolCall: Record<string, unknown>): string | null {
  if (typeof toolCall.title === 'string' && toolCall.title.trim()) return toolCall.title;
  const content = Array.isArray(toolCall.content) ? toolCall.content : [];
  for (const entry of content) {
    const inner = asRecord(asRecord(entry).content);
    if (inner.type === 'text' && typeof inner.text === 'string' && inner.text.trim()) {
      return inner.text.trim();
    }
  }
  return null;
}

export function toPermissionRequest(
  params: Record<string, unknown>,
  correlatedMcpTool: CorrelatedMcpToolContext | null = null,
  requestId: unknown = null,
): AcpPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const rawInput = correlatedMcpTool?.arguments ?? asRecord(toolCall.rawInput);
  const rawOptions = Array.isArray(params.options) ? params.options : [];
  return {
    requestId: typeof requestId === 'string' || typeof requestId === 'number' ? requestId : null,
    sessionId: typeof params.sessionId === 'string' ? params.sessionId : null,
    title: readPermissionTitle(toolCall),
    toolCallId: typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : null,
    toolName: correlatedMcpTool
      ? `mcp__${correlatedMcpTool.server}__${correlatedMcpTool.tool}`
      : readToolName(params),
    toolKind: typeof toolCall.kind === 'string' ? toolCall.kind : null,
    // The policy reads this value, not the title: the title is relative inside the vault and
    // absolute outside, so the policy would flip when the wording changes.
    filePath: readPathArg(rawInput),
    statedPaths: readStatedPaths(toolCall),
    rawInput,
    reviewKind: 'permission',
    ...(correlatedMcpTool ? { writerCorrelation: { status: 'verified' as const, server: correlatedMcpTool.server,
      tool: correlatedMcpTool.tool, toolCall: 'structured-mcp' as const, approval: 'structured-mcp' as const } } : {}),
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry);
      const optionId = typeof option.optionId === 'string' ? option.optionId : null;
      const kind = typeof option.kind === 'string' ? option.kind : null;
      if (!optionId || !kind) return [];
      return [{ optionId, kind, name: typeof option.name === 'string' ? option.name : null }];
    }),
  };
}
