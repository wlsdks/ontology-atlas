'use client';

import { useCallback, useState } from 'react';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { readStoredListCollapsed, storeListCollapsed } from '../lib/persistence';

export function useDocListLayout() {
  const [docListCollapsed, setDocListCollapsedState] = useState(readStoredListCollapsed);
  const [docListToggled, setDocListToggled] = useState(false);
  const docListPresence = usePanelPresence(!docListCollapsed);
  const docListLeaving = docListToggled && docListCollapsed && docListPresence.mounted;
  const toggleDocListCollapsed = useCallback(() => {
    setDocListToggled(true);
    setDocListCollapsedState((collapsed) => {
      const next = !collapsed;
      storeListCollapsed(next);
      return next;
    });
  }, []);
  return { docListCollapsed, docListToggled, docListLeaving, toggleDocListCollapsed };
}
