import { describe, expect, it } from 'vitest';
import { isPickerAbort } from './picker-abort';

describe('isPickerAbort', () => {
  it('취소한 DOMException 을 취소로 읽는다', () => {
    expect(isPickerAbort(new DOMException('The user aborted a request.', 'AbortError'))).toBe(
      true,
    );
  });

  it('DOMException 이 아닌 취소도 취소로 읽는다 — 진입 검수 E-1b', () => {
    // 폴리필 / 다른 realm — 이름은 남고 생성자만 다른 경우.
    const named = new Error('nope');
    named.name = 'AbortError';
    expect(isPickerAbort(named)).toBe(true);
    // 이름까지 소실된 경우(Tauri 는 Err(String) 을 문자열로 reject 한다).
    expect(isPickerAbort(new Error('The user aborted a request.'))).toBe(true);
    expect(isPickerAbort('user aborted')).toBe(true);
  });

  it('진짜 실패는 취소로 삼키지 않는다', () => {
    expect(isPickerAbort(new TypeError('window.showDirectoryPicker is not a function'))).toBe(
      false,
    );
    expect(isPickerAbort(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(isPickerAbort('permission denied')).toBe(false);
    expect(isPickerAbort(null)).toBe(false);
    expect(isPickerAbort(undefined)).toBe(false);
  });
});
