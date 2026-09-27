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
  it('starts closed', () => {
    render(<MenuFixture />);
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders content after setOpen(true)', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('closes on an outside pointerdown', () => {
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

  it('stays open on an inside pointerdown', () => {
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

  it('closes on Escape', () => {
    render(<MenuFixture />);
    act(() => screen.getByTestId('trigger').click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('registers no listeners while closed', () => {
    render(<MenuFixture />);
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
