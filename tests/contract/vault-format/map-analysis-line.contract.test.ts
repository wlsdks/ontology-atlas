import { describe, expect, it } from 'vitest';

import { readMapAnalyses as readOnServer } from '../../../mcp/src/vault/sidecar/map-analysis-log.mjs';
import { readMapAnalyses as readInApp } from '../../../src/shared/lib/vault-document/map-analysis-record';
import { MAP_ANALYSIS_LINE_CASES } from '../../fixtures/map-analysis-line-cases.mjs';

/**
 * The server numbers the next analysis from the record and the app draws the
 * chip from it; if they read the lines differently, the chip names an analysis
 * the server never counted.
 */
describe('the map analysis record reads the same on the server and in the app', () => {
  it.each(MAP_ANALYSIS_LINE_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    expect(readOnServer(testCase.text)).toEqual(testCase.expected);
    expect(readInApp(testCase.text)).toEqual(testCase.expected);
  });
});
