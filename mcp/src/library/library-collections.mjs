import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const LIBRARY_COLLECTIONS_SCHEMA = 'ontology-atlas/library-collections/v1';
const LIBRARY_COLLECTIONS_PATH = '.ontology-atlas/library-collections.json';
const LIBRARY_COLLECTIONS_MAX_BYTES = 1024 * 1024;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function emptyLibraryCollections() {
  return { schema: LIBRARY_COLLECTIONS_SCHEMA, folders: [], items: [] };
}

function isExactVaultPath(value) {
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

function collectionTargetKey(target) {
  return target.kind === 'ontology' ? `ontology:${target.uid}` : `${target.kind}:${target.path}`;
}

function isIsoInstant(value) {
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
        !isIsoInstant(folder.createdAt) ||
        !isIsoInstant(folder.updatedAt)
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
      ? !isExactVaultPath(target.path)
      : target.kind === 'ontology'
        ? !UUID_V4_RE.test(target.uid) || !isExactVaultPath(target.lastKnownPath)
        : true;
    if (invalidTarget) throw new Error('A collection target is invalid.');
    if (itemIds.has(item.id)) throw new Error('Collection item IDs must be unique.');
    itemIds.add(item.id);
    const placement = `${item.folderId}\0${collectionTargetKey(target)}`;
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

function isInsideRoot(root, candidate) {
  if (candidate === root) return true;
  const relativePath = relative(root, candidate);
  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function describeCollectionsFile(status, { raw = null, mtime = null, reason } = {}) {
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

function unreadableCollections(reason, mtime = null) {
  return {
    parsed: { status: 'corrupt', raw: '', reason },
    source: describeCollectionsFile('corrupt', { mtime, reason }),
  };
}

function readLibraryCollections(vaultRoot) {
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
        source: describeCollectionsFile('missing'),
      };
    }
    return unreadableCollections('The collection file could not be read from the configured vault.');
  }
  if (!isInsideRoot(canonicalRoot, canonicalPath)) {
    return unreadableCollections('The collection file resolves outside the configured vault.');
  }

  let raw;
  let mtime;
  try {
    const stats = statSync(canonicalPath);
    mtime = stats.mtimeMs;
    if (!stats.isFile()) return unreadableCollections('The collection path is not a regular file.', mtime);
    if (stats.size > LIBRARY_COLLECTIONS_MAX_BYTES) {
      return unreadableCollections('The collection file exceeds the 1 MiB limit.', mtime);
    }
    raw = readFileSync(canonicalPath, 'utf8');
  } catch {
    return unreadableCollections('The collection file could not be read from the configured vault.');
  }
  const parsed = parseLibraryCollections(raw);
  return {
    parsed,
    source: describeCollectionsFile(parsed.status, { raw, mtime, reason: parsed.reason }),
  };
}

export { parseLibraryCollections, readLibraryCollections };
