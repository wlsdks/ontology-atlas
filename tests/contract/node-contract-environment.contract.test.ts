import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

it('source contracts run without constructing a browser environment', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
});

it('CLI exclusions reach every project without losing other test files', () => {
  const bin = path.join(path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
  const inventory = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [bin, 'list', '--filesOnly', '--json', ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })) as { file: string }[];
  const all = inventory().map(({ file }) => file.replaceAll('\\', '/'));
  expect(all.some((file) => file.includes('/tests/contract/'))).toBe(true);
  expect(all.some((file) => file.includes('.perf.test.'))).toBe(true);
  const expected = all.filter((file) => !file.includes('/tests/contract/') && !file.includes('.perf.test.'));
  const selected = inventory('--exclude=tests/contract/**', '--exclude', '**/*.perf.test.*')
    .map(({ file }) => file.replaceAll('\\', '/'));
  expect(selected.sort()).toEqual(expected.sort());
  expect(new Set(selected).size).toBe(selected.length);
});
