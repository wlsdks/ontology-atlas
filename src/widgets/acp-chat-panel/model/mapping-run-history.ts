import { useEffect, useSyncExternalStore } from 'react';

import type { useAcpSession } from '@/features/acp-session';

/** One past conversation as the agent's `session/list` names it. */
type AcpSessionSummary = ReturnType<typeof useAcpSession>['sessions'][number];

/**
 * A run of requests that maps the rest of the code opens a new agent conversation per request; to
 * the person it is one conversation and one History row. This groups them at display time only.
 */

/** The opening sentence of the map-rest request in one locale: its words, with `null` where a number stands. */
export type RequestOpening = ReadonlyArray<string | null>;

/** A History row: a conversation of its own, or every conversation of one run, oldest first. */
export type HistoryRow =
  | { kind: 'conversation'; session: AcpSessionSummary }
  | { kind: 'run'; key: string; sessions: readonly AcpSessionSummary[]; updatedAt: string | null };

const PLACEHOLDER = /\{[^{}]*\}/g;
const SENTENCE_END = /[.。]/;
/** A number as the catalogue formats one: digits with group or decimal marks between them. */
const FORMATTED_NUMBER = /^\d+(?:[,.  ]\d+)*/;
/** A title must agree with this many characters of the opening's words, so a short or numeric title never matches. */
const OPENING_WORDS_AT_LEAST = 12;

/** The catalogue's request up to the end of its first sentence, placeholders as `null`. O(prompt length). */
export function requestOpening(prompt: string): RequestOpening {
  const opening: Array<string | null> = [];
  let from = 0;
  for (const placeholder of prompt.matchAll(PLACEHOLDER)) {
    const words = prompt.slice(from, placeholder.index);
    const end = words.search(SENTENCE_END);
    if (end !== -1) {
      opening.push(words.slice(0, end + 1));
      return opening;
    }
    if (words) opening.push(words);
    opening.push(null);
    from = placeholder.index + placeholder[0].length;
  }
  const rest = prompt.slice(from);
  const end = rest.search(SENTENCE_END);
  opening.push(end === -1 ? rest : rest.slice(0, end + 1));
  return opening;
}

/** The request after its opening sentence, the one that states the count, for a run that read no figures. */
export function requestWithoutCount(request: string): string {
  return request.slice(request.search(SENTENCE_END) + 1).trimStart();
}

/**
 * The text begins as the opening does, numbers in its places; a text cut short (as an agent's
 * title may be) matches while it agrees as far as it goes. O(text length + opening length).
 */
export function beginsWithOpening(text: string, opening: RequestOpening): boolean {
  let at = 0;
  let wordsMatched = 0;
  for (const part of opening) {
    if (at >= text.length) break;
    const rest = text.slice(at);
    if (part === null) {
      const number = FORMATTED_NUMBER.exec(rest);
      if (!number) return false;
      at += number[0].length;
    } else if (rest.startsWith(part)) {
      at += part.length;
      wordsMatched += part.length;
    } else if (part.startsWith(rest)) {
      wordsMatched += rest.length;
      at = text.length;
    } else {
      return false;
    }
  }
  return wordsMatched >= OPENING_WORDS_AT_LEAST;
}

/**
 * History's rows: conversations a run of this launch sent its requests in become that run's row
 * (exact), and conversations whose titles open as the request does become one row while they
 * follow one another (after a restart, when nothing else is known). Every other conversation is
 * left as it is, in the agent's order. O(conversations + known ids).
 */
export function groupRunConversations(
  sessions: readonly AcpSessionSummary[],
  knownRuns: ReadonlyArray<readonly string[]>,
  isRunRequest: (title: string) => boolean,
): HistoryRow[] {
  const runOf = new Map<string, number>();
  knownRuns.forEach((ids, index) => ids.forEach((id) => runOf.set(id, index)));
  const knownMembers = new Map<number, AcpSessionSummary[]>();
  for (const session of sessions) {
    const run = runOf.get(session.sessionId);
    if (run !== undefined) knownMembers.set(run, [...(knownMembers.get(run) ?? []), session]);
  }

  const rows: HistoryRow[] = [];
  const emitted = new Set<number>();
  let streak: AcpSessionSummary[] = [];
  const closeStreak = () => {
    if (streak.length > 0) rows.push(runRow(streak));
    streak = [];
  };
  for (const session of sessions) {
    const run = runOf.get(session.sessionId);
    if (run !== undefined) {
      closeStreak();
      if (!emitted.has(run)) {
        emitted.add(run);
        rows.push(runRow(knownMembers.get(run) ?? [session]));
      }
    } else if (session.title !== null && isRunRequest(session.title)) {
      streak.push(session);
    } else {
      closeStreak();
      rows.push({ kind: 'conversation', session });
    }
  }
  closeStreak();
  return rows;
}

/** Members in the agent's order, newest first: the row keeps the newest time and lists them oldest first. */
function runRow(newestFirst: readonly AcpSessionSummary[]): HistoryRow {
  const sessions = [...newestFirst].reverse();
  return { kind: 'run', key: `run:${sessions[0]?.sessionId ?? ''}`, sessions, updatedAt: newestFirst[0]?.updatedAt ?? null };
}

let openings: readonly RequestOpening[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** The four catalogues are read only when a run request may need recognising, never at first paint. */
function loadOpenings() {
  loading ??= Promise.all([
    import('@/messages/en/acpChat.json'),
    import('@/messages/ko/acpChat.json'),
    import('@/messages/ja/acpChat.json'),
    import('@/messages/zh/acpChat.json'),
  ]).then((catalogues) => {
    openings = catalogues.map((catalogue) => requestOpening(catalogue.default.suggest.mapArea.prompt));
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The openings of the map-rest request in every locale the app speaks; read once `needed`, empty until then. */
export function useRequestOpenings(needed: boolean): readonly RequestOpening[] {
  useEffect(() => {
    if (needed) loadOpenings();
  }, [needed]);
  return useSyncExternalStore(subscribe, () => openings, () => openings);
}

/** The text opens as the app's map-rest request does, in any locale. */
export function isRunRequestText(text: string, known: readonly RequestOpening[]): boolean {
  return known.some((opening) => beginsWithOpening(text, opening));
}
