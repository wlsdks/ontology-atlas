import { describe, expect, it } from 'vitest';
import { toErrorMessage } from './error-message';

describe('toErrorMessage', () => {
  it('Error 인스턴스의 message 를 그대로 뽑는다', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('bare string rejection 을 살린다 (Tauri invoke → Err(String))', () => {
    // 이게 P5 데스크톱 침묵 실패의 핵심: Tauri 커맨드가 Err(String) 을
    // 반환하면 invoke Promise 는 Error 가 아니라 문자열로 reject 한다.
    expect(toErrorMessage('No such file or directory (os error 2)')).toBe(
      'No such file or directory (os error 2)',
    );
  });

  it('message 프로퍼티를 가진 plain object 도 처리한다', () => {
    expect(toErrorMessage({ message: 'plain object failure' })).toBe(
      'plain object failure',
    );
  });

  it('공백만 있는 message 는 null 로 떨어뜨려 fallback 이 뜨게 한다', () => {
    expect(toErrorMessage(new Error('   '))).toBeNull();
    expect(toErrorMessage('   ')).toBeNull();
    expect(toErrorMessage('')).toBeNull();
  });

  it('의미 없는 값은 null', () => {
    expect(toErrorMessage(null)).toBeNull();
    expect(toErrorMessage(undefined)).toBeNull();
    expect(toErrorMessage(42)).toBeNull();
    expect(toErrorMessage({ code: 500 })).toBeNull();
  });
});
