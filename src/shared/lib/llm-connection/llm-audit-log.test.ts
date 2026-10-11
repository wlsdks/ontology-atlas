import { describe, expect, it } from 'vitest';
import { parseLlmAuditLog } from './llm-audit-log';

const VERIFY_LINE =
  '{"v":1,"at":"2026-07-26T09:12:33.120Z","provider":"anthropic","host":"api.anthropic.com","model":null,"purpose":"verify","question":null,"scope":{"nodes":[],"promptChars":0,"vaultChars":0},"payloadSha256":"e3b0","outcome":"ok","httpStatus":200,"responseChars":42,"durationMs":640}';

describe('llm audit log parser', () => {
  it('reads a completed call as typed facts', () => {
    const [entry] = parseLlmAuditLog(VERIFY_LINE);
    expect(entry.provider).toBe('anthropic');
    expect(entry.host).toBe('api.anthropic.com');
    expect(entry.purpose).toBe('verify');
    expect(entry.outcome).toBe('ok');
    expect(entry.httpStatus).toBe(200);
    // The promise of a connection check: 0 characters left the vault.
    expect(entry.scope).toEqual({ nodes: [], promptChars: 0, vaultChars: 0 });
  });

  it('reads a crash residue line as unknown instead of inventing an outcome', () => {
    // A line reserved just before sending has no outcome fields; it is read as neither success nor failure.
    const pending =
      '{"v":1,"at":"2026-07-26T09:12:33.120Z","provider":"openai","model":null,"purpose":"verify","question":null,"scope":{"nodes":[],"promptChars":0,"vaultChars":0},"payloadSha256":"e3b0"}';
    const [entry] = parseLlmAuditLog(pending);
    expect(entry.outcome).toBe('unknown');
    expect(entry.httpStatus).toBeNull();
    expect(entry.responseChars).toBeNull();
    expect(entry.durationMs).toBeNull();
  });

  it('skips broken lines instead of failing the whole tail', () => {
    const raw = ['{ not json', VERIFY_LINE, '', '{"v":2,"at":"x"}'].join('\n');
    expect(parseLlmAuditLog(raw)).toHaveLength(1);
  });

  it('keeps the most recent entries when a limit is given', () => {
    const raw = Array.from({ length: 5 }, (_, index) =>
      VERIFY_LINE.replace('"durationMs":640', `"durationMs":${index}`),
    ).join('\n');
    const entries = parseLlmAuditLog(raw, { limit: 2 });
    expect(entries.map((entry) => entry.durationMs)).toEqual([3, 4]);
  });

  it('tolerates a future purpose without losing the row', () => {
    // Vault questions add another `purpose` value — the schema `v` stays the same.
    const ask = VERIFY_LINE.replace('"purpose":"verify"', '"purpose":"ask"').replace(
      '"question":null',
      '"question":"결제 모듈 바꾸면 뭐가 깨져?"',
    );
    const [entry] = parseLlmAuditLog(ask);
    expect(entry.purpose).toBe('ask');
    expect(entry.question).toBe('결제 모듈 바꾸면 뭐가 깨져?');
  });

  it('reads a line written before host existed without inventing a destination', () => {
    // `host` was an additive extension, so old lines remain as they were
    // (charter clause ⑤ — records are never rewritten retroactively). An unknown
    // destination is reported as unknown: guessing it from the provider name
    // would make the audit log quietly lie.
    const legacy = VERIFY_LINE.replace('"host":"api.anthropic.com",', '');
    const [entry] = parseLlmAuditLog(legacy);
    expect(entry.host).toBeNull();
    expect(entry.provider).toBe('anthropic');
    expect(entry.outcome).toBe('ok');
  });

  it('never surfaces a response body — the schema has no field for it', () => {
    const [entry] = parseLlmAuditLog(VERIFY_LINE);
    expect(Object.keys(entry)).not.toContain('response');
    expect(entry.responseChars).toBe(42);
  });
});
