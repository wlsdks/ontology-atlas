import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import { setMotionPaused } from '@/shared/motion/motion-pause';

import { FeatureStage, type FeatureStageMotion } from './feature-stage';

let reduced = false;

beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  setMotionPaused(false);
  vi.unstubAllGlobals();
});

function renderStage(loops: boolean) {
  const seen: FeatureStageMotion[] = [];
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeatureStage artLoops={loops ? en.download.motion : undefined} title="Title" body="Sentence"
        art={(state) => { seen.push(state); return <span data-testid="art" />; }}
        action={<button type="button">Act</button>} />
    </NextIntlClientProvider>,
  );
  return seen;
}

describe('feature stage pause', () => {
  it('holds a looping artwork when the person pauses it, and plays it again on the second press', () => {
    const seen = renderStage(true);
    const toggle = screen.getByTestId('feature-stage-motion-toggle');
    const art = document.querySelector('[data-feature-stage-art]')!;
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent(en.download.motion.pause);
    expect(art).not.toHaveAttribute('data-motion-paused');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent(en.download.motion.play);
    expect(art).toHaveAttribute('data-motion-paused');
    expect(seen.at(-1)?.paused).toBe(true);

    fireEvent.click(toggle);
    expect(art).not.toHaveAttribute('data-motion-paused');
    expect(seen.at(-1)?.paused).toBe(false);
  });

  it('reaches the pause by keyboard after the action', () => {
    renderStage(true);
    const action = screen.getByRole('button', { name: 'Act' });
    const toggle = screen.getByTestId('feature-stage-motion-toggle');
    expect(action.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers no pause under reduced motion', () => {
    reduced = true;
    renderStage(true);
    expect(screen.queryByTestId('feature-stage-motion-toggle')).toBeNull();
  });

  it('offers no pause for an artwork that rests after it arrives', () => {
    renderStage(false);
    expect(screen.queryByTestId('feature-stage-motion-toggle')).toBeNull();
  });
});
