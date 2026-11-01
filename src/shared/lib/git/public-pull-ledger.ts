import { appendPublicPullPage, emptyPublicPullSession, MAX_PUBLIC_PULL_BYTES, MAX_PUBLIC_PULL_VERSIONS, type PublicPullSession } from './public-pull-session';
import { invalidateNativePublicPullOriginals, type PublicPullInventory } from './tauri-pr-inventory';

const MAX_SCOPES = 32;
const sessions = new Map<string, PublicPullSession>();
let generation = 0;

export function publicPullLedgerGeneration(): number { return generation; }

export function publicPullScope(source: string, head: string, snapshot: string, repository: string): string {
  return JSON.stringify([source, head, snapshot, repository]);
}

export function getPublicPullSession(scope: string): PublicPullSession {
  return sessions.get(scope) ?? emptyPublicPullSession();
}

export function canStorePublicPullScope(scope: string): boolean {
  return sessions.has(scope) || sessions.size < MAX_SCOPES;
}

export function savePublicPullPage(scope: string, page: PublicPullInventory, startsNewScan = false): PublicPullSession | null {
  if (!canStorePublicPullScope(scope)) return null;
  const current = getPublicPullSession(scope);
  let otherVersions = 0;
  let otherBytes = 0;
  for (const [key, session] of sessions) {
    if (key === scope) continue;
    otherVersions += session.versions.length;
    otherBytes += session.retainedBytes;
  }
  const appended = appendPublicPullPage(current, page, {
    versions: Math.max(0, MAX_PUBLIC_PULL_VERSIONS - otherVersions),
    bytes: Math.max(0, MAX_PUBLIC_PULL_BYTES - otherBytes),
  });
  const next = Object.freeze({ ...appended, versions: Object.freeze(appended.versions) as unknown as PublicPullVersion[], hasEarlierScan: current.hasEarlierScan || (startsNewScan && current.report !== null) });
  sessions.set(scope, next);
  return next;
}

export function invalidatePublicPullCursor(scope: string): void {
  const session = sessions.get(scope);
  if (!session) return;
  const next = Object.freeze({ ...session, cursorNeedsRestart: true });
  sessions.set(scope, next);
}

export function clearPublicPullLedger(): void { sessions.clear(); generation++; invalidateNativePublicPullOriginals(); }
