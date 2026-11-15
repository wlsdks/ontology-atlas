import { EVIDENCE_SPECIMEN } from './evidence-specimen.generated';

/**
 * What the loop section's three cards show. Every concept, relation and file is this repository's
 * own `docs/ontology` (held by `LoopSection.test.tsx`); the commit and the proposal are examples,
 * and the section's note says so.
 */

/** The tool call an agent makes, and the part of the folder's answer the card shows. */
export const LOOP_READ = {
  tool: 'get_concept',
  slug: EVIDENCE_SPECIMEN.slug,
  concept: EVIDENCE_SPECIMEN.facts.name.nodeId,
  domain: 'domain:agent-access',
  path: EVIDENCE_SPECIMEN.facts.implPath,
  contains: ['element:mcp-server-runtime', 'element:mcp-rpc-envelope'],
  dependsOn: [EVIDENCE_SPECIMEN.facts.dependency.nodeId, 'capability:vault-validation'],
} as const;

/** Files of this repository, each with the concept whose `path` names it. */
export const LOOP_CHANGED = [
  { file: 'src/views/library/ui/LibraryPage.tsx', concept: 'capability:library-workspace' },
  { file: 'src/features/library/lib/wiki/judge-page-write.ts', concept: 'element:wiki-page-write-judge' },
  {
    file: 'src/features/saved-constellations/model/use-saved-constellations.ts',
    concept: 'capability:saved-constellations',
  },
] as const;

/** A relation the vault declares, shown as the change an agent asks to write. */
export const LOOP_PROPOSAL = {
  from: LOOP_READ.concept,
  to: 'capability:meaning-write-safety',
} as const;

export const kindOf = (id: string) => id.slice(0, id.indexOf(':'));
export const fileName = (file: string) => file.slice(file.lastIndexOf('/') + 1);
