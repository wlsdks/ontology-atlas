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
import { parseLlmAuditLog } from '@/shared/lib/llm-connection/llm-audit-log';

const FIXTURE = join(__dirname, '../../fixtures/llm-audit-log.sample.jsonl');

describe('llm-audit.jsonl contract (Rust writer to web reader)', () => {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const entries = parseLlmAuditLog(raw);

  it('the screen reads the completion line the writer wrote as the same fact', () => {
    // Ten lines; each long run's start line folds into its closing line.
    expect(entries).toHaveLength(8);
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
      embed: null,
      download: null,
    });
  });

  it('an agent round-trip line also says what was looked at and what was asked', () => {
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

  it('the reservation line just before sending (no result field) is read as unknown', () => {
    // This line is the evidence that the record was written before sending, and it is
    // what remains in the file if the process dies before the response.
    expect(entries[1].outcome).toBe('unknown');
    expect(entries[1].httpStatus).toBeNull();
    // The reservation line knows its destination too — the destination is settled
    // **before** sending, so "where it went" survives even when no response arrives.
    expect(entries[1].host).toBe('api.anthropic.com');
  });

  it('a line from the era before host existed is read as it is, since records are not fixed retroactively', () => {
    // Charter ⑤. `host` is additive, so `v` stays 1 and lines already sitting on a
    // user's disk are untouched. The parser reports absence as null; it never invents a
    // destination from the provider name.
    expect(entries[2].provider).toBe('openai');
    expect(entries[2].host).toBeNull();
    expect(entries[2].outcome).toBe('ok');
  });

  it('refusal status codes that differ per vendor are read in the same result vocabulary', () => {
    // Gemini returns 400 for a wrong key; the status is kept verbatim but the outcome is `denied`
    // regardless of vendor.
    expect(entries[3].provider).toBe('gemini');
    expect(entries[3].host).toBe('generativelanguage.googleapis.com');
    expect(entries[3].outcome).toBe('denied');
    expect(entries[3].httpStatus).toBe(400);
  });

  it('a search-by-meaning run reads as one closed transfer with what it sent', () => {
    const run = entries.find((entry) => entry.purpose === 'embed-build');
    expect(run?.embed).toMatchObject({ phase: 'close', passagesSent: 2, charsSent: 10, ended: 'complete' });
    expect(run?.outcome).toBe('ok');
    expect(entries.filter((entry) => entry.purpose === 'embed-build')).toHaveLength(1);
  });

  it('a search press reads as the question that left, and nothing from the folder', () => {
    const query = entries.find((entry) => entry.purpose === 'embed-query');
    expect(query?.question).toBe('결제 재시도는 어디서 정하나요?');
    expect(query?.scope.vaultChars).toBe(0);
    expect(query?.embed).toBeNull();
  });

  it('a model download reads as its model, revision and bytes, with no folder content', () => {
    const download = entries.find((entry) => entry.purpose === 'model-download');
    expect(download?.model).toBe('bge-m3');
    expect(download?.download).toMatchObject({
      phase: 'close',
      source: 'ollama-pull',
      bytes: 1157671200,
      ended: 'complete',
    });
    expect(download?.download?.revision).toMatch(/^sha256:/);
    expect(download?.scope.vaultChars).toBe(0);
  });

  it('a start line with no closing line in view reads as not finished, not as a result', () => {
    const start = raw.split('\n').find((line) => line.includes('"phase":"start"'));
    const [entry] = parseLlmAuditLog(start ?? '');
    expect(entry.outcome).toBe('open');
  });

  it('no line of the fixture carries a response body', () => {
    // Charter ④ — the audit log records what went out and how much, not the conversation.
    for (const line of raw.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed)).not.toContain('response');
      expect(Object.keys(parsed)).not.toContain('answer');
    }
  });
});
