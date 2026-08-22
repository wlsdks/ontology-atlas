// Blocks drift between the audit log's writer (Rust) and its reader (web).
//
// The writer is `src-tauri/src/llm_audit.rs`, so it cannot be imported into the same
// process. Instead **both sides read the same fixture file**: on the Rust side
// `writer_matches_the_shared_reader_fixture` proves "the line I write == this
// fixture", and this test proves "this fixture == the facts the screen reads".
// Changing one side breaks the other immediately.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLlmAuditLog } from '@/shared/lib/llm-audit-log';

const FIXTURE = join(__dirname, '../fixtures/llm-audit-log.sample.jsonl');

describe('llm-audit.jsonl 계약 (Rust writer ↔ web reader)', () => {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const entries = parseLlmAuditLog(raw);

  it('writer 가 쓴 완료 줄을 화면이 같은 사실로 읽는다', () => {
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({
      v: 1,
      at: '2026-07-26T09:12:33.120Z',
      provider: 'anthropic',
      host: 'api.anthropic.com',
      model: null,
      purpose: 'verify',
      question: null,
      scope: { nodes: [], promptChars: 0, vaultChars: 0 },
      // A connection-check line has no `tools` field at all — it reads as null rather than
      // as an empty array asserting "0 tools used", a claim nobody made.
      tools: null,
      payloadSha256:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      outcome: 'ok',
      httpStatus: 200,
      responseChars: 42,
      durationMs: 640,
    });
  });

  it('에이전트 왕복 줄은 무엇을 보고 무엇을 물었는지까지 말한다', () => {
    const agent = entries[4];
    expect(agent.purpose).toBe('agent');
    expect(agent.model).toBe('claude-sonnet-4-5');
    expect(agent.question).toBe('이 노드에 빠진 관계 이어줘');
    expect(agent.scope.nodes).toEqual(['capabilities/payment']);
    expect(agent.scope.vaultChars).toBe(1020);
    expect(agent.tools).toEqual([
      { name: 'get_concept', target: 'capabilities/payment' },
    ]);
    // The response body is absent here too — only its length.
    expect(agent.responseChars).toBe(812);
  });

  it('전송 직전 예약 줄(결과 필드 없음)은 unknown 으로 읽힌다', () => {
    // This line is the evidence that the record was written before sending, and it is
    // what remains in the file if the process dies before the response.
    expect(entries[1].outcome).toBe('unknown');
    expect(entries[1].httpStatus).toBeNull();
    // The reservation line knows its destination too — the destination is settled
    // **before** sending, so "where it went" survives even when no response arrives.
    expect(entries[1].host).toBe('api.anthropic.com');
  });

  it('host 가 없던 시절의 줄도 그대로 읽힌다 — 기록은 소급해 고치지 않는다', () => {
    // Charter ⑤. `host` is additive, so `v` stays 1 and lines already sitting on a
    // user's disk are untouched. The parser reports absence as null; it never invents a
    // destination from the provider name.
    expect(entries[2].provider).toBe('openai');
    expect(entries[2].host).toBeNull();
    expect(entries[2].outcome).toBe('ok');
  });

  it('벤더마다 다른 거부 상태 코드가 같은 결과 어휘로 읽힌다', () => {
    // Gemini returns 400 for a wrong key (measured 2026-07-26). The status code is kept
    // verbatim, but the conclusion the screen reads is `denied` regardless of vendor.
    expect(entries[3].provider).toBe('gemini');
    expect(entries[3].host).toBe('generativelanguage.googleapis.com');
    expect(entries[3].outcome).toBe('denied');
    expect(entries[3].httpStatus).toBe(400);
  });

  it('픽스처의 모든 줄이 응답 본문을 담지 않는다', () => {
    // Charter ④ — the audit log records what went out and how much, not the conversation.
    for (const line of raw.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed)).not.toContain('response');
      expect(Object.keys(parsed)).not.toContain('answer');
    }
  });
});
