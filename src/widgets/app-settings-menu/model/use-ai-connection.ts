'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSecretBridgeAvailable,
  secretStatus,
  SECRET_PROVIDERS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { jevSecretStatus, type JevSecretStatus } from '@/shared/lib/tauri-jev';
import { AuditReadError, readLlmAuditSummary, type AuditReadFailure, type LlmAuditEntry } from '@/shared/lib/llm-audit-log';

/**
 * State for the Agents destination's models tab, owned by the panel so the rows and the sent-log
 * footer see one value after a save. No key lives here, only `stored` and `last4`.
 */
export interface AiConnectionState {
  /** Whether this is the desktop runtime — at false the screen renders no input field at all. */
  bridgeAvailable: boolean;
  statuses: Record<SecretProvider, SecretStatus | null>;
  /** Reflect a save or delete result directly, so the screen states the fact immediately with no re-query round trip. */
  applyStatus: (provider: SecretProvider, next: SecretStatus) => void;
  /** The experimental Jev key (a separate Keychain account, never one of the three model vendors). */
  jevStatus: JevSecretStatus | null;
  /** Whether the Keychain has answered; until then a key row draws no status, so none flips. */
  keysRead: boolean;
  applyJevStatus: (next: JevSecretStatus) => void;
  /** The newest lines of the vault's sent log, oldest first. */
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

/** How many recent lines the footer lists; the count above them is the whole file. */
const AUDIT_TAIL = 5;

export function useAiConnection({
  enabled,
  vaultHandle,
}: {
  enabled: boolean;
  vaultHandle: FileSystemDirectoryHandle | null;
}): AiConnectionState {
  // Detected once at mount; false during static export, where there is no window.
  const [bridgeAvailable] = useState(() => isSecretBridgeAvailable());
  const [statuses, setStatuses] =
    useState<Record<SecretProvider, SecretStatus | null>>(EMPTY_STATUSES);
  const [jevStatus, setJevStatus] = useState<JevSecretStatus | null>(null);
  const [keysRead, setKeysRead] = useState(false);
  const [auditEntries, setAuditEntries] = useState<LlmAuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState<number | null>(null);
  const [auditError, setAuditError] = useState<AuditReadFailure | null>(null);
  const [auditNonce, setAuditNonce] = useState(0);
  const statusEpochs = useRef<Partial<Record<SecretProvider, number>>>({});
  const jevEpoch = useRef(0);

  useEffect(() => {
    if (!enabled || !bridgeAvailable) return undefined;
    let cancelled = false;
    const initialEpochs = { ...statusEpochs.current };
    const initialJevEpoch = jevEpoch.current;
    void (async () => {
      const settled = await Promise.all(
        SECRET_PROVIDERS.map(async (provider) => {
          try {
            return [provider, await secretStatus(provider)] as const;
          } catch {
            // A failed lookup shows as "none": the next action, entering a key, is the same.
            return [provider, null] as const;
          }
        }),
      );
      let jev: JevSecretStatus | null = null;
      try {
        jev = await jevSecretStatus();
      } catch {
        jev = null;
      }
      if (cancelled) return;
      setStatuses((prev) => {
        const next = { ...prev };
        for (const [provider, status] of settled) {
          if (statusEpochs.current[provider] === initialEpochs[provider]) next[provider] = status;
        }
        return next;
      });
      setJevStatus(prev => jevEpoch.current === initialJevEpoch ? jev : prev);
      setKeysRead(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bridgeAvailable]);

  // Native root paths and browser handle identity distinguish same-name vaults.
  const vaultHandleRef = useRef(vaultHandle);
  const vaultKey = vaultHandle ? getTauriVaultRootPath(vaultHandle) ?? vaultHandle : null;

  // Must precede the read effect: effects run in declaration order.
  useEffect(() => {
    vaultHandleRef.current = vaultHandle;
  }, [vaultHandle]);

  useEffect(() => {
    const handle = vaultHandleRef.current;
    if (!enabled || !handle) {
      setAuditEntries((prev) => (prev.length === 0 ? prev : []));
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
  }, [enabled, vaultKey, auditNonce]);

  const applyStatus = useCallback((provider: SecretProvider, next: SecretStatus) => {
    statusEpochs.current[provider] = (statusEpochs.current[provider] ?? 0) + 1;
    setStatuses((prev) => ({ ...prev, [provider]: next }));
  }, []);

  const applyJevStatus = useCallback((next: JevSecretStatus) => {
    jevEpoch.current++;
    setJevStatus(next);
  }, []);

  const refreshAudit = useCallback(() => setAuditNonce((n) => n + 1), []);

  return {
    bridgeAvailable,
    statuses,
    applyStatus,
    jevStatus,
    keysRead,
    applyJevStatus,
    auditEntries,
    auditTotal,
    auditError,
    refreshAudit,
  };
}
