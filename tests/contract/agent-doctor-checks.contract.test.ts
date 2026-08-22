import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATED_SESSION_MODE } from '@/features/acp-session/model/runtime-gate';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * Connection doctor — **the checks Rust returns and the copy the screen knows
 * must match.**
 *
 * Failure here is silent. Add a check in Rust without copy and the screen gains
 * **one blank row** with no error. Delete a check but keep the copy and dead
 * strings survive, translated. Neither is visible to the next person.
 *
 * And the worst defect in this feature is **claiming something is repairable and
 * then doing nothing when pressed**: the screen is believed to have stated a
 * fact, and the user is misled twice. So this also checks that `REPAIRABLE_IDS`
 * is a subset of `CHECK_IDS`.
 */

const DOCTOR_RS = readFileSync(join(process.cwd(), 'src-tauri', 'src', 'acp_doctor.rs'), 'utf8');

/** Pulls just the strings out of `pub(crate) const <NAME>: &[&str] = &[ "a", "b" ];`. */
function constList(name: string): string[] {
  const block = new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(DOCTOR_RS);
  if (!block) throw new Error(`${name} 를 acp_doctor.rs 에서 못 찾았다`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const CHECK_IDS = constList('CHECK_IDS');
const REPAIRABLE_IDS = constList('REPAIRABLE_IDS');

/** Launcher ids from Rust's `SESSION_MODE_GATE`, shaped `&[("codex-acp", "read-only")]`. */
const RUST_SESSION_MODE_GATE = [
  ...(/const SESSION_MODE_GATE: &\[\(&str, &str\)\] = &\[([^\]]*)\]/
    .exec(DOCTOR_RS)?.[1] ?? '')
    .matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g),
].map((m) => [m[1], m[2]] as const);

const locales = { ko, en } as const;

describe('연동 점검 — 검사와 문구', () => {
  it('놀고 있지 않다 — 검사 목록을 실제로 읽었다', () => {
    // If the regex misses, every check below passes on an empty array.
    expect(CHECK_IDS.length, 'CHECK_IDS 를 하나도 못 읽었다').toBeGreaterThanOrEqual(5);
    expect(REPAIRABLE_IDS.length).toBeGreaterThanOrEqual(1);
    expect(CHECK_IDS).toContain('login');
  });

  it('고칠 수 있다고 등재한 것은 전부 검사 목록 안에 있다', () => {
    for (const id of REPAIRABLE_IDS) {
      expect(CHECK_IDS, `고칠 수 있다는데 검사 목록에 없다: ${id}`).toContain(id);
    }
  });

  /**
   * **There are two gate tables and they must not diverge.**
   *
   * The screen opens the session (`GATED_SESSION_MODE`) while Rust diagnoses it. If
   * they disagree, the doctor reports "no gate" while the screen opens a
   * conversation, or the reverse. Both are lies the user cannot detect.
   */
  it('세션 모드 관문 표가 화면과 Rust 에서 같다', () => {
    expect(RUST_SESSION_MODE_GATE.length, 'Rust 표를 하나도 못 읽었다').toBeGreaterThan(0);
    expect(Object.fromEntries(RUST_SESSION_MODE_GATE)).toEqual(GATED_SESSION_MODE);
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
      // Without `unknown` the screen has no wording for "we don't know" and collapses
      // it into either green or red. That is the defect this repository already fixed
      // once on the launcher badge.
      for (const key of ['ok', 'problem', 'unknown']) {
        expect(state[key], `state.${key} 가 없다`).toBeTruthy();
      }
    });

    /**
     * **A problem the app cannot fix must state what the person should do.**
     *
     * The same discipline this repository set for degradation cards: saying only why
     * something does not work, without saying where to go, is a dead end.
     */
    it(`${tag}: 앱이 못 고치는 검사에는 다음 할 일이 있다`, () => {
      const next = doctor.next as Record<string, string>;
      for (const id of CHECK_IDS) {
        if (REPAIRABLE_IDS.includes(id)) continue;
        expect(next[id], `${id} 는 앱이 못 고치는데 할 일이 안 적혀 있다`).toBeTruthy();
      }
    });

    it(`${tag}: 죽은 「할 일」 문구가 없다`, () => {
      for (const id of Object.keys(doctor.next as Record<string, string>)) {
        expect(CHECK_IDS, `${id} 의 할 일이 가리키는 검사가 없다`).toContain(id);
      }
    });

    it(`${tag}: 버튼 문구가 있다`, () => {
      for (const key of ['scan', 'scanning', 'fix', 'fixing', 'reset', 'resetting', 'failed']) {
        expect(doctor[key], `${key} 가 없다`).toBeTruthy();
      }
    });
  }
});
