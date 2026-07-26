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
    });
  });

  it('이 파일에는 키를 담는 타입도 인자도 없다', () => {
    // 키는 Rust 안에서만 흐른다 — 브리지가 키를 만지면 그 계약이 깨진다.
    // `tauri-secrets.ts` 의 소스-리플렉션 계약과 같은 규율이다.
    const source = readFileSync(join(__dirname, 'tauri-llm.ts'), 'utf-8');
    expect(source).not.toMatch(/\bsecret\s*:/);
    expect(source).not.toMatch(/apiKey|api_key/);
  });

  it('Rust 의 Err(String) 을 사용자 한 줄로 접는다', () => {
    expect(llmChatErrorMessage('보낼 수 없어요')).toBe('보낼 수 없어요');
    expect(llmChatErrorMessage(new Error('offline'))).toBe('offline');
  });
});
