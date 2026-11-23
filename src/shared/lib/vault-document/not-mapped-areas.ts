/** How much of a repository's surveyed code the project records as not on the map yet: areas, and the abilities in them. */
export interface NotMappedAreas {
  remaining: number;
  total: number;
  abilitiesUncovered: number;
  abilitiesTotal: number;
}

const UNCERTAINTY_HEADING = /^##\s+Uncertainty\s*$/i;
const SECTION_END = /^#{1,2}\s/;
// The exact line the MCP server tells the builder to keep; changing it breaks that contract.
const NOT_MAPPED_LINE = /Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?,\s*(\d+)\s+of\s+(\d+)\s+abilities\b/i;

function uncertaintySection(body: string): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => UNCERTAINTY_HEADING.test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * The first `Not mapped yet: N of M areas, R of T abilities.` under `## Uncertainty`; null when absent,
 * in an earlier form without abilities, or not a count of M areas and T abilities. O(body length).
 */
export function notMappedAreas(body: string): NotMappedAreas | null {
  const section = uncertaintySection(body);
  const match = section === null ? null : NOT_MAPPED_LINE.exec(section);
  if (!match) return null;
  const remaining = Number(match[1]);
  const total = Number(match[2]);
  const abilitiesUncovered = Number(match[3]);
  const abilitiesTotal = Number(match[4]);
  if (total === 0 || remaining > total || abilitiesTotal === 0 || abilitiesUncovered > abilitiesTotal) return null;
  return { remaining, total, abilitiesUncovered, abilitiesTotal };
}
