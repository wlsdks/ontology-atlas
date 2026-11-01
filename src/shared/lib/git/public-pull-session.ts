import type { PublicPullInventory, PublicPullVersion } from './tauri-pr-inventory';

export const MAX_PUBLIC_PULL_VERSIONS = 400;
export const MAX_PUBLIC_PULL_BYTES = 16 * 1024 * 1024;

export interface PublicPullSession {
  versions: PublicPullVersion[];
  retainedBytes: number;
  omittedForSessionLimit: number;
  hadNativeOmissions: boolean;
  conflicts: number[];
  conflictOverflow: boolean;
  cursorNeedsRestart: boolean;
  hasEarlierScan: boolean;
  report: PublicPullInventory | null;
}

export const emptyPublicPullSession = (): PublicPullSession => ({
  versions: [], retainedBytes: 0, omittedForSessionLimit: 0, hadNativeOmissions: false, conflicts: [], conflictOverflow: false, cursorNeedsRestart: false, hasEarlierScan: false, report: null,
});

export function appendPublicPullPage(session: PublicPullSession, page: PublicPullInventory, limits = { versions: MAX_PUBLIC_PULL_VERSIONS, bytes: MAX_PUBLIC_PULL_BYTES }): PublicPullSession {
  if (session.omittedForSessionLimit > 0) return session;
  const versions = [...session.versions];
  const seen = new Set(versions.map((version) => `${version.number}:${version.digest}`));
  let retainedBytes = session.retainedBytes;
  let omittedForSessionLimit = session.omittedForSessionLimit;
  for (const version of page.versions) {
    const key = `${version.number}:${version.digest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bytes = new TextEncoder().encode(JSON.stringify(version)).byteLength;
    if (versions.length >= limits.versions || retainedBytes + bytes > limits.bytes) {
      omittedForSessionLimit++;
      continue;
    }
    versions.push(version);
    retainedBytes += bytes;
  }
  const observedConflicts = [...new Set([...session.conflicts, ...page.conflicts])];
  const conflicts = observedConflicts.slice(0, MAX_PUBLIC_PULL_VERSIONS);
  const conflictOverflow = session.conflictOverflow || observedConflicts.length > MAX_PUBLIC_PULL_VERSIONS;
  const hadNativeOmissions = session.hadNativeOmissions || page.omitted.length > 0 || page.unlistedOmissions > 0;
  return { versions, retainedBytes, omittedForSessionLimit, hadNativeOmissions, conflicts, conflictOverflow, cursorNeedsRestart: false, hasEarlierScan: session.hasEarlierScan, report: { ...page, versions: [] } };
}

export function publicPullConflicts(session: PublicPullSession): Set<number> {
  const first = new Map<number, string>();
  const conflicts = new Set(session.conflicts);
  for (const version of session.versions) {
    const previous = first.get(version.number);
    if (previous !== undefined && previous !== version.digest) conflicts.add(version.number);
    else first.set(version.number, version.digest);
  }
  return conflicts;
}
