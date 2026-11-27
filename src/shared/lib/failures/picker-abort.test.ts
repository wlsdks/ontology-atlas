import { describe, expect, it } from 'vitest';
import { isPickerAbort } from './picker-abort';

describe('isPickerAbort', () => {
  it('reads a cancelled DOMException as a cancel', () => {
    expect(isPickerAbort(new DOMException('The user aborted a request.', 'AbortError'))).toBe(
      true,
    );
  });

  it('reads a cancel that is not a DOMException as a cancel too', () => {
    // Polyfill or another realm — the name survives, only the constructor differs.
    const named = new Error('nope');
    named.name = 'AbortError';
    expect(isPickerAbort(named)).toBe(true);
    // Even the name is lost (Tauri rejects Err(String) as a plain string).
    expect(isPickerAbort(new Error('The user aborted a request.'))).toBe(true);
    expect(isPickerAbort('user aborted')).toBe(true);
  });

  it('does not swallow a real failure as a cancel', () => {
    expect(isPickerAbort(new TypeError('picker is not a function'))).toBe(
      false,
    );
    expect(isPickerAbort(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(isPickerAbort('permission denied')).toBe(false);
    expect(isPickerAbort(null)).toBe(false);
    expect(isPickerAbort(undefined)).toBe(false);
  });
});
