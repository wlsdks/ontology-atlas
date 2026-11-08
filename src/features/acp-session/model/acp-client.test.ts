import { describe, expect, it, vi } from 'vitest';

import {
  applyCurrentMode,
  createAcpClient,
  readSessionChoices,
  toPermissionRequest,
  type AcpPermissionRequest,
  type AcpSessionChoices,
  type AcpTransport,
} from './acp-client';

/** A fake channel that can carry lines. Measures the protocol with no real process. */
function fakeTransport() {
  const sent: Array<Record<string, unknown>> = [];
  let listener: ((line: string) => void) | null = null;
  const transport: AcpTransport = {
    send: (line) => {
      sent.push(JSON.parse(line));
    },
    subscribe: (onLine) => {
      listener = onLine;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    sent,
    /** A line the agent sent to us. */
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
    },
    emitRaw(line: string) {
      listener?.(line);
    },
    /** Answers the last request we sent. */
    reply(result: unknown) {
      const last = [...sent].reverse().find((m) => typeof m.id === 'number');
      listener?.(JSON.stringify({ jsonrpc: '2.0', id: last?.id, result }));
    },
  };
}

/** A channel where every IPC send is rejected, as in the race while the WebView goes down. */
function rejectingTransport() {
  let listener: ((line: string) => void) | null = null;
  const transport: AcpTransport = {
    send: () => Promise.reject(new Error('bridge down')),
    subscribe: (onLine) => {
      listener = onLine;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
    },
  };
}

function permissionRequest(filePath: string, id = 7, kind = 'edit') {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/request_permission',
    params: {
      sessionId: 's1',
      options: [
        { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
        { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        {
          kind: 'allow_always',
          name: 'Always Allow',
          optionId: 'allow_always',
          _meta: {
            permission: {
              changes: [
                {
                  type: 'policy_rule',
                  ruleBehavior: 'allow',
                  description: '이 디렉터리 전체를 세션 내내 허용',
                },
              ],
            },
          },
        },
      ],
      toolCall: {
        toolCallId: 'tool-1',
        title: `Write ${filePath}`,
        kind,
        rawInput: { file_path: filePath },
      },
    },
  };
}

/** The two-message Codex ACP sequence measured from a real MCP tool approval. */
function mcpToolUpdate({
  sessionId = 's1',
  toolCallId = 'mcp-call-1',
  server = 'atlas-vault',
  tool = 'patch_concept',
  argumentsValue = {
    slug: 'capabilities/acp-runtime',
    body: 'Updated ACP runtime meaning.',
    expected_mtime: 123,
  },
}: {
  sessionId?: string;
  toolCallId?: string;
  server?: string;
  tool?: string;
  argumentsValue?: Record<string, unknown>;
} = {}) {
  return {
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId,
        kind: 'execute',
        title: `mcp.${server}.${tool}`,
        status: 'in_progress',
        rawInput: { server, tool, arguments: argumentsValue },
        _meta: { is_mcp_tool_call: true },
      },
    },
  };
}

function mcpApprovalRequest({
  id = 81,
  sessionId = 's1',
  toolCallId = 'mcp-call-1',
}: {
  id?: number;
  sessionId?: string;
  toolCallId?: string;
} = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/request_permission',
    params: {
      sessionId,
      toolCall: {
        toolCallId,
        kind: 'execute',
        status: 'pending',
        content: [
          {
            type: 'content',
            content: {
              type: 'text',
              text: 'Edit concept capabilities/acp-runtime. Apply this change to the vault?',
            },
          },
        ],
      },
      _meta: { is_mcp_tool_approval: true },
      options: [
        { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
        { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
      ],
    },
  };
}

function outcomeOf(sent: Array<Record<string, unknown>>, id: number) {
  const answer = sent.find((m) => m.id === id && 'result' in m);
  return (answer?.result as { outcome?: { outcome?: string; optionId?: string } })?.outcome;
}

const insideVault = async () => 'allow-inside-vault' as const;
const alwaysAsk = async () => 'ask' as const;

describe('ACP client: answers only what we declared', () => {
  it('answers "none" instead of staying silent when an undeclared capability arrives', async () => {
    // Staying silent leaves the other side waiting forever, and to the user that looks only like "it froze".
    const t = fakeTransport();
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emit({ jsonrpc: '2.0', id: 42, method: 'fs/write_text_file', params: { path: '/x' } });
    await vi.waitFor(() => expect(t.sent.some((m) => m.id === 42)).toBe(true));

    const answer = t.sent.find((m) => m.id === 42) as { error?: { code?: number } };
    expect(answer.error?.code).toBe(-32601);
    expect(notices).toContain('declined:fs/write_text_file');
  });

  it('does not declare file or terminal capabilities in initialize', () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
    void client.initialize();
    const sent = t.sent.find((m) => m.method === 'initialize') as {
      params?: { clientCapabilities?: Record<string, unknown> };
    };
    expect(sent.params?.clientCapabilities).toEqual({});
  });
});

describe('ACP client: permission policy', () => {
  it('allows in-vault **reads** on behalf of the app (asking every time would make conversation impossible)', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    const autoAllowed = vi.fn();
    createAcpClient(t.transport, { verdict: insideVault, askUser, onAutoAllowed: autoAllowed });

    t.emit(permissionRequest('/vault/notes.md', 7, 'read'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(askUser).not.toHaveBeenCalled();
    expect(autoAllowed).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/vault/notes.md' }));
  });

  it('allows a read by our server on behalf of the app when it carries a vault-relative path; `read_source` is called as `sources/…`', async () => {
    // Rust judges absolute paths only, so vault-relative `sources/...` reads need this allowance.
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    const autoAllowed = vi.fn();
    createAcpClient(t.transport, { vaultMcpServerName: 'atlas-vault', verdict: alwaysAsk, askUser, onAutoAllowed: autoAllowed });

    const request = permissionRequest('sources/change-request-CR3.docx', 7, 'read');
    (request.params as Record<string, unknown>).toolCall = { toolCallId: 'tool-1', title: 'read_source', kind: 'read', rawInput: { path: 'sources/change-request-CR3.docx' } };
    (request.params.options[2] as { _meta: { permission: { changes: Array<Record<string, unknown>> } } })._meta.permission.changes[0].targets = [
      { type: 'tool', toolName: 'mcp__atlas-vault__read_source' },
    ];
    t.emit(request);
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(askUser).not.toHaveBeenCalled();
    expect(autoAllowed).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'mcp__atlas-vault__read_source',
      filePath: 'sources/change-request-CR3.docx',
    }));

    // A relative path that climbs out is not "inside by construction": it asks.
    const climb = permissionRequest('../secrets.env', 8, 'read');
    (climb.params as Record<string, unknown>).toolCall = { toolCallId: 'tool-2', title: 'read_source', kind: 'read', rawInput: { path: '../secrets.env' } };
    (climb.params.options[2] as { _meta: { permission: { changes: Array<Record<string, unknown>> } } })._meta.permission.changes[0].targets = [
      { type: 'tool', toolName: 'mcp__atlas-vault__read_source' },
    ];
    t.emit(climb);
    await vi.waitFor(() => expect(askUser).toHaveBeenCalledTimes(1));
  });

  it('asks about **edits** even inside the vault, since a safe path does not mean the change was seen', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    createAcpClient(t.transport, { verdict: insideVault, askUser });

    t.emit(permissionRequest('/vault/capabilities/auth.md', 7, 'edit'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'reject' });
  });

  it('asks about a tool with no stated kind even inside the vault; the unknown falls to the closed side', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    createAcpClient(t.transport, { verdict: insideVault, askUser });

    const request = permissionRequest('/vault/notes.md', 7);
    (request.params.toolCall as Record<string, unknown>).kind = undefined;
    t.emit(request);
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(askUser).toHaveBeenCalledTimes(1);
  });

  it('**still sends the answer** when the judgment fails, so the other side never waits forever', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: async () => {
        throw new Error('bridge down');
      },
      askUser,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    // Undecidable falls through to asking, and since the user gave no answer it is a rejection.
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'reject' });
    expect(notices.some((m) => m.startsWith('verdict-failed'))).toBe(true);
  });

  it('asks the user outside the vault and passes the answer through', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async (_request: AcpPermissionRequest) => 'allow');
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser });

    t.emit(permissionRequest('/somewhere/else/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(askUser.mock.calls[0][0]).toMatchObject({
      toolKind: 'edit',
      filePath: '/somewhere/else/notes.md',
    });
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'allow' });
  });

  it('rejects when the user does not answer; an unasked request is not counted as allowed', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'reject' });
  });

  it('rejects when asking fails too', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => {
        throw new Error('화면이 닫혔다');
      },
    });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toMatchObject({ optionId: 'reject' });
  });

  it('does not choose `allow_always` on behalf of the app', async () => {
    /*
     * Measured: that option's `_meta.permission` carries a rule granting "this entire directory for the
     * whole session". Widening the boundary is the user's decision alone.
     */
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: insideVault, askUser: async () => null });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)?.optionId).not.toBe('allow_always');
  });

  it('rejects when the screen returns an option that was not in the request', async () => {
    // A screen bug returning a stale request's value must not be allowed to permit the wrong thing.
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => 'not-an-option' });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toMatchObject({ optionId: 'reject' });
  });

  it('asks when the path is unknown; what cannot be judged does not pass', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    // Without a path the answer is meaningless, even one saying inside the vault.
    createAcpClient(t.transport, {
      verdict: async (filePath) => (filePath ? 'allow-inside-vault' : 'ask'),
      askUser,
    });

    const request = permissionRequest('/vault/notes.md', 11) as {
      params: { toolCall: { rawInput: Record<string, unknown> } };
    };
    request.params.toolCall.rawInput = {}; // no path
    t.emit(request);

    await vi.waitFor(() => expect(askUser).toHaveBeenCalled());
  });

  it('answers with a cancel when there is not even a reject option (no answer would stall the other side)', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    t.emit({
      jsonrpc: '2.0',
      id: 9,
      method: 'session/request_permission',
      params: { options: [{ kind: 'allow_once', optionId: 'allow', name: 'Allow' }], toolCall: {} },
    });
    await vi.waitFor(() => expect(outcomeOf(t.sent, 9)).toBeTruthy());
    expect(outcomeOf(t.sent, 9)).toEqual({ outcome: 'cancelled' });
  });
});

describe('ACP client: Codex MCP approval correlation', () => {
  it.each([
    ['reject', 'reject'],
    ['allow', 'allow'],
  ])('passes an explicit %s on a correctly linked Atlas write as %s_once', async (choice, optionId) => {
    const t = fakeTransport();
    const updates: Array<Record<string, unknown>> = [];
    const askUser = vi.fn(async (_request: AcpPermissionRequest) => choice);
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
      onUpdate: (update) => updates.push(update),
    });

    const update = mcpToolUpdate();
    t.emit(update);
    t.emit(mcpApprovalRequest());
    await vi.waitFor(() => expect(outcomeOf(t.sent, 81)).toBeTruthy());

    expect(updates).toEqual([update.params.update]);
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(askUser.mock.calls[0][0]).toMatchObject({
      title: 'Edit concept capabilities/acp-runtime. Apply this change to the vault?',
      toolCallId: 'mcp-call-1',
      toolName: 'mcp__atlas-vault__patch_concept',
      toolKind: 'execute',
      rawInput: {
        slug: 'capabilities/acp-runtime',
        body: 'Updated ACP runtime meaning.',
        expected_mtime: 123,
      },
      reviewKind: 'ontology-write',
      writerCorrelation: {
        status: 'verified', server: 'atlas-vault', tool: 'patch_concept',
        toolCall: 'structured-mcp', approval: 'structured-mcp',
      },
    });
    expect(outcomeOf(t.sent, 81)).toEqual({ outcome: 'selected', optionId });
  });

  it('keeps the structured start info through a status-only refinement', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async (_request: AcpPermissionRequest) => 'reject');
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
    });

    t.emit(mcpToolUpdate());
    t.emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 's1',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'mcp-call-1',
          status: 'in_progress',
        },
      },
    });
    t.emit(mcpApprovalRequest());

    await vi.waitFor(() => expect(askUser).toHaveBeenCalledTimes(1));
    expect(askUser.mock.calls[0][0].toolName).toBe('mcp__atlas-vault__patch_concept');
  });

  it('cancels without consuming the info of another call when the session or toolCallId differs', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => 'reject');
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
    });

    t.emit(mcpToolUpdate());
    t.emit(mcpApprovalRequest({ id: 82, sessionId: 's2' }));
    t.emit(mcpApprovalRequest({ id: 83, toolCallId: 'some-other-call' }));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 83)).toBeTruthy());

    expect(outcomeOf(t.sent, 82)).toEqual({ outcome: 'cancelled' });
    expect(outcomeOf(t.sent, 83)).toEqual({ outcome: 'cancelled' });
    expect(askUser).not.toHaveBeenCalled();

    // Neither mismatch consumed the one exact entry.
    t.emit(mcpApprovalRequest({ id: 84 }));
    await vi.waitFor(() => expect(askUser).toHaveBeenCalledTimes(1));
    expect(outcomeOf(t.sent, 84)).toEqual({ outcome: 'selected', optionId: 'reject' });
  });

  it.each([
    ['no preceding update', null],
    [
      'arguments missing',
      {
        server: 'atlas-vault',
        tool: 'patch_concept',
      },
    ],
    [
      'arguments is not an object',
      {
        server: 'atlas-vault',
        tool: 'patch_concept',
        arguments: [],
      },
    ],
  ])('opens no card and cancels when the MCP context is incomplete: %s', async (_label, rawInput) => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => 'allow');
    const notices: string[] = [];
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
      onProtocolNotice: (message) => notices.push(message),
    });

    if (rawInput) {
      const update = mcpToolUpdate();
      (update.params.update as Record<string, unknown>).rawInput = rawInput;
      t.emit(update);
    }
    t.emit(mcpApprovalRequest());
    await vi.waitFor(() => expect(outcomeOf(t.sent, 81)).toBeTruthy());

    expect(outcomeOf(t.sent, 81)).toEqual({ outcome: 'cancelled' });
    expect(askUser).not.toHaveBeenCalled();
    expect(notices).toContain('permission-context-missing:mcp-tool-approval');
  });

  it('does not reuse earlier arguments for a malformed MCP refinement of the same call', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => 'allow');
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
    });

    t.emit(mcpToolUpdate());
    const malformed = mcpToolUpdate();
    (malformed.params.update as Record<string, unknown>).rawInput = {
      server: 'atlas-vault',
      tool: 'patch_concept',
      arguments: [],
    };
    t.emit(malformed);
    t.emit(mcpApprovalRequest());
    await vi.waitFor(() => expect(outcomeOf(t.sent, 81)).toBeTruthy());

    expect(outcomeOf(t.sent, 81)).toEqual({ outcome: 'cancelled' });
    expect(askUser).not.toHaveBeenCalled();
  });

  it('leaves another correctly linked MCP server as a plain explicit card', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async (_request: AcpPermissionRequest) => 'allow');
    createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
    });

    t.emit(
      mcpToolUpdate({
        server: 'issues',
        tool: 'create_issue',
        argumentsValue: { title: 'Investigate relation counts' },
      }),
    );
    t.emit(mcpApprovalRequest());
    await vi.waitFor(() => expect(outcomeOf(t.sent, 81)).toBeTruthy());

    expect(askUser.mock.calls[0][0]).toMatchObject({
      toolName: 'mcp__issues__create_issue',
      rawInput: { title: 'Investigate relation counts' },
      reviewKind: 'permission',
    });
    expect(outcomeOf(t.sent, 81)).toEqual({ outcome: 'selected', optionId: 'allow' });
  });

  it('uses correlation info once and discards it on completion or session cancel', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => 'reject');
    const client = createAcpClient(t.transport, {
      vaultMcpServerName: 'atlas-vault',
      verdict: alwaysAsk,
      askUser,
    });

    t.emit(mcpToolUpdate());
    t.emit(mcpApprovalRequest({ id: 85 }));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 85)).toBeTruthy());
    t.emit(mcpApprovalRequest({ id: 86 }));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 86)).toBeTruthy());

    t.emit(mcpToolUpdate({ toolCallId: 'completed-call' }));
    t.emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 's1',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'completed-call',
          status: 'completed',
        },
      },
    });
    t.emit(mcpApprovalRequest({ id: 87, toolCallId: 'completed-call' }));

    t.emit(mcpToolUpdate({ toolCallId: 'cancelled-session-call' }));
    await client.cancel('s1');
    t.emit(mcpApprovalRequest({ id: 88, toolCallId: 'cancelled-session-call' }));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 88)).toBeTruthy());

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(outcomeOf(t.sent, 86)).toEqual({ outcome: 'cancelled' });
    expect(outcomeOf(t.sent, 87)).toEqual({ outcome: 'cancelled' });
    expect(outcomeOf(t.sent, 88)).toEqual({ outcome: 'cancelled' });
  });
});

describe('ACP client: requests, responses and noise', () => {
  it('returns a sessionId from session/new and fails without one', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    const ok = client.newSession({ cwd: '/vault' });
    t.reply({ sessionId: 's-1', modes: { currentModeId: 'default' } });
    await expect(ok).resolves.toMatchObject({ sessionId: 's-1' });

    const bad = client.newSession({ cwd: '/vault' });
    t.reply({});
    await expect(bad).rejects.toThrow(/sessionId/);
  });

  it('keeps a mode not yet re-examined in the list and returns its safety state with it', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    const pending = client.newSession({ cwd: '/vault' });
    t.reply({
      sessionId: 's-1',
      modes: {
        currentModeId: 'default',
        availableModes: [
          { id: 'default', name: 'Default' },
          { id: 'turbo-yolo', name: 'Turbo' },
          { id: 'bypassPermissions', name: 'Bypass' },
          { name: 'No identifier' },
        ],
      },
    });

    await expect(pending).resolves.toMatchObject({
      choices: {
        modes: [
          { id: 'default', name: 'Default' },
          { id: 'turbo-yolo', name: 'Turbo' },
        ],
        unverifiedModeIds: ['turbo-yolo'],
        droppedModeCount: 1,
      },
    });
  });

  it('passes session/update through to the screen and does not answer it', async () => {
    const t = fakeTransport();
    const updates: Array<Record<string, unknown>> = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onUpdate: (u) => updates.push(u),
    });

    t.emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk' } },
    });
    expect(updates).toEqual([{ sessionUpdate: 'agent_message_chunk' }]);
    expect(t.sent).toHaveLength(0);
  });

  it('drops lines that are not JSON, but not silently', () => {
    const t = fakeTransport();
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emitRaw('npm warn exec 어댑터를 받는 중…');
    t.emitRaw('   ');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('unparsable:');
  });

  it('fails pending calls on dispose and eats no more lines', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
    const waiting = client.initialize();
    client.dispose();
    await expect(waiting).rejects.toThrow(/closed/);

    const before = t.sent.length;
    t.emit({ jsonrpc: '2.0', id: 1, method: 'fs/read_text_file', params: {} });
    expect(t.sent).toHaveLength(before);
  });
});

describe('ACP client: an unanswered request eventually ends', () => {
  it.each([
    ['initialize', (client: ReturnType<typeof createAcpClient>) => client.initialize()],
    [
      'session/prompt',
      (client: ReturnType<typeof createAcpClient>) =>
        client.prompt('s-1', [{ type: 'text', text: '이 폴더를 훑어봐' }]),
    ],
  ])('fails %s at once with no timeout when sending is refused, and ignores the late answer', async (method, run) => {
    const t = rejectingTransport();
    const notices: string[] = [];
    const client = createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (message) => notices.push(message),
    });
    let failure: unknown;
    const settled = run(client).catch((error: unknown) => {
      failure = error;
    });

    await vi.waitFor(() => expect(notices).toContain('send-failed: Error: bridge down'));
    try {
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain(`acp-send-failed: ${method}`);
      t.emit({ jsonrpc: '2.0', id: 1, result: { stopReason: 'late' } });
      expect(String(failure)).toContain(`acp-send-failed: ${method}`);
    } finally {
      client.dispose();
      await settled;
    }
  });

  it('fails after the time passes when the handshake gets no answer, rather than sticking on "starting"', async () => {
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      // Attach the rejection observer before advancing the timers. Attached late, the behaviour is
      // still right but Vitest judges the rejection in between as unhandled.
      const timedOut = expect(client.initialize()).rejects.toThrow(/acp-timeout/);
      // Not one line of answer is given.
      await vi.advanceTimersByTimeAsync(60_000);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the handshake clock while downloading, the spot where the first conversation never opened', async () => {
    /* Download progress is proof of life and restarts the handshake clock; the first `npx` fetch is large. */
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      let settled: unknown = null;
      const handshake = client.initialize().then(
        (value) => (settled = { ok: value }),
        (error: unknown) => (settled = { failed: error }),
      );

      // Four minutes of downloading — far past the 45s ceiling — with a progress notice each 30s.
      for (let elapsed = 0; elapsed < 240_000; elapsed += 30_000) {
        await vi.advanceTimersByTimeAsync(30_000);
        client.extendPendingDeadlines();
      }
      expect(settled, 'a download that keeps advancing must not be called a timeout').toBeNull();

      // The download lands and the adapter finally answers.
      t.emit({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } });
      await handshake;
      expect(settled).toEqual({ ok: { protocolVersion: 1 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after the usual time when the download stalls', async () => {
    // The ceiling keeps its meaning: 45s with **no sign of life**. Extending it only while progress
    // arrives must not turn a genuinely stalled fetch into an endless wait.
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      const timedOut = expect(client.initialize()).rejects.toThrow(/acp-timeout/);
      // One burst of progress, then the fetch stalls.
      await vi.advanceTimersByTimeAsync(30_000);
      client.extendPendingDeadlines();
      await vi.advanceTimersByTimeAsync(60_000);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives a conversation turn no time limit, since taking long is normal for it', async () => {
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      let settled = false;
      void client.prompt('s-1', [{ type: 'text', text: '이 폴더를 훑어봐' }]).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(settled, 'cutting off the conversation because it takes long would be wrong').toBe(false);
      client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('toPermissionRequest: reads the path, not the title', () => {
  it('extracts the structured file_path and drops options that do not pair up', () => {
    const parsed = toPermissionRequest({
      options: [
        { kind: 'allow_once', optionId: 'a', name: 'Allow' },
        { kind: 'reject_once' }, // no optionId — unusable
        { optionId: 'x' }, // no kind — unusable
      ],
      toolCall: {
        toolCallId: 'tool-write-notes',
        title: 'Write notes.md',
        kind: 'edit',
        rawInput: { file_path: '/vault/notes.md' },
      },
    });
    expect(parsed.toolCallId).toBe('tool-write-notes');
    expect(parsed.filePath).toBe('/vault/notes.md');
    expect(parsed.toolKind).toBe('edit');
    expect(parsed.rawInput).toEqual({ file_path: '/vault/notes.md' });
    expect(parsed.reviewKind).toBe('permission');
    expect(parsed.options).toEqual([{ optionId: 'a', kind: 'allow_once', name: 'Allow' }]);
  });

  it('treats a preserved JSON-RPC request id of 0 as valid and does not replace it with a new id', () => {
    const parsed = toPermissionRequest({ sessionId: 's-1' }, null, 0);
    expect(parsed.requestId).toBe(0);
    expect(parsed.sessionId).toBe('s-1');
  });

  it('does not blow up on a different shape; the conversation must survive an adapter change', () => {
    expect(toPermissionRequest({})).toEqual({
      requestId: null,
      sessionId: null,
      title: null,
      toolCallId: null,
      toolName: null,
      toolKind: null,
      filePath: null,
      rawInput: {},
      reviewKind: 'permission',
      options: [],
    });
  });

  it('reads the sentence the tool left when there is no title, the spot where the server asks itself', () => {
    /*
     * The vault server pauses a write with `elicitation/create`; `codex-acp` forwards it with no
     * `toolCall.title`, so the question is read from `toolCall.content[]`.
     */
    const parsed = toPermissionRequest({
      options: [{ kind: 'allow_once', optionId: 'accept', name: 'Accept' }],
      toolCall: {
        toolCallId: 'elicitation-ontology-atlas',
        kind: 'other',
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Create concept wire-probe. Apply this change to the vault?' },
          },
        ],
        rawInput: { serverName: 'ontology-atlas' },
      },
    });
    expect(parsed.title).toBe('Create concept wire-probe. Apply this change to the vault?');
  });

  it('lets the title win when there is one, the spot the convention names', () => {
    const parsed = toPermissionRequest({
      toolCall: {
        title: 'Write notes.md',
        content: [{ type: 'content', content: { type: 'text', text: 'ignore me' } }],
      },
    });
    expect(parsed.title).toBe('Write notes.md');
  });
});

/**
 * `current_mode_update` carries only the mode id, so state comes from what is on hand
 * plus the standing safety decision.
 */
describe('applyCurrentMode — the adapter moved the session, not the person', () => {
  const base: AcpSessionChoices = readSessionChoices({
    modes: {
      currentModeId: 'default',
      availableModes: [
        { id: 'default', name: 'Manual', _meta: { kind: 'standard' } },
        { id: 'plan', name: 'Plan', _meta: { kind: 'plan' } },
      ],
    },
  });

  it('follows a mode already on the list and changes nothing else', () => {
    const next = applyCurrentMode(base, 'plan');
    expect(next.currentModeId).toBe('plan');
    expect(next.modes).toEqual(base.modes);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('states a gate-removing clamp without offering it back', () => {
    /*
     * `acceptEdits` is where `claude-agent-acp` 0.74.0 lands a session whose model cannot do `auto`.
     * The screen must say where the session is; putting the row into the list would hand the person
     * a way to return to it, which is the one thing `mode-safety.ts` exists to prevent.
     */
    const next = applyCurrentMode(base, 'acceptEdits');
    expect(next.currentModeId).toBe('acceptEdits');
    expect(next.modes.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('reflects a local permission profile without reoffering it', () => {
    const next = applyCurrentMode(base, 'permission-profile:local');
    expect(next.currentModeId).toBe('permission-profile:local');
    expect(next.modes).toEqual(base.modes);
    expect(next.unverifiedModeIds).toEqual([]);
  });

  it('shows a mode nobody advertised, marked unchecked — the dropdown must not go blank', () => {
    const next = applyCurrentMode(base, 'brand-new');
    expect(next.currentModeId).toBe('brand-new');
    expect(next.modes.map((m) => m.id)).toEqual(['default', 'plan', 'brand-new']);
    expect(next.unverifiedModeIds).toEqual(['brand-new']);
  });

  it('does not add the same unadvertised mode twice', () => {
    const once = applyCurrentMode(base, 'brand-new');
    const twice = applyCurrentMode(applyCurrentMode(once, 'plan'), 'brand-new');
    expect(twice.modes.map((m) => m.id)).toEqual(['default', 'plan', 'brand-new']);
    expect(twice.unverifiedModeIds).toEqual(['brand-new']);
  });
});
