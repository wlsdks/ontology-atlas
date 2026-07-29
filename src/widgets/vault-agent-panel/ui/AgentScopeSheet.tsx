'use client';

import { useEffect, useRef } from 'react';

/**
 * 첫 턴 전 범위 시트 — 보내기 전에 **무엇이 어디로 가는지** 한 번 말한다.
 *
 * 도구 루프에서는 다음 왕복에 무엇이 실릴지 모델이 정하므로 사전 전문
 * 미리보기가 구조적으로 불가능하다. 헌장의 목적(조용한 수집 0 · 사용자가
 * 범위를 앎 · 감사 가능)을 지키는 등가물은 ① 이 시트의 사전 고지 ② 왕복마다
 * 실시간으로 붙는 도구 행 ③ 볼트 안 감사 로그의 사후 대조다.
 */
export function AgentScopeSheet({
  provider,
  host,
  auditPath,
  labels,
  onAccept,
  onCancel,
}: {
  provider: string;
  host: string;
  auditPath: string;
  labels: {
    title: string;
    body: (args: { provider: string; host: string }) => string;
    liveRows: string;
    /**
     * 쓰기 동의 약속. 이 시트는 사람이 **전체를 승낙하는** 자리인데, 구
     * 문구는 읽기·전송·기록만 말하고 "문서를 고칠 수도 있다" 는 사실과 그
     * 안전장치를 말하지 않았다. 승낙의 범위에 쓰기가 들어 있다면 그 자리에서
     * 말해야 승낙이 승낙이다.
     */
    consent: string;
    recorded: (path: string) => string;
    accept: string;
    cancel: string;
  };
  onAccept: () => void;
  onCancel: () => void;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="agent-scope-sheet"
      role="group"
      aria-label={labels.title}
      className="flex flex-col gap-3 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-3"
    >
      <p className="text-body font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {labels.title}
      </p>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {labels.body({ provider, host })}
      </p>
      <ul className="flex flex-col gap-1 text-label tracking-label text-[color:var(--color-text-tertiary)]">
        <li>{labels.liveRows}</li>
        <li data-testid="agent-scope-consent">{labels.consent}</li>
        <li data-testid="agent-scope-audit-path">{labels.recorded(auditPath)}</li>
      </ul>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="agent-scope-cancel"
          onClick={onCancel}
          className="h-8 rounded-chip border border-[color:var(--color-border-soft)] px-3 text-label tracking-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
        >
          {labels.cancel}
        </button>
        <button
          ref={acceptRef}
          type="button"
          data-testid="agent-scope-accept"
          onClick={onAccept}
          className="h-8 rounded-chip bg-[color:var(--color-indigo-brand)] px-3 text-label font-semibold tracking-label text-white transition-colors hover:bg-[color:var(--color-indigo-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
        >
          {labels.accept}
        </button>
      </div>
    </div>
  );
}
