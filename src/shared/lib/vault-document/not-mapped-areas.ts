/** How many of a repository's surveyed areas have no capabilities of their own yet, as the project records it. */
export interface NotMappedAreas {
  remaining: number;
  total: number;
}

const UNCERTAINTY_HEADING = /^##\s+Uncertainty\s*$/i;
const SECTION_END = /^#{1,2}\s/;
// The exact line the MCP server tells the builder to keep; changing it breaks that contract.
const NOT_MAPPED_LINE = /Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?\b/i;

function uncertaintySection(body: string): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => UNCERTAINTY_HEADING.test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SECTION_END.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** The first `Not mapped yet: N of M areas.` under `## Uncertainty`; null when absent or not a count of M. O(body length). */
export function notMappedAreas(body: string): NotMappedAreas | null {
  const section = uncertaintySection(body);
  const match = section === null ? null : NOT_MAPPED_LINE.exec(section);
  if (!match) return null;
  const remaining = Number(match[1]);
  const total = Number(match[2]);
  if (total === 0 || remaining > total) return null;
  return { remaining, total };
}
