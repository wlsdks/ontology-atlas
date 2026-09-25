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
 * State for the Agents destination's models tab. The rows and the sent-log footer must see the
 * **same value**, so the panel owns it and passes it down; querying separately leaves one of
 * them holding the old value right after a save.
 *
 * No key lives here — the screen knows only `stored` and `last4`.
 */
export interface AiConnectionState {
  /** Whether this is the desktop runtime — at false the screen renders no input field at all. */
  bridgeAvailable: boolean;
  statuses: Record<SecretProvider, SecretStatus | null>;
  /** Reflect a save or delete result directly, so the screen states the fact immediately with no re-query round trip. */
  applyStatus: (provider: SecretProvider, next: SecretStatus) => void;
  /** The experimental Jev key (a separate Keychain account, never one of the three model vendors). */
  jevStatus: JevSecretStatus | null;
  /**
   * Whether the Keychain has answered at all. Until it has, a key row draws no status: "no key"
   * followed a moment later by "····4f2a" is a change nobody made, and a screen reader announces
   * it as one.
   */
  keysRead: boolean;
  applyJevStatus: (next: JevSecretStatus) => void;
  /** The newest lines of the vault's sent log, oldest first. */
  auditEntries: LlmAuditEntry[];
  /** How many transfers the log holds in all — the number the footer states. `null` until the file has been read, so the screen never flashes "nothing sent" over a log it has not opened yet. */
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
  // The runtime is detected once at mount. Under static export (the server) there is no
  // window, so it is false — and the tab that draws from it mounts only on the client.
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
            // A failed keychain lookup can show the same screen as "none" — the
            // user's next action (enter a key) is the same either way.
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

  // Using the handle **object** as a dependency re-runs the read endlessly when the
  // caller builds a new object each render. Identity is held in a ref and the
  // re-run condition narrows to the folder name.
  const vaultHandleRef = useRef(vaultHandle);
  const vaultKey = vaultHandle?.name ?? null;

  // Declared **before** the read effect below — effects run in declaration order,
  // so the latest handle is always in place by read time.
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
