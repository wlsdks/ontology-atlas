/**
 * The number on the Check results door: the app's findings plus the agent's findings and names. Null
 * (no number) while there is nothing to count and nothing was ever checked, so an empty wiki does
 * not show a bare 0.
 */
export function reportDoorCount({
  structuralFindings,
  agentFindings,
  agentNames,
  wikiPageCount,
  hasRecordedCheck,
}: {
  structuralFindings: number;
  agentFindings: number;
  agentNames: number;
  wikiPageCount: number;
  hasRecordedCheck: boolean;
}): number | null {
  const total = structuralFindings + agentFindings + agentNames;
  return wikiPageCount === 0 && total === 0 && !hasRecordedCheck ? null : total;
}
