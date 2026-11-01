import { invoke, isTauri } from '@tauri-apps/api/core';

export type PlanningSelection = { generation: number; folder: string; path: string };
export type PlanningInventory = {
  files: { path: string; size: number; modified_seconds: number }[];
  skipped: number;
  partial: boolean;
  visited: number;
  limit_reached: boolean;
  depth_limited: boolean;
  unknown_remainder: boolean;
  omitted: { excluded: number; linked: number; symlink: number; unsupported: number; unreadable: number };
};
export async function planningAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !isTauri()) return false;
  try {
    return await invoke<unknown>('planning_supported') === true;
  } catch {
    return false;
  }
}
export async function choosePlanningFolder(errorMessage: string): Promise<PlanningSelection | null> { return invoke('planning_pick_folder', { errorMessage }); }
export async function scanPlanningFolder(generation: number): Promise<PlanningInventory> { return invoke('planning_scan', { generation }); }
export async function readPlanningFile(generation: number, path: string): Promise<Uint8Array> { return new Uint8Array(await invoke<ArrayBuffer>('planning_read_file', { generation, path })); }
let documentRequest = 0;
export async function openPlanningDocument(generation: number, path: string, expectedIdentity: string | null): Promise<{ identity: string; bytes: Uint8Array }> {
  if (documentRequest >= Number.MAX_SAFE_INTEGER) throw new Error('request-exhausted');
  const request = ++documentRequest;
  const payload = new Uint8Array(await invoke<ArrayBuffer>('planning_open_document', { generation, path, expectedIdentity, request }));
  if (payload.length < 32) throw new Error('invalid-document');
  const identity = new TextDecoder().decode(payload.subarray(0, 32));
  if (!/^[0-9a-f]{32}$/.test(identity) || (expectedIdentity && identity !== expectedIdentity)) throw new Error('invalid-document');
  return { identity, bytes: payload.slice(32) };
}
