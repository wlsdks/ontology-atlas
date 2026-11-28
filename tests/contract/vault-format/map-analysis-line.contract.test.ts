import { describe, expect, it } from 'vitest';

import { readMapAnalyses as readInApp } from '../../../src/shared/lib/vault-document/map-analysis-record';
import { MAP_ANALYSIS_LINE_CASES, NOW_MS } from '../../fixtures/map-analysis-line-cases.mjs';

/**
 * The server numbers the next analysis from the record and the app draws the
 * chip from it; if they read the lines differently, the chip names an analysis
 * the server never counted. The table states what the record reads as.
 */
describe('the map analysis record reads as the table states in the app', () => {
  it.each(MAP_ANALYSIS_LINE_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    expect(readInApp(testCase.text, { nowMs: NOW_MS })).toEqual(testCase.expected);
  });
});
