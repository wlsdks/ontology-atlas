import { useCallback, useEffect, useRef, useState } from 'react';
import {
  secretStatus,
  SECRET_PROVIDERS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/llm-connection/tauri-secrets';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { jevSecretStatus, type JevSecretStatus } from '@/shared/lib/llm-connection/tauri-jev';
import { AuditReadError, readLlmAuditSummary, type AuditReadFailure, type LlmAuditEntry } from '@/shared/lib/llm-connection/llm-audit-log';

/**
 * State for the Agents destination's models tab, owned by the panel so the rows and the sent-log
 * footer see one value after a save. No key lives here, only `stored` and `last4`.
 */
export interface AiConnectionState {
  statuses: Record<SecretProvider, SecretStatus | null>;
  /** Reflect a save or delete result directly, so the screen states the fact immediately with no re-query round trip. */
  applyStatus: (provider: SecretProvider, next: SecretStatus) => void;
  /** The experimental Jev key (a separate Keychain account, never one of the three model vendors). */
  jevStatus: JevSecretStatus | null;
  keysRead: boolean;
  keyReads: Record<SecretProvider, boolean>;
  jevRead: boolean;
  applyJevStatus: (next: JevSecretStatus) => void;
  auditEntries: LlmAuditEntry[];
  /** How many transfers the log holds in all; `null` until read, so "nothing sent" never flashes. */
  auditTotal: number | null;
  auditError: AuditReadFailure | null;
  refreshAudit: () => void;
}

const EMPTY_STATUSES: Record<SecretProvider, SecretStatus | null> = {
  anthropic: null,
  openai: null,
  gemini: null,
};

const AUDIT_TAIL = 5;

export function useAiConnection({
  vaultHandle,
}: {
  vaultHandle: FileSystemDirectoryHandle | null;
}): AiConnectionState {
  const [statuses, setStatuses] =
    useState<Record<SecretProvider, SecretStatus | null>>(EMPTY_STATUSES);
  const [jevStatus, setJevStatus] = useState<JevSecretStatus | null>(null);
  const [keyReads, setKeyReads] = useState<Record<SecretProvider, boolean>>({ anthropic: false, openai: false, gemini: false });
  const [jevRead, setJevRead] = useState(false);
  const keysRead = SECRET_PROVIDERS.every((provider) => keyReads[provider]);
  const [auditEntries, setAuditEntries] = useState<LlmAuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState<number | null>(null);
  const [auditError, setAuditError] = useState<AuditReadFailure | null>(null);
  const [auditNonce, setAuditNonce] = useState(0);
  const statusEpochs = useRef<Partial<Record<SecretProvider, number>>>({});
  const jevEpoch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const initialEpochs = { ...statusEpochs.current };
    const initialJevEpoch = jevEpoch.current;
    for (const provider of SECRET_PROVIDERS) {
      void (async () => {
        let status: SecretStatus | null = null;
        try {
          status = await secretStatus(provider);
        } catch {
          status = null;
        }
        if (cancelled) return;
        setStatuses((previous) => statusEpochs.current[provider] === initialEpochs[provider]
          ? { ...previous, [provider]: status }
          : previous);
        setKeyReads((previous) => ({ ...previous, [provider]: true }));
      })();
    }
    void (async () => {
      let status: JevSecretStatus | null = null;
      try {
        status = await jevSecretStatus();
      } catch {
        status = null;
      }
      if (cancelled) return;
      setJevStatus((previous) => jevEpoch.current === initialJevEpoch ? status : previous);
      setJevRead(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Native root paths and browser handle identity distinguish same-name vaults.
  const vaultHandleRef = useRef(vaultHandle);
  const vaultKey = vaultHandle ? getTauriVaultRootPath(vaultHandle) ?? vaultHandle : null;

  // Must precede the read effect: effects run in declaration order.
  useEffect(() => {
    vaultHandleRef.current = vaultHandle;
  }, [vaultHandle]);

  useEffect(() => {
    const handle = vaultHandleRef.current;
    if (!handle) {
      setAuditEntries((previous) => (previous.length === 0 ? previous : []));
      setAuditTotal(0);
      setAuditError(null);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    setAuditTotal(null);
    setAuditEntries([]);
    setAuditError(null);
    void (async () => {
      try {
        const summary = await readLlmAuditSummary(handle, { limit: AUDIT_TAIL, signal: controller.signal });
        if (cancelled) return;
        setAuditTotal(summary.total);
        setAuditEntries(summary.entries);
      } catch (error) {
        if (!cancelled) setAuditError(error instanceof AuditReadError ? error.reason : 'failed');
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [vaultKey, auditNonce]);

  const applyStatus = useCallback((provider: SecretProvider, next: SecretStatus) => {
    statusEpochs.current[provider] = (statusEpochs.current[provider] ?? 0) + 1;
    setStatuses((previous) => ({ ...previous, [provider]: next }));
  }, []);

  const applyJevStatus = useCallback((next: JevSecretStatus) => {
    jevEpoch.current++;
    setJevStatus(next);
  }, []);

  const refreshAudit = useCallback(() => setAuditNonce((n) => n + 1), []);

  return {
    statuses,
    applyStatus,
    jevStatus,
    keysRead,
    keyReads,
    jevRead,
    applyJevStatus,
    auditEntries,
    auditTotal,
    auditError,
    refreshAudit,
  };
}
