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
      /*
       * ⚠️ `flex-1` 이 없어서 이 화면 전체가 위로 뭉쳐 있었다 (2026-08-16 소유자
       * 실보고: *"입력하는 곳이 왜 위에 붙어 있는지도 이상하고"*).
       *
       * 구조는 처음부터 채팅이었다 — 머리 / 늘어나는 기록 / 바닥의 작성 칸.
       * 그런데 이 `<section>` 이 부모 flex 의 자식인데 자기 몫을 주장하지 않아
       * **내용만큼만** 커졌고, 기록이 비어 있으면 그 높이가 0 이라 작성 칸이
       * 곧바로 머리 밑에 붙었다. 아래 텅 빈 자리는 패널의 남은 높이였다.
       *
       * 채팅에서 작성 칸이 바닥에 있는 것은 취향이 아니라 **손이 가는 자리**이고,
       * 그 위가 비어 있어야 대화가 쌓일 곳이 보인다.
       */
      className="flex h-full min-h-0 flex-1 flex-col gap-3"
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
          // 빈 대화의 안내는 **기록이 쌓일 그 자리 한가운데**에 둔다. 위쪽에
          // 붙여 두면 그것이 첫 번째 말풍선처럼 읽히고, 정작 대화가 시작될
          // 자리는 비어 보인다.
          <p
            data-testid="acp-chat-empty"
            className="m-auto max-w-[28ch] break-keep text-center text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
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

      {/*
        작성 칸은 **바닥에 고정**이고 이름을 글자로 달지 않는다 — 채팅에서 상자
        위에 「무엇을 시킬지 적어요」라는 라벨이 붙어 있으면 그건 대화가 아니라
        폼이다(소유자: *"디자인 자체가 아쉬움… 채팅방처럼"*). 이름은 화면 밖으로
        보내고(`aria-label`) 자리에는 안내만 흐리게 둔다.

        `shrink-0` 이 있어야 기록이 길어져도 작성 칸이 눌리지 않는다.
      */}
      <div className="grid shrink-0 gap-2">
        <Textarea
          aria-label={t('composerLabel')}
          placeholder={t('composerPlaceholder')}
          className="w-full"
          rows={3}
          value={draft}
          disabled={!canType}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            /*
             * Enter 로 보내고 ⇧Enter 로 줄을 바꾼다 — 채팅의 관례이고, 사람이
             * 이미 손에 익힌 것이다. ⌘/Ctrl+Enter 도 계속 받는다: 종전 방식이
             * 손에 익은 사람의 입력을 말없이 버리지 않는다.
             */
            if (e.shiftKey) return;
            e.preventDefault();
            submit();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-caption text-[color:var(--color-text-quaternary)]">
            {t('composerHint')}
          </span>
          <span className="flex shrink-0 items-center gap-2">
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
          </span>
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
