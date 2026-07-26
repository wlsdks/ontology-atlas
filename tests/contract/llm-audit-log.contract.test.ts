// #80 S2 — 감사 로그 writer(Rust) ↔ reader(웹) drift 차단.
//
// writer 는 `src-tauri/src/llm_audit.rs`(Rust)라 같은 프로세스에서 import 할 수
// 없다. 대신 **양쪽이 같은 픽스처 파일을 본다**: Rust 쪽
// `writer_matches_the_shared_reader_fixture` 가 "내가 쓰는 줄 == 이 픽스처"를
// 증명하고, 이 테스트가 "이 픽스처 == 화면이 읽는 사실"을 증명한다. 둘 중 한
// 쪽만 바꾸면 반대편이 즉시 깨진다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLlmAuditLog } from '@/shared/lib/llm-audit-log';

const FIXTURE = join(__dirname, '../fixtures/llm-audit-log.sample.jsonl');

describe('llm-audit.jsonl 계약 (Rust writer ↔ web reader)', () => {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const entries = parseLlmAuditLog(raw);

  it('writer 가 쓴 완료 줄을 화면이 같은 사실로 읽는다', () => {
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      v: 1,
      at: '2026-07-26T09:12:33.120Z',
      provider: 'anthropic',
      model: null,
      purpose: 'verify',
      question: null,
      scope: { nodes: [], promptChars: 0, vaultChars: 0 },
      payloadSha256:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      outcome: 'ok',
      httpStatus: 200,
      responseChars: 42,
      durationMs: 640,
    });
  });

  it('전송 직전 예약 줄(결과 필드 없음)은 unknown 으로 읽힌다', () => {
    // 이 줄은 "보내기 전에 기록했다" 의 물증이자, 응답 전에 프로세스가 죽었을
    // 때 파일에 남는 모습이다.
    expect(entries[1].outcome).toBe('unknown');
    expect(entries[1].httpStatus).toBeNull();
  });

  it('픽스처의 모든 줄이 응답 본문을 담지 않는다', () => {
    // 헌장 ④ — 감사 로그는 "무엇이 얼마나 나갔나" 이지 대화 저장소가 아니다.
    for (const line of raw.split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed)).not.toContain('response');
      expect(Object.keys(parsed)).not.toContain('answer');
    }
  });
});
