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
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      v: 1,
      at: '2026-07-26T09:12:33.120Z',
      provider: 'anthropic',
      host: 'api.anthropic.com',
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
    // 예약 줄도 목적지를 안다 — 목적지는 전송 **전에** 확정되는 사실이라
    // 응답이 오지 않아도 "어디로 갔나" 가 기록에 남는다.
    expect(entries[1].host).toBe('api.anthropic.com');
  });

  it('host 가 없던 시절의 줄도 그대로 읽힌다 — 기록은 소급해 고치지 않는다', () => {
    // 헌장 ⑤. `host` 는 추가형이라 `v` 는 1 그대로고, 이미 사용자 디스크에
    // 앉아 있는 줄은 손대지 않는다. 파서는 부재를 null 로 말할 뿐 provider
    // 이름으로 목적지를 지어내지 않는다.
    expect(entries[2].provider).toBe('openai');
    expect(entries[2].host).toBeNull();
    expect(entries[2].outcome).toBe('ok');
  });

  it('벤더마다 다른 거부 상태 코드가 같은 결과 어휘로 읽힌다', () => {
    // Gemini 는 틀린 키에 400 을 준다(2026-07-26 실측). 상태 코드는 그대로
    // 남기되, 화면이 읽는 결론은 벤더와 무관하게 `denied` 하나다.
    expect(entries[3].provider).toBe('gemini');
    expect(entries[3].host).toBe('generativelanguage.googleapis.com');
    expect(entries[3].outcome).toBe('denied');
    expect(entries[3].httpStatus).toBe(400);
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
