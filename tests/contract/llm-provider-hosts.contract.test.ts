// 명명 벤더의 목적지 — Rust(전송) ↔ 웹(화면 문구) drift 차단.
//
// 화면은 사용자가 [연결 확인]을 누르기 **전에** "이 요청이 어디로 가는가" 를
// 호스트 이름으로 말한다. 그 문장이 실제 목적지와 다르면 그건 오탈자가 아니라
// 거짓 보안 주장이다(신뢰 헌장 ⑥ — 우리가 증명할 수 있는 만큼만 말한다).
//
// 진실원은 `src-tauri/src/llm.rs` 의 확인 URL 이라 같은 프로세스에서 import 할
// 수 없다. 그래서 감사 로그와 같은 패턴을 쓴다: **양쪽이 같은 픽스처를 본다.**
// Rust 쪽 `the_hosts_match_the_shared_fixture_the_screen_promises` 가 "내가
// 실제로 부르는 호스트 == 이 픽스처" 를 증명하고, 이 테스트가 "이 픽스처 ==
// 화면이 약속하는 호스트" 를 증명한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SECRET_PROVIDERS,
  SECRET_PROVIDER_HOSTS,
} from '@/shared/lib/tauri-secrets';

const FIXTURE = join(__dirname, '../fixtures/llm-provider-hosts.json');

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as {
  hosts: Record<string, string>;
};

describe('명명 벤더 목적지 계약 (Rust 전송 ↔ 웹 문구)', () => {
  it('화면이 약속하는 호스트가 Rust 가 실제로 부르는 호스트와 같다', () => {
    expect(SECRET_PROVIDER_HOSTS).toEqual(fixture.hosts);
  });

  it('허용된 벤더 전부가 목적지를 밝힌다 — 말없이 나가는 벤더가 없다', () => {
    expect([...SECRET_PROVIDERS].sort()).toEqual(Object.keys(fixture.hosts).sort());
  });

  it('명명 벤더는 3에서 동결돼 있다', () => {
    // 4번째는 "Bearer 호환으로 흡수 불가 + 수요 증거" 둘 다일 때만이다.
    // 근거 전문은 `src-tauri/src/secrets.rs` 의 PROVIDERS 주석.
    expect(SECRET_PROVIDERS).toHaveLength(3);
  });
});
