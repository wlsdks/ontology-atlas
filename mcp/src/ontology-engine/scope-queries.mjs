import { hasCapabilityImplementationEvidence } from '../capability-evidence.mjs';
import { refMatchesOntologyAtlasIgnore } from '../ontology-atlas-ignore.mjs';
import {
  edgeSortKey,
  formatPathEdge,
  normalizeDepth,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeSearchBudget,
  normalizeTypes,
  summarizeNode,
  typeAllowed,
} from './query-primitives.mjs';

export function createScopeQueries({
  cliPrefix,
  nodes,
  edges,
  nodeBySlug,
  sourceDocBySlug,
  outgoing,
  resolve,
  pathNodes,
  ontologyAtlasIgnorePatterns,
  relationTypeForKey,
  bodyIsStarterTemplate,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  containmentTraversalEdges,
  findNearMatchSlug,
  formatCompiledEdge,
  hasResolvedContainmentParent,
  hasResolvedEdge,
  inferKindFromRelation,
  limitLayers,
  normalizeCycle,
  normalizeOptionalString,
  normalizeRecommendRelationKind,
  partitionScopeEdges,
  resolveOptional,
  sortLineageRows,
  suggestedSlugForReference,
  titleFromReference,
  topHubs,
  uniqueEdges,
}) {
  function lineage(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const depth = normalizeDepth(options.depth, 20);
    const limit = normalizeLimit(options.limit);
    const ancestors = collectLineage(center, 'ancestors', depth, limit);
    const descendants = collectLineage(center, 'descendants', depth, limit);

    return {
      operation: 'lineage',
      center,
      node: nodeBySlug.get(center),
      depth,
      ancestors: {
        total: ancestors.rows.length,
        limited: ancestors.limited,
        nodes: ancestors.rows,
      },
      descendants: {
        total: descendants.rows.length,
        limited: descendants.limited,
        nodes: descendants.rows,
      },
      edges: uniqueEdges([...ancestors.edges, ...descendants.edges]).sort((a, b) =>
        edgeSortKey(a).localeCompare(edgeSortKey(b)),
      ),
    };
  }

  function containmentTree(slugOrAlias, options = {}) {
    const root = normalizeOptionalString(slugOrAlias, 'slug');
    const depth = normalizeDepth(options.depth, 20);
    const limit = normalizeLimit(options.limit, 200);
    const includeOrphans = normalizeOptionalBoolean(options.includeOrphans, 'includeOrphans', false);
    const rootSlugs = root
      ? [resolve(root, 'slug')]
      : defaultContainmentRoots(includeOrphans);
    const cycles = [];
    let emittedNodes = 0;
    let limited = false;

    const roots = [];
    for (const rootSlug of rootSlugs) {
      const tree = buildContainmentNode(rootSlug, null, 0, []);
      if (tree) roots.push(tree);
      if (limited) break;
    }

    return {
      operation: 'containment_tree',
      root: root ? rootSlugs[0] : null,
      depth,
      totalRoots: rootSlugs.length,
      emittedNodes,
      limited,
      roots,
      cycles,
    };

    function buildContainmentNode(slug, via, distance, path) {
      if (emittedNodes >= limit) {
        limited = true;
        return null;
      }
      emittedNodes += 1;
      const row = {
        slug,
        via,
        distance,
        node: summarizeNode(nodeBySlug.get(slug)),
        children: [],
      };
      if (distance >= depth) return row;

      for (const { next, edge } of containmentChildren(slug)) {
        if (path.includes(next)) {
          cycles.push({
            from: slug,
            to: next,
            via: edge.via,
            path: [...path, slug, next],
          });
          continue;
        }
        const child = buildContainmentNode(next, edge.via, distance + 1, [...path, slug]);
        if (child) row.children.push(child);
        if (limited) break;
      }
      return row;
    }
  }

  function defaultContainmentRoots(includeOrphans) {
    const projectRoots = nodes
      .filter((node) => node.kind === 'project')
      .map((node) => node.slug)
      .sort();
    if (projectRoots.length === 0) return ancestorlessRootSlugs(new Set());
    if (!includeOrphans) return projectRoots;

    const included = new Set();
    for (const rootSlug of projectRoots) {
      included.add(rootSlug);
      const queue = [rootSlug];
      // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        for (const { next } of containmentChildren(current)) {
          if (included.has(next)) continue;
          included.add(next);
          queue.push(next);
        }
      }
    }

    return [...projectRoots, ...ancestorlessRootSlugs(included)];
  }

  function resolveProjectRoot(slugOrAlias) {
    if (typeof slugOrAlias === 'string' && slugOrAlias.trim()) {
      const slug = resolve(slugOrAlias, 'project');
      const node = nodeBySlug.get(slug);
      if (node?.kind !== 'project') {
        throw new Error(`project "${slug}" must resolve to a kind: project node.`);
      }
      return slug;
    }
    const projectRoots = projectRootSlugs();
    if (projectRoots.length === 1) return projectRoots[0];
    if (projectRoots.length === 0) {
      throw new Error('project_scope requires a project slug because the compiled graph has no kind: project root.');
    }
    throw new Error(
      `project_scope requires a project slug because multiple project roots exist: ${projectRoots.join(', ')}`,
    );
  }

  function projectRootSlugs() {
    return nodes
      .filter((node) => node.kind === 'project')
      .map((node) => node.slug)
      .sort();
  }

  function resolveDomainRoot(slugOrAlias) {
    const slug = resolve(slugOrAlias, 'domain');
    const node = nodeBySlug.get(slug);
    if (node?.kind !== 'domain') {
      throw new Error(`domain "${slug}" must resolve to a kind: domain node.`);
    }
    return slug;
  }

  function collectContainmentScope(rootSlug) {
    const included = new Set([rootSlug]);
    const queue = [rootSlug];
    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const { next } of containmentChildren(current)) {
        if (included.has(next)) continue;
        included.add(next);
        queue.push(next);
      }
    }
    return included;
  }

  function nearestDomainFor(slug, scopeSlugs) {
    const node = nodeBySlug.get(slug);
    if (!node || !scopeSlugs.has(slug)) return null;
    if (node.kind === 'domain') return slug;
    const inlineDomain = resolveOptional(node.domain);
    if (inlineDomain && scopeSlugs.has(inlineDomain) && nodeBySlug.get(inlineDomain)?.kind === 'domain') {
      return inlineDomain;
    }
    const visited = new Set([slug]);
    const queue = [slug];
    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const { next } of containmentParentsFor(current)) {
        if (visited.has(next) || !scopeSlugs.has(next)) continue;
        const parent = nodeBySlug.get(next);
        if (parent?.kind === 'domain') return next;
        visited.add(next);
        queue.push(next);
      }
    }
    return null;
  }

  function intersectSlugSets(left, right) {
    return new Set([...left].filter((slug) => right.has(slug)));
  }

  function sortedNodesInScope(scopeSlugs) {
    return [...scopeSlugs]
      .map((slug) => nodeBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  function domainMapRow(domainSlug, domainScope, itemLimit) {
    const scopedNodes = sortedNodesInScope(domainScope);
    const edgesByScope = partitionScopeEdges(domainScope);
    const capabilities = scopedNodes.filter((node) => node.kind === 'capability');
    const elements = scopedNodes.filter((node) => node.kind === 'element');

    return {
      slug: domainSlug,
      node: summarizeNode(nodeBySlug.get(domainSlug)),
      summary: {
        nodes: scopedNodes.length,
        capabilities: capabilities.length,
        elements: elements.length,
        internalEdges: edgesByScope.internal.length,
        boundaryEdges: edgesByScope.boundary.length,
        externalEdges: edgesByScope.external.length,
        unresolvedEdges: edgesByScope.unresolved.length,
      },
      capabilities: limitedNodeList(capabilities, itemLimit),
      elements: limitedNodeList(elements, itemLimit),
      hotspots: topHubs(scopedNodes, Math.min(itemLimit, 5)),
    };
  }

  function externalElementCandidates(limit) {
    // A ref matching an `.ontology-atlasignore` pattern counts as *intentional
    // external code* and is skipped in the materialize recommendation. The ignored
    // count is exposed in the response so nobody has to ask why fewer external
    // refs appear than expected.
    const allExternal = edges.filter(
      (edge) => edge.external && edge.via === 'elements',
    );
    let ignored = 0;
    const kept = [];
    for (const edge of allExternal) {
      if (refMatchesOntologyAtlasIgnore(edge.ref, ontologyAtlasIgnorePatterns)) {
        ignored += 1;
        continue;
      }
      kept.push(edge);
    }
    const rows = kept
      .sort(compareEdges)
      .map((edge) => {
        const slug = suggestedSlugForReference(edge.ref, 'element');
        const sourceNode = nodeBySlug.get(edge.from);
        const domain = sourceNode?.kind === 'domain' ? sourceNode.slug : sourceNode?.domain;
        return {
          kind: 'materialize_external_element',
          score: 0.8,
          from: edge.from,
          ref: edge.ref,
          suggestedSlug: slug,
          reason: `${edge.from} references external element "${edge.ref}". Materialize it if this file should become a first-class ontology node.`,
          proposedAction: {
            tool: 'add_concept',
            args: {
              slug,
              kind: 'element',
              title: titleFromReference(edge.ref),
              ...(domain ? { domain } : {}),
              path: edge.ref,
            },
          },
          node: summarizeNode(sourceNode),
        };
      });

    const result = limitedCandidateGroup(rows, limit);
    if (ignored > 0) result.ignored = ignored;
    return result;
  }

  function danglingReferenceCandidates(limit) {
    const rows = edges
      .filter((edge) => !edge.resolved && !edge.external)
      .sort(compareEdges)
      .map((edge) => {
        const kind = inferKindFromRelation(edge.via);
        // R+ (agent-persona-2026-07 QA #4) — typo / missing folder-prefix
        // dangling refs (e.g. "checkout" when "domains/checkout" already
        // exists) used to always propose add_concept regardless, which
        // would create a duplicate node instead of fixing the reference.
        // When an unambiguous existing-node match is found, surface it as
        // `didYouMean` and suppress the add_concept proposal (kept `null`,
        // same as the existing "kind could not be inferred" case) so an
        // agent following proposedAction literally never manufactures a
        // duplicate — `reason` carries the correction instead. `kind` /
        // score / other fields stay on the same `resolve_dangling_reference`
        // shape other callers (growth/maintenance renderers, contract
        // checks) already expect.
        const didYouMean = findNearMatchSlug(edge.ref, nodes);
        return {
          kind: 'resolve_dangling_reference',
          score: didYouMean ? 0.85 : (kind ? 0.7 : 0.4),
          from: edge.from,
          ref: edge.ref,
          relation: edge.via,
          inferredKind: kind,
          suggestedSlug: kind ? suggestedSlugForReference(edge.ref, kind) : null,
          didYouMean: didYouMean || null,
          reason: didYouMean
            ? `Graph reference "${edge.ref}" from "${edge.from}" via "${edge.via}" does not resolve, but "${didYouMean}" is an existing node with a matching name: likely a missing folder prefix or typo. Fix the "${edge.via}" reference on "${edge.from}" (e.g. \`${cliPrefix} relate ${edge.from} ${didYouMean} ${relationTypeForKey[edge.via] || edge.via}\`, or edit the "domain:" field directly for a scalar reference) instead of creating a duplicate node.`
            : `Graph reference "${edge.ref}" from "${edge.from}" via "${edge.via}" does not resolve to a vault node.`,
          proposedAction: didYouMean
            ? null
            : kind
              ? {
                  tool: 'add_concept',
                  args: {
                    slug: suggestedSlugForReference(edge.ref, kind),
                    kind,
                    title: titleFromReference(edge.ref),
                  },
                }
              : null,
          node: summarizeNode(nodeBySlug.get(edge.from)),
        };
      });

    return limitedCandidateGroup(rows, limit);
  }

  function unassignedNodeCandidates(limit) {
    const rows = nodes
      .filter((node) => (node.kind === 'capability' || node.kind === 'element') && !resolveOptional(node.domain))
      .filter((node) => containmentParentsFor(node.slug).length === 0)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((node) => ({
        kind: 'unassigned_node',
        score: 0.5,
        slug: node.slug,
        reason: `${node.slug} has no resolved domain and no containment parent. Assign it to a domain or keep it intentionally global.`,
        node: summarizeNode(node),
      }));

    return limitedCandidateGroup(rows, limit);
  }

  function emptyDomainCandidates(limit) {
    const rows = nodes
      .filter((node) => node.kind === 'domain')
      .filter((node) => !containmentChildren(node.slug).some(({ next }) => {
        const child = nodeBySlug.get(next);
        return child?.kind === 'capability' || child?.kind === 'element';
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((node) => ({
        kind: 'empty_domain',
        score: 0.4,
        slug: node.slug,
        reason: `${node.slug} has no contained capability or element nodes yet.`,
        node: summarizeNode(node),
      }));

    return limitedCandidateGroup(rows, limit);
  }

  /**
   * Capabilities that never reach code.
   *
   * ## Why the predicate is "no `elements:` edge at all", not "no children"
   *
   * `retire_unearned_node` below explains why "a capability with no resolved
   * children" is too loud a signal: capabilities routinely name a behavior whose
   * elements have no node yet. This check counts either a real element relation or
   * the capability's canonical `path:` entrypoint as evidence. A raw path inside
   * `elements:` is still noticed by the write gate as a category error.
   *
   * ## Why this reports instead of blocking
   *
   * Construction rule 5: the procedure never blocks a write. Refusing an
   * evidence-less capability would push agents to work around the tool, and the
   * honest sequence — name the behavior first, attach the file second — would
   * become impossible. So this is `review` / `info`: the write succeeds, and the
   * queue remembers what is still unproven.
   */
  function capabilityWithoutEvidenceCandidates(limit) {
    const hasElementsEdge = new Set(
      edges
        .filter((edge) => edge.via === 'elements' && edge.resolved === true)
        .map((edge) => edge.from),
    );
    const rows = nodes
      .filter((node) => node.kind === 'capability')
      .filter(
        (node) =>
          !hasCapabilityImplementationEvidence({
            path: node.path,
            hasElementsEdge: hasElementsEdge.has(node.slug),
          }),
      )
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((node) => ({
        kind: 'capability_without_evidence',
        score: 0.5,
        slug: node.slug,
        reason: `"${node.slug}" has neither a canonical \`path:\` entrypoint nor an \`elements:\` relation to a real implementation concept, so nothing in the vault says where this behavior lives in code. An agent handed only this vault can describe the capability and cannot open it. Patch \`path:\` with one repo-relative file or directory; add an element node only when a distinct implementation role earns ontology identity. This never blocked the write and does not block one now; it stays here until the capability points at something.`,
        node: summarizeNode(node),
      }));

    // `slugs` carries every match, not just the returned page — the write-path
    // finding for the same node is deduped against it below, and a node that
    // fell off the page is still the same node.
    return { ...limitedCandidateGroup(rows, limit), slugs: rows.map((row) => row.slug) };
  }

  /**
   * Bridge nodes that group nothing — the fourth bridge condition, enforced.
   *
   * ## Why the predicate is this narrow
   *
   * "A capability with no children" is NOT the signal. Measured on this repo's own
   * vault: 20 of 38 capabilities have zero resolved children, and they are fine —
   * they are documented behaviors whose elements simply have no nodes yet. Firing
   * on all of them would bury the real case under twenty false alarms, and a
   * channel that cries wolf gets filtered out, which is how a check like this
   * quietly stops working.
   *
   * So emptiness alone is not enough. There has to be positive evidence the node
   * was *meant* to group, and there are exactly two shapes of that:
   *
   *   1. **A same-kind containment parent.** A capability under a capability only
   *      happens when someone inserted a layer — the four-kind hierarchy is
   *      otherwise flat (project → domain → capability → element). Measured: 0
   *      such nodes exist in this vault today, so this half has no false positives
   *      at all right now.
   *   2. **An untouched starter body.** `add_concept` fills a kind-specific
   *      template when no body is given; a node still carrying it verbatim was
   *      created and abandoned. Measured: 0 in this vault today.
   *
   * Both halves are zero today, which is the point — this audit reports nothing
   * until someone actually leaves a bridge empty.
   *
   * Bodies only exist when the caller passes `sourceDocs`; without them the check
   * degrades to shape (1) rather than guessing.
   */
  function unearnedNodeCandidates(limit) {
    const rows = nodes
      .filter((node) => node.kind === 'capability')
      .filter((node) => containmentChildren(node.slug).filter(({ next }) => nodeBySlug.has(next)).length === 0)
      .map((node) => {
        const sameKindParent = containmentParentsFor(node.slug)
          .map(({ next }) => nodeBySlug.get(next))
          .find((parent) => parent?.kind === node.kind);
        const doc = sourceDocBySlug.get(node.slug);
        const starterBody = doc ? bodyIsStarterTemplate(node.kind, node.title, doc.body) : false;
        return { node, sameKindParent, starterBody };
      })
      .filter((row) => row.sameKindParent || row.starterBody)
      .sort((a, b) => a.node.slug.localeCompare(b.node.slug))
      // `starterBody` did its job in the filter above; past this point the two
      // shapes are told apart by `sameKindParent` alone.
      .map(({ node, sameKindParent }) => ({
        kind: 'retire_unearned_node',
        score: 0.55,
        slug: node.slug,
        reason: sameKindParent
          ? `${node.slug} sits under "${sameKindParent.slug}", a node of its own kind, but groups nothing: it has no children that resolve to real nodes. A bridge node earns its place by holding the children it was created for. Either patch_concept the children that share its behavior to point at it, or delete_concept it; an empty layer adds a hop to every path through it and answers no question.`
          : `${node.slug} still carries the starter body it was created with and groups nothing. It was created and never given meaning. Either write what it covers and reparent the children that belong to it, or delete_concept it.`,
        node: summarizeNode(node),
      }));

    return limitedCandidateGroup(rows, limit);
  }

  function limitedCandidateGroup(rows, limit) {
    return {
      total: rows.length,
      limited: rows.length > limit,
      rows: rows.slice(0, limit),
    };
  }

  function limitedNodeList(rows, limit) {
    return {
      total: rows.length,
      limited: rows.length > limit,
      nodes: rows.slice(0, limit).map(summarizeNode),
    };
  }

  function ancestorlessRootSlugs(excluded) {
    return nodes
      .filter((node) => !excluded.has(node.slug) && containmentTraversalEdges(node.slug, 'ancestors').length === 0)
      .map((node) => node.slug)
      .sort();
  }

  function collectLineage(center, mode, depth, limit) {
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const rows = [];
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];
    let limited = false;

    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      if (current.distance >= depth) continue;

      for (const { next, edge } of containmentTraversalEdges(current.slug, mode)) {
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const row = {
          slug: next,
          distance: current.distance + 1,
          via: edge.via,
          node: summarizeNode(nodeBySlug.get(next)),
        };
        discovered.set(next, row);
        rows.push(row);
        queue.push(row);
        if (rows.length >= limit) {
          limited = true;
          return { rows: sortLineageRows(rows), edges: collectedEdges, limited };
        }
      }
    }

    return { rows: sortLineageRows(rows), edges: collectedEdges, limited };
  }

  function cycles(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const maxDepth = normalizeDepth(options.maxHops ?? options.depth, 8);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const searchBudget = normalizeSearchBudget(options.searchBudget);
    const cycleMap = new Map();
    const sortedNodes = [...nodes].sort((a, b) => a.slug.localeCompare(b.slug));
    // This DFS enumerates paths, so it is exponential. The only early exit used to
    // be `cycleMap.size > limit`, which fires **only when a cycle is found**. So a
    // graph with no cycles — exactly the case where a user calls this "to check it
    // is healthy" — exhausts the entire path space (measured: 60 nodes, 444 edges,
    // 0 cycles → 10.9s; MCP is single-threaded stdio, so the whole agent surface
    // is frozen for that long).
    //
    // `allPaths` already carries a budget, `truncatedByBudget`, and an evidence
    // contract for the same explosion. That grammar is transplanted rather than a
    // second mechanism invented. **Silent truncation is forbidden in this
    // repository**, so hitting the budget reports `exhaustive: false`.
    let expandedStates = 0;
    let truncatedByBudget = false;

    for (const node of sortedNodes) {
      if (cycleMap.size > limit || truncatedByBudget) break;
      findCyclesFrom(node.slug, node.slug, [node.slug], [], new Set([node.slug]));
    }

    const rows = [...cycleMap.values()].sort(
      (a, b) => a.length - b.length || a.nodes.join('\0').localeCompare(b.nodes.join('\0')),
    );

    const complete = !truncatedByBudget && rows.length <= limit;
    return {
      operation: 'cycles',
      relationTypes: [...typeSet].sort(),
      maxDepth,
      searchBudget,
      expandedStates,
      exhaustive: !truncatedByBudget,
      truncatedByBudget,
      totalCycles: rows.length,
      // Once the budget is hit, "0" means "not fully examined", not "none".
      // Without this field, zero cycles reads as acyclic.
      totalCyclesExact: !truncatedByBudget,
      limited: rows.length > limit || truncatedByBudget,
      cycles: rows.slice(0, limit),
      evidence: {
        status: complete ? 'complete' : 'partial',
        reason: truncatedByBudget ? 'search_budget' : rows.length > limit ? 'limit' : 'complete',
        nextStep: complete ? 'use' : 'narrow',
        recommendation: complete
          ? 'Safe to treat totalCycles as complete for the requested bounds: zero means acyclic within maxDepth.'
          : truncatedByBudget
            ? 'Search budget hit before the graph was exhausted; zero cycles here does NOT mean acyclic. Reduce maxHops, narrow types, or raise searchBudget.'
            : 'totalCycles is exact, but the list is truncated by limit; raise limit to see the rest.',
        saferQuery: complete
          ? undefined
          : {
              operation: 'cycles',
              maxHops: maxDepth > 2 ? maxDepth - 2 : maxDepth,
              limit: Math.min(limit, 10),
              searchBudget: Math.min(searchBudget, 1000),
              types: [...typeSet].sort(),
            },
      },
    };

    function findCyclesFrom(start, current, path, edgePath, visited) {
      if (path.length > maxDepth || cycleMap.size > limit || truncatedByBudget) return;
      if (expandedStates >= searchBudget) {
        truncatedByBudget = true;
        return;
      }
      expandedStates += 1;

      for (const edge of outgoing.get(current) || []) {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
        // **An edge pointing at itself is a cycle too** (measured 2026-07-29).
        //
        // The `path.length > 1` gate excluded length-1 cycles (self-loops)
        // entirely. So `cycles` returned `totalCycles: 0` with `exhaustive: true`
        // attached, asserting *"zero means acyclic within maxDepth"*, while on the
        // same graph `topological_order` returned `acyclic: false` — and `health`
        // carried both **in one response** (`dependencyCycles: 0` alongside
        // `dependencyOrderAcyclic: false`).
        //
        // `add_relation` accepts a self-edge as normal, so they are easy to make.
        // Length-2 cycles were caught and only length-1 slipped through, leaving
        // the user no way to work out why just this one was missed.
        if (edge.to === start && (path.length > 1 || edge.to === current)) {
          const cycle = normalizeCycle(path, [...edgePath, edge]);
          if (!cycleMap.has(cycle.key) && cycleMap.size <= limit) {
            cycleMap.set(cycle.key, {
              id: cycle.key,
              length: cycle.nodes.length - 1,
              nodes: cycle.nodes,
              nodeSummaries: pathNodes(cycle.nodes),
              edges: cycle.edges.map(formatCompiledEdge),
            });
          }
          continue;
        }
        if (visited.has(edge.to) || path.length >= maxDepth) continue;
        visited.add(edge.to);
        findCyclesFrom(start, edge.to, [...path, edge.to], [...edgePath, edge], visited);
        visited.delete(edge.to);
      }
    }
  }

  function topologicalOrder(options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const includeIsolated = normalizeOptionalBoolean(options.includeIsolated, 'includeIsolated', false);
    const selectedEdges = edges.filter((edge) => edge.resolved && typeAllowed(edge.via, typeSet));
    const slugs = new Set();
    const adjacency = new Map();
    const indegree = new Map();
    const edgePairs = new Set();

    if (includeIsolated) {
      for (const node of nodes) slugs.add(node.slug);
    }

    for (const edge of selectedEdges) {
      slugs.add(edge.from);
      slugs.add(edge.to);
      const prerequisite = edge.to;
      const dependent = edge.from;
      const pairKey = `${prerequisite}\0${dependent}`;
      if (edgePairs.has(pairKey)) continue;
      edgePairs.add(pairKey);
      if (!adjacency.has(prerequisite)) adjacency.set(prerequisite, new Set());
      adjacency.get(prerequisite).add(dependent);
      indegree.set(dependent, (indegree.get(dependent) || 0) + 1);
      if (!indegree.has(prerequisite)) indegree.set(prerequisite, 0);
    }

    for (const slug of slugs) {
      if (!adjacency.has(slug)) adjacency.set(slug, new Set());
      if (!indegree.has(slug)) indegree.set(slug, 0);
    }

    const ordered = [];
    const layers = [];
    let ready = [...slugs].filter((slug) => indegree.get(slug) === 0).sort();
    let rank = 0;

    while (ready.length > 0) {
      const layer = ready;
      layers.push({ rank, nodes: layer.map((slug) => summarizeNode(nodeBySlug.get(slug))) });
      for (const slug of layer) ordered.push({ rank, slug, node: summarizeNode(nodeBySlug.get(slug)) });

      const nextReady = [];
      for (const slug of layer) {
        for (const next of [...(adjacency.get(slug) || [])].sort()) {
          indegree.set(next, indegree.get(next) - 1);
          if (indegree.get(next) === 0) nextReady.push(next);
        }
      }
      ready = [...new Set(nextReady)].sort();
      rank += 1;
    }

    const blocked = [...slugs]
      .filter((slug) => (indegree.get(slug) || 0) > 0)
      .sort()
      .map((slug) => ({
        slug,
        remainingInDegree: indegree.get(slug),
        node: summarizeNode(nodeBySlug.get(slug)),
      }));

    return {
      operation: 'topological_order',
      relationTypes: [...typeSet].sort(),
      prerequisiteFirst: true,
      includeIsolated,
      acyclic: blocked.length === 0,
      totalNodes: slugs.size,
      orderedCount: ordered.length,
      selectedEdges: selectedEdges.length,
      limited: ordered.length > limit,
      order: ordered.slice(0, limit),
      layers: limitLayers(layers, limit),
      blocked,
    };
  }

  function recommendRelations(options = {}) {
    const limit = normalizeLimit(options.limit, 50);
    const kindFilter = normalizeRecommendRelationKind(options.kind);
    const recommendations = [];

    for (const node of [...nodes].sort((a, b) => a.slug.localeCompare(b.slug))) {
      if (node.kind !== 'capability' && node.kind !== 'element') continue;
      if (kindFilter && node.kind !== kindFilter) continue;
      const domainSlug = resolveOptional(node.domain);
      if (!domainSlug) continue;
      const relation = node.kind === 'capability' ? 'capabilities' : 'elements';
      // `element.domain` already records domain membership, while a resolved
      // capability/project `elements` edge records ownership. Section 5 permits
      // containment views to display the domain inverse without writing it.
      // Recommending a second direct domain edge in that shape makes an exact
      // approved plan look unfinished after it lands. Unowned elements still
      // fall through to the direct-domain recommendation below.
      if (node.kind === 'element' && hasResolvedContainmentParent(node.slug)) {
        continue;
      }
      if (hasResolvedEdge(domainSlug, node.slug, relation) || hasResolvedEdge(domainSlug, node.slug, 'contains')) {
        continue;
      }

      recommendations.push({
        kind: 'missing_domain_containment',
        score: 1,
        from: domainSlug,
        to: node.slug,
        relation,
        reason: `${node.slug} has domain "${node.domain}", but ${domainSlug} does not link back via ${relation}.`,
        proposedAction: {
          tool: 'add_relation',
          args: {
            from: domainSlug,
            to: node.slug,
            type: relation,
          },
        },
        nodes: {
          from: summarizeNode(nodeBySlug.get(domainSlug)),
          to: summarizeNode(node),
        },
      });
    }

    return {
      operation: 'recommend_relations',
      mode: 'domain_containment',
      totalRecommendations: recommendations.length,
      limited: recommendations.length > limit,
      recommendations: recommendations.slice(0, limit),
    };
  }

  function growthPlan(options = {}) {
    const limit = normalizeLimit(options.limit, 25);
    const relationRecommendations = recommendRelations({ limit });
    const externalElementRefs = externalElementCandidates(limit);
    const danglingReferences = danglingReferenceCandidates(limit);
    const unassignedNodes = unassignedNodeCandidates(limit);
    const emptyDomains = emptyDomainCandidates(limit);

    return {
      operation: 'growth_plan',
      summary: {
        relationRecommendations: relationRecommendations.totalRecommendations,
        externalElementRefs: externalElementRefs.total,
        externalElementRefsIgnored: externalElementRefs.ignored ?? 0,
        danglingReferences: danglingReferences.total,
        unassignedNodes: unassignedNodes.total,
        emptyDomains: emptyDomains.total,
        totalActions:
          relationRecommendations.totalRecommendations +
          externalElementRefs.total +
          danglingReferences.total,
      },
      relationRecommendations,
      externalElementRefs,
      danglingReferences,
      unassignedNodes,
      emptyDomains,
    };
  }

  /**
   * Write-path gate findings → maintenance actions, on the existing channel.
   *
   * Three deliberate absences, each of them a rule the council applied:
   *
   * 1. **No `resolve_dangling_reference` row here.** The gate classifies plain
   *    unresolved references — that classification is what tells a path-shaped
   *    entry apart from a mistyped slug — but `danglingReferenceCandidates()`
   *    above already reports them from the same post-write vault. Emitting both
   *    would put the same fact in one payload twice, and a channel that repeats
   *    itself gets filtered. No union.
   * 2. **No `proposedAction`.** Every row here is a review action. The 92 exist
   *    because the one prescription on offer was "create the node", and an agent
   *    that follows a scaffold literally answers 92 unresolved strings by
   *    manufacturing 92 nodes. The `reason` names both exits in prose and lets
   *    the caller choose; the same restraint the `didYouMean` branch already
   *    applies a few functions above.
   * 3. **No count anywhere in the wording.** `fold_bulk_siblings` reports how
   *    many siblings one batch made, never how many a parent may have.
   */
  return {
    lineage, containmentTree, cycles, topologicalOrder, recommendRelations, growthPlan,
    collectContainmentScope, collectLineage, domainMapRow, intersectSlugSets, nearestDomainFor,
    resolveDomainRoot, resolveProjectRoot, projectRootSlugs, sortedNodesInScope, limitedNodeList,
    externalElementCandidates, danglingReferenceCandidates, unassignedNodeCandidates,
    emptyDomainCandidates, capabilityWithoutEvidenceCandidates, unearnedNodeCandidates,
  };
}
