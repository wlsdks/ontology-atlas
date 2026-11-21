'use client';

import { useState } from 'react';
import type { VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import type { RunStage } from './run-stage';

/** Until the person moves on: a press on the stage, or the folder leaving `ready`. A folder found ready, or an update of changed files, is never celebrated. */
export function useFinishedInView(running: RunStage | null, status: VectorStatus | null) {
  const [staged, setStaged] = useState<'first' | 'update' | null>(null);
  const [done, setDone] = useState<{ passages: number; files: number } | null>(null);
  const runKind = running ? (status?.updating ? 'update' : 'first') : null;
  // A Resume of an update first reads as a preparation; its later `updating` says what it is.
  if (runKind !== null && staged !== runKind) {
    setStaged(runKind);
    if (done) setDone(null);
  }
  if (runKind === null && staged !== null) {
    setStaged(null);
    if (staged === 'first' && status?.phase === 'ready') {
      setDone({ passages: Math.max(status.passagesTotal, status.passagesDone), files: status.filesTotal });
    }
  }
  if (done && runKind === null && status !== null && status.phase !== 'ready') setDone(null);
  return done ? { ...done, dismiss: () => setDone(null) } : null;
}
