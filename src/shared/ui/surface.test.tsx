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

  it('닫혀 있으면 그리지 않는다', () => {
    render(<Surface open={false}>내용</Surface>);
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('① 퇴장 창 — `open=false` 에 즉시 사라지지 않는다', () => {
    // Unmounting immediately means the surface vanishes in one frame. Measured 2026-07-28:
    // the thing the user clicked disappeared at delta 13.25 @17ms while the map — merely the
    // consequence — got a 217ms eased transition.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용'), '퇴장 창 안에서는 아직 화면에 있어야 한다').toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('② 퇴장은 자기 이름의 클래스다 — 등장 클래스를 되감지 않는다', () => {
    // A CSS animation does **not** restart while `animation-name` is unchanged, even if the
    // duration or direction changes. An exit built by playing the entrance in `reverse`
    // therefore turns into a silent hard cut.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toHaveClass('topology-chrome-in');

    act(() => rerender(<Surface open={false}>내용</Surface>));
    const el = screen.getByText('내용');
    expect(el).toHaveClass('topology-chrome-out');
    expect(el, '등장 클래스가 남아 있으면 두 애니메이션이 겹친다').not.toHaveClass(
      'topology-chrome-in',
    );
  });

  it('③ 나가는 프레임은 못 눌린다 — inert + pointer-events-none', () => {
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

  it('④ 상태를 밖에서 읽을 수 있다 — 검사 가능한 표면', () => {
    // A state nothing outside can distinguish is a state nothing outside can test — the same
    // lesson the map hooks learned.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toHaveAttribute('data-surface-state', 'entered');
    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용')).toHaveAttribute('data-surface-state', 'exiting');
  });

  it('퇴장이 끝난 뒤에 한 번 알린다 — 포커스 복귀가 붙는 자리', () => {
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
    expect(onExited, '퇴장 «중» 에 부르면 포커스가 애니 도중에 튄다').not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it('등장이 트리거 방향에서 자란다 — transform-origin 을 받는다', () => {
    // A popover born in the centre of the screen is a rejection by the motion seat: when what
    // you pressed and what appears are in different places, the causal link is broken.
    render(
      <Surface open origin="top right">
        내용
      </Surface>,
    );
    expect(screen.getByText('내용')).toHaveStyle({ transformOrigin: 'top right' });
  });

  it('data-* 를 통과시킨다 — 밖에서 이 표면을 집을 수 있어야 한다', () => {
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

  it('⑤ 큰 표면은 밝기만 쓴다 — `motion="overlay"`', () => {
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
    expect(entered, '큰 표면에 이동/스케일 문법이 붙으면 화면이 흔들린다').not.toHaveClass(
      'topology-chrome-in',
    );

    act(() => rerender(
      <Surface open={false} motion="overlay">
        내용
      </Surface>,
    ));
    const exiting = screen.getByText('내용');
    expect(exiting, '나가는 길도 같은 문법이어야 한다').toHaveClass('map-overlay-out');
    expect(exiting).not.toHaveClass('map-overlay-in');
    expect(exiting, '퇴장 창의 계약 셋은 문법과 무관하게 산다').toHaveAttribute('inert');

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('소비처 className 이 덧붙는다 — 모양은 소비처가 정한다', () => {
    render(
      <Surface open className="w-[300px]">
        내용
      </Surface>,
    );
    const el = screen.getByText('내용');
    expect(el).toHaveClass('w-[300px]');
    expect(el, '모션 문법은 그대로 남아야 한다').toHaveClass('topology-chrome-in');
  });

});

describe('useHeldValue — 퇴장 창 동안 내용이 비지 않는다', () => {
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

  it('값이 사라져도 퇴장 창 동안 직전 값을 그린다', () => {
    // Without this the surface exits gracefully while its contents are empty — the entrance
    // and exit that were meant to improve things make the screen worse.
    const { rerender } = render(<Holder model="엣지 A→B" />);
    expect(screen.getByTestId('body')).toHaveTextContent('엣지 A→B');

    act(() => rerender(<Holder model={null} />));
    expect(
      screen.getByTestId('body'),
      '퇴장 중에 내용이 비면 사라지는 표면이 빈 상자로 보인다',
    ).toHaveTextContent('엣지 A→B');

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('★ 정체성이 매 렌더 바뀌는 객체를 키로 붙든다 — 안 그러면 무한 루프다', () => {
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
    expect(screen.getByTestId('body'), '퇴장 중에도 직전 모델을 그린다').toHaveTextContent('모델 a');
    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('새 값이 오면 즉시 바뀐다 — 붙드는 것이 갱신을 막지 않는다', () => {
    const { rerender } = render(<Holder model="첫째" />);
    act(() => rerender(<Holder model="둘째" />));
    expect(screen.getByTestId('body')).toHaveTextContent('둘째');
  });

  it('값이 바뀌는 동안 한 프레임도 비지 않는다', () => {
    // Holding the value in an effect would be one frame late, and the child would receive null
    // in between. Adjusting during render means that frame never exists.
    const { rerender } = render(<Holder model="A" />);
    act(() => rerender(<Holder model={null} />));
    act(() => rerender(<Holder model="B" />));
    expect(screen.getByTestId('body')).toHaveTextContent('B');
  });
});
