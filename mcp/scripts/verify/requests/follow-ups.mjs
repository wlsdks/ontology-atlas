export function buildGraphQuerySmokeArgs(listPayload, projectPayload = null) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const projectNodes = Array.isArray(projectPayload?.nodes) ? projectPayload.nodes : [];
  const candidateNodes = [...nodes, ...projectNodes];
  const projectSlug = nodes.find((node) => node?.kind === 'project' && typeof node.slug === 'string' && node.slug.length > 0)?.slug;
  const probedProjectSlug = projectNodes.find((node) => node?.kind === 'project' && typeof node.slug === 'string' && node.slug.length > 0)?.slug;
  const nonRootSlug = candidateNodes.find(
    (node) => (
      !['project', 'vault-readme'].includes(node?.kind)
      && typeof node?.slug === 'string'
      && node.slug.length > 0
    ),
  )?.slug;
  const resolvedProjectSlug = projectSlug || probedProjectSlug;
  // Prefer an element when the vault exposes one: it exercises the deepest
  // authored graph path instead of depending on filesystem-order census rows.
  const preferredElementSlug = candidateNodes.find(
    (node) => node?.kind === 'element' && typeof node?.slug === 'string' && node.slug.length > 0,
  )?.slug;
  const fallbackSlug = candidateNodes.find((node) => typeof node?.slug === 'string' && node.slug.length > 0)?.slug || null;
  const smokeSlug = preferredElementSlug || nonRootSlug || resolvedProjectSlug || fallbackSlug;
  const pathTarget = resolvedProjectSlug && resolvedProjectSlug !== smokeSlug ? resolvedProjectSlug : smokeSlug;
  return {
    slug: smokeSlug,
    pathTarget,
    project: resolvedProjectSlug || null,
    hasNode: Boolean(smokeSlug),
    hasProject: Boolean(resolvedProjectSlug),
  };
}

export function buildGraphQuerySmokeRequests(graphSmoke) {
  const requests = [];
  const expectedResponseIds = [];
  if (graphSmoke?.hasNode) {
    requests.push(
      {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'query_ontology', arguments: { operation: 'neighbors', slug: graphSmoke.slug, limit: 5 } },
      },
      {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: { name: 'query_ontology', arguments: { operation: 'path', from: graphSmoke.slug, to: graphSmoke.pathTarget || graphSmoke.slug } },
      },
      {
        jsonrpc: '2.0',
        id: 67,
        method: 'tools/call',
        params: {
          name: 'query_ontology',
          arguments: {
            operation: 'all_paths',
            from: graphSmoke.slug,
            to: graphSmoke.pathTarget || graphSmoke.slug,
            maxHops: 5,
            searchBudget: 1000,
            limit: 5,
          },
        },
      },
    );
    expectedResponseIds.push(13, 14, 67);
  }
  if (graphSmoke?.hasProject) {
    requests.push({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'project_scope', project: graphSmoke.project, limit: 5 } },
    });
    expectedResponseIds.push(15);
  }
  return { requests, expectedResponseIds };
}

export function buildLimitedQueryConceptsSmokeRequest(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slug = nodes.find((node) => typeof node?.slug === 'string' && node.slug.length > 0)?.slug;
  const total = Number.isInteger(listPayload?.total) ? listPayload.total : nodes.length;
  if (!slug || total <= 2) return null;
  return {
    request: {
      jsonrpc: '2.0',
      id: 37,
      method: 'tools/call',
      params: { name: 'query_concepts', arguments: { filter: `slug!=${slug}`, limit: 1 } },
    },
    excludedSlug: slug,
    expectedTotal: total - 1,
  };
}

export function buildDestructiveDryRunSmokeRequests(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slugs = nodes
    .map((node) => node?.slug)
    .filter((slug) => typeof slug === 'string' && slug.length > 0);
  const sourceSlug = slugs.find((slug) => slug !== 'README') ?? slugs[0];
  if (!sourceSlug) return { requests: [], expectedResponseIds: [] };

  const uniqueTargetSlug = `__ontology_atlas_verify_dry_run_target_${process.pid}_${Date.now()}`;
  const requests = [
    {
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: {
        name: 'rename_concept',
        arguments: { oldSlug: sourceSlug, newSlug: uniqueTargetSlug },
      },
    },
    {
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: { name: 'delete_concept', arguments: { slug: sourceSlug } },
    },
  ];
  const expectedResponseIds = [43, 45];
  const mergeTargetSlug = slugs.find((slug) => slug !== sourceSlug);
  if (mergeTargetSlug) {
    requests.splice(1, 0, {
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {
        name: 'merge_concepts',
        arguments: { fromSlug: sourceSlug, intoSlug: mergeTargetSlug },
      },
    });
    expectedResponseIds.splice(1, 0, 44);
  }
  return { requests, expectedResponseIds };
}

export function buildPatchConflictGuardSmokeRequest(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slug = nodes
    .filter((node) => node?.kind !== 'vault-readme' && node?.slug !== 'README')
    .map((node) => node?.slug)
    .find((candidate) => typeof candidate === 'string' && candidate.length > 0);
  if (!slug) return null;
  return {
    jsonrpc: '2.0',
    id: 61,
    method: 'tools/call',
    params: {
      name: 'patch_concept',
      arguments: {
        slug,
        frontmatter: { title: '__ontology_atlas_verify_conflict_probe__' },
        expected_mtime: 1,
      },
    },
  };
}

export function allGraphQuerySmokeResponseIds() {
  return buildGraphQuerySmokeRequests({
    slug: 'verify-smoke-node',
    pathTarget: 'verify-smoke-project',
    project: 'verify-smoke-project',
    hasNode: true,
    hasProject: true,
  }).expectedResponseIds;
}

export function buildGetConceptSmokeSlug(listPayload) {
  if (!Array.isArray(listPayload?.nodes)) return null;
  const nodesWithSlug = listPayload.nodes.filter((node) => (
    typeof node?.slug === 'string' && node.slug.length > 0
  ));
  return nodesWithSlug.find((node) => node.kind !== 'vault-readme')?.slug
    ?? nodesWithSlug[0]?.slug
    ?? null;
}

export function buildGetConceptsSmokeSlugs(listPayload) {
  const slugs = Array.isArray(listPayload?.nodes)
    ? listPayload.nodes
        .map((node) => node?.slug)
        .filter((slug) => typeof slug === 'string' && slug.length > 0)
        .slice(0, 2)
    : [];
  return [...slugs, 'missing-verify-slug'];
}
