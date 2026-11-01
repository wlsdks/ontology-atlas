import { appendPublicPullPage, emptyPublicPullSession, MAX_PUBLIC_PULL_BYTES, MAX_PUBLIC_PULL_VERSIONS, type PublicPullSession } from './public-pull-session';
import { invalidateNativePublicPullOriginals, type PublicPullInventory, type PublicPullVersion } from './tauri-pr-inventory';

const MAX_SCOPES = 32;
const sessions = new Map<string, PublicPullSession>();
const evidenceRevisions = new Map<string, number>();
let generation = 0;

export function publicPullLedgerGeneration(): number { return generation; }

export function publicPullScope(source: string, head: string, snapshot: string, repository: string): string {
  return JSON.stringify([source, head, snapshot, repository]);
}

export function getPublicPullSession(scope: string): PublicPullSession {
  return sessions.get(scope) ?? emptyPublicPullSession();
}

function evidenceState(session: PublicPullSession): string {
  const report = session.report;
  const omissions = report?.omitted.map(item => JSON.stringify([item.number, item.digest, item.updatedAt, item.reason])).sort() ?? [];
  return JSON.stringify([
    session.versions.map(version => [version.number, version.digest]), [...session.conflicts].sort((a, b) => a - b),
    session.omittedForSessionLimit, session.hadNativeOmissions, session.conflictOverflow, session.cursorNeedsRestart,
    report && [report.status, report.reason, report.scanned, report.observedDistinct, report.observedDistinctExact,
      omissions, report.unlistedOmissions, report.canContinue, report.retrySmaller, report.pageSize,
      report.movingListUncertain, report.orderingUncertain, report.restarted],
  ]);
}

export function publicPullEvidenceRevision(scope: string): string {
  return JSON.stringify([generation, evidenceRevisions.get(scope) ?? 0, evidenceState(getPublicPullSession(scope))]);
}

function recordEvidenceChange(scope: string, before: PublicPullSession, after: PublicPullSession, unknownObservation = false): void {
  if (unknownObservation || evidenceState(before) !== evidenceState(after)) evidenceRevisions.set(scope, (evidenceRevisions.get(scope) ?? 0) + 1);
}

export function hasRetainedPublicPullOriginal(scope: string, original: PublicPullVersion): boolean {
  return sessions.get(scope)?.versions.includes(original) ?? false;
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
  recordEvidenceChange(scope, current, next, page.unlistedOmissions > 0 || next.conflictOverflow);
  sessions.set(scope, next);
  return next;
}

export function invalidatePublicPullCursor(scope: string): void {
  const session = sessions.get(scope);
  if (!session) return;
  const next = Object.freeze({ ...session, cursorNeedsRestart: true });
  recordEvidenceChange(scope, session, next);
  sessions.set(scope, next);
}

export function clearPublicPullLedger(): void { sessions.clear(); evidenceRevisions.clear(); generation++; invalidateNativePublicPullOriginals(); }
