import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { TurnActivity, TurnActivityKind } from '../turn-activity';
import { WORK_PLAYLIST } from './moru-playlist';
import { TurnWorkStage, type TurnWork } from './TurnWorkStage';
import type { ChatT } from './types';

let reduced = false;
const reveals: Array<(visible: boolean) => void> = [];

beforeEach(() => {
  reduced = false;
  reveals.length = 0;
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      reveals.push((visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
    }
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const t = ((key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key)) as unknown as ChatT;
const work = (kind: TurnActivityKind, turnId = 'turn-1', activity: Partial<TurnActivity> = {}): TurnWork => ({
  turnId,
  phase: 'working',
  activity: { kind, label: null, target: null, steps: 0, written: { concepts: 0, relations: 0 }, ...activity },
  plan: null,
});
const mark = () => screen.getByTestId('brand-waiting-mark');
const clip = () => mark().getAttribute('data-moru-motion');
function showMark() {
  act(() => reveals.at(-1)?.(true));
}
function endLoop() {
  showMark();
  act(() => {
    fireEvent(mark(), createEvent('animationiteration', mark()));
  });
}

it('changes the clip only when a loop ends, never on time alone', () => {
  vi.useFakeTimers();
  render(<TurnWorkStage t={t} work={work('thinking')} />);
  showMark();
  expect(clip()).toBe('think');
  act(() => vi.advanceTimersByTime(60_000));
  expect(clip()).toBe('think');
  endLoop();
  expect(clip()).toBe('pondering');
});

it('breaks into play on the third loop of one kind, then returns to work', () => {
  render(<TurnWorkStage t={t} work={work('thinking')} />);
  endLoop();
  endLoop();
  expect(mark()).toHaveAttribute('data-moru-pace', 'play');
  endLoop();
  expect(clip()).toBe('think');
});

it("restarts at the new kind's first clip when the work changes kind", () => {
  const { rerender } = render(<TurnWorkStage t={t} work={work('thinking')} />);
  endLoop();
  endLoop();
  rerender(<TurnWorkStage t={t} work={work('reading')} />);
  expect(clip()).toBe(WORK_PLAYLIST.reading[0]);
  rerender(<TurnWorkStage t={t} work={work('thinking')} />);
  expect(clip()).toBe('think');
});

it('holds one still pose under reduced motion, whatever the mark reports', () => {
  reduced = true;
  render(<TurnWorkStage t={t} work={work('thinking')} />);
  expect(mark()).toHaveAttribute('data-waiting-motion', 'still');
  act(() => {
    fireEvent(mark(), createEvent('animationiteration', mark()));
  });
  expect(clip()).toBe('think');
  expect(mark()).toHaveAttribute('data-waiting-motion', 'still');
  expect(screen.getByTestId('acp-turn-work-now')).toHaveTextContent('work.thinking');
});

it('says what the turn has written once it has written something, and only then', () => {
  const { rerender } = render(<TurnWorkStage t={t} work={work('writing', 'turn-1', { steps: 3 })} />);
  const count = () => screen.getByTestId('acp-turn-work-count');
  expect(count()).toHaveTextContent('work.steps:{"count":3}');
  expect(count()).not.toHaveTextContent('work.wrote');
  rerender(<TurnWorkStage t={t} work={work('writing', 'turn-1', { steps: 5, written: { concepts: 12, relations: 9 } })} />);
  expect(count()).toHaveTextContent('work.wrote.both:{"concepts":12,"relations":9}');
  rerender(<TurnWorkStage t={t} work={work('writing', 'turn-1', { steps: 6, written: { concepts: 0, relations: 2 } })} />);
  expect(count()).toHaveTextContent('work.wrote.relations:{"relations":2}');
});
