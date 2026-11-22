import { describe, expect, it } from 'vitest';

import { createMcpToolCorrelation, isMcpToolApproval } from './mcp-tool-correlation';

function toolCall(toolCallId: string, extra: Record<string, unknown> = {}) {
  return {
    toolCallId,
    status: 'in_progress',
    rawInput: { server: 'atlas-vault', tool: 'patch_concept', arguments: { slug: 'capabilities/a' } },
    _meta: { is_mcp_tool_call: true },
    ...extra,
  };
}

const approvalFor = (sessionId: string, toolCallId: string) => ({ sessionId, toolCall: { toolCallId } });

describe('the structured identity an MCP approval is matched to', () => {
  it('hands the identity of a call over once, then forgets it', () => {
    const correlation = createMcpToolCorrelation();
    correlation.remember('s1', toolCall('c1'));
    expect(correlation.take(approvalFor('s1', 'c1'))).toEqual({
      server: 'atlas-vault',
      tool: 'patch_concept',
      arguments: { slug: 'capabilities/a' },
    });
    expect(correlation.take(approvalFor('s1', 'c1'))).toBeNull();
  });

  it('matches only the same session and call', () => {
    const correlation = createMcpToolCorrelation();
    correlation.remember('s1', toolCall('c1'));
    expect(correlation.take(approvalFor('s2', 'c1'))).toBeNull();
    expect(correlation.take(approvalFor('s1', 'c2'))).toBeNull();
    expect(correlation.take(approvalFor('s1', 'c1'))).not.toBeNull();
  });

  it('keeps the start event through a status-only refinement and drops it when the call ends', () => {
    const correlation = createMcpToolCorrelation();
    correlation.remember('s1', toolCall('c1'));
    correlation.remember('s1', { toolCallId: 'c1', status: 'in_progress' });
    expect(correlation.take(approvalFor('s1', 'c1'))).not.toBeNull();

    correlation.remember('s1', toolCall('c2'));
    correlation.remember('s1', { toolCallId: 'c2', status: 'completed' });
    expect(correlation.take(approvalFor('s1', 'c2'))).toBeNull();
  });

  it('drops an entry that a malformed MCP update claims to replace, so stale arguments are never attached', () => {
    const correlation = createMcpToolCorrelation();
    correlation.remember('s1', toolCall('c1'));
    correlation.remember('s1', toolCall('c1', { rawInput: { server: 'atlas-vault' } }));
    expect(correlation.take(approvalFor('s1', 'c1'))).toBeNull();
  });

  it('forgets one session or everything on request', () => {
    const correlation = createMcpToolCorrelation();
    correlation.remember('s1', toolCall('c1'));
    correlation.remember('s2', toolCall('c1'));
    correlation.clearSession('s1');
    expect(correlation.take(approvalFor('s1', 'c1'))).toBeNull();
    expect(correlation.take(approvalFor('s2', 'c1'))).not.toBeNull();
    correlation.remember('s3', toolCall('c1'));
    correlation.clear();
    expect(correlation.take(approvalFor('s3', 'c1'))).toBeNull();
  });

  it('recognizes an MCP tool approval only by the structured flag', () => {
    expect(isMcpToolApproval({ _meta: { is_mcp_tool_approval: true } })).toBe(true);
    expect(isMcpToolApproval({ _meta: { is_mcp_tool_approval: 'true' } })).toBe(false);
    expect(isMcpToolApproval({})).toBe(false);
  });
});
