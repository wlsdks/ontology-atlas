"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { observedWikiWriteEvents, type LibraryWorkEvent } from "@/features/library";

/**
 * Reports each wiki page whose file changes while a folder is open, and returns how many pages now
 * differ from the folder's first listing: the count a change line states. A session's first listing
 * is a baseline, never evidence that this session wrote it. One pass over the pages per listing.
 */
export function useObservedWikiWork(
  vaultScope: string,
  revisions: ReadonlyMap<string, number>,
  onReset: () => void,
  onReceipts: (events: readonly LibraryWorkEvent[]) => void,
): number {
  const [baseline, setBaseline] = useState({ scope: vaultScope, revisions });
  if (baseline.scope !== vaultScope) setBaseline({ scope: vaultScope, revisions });
  const previousRef = useRef<{ scope: string; revisions: ReadonlyMap<string, number> } | null>(null);
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { scope: vaultScope, revisions };
    if (!previous || previous.scope !== vaultScope) {
      onReset();
      return;
    }
    const receipts = observedWikiWriteEvents(previous.revisions, revisions, Date.now());
    if (receipts.length > 0) onReceipts(receipts);
  }, [vaultScope, revisions, onReset, onReceipts]);
  return useMemo(
    () => (baseline.scope === vaultScope ? observedWikiWriteEvents(baseline.revisions, revisions, 0).length : 0),
    [baseline, revisions, vaultScope],
  );
}
