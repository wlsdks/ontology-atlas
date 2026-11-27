// Which project and documents an agent brief covers, and the private source
// access it may use.

import { projectSourceSnapshotUnchanged } from '../../agent-brief/agent-brief-compact.mjs';
import { compileOntology } from '../../ontology-compiler.mjs';
import { queryCompiledOntology, shareArtifact } from '../../ontology-engine.mjs';
import { buildProjectSourceGraphHash } from '../../project-source/project-source-graph-hash.mjs';
import { readProjectSourceBindings, readProjectSourceView } from '../../project-source/project-source-receipt.mjs';
import { VAULT_ROOT } from '../../server/runtime.mjs';
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
    if (args.detail === 'compact') {
      throw new Error('agent_brief detail "compact" requires one selected kind: project node; this vault has none.');
    }
    const engineArgs = { ...args };
    delete engineArgs.detail;
    delete engineArgs.task;
    return {
      projectSlug: null,
      scope: null,
      scopedArtifact: artifact,
      result: queryCompiledOntology(artifact, engineArgs, { ontologyAtlasIgnorePatterns }),
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
  delete engineArgs.detail;
  delete engineArgs.task;
  const result = queryCompiledOntology(scopedArtifact, engineArgs, {
    ontologyAtlasIgnorePatterns,
    sourceDocs: scope.docs,
  });
  return { projectSlug, scope, scopedArtifact, result };
}

export function privateCurrentProjectSourceAccess(projectSlug, projectSource, graphHash, viewOptions = {}) {
  const receiptCurrent = projectSource?.status === 'verified_current'
    && projectSource?.currentness === 'current';
  // A receipt behind the source still opens the bound root when the live
  // probe confirms every recorded witness resolves: coordinates are then
  // verified against the live files, and the response says which revision.
  const liveSupported = !receiptCurrent
    && ['source_changed', 'ontology_changed'].includes(projectSource?.topGap?.id)
    && projectSource?.live?.status === 'witnesses_supported'
    && typeof projectSource?.live?.sourceFingerprint === 'string';
  if ((!receiptCurrent && !liveSupported) || typeof projectSource?.receipt?.sourceId !== 'string') return null;
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status !== 'ok') return null;
  const matches = sidecar.bindings.filter((binding) => (
    binding?.projectSlug === projectSlug
    && binding?.sourceId === projectSource.receipt.sourceId
    && typeof binding?.rootPath === 'string'
    && binding.rootPath.trim()
  ));
  if (matches.length !== 1) return null;
  return {
    rootPath: matches[0].rootPath,
    mode: liveSupported ? 'live' : 'receipt',
    confirmCurrent() {
      const refreshed = readProjectSourceView(VAULT_ROOT, projectSlug, graphHash, viewOptions);
      if (liveSupported) {
        return refreshed?.live?.status === 'witnesses_supported'
          && refreshed.live.sourceFingerprint === projectSource.live.sourceFingerprint
          && refreshed.live.sourceRevision === projectSource.live.sourceRevision;
      }
      return projectSourceSnapshotUnchanged(projectSource, refreshed);
    },
  };
}
