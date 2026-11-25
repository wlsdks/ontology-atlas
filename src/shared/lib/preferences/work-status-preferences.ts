import { useCallback, useSyncExternalStore } from "react";
import { readOnOff, writeOnOff } from "./preference-storage/on-off-preference";
import { subscribeToPreferenceChange } from "./preference-storage/preference-change-event";

/**
 * On by default: the read runs the person's Claude Code with no network and writes nothing, and
 * without it no room can say a session waits. The setting exists to stop Atlas starting that program.
 */
const SESSION_LIST_READ_KEY = "atlas.workStatus.sessionListRead";
const DEFAULT_SESSION_LIST_READ = true;

/** On by default (decision of 2026-11-25): a name is what matches a room's session to its window. */
const SESSION_NAMES_KEY = "atlas.workStatus.sessionNames";
/** On by default: the pulse is what says "right now"; it counts changes and keeps no file name. */
const FILE_PULSE_KEY = "atlas.workStatus.filePulse";
/** On by default: memory, CPU and GPU use, read by program name and never by command line. */
const LOAD_READ_KEY = "atlas.workStatus.loadRead";
/** All three reads of the 2026-11-25 round start on; each switch stops its read. */
const DEFAULT_ROUND_READ = true;

function useOnOff(key: string, fallback: boolean): boolean {
  const getSnapshot = useCallback(() => readOnOff(key, fallback), [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

export function writeSessionListRead(value: boolean): void {
  writeOnOff(SESSION_LIST_READ_KEY, value);
}

export function useSessionListReadEnabled(): boolean {
  return useOnOff(SESSION_LIST_READ_KEY, DEFAULT_SESSION_LIST_READ);
}

export function writeSessionNamesRead(value: boolean): void {
  writeOnOff(SESSION_NAMES_KEY, value);
}

export function useSessionNamesEnabled(): boolean {
  return useOnOff(SESSION_NAMES_KEY, DEFAULT_ROUND_READ);
}

export function writeFilePulseRead(value: boolean): void {
  writeOnOff(FILE_PULSE_KEY, value);
}

export function useFilePulseEnabled(): boolean {
  return useOnOff(FILE_PULSE_KEY, DEFAULT_ROUND_READ);
}

export function writeLoadRead(value: boolean): void {
  writeOnOff(LOAD_READ_KEY, value);
}

export function useLoadReadEnabled(): boolean {
  return useOnOff(LOAD_READ_KEY, DEFAULT_ROUND_READ);
}
