import { describe, expect, it, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import { AuditReadError, parseLlmAuditLog, readLlmAuditSummary } from './llm-audit-log';

const row = (n: number) => JSON.stringify({ v: 1, at: String(n), provider: 'local', question: '결제 상태', scope: { nodes: ['elements/a', 42] }, durationMs: n });
function handle(file: object) {
  return { getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => file }) }) } as unknown as FileSystemDirectoryHandle;
}
function streamed(raw: string, size = 17) {
  const bytes = new TextEncoder().encode(raw);
  return { stream: () => new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
    controller.close();
  } }), text: vi.fn(() => { throw new Error('Whole-file text read must not be used'); }) };
}

describe('audit count and tail reader', () => {
  it.each([1, 2, 7, 128])('keeps the whole count and last five facts across %i-byte chunks', async size => {
    const raw = Array.from({ length: 30 }, (_, n) => row(n)).join('\r\n');
    const file = streamed(raw, size);
    const result = await readLlmAuditSummary(handle(file), { limit: 5 });
    expect(result).toEqual({ total: 30, entries: parseLlmAuditLog(raw, { limit: 5 }) });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('matches admission, legacy fields and unknown outcomes without counting broken records', async () => {
    const raw = ['null', '[]', 'false', '{ broken', '{"v":2,"at":"x","provider":"p"}',
      '{"v":1,"at":"","provider":""}', row(1),
      '{"v":1,"at":"x","provider":"p","outcome":"future","tools":[],"scope":null}', '', row(2)].join('\n');
    const expected = parseLlmAuditLog(raw, { limit: Number.MAX_SAFE_INTEGER });
    expect(await readLlmAuditSummary(handle(streamed(raw)), { limit: 2 })).toEqual({ total: expected.length, entries: expected.slice(-2) });
    expect(await readLlmAuditSummary(handle(streamed(raw)), { limit: 0 })).toEqual({ total: expected.length, entries: [] });
  });

  it('falls back to text for older file adapters and returns empty on missing files', async () => {
    expect(await readLlmAuditSummary(handle({ text: async () => row(1) }))).toEqual({ total: 1, entries: parseLlmAuditLog(row(1)) });
    expect(await readLlmAuditSummary(handle({ text: async () => { throw new DOMException('missing', 'NotFoundError'); } }))).toEqual({ total: 0, entries: [] });
    await expect(readLlmAuditSummary(handle({ text: async () => { throw new Error('denied'); } }))).rejects.toBeInstanceOf(AuditReadError);
  });

  it('does not begin file access for a cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    const getDirectoryHandle = vi.fn();
    expect(await readLlmAuditSummary({ getDirectoryHandle } as unknown as FileSystemDirectoryHandle, { signal: controller.signal })).toEqual({ total: 0, entries: [] });
    expect(getDirectoryHandle).not.toHaveBeenCalled();
  });

  it('does not load a file when cancelled while its directory resolves', async () => {
    const controller = new AbortController();
    const getFileHandle = vi.fn();
    let resolve!: (dir: { getFileHandle: typeof getFileHandle }) => void;
    const getDirectoryHandle = () => new Promise(done => { resolve = done; });
    const pending = readLlmAuditSummary({ getDirectoryHandle } as unknown as FileSystemDirectoryHandle, { signal: controller.signal });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    controller.abort(); resolve({ getFileHandle });
    expect(await pending).toEqual({ total: 0, entries: [] });
    expect(getFileHandle).not.toHaveBeenCalled();
  });

  it('cancels a pending stream and never returns a partial count', async () => {
    const controller = new AbortController(); const cancel = vi.fn();
    const stream = vi.fn(() => new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new TextEncoder().encode(row(1) + '\n')); }, cancel }));
    const file = { stream };
    const pending = readLlmAuditSummary(handle(file), { signal: controller.signal });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    controller.abort();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(await pending).toEqual({ total: 0, entries: [] });
  });

  it('discards partial results when a stream fails after valid rows', async () => {
    let pulled = false;
    const file = { stream: () => new ReadableStream<Uint8Array>({ pull(controller) {
      if (pulled) controller.error(new Error('interrupted read'));
      else { pulled = true; controller.enqueue(new TextEncoder().encode(row(1) + '\n')); }
    } }) };
    await expect(readLlmAuditSummary(handle(file))).rejects.toBeInstanceOf(AuditReadError);
  });

  it.each([-1, Infinity, NaN, 1.5])('rejects invalid tail limit %s before file access', async limit => {
    const getDirectoryHandle = vi.fn();
    await expect(readLlmAuditSummary({ getDirectoryHandle } as unknown as FileSystemDirectoryHandle, { limit })).rejects.toThrow(RangeError);
    expect(getDirectoryHandle).not.toHaveBeenCalled();
  });

  it('lets a dismissal task cancel processing of a single large incoming chunk', async () => {
    const controller = new AbortController();
    const raw = Array.from({ length: 50000 }, (_, n) => row(n)).join('\n');
    const pending = readLlmAuditSummary(handle(streamed(raw, new TextEncoder().encode(raw).byteLength)), { signal: controller.signal });
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { controller.abort(); channel.port1.close(); channel.port2.close(); };
    channel.port2.postMessage(null);
    expect(await pending).toEqual({ total: 0, entries: [] });
  });

  it('limits decoding work even when the file adapter supplies one large chunk', async () => {
    const raw = Array.from({ length: 5000 }, (_, n) => row(n)).join('\n');
    const decode = vi.spyOn(TextDecoder.prototype, 'decode');
    try {
      expect((await readLlmAuditSummary(handle(streamed(raw, new TextEncoder().encode(raw).byteLength)))).total).toBe(5000);
      const inputs = decode.mock.calls.map(([bytes]) => bytes?.byteLength ?? 0);
      expect(inputs.length).toBeGreaterThan(1);
      expect(Math.max(...inputs)).toBeLessThanOrEqual(64 * 1024);
    } finally { decode.mockRestore(); }
  });

  it('drops unsupported large fields while preserving the final typed record', async () => {
    const raw = JSON.stringify({ v: 1, at: 'now', provider: 'local', response: 'x'.repeat(100000), tools: [], scope: { nodes: ['elements/a'] } });
    expect(await readLlmAuditSummary(handle(streamed(raw, 65536)))).toEqual({ total: 1, entries: parseLlmAuditLog(raw) });
  });
});
