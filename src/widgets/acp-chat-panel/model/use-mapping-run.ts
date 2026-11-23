'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AcpTurnCompletion, AcpTurnStart } from '@/features/acp-session';
import { useGrantedVaultFiles, useLocalVault } from '@/entities/vault-session';
import {
  folderMappingRun,
  isMappingActive,
  silentTooLong,
  useFolderMappingRun,
  workRuns,
  type MappingFigures,
  type MappingRequestEnd,
  type MappingRun,
  type TurnWorkReport,
} from '@/features/work-run';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { notMappedAreas, type NotMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';
import { getTauriVaultRootPath, isTauriVaultRuntime } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { createVaultTextReader } from '@/shared/lib/vault-folder/vault-text-reader';

/**
 * Drives one press that maps the rest of the code (`docs/specs/2026-11-23-one-press-maps-the-rest.md`):
 * each request in a new conversation, the project note read from disk at its end, the next sent
 * while the run's rules say so. It only sends a prompt and reads files; every permission card is
 * left to the person.
 */

/** What the driver needs of the panel's agent session; the panel builds it from `useAcpSession`. */
export interface MappingSessionPort {
  status: string;
  /** A permission card waits for the person. */
  waitingForAnswer: boolean;
  /** When the running turn last reported anything; null between turns. */
  lastTurnUpdateAt: number | null;
  /** What the running turn does now; null when none runs. */
  work: TurnWorkReport | null;
  /** A request the person sent while the agent started, or a door's request, waits to go out first. */
  otherRequestWaiting: boolean;
  send: (text: string) => Promise<void>;
  newConversation: () => Promise<void>;
  /** The enforced Stop of the running turn: it ends within the session's grace, as cancelled. */
  stopRequest: () => void;
  /** The composer holds text the person typed. */
  hasDraft: () => boolean;
  /** The session's last error reads as the agent's usage limit. */
  usageLimited: () => boolean;
}

export interface MappingRunDriver {
  run: MappingRun | null;
  /** This panel sends the folder's requests: it stays busy and holds the folder between them too. */
  driving: boolean;
  start: () => void;
  stop: () => void;
  /** Hands this panel's turn starts to the driver; it returns the observer of its own request. */
  observeTurnStart: (turn: AcpTurnStart) => ((completion: AcpTurnCompletion) => Promise<void>) | null;
}

type DriverPhase = 'idle' | 'switching' | 'awaitingSend' | 'inTurn' | 'ending';

type RequestOutcome = MappingRequestEnd['outcome'];

/** `silentTooLong` is checked this often: the rule speaks in minutes, so nothing ticks per second. */
export const MAPPING_SILENCE_CHECK_MS = 30_000;

/** The agent's reports reach the run at most this often; a permission card goes at once. */
export const MAPPING_REPORT_STEP_MS = 1_000;

/**
 * The agent's last writes reload the folder just as the next request is sent, and the turn's
 * baseline refuses a folder that changed under it; the request waits this long and is sent again.
 */
export const MAPPING_RESEND_DELAY_MS = 1_000;
/** Resends per request before the run ends as the agent's error. */
export const MAPPING_RESENDS = 3;

const BASELINE_MOVED = 'capture_context_changed';

/** The project lines a folder holds, summed for progress and its widest for what is shown; null with none. O(n). */
export function mappingFiguresOf(lines: ReadonlyArray<Pick<NotMappedAreas, 'abilitiesUncovered' | 'abilitiesTotal'> | null>): MappingFigures | null {
  let widest: MappingFigures['widest'] | null = null;
  let uncovered = 0;
  let total = 0;
  for (const line of lines) {
    if (!line) continue;
    uncovered += line.abilitiesUncovered;
    total += line.abilitiesTotal;
    if (!widest || line.abilitiesUncovered > widest.abilitiesUncovered) {
      widest = { abilitiesUncovered: line.abilitiesUncovered, abilitiesTotal: line.abilitiesTotal };
    }
  }
  return widest ? { widest, sum: { abilitiesUncovered: uncovered, abilitiesTotal: total } } : null;
}

/** On the map out of found, floored, so one ability off the map never reads as 100%. */
export function mappingShare(figures: MappingFigures | null): { mapped: number; total: number; percent: number } | null {
  if (!figures) return null;
  const { abilitiesTotal: total, abilitiesUncovered: uncovered } = figures.widest;
  const mapped = Math.max(0, total - uncovered);
  return { mapped, total, percent: total > 0 ? Math.floor((mapped / total) * 100) : 0 };
}

/**
 * The folder's figures at rest from the manifest, and a read of its project notes from disk: the
 * watcher lands after a turn ends, so a request's end reads the files. A note that cannot be read
 * keeps its manifest line rather than reading as gone.
 */
export function useFolderMappingFigures(): { resting: MappingFigures | null; read: () => Promise<MappingFigures | null> } {
  const manifest = useLocalVault().manifest;
  const granted = useGrantedVaultFiles();
  const projects = useMemo(
    () => (manifest?.docs ?? []).filter((doc) => doc.frontmatter.kind === 'project'),
    [manifest],
  );
  const resting = useMemo(() => mappingFiguresOf(projects.map((doc) => doc.notMappedAreas ?? null)), [projects]);
  const read = useCallback(async () => {
    if (!granted || projects.length === 0) return resting;
    const nativeRoot = isTauriVaultRuntime() ? getTauriVaultRootPath(granted.root) ?? null : null;
    const texts = await createVaultTextReader(nativeRoot, granted.fileHandles)(
      projects.map((doc) => ({ slug: doc.slug, path: `${doc.slug}.md` })),
    );
    return mappingFiguresOf(texts.map((text, index) => (text === null ? projects[index]?.notMappedAreas ?? null : notMappedAreas(text))));
  }, [granted, projects, resting]);
  return { resting, read };
}

const nextTask = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function useMappingRun({
  folder,
  folderName,
  agent,
  session,
  readFigures,
  request,
}: {
  folder: string | null;
  folderName: string;
  agent: string;
  session: MappingSessionPort;
  readFigures: () => Promise<MappingFigures | null>;
  /** The request for the figures the run has now. */
  request: (figures: MappingFigures | null) => string;
}): MappingRunDriver {
  const run = useFolderMappingRun(folder ?? '');
  const [drivenRunId, setDrivenRunId] = useState<number | null>(null);
  const driving = run !== null && run.id === drivenRunId && isMappingActive(run);
  const [sendWanted, setSendWanted] = useState(0);
  const phase = useRef<DriverPhase>('idle');
  const ownRequest = useRef<string | null>(null);
  const foreignTurn = useRef(false);
  const silenced = useRef(false);
  const resends = useRef(0);
  const live =useLatestRef({ session, readFigures, request, folder });

  const currentRun = useCallback(() => (folder ? folderMappingRun(workRuns.read(), folder) : null), [folder]);

  const finish = useCallback(() => {
    phase.current = 'idle';
    ownRequest.current = null;
    foreignTurn.current = false;
    silenced.current = false;
    resends.current = 0;
    if (folder) workRuns.setMappingStop(folder, null);
  }, [folder]);

  const beginRequest = useCallback(async () => {
    phase.current = 'switching';
    await live.current.session.newConversation();
    if (phase.current !== 'switching') return;
    phase.current = 'awaitingSend';
    setSendWanted((wanted) => wanted + 1);
  }, [live]);

  /** Ends a request that never reached the agent; the run's figures stay as they were. */
  const endWithoutTurn = useCallback((outcome: RequestOutcome) => {
    if (!folder) return;
    phase.current = 'ending';
    workRuns.endMappingBatch(folder, { outcome, figures: currentRun()?.now ?? null, draft: false, at: Date.now() });
    finish();
  }, [currentRun, finish, folder]);

  const completeRequest = useCallback(async (completion: AcpTurnCompletion) => {
    if (phase.current !== 'inTurn' || !folder) return;
    const neverSent = completion.outcome === 'cancelled' && completion.stopReason === BASELINE_MOVED;
    if (neverSent && !silenced.current && !foreignTurn.current && currentRun()?.phase === 'running' && resends.current < MAPPING_RESENDS) {
      resends.current += 1;
      phase.current = 'awaitingSend';
      window.setTimeout(() => {
        if (phase.current === 'awaitingSend') setSendWanted((wanted) => wanted + 1);
      }, MAPPING_RESEND_DELAY_MS);
      return;
    }
    phase.current = 'ending';
    // The session records a failed turn's error just after its observer runs.
    await nextTask();
    const { session: port, readFigures: readNow } = live.current;
    const outcome: RequestOutcome = silenced.current || completion.outcome === 'failed' || (neverSent && currentRun()?.phase === 'running')
      ? { kind: 'failed', usageLimit: !silenced.current && !neverSent && port.usageLimited() }
      : { kind: completion.outcome };
    let figures: MappingFigures | null;
    try {
      figures = await readNow();
    } catch {
      figures = currentRun()?.now ?? null;
    }
    const next = workRuns.endMappingBatch(folder, {
      outcome,
      figures,
      draft: port.hasDraft() || foreignTurn.current,
      at: Date.now(),
    });
    silenced.current = false;
    foreignTurn.current = false;
    resends.current = 0;
    if (next?.phase === 'running') await beginRequest();
    else finish();
  }, [beginRequest, currentRun, finish, folder, live]);

  const stopFromStore = useCallback(() => {
    switch (phase.current) {
      case 'inTurn':
        live.current.session.stopRequest();
        return;
      case 'switching':
      case 'awaitingSend':
        endWithoutTurn({ kind: 'cancelled' });
        return;
      default:
    }
  }, [endWithoutTurn, live]);

  const start = useCallback(() => {
    if (phase.current !== 'idle' || !folder) return;
    phase.current = 'switching';
    void (async () => {
      const figures = await live.current.readFigures().catch(() => null);
      const begun = workRuns.beginMapping({ folder, folderName, agent, figures, startedAt: Date.now() });
      if (!begun) {
        phase.current = 'idle';
        return;
      }
      setDrivenRunId(begun.id);
      workRuns.setMappingStop(folder, stopFromStore);
      await beginRequest();
    })();
  }, [agent, beginRequest, folder, folderName, live, stopFromStore]);

  const stop = useCallback(() => {
    if (folder) workRuns.stopRun(`mapping:${folder}`);
  }, [folder]);

  const observeTurnStart = useCallback((turn: AcpTurnStart) => {
    if (phase.current === 'idle') return null;
    if (phase.current === 'inTurn' && ownRequest.current !== null && turn.text === ownRequest.current) {
      ownRequest.current = null;
      return completeRequest;
    }
    // Someone else's turn is the person's own message: it stops the run at this boundary.
    if (phase.current === 'ending') foreignTurn.current = true;
    else if (phase.current === 'switching' || phase.current === 'awaitingSend') stop();
    return null;
  }, [completeRequest, stop]);

  const { status, waitingForAnswer, otherRequestWaiting } = session;
  useEffect(() => {
    if (phase.current !== 'awaitingSend') return;
    const port = live.current.session;
    if (status === 'error' || status === 'exited') {
      endWithoutTurn({ kind: 'failed', usageLimit: port.usageLimited() });
      return;
    }
    if (status !== 'ready' || waitingForAnswer || otherRequestWaiting) return;
    const current = currentRun();
    const text = live.current.request(current?.now ?? current?.start ?? null);
    phase.current = 'inTurn';
    ownRequest.current = text;
    void port.send(text);
    // The session starts a turn synchronously or not at all.
    if (ownRequest.current !== null) {
      ownRequest.current = null;
      endWithoutTurn({ kind: 'failed', usageLimit: false });
    }
  }, [currentRun, endWithoutTurn, live, otherRequestWaiting, sendWanted, status, waitingForAnswer]);

  const reportedAt = useRef(Number.NEGATIVE_INFINITY);
  const reportedAsking = useRef(false);
  const { work, lastTurnUpdateAt: heardAt } = session;
  useEffect(() => {
    if (!driving || !folder || !work) return undefined;
    const wait = work.asking !== reportedAsking.current
      ? 0
      : Math.max(0, reportedAt.current + MAPPING_REPORT_STEP_MS - Date.now());
    const timer = window.setTimeout(() => {
      reportedAt.current = Date.now();
      reportedAsking.current = work.asking;
      workRuns.observeMappingWork(folder, work, reportedAt.current);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [driving, folder, work, heardAt]);

  useEffect(() => {
    if (!driving) return undefined;
    const timer = window.setInterval(() => {
      const current = currentRun();
      if (phase.current !== 'inTurn' || silenced.current || !current || !silentTooLong(current, Date.now())) return;
      silenced.current = true;
      live.current.session.stopRequest();
    }, MAPPING_SILENCE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [currentRun, driving, live]);

  // A panel that goes while no request runs still owes the run its end.
  useEffect(() => () => {
    if (phase.current === 'switching' || phase.current === 'awaitingSend') endWithoutTurn({ kind: 'cancelled' });
  }, [endWithoutTurn]);

  return { run, driving, start, stop, observeTurnStart };
}
