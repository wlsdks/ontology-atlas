'use client';

import { CornerDownLeft, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button, Chip, IconButton, Surface, Textarea } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useHeldValue } from '@/shared/lib/use-presence';
import { useAcpSession, type AcpEvent } from '@/features/acp-session/model/use-acp-session';

import { AcpPermissionCard } from './AcpPermissionCard';

/**
 * 앱 안에서 사용자의 코딩 에이전트와 나누는 대화.
 *
 * ## 이 화면이 하는 일 하나
 *
 * **지금 보고 있는 볼트에 대해, 이미 쓰고 있는 에이전트에게 그 자리에서 묻는다.**
 * 그래서 새로 마련할 것이 없다 — 키도, 설정 파일도, 터미널 왕복도.
 *
 * ## 주목 순서
 *
 * 권한 카드 > 대화 > 작성 칸. 권한 카드가 떠 있는 동안 에이전트는 멈춰 있으므로
 * 그것이 이 화면에서 가장 급한 것이다. 그래서 목록 **위**가 아니라 작성 칸
 * **바로 위**에 둔다 — 눈과 손이 이미 가 있는 자리다.
 *
 * ## 생각과 말을 구별한다
 *
 * 에이전트의 「생각」은 답이 아니다. 같은 무게로 그리면 사용자가 중간 과정을
 * 결론으로 읽는다. 그래서 흐리고 작게 둔다 — 숨기지는 않는다(무슨 일이 일어나는지
 * 보이는 것이 기다림을 견디게 한다).
 */
export function AcpChatPanel({
  runtimeId,
  runtimeLabel,
  vaultRoot,
  mcpServers,
  onClose,
}: {
  runtimeId: string;
  runtimeLabel: string;
  vaultRoot: string | null;
  mcpServers?: unknown[];
  onClose?: () => void;
}) {
  const t = useTranslations('acpChat');
  const { status, events, error, pending, start, send, cancel } = useAcpSession({
    runtimeId,
    vaultRoot,
    mcpServers,
  });
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  /*
   * 퇴장 애니메이션이 도는 동안에도 그릴 것이 있어야 한다 — `pending` 이
   * null 로 바뀌는 순간 내용이 사라지면 **빈 상자**가 사라지는 애니메이션을
   * 하게 된다. 키는 요청의 파일 경로다(같은 카드인지 가르는 값).
   */
  const pendingHeld = useHeldValue(pending, pending?.request.filePath ?? null);

  useEffect(() => {
    void start();
  }, [start]);

  // 새 말이 오면 아래로 따라간다. 사용자가 위로 올려 읽는 중이면 방해하지
  // 않는다 — 바닥 근처일 때만 따라간다.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [events, pending]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || status === 'thinking') return;
    setDraft('');
    void send(text);
  }, [draft, send, status]);

  const busy = status === 'thinking';
  const canType = status === 'ready' || status === 'thinking';

  return (
    <section
      data-testid="acp-chat-panel"
      data-acp-status={status}
      className="flex min-h-0 flex-col gap-3"
      aria-label={t('ariaLabel', { runtime: runtimeLabel })}
    >
      <header className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {runtimeLabel}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <span
            data-acp-status-badge={status}
            className={badgeClass({
              shape: 'micro',
              className:
                'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {t(`status.${status}`)}
          </span>
          {onClose ? (
            <IconButton label={t('close')} data-testid="acp-chat-close" onClick={onClose}>
              <X size={ICON_SIZE.sm} aria-hidden />
            </IconButton>
          ) : null}
        </span>
      </header>

      <div
        ref={listRef}
        data-testid="acp-chat-transcript"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
      >
        {events.length === 0 && status !== 'starting' ? (
          <p className="break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
            {t('emptyHint')}
          </p>
        ) : null}
        {events.map((event) => (
          <TranscriptEntry key={event.id} event={event} />
        ))}
      </div>

      {error ? (
        <p
          data-testid="acp-chat-error"
          className="break-keep rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-status-danger)]"
        >
          {t('errorPrefix')} {error}
        </p>
      ) : null}

      {/*
        `{pending ? … : null}` 로만 그리면 카드가 한 프레임에 툭 나타나고 툭
        사라진다(등장 래칫이 이걸 잡았다). 이 카드는 **에이전트를 멈춰 세우는
        것**이라 화면에서 가장 급한 표면인데, 예고 없이 나타나면 사용자는
        무엇이 바뀌었는지 못 따라간다.

        `origin` 이 아래인 이유: 이 카드는 작성 칸 바로 위에서 자란다 — 눈과
        손이 이미 가 있는 자리에서 태어나야 한다.
      */}
      <Surface open={Boolean(pending)} origin="bottom center" motion="overlay">
        {pendingHeld ? <AcpPermissionCard pending={pendingHeld} /> : null}
      </Surface>

      <div className="grid gap-2">
        <Textarea
          label={t('composerLabel')}
          className="w-full"
          rows={3}
          value={draft}
          disabled={!canType}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Enter 로 보낸다. Enter 하나로 보내면 줄바꿈을 못 쓴다.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          {busy ? (
            <Chip size="lg" tone="secondary" data-testid="acp-chat-stop" onClick={cancel}>
              <Square size={ICON_SIZE.sm} aria-hidden />
              {t('stop')}
            </Chip>
          ) : null}
          <Button
            variant="primary"
            data-testid="acp-chat-send"
            disabled={!canType || busy || draft.trim().length === 0}
            onClick={submit}
          >
            <CornerDownLeft size={ICON_SIZE.sm} aria-hidden />
            {t('send')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function TranscriptEntry({ event }: { event: AcpEvent }) {
  const t = useTranslations('acpChat');

  if (event.kind === 'user') {
    return (
      <p
        data-acp-entry="user"
        className="self-end max-w-[85%] break-keep rounded-card bg-[color:var(--color-indigo-a12)] px-3 py-2 text-body leading-body text-[color:var(--color-text-primary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'agent') {
    return (
      <p
        data-acp-entry="agent"
        className="whitespace-pre-wrap break-keep text-body leading-body text-[color:var(--color-text-secondary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'thought') {
    return (
      <p
        data-acp-entry="thought"
        className="whitespace-pre-wrap break-keep text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'tool') {
    return (
      <p
        data-acp-entry="tool"
        data-tool-kind={event.toolKind}
        data-tool-status={event.status}
        className="flex items-center gap-1.5 break-all text-label leading-label text-[color:var(--color-text-tertiary)]"
      >
        <span
          className={badgeClass({
            shape: 'micro',
            className:
              'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
          })}
        >
          {t(`toolKind.${event.toolKind}`)}
        </span>
        {event.title}
      </p>
    );
  }
  return (
    <p
      data-acp-entry="notice"
      className="break-all font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
    >
      {event.text}
    </p>
  );
}
