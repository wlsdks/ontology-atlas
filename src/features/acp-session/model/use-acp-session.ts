'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/tauri-acp';

import {
  createAcpClient,
  type AcpClient,
  type AcpPermissionRequest,
  type AcpTransport,
} from './acp-client';

/**
 * ACP 세션 하나의 수명 — 띄우고, 말을 걸고, 권한을 묻고, 끝낸다.
 *
 * ## 화면에 남기는 것은 **일어난 일**뿐이다
 *
 * 진행바를 지어내지 않는다. 도구 줄은 에이전트가 실제로 그 도구를 부른 뒤에
 * 생기고, 상태도 에이전트가 알려 준 대로만 바뀐다. 이 저장소가 기존 채팅에서
 * 이미 정해 둔 규율이다(`agent-loop.ts`: *"전송 전에 「읽음」으로 찍으면 화면이
 * 아직 일어나지 않은 일을 말하는 것"*).
 *
 * ## 권한은 화면이 답할 때까지 **기다린다**
 *
 * 볼트 밖 요청이 오면 카드를 띄우고 사용자가 고를 때까지 응답을 미룬다. 그동안
 * 에이전트는 멈춰 있다 — 그게 관문의 정의다. 화면이 닫히거나 세션이 끝나면
 * **거절로 답한다**: 안 물어본 것을 허용으로 세면 관문이 없는 것과 같다.
 */

export type AcpEvent =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | { kind: 'tool'; id: string; title: string; toolKind: string; status: string }
  | { kind: 'notice'; id: string; text: string };

export type AcpSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'exited';

export interface PendingPermission {
  request: AcpPermissionRequest;
  /** 사용자가 고른 것을 에이전트에게 전한다. `null` 이면 거절. */
  resolve: (optionId: string | null) => void;
}

export interface UseAcpSessionOptions {
  runtimeId: string;
  /** 에이전트의 작업 폴더이자 「안/밖」 판정의 기준. */
  vaultRoot: string | null;
  /** 세션에 자동으로 꽂을 MCP 서버 — 사용자가 설정 파일을 안 만져도 되게. */
  mcpServers?: unknown[];
}

let eventSeq = 0;
const nextEventId = () => `acp-evt-${(eventSeq += 1)}`;

export function useAcpSession({ runtimeId, vaultRoot, mcpServers }: UseAcpSessionOptions) {
  const [status, setStatus] = useState<AcpSessionStatus>('idle');
  const [events, setEvents] = useState<AcpEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPermission | null>(null);

  const clientRef = useRef<AcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  /** 답을 기다리는 권한 요청의 해결자 — 정리할 때 거절로 닫는다. */
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);

  const push = useCallback((event: AcpEvent) => {
    setEvents((prev) => {
      const last = prev[prev.length - 1];
      // 텍스트 조각은 줄마다 새 말풍선이 아니라 **이어 붙인다** — 한 문장이
      // 여러 조각으로 오기 때문이다.
      if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
        return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...prev, event];
    });
  }, []);

  const applyUpdate = useCallback(
    (update: Record<string, unknown>) => {
      const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
      const content = update.content as { text?: unknown } | undefined;
      const text = typeof content?.text === 'string' ? content.text : '';

      if (kind === 'agent_message_chunk' && text) {
        push({ kind: 'agent', id: nextEventId(), text });
        return;
      }
      if (kind === 'agent_thought_chunk' && text) {
        push({ kind: 'thought', id: nextEventId(), text });
        return;
      }
      if (kind === 'tool_call') {
        push({
          kind: 'tool',
          id: typeof update.toolCallId === 'string' ? update.toolCallId : nextEventId(),
          title: typeof update.title === 'string' ? update.title : '',
          toolKind: typeof update.kind === 'string' ? update.kind : 'other',
          status: typeof update.status === 'string' ? update.status : 'pending',
        });
        return;
      }
      if (kind === 'tool_call_update') {
        const id = typeof update.toolCallId === 'string' ? update.toolCallId : null;
        const nextStatus = typeof update.status === 'string' ? update.status : null;
        if (!id || !nextStatus) return;
        setEvents((prev) =>
          prev.map((e) => (e.kind === 'tool' && e.id === id ? { ...e, status: nextStatus } : e)),
        );
      }
    },
    [push],
  );

  /** 화면이 답할 때까지 기다리는 약속을 만든다. */
  const askUser = useCallback((request: AcpPermissionRequest) => {
    return new Promise<string | null>((resolve) => {
      pendingResolverRef.current = resolve;
      setPending({
        request,
        resolve: (optionId) => {
          pendingResolverRef.current = null;
          setPending(null);
          resolve(optionId);
        },
      });
    });
  }, []);

  const start = useCallback(async () => {
    if (!isAcpBridgeAvailable() || !vaultRoot) return;
    if (clientRef.current) return;
    setStatus('starting');
    setError(null);
    try {
      const acpSessionId = await startAcpSession(runtimeId, vaultRoot);
      if (!acpSessionId) throw new Error('bridge-unavailable');
      acpSessionRef.current = acpSessionId;

      let onLine: ((line: string) => void) | null = null;
      const transport: AcpTransport = {
        send: (line) => sendAcpLine(acpSessionId, line),
        subscribe: (cb) => {
          onLine = cb;
          return () => {
            onLine = null;
          };
        },
      };

      unlistenRef.current = await listenToAcpSession(acpSessionId, {
        onMessage: (line) => onLine?.(line),
        // stderr 는 대화가 아니라 진단이다. 조용히 버리지 않되 말풍선으로도
        // 만들지 않는다 — 어댑터의 설치 로그가 대화에 섞이면 읽을 수 없다.
        onNotice: (message) => push({ kind: 'notice', id: nextEventId(), text: message }),
        onExit: () => {
          setStatus('exited');
          // 끝난 세션에 답을 기다리는 카드가 떠 있으면 거절로 닫는다.
          pendingResolverRef.current?.(null);
          pendingResolverRef.current = null;
          setPending(null);
        },
      });

      const client = createAcpClient(transport, {
        onUpdate: applyUpdate,
        verdict: (filePath) => acpPermissionVerdict(vaultRoot, filePath),
        askUser,
        onProtocolNotice: (message) => push({ kind: 'notice', id: nextEventId(), text: message }),
      });
      clientRef.current = client;

      await client.initialize();
      const session = await client.newSession({ cwd: vaultRoot, mcpServers });
      sessionIdRef.current = session.sessionId;
      if (!disposedRef.current) setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [applyUpdate, askUser, mcpServers, push, runtimeId, vaultRoot]);

  const send = useCallback(
    async (text: string) => {
      const client = clientRef.current;
      const sessionId = sessionIdRef.current;
      if (!client || !sessionId || !text.trim()) return;
      push({ kind: 'user', id: nextEventId(), text });
      setStatus('thinking');
      try {
        await client.prompt(sessionId, [{ type: 'text', text }]);
        if (!disposedRef.current) setStatus('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [push],
  );

  const cancel = useCallback(() => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (client && sessionId) void client.cancel(sessionId);
  }, []);

  const stop = useCallback(async () => {
    // 순서가 중요하다: 기다리는 권한부터 닫고, 그다음 프로세스를 끝낸다.
    // 반대로 하면 이미 죽은 상대에게 답을 보내려 한다.
    pendingResolverRef.current?.(null);
    pendingResolverRef.current = null;
    setPending(null);
    clientRef.current?.dispose();
    clientRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
    const acpSessionId = acpSessionRef.current;
    acpSessionRef.current = null;
    sessionIdRef.current = null;
    if (acpSessionId) await stopAcpSession(acpSessionId);
    setStatus('idle');
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      // 화면이 사라지면 프로세스도 끝낸다. 안 그러면 닫은 대화가 계속 돈다.
      void stop();
    };
  }, [stop]);

  return { status, events, error, pending, start, send, cancel, stop };
}
