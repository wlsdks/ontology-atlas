import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { routing } from '@/i18n/routing';

const root = process.cwd();

function rustSource(): string {
  return readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
}

function rustAppLocales(): string[] {
  const match = /const APP_LOCALES: \[&str; (\d+)\] = \[([^\]]*)\];/.exec(rustSource());
  expect(match, 'APP_LOCALES is declared in src-tauri/src/lib.rs').not.toBeNull();
  const names = [...(match?.[2] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? '');
  expect(Number(match?.[1])).toBe(names.length);
  return names;
}

describe('Rust locale list', () => {
  it('lists exactly the routing locales, in order', () => {
    expect(rustAppLocales()).toEqual([...routing.locales]);
  });

  it('keeps the routing default locale as the Rust fallback', () => {
    expect(rustSource()).toContain(
      `const DEFAULT_APP_LOCALE: &str = "${routing.defaultLocale}";`,
    );
  });
});
