import { EVIDENCE_SPECIMEN } from './evidence-specimen.generated';

export type CastKind = 'project' | 'domain' | 'capability' | 'element';

interface CastConcept {
  id: string;
  kind: CastKind;
  parent: string | null;
  file: string | null;
}

export interface CastRelation {
  from: string;
  to: string;
  relation: 'contains' | 'depends';
}

const PROJECT = 'project:ontology-atlas';

function cast(id: string, parent: string | null, file: string | null = null): CastConcept {
  return { id, kind: id.slice(0, id.indexOf(':')) as CastKind, parent, file };
}

export const CONDUCTION_CAST: readonly CastConcept[] = [
  cast(PROJECT, null),
  cast('domain:human-workbench', PROJECT),
  cast('domain:meaning-layer', PROJECT),
  cast('domain:code-evidence', PROJECT),
  cast('domain:agent-access', PROJECT),
  cast('capability:ontology-map', 'domain:human-workbench', 'src/views/home/ui/TopologyMapRenderer.tsx'),
  cast('capability:meaning-write-review', 'domain:human-workbench', 'src/features/ontology-change-review/index.ts'),
  cast('capability:meaning-write-safety', 'domain:meaning-layer', 'mcp/src/write-consent.mjs'),
  cast('capability:construction-guidance', 'domain:meaning-layer', 'mcp/src/construction-rules.mjs'),
  cast('capability:vault-validation', 'domain:meaning-layer', 'mcp/src/validate.mjs'),
  cast('capability:import-dependency-inference', 'domain:code-evidence', 'mcp/src/infer-imports.mjs'),
  cast('capability:evidence-drift-detection', 'domain:code-evidence', 'mcp/src/detect-drift.mjs'),
  cast('capability:in-app-coding-agent', 'domain:agent-access', 'src/features/acp-session/model/use-acp-session.ts'),
  cast('capability:task-agent-brief', 'domain:agent-access', 'mcp/src/agent-brief-compact.mjs'),
  cast(EVIDENCE_SPECIMEN.facts.name.nodeId, 'domain:agent-access', EVIDENCE_SPECIMEN.facts.implPath),
  cast('element:map-camera', 'capability:ontology-map', 'src/widgets/ontology-map/engine/camera.ts'),
  cast('element:vault-file-store', 'capability:meaning-write-safety', 'mcp/src/vault/documents.mjs'),
  cast('element:meaning-gap-findings', 'capability:vault-validation', 'mcp/src/meaning-findings.mjs'),
  cast('element:acp-permission-scope', 'capability:in-app-coding-agent', 'src/features/acp-session/model/permission-scope.ts'),
  cast('element:mcp-server-runtime', EVIDENCE_SPECIMEN.facts.name.nodeId, 'mcp/src/server/runtime.mjs'),
  cast('element:mcp-rpc-envelope', EVIDENCE_SPECIMEN.facts.name.nodeId, 'mcp/src/server/rpc.mjs'),
];

export const CONDUCTION_QUERY = {
  tool: 'get_concept',
  slug: EVIDENCE_SPECIMEN.slug,
  concept: EVIDENCE_SPECIMEN.facts.name.nodeId,
} as const;

export const CONDUCTION_ANSWER: readonly CastRelation[] = [
  { from: 'domain:agent-access', to: CONDUCTION_QUERY.concept, relation: 'contains' },
  { from: CONDUCTION_QUERY.concept, to: 'element:mcp-server-runtime', relation: 'contains' },
  { from: CONDUCTION_QUERY.concept, to: 'element:mcp-rpc-envelope', relation: 'contains' },
  { from: CONDUCTION_QUERY.concept, to: EVIDENCE_SPECIMEN.facts.dependency.nodeId, relation: 'depends' },
  { from: CONDUCTION_QUERY.concept, to: 'capability:vault-validation', relation: 'depends' },
  { from: CONDUCTION_QUERY.concept, to: 'capability:import-dependency-inference', relation: 'depends' },
  { from: CONDUCTION_QUERY.concept, to: 'capability:task-agent-brief', relation: 'depends' },
  { from: 'capability:in-app-coding-agent', to: CONDUCTION_QUERY.concept, relation: 'depends' },
];

export const CONDUCTION_PROPOSAL: CastRelation = {
  from: CONDUCTION_QUERY.concept,
  to: 'capability:meaning-write-safety',
  relation: 'depends',
};

export function castContains(): CastRelation[] {
  return CONDUCTION_CAST.filter((concept) => concept.parent !== null).map((concept) => ({
    from: concept.parent!,
    to: concept.id,
    relation: 'contains' as const,
  }));
}

export function answeredNeighbours(): string[] {
  const seen = new Set<string>();
  for (const relation of CONDUCTION_ANSWER) {
    if (relation.relation !== 'depends') continue;
    seen.add(relation.from === CONDUCTION_QUERY.concept ? relation.to : relation.from);
  }
  return [...seen];
}
