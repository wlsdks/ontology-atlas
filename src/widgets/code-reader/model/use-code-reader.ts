import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { failureCodeOf } from "@/shared/lib/failures/failure-code";
import {
  type CodeWindow,
  readCodeFileStamp,
  readCodeWindow,
} from "@/shared/lib/project-source/tauri-code-reader";
import {
  type CodeReaderRefusalState,
  type CodeReaderTarget,
  refusalState,
  WINDOW_STEP_LINES,
  type WindowRequest,
  windowAround,
  windowJoining,
} from "./code-reader-model";

/** The sentence that a read is under way waits this long, so a quick read never flashes it. */
export const READING_NOTICE_DELAY_MS = 150;

export interface CodeReaderText {
  firstLine: number;
  lines: string[];
  totalLines: number;
  /** A line too long to read whole, shown up to the read's byte bound. */
  cutLine: number | null;
  lastModified: number;
  bytes: number;
}

/** Where the code box should bring a line into view; `smooth` only when the person asked. */
export interface CodeReaderScroll {
  line: number;
  smooth: boolean;
  nonce: number;
}

interface ReaderSnapshot {
  key: string;
  status: "reading" | "ready" | "refused";
  refusal: CodeReaderRefusalState | null;
  text: CodeReaderText | null;
  /** The selected cited range, or null for the file's top. */
  activeRange: number | null;
  changed: boolean;
  more: "above" | "below" | null;
  scroll: CodeReaderScroll | null;
}

export interface CodeReader {
  status: ReaderSnapshot["status"];
  refusal: CodeReaderRefusalState | null;
  text: CodeReaderText | null;
  activeRange: number | null;
  changed: boolean;
  readingNoticeShown: boolean;
  more: ReaderSnapshot["more"];
  scroll: CodeReaderScroll | null;
  selectRange: (index: number | null) => void;
  showAbove: () => void;
  showBelow: () => void;
  readAgain: () => void;
}

function textOf(window: CodeWindow): CodeReaderText {
  return {
    firstLine: window.firstLine,
    lines: window.lines,
    totalLines: window.totalLines,
    cutLine: window.cutLine,
    lastModified: window.lastModified,
    bytes: window.bytes,
  };
}

function holdsLines(text: CodeReaderText | null, first: number, last: number): boolean {
  return Boolean(text && first >= text.firstLine && last <= text.firstLine + text.lines.length - 1);
}

/**
 * Reads windows of the target file while the reader is open. A read that returns after the
 * concept or file changed is dropped; while open it reads nothing until the person asks, and
 * checks the file's time and size only when the window regains focus.
 */
export function useCodeReader(input: {
  vaultPath: string | null;
  target: CodeReaderTarget | null;
  open: boolean;
}): CodeReader {
  const { vaultPath, target, open } = input;
  const key = open && vaultPath && target ? `${vaultPath}\0${target.path}` : null;
  const [snapshot, setSnapshot] = useState<ReaderSnapshot | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const generation = useRef(0);
  const nonce = useRef(0);
  const current = snapshot && snapshot.key === key ? snapshot : null;
  const targetRef = useRef(target);
  // Synced before the read effect below, which runs after it in the same commit.
  useLayoutEffect(() => {
    targetRef.current = target;
  });

  const readWindow = useCallback(
    (readKey: string, request: WindowRequest, apply: (window: CodeWindow, previous: ReaderSnapshot) => ReaderSnapshot) => {
      const path = targetRef.current?.path;
      if (!vaultPath || !path) return;
      const issued = generation.current;
      void readCodeWindow(vaultPath, path, request.firstLine, request.lineCount).then(
        (window) => {
          if (generation.current !== issued) return;
          setSnapshot((previous) => (previous && previous.key === readKey ? apply(window, previous) : previous));
        },
        (error: unknown) => {
          if (generation.current !== issued) return;
          setSnapshot((previous) =>
            previous && previous.key === readKey
              ? previous.text
                ? { ...previous, changed: true, more: null }
                : { ...previous, status: "refused", refusal: refusalState(failureCodeOf(error)), more: null }
              : previous,
          );
        },
      );
    },
    [vaultPath],
  );

  useEffect(() => {
    generation.current += 1;
    if (!key) return;
    const first = targetRef.current?.ranges[0] ?? null;
    setSnapshot({
      key,
      status: "reading",
      refusal: null,
      text: null,
      activeRange: first ? 0 : null,
      changed: false,
      more: null,
      scroll: null,
    });
    readWindow(key, windowAround(first), (window, previous) => ({
      ...previous,
      status: "ready",
      text: textOf(window),
      scroll: { line: first?.startLine ?? 1, smooth: false, nonce: ++nonce.current },
    }));
  }, [key, readWindow]);

  const reading = current?.status === "reading" && !current.text;
  useEffect(() => {
    if (!reading || !key) return;
    const timer = window.setTimeout(() => setNoticeKey(key), READING_NOTICE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [reading, key]);

  const textStamp = current?.text ? `${current.text.lastModified}\0${current.text.bytes}` : null;
  useEffect(() => {
    if (!key || !textStamp || !vaultPath || !target) return;
    const path = target.path;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      const issued = generation.current;
      void readCodeFileStamp(vaultPath, path).then(
        (stamp) => `${stamp.lastModified}\0${stamp.bytes}`,
        () => null,
      ).then((seen) => {
        if (generation.current !== issued || seen === textStamp) return;
        setSnapshot((previous) => (previous && previous.key === key ? { ...previous, changed: true } : previous));
      });
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [key, textStamp, vaultPath, target]);

  const selectRange = useCallback(
    (index: number | null) => {
      if (!current || !key) return;
      const range = index === null ? null : targetRef.current?.ranges[index] ?? null;
      const first = range?.startLine ?? 1;
      const last = range?.endLine ?? 1;
      if (holdsLines(current.text, first, last)) {
        setSnapshot({ ...current, activeRange: index, scroll: { line: first, smooth: true, nonce: ++nonce.current } });
        return;
      }
      setSnapshot({ ...current, activeRange: index });
      // A range near the lines shown is read together with them, so the box glides there.
      const shown = current.text;
      const joined = shown && range ? windowJoining({ firstLine: shown.firstLine, lineCount: shown.lines.length }, range) : null;
      readWindow(key, joined ?? windowAround(range), (window, previous) => ({
        ...previous,
        text: textOf(window),
        changed: previous.changed || (previous.text !== null && previous.text.lastModified !== window.lastModified),
        scroll: { line: first, smooth: joined !== null, nonce: ++nonce.current },
      }));
    },
    [current, key, readWindow],
  );

  const showAbove = useCallback(() => {
    const text = current?.text;
    if (!current || !key || !text || text.firstLine <= 1 || current.more) return;
    const firstLine = Math.max(1, text.firstLine - WINDOW_STEP_LINES);
    setSnapshot({ ...current, more: "above" });
    readWindow(key, { firstLine, lineCount: text.firstLine - firstLine }, (window, previous) => {
      if (!previous.text || window.lastModified !== previous.text.lastModified) return { ...previous, changed: true, more: null };
      return {
        ...previous,
        more: null,
        text: {
          ...previous.text,
          firstLine: window.firstLine,
          lines: [...window.lines, ...previous.text.lines],
          cutLine: window.cutLine ?? previous.text.cutLine,
        },
      };
    });
  }, [current, key, readWindow]);

  const showBelow = useCallback(() => {
    const text = current?.text;
    if (!current || !key || !text || current.more) return;
    const nextLine = text.firstLine + text.lines.length;
    if (nextLine > text.totalLines) return;
    setSnapshot({ ...current, more: "below" });
    readWindow(key, { firstLine: nextLine, lineCount: WINDOW_STEP_LINES }, (window, previous) => {
      if (!previous.text || window.lastModified !== previous.text.lastModified) return { ...previous, changed: true, more: null };
      return {
        ...previous,
        more: null,
        text: { ...previous.text, lines: [...previous.text.lines, ...window.lines], cutLine: previous.text.cutLine ?? window.cutLine },
      };
    });
  }, [current, key, readWindow]);

  const readAgain = useCallback(() => {
    if (!current || !key) return;
    const range = current.activeRange === null ? null : targetRef.current?.ranges[current.activeRange] ?? null;
    readWindow(key, windowAround(range), (window, previous) => ({
      ...previous,
      status: "ready",
      changed: false,
      text: textOf(window),
      scroll: { line: range?.startLine ?? 1, smooth: false, nonce: ++nonce.current },
    }));
  }, [current, key, readWindow]);

  return {
    status: current?.status ?? "reading",
    refusal: current?.refusal ?? null,
    text: current?.text ?? null,
    activeRange: current?.activeRange ?? null,
    changed: current?.changed ?? false,
    readingNoticeShown: reading && noticeKey === key,
    more: current?.more ?? null,
    scroll: current?.scroll ?? null,
    selectRange,
    showAbove,
    showBelow,
    readAgain,
  };
}
