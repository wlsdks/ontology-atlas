import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => mocks);
import { llmChat } from './tauri-llm';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const args = { provider: 'local', vaultPath: '/vault', model: 'fixture', question: '한글', body: '{}', scope: { nodes: [], promptChars: 2, vaultChars: 0, tools: [] } };
const echo = { status: 200, body: '{}', host: 'localhost', durationMs: 1, loggedAt: 'fixture' };
const commands = () => mocks.invoke.mock.calls.map(([name]) => name);

beforeEach(() => { mocks.invoke.mockReset(); mocks.isTauri.mockReturnValue(true); });

describe('native model cancellation', () => {
  it('does not prepare or send an already rejected turn', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(llmChat({ ...args, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('cancels a late reservation without transmitting the rejected turn', async () => {
    const prepared = deferred<string>();
    mocks.invoke.mockImplementation((command: string) => command === 'llm_chat_prepare' ? prepared.promise : Promise.resolve(true));
    const controller = new AbortController();
    const result = llmChat({ ...args, signal: controller.signal });
    const rejected = result.then(() => null, error => error);
    await vi.waitFor(() => expect(commands()).toContain('llm_chat_prepare'));
    controller.abort();
    prepared.resolve('old');
    expect(await rejected).toMatchObject({ name: 'AbortError' });
    expect(mocks.invoke).toHaveBeenCalledWith('llm_chat_cancel', { requestId: 'old' });
    expect(commands()).not.toContain('llm_chat');
  });

  it('waits for rejected audit settlement before sending the same-vault replacement', async () => {
    const old = deferred<typeof echo>();
    let sequence = 0;
    mocks.invoke.mockImplementation((command: string, input?: { requestId: string }) => {
      if (command === 'llm_chat_prepare') return Promise.resolve(`request-${++sequence}`);
      if (command === 'llm_chat_cancel') return Promise.resolve(true);
      return input?.requestId === 'request-1' ? old.promise : Promise.resolve(echo);
    });
    const controller = new AbortController();
    const original = llmChat({ ...args, signal: controller.signal });
    const rejected = original.then(() => null, error => error);
    await vi.waitFor(() => expect(commands()).toContain('llm_chat'));
    controller.abort();
    const replacement = llmChat(args);
    await vi.waitFor(() => expect(commands()).toContain('llm_chat_cancel'));
    expect(sequence).toBe(1);
    old.reject('cancelled');
    expect(await rejected).toBe('cancelled');
    await expect(replacement).resolves.toEqual(echo);
    expect(sequence).toBe(2);
    expect(mocks.invoke.mock.calls.filter(([name, input]) => name === 'llm_chat_cancel' && input.requestId === 'request-1')).toHaveLength(1);
  });

  it('does not block another vault or let a stale signal cancel it', async () => {
    const old = deferred<typeof echo>();
    let sequence = 0;
    mocks.invoke.mockImplementation((command: string, input?: { requestId: string }) => {
      if (command === 'llm_chat_prepare') return Promise.resolve(`request-${++sequence}`);
      if (command === 'llm_chat_cancel') return Promise.resolve(true);
      return input?.requestId === 'request-1' ? old.promise : Promise.resolve(echo);
    });
    const controller = new AbortController();
    const original = llmChat({ ...args, signal: controller.signal });
    await vi.waitFor(() => expect(commands()).toContain('llm_chat'));
    controller.abort();
    await expect(llmChat({ ...args, vaultPath: '/other' })).resolves.toEqual(echo);
    old.resolve(echo);
    await original;
    const count = mocks.invoke.mock.calls.length;
    controller.abort();
    expect(mocks.invoke).toHaveBeenCalledTimes(count);
  });

  it('removes each completed request listener over repeated turns', async () => {
    let sequence = 0;
    mocks.invoke.mockImplementation((command: string) => Promise.resolve(command === 'llm_chat_prepare' ? String(++sequence) : command === 'llm_chat_cancel' ? false : echo));
    for (let cycle = 0; cycle < 8; cycle += 1) {
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      await expect(llmChat({ ...args, signal: controller.signal })).resolves.toEqual(echo);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      const count = mocks.invoke.mock.calls.length;
      controller.abort();
      expect(mocks.invoke).toHaveBeenCalledTimes(count);
    }
    expect(sequence).toBe(8);
  });
});

it.each([false, true])('works without AbortSignal.throwIfAborted when rejected=%s', async (aborted) => {
  mocks.invoke.mockImplementation((command: string) => Promise.resolve(command === 'llm_chat_prepare' ? 'compatible' : command === 'llm_chat_cancel' ? false : echo));
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
  Object.defineProperty(controller.signal, 'reason', { value: undefined });
  if (aborted) controller.abort();
  const result = llmChat({ ...args, signal: controller.signal });
  if (aborted) {
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  } else {
    await expect(result).resolves.toEqual(echo);
  }
});
