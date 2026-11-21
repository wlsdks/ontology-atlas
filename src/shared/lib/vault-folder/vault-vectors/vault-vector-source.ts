import { useCallback, useSyncExternalStore } from 'react';
import { PREFERENCE_CHANGE_EVENT } from '@/shared/lib/preferences/preference-storage/define-preference';
import type { VectorSource } from './tauri-vault-vectors';

/**
 * The person's search-by-meaning choice for each folder, held in localStorage beside the search
 * index switch and sent with every vectors command: the source, and whether they stopped the job,
 * so Rust does not continue it at the next opening. One JSON object keyed by folder root; an entry
 * whose source does not parse as a `VectorSource` reads as none.
 */
const KEY = 'ontology-atlas:vault-vectors:v1';

export interface VectorChoice {
  source: VectorSource;
  paused: boolean;
}

type SourcesByRoot = Readonly<Record<string, VectorChoice>>;

const NONE: SourcesByRoot = Object.freeze({});

function asSource(value: unknown): VectorSource | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'builtin') return { kind: 'builtin' };
  if (
    record.kind === 'runner' &&
    typeof record.baseUrl === 'string' &&
    record.baseUrl.trim() !== '' &&
    typeof record.model === 'string' &&
    record.model.trim() !== ''
  ) {
    return { kind: 'runner', baseUrl: record.baseUrl, model: record.model };
  }
  return null;
}

function parse(raw: string | null): SourcesByRoot {
  if (!raw) return NONE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NONE;
    const sources: Record<string, VectorChoice> = {};
    for (const [root, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      const source = asSource(record.source);
      if (source) sources[root] = { source, paused: record.paused === true };
    }
    return sources;
  } catch {
    return NONE;
  }
}

/** Parsed once per stored string, so `use` hands React the same object until the value changes. */
let cached: { raw: string | null; sources: SourcesByRoot } = { raw: null, sources: NONE };

function readAll(): SourcesByRoot {
  if (typeof window === 'undefined') return NONE;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return NONE;
  }
  if (raw !== cached.raw) cached = { raw, sources: parse(raw) };
  return cached.sources;
}

function writeAll(sources: SourcesByRoot): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(sources).length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(sources));
  } catch {
    // A failed write keeps this launch's choice in Rust; the next open asks again.
  }
  window.dispatchEvent(new CustomEvent(PREFERENCE_CHANGE_EVENT, { detail: { key: KEY } }));
}

function read(rootPath: string): VectorChoice | null {
  return readAll()[rootPath] ?? null;
}

/** A new choice is never paused: it is made by pressing a prepare action. */
function write(rootPath: string, source: VectorSource): void {
  writeAll({ ...readAll(), [rootPath]: { source, paused: false } });
}

/** Stop pauses the folder's choice and Resume releases it; without a choice there is nothing to hold. */
function setPaused(rootPath: string, paused: boolean): void {
  const choice = readAll()[rootPath];
  if (!choice || choice.paused === paused) return;
  writeAll({ ...readAll(), [rootPath]: { ...choice, paused } });
}

function clear(rootPath: string): void {
  const sources = readAll();
  if (!(rootPath in sources)) return;
  const rest = { ...sources };
  delete rest[rootPath];
  writeAll(rest);
}

/** The search index's switch-off and every-folder Delete remove each folder's vectors with it. */
function clearAll(): void {
  if (Object.keys(readAll()).length > 0) writeAll(NONE);
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onPreference = (event: Event) => {
    const key = (event as CustomEvent<{ key?: string }>).detail?.key;
    if (key === undefined || key === KEY) onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) onChange();
  };
  window.addEventListener(PREFERENCE_CHANGE_EVENT, onPreference);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, onPreference);
    window.removeEventListener('storage', onStorage);
  };
}

function use(rootPath: string | null): VectorChoice | null {
  const getSnapshot = useCallback(() => (rootPath === null ? null : read(rootPath)), [rootPath]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export const vaultVectorSource = { key: KEY, read, write, setPaused, clear, clearAll, subscribe, use };
