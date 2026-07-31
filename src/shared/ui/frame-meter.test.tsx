import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameMeter } from './frame-meter';
import { writeFrameMeter } from '@/shared/lib/appearance-preferences';

/**
 * 이 계기의 값은 «켜면 숫자가 보인다» 가 아니라 **«꺼져 있으면 존재하지 않는다»** 다.
 * 진단 도구가 진단 대상을 느리게 만들면 그 숫자는 자기 자신을 재는 것이 되고,
 * 그건 없는 것만 못하다. 그래서 그 약속을 주석이 아니라 여기에 건다.
 */
describe('FrameMeter', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('꺼져 있으면 rAF 를 한 번도 걸지 않는다', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<FrameMeter />);
    expect(raf).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<FrameMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('켜면 측정 루프가 돈다', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    act(() => {
      writeFrameMeter(true);
    });
    render(<FrameMeter />);
    expect(raf).toHaveBeenCalled();
  });

  it('껐다 켜는 것이 저장되고 되읽힌다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    const { rerender } = render(<FrameMeter />);
    rerender(<FrameMeter />);
    act(() => {
      writeFrameMeter(false);
    });
    // off 로 되돌리면 표시도 사라진다 — 저장값이 곧 화면이다.
    expect(screen.queryByText(/fps/)).toBeNull();
  });

  it('켜져 있어도 첫 표본이 모이기 전에는 숫자를 지어내지 않는다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    // rAF 가 아직 두 번 이상 안 돌았으므로 간격을 계산할 수 없다.
    // 그때 0fps 같은 «그럴듯한 거짓말» 을 그리면 안 된다.
    const { container } = render(<FrameMeter />);
    expect(container.textContent).not.toContain('fps');
  });
});
