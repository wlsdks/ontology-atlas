import { describe, expect, it, vi } from 'vitest';
import { callClaude, getModelPricing, LlmCallError } from './call-llm';

function mockSuccess(body: Record<string, unknown>, status = 200): typeof globalThis.fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof globalThis.fetch;
}

function mockStatus(status: number): typeof globalThis.fetch {
  return vi.fn(async () => new Response('error body', { status })) as unknown as typeof globalThis.fetch;
}

describe('callClaude — happy path', () => {
  it('extracts text from a valid Anthropic response', async () => {
    const fetchMock = mockSuccess({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: '{"summary":"ok"}' },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await callClaude({
      apiKey: 'k',
      system: 'sys',
      user: 'usr',
      fetch: fetchMock,
    });

    expect(result.text).toBe('{"summary":"ok"}');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.estimatedCostUsd).toBeCloseTo(
      (100 / 1_000_000) * 3 + (50 / 1_000_000) * 15,
      8,
    );
    expect(result.stopReason).toBe('end_turn');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('joins multi-block text content', async () => {
    const fetchMock = mockSuccess({
      id: 'msg_2',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: 'part1 ' },
        { type: 'text', text: 'part2' },
        { type: 'tool_use' }, // ignored
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const result = await callClaude({
      apiKey: 'k',
      system: 's',
      user: 'u',
      fetch: fetchMock,
    });
    expect(result.text).toBe('part1 part2');
  });

  it('sends temperature=0 by default for T-11 reproducibility', async () => {
    let captured: { temperature?: unknown; max_tokens?: unknown } | null = null;
    const fetchMock = vi.fn(async (_url, init) => {
      captured = JSON.parse(String((init as RequestInit).body));
      return new Response(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;

    await callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: fetchMock });
    expect(captured).not.toBeNull();
    expect(captured!.temperature).toBe(0);
    expect(captured!.max_tokens).toBe(4096);
  });

  it('honors temperature override when provided', async () => {
    let captured: { temperature?: unknown } | null = null;
    const fetchMock = vi.fn(async (_url, init) => {
      captured = JSON.parse(String((init as RequestInit).body));
      return new Response(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;

    await callClaude({
      apiKey: 'k',
      system: 's',
      user: 'u',
      temperature: 0.7,
      fetch: fetchMock,
    });
    expect(captured!.temperature).toBe(0.7);
  });

  it('uses the provided baseUrl and version headers', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://mock.example/v1/messages');
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-api-key')).toBe('k');
      expect(headers.get('anthropic-version')).toBe('2099-01-01');
      return new Response(
        JSON.stringify({
          id: 'm',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;

    const result = await callClaude({
      apiKey: 'k',
      system: 's',
      user: 'u',
      baseUrl: 'https://mock.example',
      anthropicVersion: '2099-01-01',
      fetch: fetchMock,
    });
    expect(result.text).toBe('ok');
  });
});

describe('callClaude — error mapping', () => {
  it('throws LlmCallError(auth) when apiKey is missing', async () => {
    await expect(
      callClaude({ apiKey: '', system: 's', user: 'u', fetch: mockSuccess({}) }),
    ).rejects.toMatchObject({ name: 'LlmCallError', code: 'auth' });
  });

  it('maps 401 to auth error', async () => {
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: mockStatus(401) }),
    ).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps 403 to auth error', async () => {
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: mockStatus(403) }),
    ).rejects.toMatchObject({ code: 'auth' });
  });

  it('maps 429 to rate_limit error', async () => {
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: mockStatus(429) }),
    ).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('maps 5xx to server_error', async () => {
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: mockStatus(503) }),
    ).rejects.toMatchObject({ code: 'server_error' });
  });

  it('maps non-2xx other to invalid_response', async () => {
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: mockStatus(400) }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('throws on unexpected response shape', async () => {
    const fetchMock = mockSuccess({ id: 'x', type: 'error', content: 'oops' });
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('throws on AbortError as timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof globalThis.fetch;
    await expect(
      callClaude({
        apiKey: 'k',
        system: 's',
        user: 'u',
        timeoutMs: 5,
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('wraps generic fetch failure as network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof globalThis.fetch;
    await expect(
      callClaude({ apiKey: 'k', system: 's', user: 'u', fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('cost estimation', () => {
  it('returns a pricing table for known models', () => {
    const pricing = getModelPricing();
    expect(pricing['claude-sonnet-4-6']).toEqual({ input: 3, output: 15 });
    expect(pricing['claude-opus-4-7']).toEqual({ input: 15, output: 75 });
  });

  it('omits estimatedCostUsd for unknown model', async () => {
    const fetchMock = mockSuccess({
      id: 'm',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      model: 'unknown-model-xyz',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const result = await callClaude({
      apiKey: 'k',
      system: 's',
      user: 'u',
      fetch: fetchMock,
    });
    expect(result.usage.estimatedCostUsd).toBeUndefined();
  });
});

describe('LlmCallError', () => {
  it('exposes code and message', () => {
    const err = new LlmCallError('rate_limit', 'too many');
    expect(err.code).toBe('rate_limit');
    expect(err.message).toBe('too many');
    expect(err.name).toBe('LlmCallError');
  });
});
