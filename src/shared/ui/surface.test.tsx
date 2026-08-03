import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_WINDOW_MS, useHeldValue } from '@/shared/lib/use-presence';
import { Surface } from './surface';

/**
 * `Surface` 가 **대신 기억해 주는 것들**의 계약.
 *
 * 넷 다 이 저장소가 실측으로 배운 것이라, 「기억해서 매번 챙긴다」가 아니라
 * 「프리미티브가 진다」가 돼야 하는 것들이다. 그래서 여기서 못박는다 —
 * 계약이 코드에만 있고 테스트에 없으면 다음 리팩터가 조용히 지운다.
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
    // 즉시 언마운트하면 1프레임 소멸이다. 2026-07-28 실측: 사용자가 누른 목적물이
    // delta 13.25 @17ms 로 사라지고 «결과일 뿐인» 지도가 217ms 이징을 받았다.
    const { rerender } = render(<Surface open>내용</Surface>);
    expect(screen.getByText('내용')).toBeInTheDocument();

    act(() => rerender(<Surface open={false}>내용</Surface>));
    expect(screen.getByText('내용'), '퇴장 창 안에서는 아직 화면에 있어야 한다').toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(EXIT_WINDOW_MS + 10));
    expect(screen.queryByText('내용')).toBeNull();
  });

  it('② 퇴장은 자기 이름의 클래스다 — 등장 클래스를 되감지 않는다', () => {
    // CSS 애니메이션은 `animation-name` 이 그대로면 duration/direction 이 바뀌어도
    // **재시작하지 않는다**. 그래서 `reverse` 로 되감은 퇴장은 조용히 하드컷이 된다.
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
    // 없으면 사라지는 중인 표면이 클릭을 먹고, 사용자는 «눌렀는데 엉뚱한 게 됐다» 를 겪는다.
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
    // 밖에서 구분할 수 없는 상태는 밖에서 검사할 수 없다(지도 훅이 배운 그것).
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
    // 중앙에서 태어나는 팝오버는 모션석의 반려 사유다: 누른 자리와 나타나는 자리가
    // 다르면 인과가 끊긴다.
    render(
      <Surface open origin="top right">
        내용
      </Surface>,
    );
    expect(screen.getByText('내용')).toHaveStyle({ transformOrigin: 'top right' });
  });

  it('data-* 를 통과시킨다 — 밖에서 이 표면을 집을 수 있어야 한다', () => {
    /*
     * ⚠️ 이 단언이 없으면 **타입이 조용히 통과시킨다.** TypeScript 는 하이픈이 든
     * JSX 속성을 검사하지 않아서, `Surface` 가 안 받아도 `tsc` 는 아무 말 없고
     * 값만 버려진다. 2026-08-03 에 엣지 패널을 전환하면서 실제로 그럴 뻔했다.
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
     * `globals.css` 의 `.map-overlay-in` 주석이 이유를 적어 뒀다: **화면의 큰
     * 부분을 차지하는 표면이 움직이면 화면 자체가 흔들린 것으로 읽힌다.** 이
     * 문법이 프리미티브에 없어서 전면 상세는 `map-overlay-in` 을 손으로 붙이고
     * 나가는 길은 못 붙였고, 전폭 서랍·스크림 모달은 아무것도 못 붙였다.
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
    // 이게 없으면 표면은 예쁘게 사라지는데 그 안이 텅 빈다 — 등장/퇴장을 붙이려던
    // 것이 오히려 더 나쁜 화면이 된다.
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
     * 첫 판은 `value !== held` 로 비교했고, 지도 엣지 패널에 붙이자마자
     * **React #301(무한 재렌더)로 지도가 통째로 죽었다.** 소비처의 모델이
     * `useMemo` 인데 정체성이 매 렌더 새로 만들어졌기 때문이다.
     * 이 테스트가 그 형태를 그대로 재현한다 — 매 렌더 새 객체를 넘긴다.
     */
    function Unstable({ id }: { id: string | null }) {
      const model = id ? { id, label: `모델 ${id}` } : null; // ← 매 렌더 새 객체
      const held = useHeldValue(model, id);
      return (
        <Surface open={id !== null}>
          <span data-testid="body">{held?.label ?? '(비어 있음)'}</span>
        </Surface>
      );
    }
    const { rerender } = render(<Unstable id="a" />);
    // 같은 id 로 여러 번 재렌더해도 루프가 안 난다(났으면 여기서 터진다)
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
    // effect 로 붙들면 한 프레임 늦어 그 사이 자식이 null 을 받는다.
    // 렌더 중 조정이라 그 프레임이 존재하지 않는다.
    const { rerender } = render(<Holder model="A" />);
    act(() => rerender(<Holder model={null} />));
    act(() => rerender(<Holder model="B" />));
    expect(screen.getByTestId('body')).toHaveTextContent('B');
  });
});
