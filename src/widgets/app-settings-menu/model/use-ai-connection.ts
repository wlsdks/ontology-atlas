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
 * [AI 연결] 절의 상태 — 설정 시트의 루트 행(요약 칩)과 서브뷰가 **같은 값**을
 * 봐야 하므로 부모가 소유하고 내려준다. 각자 조회하면 저장 직후 칩만 옛 값을
 * 들고 있는 어긋남이 생긴다.
 *
 * 여기에 키는 없다 — 화면이 아는 것은 `stored` 와 `last4` 뿐이다.
 */
export interface AiConnectionState {
  /** 데스크톱 런타임인가 — false 면 화면이 입력 필드를 아예 렌더하지 않는다. */
  bridgeAvailable: boolean;
  statuses: Record<SecretProvider, SecretStatus | null>;
  /** 저장/삭제 결과를 그대로 반영 — 재조회 왕복 없이 화면이 즉시 사실을 말한다. */
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
  // 런타임 감지는 마운트 시 한 번. 정적 export(서버)에서는 window 가 없어 false
  // 이고, 그 값으로 그려지는 표면은 시트가 열린 뒤에만 존재하므로 hydration
  // 이 어긋날 자리가 없다.
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
            // 키체인 조회 실패는 "없음" 과 같은 화면이면 충분하다 — 사용자가
            // 할 일(키 넣기)이 같다.
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

  // 핸들 **객체**를 의존성으로 쓰면 호출자가 렌더마다 새 객체를 만들 때 읽기가
  // 무한히 재실행된다. 신원은 ref 로 들고, 재실행 조건은 폴더 이름으로 좁힌다
  // (시트를 다시 열 때도 `enabled` 로 새로 읽으므로 갱신 누락이 없다).
  const vaultHandleRef = useRef(vaultHandle);
  const vaultKey = vaultHandle?.name ?? null;

  // 아래 읽기 effect 보다 **먼저** 선언한다 — effect 는 선언 순서로 실행되므로
  // 읽기 시점에는 항상 최신 핸들이 들어와 있다.
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
