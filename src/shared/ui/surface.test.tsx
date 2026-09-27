import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_WINDOW_MS, useHeldValue } from '@/shared/lib/use-presence';
import { Surface } from './surface';

/**
 * The contract for what `Surface` **remembers on every caller's behalf**.
 *
 * All four came out of measurements taken in this repo, which is why the primitive carries
 * them instead of each caller remembering to. They are pinned here because a contract that
 * lives only in the code and not in a test is one the next refactor deletes silently.
 */
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
    // Unmounting immediately means the surface vanishes in one frame. Measured 2026-07-28:
    // the thing the user clicked disappeared at delta 13.25 @17ms while the map — merely the
    // consequence — got a 217ms eased transition.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('exits with its own class instead of reversing the entrance class', () => {
    // A CSS animation does **not** restart while `animation-name` is unchanged, even if the
    // duration or direction changes. An exit built by playing the entrance in `reverse`
    // therefore turns into a silent hard cut.
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
    // Without this the exiting surface swallows the click, and the user gets a result they
    // did not press for.
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
    // A state nothing outside can distinguish is a state nothing outside can test — the same
    // lesson the map hooks learned.
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
    // A popover born in the centre of the screen is a rejection by the motion seat: when what
    // you pressed and what appears are in different places, the causal link is broken.
    render(
      <Surface open origin="top right">
        내용
      </Surface>,
    );
    expect(screen.getByText('내용')).toHaveStyle({ transformOrigin: 'top right' });
  });

  it('passes data attributes through', () => {
    /*
     * ⚠️ Without this assertion **the type system waves it through.** TypeScript does not
     * check hyphenated JSX attributes, so if `Surface` stopped forwarding them, `tsc` would
     * say nothing and the value would simply be dropped. That nearly happened while migrating
     * the edge panel on 2026-08-03.
     */
    render(
      <Surface open data-testid="the-surface">
        내용
      </Surface>,
    );
    expect(screen.getByTestId('the-surface')).toBeInTheDocument();
  });

  it('fades a large surface without movement when motion="overlay"', () => {
    /*
     * The `.map-overlay-in` comment in `globals.css` states the reason: **when a surface
     * covering a large part of the screen moves, it reads as the screen itself shaking.**
     * Because that vocabulary was missing from the primitive, the full-detail view attached
     * `map-overlay-in` by hand and had nothing for the exit, and the full-width drawer and
     * scrim modal had nothing at all.
     */
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
    // Without this the surface exits gracefully while its contents are empty — the entrance
    // and exit that were meant to improve things make the screen worse.
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
     * The first version compared with `value !== held`, and the moment it was attached to the
     * map's edge panel **React #301 (infinite re-render) took the whole map down**: the
     * consumer's model came from `useMemo` but its identity was rebuilt on every render. This
     * test reproduces that shape exactly, passing a fresh object each render.
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
    // Re-rendering repeatedly with the same id must not loop — it would blow up right here.
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
    // Holding the value in an effect would be one frame late, and the child would receive null
    // in between. Adjusting during render means that frame never exists.
    const { rerender } = render(<Holder model="A" />);
    act(() => rerender(<Holder model={null} />));
    act(() => rerender(<Holder model="B" />));
    expect(screen.getByTestId('body')).toHaveTextContent('B');
  });
});
