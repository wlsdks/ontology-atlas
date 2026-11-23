/**
 * One table, two readers of the project's `Not mapped yet` summary line.
 *
 * The MCP server writes the line, refuses `finalize_project_meaning` and warns in
 * `validate_vault` unless the first one carries the measure
 * (`mcp/src/construction/build-depth/unmapped-areas.mjs`, `readNotMappedSummary`);
 * the app reads the same line to offer mapping the rest
 * (`src/shared/lib/vault-document/not-mapped-areas.ts`). They share no module, so
 * this table keeps them reading the same line as the same counts. Each case is a
 * line under `## Uncertainty` unless it gives a whole `body`; `expected` is the
 * counts both read, or null when neither reads one.
 */

const counts = (remaining, total, abilitiesUncovered, abilitiesTotal) => ({ remaining, total, abilitiesUncovered, abilitiesTotal });

export const NOT_MAPPED_LINE_CASES = Object.freeze([
  { name: 'the line as the server writes it', line: 'Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: counts(2, 3, 18, 30) },
  { name: 'a dash list marker', line: '- Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: counts(2, 3, 18, 30) },
  { name: 'a star list marker', line: '* Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: counts(2, 3, 18, 30) },
  { name: 'a plus list marker', line: '+ Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: counts(2, 3, 18, 30) },
  { name: 'one area, in the singular', line: 'Not mapped yet: 1 of 1 area, 2 of 3 abilities.', expected: counts(1, 1, 2, 3) },
  { name: 'zero remaining of a counted map', line: 'Not mapped yet: 0 of 45 areas, 0 of 383 abilities.', expected: counts(0, 45, 0, 383) },
  { name: 'mid-sentence, not leading its line', line: 'As of today, Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: null },
  { name: 'in a blockquote', line: '> Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: null },
  { name: 'in bold', line: '**Not mapped yet: 2 of 3 areas, 18 of 30 abilities.**', expected: null },
  { name: 'in a numbered list', line: '1. Not mapped yet: 2 of 3 areas, 18 of 30 abilities.', expected: null },
  { name: 'zero abilities, which the server never asks to keep', line: 'Not mapped yet: 2 of 2 areas, 0 of 0 abilities.', expected: null },
  { name: 'zero areas', line: 'Not mapped yet: 0 of 0 areas, 0 of 5 abilities.', expected: null },
  { name: 'more remaining than there are', line: 'Not mapped yet: 9 of 8 areas, 1 of 5 abilities.', expected: null },
  { name: 'the earlier form, one number of areas', line: 'Not mapped yet: 12 of 45 areas.', expected: null },
  { name: 'an area bullet is no summary', line: '- Not mapped yet: billing (12 of 12 abilities not on the map)', expected: null },
  {
    name: 'two summary lines: the first is read',
    line: 'Not mapped yet: 0 of 3 areas, 0 of 9 abilities.\nNot mapped yet: 3 of 3 areas, 9 of 9 abilities.',
    expected: counts(0, 3, 0, 9),
  },
  {
    name: 'an earlier form first hides a later current line',
    line: 'Not mapped yet: 3 of 3 areas.\nNot mapped yet: 3 of 3 areas, 9 of 9 abilities.',
    expected: null,
  },
  {
    name: 'a line outside the Uncertainty section',
    body: 'A product.\n\nNot mapped yet: 3 of 8 areas, 4 of 20 abilities.\n\n## Uncertainty\n\n- None.\n\n## Related\n\n- Not mapped yet: 9 of 9 areas, 90 of 90 abilities.\n',
    expected: null,
  },
  {
    name: 'a subheading inside the section keeps it open',
    body: 'A product.\n\n## Uncertainty\n\n### Coverage\n\nNot mapped yet: 2 of 3 areas, 18 of 30 abilities.\n',
    expected: counts(2, 3, 18, 30),
  },
  {
    name: 'a top-level heading inside the section keeps it open, as the server reads it',
    body: 'A product.\n\n## Uncertainty\n\n# Notes\n\nNot mapped yet: 2 of 3 areas, 18 of 30 abilities.\n',
    expected: counts(2, 3, 18, 30),
  },
  {
    name: 'a heading that only begins with Uncertainty is another section',
    body: 'A product.\n\n## Uncertainty and gaps\n\nNot mapped yet: 2 of 3 areas, 18 of 30 abilities.\n',
    expected: null,
  },
  {
    name: 'Windows line endings',
    body: 'A product.\r\n\r\n## Uncertainty\r\n\r\n- Not mapped yet: 2 of 3 areas, 18 of 30 abilities.\r\n',
    expected: counts(2, 3, 18, 30),
  },
]);

/** The project body a case stands for. */
export function notMappedCaseBody(testCase) {
  return testCase.body ?? `A product.\n\n## Includes\n\n- Loans.\n\n## Uncertainty\n\n${testCase.line}\n- Whether the batch jobs run nightly.\n`;
}
