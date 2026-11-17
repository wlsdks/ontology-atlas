import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  PROJECT_CARD_ARRIVAL,
  PROJECT_CARD_WAITS_PER_WRITE,
  projectCardAfterLoop,
  projectCardOnEngage,
  ProjectCardArtwork,
  type ProjectCardMoru,
} from './ProjectCardArtwork';

const clipsAfter = (start: ProjectCardMoru, loops: number) => {
  const clips = [start.clip];
  let moru = start;
  for (let loop = 0; loop < loops; loop += 1) {
    moru = projectCardAfterLoop(moru);
    clips.push(moru.clip);
  }
  return clips;
};

describe('project card stage scene', () => {
  it('writes the card on arrival, then rests and writes again after every few waiting loops', () => {
    const waits = Array<'waiting'>(PROJECT_CARD_WAITS_PER_WRITE).fill('waiting');
    expect(clipsAfter(PROJECT_CARD_ARRIVAL, 2 * (PROJECT_CARD_WAITS_PER_WRITE + 1))).toEqual(['write', ...waits, 'write', ...waits, 'write']);
  });

  it('writes at once when the button is reached while Moru rests, and after the waiting clip otherwise', () => {
    const resting: ProjectCardMoru = { clip: 'waiting', waits: 1, writeOwed: false };
    expect(projectCardOnEngage(resting, true).clip).toBe('write');

    const owed = projectCardOnEngage(resting, false);
    expect(owed.clip).toBe('waiting');
    expect(clipsAfter(owed, 2)).toEqual(['waiting', 'write', 'waiting']);
    expect(projectCardOnEngage(PROJECT_CARD_ARRIVAL, true), 'a write in progress is not restarted').toBe(PROJECT_CARD_ARRIVAL);
  });

  it('draws the finished card with a held pose under reduced motion', () => {
    const { container } = render(<ProjectCardArtwork arriving={false} engaged={false} reduced />);
    const scene = container.querySelector('[data-project-card-scene]')!;
    expect(scene.querySelector('[data-project-card-moru]')).toHaveAttribute('data-project-card-moru', 'still');
    expect(scene.querySelector('[data-testid="brand-waiting-mark"]')).toHaveAttribute('data-waiting-motion', 'still');
    expect(scene.querySelectorAll('[data-project-card-domain]')).toHaveLength(3);
  });
});
