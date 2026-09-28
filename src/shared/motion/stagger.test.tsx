import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MOTION, STAGGER } from './tokens';
import { STAGGER_MAX_STEPS, resetStaggerSessionForTests, staggerDelaySeconds, useStaggerOnce } from './stagger';

const WINDOW_MS = (STAGGER_MAX_STEPS * STAGGER + MOTION.base.duration) * 1000;

function List({ vaultKey = 'local:a', ids }: { vaultKey?: string; ids: readonly string[] }) {
  const item = useStaggerOnce({ vaultKey, listKey: 'rows', ids });
  return (
    <ul>
      {ids.map((id, index) => {
        const props = item(id, index);
        return (
          <li key={id} data-testid={id} className={props.className} style={props.style}>
            {id}
          </li>
        );
      })}
    </ul>
  );
}

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('useStaggerOnce', () => {
  beforeEach(() => {
    resetStaggerSessionForTests();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('caps the delay at three steps', () => {
    expect(staggerDelaySeconds(0)).toBe(0);
    expect(staggerDelaySeconds(2)).toBeCloseTo(2 * STAGGER, 6);
    expect(staggerDelaySeconds(9)).toBeCloseTo(STAGGER_MAX_STEPS * STAGGER, 6);
  });

  it('staggers the first arrival and drops the class after the window', () => {
    render(<List ids={IDS} />);
    expect(screen.getByTestId('a').className).toBe('motion-stagger-in');
    expect(screen.getByTestId('b').style.getPropertyValue('--motion-stagger-index')).toBe('1');
    expect(screen.getByTestId('e').style.getPropertyValue('--motion-stagger-index')).toBe(String(STAGGER_MAX_STEPS));
    act(() => vi.advanceTimersByTime(WINDOW_MS));
    expect(screen.getByTestId('a').className).toBe('');
  });

  it('does not replay on re-render or for ids that arrive later', () => {
    const { rerender } = render(<List ids={IDS} />);
    rerender(<List ids={[...IDS, 'f']} />);
    expect(screen.getByTestId('a').className).toBe('motion-stagger-in');
    expect(screen.getByTestId('f').className).toBe('');
  });

  it('does not replay when the list remounts inside the window or returns later', () => {
    const first = render(<List ids={IDS} />);
    first.unmount();
    const remount = render(<List ids={IDS} />);
    expect(screen.getByTestId('a').className).toBe('');
    remount.unmount();
    act(() => vi.advanceTimersByTime(WINDOW_MS * 4));
    render(<List ids={IDS} />);
    expect(screen.getByTestId('a').className).toBe('');
  });

  it('replays for another vault', () => {
    const { rerender } = render(<List ids={IDS} />);
    act(() => vi.advanceTimersByTime(WINDOW_MS));
    rerender(<List vaultKey="local:b" ids={IDS} />);
    expect(screen.getByTestId('a').className).toBe('motion-stagger-in');
  });
});
