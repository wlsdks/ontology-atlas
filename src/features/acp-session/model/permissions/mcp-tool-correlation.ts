import { asPlainRecord, asRecord, textValue } from '../adapter-json';

/**
 * The only MCP identity trusted for a correlated permission request: Codex ACP keeps the request sparse and emits
 * this structured triple on the preceding `session/update`; the dotted human-facing title is not policy input.
 */
export interface CorrelatedMcpToolContext {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export function isMcpToolApproval(params: Record<string, unknown>): boolean {
  return asRecord(params._meta).is_mcp_tool_approval === true;
}

function readCorrelatedMcpToolContext(
  update: Record<string, unknown>,
): CorrelatedMcpToolContext | null {
  if (asRecord(update._meta).is_mcp_tool_call !== true) return null;
  const rawInput = asPlainRecord(update.rawInput);
  if (!rawInput) return null;
  const server = textValue(rawInput.server);
  const tool = textValue(rawInput.tool);
  const argumentsValue = asPlainRecord(rawInput.arguments);
  if (!server || !tool || !argumentsValue) return null;
  return { server, tool, arguments: argumentsValue };
}

export interface McpToolCorrelation {
  /** Notes the structured identity of a tool call from its `session/update`. */
  remember(sessionId: string | null, update: Record<string, unknown>): void;
  /** The identity for a permission request, used once: a duplicate or late approval finds nothing. */
  take(params: Record<string, unknown>): CorrelatedMcpToolContext | null;
  clearSession(sessionId: string): void;
  clear(): void;
}

export function createMcpToolCorrelation(): McpToolCorrelation {
  const correlatedMcpTools = new Map<string, Map<string, CorrelatedMcpToolContext>>();

  const forgetCorrelatedTool = (sessionId: string, toolCallId: string) => {
    const sessionTools = correlatedMcpTools.get(sessionId);
    if (!sessionTools) return;
    sessionTools.delete(toolCallId);
    if (sessionTools.size === 0) correlatedMcpTools.delete(sessionId);
  };

  return {
    remember: (sessionId, update) => {
      if (!sessionId) return;
      const toolCallId = textValue(update.toolCallId);
      if (!toolCallId) return;

      const status = textValue(update.status);
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        forgetCorrelatedTool(sessionId, toolCallId);
        return;
      }

      // A status-only update refines the same row; it must not erase the structured start event.
      const context = readCorrelatedMcpToolContext(update);
      if (!context) {
        // An update that claims to replace MCP input but cannot supply the full structured triple
        // invalidates the old entry. Keeping it would attach stale arguments to a malformed request.
        if (asRecord(update._meta).is_mcp_tool_call === true && update.rawInput !== undefined) {
          forgetCorrelatedTool(sessionId, toolCallId);
        }
        return;
      }
      const sessionTools = correlatedMcpTools.get(sessionId) ?? new Map();
      sessionTools.set(toolCallId, context);
      correlatedMcpTools.set(sessionId, sessionTools);
    },
    take: (params) => {
      const sessionId = textValue(params.sessionId);
      const toolCallId = textValue(asRecord(params.toolCall).toolCallId);
      if (!sessionId || !toolCallId) return null;
      const context = correlatedMcpTools.get(sessionId)?.get(toolCallId) ?? null;
      // Permission context is single-use. A duplicate or late approval must not reuse an older call.
      if (context) forgetCorrelatedTool(sessionId, toolCallId);
      return context;
    },
    clearSession: (sessionId) => {
      correlatedMcpTools.delete(sessionId);
    },
    clear: () => {
      correlatedMcpTools.clear();
    },
  };
}
