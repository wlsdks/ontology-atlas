import { describeBodyDelivery } from '../vault/documents/body-delivery.mjs';
import {
  REVIEWED_AT_KEY,
  REVIEWED_BY_KEY,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  reviewCurrentness,
} from '../schema.mjs';
import { readLibraryCollections } from './library-collections.mjs';
import { buildUidClaims, collectScopeRelations, resolveMember } from './constellation-scope.mjs';
import { compareText } from '../compare-text.mjs';

function purposeView(folder) {
  return typeof folder.purpose === 'string' && folder.purpose.trim()
    ? { status: 'recorded', value: folder.purpose.trim() }
    : { status: 'unknown' };
}

function constellationFolders(value) {
  return value.folders
    .filter((folder) => folder.presentation === 'constellation')
    .sort((a, b) => a.order - b.order || compareText(a.name, b.name) || compareText(a.id, b.id));
}

function itemsFor(value, folderId) {
  return value.items
    .filter((item) => item.folderId === folderId)
    .sort((a, b) => a.order - b.order || compareText(a.label, b.label) || compareText(a.id, b.id));
}

function paginate(rows, offset, limit) {
  if (offset > rows.length) {
    throw new Error(`offset must be less than or equal to the total matching rows (${rows.length}); Received: ${offset}.`);
  }
  const page = rows.slice(offset, offset + limit);
  const next = offset + page.length;
  return {
    rows: page,
    pagination: {
      offset,
      limit,
      total: rows.length,
      returned: page.length,
      hasMore: next < rows.length,
      nextOffset: next < rows.length ? next : null,
    },
  };
}

function unavailableList(source) {
  return {
    contract: 'savedConstellationList:v1',
    availability: source.availability,
    source,
    total: 0,
    returned: 0,
    limited: false,
    pagination: { offset: 0, limit: 0, total: 0, returned: 0, hasMore: false, nextOffset: null },
    constellations: [],
    guidance: source.availability === 'missing'
      ? 'No saved constellation file exists in this vault yet.'
      : 'Saved constellations are unavailable because the sidecar is corrupt or unsupported. Atlas did not repair or replace it.',
  };
}

function listSavedConstellations({ vaultRoot, offset = 0, limit = 50 }) {
  const loaded = readLibraryCollections(vaultRoot);
  if (loaded.source.availability !== 'ready') return unavailableList(loaded.source);
  const folders = constellationFolders(loaded.parsed.value);
  const { rows, pagination } = paginate(folders, offset, limit);
  const constellations = rows.map((folder) => {
    const items = itemsFor(loaded.parsed.value, folder.id);
    const ontologyMembers = items.filter((item) => item.target.kind === 'ontology').length;
    return {
      id: folder.id,
      name: folder.name.trim(),
      purpose: purposeView(folder),
      order: folder.order,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      memberCount: items.length,
      ontologyMemberCount: ontologyMembers,
      referenceMemberCount: items.length - ontologyMembers,
    };
  });
  return {
    contract: 'savedConstellationList:v1',
    availability: 'ready',
    source: loaded.source,
    total: folders.length,
    returned: constellations.length,
    limited: pagination.hasMore,
    pagination,
    constellations,
    guidance: 'This is saved task-scope metadata. Membership and purpose do not establish ontology relations, accepted meaning, currentness, or complete impact coverage.',
  };
}

function evidenceStartingPoints(doc) {
  const delivery = describeBodyDelivery(doc.body, { maxLen: 400 });
  return {
    implementationPath:
      typeof doc.frontmatter?.path === 'string' && doc.frontmatter.path.trim()
        ? doc.frontmatter.path
        : null,
    excerpt: delivery.text,
    excerptTruncated: delivery.info.truncated,
    bodyChars: delivery.info.totalChars,
  };
}

function describeMemberReview(doc) {
  const frontmatter = doc?.frontmatter ?? {};
  const state = frontmatter[REVIEW_STATE_KEY] ?? null;
  const note = frontmatter[REVIEW_NOTE_KEY] ?? null;
  const currentness = reviewCurrentness(frontmatter, doc?.body ?? '');
  return {
    state,
    ...(note ? { note } : {}),
    ...(frontmatter[REVIEWED_BY_KEY] ? { reviewedBy: frontmatter[REVIEWED_BY_KEY] } : {}),
    ...(frontmatter[REVIEWED_AT_KEY] ? { reviewedAt: frontmatter[REVIEWED_AT_KEY] } : {}),
    currentness,
    ...(state === REVIEW_STATE_HUMAN_DECIDES
      ? { agentGuidance: 'A person reserved this node. Atlas write tools refuse agent changes.' }
      : {}),
    ...(state === REVIEW_STATE_CONFIRMED && currentness === 'changed-since-review'
      ? { agentGuidance: 'This node changed after review. Treat its meaning as unreviewed.' }
      : {}),
  };
}

function resolvedMemberView(resolution) {
  const { item, doc, identityResolution } = resolution;
  return {
    itemId: item.id,
    requestedUid: item.target.uid,
    identityResolution,
    uid: doc.frontmatter.uid,
    slug: doc.slug,
    kind: doc.frontmatter.kind,
    title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
    domain: typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain : null,
    mtime: doc.mtime,
    review: describeMemberReview(doc),
    evidence: evidenceStartingPoints(doc),
  };
}

function selectedMemberView(item) {
  return {
    itemId: item.id,
    order: item.order,
    label: item.label.trim(),
    target: item.target,
  };
}

function getSavedConstellation({
  vaultRoot,
  id,
  docs,
  offset = 0,
  limit = 50,
  relationLimit = 100,
  dependencyLimit = 100,
}) {
  const loaded = readLibraryCollections(vaultRoot);
  if (loaded.source.availability !== 'ready') {
    return {
      contract: 'savedConstellationContext:v1',
      availability: loaded.source.availability,
      source: loaded.source,
      guidance: loaded.source.availability === 'missing'
        ? 'No saved constellation file exists in this vault yet.'
        : 'The saved constellation is unavailable because the sidecar is corrupt or unsupported. Atlas did not repair or replace it.',
    };
  }
  const folder = constellationFolders(loaded.parsed.value).find((candidate) => candidate.id === id);
  if (!folder) throw new Error(`Saved constellation not found: ${id}. Use list_constellations to see IDs in this vault.`);

  const allItems = itemsFor(loaded.parsed.value, folder.id);
  const { rows: pageItems, pagination } = paginate(allItems, offset, limit);
  const uidClaims = buildUidClaims(docs);
  const allOntologyItems = allItems.filter((item) => item.target.kind === 'ontology');
  const allResolutions = allOntologyItems.map((item) => resolveMember(item, uidClaims));
  const allResolved = allResolutions.filter((row) => row.ok);
  const pageItemIds = new Set(pageItems.map((item) => item.id));
  const pageResolutions = allResolutions.filter((row) => pageItemIds.has(row.ok ? row.item.id : row.itemId));
  const resolvedMembers = pageResolutions.filter((row) => row.ok).map(resolvedMemberView);
  const unresolvedMembers = pageResolutions.filter((row) => !row.ok);
  const graph = collectScopeRelations(docs, allResolved, relationLimit, dependencyLimit);

  return {
    contract: 'savedConstellationContext:v1',
    availability: 'ready',
    source: loaded.source,
    selection: {
      id: folder.id,
      name: folder.name.trim(),
      purpose: purposeView(folder),
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      memberCount: allItems.length,
      ontologyMemberCount: allOntologyItems.length,
      referenceMemberCount: allItems.length - allOntologyItems.length,
      members: pageItems.map(selectedMemberView),
      pagination,
    },
    current: {
      resolvedMembers,
      unresolvedMembers,
      resolvedMemberTotal: allResolved.length,
      unresolvedMemberTotal: allResolutions.length - allResolved.length,
    },
    relations: {
      total: graph.internalTotal,
      returned: graph.internal.length,
      limited: graph.internal.length < graph.internalTotal,
      rows: graph.internal,
    },
    outsideScopeDependencies: {
      total: graph.outsideTotal,
      returned: graph.outside.length,
      limited: graph.outside.length < graph.outsideTotal,
      rows: graph.outside,
    },
    coverage: {
      selectedMembership: 'saved_user_scope',
      memberFacts: pagination.offset > 0 || pagination.hasMore
        ? 'paged_current_facts'
        : 'complete_current_facts_for_saved_members',
      internalRelations: graph.internal.length < graph.internalTotal ? 'bounded_declared_edges' : 'all_declared_edges_between_resolved_saved_members',
      outsideScopeDependencies: graph.outside.length < graph.outsideTotal
        ? 'bounded_direct_declared_dependencies'
        : 'all_direct_declared_dependencies_crossing_saved_scope',
      transitiveImpactChecked: false,
      graphNodesScanned: graph.graphNodeCount,
      unresolvedGraphReferences: graph.unresolvedGraphReferences,
      unresolvedDependencyReferences: graph.unresolvedDependencyReferences,
      meaningAcceptanceInferred: false,
      completeImpactInferred: false,
    },
    guidance: 'Saved membership and purpose are user-authored task context. They do not create relations, prove accepted or current meaning, authorize writes, or establish a complete blast radius. Follow pagination and use graph/source reads when the task needs wider impact evidence.',
  };
}

export { getSavedConstellation, listSavedConstellations };
