import { useCallback, useRef, useState } from 'react';
import type { Announce, RowKey } from './ModelRow';

/**
 * Which row is open (one at a time) and how it closes: every way a row closes goes through
 * `collapse`, so none of them drops the reader's place on `<body>`. The opener is found by the
 * row's key, not its test id: a row's opener changes from Add to Replace the moment a key is saved.
 */
export function useOpenRow() {
  const [expanded, setExpanded] = useState<RowKey | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const collapse = useCallback((key: RowKey) => {
    setExpanded((current) => (current === key ? null : current));
    window.setTimeout(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-opener="${key}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  }, []);

  return { expanded, setExpanded, rootRef, collapse };
}

/**
 * Every outcome is shown by its row and read out through one live region, never in a toast: on
 * this tall page a toast covers row content.
 */
export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');

  const announce = useCallback<Announce>((message) => {
    // Cleared first, so the same sentence twice in a row is still read twice.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 60);
  }, []);

  return { announcement, announce };
}
