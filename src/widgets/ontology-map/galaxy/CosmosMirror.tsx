"use client";

import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosPaintRecord } from "./cosmos-types";

export interface CosmosMirrorLabels {
  list: string;
  galaxyRow: (name: string, count: number) => string;
}

export function CosmosMirror({
  layout,
  labels,
}: {
  layout: CosmosLayout;
  selectedId: string | null;
  onSelect: (id: string) => void;
  labels: CosmosMirrorLabels | null;
  marks: readonly CosmosPaintRecord[];
  restSignal: number;
  deadEndSignal: number;
  walkNotice: string | null;
}) {
  return (
    <ul className="sr-only" data-testid="cosmos-galaxy-list" aria-label={labels?.list}>
      {layout.galaxies.map((g) => (
        <li key={g.id}>{labels ? labels.galaxyRow(g.label, g.members) : `${g.label}: ${g.members}`}</li>
      ))}
    </ul>
  );
}
