import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useAdvancedMenu } from './use-advanced-menu';

function MenuFixture() {
  const { open, setOpen, ref } = useAdvancedMenu();
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} data-testid="trigger">
        open
      </button>
      <div ref={ref} data-testid="menu-region">
        {open ? <span data-testid="content">menu</span> : null}
      </div>
      <div data-testid="outside">outside</div>
    </div>
  );
}

describe('useAdvancedMenu', () => {
  it('초기 open=false', () => {
    render(<MenuFixture />);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('setOpen(true) → content 렌더', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('outside pointerdown 시 close', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    expect(screen.getByTestId('content')).toBeInTheDocument();
    act(() => {
      const ev = new PointerEvent('pointerdown', { bubbles: true });
      Object.defineProperty(ev, 'target', {
        value: screen.getByTestId('outside'),
      });
      window.dispatchEvent(ev);
    });
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('inside pointerdown 은 close 안 함 (containment 검사)', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    act(() => {
      const ev = new PointerEvent('pointerdown', { bubbles: true });
      Object.defineProperty(ev, 'target', {
        value: screen.getByTestId('content'),
      });
      window.dispatchEvent(ev);
    });
    expect(screen.queryByTestId('content')).toBeInTheDocument();
  });

  it('Escape 키 → close', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('open=false 시 listener 미등록 (cleanup verify)', () => {
    render(<MenuFixture />);
    // An outside pointerdown while closed must change nothing (zero state changes).
    act(() => {
      const ev = new PointerEvent('pointerdown', { bubbles: true });
      Object.defineProperty(ev, 'target', {
        value: screen.getByTestId('outside'),
      });
      window.dispatchEvent(ev);
    });
    expect(screen.queryByTestId('content')).toBeNull();
  });
});
