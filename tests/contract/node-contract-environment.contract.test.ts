import { expect, it } from 'vitest';

it('source contracts run without constructing a browser environment', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
});
