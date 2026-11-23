import { describe, expect, it } from 'vitest';

import { readNotMappedSummary } from '../../../mcp/src/construction/build-depth/unmapped-areas.mjs';
import { notMappedAreas } from '../../../src/shared/lib/vault-document/not-mapped-areas';
import { NOT_MAPPED_LINE_CASES, notMappedCaseBody } from '../../fixtures/not-mapped-line-cases.mjs';

/**
 * The server refuses finalize until the project's first summary line carries its
 * measure, and the app offers mapping the rest from that line; if they read
 * different lines, or the same line differently, the person sees a share the
 * server never measured.
 */
describe('the Not mapped yet summary line reads the same on the server and in the app', () => {
  it.each(NOT_MAPPED_LINE_CASES.map((testCase) => [testCase.name, testCase] as const))('%s', (_name, testCase) => {
    const body = notMappedCaseBody(testCase);
    expect(readNotMappedSummary(body).counts).toEqual(testCase.expected);
    expect(notMappedAreas(body)).toEqual(testCase.expected);
  });
});
