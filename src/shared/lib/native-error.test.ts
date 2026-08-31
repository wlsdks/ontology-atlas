import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';
import { nativeErrorMessage, parseNativeError } from './native-error';

/**
 * The seam where a Rust failure becomes a sentence.
 *
 * Rust used to send the sentence itself, in Korean, and the WebView printed it
 * verbatim — so an English-locale reader met Korean and a Korean reader met
 * whatever Rust happened to hold. Rust cannot pick the language: the locale lives
 * here. So Rust sends `<code>: <English detail>` and this file decides the words.
 */

const dict: Record<string, string> = {
  'secret-empty': 'The key box is empty.',
  'keychain-unavailable': "Could not open this computer's keychain.",
};
const lookup = (code: string) => dict[code];

describe('parseNativeError', () => {
  it('splits a code from its English detail', () => {
    expect(parseNativeError('keychain-unavailable: No such keychain')).toMatchObject({
      code: 'keychain-unavailable',
      detail: 'No such keychain',
    });
  });

  it('reads a bare code as a code with no detail', () => {
    expect(parseNativeError('secret-empty')).toMatchObject({ code: 'secret-empty', detail: '' });
  });

  it('keeps the two prefixes this codebase already minted parseable', () => {
    // `agent-loop.ts` still matches these by `startsWith`; the parser must agree.
    expect(parseNativeError('vault-root-rejected:filesystem-root')).toMatchObject({
      code: 'vault-root-rejected',
      detail: 'filesystem-root',
    });
    expect(parseNativeError('timed-out: curl exit 28').code).toBe('timed-out');
  });

  it('refuses to read an ordinary sentence as a code', () => {
    // The hazard the anchor exists for: a lower-case English sentence with a colon
    // in it must not have its first word eaten as a code.
    expect(parseNativeError('cannot open file: nope').code).toBeNull();
    expect(parseNativeError('Error: boom').code).toBeNull();
  });

  it('unwraps an Error and anything else that is not a string', () => {
    expect(parseNativeError(new Error('secret-empty')).code).toBe('secret-empty');
    expect(parseNativeError(undefined).raw).toBe('undefined');
  });
});

describe('nativeErrorMessage', () => {
  it("says a known code in the reader's own words", () => {
    expect(nativeErrorMessage('secret-empty', lookup)).toBe('The key box is empty.');
  });

  it("keeps the machine's own words beside the sentence", () => {
    // git's stderr and the OS error are the only part of a failure that says what
    // actually went wrong, and nobody but the machine can write them.
    expect(nativeErrorMessage('keychain-unavailable: No such keychain', lookup)).toBe(
      "Could not open this computer's keychain. (No such keychain)",
    );
  });

  it('falls back to the English detail when the code is unknown', () => {
    // A code minted in Rust and forgotten in `messages/*.json` still says something
    // true rather than showing a bare slug or nothing at all.
    expect(nativeErrorMessage('brand-new-code: disk is full', lookup)).toBe('disk is full');
    expect(nativeErrorMessage('brand-new-code', lookup)).toBe('brand-new-code');
  });

  it('passes an uncoded payload straight through', () => {
    expect(nativeErrorMessage('something else entirely', lookup)).toBe('something else entirely');
    expect(nativeErrorMessage(new Error('offline'), lookup)).toBe('offline');
  });

  it('hands the payload back untouched when no lookup is given', () => {
    // Not politeness: `noticeFor` in the agent loop recognises a failed turn by the
    // `audit-blocked:` / `timed-out:` prefix. Strip the code from an unwired caller
    // and an unwritable folder turns into "check your network".
    expect(nativeErrorMessage('keychain-unavailable: No such keychain')).toBe(
      'keychain-unavailable: No such keychain',
    );
    expect(nativeErrorMessage('audit-blocked:audit-log-write-failed: EACCES')).toContain(
      'audit-blocked:',
    );
    expect(nativeErrorMessage('timed-out: curl exit 28')).toContain('timed-out:');
  });
});

describe('the catalogue covers every code Rust mints', () => {
  const crate = join(import.meta.dirname, '..', '..', '..', 'src-tauri', 'src');
  const sources = ['errors.rs', 'git.rs', 'llm.rs', 'llm_audit.rs', 'secrets.rs']
    .map((name) => readFileSync(join(crate, name), 'utf8'))
    .join('\n');

  /** Both shapes Rust mints one in: `coded("x", …)` and the `code: "x"` field. */
  function mintedCodes(): string[] {
    const found = new Set<string>();
    for (const [, code] of sources.matchAll(/coded\("([a-z0-9-]+)"/g)) found.add(code);
    for (const [, code] of sources.matchAll(/\bcode: "([a-z0-9-]+)"/g)) found.add(code);
    return [...found].sort();
  }

  it('is reading the crate, not an empty string', () => {
    expect(mintedCodes().length).toBeGreaterThan(20);
  });

  it.each(['en', 'ko'] as const)('%s has a sentence for each one', (locale) => {
    const catalog = (locale === 'en' ? en : ko) as { nativeErrors: Record<string, string> };
    const missing = mintedCodes().filter((code) => !catalog.nativeErrors[code]);
    expect(
      missing,
      `these codes reach the screen with no sentence in messages/${locale}.json:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
