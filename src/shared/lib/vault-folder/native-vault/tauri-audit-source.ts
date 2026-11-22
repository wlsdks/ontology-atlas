import { getTauriInvoke, getTauriVaultRootPath } from './tauri-vault-runtime';

export interface NativeAuditSource {
  missing: boolean;
  stream?: ReadableStream<Uint8Array>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
}
let retiredAuditRead: { signal?: AbortSignal; done: Promise<void> } | null = null;
export async function openTauriAuditSource(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<NativeAuditSource | null> {
  const rootPath = getTauriVaultRootPath(handle);
  const invoke = getTauriInvoke();
  if (!rootPath || !invoke) return null;
  if (retiredAuditRead?.signal?.aborted) await retiredAuditRead.done;
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  let resolveDone!: () => void;
  const done = new Promise<void>(resolve => { resolveDone = resolve; });
  retiredAuditRead = { signal, done };
  let readerId: string | null;
  try { readerId = await invoke<string | null>('audit_read_prepare'); }
  catch (error) { resolveDone(); throw error; }
  if (readerId === null) { resolveDone(); return null; }
  let closed = false;
  let inFlight: Promise<unknown> | null = null;
  const cancel = async () => {
    if (closed) { await done; return; }
    closed = true;
    try {
      await invoke('audit_read_cancel', { readerId });
      await inFlight?.catch(() => undefined);
      await invoke('audit_read_cancel', { readerId });
    } finally { signal?.removeEventListener('abort', abort); resolveDone(); }
  };
  const abort = () => { void cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const begin = await (inFlight = invoke<{ missing: boolean; size: number }>('audit_read_begin', { readerId, rootPath }));
    inFlight = null;
    if (signal?.aborted || closed) throw new DOMException('Cancelled', 'AbortError');
    if (begin.missing) { await cancel(); return { missing: true, finish: async () => {}, cancel }; }
    if (!Number.isSafeInteger(begin.size) || begin.size < 0) throw new Error('audit-read-failed');
    let cursor = 0;
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
      try {
        if (signal?.aborted || closed) throw new DOMException('Cancelled', 'AbortError');
        if (cursor === begin.size) { controller.close(); return; }
        const buffer = await (inFlight = invoke<ArrayBuffer>('audit_read_pull', { readerId, cursor }));
        inFlight = null;
        if (signal?.aborted || closed) throw new DOMException('Cancelled', 'AbortError');
        const view = new DataView(buffer);
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        if (bytes.length === 0 || bytes.length > 1024 * 1024 || cursor + bytes.length > begin.size) throw new Error('audit-read-failed');
        cursor += bytes.length; controller.enqueue(bytes);
      } catch (error) { controller.error(error); }
    }, cancel }, { highWaterMark: 0 });
    return { missing: false, stream, cancel, async finish() {
      if (signal?.aborted || closed) throw new DOMException('Cancelled', 'AbortError');
      try { await invoke('audit_read_finish', { readerId }); }
      finally { await cancel(); }
    } };
  } catch (error) { await cancel(); throw error; }
}
