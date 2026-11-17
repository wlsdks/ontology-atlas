import { describe, expect, it } from 'vitest';

import { ENTRY_IDLE, ENTRY_REACTION, ENTRY_START, requestReaction, stepEntry, type EntryState } from './moru-entry';

const total = (durations: number[]) => durations.reduce((a, b) => a + b, 0);

function run(state: EntryState, ms: number, dt = 16) {
  let current = state;
  for (let t = 0; t < ms; t += dt) current = stepEntry(current, dt).state;
  return { state: current };
}

describe("the hero's tiny Moru", () => {
  it('starts the dance at once from a neutral rest', () => {
    const asked = requestReaction(ENTRY_START);
    const { state, pose } = stepEntry(asked, 16);
    expect(state.idle).toBe(-1);
    expect(pose).toEqual({ row: ENTRY_REACTION.row, cell: 0 });
  });

  it('waves once, then blinks', () => {
    const [wave, blink] = ENTRY_IDLE;
    expect(run(ENTRY_START, total(wave.durations) + 100).state.idle).toBe(1);
    expect(run({ idle: 1, elapsed: 0, wants: false }, total(blink.durations) + 100).state.idle).toBe(1);
  });

  it('lets a blink finish before dancing, so no pose is skipped', () => {
    const blink = ENTRY_IDLE[1];
    const midBlink: EntryState = { idle: 1, elapsed: blink.durations[0] + 100, wants: false };
    const asked = requestReaction(midBlink);
    const during = stepEntry(asked, 16);
    expect(during.state.idle).toBe(1);
    expect(during.pose.row).toBe('blink');
    expect(during.pose.cell).toBeGreaterThan(0);
    const after = run(asked, total(blink.durations) - midBlink.elapsed);
    expect(after.state.idle).toBe(-1);
  });

  it('never restarts a dance that is playing, then returns to the idle loop', () => {
    const dancing = run(requestReaction(ENTRY_START), 400).state;
    expect(requestReaction(dancing)).toBe(dancing);
    const settled = run(dancing, total(ENTRY_REACTION.durations));
    expect(settled.state.idle).toBe(1);
  });
});
