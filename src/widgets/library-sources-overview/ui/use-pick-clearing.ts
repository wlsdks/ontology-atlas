"use client";

import { useEffect, useState } from "react";

import { pickWithNoFolderLeft, type SourcePick } from "../model/source-pick";

/**
 * Escape clears a pick, and so does a picked folder that left the disk. Returns the name of the
 * folder that left, said once: the next pick clears it.
 */
export function usePickClearing({
  pick,
  onPick,
  counted,
  hasGroup,
}: {
  pick: SourcePick | null;
  onPick: (pick: SourcePick | null) => void;
  counted: boolean;
  hasGroup: (key: string) => boolean;
}): string | null {
  useEffect(() => {
    if (pick === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, pick]);
  const vanishedPick = pickWithNoFolderLeft(pick, { counted, hasGroup });
  const [gone, setGone] = useState<string | null>(null);
  if (vanishedPick && gone !== vanishedPick.name) setGone(vanishedPick.name);
  if (gone !== null && pick !== null && !vanishedPick) setGone(null);
  useEffect(() => {
    if (vanishedPick) onPick(null);
  }, [onPick, vanishedPick]);
  return gone;
}
