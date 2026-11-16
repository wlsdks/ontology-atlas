import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import { PLANNING_ARRIVAL, PLANNING_WAITS_PER_COMPARE, planningAfterLoop, planningOnEngage, PlanningSourceArtwork, type PlanningMoru } from './PlanningSourceArtwork';

const clipsAfter = (start: PlanningMoru, loops: number) => {
  const clips = [start.clip];
  let moru = start;
  for (let loop = 0; loop < loops; loop += 1) {
    moru = planningAfterLoop(moru);
    clips.push(moru.clip);
  }
  return clips;
};

describe('planning stage scene', () => {
  it('opens the folder once, then rests and looks across after every few waiting loops', () => {
    const waits = Array<'waiting'>(PLANNING_WAITS_PER_COMPARE).fill('waiting');
    expect(clipsAfter(PLANNING_ARRIVAL, 2 * (PLANNING_WAITS_PER_COMPARE + 1))).toEqual(['folder-open', ...waits, 'compare', ...waits, 'compare']);
  });

  it('hops at once when the button is reached while Moru rests, and after the clip otherwise', () => {
    const resting: PlanningMoru = { clip: 'waiting', waits: 1, hopOwed: false };
    expect(planningOnEngage(resting, true).clip).toBe('hop');

    const owed = planningOnEngage(PLANNING_ARRIVAL, false);
    expect(owed.clip).toBe('folder-open');
    expect(clipsAfter(owed, 2)).toEqual(['folder-open', 'hop', 'waiting']);
  });

  it('draws a settled scene with a held pose and no loop under reduced motion', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <PlanningSourceArtwork arriving={false} engaged={false} reduced />
      </NextIntlClientProvider>,
    );
    const scene = container.querySelector('[data-planning-folder-scene]')!;
    expect(scene).toHaveAttribute('data-scene-motion', 'paused');
    expect(scene.querySelector('[data-testid="brand-waiting-mark"]')).toHaveAttribute('data-waiting-motion', 'still');
    expect(scene.querySelector('.planning-sheet-drift')).toBeNull();
    expect(scene).toHaveTextContent(en.planning.scene.documentHeading);
  });
});
