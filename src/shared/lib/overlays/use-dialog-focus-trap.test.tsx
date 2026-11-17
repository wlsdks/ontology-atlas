import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogFocusTrap } from './use-dialog-focus-trap';

function Surface({ name, open = true }: { name: string; open?: boolean }) {
  const ref = useDialogFocusTrap<HTMLDivElement>({ open, initialFocus: 'none', restoreFocus: false });
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1}>
      <button type="button">{`${name} first`}</button>
      <button type="button">{`${name} last`}</button>
    </div>
  );
}

function pressTab(): boolean {
  return !fireEvent.keyDown(window, { key: 'Tab' });
}

describe('useDialogFocusTrap', () => {
  it('lets Tab move inside a dialog opened over another trapping surface', () => {
    render(
      <>
        <Surface name="sheet" />
        <Surface name="dialog" />
      </>,
    );
    screen.getByText('dialog first').focus();

    const prevented = pressTab();

    expect(prevented).toBe(false);
    expect(screen.getByText('dialog first')).toHaveFocus();
  });

  it('wraps Tab from the last control of the top dialog to its first', () => {
    render(
      <>
        <Surface name="sheet" />
        <Surface name="dialog" />
      </>,
    );
    screen.getByText('dialog last').focus();

    expect(pressTab()).toBe(true);
    expect(screen.getByText('dialog first')).toHaveFocus();
  });

  it('hands Tab back to the surface underneath once the top dialog closes', () => {
    const { rerender } = render(
      <>
        <Surface name="sheet" />
        <Surface name="dialog" />
      </>,
    );
    rerender(
      <>
        <Surface name="sheet" />
        <Surface name="dialog" open={false} />
      </>,
    );
    screen.getByText('sheet last').focus();

    expect(pressTab()).toBe(true);
    expect(screen.getByText('sheet first')).toHaveFocus();
  });
});
