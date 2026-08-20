import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **이벤트 이름은 두 언어가 맺은 계약이다.**
 *
 * Rust 가 `app.emit(<이름>, payload)` 로 내고 화면이 `listen(<이름>)` 으로 듣는다.
 * 그런데 그 문자열은 **양쪽에 각각 적혀 있다** — 한쪽만 고치면 컴파일도 되고
 * 린트도 통과하고 테스트도 다 녹색인데, 설치 진행률만 **영영 안 뜬다.** 에러가
 * 하나도 안 나는 종류의 실패다.
 *
 * 페이로드의 키 이름은 Rust 쪽 단위 시험이 잠근다(`acp_install_progress_tests`).
 * 여기서 잠그는 것은 **이름**이다.
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

/** `const ACP_INSTALL_PROGRESS_EVENT: &str = "…";` 에서 값만 꺼낸다. */
function rustEventName(): string {
  const source = read('src-tauri/src/lib.rs');
  const match = /const ACP_INSTALL_PROGRESS_EVENT: &str = "([^"]+)"/.exec(source);
  if (!match) throw new Error('Rust 쪽 이벤트 이름 상수를 못 찾았다 — 이름이 바뀌었나?');
  return match[1];
}

/** 화면이 실제로 듣는 이름. `listen<AcpInstallProgress>('…')`. */
function screenEventName(): string {
  const source = read('src/features/acp-doctor/model/acp-doctor.ts');
  const match = /listen<AcpInstallProgress>\(\s*'([^']+)'/.exec(source);
  if (!match) throw new Error('화면 쪽 listen 호출을 못 찾았다 — 배선이 바뀌었나?');
  return match[1];
}

describe('설치 진행 이벤트 — 이름 계약', () => {
  it('Rust 가 내는 이름과 화면이 듣는 이름이 같다', () => {
    expect(screenEventName()).toBe(rustEventName());
  });

  it('검사기가 헛돌고 있지 않다 — 양쪽에서 실제로 값을 읽어 왔다', () => {
    // 두 추출기가 모두 `null` 을 돌려주면 위 시험은 「같다」로 통과해 버린다.
    // 그러면 이 계약은 아무것도 안 지키는 검사가 된다.
    const name = rustEventName();
    expect(name).toMatch(/^acp-install:\/\//);
    expect(screenEventName()).toMatch(/^acp-install:\/\//);
  });
});
