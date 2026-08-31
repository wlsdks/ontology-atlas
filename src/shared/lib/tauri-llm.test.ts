import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

import { isLlmChatBridgeAvailable, llmChat, llmChatErrorMessage } from './tauri-llm';

describe('tauri-llm 웹 강등', () => {
  it('Tauri 런타임이 아니면 브리지가 없다고 말한다', () => {
    mocks.isTauri.mockReturnValue(false);
    expect(isLlmChatBridgeAvailable()).toBe(false);
  });

  it('웹에서는 invoke 없이 null 을 돌려준다 — 전송 경로 자체가 없다', async () => {
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

  it('데스크톱에서는 Rust 커맨드 계약 그대로 인자를 넘긴다', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockClear();
    mocks.invoke.mockResolvedValue({
      status: 200,
      body: '{}',
      host: 'api.anthropic.com',
      durationMs: 12,
      loggedAt: '2026-07-26T00:00:00.000Z',
    });
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

  it('이 파일에는 키를 담는 타입도 인자도 없다', () => {
    // Keys flow only inside Rust; the contract breaks the moment the bridge
    // touches one. Same discipline as the source-reflection contract in
    // `tauri-secrets.ts`.
    const source = readFileSync(join(__dirname, 'tauri-llm.ts'), 'utf-8');
    expect(source).not.toMatch(/\bsecret\s*:/);
    expect(source).not.toMatch(/apiKey|api_key/);
  });

  it('Rust 의 Err(String) 을 사용자 한 줄로 접는다', () => {
    // 러스트는 이제 코드만 보낸다 (`src-tauri/src/errors.rs`). 문장은 읽는 사람의
    // 언어를 아는 이쪽에서 고른다.
    const lookup = (code: string) => (code === 'no-response' ? '답을 받지 못했어요.' : undefined);
    expect(llmChatErrorMessage('no-response', lookup)).toBe('답을 받지 못했어요.');
    expect(llmChatErrorMessage('request-failed: broken pipe', lookup)).toBe('broken pipe');
    expect(llmChatErrorMessage(new Error('offline'))).toBe('offline');
  });
});
