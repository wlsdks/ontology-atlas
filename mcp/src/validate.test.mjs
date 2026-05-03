import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidVaultTitle } from './validate.mjs';

describe('isValidVaultTitle', () => {
  it('비-string 은 false', () => {
    assert.equal(isValidVaultTitle(undefined), false);
    assert.equal(isValidVaultTitle(null), false);
    assert.equal(isValidVaultTitle(0), false);
    assert.equal(isValidVaultTitle(123), false);
    assert.equal(isValidVaultTitle(true), false);
    assert.equal(isValidVaultTitle({}), false);
    assert.equal(isValidVaultTitle([]), false);
  });

  it('빈 문자열 / 공백-only 는 false', () => {
    assert.equal(isValidVaultTitle(''), false);
    assert.equal(isValidVaultTitle('   '), false);
    assert.equal(isValidVaultTitle('\t\n'), false);
  });

  it('비-empty trimmed string 은 true', () => {
    assert.equal(isValidVaultTitle('Auth Platform'), true);
    assert.equal(isValidVaultTitle('한글 제목'), true);
    assert.equal(isValidVaultTitle('  Trimmed  '), true);
    assert.equal(isValidVaultTitle('A'), true);
  });
});
