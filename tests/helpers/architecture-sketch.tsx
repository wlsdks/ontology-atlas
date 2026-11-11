import type { ComponentProps } from 'react';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';
import { buildArchitectureGraph } from '@/views/architecture/model/graph-layout';
import type { RoleLedger } from '@/views/architecture/model/role-ledger';
import { ArchitectureSketch } from '@/views/architecture/ui/ArchitectureSketch';

import { HEXAGONAL_PROFILE_FRONTMATTER } from '../fixtures/architecture-profile-cases.mjs';

export function sketch(
  ledgers: Record<string, RoleLedger> = {},
  violatedPairs = new Set<string>(),
  traffic: readonly ArchitectureRoleEdge[] = [],
  profileFrontmatter: unknown = HEXAGONAL_PROFILE_FRONTMATTER,
  selected: string | null = null,
  extra: Partial<ComponentProps<typeof ArchitectureSketch>> = {},
) {
  const graph = buildArchitectureGraph(
    buildArchitectureLayout(parseArchitectureProfile(profileFrontmatter as never)),
    traffic,
  );
  return (
    <ArchitectureSketch
      graph={graph}
      ledgers={ledgers}
      roleSummary={() => null}
      edgeSentence={(edge) =>
        edge.kind === 'permitted'
          ? `${edge.from} may depend on ${edge.to}`
          : `${edge.from} reaches ${edge.to} in ${edge.count ?? 0} imports`
      }
      violatedPairs={violatedPairs}
      ledgerStatusLabel={(ledger) =>
        ledger.state === 'clean' ? 'no violations out' : `${ledger.violated} violated`
      }
      ledgerImportsLabel={(count) => `${count} imports out`}
      deltaUnknownLabel="not observed yet"
      contractTrackLabel="Contract"
      observationTrackLabel="Observation"
      observationStamp={null}
      deltaTrackLabel="Delta"
      deltaColumnHint="Each mark says what that role's own outgoing imports did."
      observationMissingLabel="Not inspected"
      observationEmptyTitle="Source not inspected yet"
      observationEmptyBody="Inspect source has an agent read the real imports and fill this in for each role."
      lowerOnlyRuleLabel="Each role may depend only on roles below it."
      selected={selected}
      roleInspectorOpen={false}
      onSelect={() => {}}
      roleLabel={(id) => id}
      moduleCountLabel={(n) => `${n} modules`}
      conceptCountLabel={(n) => `${n} concepts`}
      moduleCounts={null}
      conceptCounts={{}}
      hiddenRightLabel={(count) => `${count} more to the right`}
      hiddenLeftLabel={(count) => `${count} more to the left`}
      hiddenAboveLabel={(count) => `${count} more above`}
      hiddenBelowLabel={(count) => `${count} more below`}
      {...extra}
    />
  );
}

export function withGeometry(geometry: Record<string, number>, run: () => void) {
  const originals = Object.fromEntries(
    Object.keys(geometry).map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]),
  );
  for (const [key, value] of Object.entries(geometry))
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
  try {
    run();
  } finally {
    for (const [key, descriptor] of Object.entries(originals))
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

export function atXl(run: () => void) {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('1280'), media: query, onchange: null, dispatchEvent: () => false,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined,
  })) as typeof window.matchMedia;
  try {
    run();
  } finally {
    window.matchMedia = originalMatchMedia;
  }
}
