import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import {
  AUTOMATION_SCENE_START,
  automationScene,
  AutomationScheduleArtwork,
  REVIEW_TRAY_LIMIT,
  type AutomationScene,
  type AutomationSceneEvent,
} from './AutomationScheduleArtwork';

const play = (events: readonly AutomationSceneEvent[], start = AUTOMATION_SCENE_START) => {
  const scenes: AutomationScene[] = [];
  let scene = start;
  for (const event of events) {
    scene = automationScene(scene, event);
    scenes.push(scene);
  }
  return scenes;
};

const run = { type: 'run', resting: true } as const;
const loopEnd = { type: 'loop-end' } as const;

function renderArtwork(reduced: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AutomationScheduleArtwork arriving={false} engaged={false} reduced={reduced} paused={false} name="e.g. Ontology check" cadence="Every 6 hours" />
    </NextIntlClientProvider>,
  );
}

describe('automations stage scene', () => {
  it('reads once per turn of the hand and leaves one proposal in the tray when the read ends', () => {
    const [reading, rested] = play([run, loopEnd]);
    expect(reading).toMatchObject({ clip: 'read', tray: { slips: 0 } });
    expect(rested).toMatchObject({ clip: 'waiting', tray: { slips: 1 } });
  });

  it('owes a read that arrives mid-gesture and plays it at the next neutral pose', () => {
    const [owed, reading] = play([{ type: 'run', resting: false }, loopEnd]);
    expect(owed).toMatchObject({ clip: 'waiting', readOwed: true });
    expect(reading).toMatchObject({ clip: 'read', readOwed: false });
  });

  it('looks up when the button is reached, after any read in progress', () => {
    const [looking] = play([{ type: 'engage', resting: true }]);
    expect(looking.clip).toBe('curious');
    const [reading, owed, looked, rested] = play([run, { type: 'engage', resting: false }, loopEnd, loopEnd]);
    expect([reading.clip, owed.clip, looked.clip, rested.clip]).toEqual(['read', 'read', 'curious', 'waiting']);
  });

  it('never holds more than three proposals and clears the full tray for the next round', () => {
    const cycle: readonly AutomationSceneEvent[] = [run, loopEnd, { type: 'run', resting: false }, loopEnd];
    const events = Array.from({ length: 40 }, (_, index) => cycle[index % cycle.length]!);
    const scenes = play(events);
    expect(Math.max(...scenes.map((scene) => scene.tray.slips))).toBe(REVIEW_TRAY_LIMIT);
    const full = scenes.find((scene) => scene.tray.slips === REVIEW_TRAY_LIMIT)!;
    expect(automationScene(full, { type: 'tray-cleared' }).tray).toEqual({ round: full.tray.round + 1, slips: 0 });
    expect(automationScene(full, loopEnd).tray.slips).toBeLessThanOrEqual(REVIEW_TRAY_LIMIT);
  });

  it('shows proposals only as waiting for review, with no applied or done mark', () => {
    const { container } = renderArtwork(false);
    const tray = container.querySelector('[data-automation-tray]')!;
    expect(tray).toHaveTextContent(en.automations.scene.reviewTray);
    for (const slip of container.querySelectorAll('[data-proposal-slip]')) {
      expect(slip.textContent).toBe('');
      expect(slip.querySelector('svg')).toBeNull();
    }
  });

  it('draws one waiting proposal, a still hand and a held pose under reduced motion', () => {
    const { container } = renderArtwork(true);
    expect(container.querySelector('[data-automation-hand]')).not.toHaveClass('automation-dial-hand');
    expect(container.querySelectorAll('[data-proposal-slip]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="brand-waiting-mark"]')).toHaveAttribute('data-waiting-motion', 'still');
  });
});
