export interface HexBoardLabels {
  staleOnly: (count: number) => string;
  regionsOnly: string;
  /** Said once when the board had to widen (a region overflowed). */
  widened: string;
  tooltip: (facts: { name: string; stale: boolean; needs: number; users: number; elements: number; dependents: number | null }) => string;
  domainMeta: (facts: { capabilities: number; elements: number }) => string;
  domainStale: (count: number | null) => string | null;
  projectMeta: string | null;
  plateSub: (facts: { capabilities: number; stale: number | null }) => string;
  relief: string;
  dependents: (count: number) => string;
  regionDependents: (count: number) => string;
}
