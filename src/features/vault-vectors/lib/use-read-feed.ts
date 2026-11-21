'use client';

import { useState } from 'react';

export interface ReadFeedItem {
  /** Increasing per item, a stable key for its entrance. */
  id: number;
  path: string;
  /** Passages recorded while this file was the one shown. */
  passages: number;
}

/** Enough to see the work move; more would make the stage a log. */
export const READ_FEED_SIZE = 3;

/**
 * The files the stage has shown being read, newest first, each with the passages recorded while it
 * was shown. Fed the paced path, so one item lands at most once a pace however fast files pass;
 * a file the pace skipped counts toward the item it ended with.
 */
export function useReadFeed(path: string | null, passagesDone: number): ReadFeedItem[] {
  const [feed, setFeed] = useState<ReadFeedItem[]>([]);
  const [shown, setShown] = useState<{ path: string | null; passagesAt: number }>({ path, passagesAt: passagesDone });
  if (path !== shown.path) {
    if (shown.path !== null) {
      const item = { path: shown.path, passages: Math.max(0, passagesDone - shown.passagesAt) };
      setFeed((items) => [{ id: (items[0]?.id ?? -1) + 1, ...item }, ...items].slice(0, READ_FEED_SIZE));
    }
    setShown({ path, passagesAt: passagesDone });
  }
  return feed;
}
