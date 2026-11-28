import { useEffect, useState } from 'react';
import {
  onVaultIndexUpdated,
  searchVaultIndex,
  vaultIndexPreference,
  vaultIndexStatus,
  type VaultIndexHit,
  type VaultIndexStatus,
} from './tauri-vault-index';

const QUERY_SETTLE_MS = 120;
const BUILDING_POLL_MS = 400;
/** While the first build runs, an open query asks again every this many newly indexed files. */
const BUILD_STEP_FILES = 2000;

interface Answer {
  query: string;
  hits: VaultIndexHit[];
}

/**
 * The one way a screen searches inside documents: the installed app's index, asked again when the
 * query settles, as the first build grows, and after each pass that indexed an edit. On the web, with
 * no folder, or when `enabled` is false, `hits` is undefined and `status` null; callers then match
 * titles, summaries and tags only.
 */
export function useVaultIndexHits({
  rootPath,
  query,
  limit,
  enabled = true,
}: {
  rootPath: string | null;
  query: string;
  limit: number;
  enabled?: boolean;
}): { hits: VaultIndexHit[] | undefined; answeredQuery: string | null; status: VaultIndexStatus | null } {
  const indexSwitch = vaultIndexPreference.use();
  const active = enabled && rootPath !== null;
  const [status, setStatus] = useState<VaultIndexStatus | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [generation, setGeneration] = useState(0);
  const building = status?.state === 'building' || status?.state === 'absent';
  const buildStep = building ? Math.floor((status?.indexed ?? 0) / BUILD_STEP_FILES) : -1;
  const trimmed = query.trim();

  useEffect(() => {
    if (!active || rootPath === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await vaultIndexStatus(rootPath).catch(() => null);
      if (cancelled) return;
      setStatus(next);
      if (next?.state === 'building' || next?.state === 'absent') timer = setTimeout(() => void poll(), BUILDING_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, rootPath, indexSwitch, generation]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void onVaultIndexUpdated(() => setGeneration((value) => value + 1))
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);

  useEffect(() => {
    if (!active || rootPath === null || trimmed === '') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await searchVaultIndex(rootPath, trimmed, limit).catch(() => null);
      if (cancelled || next === null) return;
      setStatus(next.status);
      setAnswer({ query: trimmed, hits: next.hits });
    }, QUERY_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, rootPath, trimmed, limit, buildStep, generation, indexSwitch]);

  // The previous answer stays while the next query settles, so lists do not flicker.
  const shown = active && trimmed !== '' ? answer : null;
  return { hits: shown?.hits, answeredQuery: shown?.query ?? null, status: active ? status : null };
}
