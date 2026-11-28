// Which project and documents an agent brief covers, and the private source
// access it may use.

import { compileOntology } from '../../ontology-compiler.mjs';
import { queryCompiledOntology, shareArtifact } from '../../ontology-engine.mjs';
import { buildProjectSourceGraphHash } from '../../project-source/project-source-graph-hash.mjs';
import { compareText } from '../../compare-text.mjs';

function resolveAgentBriefProject(artifact, requestedProject) {
  if (typeof requestedProject === 'string' && requestedProject.trim()) {
    return queryCompiledOntology(artifact, {
      operation: 'project_scope',
      project: requestedProject,
      limit: 1,
    }).project;
  }
  const projects = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => compareText(left, right));
  if (projects.length === 1) return projects[0];
  if (projects.length === 0) return null;
  throw new Error(
    `project is required when the vault contains multiple project nodes. Choose one of: ${projects.join(', ')}.`,
  );
}

function completeAgentBriefProjectScope(artifact, projectSlug, loadedDocs) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const included = new Set([projectSlug]);
  const queue = [projectSlug];
  const downward = new Set(['domains', 'capabilities', 'elements', 'contains']);
  const childrenByParent = new Map();
  const appendChild = (parent, child) => {
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(child);
  };
  for (const edge of edges) {
    if (edge?.resolved !== true) continue;
    if (downward.has(edge.via)) appendChild(edge.from, edge.to);
    if (edge.via === 'domain') appendChild(edge.to, edge.from);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const child of childrenByParent.get(current) ?? []) {
      if (included.has(child) || !nodeBySlug.has(child)) continue;
      included.add(child);
      queue.push(child);
    }
  }
  const rows = [...included]
    .map((slug) => nodeBySlug.get(slug))
    .filter(Boolean)
    .sort((left, right) => compareText(left.slug, right.slug));
  const docs = loadedDocs.filter((doc) => included.has(doc.slug));
  if (rows.length !== included.size || docs.length !== included.size) {
    throw new Error(
      `agent_brief blocked: selected project "${projectSlug}" contains a compiled node without one readable vault document. Run validate_vault and repair the missing document before using the handoff.`,
    );
  }
  const internalEdges = edges.filter((edge) => (
    edge?.resolved === true && included.has(edge.from) && included.has(edge.to)
  )).length;
  return {
    scope: {
      operation: 'project_scope',
      project: projectSlug,
      nodes: {
        total: rows.length,
        limited: false,
        rows: rows.map((node) => ({
          uid: node.uid,
          slug: node.slug,
          kind: node.kind,
          title: node.title,
          domain: node.domain,
          inDegree: node.inDegree ?? 0,
          outDegree: node.outDegree ?? 0,
        })),
      },
      summary: { nodes: rows.length, internalEdges },
    },
    docs,
    graphHash: buildProjectSourceGraphHash(projectSlug, docs),
  };
}

// The parent artifact is reused only while the vault's stamp-set version is
// unchanged. Keep at most one separately compiled project per parent, without
// retaining its source documents or older vault versions.
const lastProjectArtifact = new WeakMap();

export function scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns, loadedDocs) {
  const projectSlug = resolveAgentBriefProject(artifact, args.project);
  if (projectSlug === null) {
    return {
      projectSlug: null,
      scope: null,
      scopedArtifact: artifact,
      result: queryCompiledOntology(artifact, args, { ontologyAtlasIgnorePatterns }),
    };
  }
  const scope = completeAgentBriefProjectScope(artifact, projectSlug, loadedDocs);
  let scopedArtifact;
  if (scope.docs.length === loadedDocs.length) {
    // Identical compiler inputs: even ordinary non-node documents must be in
    // scope before the parent's counts and diagnostics can be reused verbatim.
    scopedArtifact = artifact;
  } else {
    const cached = lastProjectArtifact.get(artifact);
    if (cached?.projectSlug === projectSlug) {
      scopedArtifact = cached.artifact;
    } else {
      scopedArtifact = shareArtifact(compileOntology(scope.docs));
      lastProjectArtifact.set(artifact, { projectSlug, artifact: scopedArtifact });
    }
  }
  const engineArgs = { ...args, project: projectSlug };
  const result = queryCompiledOntology(scopedArtifact, engineArgs, {
    ontologyAtlasIgnorePatterns,
    sourceDocs: scope.docs,
  });
  return { projectSlug, scope, scopedArtifact, result };
}
