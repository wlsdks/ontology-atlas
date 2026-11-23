/** How much of a repository's surveyed code the project records as not on the map yet: areas, and the abilities in them. */
export interface NotMappedAreas {
  remaining: number;
  total: number;
  abilitiesUncovered: number;
  abilitiesTotal: number;
}

const UNCERTAINTY_HEADING = /^##\s+Uncertainty\s*$/i;
const SECTION_END = /^##\s/;
// The MCP server writes and checks this line (`mcp/src/construction/build-depth/unmapped-areas.mjs`);
// `tests/fixtures/not-mapped-line-cases.mjs` holds both readers to the same answers.
const SUMMARY_LINE = /^\s*(?:[-*+]\s+)?Not mapped yet:\s*\d+\s+of\s+\d+\s+areas?\b/i;
const SUMMARY_COUNTS = /^\s*(?:[-*+]\s+)?Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?,\s*(\d+)\s+of\s+(\d+)\s+abilities\b/i;

function uncertaintyLines(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => UNCERTAINTY_HEADING.test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * The first summary line under `## Uncertainty` (`Not mapped yet: N of M areas, R of T abilities.`, leading
 * its line after an optional `-`, `*` or `+`); null when absent, when the first is in an earlier form without
 * abilities, or when it counts no area or no ability. O(body length).
 */
export function notMappedAreas(body: string): NotMappedAreas | null {
  const line = uncertaintyLines(body).find((text) => SUMMARY_LINE.test(text));
  const match = line === undefined ? null : SUMMARY_COUNTS.exec(line);
  if (!match) return null;
  const remaining = Number(match[1]);
  const total = Number(match[2]);
  const abilitiesUncovered = Number(match[3]);
  const abilitiesTotal = Number(match[4]);
  if (total === 0 || remaining > total || abilitiesTotal === 0 || abilitiesUncovered > abilitiesTotal) return null;
  return { remaining, total, abilitiesUncovered, abilitiesTotal };
}
