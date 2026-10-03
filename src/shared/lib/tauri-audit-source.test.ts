import { afterEach, describe, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: runtime.invoke, isTauri: () => true }));
import { createTauriVaultHandle, openTauriAuditSource } from './tauri-vault-fs';
import { AuditReadError, parseLlmAuditLog, readLlmAuditSummary } from './llm-audit-log';
afterEach(() => runtime.invoke.mockReset());
function transport(raw: string, fail?: string) {
  const bytes=new TextEncoder().encode(raw);const calls:string[]=[];
  runtime.invoke.mockImplementation(async(command:string,args?:Record<string,unknown>)=>{
    calls.push(command);
    if(command==='audit_read_prepare')return 'id';
    if(command==='audit_read_begin')return {missing:false,size:bytes.length};
    if(command==='audit_read_pull') { if(fail)throw new Error(fail);const offset=args!.cursor as number;return bytes.slice(offset,offset+37).buffer; }
    if(command==='audit_read_finish'||command==='audit_read_cancel')return;
    throw new Error(`unexpected ${command}`);
  });return calls;
}
describe('native audit pull transport',()=>{
  it('keeps exact facts without calling whole-file binary loading',async()=>{
    const raw=Array.from({length:17},(_,i)=>JSON.stringify({v:1,at:String(i),provider:'local',question:'한국어 🔎',outcome:i%2?'ok':'future'})).join('\n');
    const calls=transport(raw);expect(await readLlmAuditSummary(createTauriVaultHandle('/vault'),{limit:5})).toEqual({total:17,entries:parseLlmAuditLog(raw,{limit:5})});
    expect(calls).toContain('audit_read_finish');expect(calls).not.toContain('read_vault_binary_file');expect(calls).not.toContain('read_vault_text_file');
  });
  it('propagates changed generations instead of publishing partial or zero counts',async()=>{
    const calls=transport('{"v":1,"at":"x","provider":"p"}', 'audit-read-changed');
    await expect(readLlmAuditSummary(createTauriVaultHandle('/vault'))).rejects.toMatchObject({reason:'changed'});
    expect(calls).toContain('audit_read_cancel');
  });
  it('validates generation at EOF before publishing even an empty log',async()=>{
    transport('');runtime.invoke.mockImplementation(async(command:string)=>{
      if(command==='audit_read_prepare')return 'id';if(command==='audit_read_begin')return{missing:false,size:0};if(command==='audit_read_finish')throw new Error('audit-read-changed');return;
    });await expect(readLlmAuditSummary(createTauriVaultHandle('/vault'))).rejects.toBeInstanceOf(AuditReadError);
  });
  it('reclaims a ticket when cancellation wins during prepare',async()=>{
    const controller=new AbortController();let resolve!:(id:string)=>void;const cancel=vi.fn();
    runtime.invoke.mockImplementation((command:string)=>command==='audit_read_prepare'?new Promise(done=>{resolve=done;}):cancel());
    const pending=openTauriAuditSource(createTauriVaultHandle('/vault'),controller.signal);
    await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));controller.abort();resolve('id');await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(cancel).toHaveBeenCalled();
  });
  it('waits for an aborted pending prepare before reserving its successor', async () => {
    const controller = new AbortController();
    let resolvePrepare!: (id: string) => void;
    let owned = false;
    let prepares = 0;
    runtime.invoke.mockImplementation(async (command: string) => {
      if (command === 'audit_read_prepare') {
        prepares++;
        if (owned) throw new Error('audit-read-failed');
        owned = true;
        if (prepares === 1) return new Promise<string>(resolve => { resolvePrepare = resolve; });
        return 'successor';
      }
      if (command === 'audit_read_cancel') { owned = false; return; }
      if (command === 'audit_read_begin') return { missing: true, size: 0 };
      throw new Error(`unexpected ${command}`);
    });
    const old = openTauriAuditSource(createTauriVaultHandle('/old'), controller.signal);
    const oldResult = old.catch(error => error);
    await vi.waitFor(() => expect(resolvePrepare).toBeTypeOf('function'));
    controller.abort();
    const next = openTauriAuditSource(createTauriVaultHandle('/next'), new AbortController().signal);
    const nextResult = next.catch(error => error);
    await Promise.resolve();
    resolvePrepare('old');
    expect(await oldResult).toMatchObject({ name: 'AbortError' });
    expect(await nextResult).toMatchObject({ missing: true });
    expect(prepares).toBe(2);
    expect(owned).toBe(false);
  });
  it('preserves existing native file transport only when the host declares chunking unsupported', async () => {
    const raw = '{"v":1,"at":"now","provider":"local"}\n';
    const body = new TextEncoder().encode(raw);
    const bytes = new Uint8Array(8 + body.length);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(1), true);
    bytes.set(body, 8);
    runtime.invoke.mockImplementation(async (command: string) => {
      if (command === 'audit_read_prepare') return null;
      if (command === 'read_vault_binary_file') return bytes.buffer;
      if (command === 'vault_path_exists') return true;
      throw new Error(`unexpected ${command}`);
    });
    expect(await readLlmAuditSummary(createTauriVaultHandle('/vault'))).toEqual({ total: 1, entries: parseLlmAuditLog(raw) });
    expect(runtime.invoke.mock.calls.some(([command]) => command === 'audit_read_begin')).toBe(false);
    expect(runtime.invoke.mock.calls.some(([command]) => command === 'read_vault_binary_file')).toBe(true);
  });
  it('rejects a JSON byte-array response instead of assuming raw IPC delivery',async()=>{
    transport('x');runtime.invoke.mockImplementation(async(command:string)=>{
      if(command==='audit_read_prepare')return'id';if(command==='audit_read_begin')return{missing:false,size:1};if(command==='audit_read_pull')return[120];return;
    });await expect(readLlmAuditSummary(createTauriVaultHandle('/vault'))).rejects.toMatchObject({reason:'failed'});
  });
});
