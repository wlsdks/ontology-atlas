import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GATED_SESSION_MODE } from '@/features/acp-session/model/runtime-wiring/runtime-gate';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

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

const DOCTOR_RS = readFileSync(join(process.cwd(), 'src-tauri', 'src', 'acp', 'doctor.rs'), 'utf8');

/** Pulls just the strings out of `pub(crate) const <NAME>: &[&str] = &[ "a", "b" ];`. */
function constList(name: string): string[] {
  const block = new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(DOCTOR_RS);
  if (!block) throw new Error(`could not find ${name} in acp/doctor.rs`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const CHECK_IDS = constList('CHECK_IDS');
const REPAIRABLE_IDS = constList('REPAIRABLE_IDS');

/** Launcher ids and exact modes from Rust's measured session-mode table. */
const RUST_SESSION_MODE_GATE = [
  ...(/const SESSION_MODE_GATE: &\[\(&str, &str\)\] = &\[([^\]]*)\]/
    .exec(DOCTOR_RS)?.[1] ?? '')
    .matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g),
].map((m) => [m[1], m[2]] as const);

const locales = { ko, en } as const;

describe('integration check — checks and copy', () => {
  it('does not idle — it really read the check list', () => {
    // If the regex misses, every check below passes on an empty array.
    expect(CHECK_IDS.length, 'could not read a single CHECK_ID').toBeGreaterThanOrEqual(5);
    expect(REPAIRABLE_IDS.length).toBeGreaterThanOrEqual(1);
    expect(CHECK_IDS).toContain('login');
  });

  it('everything registered as fixable is in the check list', () => {
    for (const id of REPAIRABLE_IDS) {
      expect(CHECK_IDS, `registered as fixable but not in the check list: ${id}`).toContain(id);
    }
  });

  /**
   * **There are two gate tables and they must not diverge.**
   *
   * The screen opens the session (`GATED_SESSION_MODE`) while Rust diagnoses it. If
   * they disagree, the doctor reports "no gate" while the screen opens a
   * conversation, or the reverse. Both are lies the user cannot detect.
   */
  it('the session-mode gate table is the same on screen and in Rust', () => {
    expect(DOCTOR_RS).toMatch(/const SESSION_MODE_GATE: &\[\(&str, &str\)\] = &\[[^\]]*\];/);
    expect(Object.fromEntries(RUST_SESSION_MODE_GATE)).toEqual(GATED_SESSION_MODE);
    expect(RUST_SESSION_MODE_GATE).toEqual([['codex-acp', 'read-only']]);
  });

  for (const [tag, messages] of Object.entries(locales)) {
    const doctor = (messages as { acpChat: { doctor: Record<string, unknown> } }).acpChat.doctor;
    const checkCopy = doctor.check as Record<string, string>;

    it(`${tag}: every check has copy`, () => {
      for (const id of CHECK_IDS) {
        expect(checkCopy[id], `no copy for ${id} — the screen gets a blank line`).toBeTruthy();
      }
    });

    it(`${tag}: no dead copy remains`, () => {
      for (const id of Object.keys(checkCopy)) {
        expect(CHECK_IDS, `the check that the copy of ${id} points at does not exist`).toContain(id);
      }
    });

    it(`${tag}: can speak all three states`, () => {
      const state = doctor.state as Record<string, string>;
      // Without `unknown` the screen has no wording for "we don't know" and collapses
      // it into either green or red. That is the defect this repository already fixed
      // once on the launcher badge.
      for (const key of ['ok', 'problem', 'unknown']) {
        expect(state[key], `state.${key} is missing`).toBeTruthy();
      }
    });

    /**
     * **A problem the app cannot fix must state what the person should do.**
     *
     * The same discipline this repository set for degradation cards: saying only why
     * something does not work, without saying where to go, is a dead end.
     */
    it(`${tag}: checks the app cannot fix have a next step`, () => {
      const next = doctor.next as Record<string, string>;
      for (const id of CHECK_IDS) {
        if (REPAIRABLE_IDS.includes(id)) continue;
        expect(next[id], `${id} cannot be fixed by the app yet no next step is written`).toBeTruthy();
      }
    });

    it(`${tag}: no dead "next step" copy`, () => {
      for (const id of Object.keys(doctor.next as Record<string, string>)) {
        expect(CHECK_IDS, `the check that the next step of ${id} points at does not exist`).toContain(id);
      }
    });

    it(`${tag}: has button copy`, () => {
      for (const key of ['scan', 'scanning', 'fix', 'fixing', 'reset', 'resetting', 'failed']) {
        expect(doctor[key], `${key} is missing`).toBeTruthy();
      }
    });
  }
});
