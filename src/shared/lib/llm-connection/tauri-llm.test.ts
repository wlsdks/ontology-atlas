import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

import { llmChat, llmChatErrorMessage } from './tauri-llm';

describe('tauri-llm web downgrade', () => {
  it('on the web it returns null without invoke, since there is no transfer path at all', async () => {
    mocks.isTauri.mockReturnValue(false);
    mocks.invoke.mockClear();
    const result = await llmChat({
      provider: 'anthropic',
      vaultPath: '/vault',
      model: 'claude-opus-5',
      question: '이거 고쳐줘',
      body: '{}',
      scope: { nodes: [], promptChars: 0, vaultChars: 0, tools: [] },
    });
    expect(result).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('on desktop it passes arguments exactly as the Rust command contract says', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockClear();
    mocks.invoke.mockImplementation((command: string) => Promise.resolve(command === "llm_chat_prepare" ? "request-1" : command === "llm_chat_cancel" ? false : {
      status: 200,
      body: '{}',
      host: 'api.anthropic.com',
      durationMs: 12,
      loggedAt: '2026-07-26T00:00:00.000Z',
    }));
    await llmChat({
      provider: 'anthropic',
      vaultPath: '/vault',
      model: 'claude-opus-5',
      question: '이거 고쳐줘',
      body: '{"messages":[]}',
      scope: {
        nodes: ['capabilities/payment'],
        promptChars: 2100,
        vaultChars: 1020,
        tools: [{ name: 'get_concept', target: 'capabilities/payment' }],
      },
    });
    expect(mocks.invoke).toHaveBeenCalledWith('llm_chat', {
      requestId: 'request-1',
      provider: 'anthropic',
      vaultPath: '/vault',
      model: 'claude-opus-5',
      question: '이거 고쳐줘',
      body: '{"messages":[]}',
      scope: {
        nodes: ['capabilities/payment'],
        promptChars: 2100,
        vaultChars: 1020,
        tools: [{ name: 'get_concept', target: 'capabilities/payment' }],
      },
      // `null` unless this is the custom-endpoint branch, so a named vendor's
      // conversation can never be routed to an arbitrary host (Rust rejects a
      // value if one arrives).
      baseUrl: null,
    });
  });

  it('this file has no type or argument that carries a key', () => {
    // Keys flow only inside Rust; the contract breaks the moment the bridge
    // touches one. Same discipline as the source-reflection contract in
    // `tauri-secrets.ts`.
    const source = readFileSync(join(__dirname, 'tauri-llm.ts'), 'utf-8');
    expect(source).not.toMatch(/\bsecret\s*:/);
    expect(source).not.toMatch(/apiKey|api_key/);
  });

  it('folds a Rust Err(String) into one user-facing line', () => {
    // Rust now sends only the code (`src-tauri/src/coded_error.rs`). The sentence is chosen
    // here, the one side that knows the reader's language.
    const lookup = (code: string) => (code === 'no-response' ? '답을 받지 못했어요.' : undefined);
    expect(llmChatErrorMessage('no-response', lookup)).toBe('답을 받지 못했어요.');
    expect(llmChatErrorMessage('request-failed: broken pipe', lookup)).toBe('broken pipe');
    expect(llmChatErrorMessage(new Error('offline'))).toBe('offline');
  });
});
