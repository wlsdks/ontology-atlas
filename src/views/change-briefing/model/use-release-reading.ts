import { useCallback, useEffect, useMemo, useState } from 'react';
import { gitReleaseSpan, gitReleaseWalk, gitReleases, type ChangeBriefing, type ReleaseList } from '@/shared/lib/git/tauri-change-briefing';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { appendWalk, EMPTY_WALK, releaseRows, releasesFromTags, sinceChoices, startOnWalk, unreleasedSpan, type LineWalk, type ReleaseRow } from './release-list';

/** What the person chose, by tag name so a re-read keeps it: null release is Unreleased; null since is the release's own start, '' the first commit. */
export interface ReleaseChoice { release: string | null; since: string | null }

type ListRead = { key: string; list: ReleaseList | null; line: LineWalk; counting: boolean; walkFailed: ChangeBriefing['status'] | null };
type SpanRead = { key: string; data: ChangeBriefing | null; error: boolean };

const readable = (status: ChangeBriefing['status'] | undefined) => status === 'measured' || status === 'partial';
const nameOf = (row: ReleaseRow) => row.release.names[0] ?? row.release.commit;

/**
 * The release list of the repository Changes reads, counted newest first in walk steps that each
 * land before the next starts, and the span the person chose, read as a date period is. Tags live in
 * the code folder, so a reload of the ontology folder does not read them again; Refresh does.
 */
export function useReleaseReading(root: string | null, project: string, enabled: boolean, memory: string) {
  const [attempt, setAttempt] = useState(0);
  const listKey = JSON.stringify([root, project, attempt, enabled]);
  const [read, setRead] = useState<ListRead | null>(null);
  const [offWalks, setOffWalks] = useState<{ key: string; walks: ReadonlyMap<string, LineWalk> }>({ key: '', walks: new Map() });
  const [choice, setChoice] = useArrivalMemory<ReleaseChoice | null>(`${memory}:release`, null);

  useEffect(() => {
    if (!enabled || !root) return;
    let cancelled = false;
    void (async () => {
      const list = await gitReleases(root, project).catch(() => null);
      if (cancelled) return;
      setRead({ key: listKey, list, line: EMPTY_WALK, counting: Boolean(list && readable(list.status) && list.tags.length), walkFailed: null });
      if (!list || !readable(list.status) || !list.tags.length) return;
      let line = EMPTY_WALK;
      while (!line.ended && line.kinds.length < list.walkLimit) {
        const step = await gitReleaseWalk(root, project, list.snapshot, list.head, line.kinds.length).catch(() => null);
        if (cancelled) return;
        if (!step || step.status !== 'measured' || (!step.kinds.length && !step.ended)) {
          const failed = step?.status ?? 'unreadable';
          setRead(current => current?.key === listKey ? { ...current, counting: false, walkFailed: failed === 'measured' ? 'unreadable' : failed } : current);
          return;
        }
        line = appendWalk(line, step);
        const next = line;
        setRead(current => current?.key === listKey ? { ...current, line: next, counting: !next.ended && next.kinds.length < list.walkLimit } : current);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, root, project, listKey]);

  const current = read?.key === listKey ? read : null;
  const list = current?.list ?? null;
  const releases = useMemo(() => list && readable(list.status) ? releasesFromTags(list.tags) : [], [list]);
  const walks = offWalks.key === listKey ? offWalks.walks : null;
  const line = current?.line ?? EMPTY_WALK;
  const rows = useMemo(() => releaseRows(releases, line, walks ?? new Map()), [releases, line, walks]);
  const unreleased = useMemo(() => unreleasedSpan(rows, line), [rows, line]);

  const selected = choice?.release ? rows.find(row => row.release.names.includes(choice.release!)) ?? null : null;
  const arrivalRow = unreleased.count === null ? undefined : unreleased.count > 0 || !rows.some(row => row.placement === 'line') ? null : rows.find(row => row.placement === 'line') ?? null;
  const chosen: ReleaseRow | null | undefined = choice?.release ? selected ?? arrivalRow : choice ? null : arrivalRow;
  const ownWalk = chosen && chosen.placement !== 'line' ? walks?.get(chosen.release.commit) ?? null : null;
  const sinceWalk = chosen && chosen.placement !== 'line' ? ownWalk : line;
  const since = useMemo(() => chosen === undefined || !sinceWalk ? [] : sinceChoices(rows, chosen, sinceWalk), [rows, chosen, sinceWalk]);

  const needsOwnWalk = Boolean(list && chosen && chosen.placement !== 'line' && !ownWalk && (chosen.placement === 'off' || !current?.counting));
  const ownCommit = needsOwnWalk ? chosen!.release.commit : null;
  useEffect(() => {
    if (!ownCommit || !root || !list) return;
    let cancelled = false;
    void (async () => {
      let walk = EMPTY_WALK;
      const byCommit = new Map(releases.map(release => [release.commit, release]));
      const target = byCommit.get(ownCommit);
      while (target && !walk.ended && walk.kinds.length < list.walkLimit) {
        const step = await gitReleaseWalk(root, project, list.snapshot, ownCommit, walk.kinds.length).catch(() => null);
        if (cancelled || !step || step.status !== 'measured') break;
        walk = appendWalk(walk, step);
        if (startOnWalk(target, 0, walk, byCommit)) break;
      }
      if (cancelled) return;
      const done = walk;
      setOffWalks(previous => ({ key: listKey, walks: new Map([...(previous.key === listKey ? previous.walks : []), [ownCommit, done]]) }));
    })();
    return () => { cancelled = true; };
  }, [ownCommit, root, project, list, releases, listKey]);

  const sinceRow = choice?.since ? since.find(row => row.release.names.includes(choice.since!)) ?? null : null;
  const base: string | null | undefined = choice?.since === '' ? null
    : sinceRow ? sinceRow.release.commit
      : chosen === null ? (unreleased.count === null ? undefined : unreleased.base)
        : chosen?.start ? chosen.start.commit : undefined;
  const tip = chosen === null ? list?.head : chosen?.release.commit;
  const snapshot = list?.snapshot;
  const ready = Boolean(snapshot && tip && base !== undefined);
  const spanKey = ready ? JSON.stringify([root, project, snapshot, base, tip, attempt]) : null;
  const [span, setSpan] = useState<SpanRead | null>(null);
  useEffect(() => {
    if (!spanKey || !root || !snapshot || !tip || base === undefined) return;
    let cancelled = false;
    void gitReleaseSpan(root, project, snapshot, base, tip).then(
      data => { if (!cancelled) setSpan({ key: spanKey, data, error: !data }); },
      () => { if (!cancelled) setSpan({ key: spanKey, data: null, error: true }); },
    );
    return () => { cancelled = true; };
  }, [spanKey, root, project, snapshot, base, tip]);
  const currentSpan = span?.key === spanKey ? span : null;

  const choose = useCallback((row: ReleaseRow | null) => setChoice({ release: row ? nameOf(row) : null, since: null }), [setChoice]);
  const chooseSince = useCallback((name: string | null) => setChoice({ release: chosen ? nameOf(chosen) : null, since: name }), [setChoice, chosen]);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);

  return {
    list,
    listLoading: Boolean(enabled && root && !current),
    listError: Boolean(current && !current.list),
    rows,
    line,
    unreleased,
    counting: current?.counting ?? false,
    walkFailed: current?.walkFailed ?? null,
    depthLimited: Boolean(list && !line.ended && line.kinds.length >= list.walkLimit),
    selected: chosen,
    since,
    sinceChoice: choice?.since === '' ? '' : sinceRow ? nameOf(sinceRow) : null,
    span: currentSpan?.data ?? null,
    spanLoading: Boolean(spanKey && !currentSpan),
    spanError: currentSpan?.error ?? false,
    choose,
    chooseSince,
    refresh,
  };
}

export type ReleaseReading = ReturnType<typeof useReleaseReading>;
