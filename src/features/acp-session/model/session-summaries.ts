import { asRecord } from './adapter-json';

export interface AcpSessionSummary {
  sessionId: string;
  cwd: string;
  title: string | null;
  updatedAt: string | null;
}

/**
 * The adapter ignores `cwd` in `session/list`, so filter here to keep unopened folders off screen
 * (`tests/contract/security/acp-session-scope.contract.test.ts`).
 */
export function keepSessionsInFolder(
  sessions: AcpSessionSummary[],
  cwd: string,
): AcpSessionSummary[] {
  const root = normalizeFolder(cwd);
  if (!root) return [];
  return sessions.filter((s) => normalizeFolder(s.cwd) === root);
}

/** Only trims a trailing `/`; symlinks and relative paths are Rust's job. */
function normalizeFolder(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** The conversations of one folder from a `session/list` result; a row with no id or no folder is dropped. */
export function readSessionSummaries(result: Record<string, unknown>, cwd: string): AcpSessionSummary[] {
  const raw = Array.isArray(result.sessions) ? result.sessions : [];
  const summaries: AcpSessionSummary[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const sessionId = typeof row?.sessionId === 'string' ? row.sessionId : null;
    const folder = typeof row?.cwd === 'string' ? row.cwd : null;
    // A line whose folder is unknown is **discarded.** Keeping it on "it is probably this folder"
    // is precisely the accident of another folder's titles appearing on screen.
    if (!sessionId || !folder) continue;
    summaries.push({
      sessionId,
      cwd: folder,
      title: typeof row.title === 'string' && row.title.trim() ? row.title : null,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
    });
  }
  return keepSessionsInFolder(summaries, cwd);
}
