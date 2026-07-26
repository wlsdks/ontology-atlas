import { describe, expect, it } from 'vitest';
import { parseLlmAuditLog } from './llm-audit-log';

const VERIFY_LINE =
  '{"v":1,"at":"2026-07-26T09:12:33.120Z","provider":"anthropic","model":null,"purpose":"verify","question":null,"scope":{"nodes":[],"promptChars":0,"vaultChars":0},"payloadSha256":"e3b0","outcome":"ok","httpStatus":200,"responseChars":42,"durationMs":640}';

describe('llm audit log parser', () => {
  it('reads a completed call as typed facts', () => {
    const [entry] = parseLlmAuditLog(VERIFY_LINE);
    expect(entry.provider).toBe('anthropic');
    expect(entry.purpose).toBe('verify');
    expect(entry.outcome).toBe('ok');
    expect(entry.httpStatus).toBe(200);
    // 연결 확인의 약속: 볼트에서 나간 글자 0.
    expect(entry.scope).toEqual({ nodes: [], promptChars: 0, vaultChars: 0 });
  });

  it('reads a crash residue line as unknown instead of inventing an outcome', () => {
    // 전송 직전 예약된 줄은 결과 필드가 없다. 성공으로도 실패로도 읽지 않는다.
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
    // S4(볼트 질문)가 붙으면 purpose 값이 늘어난다 — 스키마 v 는 그대로다.
    const ask = VERIFY_LINE.replace('"purpose":"verify"', '"purpose":"ask"').replace(
      '"question":null',
      '"question":"결제 모듈 바꾸면 뭐가 깨져?"',
    );
    const [entry] = parseLlmAuditLog(ask);
    expect(entry.purpose).toBe('ask');
    expect(entry.question).toBe('결제 모듈 바꾸면 뭐가 깨져?');
  });

  it('never surfaces a response body — the schema has no field for it', () => {
    const [entry] = parseLlmAuditLog(VERIFY_LINE);
    expect(Object.keys(entry)).not.toContain('response');
    expect(entry.responseChars).toBe(42);
  });
});
