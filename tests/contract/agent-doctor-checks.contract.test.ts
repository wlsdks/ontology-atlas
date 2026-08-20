import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * 연동 점검 — **Rust 가 돌려주는 검사와 화면이 아는 문구가 같아야 한다.**
 *
 * 이 자리의 실패 모양은 조용하다. Rust 에 검사를 하나 더하고 문구를 안 넣으면
 * 화면에는 **빈 줄 하나**가 생기고, 아무 에러도 안 난다. 반대로 검사를 지우고
 * 문구를 남기면 죽은 문구가 번역까지 되어 남는다. 둘 다 다음 사람이 못 본다.
 *
 * 그리고 **고칠 수 있다고 말해 놓고 누르면 아무 일도 안 나는 것**이 이 기능에서
 * 가장 나쁜 결함이다. 화면은 사실을 말했다고 믿게 되고, 사용자는 두 번 속는다.
 * 그래서 `REPAIRABLE_IDS` 가 `CHECK_IDS` 의 부분집합인지도 여기서 본다.
 */

const DOCTOR_RS = readFileSync(join(process.cwd(), 'src-tauri', 'src', 'acp_doctor.rs'), 'utf8');

/** `pub(crate) const <NAME>: &[&str] = &[ "a", "b" ];` 에서 문자열만 뽑는다. */
function constList(name: string): string[] {
  const block = new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`, 's').exec(DOCTOR_RS);
  if (!block) throw new Error(`${name} 를 acp_doctor.rs 에서 못 찾았다`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const CHECK_IDS = constList('CHECK_IDS');
const REPAIRABLE_IDS = constList('REPAIRABLE_IDS');

const locales = { ko, en } as const;

describe('연동 점검 — 검사와 문구', () => {
  it('놀고 있지 않다 — 검사 목록을 실제로 읽었다', () => {
    // 정규식이 빗나가면 아래 검사들이 빈 배열로 전부 통과한다.
    expect(CHECK_IDS.length, 'CHECK_IDS 를 하나도 못 읽었다').toBeGreaterThanOrEqual(5);
    expect(REPAIRABLE_IDS.length).toBeGreaterThanOrEqual(1);
    expect(CHECK_IDS).toContain('login');
  });

  it('고칠 수 있다고 등재한 것은 전부 검사 목록 안에 있다', () => {
    for (const id of REPAIRABLE_IDS) {
      expect(CHECK_IDS, `고칠 수 있다는데 검사 목록에 없다: ${id}`).toContain(id);
    }
  });

  for (const [tag, messages] of Object.entries(locales)) {
    const doctor = (messages as { acpChat: { doctor: Record<string, unknown> } }).acpChat.doctor;
    const checkCopy = doctor.check as Record<string, string>;

    it(`${tag}: 검사마다 문구가 있다`, () => {
      for (const id of CHECK_IDS) {
        expect(checkCopy[id], `${id} 의 문구가 없다 — 화면에 빈 줄이 생긴다`).toBeTruthy();
      }
    });

    it(`${tag}: 죽은 문구가 남아 있지 않다`, () => {
      for (const id of Object.keys(checkCopy)) {
        expect(CHECK_IDS, `${id} 문구가 가리키는 검사가 없다`).toContain(id);
      }
    });

    it(`${tag}: 상태 셋을 모두 말할 수 있다`, () => {
      const state = doctor.state as Record<string, string>;
      // `unknown` 이 빠지면 화면이 「모른다」를 그릴 말이 없어서 초록이나
      // 빨강 중 하나로 뭉개게 된다. 그게 이 저장소가 실행기 배지에서 이미
      // 한 번 고친 결함이다.
      for (const key of ['ok', 'problem', 'unknown']) {
        expect(state[key], `state.${key} 가 없다`).toBeTruthy();
      }
    });

    it(`${tag}: 버튼 문구가 있다`, () => {
      for (const key of ['scan', 'scanning', 'fix', 'fixing', 'failed']) {
        expect(doctor[key], `${key} 가 없다`).toBeTruthy();
      }
    });
  }
});
