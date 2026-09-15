const LIBRARY_COLLECTIONS_SCHEMA = 'ontology-atlas/library-collections/v1' as const;
export const LIBRARY_COLLECTIONS_MAX_BYTES = 1024 * 1024;

type LibraryCollectionTarget =
  | { kind: 'source' | 'wiki'; path: string }
  | { kind: 'ontology'; uid: string; lastKnownPath: string };

export interface LibraryCollectionFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  /** Optional presentation metadata keeps existing generic collection folders compatible. */
  presentation?: 'constellation';
  /** A person's stated reason for collecting this scope. Absence remains unknown. */
  purpose?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LibraryCollectionItem {
  id: string;
  folderId: string | null;
  order: number;
  label: string;
  target: LibraryCollectionTarget;
}

export interface LibraryCollections {
  schema: typeof LIBRARY_COLLECTIONS_SCHEMA;
  folders: LibraryCollectionFolder[];
  items: LibraryCollectionItem[];
}

export type LibraryCollectionsParseResult =
  | { status: 'missing'; value: LibraryCollections }
  | { status: 'ready'; value: LibraryCollections }
  | { status: 'corrupt' | 'unsupported'; raw: string; reason: string };

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function emptyLibraryCollections(): LibraryCollections {
  return { schema: LIBRARY_COLLECTIONS_SCHEMA, folders: [], items: [] };
}

function exactPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /^[a-zA-Z]:/.test(value) || value.includes('\\')) return false;
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function targetKey(target: LibraryCollectionTarget): string {
  return target.kind === 'ontology' ? `ontology:${target.uid}` : `${target.kind}:${target.path}`;
}

function validInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT_RE.test(value) && Number.isFinite(Date.parse(value));
}

function validate(value: unknown): LibraryCollections {
  if (!value || typeof value !== 'object') throw new Error('The collection file must contain an object.');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.folders) || !Array.isArray(record.items)) throw new Error('Folders and items must be arrays.');
  const folders = record.folders as LibraryCollectionFolder[];
  const items = record.items as LibraryCollectionItem[];
  const folderIds = new Set<string>();
  for (const folder of folders) {
    if (!folder || !UUID_V4_RE.test(folder.id) || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 120 ||
      (folder.parentId !== null && !UUID_V4_RE.test(folder.parentId)) || !Number.isSafeInteger(folder.order) || folder.order < 0) {
      throw new Error('A collection folder is invalid.');
    }
    if (folder.presentation === 'constellation') {
      if (folder.parentId !== null || (folder.purpose !== undefined && (typeof folder.purpose !== 'string' || folder.purpose.length > 4000)) ||
        !validInstant(folder.createdAt) || !validInstant(folder.updatedAt)) {
        throw new Error('A constellation folder is invalid.');
      }
    } else if (folder.presentation !== undefined || folder.purpose !== undefined || folder.createdAt !== undefined || folder.updatedAt !== undefined) {
      throw new Error('Constellation metadata requires the constellation presentation.');
    }
    if (folderIds.has(folder.id)) throw new Error('Collection folder IDs must be unique.');
    folderIds.add(folder.id);
  }
  for (const folder of folders) if (folder.parentId !== null && !folderIds.has(folder.parentId)) throw new Error('A collection folder has a missing parent.');
  for (const folder of folders) assertFolderMoveIsAcyclic(folders, folder.id, folder.parentId);

  const itemIds = new Set<string>();
  const placements = new Set<string>();
  for (const item of items) {
    if (!item || !UUID_V4_RE.test(item.id) || (item.folderId !== null && !folderIds.has(item.folderId)) || typeof item.label !== 'string' ||
      !item.label.trim() || item.label.length > 240 || !Number.isSafeInteger(item.order) || item.order < 0 || !item.target || typeof item.target !== 'object') {
      throw new Error('A collection item is invalid.');
    }
    const target = item.target as LibraryCollectionTarget;
    if ((target.kind === 'source' || target.kind === 'wiki') ? !exactPath(target.path) :
      target.kind === 'ontology' ? (!UUID_V4_RE.test(target.uid) || !exactPath(target.lastKnownPath)) : true) {
      throw new Error('A collection target is invalid.');
    }
    if (itemIds.has(item.id)) throw new Error('Collection item IDs must be unique.');
    itemIds.add(item.id);
    const placement = `${item.folderId}\0${targetKey(target)}`;
    if (placements.has(placement)) throw new Error('This target is already saved in the folder.');
    placements.add(placement);
  }
  return { schema: LIBRARY_COLLECTIONS_SCHEMA, folders, items };
}

export function parseLibraryCollections(raw: string | null): LibraryCollectionsParseResult {
  if (raw === null) return { status: 'missing', value: emptyLibraryCollections() };
  if (new TextEncoder().encode(raw).byteLength > LIBRARY_COLLECTIONS_MAX_BYTES) return { status: 'corrupt', raw, reason: 'The collection file exceeds the 1 MiB limit.' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { status: 'corrupt', raw, reason: 'The collection file is not valid JSON.' }; }
  if (!parsed || typeof parsed !== 'object' || (parsed as { schema?: unknown }).schema !== LIBRARY_COLLECTIONS_SCHEMA) {
    return { status: 'unsupported', raw, reason: 'The collection file uses an unsupported schema version.' };
  }
  try { return { status: 'ready', value: validate(parsed) }; }
  catch (error) { return { status: 'corrupt', raw, reason: error instanceof Error ? error.message : String(error) }; }
}

export function serializeLibraryCollections(value: LibraryCollections): string {
  const raw = `${JSON.stringify(validate(value), null, 2)}\n`;
  if (new TextEncoder().encode(raw).byteLength > LIBRARY_COLLECTIONS_MAX_BYTES) throw new Error('The collection file exceeds the 1 MiB limit.');
  return raw;
}

function isConstellationFolder(folder: LibraryCollectionFolder): boolean {
  return folder.presentation === 'constellation';
}

export function constellationFolders(value: LibraryCollections): LibraryCollectionFolder[] {
  return value.folders.filter(isConstellationFolder).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function collectionItems(value: LibraryCollections, folderId: string): LibraryCollectionItem[] {
  return value.items.filter((item) => item.folderId === folderId).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function assertFolderMoveIsAcyclic(folders: readonly LibraryCollectionFolder[], folderId: string, parentId: string | null): void {
  if (folderId === parentId) throw new Error('A collection folder cannot contain itself.');
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (!byId.has(folderId)) throw new Error('The collection folder does not exist.');
  let cursor = parentId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (cursor === folderId) throw new Error('A collection folder cannot move into its descendant.');
    if (visited.has(cursor)) throw new Error('The collection folder hierarchy contains a cycle.');
    visited.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) throw new Error('The destination collection folder does not exist.');
    cursor = parent.parentId;
  }
}

export function removeLibraryCollectionFolder(value: LibraryCollections, folderId: string): LibraryCollections {
  const removed = new Set([folderId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const folder of value.folders) if (folder.parentId && removed.has(folder.parentId) && !removed.has(folder.id)) { removed.add(folder.id); changed = true; }
  }
  return validate({ ...value, folders: value.folders.filter((folder) => !removed.has(folder.id)), items: value.items.filter((item) => item.folderId === null || !removed.has(item.folderId)) });
}

export function addLibraryCollectionItem(value: LibraryCollections, item: LibraryCollectionItem): LibraryCollections {
  return validate({ ...value, items: [...value.items, item] });
}

export function moveLibraryCollectionFolder(value: LibraryCollections, folderId: string, parentId: string | null, order: number): LibraryCollections {
  assertFolderMoveIsAcyclic(value.folders, folderId, parentId);
  if (!Number.isSafeInteger(order) || order < 0) throw new Error('Collection order must be a non-negative integer.');
  return validate({ ...value, folders: value.folders.map((folder) => folder.id === folderId ? { ...folder, parentId, order } : folder) });
}

export function moveLibraryCollectionItem(value: LibraryCollections, itemId: string, folderId: string | null, order: number): LibraryCollections {
  const item = value.items.find((current) => current.id === itemId);
  if (!item) throw new Error('The collection item does not exist.');
  if (folderId !== null && !value.folders.some((folder) => folder.id === folderId)) throw new Error('The destination collection folder does not exist.');
  if (!Number.isSafeInteger(order) || order < 0) throw new Error('Collection order must be a non-negative integer.');
  return validate({ ...value, items: value.items.map((current) => current.id === itemId ? { ...current, folderId, order } : current) });
}

export function upsertConstellation(
  value: LibraryCollections,
  folder: LibraryCollectionFolder,
  items: readonly LibraryCollectionItem[],
): LibraryCollections {
  if (!isConstellationFolder(folder)) throw new Error('A saved constellation requires the constellation presentation.');
  if (items.some((item) => item.folderId !== folder.id || item.target.kind !== 'ontology')) {
    throw new Error('A saved constellation accepts only ontology members assigned to its folder.');
  }
  const folders = value.folders.some((current) => current.id === folder.id)
    ? value.folders.map((current) => current.id === folder.id ? folder : current)
    : [...value.folders, folder];
  return validate({
    ...value,
    folders,
    items: [...value.items.filter((item) => item.folderId !== folder.id), ...items],
  });
}
