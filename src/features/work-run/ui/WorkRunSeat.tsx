'use client';

import { useEffect } from 'react';

import { useVaultSessionIdentityScope } from '@/entities/vault-session';

import { workRuns } from '../model/work-run-store';
import { WorkRunCard } from './WorkRunCard';

/** Mounted once above every route: it ends a run whose folder was switched away, and draws the card. */
export function WorkRunSeat() {
  const folder = useVaultSessionIdentityScope();
  useEffect(() => {
    workRuns.leaveFolder(folder, Date.now());
  }, [folder]);
  return <WorkRunCard />;
}
