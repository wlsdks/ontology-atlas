import { useCallback, useSyncExternalStore } from "react";
import { readOnOff, writeOnOff } from "./preference-storage/on-off-preference";
import { subscribeToPreferenceChange } from "./preference-storage/preference-change-event";

/**
 * On by default: the read runs the person's Claude Code with no network and writes nothing, and
 * without it no room can say a session waits. The setting exists to stop Atlas starting that program.
 */
const SESSION_LIST_READ_KEY = "atlas.workStatus.sessionListRead";
const DEFAULT_SESSION_LIST_READ = true;

function readSessionListRead(): boolean {
  return readOnOff(SESSION_LIST_READ_KEY, DEFAULT_SESSION_LIST_READ);
}

export function writeSessionListRead(value: boolean): void {
  writeOnOff(SESSION_LIST_READ_KEY, value);
}

export function useSessionListReadEnabled(): boolean {
  const getSnapshot = useCallback(() => readSessionListRead(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_SESSION_LIST_READ, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
