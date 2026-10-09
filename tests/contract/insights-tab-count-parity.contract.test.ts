import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { INSIGHTS_SECTIONS } from '@/views/ontology-insights/lib/insights-tab-state';

/** The native contract cannot import TypeScript; its count must match the rendered section source. */
it('keeps the native section inventory equal to Analysis navigation', () => {
  const source = readFileSync(join(import.meta.dirname, '../../scripts/lib/verify-macos/payload-contract.mjs'), 'utf8');
  const count = /const INSIGHTS_SUBJECT_COUNT = (\d+);/.exec(source);
  expect(count, 'the native contract no longer counts the Analysis sections').not.toBeNull();
  expect(INSIGHTS_SECTIONS.length).toBeGreaterThan(0);
  expect(Number(count![1])).toBe(INSIGHTS_SECTIONS.length);
  expect(new Set(INSIGHTS_SECTIONS).size).toBe(INSIGHTS_SECTIONS.length);
});
