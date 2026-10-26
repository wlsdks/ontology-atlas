import { invoke, isTauri } from '@tauri-apps/api/core';

export async function invokeCancellable<T>(command: string, args: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  if (typeof window === 'undefined' || !isTauri()) throw new Error('native-unavailable');
  const requestId = await invoke<string>('llm_chat_prepare');
  const cancel = () => { void invoke('llm_chat_cancel', { requestId }).catch(() => {}); };
  if (signal.aborted) { cancel(); throw new DOMException('Aborted', 'AbortError'); }
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await invoke<T>(command, { ...args, requestId });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return result;
  } finally { signal.removeEventListener('abort', cancel); }
}
