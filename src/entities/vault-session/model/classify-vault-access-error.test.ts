import { describe, expect, it } from 'vitest';

import { classifyVaultAccessError, deniedFolderName } from './classify-vault-access-error';

/**
 * Owner, 2026-08-24, on the repeating macOS consent dialog: *"this comes up every single time — can
 * it not be set once and stop appearing?"* The dialog itself is the operating system's, but what
 * happens when somebody declines it was ours, and it was `Operation not permitted (os error 1)` on
 * screen: an errno, no folder, and no hint that the fix is a checkbox in System Settings.
 */
describe('금고 접근 실패 분류 — OS 가 막은 것과 폴더가 깨진 것은 다른 말이 필요하다', () => {
  it('macOS 보호 폴더 거부를 알아본다', () => {
    // What `std::io::Error::to_string()` produces for a TCC refusal.
    expect(classifyVaultAccessError('Operation not permitted (os error 1)')).toBe(
      'permission-denied',
    );
  });

  it('평범한 권한 거부도 같은 처방을 받는다', () => {
    // EACCES reaches the person the same way and the remedy has the same shape.
    expect(classifyVaultAccessError('Permission denied (os error 13)')).toBe('permission-denied');
  });

  it('대소문자와 Error 객체를 가리지 않는다', () => {
    expect(classifyVaultAccessError('OPERATION NOT PERMITTED')).toBe('permission-denied');
    expect(classifyVaultAccessError(new Error('Permission denied (os error 13)'))).toBe(
      'permission-denied',
    );
  });

  /*
   * ⚠️ The narrow half. Calling every failure a permission problem would send somebody to System
   * Settings to fix a folder that is simply gone — a wrong instruction is worse than a vague one,
   * because they will follow it and find nothing.
   */
  it('다른 실패를 권한 문제로 몰지 않는다', () => {
    for (const other of [
      'No such file or directory (os error 2)',
      'Is a directory (os error 21)',
      'failed to parse frontmatter',
      '',
      null,
      undefined,
    ]) {
      expect(classifyVaultAccessError(other), `「${String(other)}」를 권한 문제로 몰았다`).toBe(
        'unknown',
      );
    }
  });

  it('사람이 알아보는 이름으로 폴더를 부른다', () => {
    // The sentence should point at something recognisable, not at a path read character by character.
    expect(deniedFolderName('/Users/dana/Downloads/my-vault')).toBe('my-vault');
    expect(deniedFolderName('/Users/dana/Downloads/my-vault/')).toBe('my-vault');
  });

  it('부를 이름이 없으면 지어내지 않는다', () => {
    // Copy that says "allow access to " is worse than copy that never promised a name.
    for (const nothing of [null, undefined, '', '   ', '/']) {
      expect(deniedFolderName(nothing)).toBeNull();
    }
  });
});
