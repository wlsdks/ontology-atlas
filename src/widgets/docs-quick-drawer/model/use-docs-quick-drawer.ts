"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale } from "next-intl";
import {
  findRelatedDocs,
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultScopeKey,
  type VaultTreeNode,
} from "@/entities/docs-vault";
import { useLocalVault, useOpenFolderManifest } from "@/entities/vault-session";
import { useBodyScrollLock } from "@/shared/lib/overlays/use-body-scroll-lock";
import {
  buildFlatDocs,
  buildTagIndex,
  docsForSlugs,
  latestModifiedDocs,
  rankTopTags,
  type FlatDoc,
} from "../lib/doc-catalog";
import { filterTree, flattenTreeSlugs } from "../lib/doc-tree";
import { readStoredSlugs, togglePinnedInStorage } from "../lib/pinned-docs-storage";

const PINNED_SHOWN_LIMIT = 50;
const RECENT_SHOWN_LIMIT = 5;
const RELATED_DOCS_LIMIT = 6;
const SEARCH_FOCUS_DELAY_MS = 40;

export interface DocsQuickDrawerContextProject {
  slug: string;
  name: string;
  aliases?: string[];
}

export interface DocsQuickDrawerModel {
  query: string;
  setQuery: (query: string) => void;
  activeTag: string | null;
  setActiveTag: (update: string | null | ((current: string | null) => string | null)) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  totalDocs: number;
  topTags: { tag: string; count: number }[];
  relatedDocs: ReturnType<typeof findRelatedDocs>;
  pinnedDocs: FlatDoc[];
  pinnedSet: ReadonlySet<string>;
  recentViewed: FlatDoc[];
  modifiedDocs: FlatDoc[];
  trimmedQuery: string;
  activeTagSlugs: ReadonlySet<string> | null;
  filteredTree: VaultTreeNode | null;
  flatTreeSlugs: string[];
  focusedSlug: string | null;
  setFocusedSlug: (slug: string | null) => void;
  togglePin: (slug: string) => void;
}

/**
 * State and derived lists of the quick drawer: which manifest is active, the saved pins and recents,
 * the search and tag filter, and the arrow-key focus over the filtered tree.
 */
export function useDocsQuickDrawer({
  open,
  onClose,
  contextProject,
}: {
  open: boolean;
  onClose: () => void;
  contextProject?: DocsQuickDrawerContextProject | null;
}): DocsQuickDrawerModel {
  const locale = useLocale();

  // Same rule as /docs: the open folder's manifest and its scoped pins, or nothing while none is open.
  const localVault = useLocalVault();
  const isLocalLoaded = localVault.status === "loaded" && Boolean(localVault.manifest);
  const activeManifest = useOpenFolderManifest();
  const scope = vaultScopeKey({
    isLocalLoaded,
    handleName: localVault.handle?.name ?? null,
  });
  const pinnedKey = pinnedDocsStorageKey(scope);
  const recentKey = recentDocsStorageKey(scope);

  const [query, setQuery] = useState("");
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>([]);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery("");
        setActiveTag(null);
      });
      return;
    }
    // Re-read on every open, so something just pinned in /docs shows immediately.
    queueMicrotask(() => {
      setPinnedSlugs(readStoredSlugs(pinnedKey, PINNED_SHOWN_LIMIT));
      setRecentSlugs(readStoredSlugs(recentKey, RECENT_SHOWN_LIMIT));
    });
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), SEARCH_FOCUS_DELAY_MS);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open, pinnedKey, recentKey]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const docs = useMemo(() => buildFlatDocs(activeManifest, locale), [activeManifest, locale]);
  const tagIndex = useMemo(() => buildTagIndex(docs), [docs]);
  const topTags = useMemo(() => rankTopTags(tagIndex), [tagIndex]);
  const docBySlug = useMemo(() => new Map(docs.map((doc) => [doc.slug, doc])), [docs]);
  const modifiedDocs = useMemo(() => latestModifiedDocs(docs), [docs]);
  const pinnedDocs = useMemo(() => docsForSlugs(pinnedSlugs, docBySlug), [pinnedSlugs, docBySlug]);
  const pinnedSet = useMemo(() => new Set(pinnedSlugs), [pinnedSlugs]);
  const recentViewed = useMemo(() => docsForSlugs(recentSlugs, docBySlug), [recentSlugs, docBySlug]);

  const relatedDocs = useMemo(() => {
    if (!contextProject) return [];
    return findRelatedDocs(
      activeManifest.docs,
      {
        projectSlug: contextProject.slug,
        projectName: contextProject.name,
        aliases: contextProject.aliases,
      },
      RELATED_DOCS_LIMIT,
    );
  }, [contextProject, activeManifest]);

  const trimmedQuery = query.trim().toLowerCase();
  const activeTagSlugs = useMemo(
    () => (activeTag ? (tagIndex.get(activeTag) ?? null) : null),
    [activeTag, tagIndex],
  );
  const filteredTree = useMemo(
    () => filterTree(activeManifest.tree as VaultTreeNode, trimmedQuery, activeTagSlugs),
    [trimmedQuery, activeTagSlugs, activeManifest],
  );

  // Flat slug order for arrow keys in search and tag mode; off in normal mode, whose sections make
  // a flat order ambiguous.
  const flatTreeSlugs = useMemo(() => {
    if (!trimmedQuery && !activeTag) return [];
    return flattenTreeSlugs(filteredTree);
  }, [filteredTree, trimmedQuery, activeTag]);

  useEffect(() => {
    queueMicrotask(() => setFocusedSlug(flatTreeSlugs[0] ?? null));
  }, [flatTreeSlugs]);

  return {
    query,
    setQuery,
    activeTag,
    setActiveTag,
    searchRef,
    totalDocs: docs.length,
    topTags,
    relatedDocs,
    pinnedDocs,
    pinnedSet,
    recentViewed,
    modifiedDocs,
    trimmedQuery,
    activeTagSlugs,
    filteredTree,
    flatTreeSlugs,
    focusedSlug,
    setFocusedSlug,
    togglePin: (slug) => setPinnedSlugs(togglePinnedInStorage(pinnedKey, slug)),
  };
}
