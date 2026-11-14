import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BootFailureScreen } from './BootFailureScreen';

afterEach(() => vi.unstubAllGlobals());

it('still offers retry when the runtime it reports on throws from a media query', () => {
  vi.stubGlobal('matchMedia', () => { throw new Error('runtime is broken'); });
  const onRetry = vi.fn();
  render(<BootFailureScreen onRetry={onRetry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
