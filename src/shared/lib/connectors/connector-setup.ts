import { connectorFingerprint, type ConnectorRecord } from './connector-record';
import type { ConnectorStore } from './connector-store';
import { connectorSecretRef, connectorSecretSet, connectorSecretStatus } from './tauri-connector-secrets';

export type SetupFailure = 'connectFailed' | 'secretSaveFailed' | 'activationFailed' |
  'setupConflict' | 'setupStopped' | 'setupFolderUnavailable';
export type SetupInspection = { record: ConnectorRecord; existing: boolean; hasSecret: boolean };
export type SetupResult = { ok: true; record: ConnectorRecord } | { ok: false; error: SetupFailure };

let nextSessionId = 0;
const sessionLeases = new WeakMap<object, Map<string, { id: string; pending: boolean; staged: boolean }>>();

/** One captured folder session. No plaintext survives an operation or enters this lease map. */
export function createConnectorSetup(store: ConnectorStore, options: {
  leaseIdentity?: object;
  current: () => boolean;
  approved: (record: ConnectorRecord) => boolean;
  approve: (record: ConnectorRecord) => boolean;
}) {
  const leases = (options.leaseIdentity && sessionLeases.get(options.leaseIdentity)) ?? new Map<string, { id: string; pending: boolean; staged: boolean }>();
  if (options.leaseIdentity) sessionLeases.set(options.leaseIdentity, leases);
  const valid = (live: () => boolean) => options.current() && live();
  const matches = (a: ConnectorRecord, b: ConnectorRecord) =>
    a.origin === b.origin && connectorFingerprint(a) === connectorFingerprint(b);
  const hasCollision = (rows: ConnectorRecord[], row: ConnectorRecord) =>
    rows.some((c) => c.id !== row.id && c.name.trim() === row.name.trim());
  const status = async (record: ConnectorRecord, variable: string) => {
    const ref = connectorSecretRef(record.id, variable);
    const receipt = await connectorSecretStatus(ref);
    return receipt?.secretRef === ref && receipt.stored === true;
  };
  return {
    sessionId: `connector-setup-${++nextSessionId}`,
    async inspect(draft: (id: string) => ConnectorRecord, variable: string, live: () => boolean): Promise<SetupInspection | SetupFailure> {
      if (!valid(live)) return 'setupStopped';
      const probe = draft('probe');
      const lease = leases.get(probe.origin!);
      if (lease?.pending) return 'setupStopped';
      const result = await store.read();
      if (!valid(live)) return 'setupStopped';
      if (result.status !== 'ok' && result.status !== 'missing') return 'setupFolderUnavailable';
      const rows = result.connectors.filter((r) => r.origin === probe.origin);
      if (rows.length > 1 || (lease && rows.length === 0 && lease.staged)) return 'setupConflict';
      const existing = rows[0];
      const id = existing?.id ?? lease?.id ?? crypto.randomUUID();
      const record = existing ?? draft(id);
      if (result.connectors.filter((row) => row.id === id).length !== (existing ? 1 : 0)) return 'setupConflict';
      if ((existing && !matches(existing, draft(id))) || hasCollision(result.connectors, record)) return 'setupConflict';
      leases.set(probe.origin!, { id, pending: false, staged: !!existing });
      let hasSecret = false;
      if (existing) {
        try { hasSecret = await status(record, variable); } catch { return 'secretSaveFailed'; }
        if (!valid(live)) return 'setupStopped';
        if (options.approved(record) && !hasSecret) return 'setupConflict';
      }
      return { record, existing: !!existing, hasSecret };
    },
    async save(inspection: SetupInspection, variable: string, token: string, live: () => boolean,
      onSecretConfirmed: () => void): Promise<SetupResult> {
      const { record } = inspection;
      const origin = record.origin!;
      if (!valid(live) || leases.get(origin)?.pending) return { ok: false, error: 'setupStopped' };
      const lease = { id: record.id, pending: true, staged: inspection.existing };
      leases.set(origin, lease);
      let phase: SetupFailure = inspection.hasSecret ? 'activationFailed' : 'connectFailed';
      try {
        const staged = await store.guardSetup(record, inspection.existing ? record : null, false, () => valid(live));
        if (staged.status === 'saved') lease.staged = true;
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        if (staged.status !== 'saved') return { ok: false, error: staged.status === 'conflict' ? 'setupConflict' : phase };
        // A failed credential write can be retried against this same disabled row.
        inspection.existing = true;
        phase = 'secretSaveFailed';
        let confirmed = inspection.hasSecret && await status(record, variable);
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        if (!confirmed && token.trim()) {
          const ref = connectorSecretRef(record.id, variable);
          const receipt = await connectorSecretSet(ref, token.trim());
          confirmed = receipt?.secretRef === ref && receipt.stored === true;
        }
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        if (!confirmed) return { ok: false, error: phase };
        inspection.hasSecret = true;
        onSecretConfirmed();
        phase = 'activationFailed';
        const activated = await store.guardSetup(record, record, true, () => valid(live));
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        if (activated.status !== 'saved') return { ok: false, error: activated.status === 'conflict' ? 'setupConflict' : phase };
        inspection.record = { ...record, enabled: true };
        if (!await status(record, variable)) return { ok: false, error: phase };
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        const check = await store.read();
        if (!valid(live)) return { ok: false, error: 'setupStopped' };
        if (check.status !== 'ok') return { ok: false, error: phase };
        const matching = check.connectors.filter((r) => r.id === record.id);
        if (matching.length !== 1) return { ok: false, error: 'setupConflict' };
        const actual = matching[0];
        if (!actual?.enabled || !matches(actual, record) || hasCollision(check.connectors, actual)) return { ok: false, error: 'setupConflict' };
        if (!options.approved(actual) && !options.approve(actual)) return { ok: false, error: phase };
        return { ok: true, record: actual };
      } catch {
        return { ok: false, error: phase };
      } finally {
        lease.pending = false;
      }
    },
  };
}
export type ConnectorSetup = ReturnType<typeof createConnectorSetup>;
