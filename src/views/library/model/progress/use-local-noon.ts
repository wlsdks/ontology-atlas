import { useSyncExternalStore } from "react";

function subscribeToDay(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

/** Noon of the local day, so the snapshot holds still all day and moves at midnight. */
function localNoon(): number {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  return day.getTime();
}

/** The local noon, re-read each minute, so a memo keyed on it changes only when the day does. */
export function useLocalNoon(): number {
  return useSyncExternalStore(subscribeToDay, localNoon, localNoon);
}
