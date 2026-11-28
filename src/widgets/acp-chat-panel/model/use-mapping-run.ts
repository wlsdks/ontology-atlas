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
import { MOTION } from '@/shared/motion';
import { notMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';
import { widestProjectLine, type MappingProjectLine } from '@/shared/lib/vault-document/mapping-share';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { createVaultTextReader } from '@/shared/lib/vault-folder/vault-text-reader';

/**
 * Drives one press that maps the rest of the code (`docs/specs/2026-11-23-one-press-maps-the-rest.md`):
 * each request in a new conversation, the run's project note read from disk at its end, the next
 * sent while the run's rules say so. It only sends a prompt and reads files; every permission card
 * is left to the person.
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
  /** Sends `text` to the agent; the transcript shows only `shown`. */
  send: (text: string, shown: string) => Promise<void>;
  newConversation: () => Promise<void>;
  /** The folder's file map the turn's baseline compares; a new value is a reload of the folder. */
  folderFiles: object | null;
  /** The root path of the folder whose files are granted now; another folder's note is never read for the run. */
  folderRoot: string | null;
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

export { mappingShare, widestProjectLine, type MappingProjectLine } from '@/shared/lib/vault-document/mapping-share';

/** How the folder's project notes read for a run: the widest at a press, the run's own at a request's end. */
export interface MappingFiguresReader {
  /** The line with the most abilities off the map of every project note; null with none. */
  widest: () => Promise<MappingProjectLine | null>;
  /** The project's line now; null when the note holds none, rejected when the note cannot be read. */
  project: (project: string) => Promise<MappingFigures | null>;
}

/** What a request's end read: the run's line, or for a run without one the widest; `unreadable` when no answer came. */
type RequestEndRead = Pick<MappingRequestEnd, 'figures' | 'unreadable' | 'project'>;

/** A note unread within the wait says nothing about what is left, so it reads as unreadable, never as gone. */
async function readRequestEnd(reader: MappingFiguresReader, project: string | null): Promise<RequestEndRead> {
  try {
    if (project) {
      const figures = await within(reader.project(project), MAPPING_FOLDER_WAIT_MS);
      return figures === undefined ? { figures: null, unreadable: true } : { figures };
    }
    const line = await within(reader.widest(), MAPPING_FOLDER_WAIT_MS);
    if (line === undefined) return { figures: null, unreadable: true };
    return line ? { figures: line.figures, project: line.project } : { figures: null };
  } catch {
    return { figures: null, unreadable: true };
  }
}

/**
 * After a turn: `ending` decides its outcome, `settling` waits for the folder to be still, the
 * figures move, `switchPending` lets their motion finish, then `switching` opens the next conversation.
 */
type DriverPhase = 'idle' | 'ending' | 'settling' | 'switchPending' | 'switching' | 'awaitingSend' | 'inTurn';

type RequestOutcome = MappingRequestEnd['outcome'];

/** How a request's turn ended; a failure is named a usage limit only when its end is read, once the error is in state. */
interface TurnEnd {
  kind: RequestOutcome['kind'];
  silenced: boolean;
}

/** `silentTooLong` is checked this often: the rule speaks in minutes, so nothing ticks per second. */
export const MAPPING_SILENCE_CHECK_MS = 30_000;

/** The agent's reports reach the run at most this often; a permission card goes at once. */
export const MAPPING_REPORT_STEP_MS = 1_000;

/**
 * The agent's last writes reload the folder after its turn ends, and a turn's baseline refuses a
 * folder that reloads under it. A request's end is read once the folder has been still this long:
 * the app's watcher lands a write in 0.45-0.61 s (`.claude/rules/surfaces.md`, measured 2026-11-19).
 * The turn's own closing work and the reload then pass before the row's figures move.
 */
export const MAPPING_FOLDER_STILL_MS = 1_000;
/** A folder that keeps changing holds the request's end no longer than this after its turn ended; a read of the note no longer either. */
export const MAPPING_FOLDER_WAIT_MS = 5_000;
/** The row's count rolls for `MOTION.settle`; the next conversation replaces the transcript after it. */
export const MAPPING_SWITCH_AFTER_MS = MOTION.slow.duration * 1_000;

/** A request with the figures it went out with: `text` for the agent, `shown` for the transcript. */
export interface MappingRequest {
  text: string;
  shown: string;
}

/**
 * Whether a finished request's conversation may open: opening one starts an agent, so not while this
 * conversation works, another holds the folder, or the run still sends requests from anywhere.
 */
export function mayOpenRunRequest(state: { driving: boolean; busy: boolean; folderBusy: boolean; run: MappingRun | null }): boolean {
  return !state.driving && !state.busy && !state.folderBusy && !(state.run !== null && isMappingActive(state.run));
}

/**
 * The folder's widest project line at rest from the manifest, and reads of its project notes from
 * disk: the watcher lands after a turn ends, so a request's end reads the file.
 */
export function useFolderMappingFigures(): { resting: MappingProjectLine | null; reader: MappingFiguresReader } {
  const manifest = useLocalVault().manifest;
  const granted = useGrantedVaultFiles();
  const projects = useMemo(
    () => (manifest?.docs ?? []).filter((doc) => doc.frontmatter.kind === 'project'),
    [manifest],
  );
  const resting = useMemo(
    () => widestProjectLine(projects.map((doc) => ({ project: doc.slug, figures: doc.notMappedAreas ?? null }))),
    [projects],
  );
  const reader = useMemo<MappingFiguresReader>(() => {
    const readNotes = async (slugs: readonly string[]) => {
      if (!granted) return slugs.map(() => null);
      const nativeRoot = getTauriVaultRootPath(granted.root) ?? null;
      return createVaultTextReader(nativeRoot, granted.fileHandles)(slugs.map((slug) => ({ slug, path: `${slug}.md` })));
    };
    return {
      widest: async () => {
        if (!granted || projects.length === 0) return resting;
        const texts = await readNotes(projects.map((doc) => doc.slug));
        // At a press a note the reader cannot open keeps its manifest line, so the choice of project still sees it.
        return widestProjectLine(projects.map((doc, index) => {
          const text = texts[index];
          return { project: doc.slug, figures: text == null ? doc.notMappedAreas ?? null : notMappedAreas(text) };
        }));
      },
      project: async (project) => {
        const [text] = await readNotes([project]);
        if (text == null) throw new Error(`The project note ${project} could not be read.`);
        return notMappedAreas(text);
      },
    };
  }, [granted, projects, resting]);
  return { resting, reader };
}

/** The value, or `undefined` once `ms` passed first. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useMappingRun({
  folder,
  folderName,
  agent,
  session,
  figures,
  request,
}: {
  folder: string | null;
  folderName: string;
  agent: string;
  session: MappingSessionPort;
  figures: MappingFiguresReader;
  /** The request for the figures the run has now, as its `part`th request. */
  request: (figures: MappingFigures | null, part: number) => MappingRequest;
}): MappingRunDriver {
  const run = useFolderMappingRun(folder ?? '');
  const [drivenRunId, setDrivenRunId] = useState<number | null>(null);
  const driving = run !== null && run.id === drivenRunId && isMappingActive(run);
  const [wakes, setWakes] = useState(0);
  const phase = useRef<DriverPhase>('idle');
  const ownRequest = useRef<string | null>(null);
  // The conversation the running request went out in, so its line can open it later.
  const requestSession = useRef<string | null>(null);
  const foreignTurn = useRef(false);
  const silenced = useRef(false);
  const requestEndedAt = useRef(Number.NEGATIVE_INFINITY);
  const turnEnd = useRef<TurnEnd | null>(null);
  // Bumped when the driver goes: work begun before that returns at its next step and starts nothing.
  const life = useRef(0);
  const liveRef = useLatestRef({ session, figures, request, folder });

  const currentRun = useCallback(() => (folder ? folderMappingRun(workRuns.read(), folder) : null), [folder]);

  const finish = useCallback(() => {
    phase.current = 'idle';
    ownRequest.current = null;
    requestSession.current = null;
    foreignTurn.current = false;
    silenced.current = false;
    requestEndedAt.current = Number.NEGATIVE_INFINITY;
    turnEnd.current = null;
    if (folder) workRuns.setMappingStop(folder, null);
  }, [folder]);

  const beginRequest = useCallback(async () => {
    const lifeAtStart = life.current;
    phase.current = 'switching';
    await liveRef.current.session.newConversation();
    if (life.current !== lifeAtStart || phase.current !== 'switching') return;
    phase.current = 'awaitingSend';
    setWakes((count) => count + 1);
  }, [liveRef]);

  /** Ends a request that never reached the agent; the run's figures stay as they were. */
  const endWithoutTurn = useCallback((outcome: RequestOutcome) => {
    if (!folder) return;
    phase.current = 'ending';
    workRuns.endMappingBatch(folder, { outcome, figures: currentRun()?.now ?? null, draft: false, at: Date.now() });
    finish();
  }, [currentRun, finish, folder]);

  /** Reads the request's figures, ends it in the run, and opens the next conversation once the row has moved. */
  const concludeRequest = useCallback(async () => {
    if (phase.current !== 'settling' || !folder) return;
    phase.current = 'ending';
    const lifeAtStart = life.current;
    const ended = turnEnd.current ?? { kind: 'completed', silenced: false };
    turnEnd.current = null;
    const port = liveRef.current.session;
    const outcome: RequestOutcome = ended.kind === 'failed'
      ? { kind: 'failed', usageLimit: !ended.silenced && port.usageLimited() }
      : { kind: ended.kind };
    const current = currentRun();
    // A switched run, or files granted for another folder, must not lend the run another folder's line.
    const sameFolder = current?.stopReason !== 'switched' && port.folderRoot === folder;
    const read: RequestEndRead = sameFolder
      ? await readRequestEnd(liveRef.current.figures, current?.project ?? null)
      : { figures: current?.now ?? null };
    if (life.current !== lifeAtStart || phase.current !== 'ending') return;
    const next = workRuns.endMappingBatch(folder, {
      outcome,
      ...read,
      draft: port.hasDraft() || foreignTurn.current,
      at: requestEndedAt.current,
      ...(requestSession.current ? { sessionId: requestSession.current } : {}),
    });
    foreignTurn.current = false;
    requestSession.current = null;
    if (next?.phase !== 'running') {
      finish();
      return;
    }
    phase.current = 'switchPending';
    window.setTimeout(() => {
      if (life.current === lifeAtStart && phase.current === 'switchPending') void beginRequest();
    }, MAPPING_SWITCH_AFTER_MS);
  }, [beginRequest, currentRun, finish, folder, liveRef]);

  /** The turn ended: its end is read at once when the run is stopping, else by the settle effect once the folder is still. */
  const closeTurn = useCallback((kind: TurnEnd['kind']) => {
    if (phase.current !== 'inTurn' || !folder) return;
    ownRequest.current = null;
    requestEndedAt.current = Date.now();
    turnEnd.current = { kind: silenced.current ? 'failed' : kind, silenced: silenced.current };
    silenced.current = false;
    phase.current = 'settling';
    if (currentRun()?.phase === 'stopping') void concludeRequest();
  }, [concludeRequest, currentRun, folder]);

  const endRequest = useCallback((kind: TurnEnd['kind']) => {
    closeTurn(kind);
    if (phase.current === 'settling') setWakes((count) => count + 1);
  }, [closeTurn]);

  const completeRequest = useCallback(async (completion: AcpTurnCompletion) => {
    endRequest(completion.outcome);
  }, [endRequest]);

  /** A turn the session is no longer running cannot be stopped: its request ends here instead. */
  const stopTurnOrEnd = useCallback((kind: TurnEnd['kind']) => {
    const port = liveRef.current.session;
    if (port.status === 'thinking') port.stopRequest();
    else endRequest(kind);
  }, [endRequest, liveRef]);

  const stopFromStore = useCallback(() => {
    switch (phase.current) {
      case 'inTurn':
        stopTurnOrEnd('cancelled');
        return;
      case 'settling':
        // The request already ended: its end is read now instead of after the folder settles.
        void concludeRequest();
        return;
      case 'switchPending':
      case 'switching':
      case 'awaitingSend':
        endWithoutTurn({ kind: 'cancelled' });
        return;
      default:
        // `ending` reads the stop when its bounded read returns; `idle` has nothing to stop.
    }
  }, [concludeRequest, endWithoutTurn, stopTurnOrEnd]);

  const start = useCallback(() => {
    if (phase.current !== 'idle' || !folder) return;
    const lifeAtStart = life.current;
    phase.current = 'switching';
    void (async () => {
      const line = await within(liveRef.current.figures.widest(), MAPPING_FOLDER_WAIT_MS).catch(() => undefined);
      if (life.current !== lifeAtStart || phase.current !== 'switching') return;
      const begun = workRuns.beginMapping({
        folder, folderName, agent, project: line?.project ?? null, figures: line?.figures ?? null, startedAt: Date.now(),
      });
      if (!begun) {
        phase.current = 'idle';
        return;
      }
      setDrivenRunId(begun.id);
      workRuns.setMappingStop(folder, stopFromStore);
      await beginRequest();
    })();
  }, [agent, beginRequest, folder, folderName, liveRef, stopFromStore]);

  const stop = useCallback(() => {
    if (folder) workRuns.stopRun(`mapping:${folder}`);
  }, [folder]);

  const observeTurnStart = useCallback((turn: AcpTurnStart) => {
    if (phase.current === 'idle') return null;
    if (phase.current === 'inTurn' && ownRequest.current !== null && turn.text === ownRequest.current) {
      ownRequest.current = null;
      requestSession.current = turn.sessionId;
      if (folder) workRuns.noteMappingSession(folder, turn.sessionId);
      return completeRequest;
    }
    // Someone else's turn is the person's own message: it stops the run at this boundary.
    if (phase.current === 'ending') foreignTurn.current = true;
    else if (phase.current !== 'inTurn' && folder) workRuns.stopMappingForMessage(folder);
    return null;
  }, [completeRequest, folder]);

  const { status, waitingForAnswer, otherRequestWaiting, folderFiles } = session;
  const folderChangedAt = useRef(Number.NEGATIVE_INFINITY);
  const seenFolderFiles = useRef(folderFiles);
  // Declared before the settle effect, so a reload in the same commit holds the request's end.
  useEffect(() => {
    if (seenFolderFiles.current === folderFiles) return;
    seenFolderFiles.current = folderFiles;
    folderChangedAt.current = Date.now();
  }, [folderFiles]);
  useEffect(() => {
    const port = liveRef.current.session;
    const sessionGone = status === 'error' || status === 'exited';
    if (phase.current === 'inTurn') {
      // A turn the session lost on its way out; the settle effect below reads its end in this commit.
      if (sessionGone || status === 'idle') closeTurn(status === 'idle' ? 'cancelled' : 'failed');
      return;
    }
    if (phase.current !== 'awaitingSend') return;
    if (sessionGone) {
      endWithoutTurn({ kind: 'failed', usageLimit: port.usageLimited() });
      return;
    }
    // Not starting and not ready: the session was stopped, and nothing will start it for the run.
    if (status === 'idle') {
      endWithoutTurn({ kind: 'cancelled' });
      return;
    }
    if (status !== 'ready' || waitingForAnswer || otherRequestWaiting) return;
    const current = currentRun();
    const { text, shown } = liveRef.current.request(current?.now ?? current?.start ?? null, current?.requestsSent ?? 1);
    phase.current = 'inTurn';
    ownRequest.current = text;
    void port.send(text, shown);
    // The session starts a turn synchronously or not at all.
    if (ownRequest.current !== null) {
      ownRequest.current = null;
      endWithoutTurn({ kind: 'failed', usageLimit: false });
    }
  }, [closeTurn, currentRun, endWithoutTurn, liveRef, otherRequestWaiting, status, waitingForAnswer, wakes]);

  useEffect(() => {
    if (phase.current !== 'settling' || !folder) return undefined;
    const stillFrom = Math.max(folderChangedAt.current, requestEndedAt.current);
    const goAt = Math.min(stillFrom + MAPPING_FOLDER_STILL_MS, requestEndedAt.current + MAPPING_FOLDER_WAIT_MS);
    const waitMs = goAt - Date.now();
    if (waitMs > 0) {
      const timer = window.setTimeout(() => setWakes((count) => count + 1), waitMs);
      return () => window.clearTimeout(timer);
    }
    void concludeRequest();
    return undefined;
  }, [concludeRequest, folder, folderFiles, status, wakes]);

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
      if (!current || !silentTooLong(current, Date.now())) return;
      if (phase.current === 'inTurn' && !silenced.current) {
        silenced.current = true;
        stopTurnOrEnd('failed');
      } else if (phase.current === 'switching' || phase.current === 'awaitingSend') {
        endWithoutTurn({ kind: 'failed', usageLimit: false });
      }
    }, MAPPING_SILENCE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [currentRun, driving, endWithoutTurn, stopTurnOrEnd]);

  // A driver that goes ends its run, whatever the phase: no run outlives the panel that sends its requests.
  useEffect(() => () => {
    life.current += 1;
    if (phase.current !== 'idle') endWithoutTurn({ kind: 'cancelled' });
  }, [endWithoutTurn]);

  return { run, driving, start, stop, observeTurnStart };
}
