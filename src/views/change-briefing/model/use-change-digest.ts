'use client';

import { useMemo } from 'react';
import type { VaultDoc } from '@/entities/docs-vault';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { groupBriefing } from './briefing-model';
import { buildChangeDigest } from './change-digest';

/** Capability groups for the file reader and the digest built on them; nothing is computed for a hidden surface. */
export function useChangeDigest(data: ChangeBriefing | null, docs: readonly VaultDoc[], locale: string, project: string, show: { digest: boolean; files: boolean }) {
  const needsGroups = show.digest || show.files;
  const capabilityGroups = useMemo(() => data && needsGroups ? groupBriefing(data.commits, docs, locale, project) : null, [data, needsGroups, docs, locale, project]);
  const concepts = useMemo(() => {
    const byPath = new Map<string, string[]>();
    const titles = new Map<string, string>();
    for (const group of capabilityGroups?.groups ?? []) {
      if (group.id === 'unmapped') continue;
      titles.set(group.id, group.title || group.id);
      for (const path of group.paths) byPath.set(path, [...(byPath.get(path) ?? []), group.id]);
    }
    return { byPath, titles };
  }, [capabilityGroups]);
  const readable = data && (data.status === 'measured' || data.status === 'partial');
  const digest = useMemo(() => show.digest && readable && data.commits.length ? buildChangeDigest(data.commits, concepts.byPath) : null, [show.digest, readable, data, concepts]);
  return { capabilityGroups, conceptTitles: concepts.titles, digest };
}
