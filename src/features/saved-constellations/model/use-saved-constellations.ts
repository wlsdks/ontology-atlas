'use client';

import {
  collectionItems,
  constellationFolders,
  LibraryCollectionsConflictError,
  loadLibraryCollections,
  removeLibraryCollectionFolder,
  saveLibraryCollections,
  upsertConstellation,
  type LibraryCollectionFolder,
  type LibraryCollectionItem,
  type LibraryCollections,
  type LibraryCollectionsSnapshot,
} from '@/entities/library-collection';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ConstellationMemberDraft {
  uid: string;
  lastKnownPath: string;
  label: string;
}

export interface ConstellationDraft {
  id?: string;
  name: string;
  purpose: string;
  members: readonly ConstellationMemberDraft[];
}

export interface SavedConstellation {
  folder: LibraryCollectionFolder;
  items: LibraryCollectionItem[];
}

export type SavedConstellationsState =
  | { status: 'unavailable' | 'loading'; constellations: SavedConstellation[]; error: null }
  | { status: 'ready' | 'saving'; constellations: SavedConstellation[]; error: null }
  | { status: 'corrupt' | 'unsupported' | 'error'; constellations: SavedConstellation[]; error: string };

export type SavedConstellationsReloadResult =
  | { status: 'ready'; constellations: SavedConstellation[] }
  | { status: 'unavailable' | 'stale' }
  | { status: 'corrupt' | 'unsupported' | 'error'; error: string };

export function isSavedConstellationsConflict(error: unknown): boolean {
  return error instanceof LibraryCollectionsConflictError;
}

function collect(value: LibraryCollections): SavedConstellation[] {
  return constellationFolders(value).map((folder) => ({ folder, items: collectionItems(value, folder.id) }));
}

function editableValue(snapshot: LibraryCollectionsSnapshot | null): LibraryCollections | null {
  if (!snapshot) return null;
  return snapshot.parsed.status === 'ready' || snapshot.parsed.status === 'missing'
    ? snapshot.parsed.value
    : null;
}

function uid(): string {
  return crypto.randomUUID();
}

export function useSavedConstellations(handle: FileSystemDirectoryHandle | null) {
  const handleRef = useRef(handle);
  const snapshotRef = useRef<LibraryCollectionsSnapshot | null>(null);
  const operationRef = useRef(0);
  const [state, setState] = useState<SavedConstellationsState>({
    status: handle ? 'loading' : 'unavailable',
    constellations: [],
    error: null,
  });
  // Committed before the load effect below reads it, never during render.
  useLayoutEffect(() => { handleRef.current = handle; }, [handle]);

  const reload = useCallback(async (): Promise<SavedConstellationsReloadResult> => {
    const captured = handleRef.current;
    const operation = ++operationRef.current;
    if (!captured) {
      snapshotRef.current = null;
      setState({ status: 'unavailable', constellations: [], error: null });
      return { status: 'unavailable' };
    }
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const snapshot = await loadLibraryCollections(captured);
      if (handleRef.current !== captured || operationRef.current !== operation) return { status: 'stale' };
      snapshotRef.current = snapshot;
      if (snapshot.parsed.status === 'corrupt' || snapshot.parsed.status === 'unsupported') {
        setState({ status: snapshot.parsed.status, constellations: [], error: snapshot.parsed.reason });
        return { status: snapshot.parsed.status, error: snapshot.parsed.reason };
      } else {
        const value = editableValue(snapshot);
        const constellations = value ? collect(value) : [];
        setState({ status: 'ready', constellations, error: null });
        return { status: 'ready', constellations };
      }
    } catch (error) {
      if (handleRef.current !== captured || operationRef.current !== operation) return { status: 'stale' };
      const message = error instanceof Error ? error.message : String(error);
      setState({ status: 'error', constellations: [], error: message });
      return { status: 'error', error: message };
    }
  }, []);

  useEffect(() => { void reload(); }, [handle, reload]);

  const persist = useCallback(async (next: LibraryCollections) => {
    const captured = handleRef.current;
    const snapshot = snapshotRef.current;
    const operation = ++operationRef.current;
    if (!captured || !snapshot || !editableValue(snapshot)) {
      throw new Error('Saved constellations are not ready to edit.');
    }
    setState((current) => ({ ...current, status: 'saving', error: null }));
    try {
      const saved = await saveLibraryCollections(
        captured,
        snapshot,
        next,
        () => handleRef.current === captured && operationRef.current === operation,
      );
      if (handleRef.current !== captured || operationRef.current !== operation) return;
      snapshotRef.current = saved;
      setState({ status: 'ready', constellations: collect(next), error: null });
    } catch (error) {
      // A failed save is the editor's to report (it keeps the draft and says so). The list
      // still holds exactly what was read, so it stays `ready`: marking it `error` made the
      // popover say "could not read your saved constellations" about a file that read fine,
      // and disabled "Create" until a reload.
      if (handleRef.current === captured && operationRef.current === operation) {
        setState((current) => ({ ...current, status: 'ready', error: null }));
      }
      throw error;
    }
  }, []);

  const saveConstellation = useCallback(async (draft: ConstellationDraft) => {
    const snapshot = snapshotRef.current;
    const current = editableValue(snapshot);
    if (!current) {
      throw new Error('Saved constellations are not ready to edit.');
    }
    const existing = draft.id ? current.folders.find((folder) => folder.id === draft.id) : null;
    const now = new Date().toISOString();
    const id = existing?.id ?? uid();
    const folder: LibraryCollectionFolder = {
      id,
      name: draft.name.trim(),
      parentId: null,
      order: existing?.order ?? constellationFolders(current).length,
      presentation: 'constellation',
      purpose: draft.purpose.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const existingItemsByUid = new Map(
      current.items
        .filter((item) => item.folderId === id && item.target.kind === 'ontology')
        .map((item) => [item.target.kind === 'ontology' ? item.target.uid : '', item]),
    );
    const items: LibraryCollectionItem[] = draft.members.map((member, order) => ({
      id: existingItemsByUid.get(member.uid)?.id ?? uid(),
      folderId: id,
      order,
      label: member.label,
      target: { kind: 'ontology', uid: member.uid, lastKnownPath: member.lastKnownPath },
    }));
    await persist(upsertConstellation(current, folder, items));
    return id;
  }, [persist]);

  const deleteConstellation = useCallback(async (id: string) => {
    const snapshot = snapshotRef.current;
    const current = editableValue(snapshot);
    if (!current) {
      throw new Error('Saved constellations are not ready to edit.');
    }
    await persist(removeLibraryCollectionFolder(current, id));
  }, [persist]);

  return { ...state, reload, saveConstellation, deleteConstellation };
}
