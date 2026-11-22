import { describe, expect, it } from 'vitest';

import {
  classifyVaultAccessError,
  deniedFolderName,
  isMissingFolderError,
} from './classify-vault-access-error';

describe('vault access failure classification: what the OS blocked and a broken folder need different wording', () => {
  it('recognizes a macOS protected-folder denial', () => {
    // What `std::io::Error::to_string()` produces for a TCC refusal.
    expect(classifyVaultAccessError('Operation not permitted (os error 1)')).toBe(
      'permission-denied',
    );
  });

  it('gives a plain permission denial the same remedy', () => {
    // EACCES reaches the person the same way and the remedy has the same shape.
    expect(classifyVaultAccessError('Permission denied (os error 13)')).toBe('permission-denied');
  });

  it('ignores letter case and whether it is an Error object', () => {
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
  it('does not blame other failures on permissions', () => {
    for (const other of [
      'No such file or directory (os error 2)',
      'Is a directory (os error 21)',
      'failed to parse frontmatter',
      '',
      null,
      undefined,
    ]) {
      expect(classifyVaultAccessError(other), `"${String(other)}" was blamed on permissions`).toBe(
        'unknown',
      );
    }
  });

  it('names the folder with a name a person recognizes', () => {
    // The sentence should point at something recognisable, not at a path read character by character.
    expect(deniedFolderName('/Users/dana/Downloads/my-vault')).toBe('my-vault');
    expect(deniedFolderName('/Users/dana/Downloads/my-vault/')).toBe('my-vault');
  });

  it('recognizes a vanished folder in the wording of both runtimes', () => {
    const notFound = new Error(
      'A requested file or directory could not be found at the time an operation was processed.',
    );
    notFound.name = 'NotFoundError';
    expect(isMissingFolderError(notFound)).toBe(true);
    expect(isMissingFolderError('No such file or directory (os error 2)')).toBe(true);
    expect(isMissingFolderError(new Error('NotFoundError: the entry was removed'))).toBe(true);
  });

  it('does not call a failure that is not a vanished folder a vanished one', () => {
    for (const other of [
      'Operation not permitted (os error 1)',
      'Permission denied (os error 13)',
      'failed to parse frontmatter',
      '',
      null,
      undefined,
    ]) {
      expect(isMissingFolderError(other), `"${String(other)}" was blamed on a vanished folder`).toBe(false);
    }
  });

  it('invents no name when there is nothing to call it', () => {
    // Copy that says "allow access to " is worse than copy that never promised a name.
    for (const nothing of [null, undefined, '', '   ', '/']) {
      expect(deniedFolderName(nothing)).toBeNull();
    }
  });
});
