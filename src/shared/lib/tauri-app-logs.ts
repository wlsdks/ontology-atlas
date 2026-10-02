import { invoke, isTauri } from '@tauri-apps/api/core';

export function canRevealAppLogFolder(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export async function revealAppLogFolder(): Promise<void> {
  if (!canRevealAppLogFolder()) {
    throw new Error('The log folder can only be shown in the desktop app.');
  }
  await invoke('reveal_app_log_dir');
}
