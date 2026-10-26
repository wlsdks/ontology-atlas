import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectorProblems, serializeConnectorState, type ConnectorRecord } from './connector-record';
import { createConnectorStore } from './connector-store';
import { createConnectorSetup, type SetupInspection } from './connector-setup';
const secrets = vi.hoisted(() => ({ refs: new Set<string>(), set: vi.fn(), status: vi.fn() }));
vi.mock('./tauri-connector-secrets', async (original) => ({
  ...await original<typeof import('./tauri-connector-secrets')>(),
  connectorSecretSet: (ref: string, token: string) => secrets.set(ref, token),
  connectorSecretStatus: (ref: string) => secrets.status(ref),
}));
const draft = (id: string): ConnectorRecord => ({ id, name: 'notion', origin: 'library-import:notion',
  transport: 'stdio', command: '/bin/npx', args: ['notion'], env: [{ name: 'TOKEN', secretRef: `connector:${id}:TOKEN` }], headers: [], enabled: false });
function deferred() { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; }
function fixture(rows: ConnectorRecord[] = [], write?: (text: string) => Promise<void>, identity?: object) {
  let text: string | null = rows.length ? serializeConnectorState({ connectors: rows }) : null;
  let live = true;
  const writes: string[] = [];
  const store = createConnectorStore({ read: async () => text, write: async (next) => { writes.push(next); await write?.(next); text = next; } });
  const approve = vi.fn(() => true);
  const setup = createConnectorSetup(store, { leaseIdentity: identity, current: () => live, approved: () => false, approve });
  return { store, setup, approve, writes, current: () => live, cancel: () => { live = false; },
    replace: (rows: ConnectorRecord[]) => { text = serializeConnectorState({ connectors: rows }); },
    inspect: () => setup.inspect(draft, 'TOKEN', () => live) as Promise<SetupInspection> };
}
beforeEach(() => {
  secrets.refs.clear(); secrets.set.mockReset(); secrets.status.mockReset();
  secrets.status.mockImplementation(async (secretRef: string) => ({ secretRef, stored: secrets.refs.has(secretRef), last4: null }));
  secrets.set.mockImplementation(async (secretRef: string) => { secrets.refs.add(secretRef); return { secretRef, stored: true, last4: 'test' }; });
});
describe('guarded service setup', () => {
  it('keeps a manual connector attachable when its name collides with the proposed setup', async () => {
    const manual = { ...draft('manual'), origin: 'catalogue:notion', enabled: true };
    const f = fixture([manual]);
    expect(await f.inspect()).toBe('setupConflict');
    const current = await f.store.read();
    expect(connectorProblems(manual, current.connectors)).toEqual([]);
    expect(f.writes).toHaveLength(0); expect(secrets.set).not.toHaveBeenCalled(); expect(f.approve).not.toHaveBeenCalled();
  });
  it.each(['definition', 'deleted', 'enabled', 'collision'])('refuses activation after a concurrent %s change without overwriting it', async (change) => {
    const f = fixture(); const inspection = await f.inspect();
    secrets.set.mockImplementationOnce(async (secretRef) => {
      const row = inspection.record;
      f.replace(change === 'deleted' ? [] : change === 'definition' ? [{ ...row, command: '/bin/other' }] :
        change === 'enabled' ? [{ ...row, enabled: true }] : [row, { ...draft('sibling'), origin: 'manual' }]);
      secrets.refs.add(secretRef); return { secretRef, stored: true, last4: null };
    });
    expect(await f.setup.save(inspection, 'TOKEN', 'test', f.current, () => {})).toEqual({ ok: false, error: 'setupConflict' });
    expect(f.writes).toHaveLength(1); expect(f.approve).not.toHaveBeenCalled();
  });
  it('preserves an unrelated sibling edited before activation', async () => {
    const f = fixture(); const inspection = await f.inspect();
    const sibling = { ...draft('sibling'), name: 'other', command: '/bin/changed' };
    secrets.set.mockImplementationOnce(async (secretRef) => {
      f.replace([inspection.record, sibling]); secrets.refs.add(secretRef); return { secretRef, stored: true, last4: null };
    });
    expect((await f.setup.save(inspection, 'TOKEN', 'test', f.current, () => {})).ok).toBe(true);
    expect((await f.store.read()).connectors).toContainEqual(sibling);
  });
  it.each(['stage', 'secret', 'activate'] as const)('stops after an already-issued %s operation when the flow is cancelled', async (phase) => {
    const held = deferred(); const started = deferred();
    const f = fixture([], async (text) => {
      const active = JSON.parse(text).connectors[0].enabled;
      if ((phase === 'stage' && !active) || (phase === 'activate' && active)) { started.release(); await held.promise; }
    });
    if (phase === 'secret') secrets.set.mockImplementationOnce(async (secretRef) => { started.release(); await held.promise; secrets.refs.add(secretRef); return { secretRef, stored: true, last4: null }; });
    const pending = f.setup.save(await f.inspect(), 'TOKEN', 'test', f.current, () => {});
    await started.promise; f.cancel(); held.release();
    expect(await pending).toEqual({ ok: false, error: 'setupStopped' });
    expect(f.approve).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(phase === 'activate' ? 2 : 1);
    expect(secrets.set).toHaveBeenCalledTimes(phase === 'stage' ? 0 : 1);
  });
  it('does not admit an overlapping save from a reopened view with the same handle', async () => {
    const held = deferred(); const started = deferred(); const identity = {};
    const f = fixture([], async () => { started.release(); await held.promise; }, identity);
    const pending = f.setup.save(await f.inspect(), 'TOKEN', 'test', f.current, () => {});
    await started.promise; f.cancel();
    const reopened = fixture([], undefined, identity);
    expect(await reopened.inspect()).toBe('setupStopped'); held.release(); await pending;
  });
  it('resumes a disabled partial row with a stored token without a new credential write', async () => {
    const row = draft('existing'); secrets.refs.add('connector:existing:TOKEN');
    const f = fixture([row]); const inspection = await f.inspect();
    expect(inspection.hasSecret).toBe(true);
    expect((await f.setup.save(inspection, 'TOKEN', '', f.current, () => {})).ok).toBe(true);
    expect(f.writes).toHaveLength(1); expect(secrets.set).not.toHaveBeenCalled();
    expect((await f.store.read()).connectors[0]!.id).toBe('existing');
  });
  it('refuses approval when the saved definition changes during final credential confirmation', async () => {
    const f = fixture(); const inspection = await f.inspect();
    secrets.status.mockImplementationOnce(async (secretRef) => {
      f.replace([{ ...inspection.record, enabled: true, command: '/bin/changed' }]);
      return { secretRef, stored: true, last4: null };
    });
    expect(await f.setup.save(inspection, 'TOKEN', 'test', f.current, () => {})).toEqual({ ok: false, error: 'setupConflict' });
    expect(f.approve).not.toHaveBeenCalled();
  });
});


describe('ambiguous and unconfirmed metadata', () => {
  it('rejects duplicate IDs across different origins without replacing either definition', async () => {
    const imported = draft('shared-id');
    const unrelated = { ...draft('shared-id'), origin: 'manual', name: 'unrelated', command: '/tmp/untrusted-program' };
    const f = fixture([imported, unrelated]);
    secrets.refs.add('connector:shared-id:TOKEN');
    expect(await f.inspect()).toBe('setupConflict');
    expect((await f.store.read()).connectors).toEqual([imported, unrelated]);
    expect(f.writes).toHaveLength(0); expect(secrets.set).not.toHaveBeenCalled(); expect(f.approve).not.toHaveBeenCalled();
  });
  it('reopens an unconfirmed first write under the same ID instead of treating it as deletion', async () => {
    let fail = true;
    const f = fixture([], async () => { if (fail) throw new Error('read only'); });
    const first = await f.inspect();
    expect(await f.setup.save(first, 'TOKEN', 'test', f.current, () => {})).toEqual({ ok: false, error: 'connectFailed' });
    expect((await f.store.read()).connectors).toHaveLength(0);
    const retry = await f.inspect();
    expect(retry).toMatchObject({ record: { id: first.record.id }, existing: false });
    fail = false;
    expect((await f.setup.save(retry, 'TOKEN', 'test', f.current, () => {})).ok).toBe(true);
  });
});

describe('late ambiguity and queued cancellation', () => {
  it.each(['activation', 'readback'] as const)('refuses duplicate IDs introduced before %s', async (phase) => {
    const f = fixture(); const inspection = await f.inspect();
    const plant = () => f.replace([inspection.record, { ...inspection.record, origin: 'manual', name: 'unrelated', command: '/tmp/untrusted-program' }]);
    if (phase === 'activation') secrets.set.mockImplementationOnce(async (secretRef) => {
      plant(); secrets.refs.add(secretRef); return { secretRef, stored: true, last4: null };
    });
    else secrets.status.mockImplementationOnce(async (secretRef) => { plant(); return { secretRef, stored: true, last4: null }; });
    expect(await f.setup.save(inspection, 'TOKEN', 'test', f.current, () => {})).toEqual({ ok: false, error: 'setupConflict' });
    expect(f.approve).not.toHaveBeenCalled();
    expect((await f.store.read()).connectors.find((row) => row.name === 'unrelated')?.command).toBe('/tmp/untrusted-program');
  });
  it('does not issue a staging write after a cancelled attempt reaches the front of the queue', async () => {
    const held = deferred(); const started = deferred();
    const f = fixture([], async () => { started.release(); await held.promise; });
    const inspection = await f.inspect();
    const unrelated = { ...draft('other'), name: 'other' };
    const preceding = f.store.save([unrelated]); await started.promise;
    const queued = f.setup.save(inspection, 'TOKEN', 'test', f.current, () => {});
    f.cancel(); held.release(); await preceding;
    expect(await queued).toEqual({ ok: false, error: 'setupStopped' });
    expect(f.writes).toHaveLength(1); expect(secrets.set).not.toHaveBeenCalled();
  });
});
