import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_WINDOW_MS, useHeldValue } from '@/shared/lib/use-presence';
import { Surface } from './surface';

/** What `Surface` remembers for every caller, pinned so a refactor cannot drop it silently. */
describe('Surface', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders nothing while closed', () => {
    render(<Surface open={false}>내용</Surface>);
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('stays on screen through the exit window after open=false', () => {
    // Unmounting at once would make the pressed surface vanish in one frame.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('exits with its own class instead of reversing the entrance class', () => {
    // An unchanged `animation-name` never restarts, so a reversed entrance is a hard cut.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toHaveClass('topology-chrome-in');

    act(() => rerender(<Surface open={false}>내용</Surface>));
    const el = screen.getByText('내용');
    expect(el).toHaveClass('topology-chrome-out');
    expect(el, 'a leftover entrance class overlaps the two animations').not.toHaveClass(
      'topology-chrome-in',
    );
  });

  it('makes the exiting frame inert and unclickable', () => {
    // Otherwise the exiting surface swallows a click meant for what is under it.
    const { rerender } = render(<Surface open>내용</Surface>);
    const entered = screen.getByText('내용');
    expect(entered).not.toHaveAttribute('inert');
    expect(entered).not.toHaveClass('pointer-events-none');

    act(() => rerender(<Surface open={false}>내용</Surface>));
    const exiting = screen.getByText('내용');
    expect(exiting).toHaveAttribute('inert');
    expect(exiting).toHaveClass('pointer-events-none');
  });

  it('exposes its state through data-surface-state', () => {
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toHaveAttribute('data-surface-state', 'entered');
    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용')).toHaveAttribute('data-surface-state', 'exiting');
  });

  it('calls onExited once after the exit finishes', () => {
    const onExited = vi.fn();
    const { rerender } = render(
      <Surface open onExited={onExited}>
        내용
      </Surface>,
    );
    act(() => rerender(
      <Surface open={false} onExited={onExited}>
        내용
      </Surface>,
    ));
    expect(onExited, 'calling during the exit moves focus mid-animation').not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('grows from the trigger side through transform-origin', () => {
    // A popover born away from its trigger breaks the causal link.
    render(
      <Surface open origin="top right">
        내용
      </Surface>,
    );
    expect(screen.getByText('내용')).toHaveStyle({ transformOrigin: 'top right' });
  });

  it('passes data attributes through', () => {
    /*
     * TypeScript does not check hyphenated JSX attributes, so only this assertion
     * catches `Surface` dropping them.
     */
    render(
      <Surface open data-testid="the-surface">
        내용
      </Surface>,
    );
    expect(screen.getByTestId('the-surface')).toBeInTheDocument();
  });

  it('fades a large surface without movement when motion="overlay"', () => {
    /* A large surface that moves reads as the screen shaking (`.map-overlay-in`). */
    const { rerender } = render(
      <Surface open motion="overlay">
        내용
      </Surface>,
    );
    const entered = screen.getByText('내용');
    expect(entered).toHaveClass('map-overlay-in');
    expect(entered, 'moving or scaling a large surface reads as the screen shaking').not.toHaveClass(
      'topology-chrome-in',
    );

    act(() => rerender(
      <Surface open={false} motion="overlay">
        내용
      </Surface>,
    ));
    const exiting = screen.getByText('내용');
    expect(exiting).toHaveClass('map-overlay-out');
    expect(exiting).not.toHaveClass('map-overlay-in');
    expect(exiting, 'the exit-window contract holds for every motion grammar').toHaveAttribute('inert');

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('appends the consumer className', () => {
    render(
      <Surface open className="w-[300px]">
        내용
      </Surface>,
    );
    const el = screen.getByText('내용');
    expect(el).toHaveClass('w-[300px]');
    expect(el).toHaveClass('topology-chrome-in');
  });

});

describe('useHeldValue keeps content through the exit window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function Holder({ model }: { model: string | null }) {
    const held = useHeldValue(model);
    return (
      <Surface open={model !== null}>
        <span data-testid="body">{held ?? '(비어 있음)'}</span>
      </Surface>
    );
  }

  it('draws the last value through the exit window after the value goes', () => {
    // Otherwise the surface exits with empty contents.
    const { rerender } = render(<Holder model="엣지 A→B" />);
    expect(screen.getByTestId('body')).toHaveTextContent('엣지 A→B');

    act(() => rerender(<Holder model={null} />));
    expect(
      screen.getByTestId('body'),
      'emptied content turns the exiting surface into a blank box',
    ).toHaveTextContent('엣지 A→B');

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('holds an object whose identity changes every render by its key without looping', () => {
    /*
     * A consumer model rebuilt every render must not loop the holder (React #301); this passes
     * a fresh object each render.
     */
    function Unstable({ id }: { id: string | null }) {
      const model = id ? { id, label: `모델 ${id}` } : null; // a new object every render
      const held = useHeldValue(model, id);
      return (
        <Surface open={id !== null}>
          <span data-testid="body">{held?.label ?? '(비어 있음)'}</span>
        </Surface>
      );
    }
    const { rerender } = render(<Unstable id="a" />);
    // Re-rendering with the same id must not loop.
    act(() => rerender(<Unstable id="a" />));
    act(() => rerender(<Unstable id="a" />));
    expect(screen.getByTestId('body')).toHaveTextContent('모델 a');

    act(() => rerender(<Unstable id={null} />));
    expect(screen.getByTestId('body')).toHaveTextContent('모델 a');
    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('switches to a new value immediately', () => {
    const { rerender } = render(<Holder model="첫째" />);
    act(() => rerender(<Holder model="둘째" />));
    expect(screen.getByTestId('body')).toHaveTextContent('둘째');
  });

  it('never renders an empty frame while the value changes', () => {
    // Holding the value in an effect would pass null for one frame; adjusting during render
    // avoids that frame.
    const { rerender } = render(<Holder model="A" />);
    act(() => rerender(<Holder model={null} />));
    act(() => rerender(<Holder model="B" />));
    expect(screen.getByTestId('body')).toHaveTextContent('B');
  });
});
