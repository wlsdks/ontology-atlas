import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { Tooltip } from './tooltip';

/** A trigger whose own picker hands focus back the way the map's chips do: in the close handler. */
function PickerChip() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Choose a map view">
        <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>View</button>
      </Tooltip>
      {open && (
        <button
          type="button"
          onClick={(event) => {
            setOpen(false);
            (event.currentTarget.ownerDocument.querySelector('[aria-expanded]') as HTMLElement).focus();
          }}
        >
          Close picker
        </button>
      )}
    </>
  );
}

describe('Tooltip', () => {
  it('shows its hint when its trigger takes focus', async () => {
    render(<PickerChip />);
    fireEvent.focus(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Choose a map view');
  });

  it('stays closed when focus comes back from the surface its trigger opened', () => {
    render(<PickerChip />);
    const trigger = screen.getByRole('button', { name: 'View' });
    fireEvent.click(trigger);
    act(() => screen.getByRole('button', { name: 'Close picker' }).click());
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
