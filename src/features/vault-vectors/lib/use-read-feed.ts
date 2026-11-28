import { useState } from 'react';

export interface ReadFeedItem {
  id: number;
  path: string;
}

/** Enough to see the work move; more would make the stage a log. */
export const READ_FEED_SIZE = 3;

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
