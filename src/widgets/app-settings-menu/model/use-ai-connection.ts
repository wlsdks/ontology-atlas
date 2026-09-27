'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSecretBridgeAvailable,
  secretStatus,
  SECRET_PROVIDERS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import { jevSecretStatus, type JevSecretStatus } from '@/shared/lib/tauri-jev';
import { readLlmAuditLog, type LlmAuditEntry } from '@/shared/lib/llm-audit-log';

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
  const [auditNonce, setAuditNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !bridgeAvailable) return undefined;
    let cancelled = false;
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
        for (const [provider, status] of settled) next[provider] = status;
        return next;
      });
      setJevStatus(jev);
      setKeysRead(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bridgeAvailable]);

  // Keyed by folder name with the handle in a ref: a caller's new handle object each
  // render would otherwise re-run the read endlessly.
  const vaultHandleRef = useRef(vaultHandle);
  const vaultKey = vaultHandle?.name ?? null;

  // Must precede the read effect: effects run in declaration order.
  useEffect(() => {
    vaultHandleRef.current = vaultHandle;
  }, [vaultHandle]);

  useEffect(() => {
    const handle = vaultHandleRef.current;
    if (!enabled || !handle) {
      setAuditEntries((prev) => (prev.length === 0 ? prev : []));
      setAuditTotal(0);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      // The whole file is read once so the count is the file's, not the tail's.
      const entries = await readLlmAuditLog(handle, { limit: Number.MAX_SAFE_INTEGER });
      if (cancelled) return;
      setAuditTotal(entries.length);
      setAuditEntries(entries.slice(-AUDIT_TAIL));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, vaultKey, auditNonce]);

  const applyStatus = useCallback((provider: SecretProvider, next: SecretStatus) => {
    setStatuses((prev) => ({ ...prev, [provider]: next }));
  }, []);

  const applyJevStatus = useCallback((next: JevSecretStatus) => setJevStatus(next), []);

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
    refreshAudit,
  };
}
