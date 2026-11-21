import { useCallback, useSyncExternalStore } from "react";
import { readOnOff, writeOnOff } from "./on-off-preference";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-change-event";

/**
 * Sources is the default: a folder with no sources has no pages to list. Opening a file moves the
 * switch to that file's list so the index never disagrees with the reader.
 */
export type LibraryIndexSegment = "sources" | "wiki";

const LIBRARY_INDEX_SEGMENTS: readonly LibraryIndexSegment[] = ["sources", "wiki"];

const DEFAULT_LIBRARY_INDEX_SEGMENT: LibraryIndexSegment = "sources";

const LIBRARY_INDEX_SEGMENT_KEY = "atlas.library.index-segment";

function isLibraryIndexSegment(value: string | null): value is LibraryIndexSegment {
  return value !== null && (LIBRARY_INDEX_SEGMENTS as readonly string[]).includes(value);
}

function readLibraryIndexSegment(): LibraryIndexSegment {
  if (typeof window === "undefined") return DEFAULT_LIBRARY_INDEX_SEGMENT;
  try {
    const saved = window.localStorage.getItem(LIBRARY_INDEX_SEGMENT_KEY);
    return isLibraryIndexSegment(saved) ? saved : DEFAULT_LIBRARY_INDEX_SEGMENT;
  } catch {
    return DEFAULT_LIBRARY_INDEX_SEGMENT;
  }
}

export function writeLibraryIndexSegment(value: LibraryIndexSegment): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIBRARY_INDEX_SEGMENT_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useLibraryIndexSegment(): LibraryIndexSegment {
  const getSnapshot = useCallback(() => readLibraryIndexSegment(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_INDEX_SEGMENT, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

/**
 * Tab-lifetime memory, not a stored preference: the identity scope is a per-session token that
 * must never become a persisted storage key. Keyed by folder; cleared on close or empty field.
 */
let libraryIndexQuery: { scope: string; query: string } | null = null;

export function readLibraryIndexQuery(vaultScope: string): string {
  if (!vaultScope || libraryIndexQuery?.scope !== vaultScope) return "";
  return libraryIndexQuery.query;
}

export function writeLibraryIndexQuery(vaultScope: string, query: string): void {
  libraryIndexQuery = vaultScope && query ? { scope: vaultScope, query } : null;
}

/**
 * Folded to its edge tab, `lg` and above only: below `lg` there is no second pane to give width
 * to. Off by default so the index doors stay reachable.
 */
const LIBRARY_INDEX_COLLAPSED_KEY = "atlas.library.index-collapsed";

const DEFAULT_LIBRARY_INDEX_COLLAPSED = false;

export function writeLibraryIndexCollapsed(value: boolean): void {
  writeOnOff(LIBRARY_INDEX_COLLAPSED_KEY, value);
}

export function useLibraryIndexCollapsed(): boolean {
  const getSnapshot = useCallback(
    () => readOnOff(LIBRARY_INDEX_COLLAPSED_KEY, DEFAULT_LIBRARY_INDEX_COLLAPSED),
    [],
  );
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_INDEX_COLLAPSED, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

/**
 * `auto` writes a page that fits the wiki contract without a permission card; `ask` stops every
 * page at the card. The key is kept so earlier choices carry over.
 */
export type WikiWriteMode = "auto" | "ask";

const WIKI_WRITE_MODE_KEY = "library.wikiWriteMode";

const DEFAULT_WIKI_WRITE_MODE: WikiWriteMode = "auto";

function readWikiWriteMode(): WikiWriteMode {
  if (typeof window === "undefined") return DEFAULT_WIKI_WRITE_MODE;
  try {
    return window.localStorage.getItem(WIKI_WRITE_MODE_KEY) === "ask" ? "ask" : DEFAULT_WIKI_WRITE_MODE;
  } catch {
    return DEFAULT_WIKI_WRITE_MODE;
  }
}

export function writeWikiWriteMode(value: WikiWriteMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIKI_WRITE_MODE_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useWikiWriteMode(): WikiWriteMode {
  const getSnapshot = useCallback(() => readWikiWriteMode(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_WIKI_WRITE_MODE, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

/**
 * Per machine, not per folder: someone who has read the three steps should not be re-taught on a
 * second folder.
 */
const LIBRARY_GUIDE_SEEN_KEY = "atlas.library.guide-seen";

const DEFAULT_LIBRARY_GUIDE_SEEN = false;

export function readLibraryGuideSeen(): boolean {
  return readOnOff(LIBRARY_GUIDE_SEEN_KEY, DEFAULT_LIBRARY_GUIDE_SEEN);
}

export function writeLibraryGuideSeen(value: boolean): void {
  writeOnOff(LIBRARY_GUIDE_SEEN_KEY, value);
}

export function useLibraryGuideSeen(): boolean {
  const getSnapshot = useCallback(
    () => readOnOff(LIBRARY_GUIDE_SEEN_KEY, DEFAULT_LIBRARY_GUIDE_SEEN),
    [],
  );
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_GUIDE_SEEN, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
