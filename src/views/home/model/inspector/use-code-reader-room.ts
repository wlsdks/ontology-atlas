"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Whether the code reader holds the room the concept list and the conversation give up.
 * `withdrawn`: the person brought one of them back, so the reader closes and nothing is restored.
 */
export type CodeReaderRoomState = "none" | "held" | "withdrawn";

export interface CodeReaderRoom {
  state: CodeReaderRoomState;
  hold: () => void;
  release: () => void;
  withdraw: () => void;
  /** Counts the reader settling in a seat, which the map answers by keeping the selection clear. */
  seatToken: number;
  seatSettled: () => void;
}

/** One per map view: the room the reader takes and the moments it settles. */
export function useCodeReaderRoom(): CodeReaderRoom {
  const [state, setState] = useState<CodeReaderRoomState>("none");
  // Only a free room can be taken: a withdrawn one waits for the reader to close.
  const hold = useCallback(() => setState((current) => (current === "none" ? "held" : current)), []);
  const release = useCallback(() => setState("none"), []);
  const withdraw = useCallback(() => setState((current) => (current === "held" ? "withdrawn" : current)), []);
  const [seatToken, setSeatToken] = useState(0);
  const seatSettled = useCallback(() => setSeatToken((count) => count + 1), []);
  return useMemo(
    () => ({ state, hold, release, withdraw, seatToken, seatSettled }),
    [state, hold, release, withdraw, seatToken, seatSettled],
  );
}
