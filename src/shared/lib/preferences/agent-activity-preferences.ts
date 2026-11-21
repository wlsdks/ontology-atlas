import { useCallback, useSyncExternalStore } from "react";
import { readOnOff, writeOnOff } from "./on-off-preference";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-change-event";
import { createStoredSnapshot } from "./stored-snapshot";

/**
 * On by default, unlike the opt-in frame meter: an agent editing the folder is a fact, not a diagnostic,
 * so the setting exists to turn it off.
 */
const AGENT_STATUS_KEY = "atlas.agentActivity.status";
const AGENT_NOTIFICATIONS_KEY = "atlas.agentActivity.notifications";
const AGENT_NOTIFICATION_KINDS_KEY = "atlas.agentActivity.kinds";

const DEFAULT_AGENT_ACTIVITY_STATUS = true;
const DEFAULT_AGENT_NOTIFICATIONS = true;

function readAgentActivityStatus(): boolean {
  return readOnOff(AGENT_STATUS_KEY, DEFAULT_AGENT_ACTIVITY_STATUS);
}

export function writeAgentActivityStatus(value: boolean): void {
  writeOnOff(AGENT_STATUS_KEY, value);
}

export function useAgentActivityStatusEnabled(): boolean {
  const getSnapshot = useCallback(() => readAgentActivityStatus(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_AGENT_ACTIVITY_STATUS, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

function readAgentNotificationsEnabled(): boolean {
  return readOnOff(AGENT_NOTIFICATIONS_KEY, DEFAULT_AGENT_NOTIFICATIONS);
}

export function writeAgentNotificationsEnabled(value: boolean): void {
  writeOnOff(AGENT_NOTIFICATIONS_KEY, value);
}

export function useAgentNotificationsEnabled(): boolean {
  const getSnapshot = useCallback(() => readAgentNotificationsEnabled(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_AGENT_NOTIFICATIONS, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

/**
 * Stores the muted kinds, not the enabled ones, so a newly added kind arrives on for everyone
 * rather than silently off for existing users.
 */
const EMPTY_MUTED: ReadonlySet<string> = new Set();

function readMutedAgentNotificationKinds(): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_MUTED;
  try {
    const saved = window.localStorage.getItem(AGENT_NOTIFICATION_KINDS_KEY);
    if (!saved) return EMPTY_MUTED;
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((item): item is string => typeof item === "string"))
      : EMPTY_MUTED;
  } catch {
    return EMPTY_MUTED;
  }
}

export function writeMutedAgentNotificationKinds(kinds: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_NOTIFICATION_KINDS_KEY, JSON.stringify([...kinds].sort()));
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

const mutedSnapshot = createStoredSnapshot(
  AGENT_NOTIFICATION_KINDS_KEY,
  EMPTY_MUTED,
  readMutedAgentNotificationKinds,
);

export function useMutedAgentNotificationKinds(): ReadonlySet<string> {
  const getSnapshot = useCallback(() => mutedSnapshot(), []);
  const getServerSnapshot = useCallback(() => EMPTY_MUTED, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
