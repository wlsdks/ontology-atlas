import { hasCapabilityImplementationEvidence } from '../graph-context/capability-evidence.mjs';
import { refMatchesOntologyAtlasIgnore } from '../../vault/sidecar/ontology-atlas-ignore.mjs';
import { orderUncertaintyReads } from '../../meaning/uncertainty-reads.mjs';
import { docBodyAnswer, docHasBody, docUncertaintyReads } from '../../vault/documents/doc-facts.mjs';
import { normalizeLimit, summarizeNode } from '../query-operation/query-primitives.mjs';

/** What the vault should add, repair or read next: relation recommendations and every growth candidate group. */
export function createGrowthQueries({
  cliPrefix,
  nodes,
  edges,
  nodeBySlug,
  sourceDocFor,
  ontologyAtlasIgnorePatterns,
  relationTypeForKey,
  bodyIsStarterTemplate,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  findNearMatchSlug,
  hasResolvedContainmentParent,
  hasResolvedEdge,
  inferKindFromRelation,
  normalizeRecommendRelationKind,
  resolveOptional,
  suggestedSlugForReference,
  titleFromReference,
}) {
  function externalElementCandidates(limit) {
    // A ref matching `.ontology-atlasignore` is intentional external code and is not
    // recommended for materialisation; the ignored count is returned so the smaller
    // number is explained.
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
        // A typo or missing-prefix dangling ref with one unambiguous existing match gets
        // `didYouMean` and no add_concept proposal, so an agent following proposedAction
        // never creates a duplicate; the row keeps the `resolve_dangling_reference` shape.
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
   * Capabilities that never reach code: no `elements:` edge and no canonical
   * `path:` entrypoint. Reported, not blocked (construction rule 5), so naming the
   * behavior before attaching its file stays possible.
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
   * Bridge nodes that group nothing. Emptiness alone is common and fine, so a node
   * must also have a same-kind containment parent or an untouched `add_concept`
   * starter body; without `sourceDocs` only the parent shape is checked.
   */
  function unearnedNodeCandidates(limit) {
    const rows = nodes
      .filter((node) => node.kind === 'capability')
      .filter((node) => containmentChildren(node.slug).filter(({ next }) => nodeBySlug.has(next)).length === 0)
      .map((node) => {
        const sameKindParent = containmentParentsFor(node.slug)
          .map(({ next }) => nodeBySlug.get(next))
          .find((parent) => parent?.kind === node.kind);
        const doc = sourceDocFor(node.slug);
        const starterBody = doc
          ? docBodyAnswer(doc, `starter\n${node.kind}\n${node.title}`, (body) => bodyIsStarterTemplate(node.kind, node.title, body))
          : false;
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
      // `element.domain` records membership and a resolved `elements` edge records
      // ownership; section 5 lets containment views show the inverse, so an owned element
      // needs no direct domain edge. Unowned elements fall through below.
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

  /**
   * The reads this vault's own `## Uncertainty` lines ask for, each returned with an
   * address. Without bodies the group says `no_bodies`, so "nothing to read" is
   * never confused with "nothing was handed over".
   */
  function nextReadCandidates(limit) {
    const docsWithBodies = nodes
      .map((node) => ({ node, doc: sourceDocFor(node.slug) }))
      .filter((entry) => docHasBody(entry.doc));
    if (docsWithBodies.length === 0) {
      return { total: 0, limited: false, rows: [], reason: 'no_bodies' };
    }
    const rows = [];
    for (const { node, doc } of docsWithBodies) {
      rows.push(
        ...docUncertaintyReads(doc, {
          slug: node.slug,
          kind: node.kind,
          title: node.title,
          path: typeof node.path === 'string' ? node.path : null,
        }),
      );
    }
    const ordered = orderUncertaintyReads(rows);
    return {
      total: ordered.length,
      limited: ordered.length > limit,
      rows: ordered.slice(0, limit),
      reason: null,
    };
  }

  function growthPlan(options = {}) {
    const limit = normalizeLimit(options.limit, 25);
    const relationRecommendations = recommendRelations({ limit });
    const externalElementRefs = externalElementCandidates(limit);
    const danglingReferences = danglingReferenceCandidates(limit);
    const unassignedNodes = unassignedNodeCandidates(limit);
    const emptyDomains = emptyDomainCandidates(limit);
    const nextReads = nextReadCandidates(limit);

    return {
      operation: 'growth_plan',
      summary: {
        relationRecommendations: relationRecommendations.totalRecommendations,
        externalElementRefs: externalElementRefs.total,
        externalElementRefsIgnored: externalElementRefs.ignored ?? 0,
        danglingReferences: danglingReferences.total,
        unassignedNodes: unassignedNodes.total,
        emptyDomains: emptyDomains.total,
        nextReads: nextReads.total,
        // Unchanged on purpose: `totalActions` counts pending writes, which other
        // surfaces read as "writes waiting"; a next read is not a write.
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
      nextReads,
    };
  }

  return {
    recommendRelations, growthPlan, externalElementCandidates, danglingReferenceCandidates,
    unassignedNodeCandidates, emptyDomainCandidates, capabilityWithoutEvidenceCandidates,
    unearnedNodeCandidates,
  };
}
