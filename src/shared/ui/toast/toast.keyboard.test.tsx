import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { toast } from 'sonner';

import { ToastProvider } from './toast';

afterEach(() => toast.dismiss());

describe('notification keyboard ownership', () => {
  it('leaves Enter on a file control and focuses notifications only for Alt+T', async () => {
    render(<ToastProvider><button type="button">Open changed file</button></ToastProvider>);
    act(() => { toast.info('Folder changed'); });
    await screen.findByText('Folder changed');
    const control = screen.getByRole('button', { name: 'Open changed file' });
    control.focus();
    fireEvent.keyDown(control, { key: 'Enter', code: 'Enter' });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: 't', code: 'KeyT', altKey: true });
    expect(document.querySelector('[data-sonner-toaster]')).toHaveFocus();
  });
});
