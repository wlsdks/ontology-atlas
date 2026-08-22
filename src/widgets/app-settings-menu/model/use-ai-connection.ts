'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSecretBridgeAvailable,
  secretStatus,
  SECRET_PROVIDERS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import { readLlmAuditLog, type LlmAuditEntry } from '@/shared/lib/llm-audit-log';

/**
 * State for the [AI 연결] section. The settings sheet's root row (the summary
 * chip) and the subview must see the **same value**, so the parent owns it and
 * passes it down; querying separately leaves the chip holding the old value right
 * after a save.
 *
 * No key lives here — the screen knows only `stored` and `last4`.
 */
export interface AiConnectionState {
  /** Whether this is the desktop runtime — at false the screen renders no input field at all. */
  bridgeAvailable: boolean;
  statuses: Record<SecretProvider, SecretStatus | null>;
  /** Reflect a save or delete result directly, so the screen states the fact immediately with no re-query round trip. */
  applyStatus: (provider: SecretProvider, next: SecretStatus) => void;
  auditEntries: LlmAuditEntry[];
  refreshAudit: () => void;
}

const EMPTY_STATUSES: Record<SecretProvider, SecretStatus | null> = {
  anthropic: null,
  openai: null,
  gemini: null,
};

export function useAiConnection({
  enabled,
  vaultHandle,
}: {
  enabled: boolean;
  vaultHandle: FileSystemDirectoryHandle | null;
}): AiConnectionState {
  // The runtime is detected once at mount. Under static export (the server) there
  // is no window, so it is false — and the surface drawn from that value exists
  // only after the sheet opens, so there is nowhere for hydration to disagree.
  const [bridgeAvailable] = useState(() => isSecretBridgeAvailable());
  const [statuses, setStatuses] =
    useState<Record<SecretProvider, SecretStatus | null>>(EMPTY_STATUSES);
  const [auditEntries, setAuditEntries] = useState<LlmAuditEntry[]>([]);
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
      if (cancelled) return;
      setStatuses((prev) => {
        const next = { ...prev };
        for (const [provider, status] of settled) next[provider] = status;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bridgeAvailable]);

  // Using the handle **object** as a dependency re-runs the read endlessly when the
  // caller builds a new object each render. Identity is held in a ref and the
  // re-run condition narrows to the folder name (reopening the sheet reads again
  // through `enabled`, so nothing goes stale).
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
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const entries = await readLlmAuditLog(handle, { limit: 10 });
      if (!cancelled) setAuditEntries(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, vaultKey, auditNonce]);

  const applyStatus = useCallback((provider: SecretProvider, next: SecretStatus) => {
    setStatuses((prev) => ({ ...prev, [provider]: next }));
  }, []);

  const refreshAudit = useCallback(() => setAuditNonce((n) => n + 1), []);

  return { bridgeAvailable, statuses, applyStatus, auditEntries, refreshAudit };
}
