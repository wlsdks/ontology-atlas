import { describe, expect, it } from 'vitest';

import { ENTRY_IDLE, ENTRY_NEUTRAL_FRAME, ENTRY_REACTION, ENTRY_START, requestReaction, stepEntry, type EntryState } from './moru-entry';

const total = (durations: number[]) => durations.reduce((a, b) => a + b, 0);

function run(state: EntryState, ms: number, dt = 16) {
  let current = state;
  let frame = ENTRY_NEUTRAL_FRAME;
  for (let t = 0; t < ms; t += dt) ({ state: current, frame } = stepEntry(current, dt));
  return { state: current, frame };
}

describe("the hero's tiny Moru", () => {
  it('starts the hop at once from a neutral rest', () => {
    const asked = requestReaction(ENTRY_START);
    const { state, frame } = stepEntry(asked, 16);
    expect(state.idle).toBe(-1);
    expect(frame).toBe(ENTRY_REACTION.frames[0]);
  });

  it('waves once, then blinks', () => {
    const [wave, blink] = ENTRY_IDLE;
    expect(run(ENTRY_START, total(wave.durations) + 100).state.idle).toBe(1);
    expect(run({ idle: 1, elapsed: 0, wants: false }, total(blink.durations) + 100).state.idle).toBe(1);
  });

  it('lets a blink finish before hopping, so no pose is skipped', () => {
    const blink = ENTRY_IDLE[1];
    const midBlink: EntryState = { idle: 1, elapsed: blink.durations[0] + 100, wants: false };
    const asked = requestReaction(midBlink);
    const during = stepEntry(asked, 16);
    expect(during.state.idle).toBe(1);
    expect(blink.frames).toContain(during.frame);
    const after = run(asked, total(blink.durations) - midBlink.elapsed);
    expect(after.state.idle).toBe(-1);
  });

  it('never restarts a hop that is playing, then returns to the idle loop', () => {
    const hopping = run(requestReaction(ENTRY_START), 400).state;
    expect(requestReaction(hopping)).toBe(hopping);
    const settled = run(hopping, total(ENTRY_REACTION.durations));
    expect(settled.state.idle).toBe(1);
  });
});
