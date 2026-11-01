import type { PublicPullInventory, PublicPullOmission, PublicPullVersion } from './tauri-pr-inventory';

export const MAX_PUBLIC_PULL_VERSIONS = 400;
export const MAX_PUBLIC_PULL_BYTES = 16 * 1024 * 1024;

export interface PublicPullSession {
  versions: PublicPullVersion[];
  retainedBytes: number;
  omittedForSessionLimit: number;
  sessionOmissions: { number: number; digest: string }[];
  sessionOmissionsUnlisted: boolean;
  hadNativeOmissions: boolean;
  nativeOmissions: PublicPullOmission[];
  nativeOmissionsUnlisted: boolean;
  conflicts: number[];
  conflictOverflow: boolean;
  cursorNeedsRestart: boolean;
  hasEarlierScan: boolean;
  report: PublicPullInventory | null;
}

export const emptyPublicPullSession = (): PublicPullSession => ({
  versions: [], retainedBytes: 0, omittedForSessionLimit: 0, sessionOmissions: [], sessionOmissionsUnlisted: false, hadNativeOmissions: false, nativeOmissions: [], nativeOmissionsUnlisted: false, conflicts: [], conflictOverflow: false, cursorNeedsRestart: false, hasEarlierScan: false, report: null,
});

export function appendPublicPullPage(session: PublicPullSession, page: PublicPullInventory, limits = { versions: MAX_PUBLIC_PULL_VERSIONS, bytes: MAX_PUBLIC_PULL_BYTES }): PublicPullSession {
  if (session.omittedForSessionLimit > 0) return session;
  const versions = [...session.versions];
  const seen = new Set(versions.map((version) => `${version.number}:${version.digest}`));
  let retainedBytes = session.retainedBytes;
  let omittedForSessionLimit = session.omittedForSessionLimit;
  const sessionOmissions = [...session.sessionOmissions];
  let sessionOmissionsUnlisted = session.sessionOmissionsUnlisted;
  for (const version of page.versions) {
    const key = `${version.number}:${version.digest}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bytes = new TextEncoder().encode(JSON.stringify(version)).byteLength;
    if (versions.length >= limits.versions || retainedBytes + bytes > limits.bytes) {
      omittedForSessionLimit++;
      if (sessionOmissions.length < MAX_PUBLIC_PULL_VERSIONS) sessionOmissions.push({ number: version.number, digest: version.digest });
      else sessionOmissionsUnlisted = true;
      continue;
    }
    versions.push(version);
    retainedBytes += bytes;
  }
  const observedConflicts = [...new Set([...session.conflicts, ...page.conflicts])];
  const conflicts = observedConflicts.slice(0, MAX_PUBLIC_PULL_VERSIONS);
  const conflictOverflow = session.conflictOverflow || observedConflicts.length > MAX_PUBLIC_PULL_VERSIONS;
  const hadNativeOmissions = session.hadNativeOmissions || page.omitted.length > 0 || page.unlistedOmissions > 0;
  const omitted = new Map(session.nativeOmissions.map(item => [`${item.number}:${item.digest}`, item]));
  let nativeOmissionsUnlisted = session.nativeOmissionsUnlisted || page.unlistedOmissions > 0;
  for (const item of page.omitted) {
    const key = `${item.number}:${item.digest}`;
    if (omitted.size < MAX_PUBLIC_PULL_VERSIONS || omitted.has(key)) omitted.set(key, item);
    else nativeOmissionsUnlisted = true;
  }
  const nativeOmissions = [...omitted.values()];
  return { versions, retainedBytes, omittedForSessionLimit, sessionOmissions, sessionOmissionsUnlisted, hadNativeOmissions, nativeOmissions, nativeOmissionsUnlisted, conflicts, conflictOverflow, cursorNeedsRestart: false, hasEarlierScan: session.hasEarlierScan, report: { ...page, versions: [] } };
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
