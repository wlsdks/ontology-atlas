'use client';

import { useEffect, useState } from 'react';
import {
  subscribeDeveloperActivityDeliveries,
  type DeveloperActivityDelivery,
} from './activity-store';

const EMPTY_DELIVERIES: DeveloperActivityDelivery[] = [];

export function useDeveloperActivityDeliveries(accountId?: string | null) {
  const [deliveries, setDeliveries] =
    useState<DeveloperActivityDelivery[]>(EMPTY_DELIVERIES);

  useEffect(() => {
    const unsubscribe = subscribeDeveloperActivityDeliveries(
      accountId,
      setDeliveries,
      (err) => {
        if (typeof console !== 'undefined') {
          console.warn('[docs-vault-activity] deliveries subscribe failed:', err);
        }
      },
    );
    return unsubscribe;
  }, [accountId]);

  return deliveries;
}
