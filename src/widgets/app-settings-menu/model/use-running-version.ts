'use client';

import { useCallback, useEffect, useState } from 'react';

import { isDesktopShell } from '@/shared/lib/desktop-shell';

export interface RunningVersion {
  version: string | null | undefined;
  retried: boolean;
  reread: () => void;
}

export function useRunningVersion(): RunningVersion {
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isDesktopShell()) return;
    let alive = true;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        if (alive) setVersion(null);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reread = useCallback(() => {
    setVersion(undefined);
    setAttempt((value) => value + 1);
  }, []);

  return { version, retried: attempt > 0, reread };
}
