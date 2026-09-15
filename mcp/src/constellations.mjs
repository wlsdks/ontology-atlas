import { createHash } from 'node:crypto';
import {
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  collectNeighborRefs,
  describeBodyDelivery,
  relationNoteFor,
} from './vault.mjs';
import {
  REVIEWED_AT_KEY,
  REVIEWED_BY_KEY,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  reviewCurrentness,
} from './schema.mjs';

const LIBRARY_COLLECTIONS_SCHEMA = 'ontology-atlas/library-collections/v1';
const LIBRARY_COLLECTIONS_PATH = '.ontology-atlas/library-collections.json';
const LIBRARY_COLLECTIONS_MAX_BYTES = 1024 * 1024;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function emptyLibraryCollections() {
  return { schema: LIBRARY_COLLECTIONS_SCHEMA, folders: [], items: [] };
}

function exactPath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    /^[a-zA-Z]:/.test(value) ||
    value.includes('\\')
  ) return false;
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
    return false;
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function targetKey(target) {
  return target.kind === 'ontology' ? `ontology:${target.uid}` : `${target.kind}:${target.path}`;
}

function validInstant(value) {
  return typeof value === 'string' && ISO_INSTANT_RE.test(value) && Number.isFinite(Date.parse(value));
}

function assertFolderMoveIsAcyclic(folders, folderId, parentId) {
  if (folderId === parentId) throw new Error('A collection folder cannot contain itself.');
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (!byId.has(folderId)) throw new Error('The collection folder does not exist.');
  let cursor = parentId;
  const visited = new Set();
  while (cursor !== null) {
    if (cursor === folderId) throw new Error('A collection folder cannot move into its descendant.');
    if (visited.has(cursor)) throw new Error('The collection folder hierarchy contains a cycle.');
    visited.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) throw new Error('The destination collection folder does not exist.');
    cursor = parent.parentId;
  }
}

function validateLibraryCollections(value) {
  if (!value || typeof value !== 'object') throw new Error('The collection file must contain an object.');
  if (!Array.isArray(value.folders) || !Array.isArray(value.items)) {
    throw new Error('Folders and items must be arrays.');
  }
  const folders = value.folders;
  const items = value.items;
  const folderIds = new Set();
  for (const folder of folders) {
    if (
      !folder ||
      !UUID_V4_RE.test(folder.id) ||
      typeof folder.name !== 'string' ||
      !folder.name.trim() ||
      folder.name.length > 120 ||
      (folder.parentId !== null && !UUID_V4_RE.test(folder.parentId)) ||
      !Number.isSafeInteger(folder.order) ||
      folder.order < 0
    ) {
      throw new Error('A collection folder is invalid.');
    }
    if (folder.presentation === 'constellation') {
      if (
        folder.parentId !== null ||
        (folder.purpose !== undefined &&
          (typeof folder.purpose !== 'string' || folder.purpose.length > 4000)) ||
        !validInstant(folder.createdAt) ||
        !validInstant(folder.updatedAt)
      ) {
        throw new Error('A constellation folder is invalid.');
      }
    } else if (
      folder.presentation !== undefined ||
      folder.purpose !== undefined ||
      folder.createdAt !== undefined ||
      folder.updatedAt !== undefined
    ) {
      throw new Error('Constellation metadata requires the constellation presentation.');
    }
    if (folderIds.has(folder.id)) throw new Error('Collection folder IDs must be unique.');
    folderIds.add(folder.id);
  }
  for (const folder of folders) {
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) {
      throw new Error('A collection folder has a missing parent.');
    }
  }
  for (const folder of folders) assertFolderMoveIsAcyclic(folders, folder.id, folder.parentId);

  const itemIds = new Set();
  const placements = new Set();
  for (const item of items) {
    if (
      !item ||
      !UUID_V4_RE.test(item.id) ||
      (item.folderId !== null && !folderIds.has(item.folderId)) ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      item.label.length > 240 ||
      !Number.isSafeInteger(item.order) ||
      item.order < 0 ||
      !item.target ||
      typeof item.target !== 'object'
    ) {
      throw new Error('A collection item is invalid.');
    }
    const target = item.target;
    const invalidTarget = target.kind === 'source' || target.kind === 'wiki'
      ? !exactPath(target.path)
      : target.kind === 'ontology'
        ? !UUID_V4_RE.test(target.uid) || !exactPath(target.lastKnownPath)
        : true;
    if (invalidTarget) throw new Error('A collection target is invalid.');
    if (itemIds.has(item.id)) throw new Error('Collection item IDs must be unique.');
    itemIds.add(item.id);
    const placement = `${item.folderId}\0${targetKey(target)}`;
    if (placements.has(placement)) throw new Error('The same target cannot appear twice in one folder.');
    placements.add(placement);
  }
  return { schema: LIBRARY_COLLECTIONS_SCHEMA, folders, items };
}

function parseLibraryCollections(raw) {
  if (raw === null) return { status: 'missing', value: emptyLibraryCollections() };
  if (Buffer.byteLength(raw, 'utf8') > LIBRARY_COLLECTIONS_MAX_BYTES) {
    return { status: 'corrupt', raw, reason: 'The collection file exceeds the 1 MiB limit.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw, reason: 'The collection file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || parsed.schema !== LIBRARY_COLLECTIONS_SCHEMA) {
    return {
      status: 'unsupported',
      raw,
      reason: 'The collection file uses an unsupported schema version.',
    };
  }
  try {
    return { status: 'ready', value: validateLibraryCollections(parsed) };
  } catch (error) {
    return {
      status: 'corrupt',
      raw,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function inside(root, candidate) {
  if (candidate === root) return true;
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sourceDescriptor(status, { raw = null, mtime = null, reason } = {}) {
  return {
    path: LIBRARY_COLLECTIONS_PATH,
    schema: LIBRARY_COLLECTIONS_SCHEMA,
    status,
    availability: status === 'ready' ? 'ready' : status === 'missing' ? 'missing' : 'unavailable',
    revision: raw === null ? null : createHash('sha256').update(raw).digest('hex'),
    mtime,
    ...(reason ? { reason } : {}),
  };
}

function loadLibraryCollections(vaultRoot) {
  const path = resolve(vaultRoot, LIBRARY_COLLECTIONS_PATH);
  let canonicalRoot;
  let canonicalPath;
  try {
    canonicalRoot = realpathSync(vaultRoot);
    canonicalPath = realpathSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        parsed: { status: 'missing', value: emptyLibraryCollections() },
        source: sourceDescriptor('missing'),
      };
    }
    const reason = 'The collection file could not be read from the configured vault.';
    return { parsed: { status: 'corrupt', raw: '', reason }, source: sourceDescriptor('corrupt', { reason }) };
  }
  if (!inside(canonicalRoot, canonicalPath)) {
    const reason = 'The collection file resolves outside the configured vault.';
    return { parsed: { status: 'corrupt', raw: '', reason }, source: sourceDescriptor('corrupt', { reason }) };
  }

  let raw;
  let mtime;
  try {
    const stats = statSync(canonicalPath);
    mtime = stats.mtimeMs;
    if (!stats.isFile()) {
      const reason = 'The collection path is not a regular file.';
      return { parsed: { status: 'corrupt', raw: '', reason }, source: sourceDescriptor('corrupt', { mtime, reason }) };
    }
    if (stats.size > LIBRARY_COLLECTIONS_MAX_BYTES) {
      const reason = 'The collection file exceeds the 1 MiB limit.';
      return { parsed: { status: 'corrupt', raw: '', reason }, source: sourceDescriptor('corrupt', { mtime, reason }) };
    }
    raw = readFileSync(canonicalPath, 'utf8');
  } catch {
    const reason = 'The collection file could not be read from the configured vault.';
    return { parsed: { status: 'corrupt', raw: '', reason }, source: sourceDescriptor('corrupt', { reason }) };
  }
  const parsed = parseLibraryCollections(raw);
  return {
    parsed,
    source: sourceDescriptor(parsed.status, { raw, mtime, reason: parsed.reason }),
  };
}

function purposeView(folder) {
  return typeof folder.purpose === 'string' && folder.purpose.trim()
    ? { status: 'recorded', value: folder.purpose.trim() }
    : { status: 'unknown' };
}

function constellationFolders(value) {
  return value.folders
    .filter((folder) => folder.presentation === 'constellation')
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function itemsFor(value, folderId) {
  return value.items
    .filter((item) => item.folderId === folderId)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
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
  const loaded = loadLibraryCollections(vaultRoot);
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

function buildUidClaims(docs) {
  const claims = new Map();
  const push = (uid, doc, kind) => {
    if (typeof uid !== 'string' || !uid) return;
    if (!claims.has(uid)) claims.set(uid, []);
    claims.get(uid).push({ doc, kind });
  };
  for (const doc of docs) {
    const currentUid = doc.frontmatter?.uid;
    const mergedUids = Array.isArray(doc.frontmatter?.merged_uids) ? doc.frontmatter.merged_uids : [];
    const claimed = new Map();
    if (typeof currentUid === 'string' && currentUid) claimed.set(currentUid, 'current');
    for (const uid of mergedUids) {
      if (typeof uid === 'string' && uid && !claimed.has(uid)) claimed.set(uid, 'merged');
    }
    for (const [uid, kind] of claimed) {
      push(uid, doc, kind);
    }
  }
  return claims;
}

function resolveMember(item, uidClaims) {
  const claims = uidClaims.get(item.target.uid) ?? [];
  if (claims.length === 0) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'missing',
    };
  }
  if (claims.length > 1) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'ambiguous',
      claimCount: claims.length,
    };
  }
  const claim = claims[0];
  if (typeof claim.doc.frontmatter?.kind !== 'string' || !claim.doc.frontmatter.kind.trim()) {
    return {
      ok: false,
      itemId: item.id,
      uid: item.target.uid,
      label: item.label,
      lastKnownPath: item.target.lastKnownPath,
      reason: 'not_graph_node',
      claimCount: 1,
    };
  }
  return { ok: true, item, doc: claim.doc, identityResolution: claim.kind };
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

function buildGraphResolver(docs) {
  const graphDocs = docs.filter(
    (doc) => typeof doc.frontmatter?.kind === 'string' && doc.frontmatter.kind.trim(),
  );
  const exact = new Map(graphDocs.map((doc) => [doc.slug, doc]));
  const aliases = new Map();
  const addAlias = (alias, doc) => {
    if (typeof alias !== 'string' || !alias.trim()) return;
    if (!aliases.has(alias)) aliases.set(alias, []);
    aliases.get(alias).push(doc);
  };
  for (const doc of graphDocs) {
    addAlias(doc.frontmatter?.slug, doc);
    const tail = doc.slug.split('/').pop();
    if (tail !== doc.slug) addAlias(tail, doc);
  }
  return {
    graphDocs,
    resolve(ref) {
      const direct = exact.get(ref);
      if (direct) return direct;
      const candidates = [...new Map((aliases.get(ref) ?? []).map((doc) => [doc.slug, doc])).values()];
      return candidates.length === 1 ? candidates[0] : null;
    },
  };
}

function relationView(from, to, type, rationale) {
  return {
    from: { uid: from.frontmatter.uid, slug: from.slug },
    to: { uid: to.frontmatter.uid, slug: to.slug },
    type,
    ...(rationale ? { rationale } : {}),
  };
}

function relationKey(edge) {
  return `${edge.type}\0${edge.from.slug}\0${edge.to.slug}`;
}

function collectScopeRelations(docs, resolvedScope, relationLimit, dependencyLimit) {
  const { graphDocs, resolve: resolveRef } = buildGraphResolver(docs);
  const selectedSlugs = new Set(resolvedScope.map((row) => row.doc.slug));
  const internal = new Map();
  const outside = new Map();
  let unresolvedGraphReferences = 0;
  let unresolvedDependencyReferences = 0;

  for (const doc of graphDocs) {
    const fromInside = selectedSlugs.has(doc.slug);
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const target = resolveRef(ref);
      if (!target) {
        if (fromInside) {
          unresolvedGraphReferences += 1;
          if (key === 'dependencies') unresolvedDependencyReferences += 1;
        }
        continue;
      }
      if (target.slug === doc.slug) continue;
      const toInside = selectedSlugs.has(target.slug);
      const rationale = relationNoteFor(doc, ref, target.slug);
      if (fromInside && toInside) {
        const edge = relationView(doc, target, key, rationale);
        internal.set(relationKey(edge), edge);
      } else if (key === 'dependencies' && fromInside !== toInside) {
        const edge = {
          ...relationView(doc, target, key, rationale),
          scopeDirection: fromInside ? 'outgoing' : 'incoming',
          outsideNode: {
            uid: (fromInside ? target : doc).frontmatter.uid,
            slug: (fromInside ? target : doc).slug,
            kind: (fromInside ? target : doc).frontmatter.kind,
            title:
              (fromInside ? target : doc).frontmatter.title ||
              (fromInside ? target : doc).frontmatter.name ||
              (fromInside ? target : doc).slug,
          },
        };
        outside.set(`${relationKey(edge)}\0${edge.scopeDirection}`, edge);
      }
    }
  }

  const internalRows = [...internal.values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
  const outsideRows = [...outside.values()].sort((a, b) =>
    `${a.scopeDirection}\0${relationKey(a)}`.localeCompare(`${b.scopeDirection}\0${relationKey(b)}`),
  );
  return {
    internal: internalRows.slice(0, relationLimit),
    internalTotal: internalRows.length,
    outside: outsideRows.slice(0, dependencyLimit),
    outsideTotal: outsideRows.length,
    unresolvedGraphReferences,
    unresolvedDependencyReferences,
    graphNodeCount: graphDocs.length,
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
  const loaded = loadLibraryCollections(vaultRoot);
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

export {
  getSavedConstellation,
  listSavedConstellations,
  loadLibraryCollections,
  parseLibraryCollections,
};
