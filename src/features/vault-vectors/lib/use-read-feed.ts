'use client';

import { useState } from 'react';

export interface ReadFeedItem {
  /** Increasing per item, a stable key for its entrance. */
  id: number;
  path: string;
}

/** Enough to see the work move; more would make the stage a log. */
export const READ_FEED_SIZE = 3;

/**
 * The files the stage has shown being read, newest first: a file lands once the next is shown.
 * Fed the paced path, so one lands at most once a pace however fast files pass.
 */
export function useReadFeed(path: string | null): ReadFeedItem[] {
  const [feed, setFeed] = useState<ReadFeedItem[]>([]);
  const [shown, setShown] = useState(path);
  if (path !== shown) {
    if (shown !== null) {
      const landed = shown;
      setFeed((items) => [{ id: (items[0]?.id ?? -1) + 1, path: landed }, ...items].slice(0, READ_FEED_SIZE));
    }
    setShown(path);
  }
  return feed;
}
