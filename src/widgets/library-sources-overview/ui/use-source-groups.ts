"use client";

import { useLayoutEffect, useState } from "react";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { SourceGroupIndex } from "../model/source-group-index";

/** A step yields after this long, so a press or a scroll is never held behind grouping. */
const SLICE_MS = 6;

/** Runs `step` in a fresh task, ahead of timers' 4 ms clamp. */
function nextTask(step: () => void): () => void {
  if (typeof MessageChannel === "undefined") {
    const id = setTimeout(step, 0);
    return () => clearTimeout(id);
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = () => step();
  channel.port2.postMessage(null);
  return () => {
    channel.port1.onmessage = null;
  };
}

/**
 * The group index for `sources`, applied in slices of at most `SLICE_MS`: the first slice runs before
 * the first paint, so the rows of the first files counted show at once, and the rest follow in later
 * tasks. `revision` changes whenever a slice changed a count.
 */
export function useSourceGroups(sources: readonly LibrarySourceRow[]): { index: SourceGroupIndex; revision: number; applied: boolean } {
  const [index] = useState(() => new SourceGroupIndex());
  const [state, setState] = useState({ revision: 0, applied: false });

  useLayoutEffect(() => {
    let live = true;
    let cancel: (() => void) | null = null;
    const run = () => {
      if (!live) return;
      const result = index.sync(sources, performance.now() + SLICE_MS);
      if (result.foldersTouched > 0 || result.done) {
        setState((previous) =>
          result.foldersTouched === 0 && previous.applied === result.done
            ? previous
            : { revision: previous.revision + (result.foldersTouched > 0 ? 1 : 0), applied: result.done },
        );
      }
      cancel = result.done ? null : nextTask(run);
    };
    run();
    return () => {
      live = false;
      cancel?.();
    };
  }, [index, sources]);

  return { index, revision: state.revision, applied: state.applied };
}
