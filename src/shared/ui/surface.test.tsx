import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_WINDOW_MS } from '@/shared/lib/use-presence';
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
