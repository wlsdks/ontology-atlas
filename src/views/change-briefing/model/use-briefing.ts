'use client';

import { useEffect, useMemo, useState } from 'react';
import { gitChangeBriefing, gitSourceBriefing, type ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import type { BriefingRange } from './briefing-model';

export function useBriefing(root: string | null, project: string, range: BriefingRange | null, session: unknown) {
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ root, project, start: range?.startEpoch, end: range?.endEpoch, session, attempt }), [root, project, range?.startEpoch, range?.endEpoch, session, attempt]);
  const [snapshot, setSnapshot] = useState<{ key: object; data: ChangeBriefing | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!key.root || key.start === undefined || key.end === undefined) return;
    let cancelled = false;
    const request = key.project ? gitChangeBriefing(key.root, key.project, key.start, key.end) : gitSourceBriefing(key.root, key.start, key.end);
    void request.then(data => {
      if (!cancelled) setSnapshot({ key, data, error: !data });
    }, () => { if (!cancelled) setSnapshot({ key, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [key]);
  const current = snapshot?.key === key ? snapshot : null;
  return { data: current?.data ?? null, error: current?.error ?? false, loading: !current, refresh: () => setAttempt(value => value + 1) };
}
