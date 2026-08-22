'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell, ChevronRight } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { Link } from '@/i18n/navigation';
import { getTopologyFocusHref } from '@/entities/project';
import { CHROME_STATUS_CHIP_CLASS } from '@/shared/ui/chrome-chip';
import { controlClass } from '@/shared/ui/control-class';
import { IconButton, RowButton } from '@/shared/ui/controls';
import { Surface } from '@/shared/ui/surface';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { agentDisplayName } from '@/shared/lib/agent-display-name';
import type { AgentNotification, AgentNotificationKind } from '@/shared/lib/agent-notifications';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { useAgentActivityFeed } from '../model/use-agent-activity-feed';
import type { AgentLiveWorkInput } from '../model/agent-work-projection';

function WorkReceiptRow({ receipt, nowMs }: { receipt: AcpWorkReceipt; nowMs: number }) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  const bodyId = `agent-receipt-${receipt.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const result = t(`receiptResult.${receipt.result}`);
  const decision = t(`receiptDecision.${receipt.decision}`);

  return (
    <div className="border-b border-[color:var(--color-divider)] last:border-b-0">
      <RowButton
        size="sm"
        tone={open ? 'strong' : 'secondary'}
        active={open}
        hoverInk="strong"
        hoverSurface="lift"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="agent-work-receipt-row"
        onClick={() => setOpen((value) => !value)}
        className="w-full py-2"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="grid min-w-0 flex-1 gap-0.5 text-left">
          <span className="truncate text-label text-[color:var(--color-text-primary)]">
            {receipt.request}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
            <span>{agentDisplayName(receipt.agent)}</span>
            <span aria-hidden>·</span>
            <span>{decision}</span>
            <span aria-hidden>·</span>
            <span>{result}</span>
            <span aria-hidden>·</span>
            <span>{t('receiptItems', { count: receipt.items.length })}</span>
          </span>
        </span>
      </RowButton>
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div
            ref={contentRef}
            className="ai-row-disclosure-body grid gap-2 px-2 pb-2 pl-7 text-caption leading-label"
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt className="text-[color:var(--color-text-quaternary)]">{t('toolLabel')}</dt>
              <dd className="min-w-0 truncate font-mono text-[color:var(--color-text-tertiary)]">
                {receipt.tool}
              </dd>
              <dt className="text-[color:var(--color-text-quaternary)]">{t('receiptAt')}</dt>
              <dd className="text-[color:var(--color-text-tertiary)]">
                {format.relativeTime(new Date(receipt.updatedAt), nowMs)}
              </dd>
            </dl>
            <ol className="grid max-h-32 gap-1 overflow-y-auto border-t border-[color:var(--color-divider)] pt-2">
              {receipt.items.map((item, index) => (
                <li
                  key={`${receipt.id}:${index}`}
                  className="break-all font-mono text-[color:var(--color-text-tertiary)]"
                >
                  {item.relation
                    ? `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`
                    : item.target ?? item.fields.join(' · ')}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 「작업 중 / 마지막 작업」 칩 + 벨 + 알림함.
 *
 * ## 자리는 실측이 정했다 — 지도 우하단 판독 스택
 *
 * 상단 중앙 상태 열(영역·경로·걸어온 길)이 갈래로는 맞았지만 **1024 에서
 * 안 들어간다**: 그 열은 INDEX 패널 오른끝(388px)에서 69px 떨어져 있는데 이
 * 칩은 194px 이라 32px 겹쳤다. 우상단 유틸 레인도 28px 만 남았다. 저 열의
 * 칩 넷은 사용자가 **자기 손으로 만든 일시 상태**라 그 여유를 알고 쓰는 것이고,
 * 이건 **상시**다.
 *
 * 우하단 판독 스택은 좌우로 다툴 상대가 없고, 토스트가 이미 그 스택의 실제
 * rect 를 읽어 위로 비켜선다(`resolveToastBottomOffsetForStack`) — 줄이 하나
 * 늘면 토스트가 저절로 올라간다. 갈래도 맞다: 범례·첫 실행 판독·프레임 계기가
 * 사는 **앰비언트 판독**의 집이다. 팝오버는 화면 아래에 있으므로 **위로** 연다.
 *
 * ## 「연결됨」이라고 쓰지 않는다
 *
 * Atlas 는 에이전트에 연결하지 않는다 — **폴더를 볼 뿐이다.** 연결이 없으니
 * 「연결됨」은 거짓말이고, 「마지막 작업 N분 전」은 언제 말해도 참이다.
 *
 * ## 헌장
 *
 * 무채색 + 인디고 하나. 「작업 중」 점은 **인디고**다 — success(emerald)는
 * "연결됨/완료" 신호에만 쓰라는 확장 금지가 걸려 있고, 작업 중은 성공이
 * 아니다. 문제 알림만 신호 톤 warning 을 쓴다. pulse·glow·scale-hover 없음:
 * 벨 배지가 늘 때 장식 모션을 넣지 않는다(「한 입력 = 한 사건」).
 */
/**
 * **한 줄이 한 곳에 산다** (2026-08-17 소유자 지적으로 되돌렸다).
 *
 * 처음 지시(*"사용자가 위는 봐도 아래는 잘 안볼듯한데"*)를 받고 **종만** 위로
 * 올리고 상태 줄은 아래 남겼다. 그 결과를 소유자가 셋으로 지적했고, 셋 다 같은
 * 뿌리였다 — **컨트롤만 옮기고 기하는 아래 있던 그대로 뒀다.**
 *
 * | 지적 | 실측 | 원인 |
 * |---|---|---|
 * | *"가로로 너무 길고"* | 종 40×24 (비 1.67) | 아이콘 하나가 **글줄용 칩 껍데기**에 들어 있었다 |
 * | *"누르면 제대로 안보이고"* | 알림함 윗변이 화면 위로 **122px** 잘림 | `bottom-full` 로 **위로** 자란다. 하단에 살던 시절의 기하다 |
 * | *"하단에는 그대로 이게 있고..? 헷갈리는데"* | 활동 줄 **2곳** | 같은 사실이 두 곳 |
 *
 * 그래서 지시의 「줄 전체를 하단으로」를 그대로 따른다: 상태 줄과 종이 **한
 * 칩**으로 「에이전트 / 최근 변경」 **아래 줄**에 함께 산다. 지도 하단에는
 * 아무것도 남기지 않는다. 게이트: `tests/e2e/agent-activity-placement.spec.ts`.
 */
export function AgentActivityChip({
  suppressed = false,
  liveWork = null,
  onOpenChange,
  onOpenNode,
}: {
  suppressed?: boolean;
  /** 오른쪽 인앱 ACP가 이미 아는 현재 상태. 파일 폴링 전에도 같은 칩을 갱신한다. */
  liveWork?: AgentLiveWorkInput | null;
  /**
   * 알림함이 열리고 닫힐 때 알린다.
   *
   * ## 왜 바깥이 알아야 하나 (2026-08-17 소유자 지적: *"알림이 위로 덮어야지?"*)
   *
   * 이 칩이 사는 유틸 레인은 `z-20` 이라 **쌓임 맥락을 만든다.** 그래서 알림함에
   * `z-30` 을 줘도 그 30은 레인 **안에서만** 유효하고, 레인 밖의 오른쪽 도구
   * 타일들(같은 `z-20` 인데 DOM 상 뒤에 있어서 이긴다)이 알림함 위에 그려졌다.
   *
   * 레인을 늘 올려 두면 안 된다 — 막(`--z-map-scrim`, 25)이 덮어야 할 때 레인이
   * 막 위로 삐져나온다. 그래서 **열려 있는 동안만** 올린다. 알림함은 바깥을
   * 누르거나 Escape 로 스스로 닫히므로 올라간 상태가 오래 남지 않는다.
   */
  onOpenChange?: (open: boolean) => void;
  /** 이미 지도 위라면 route remount 없이 같은 HomePage의 선택 상태를 갱신한다. */
  onOpenNode?: (slug: string) => void;
} = {}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const feed = useAgentActivityFeed(liveWork);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLButtonElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const openTriggerRef = useRef<'status' | 'bell'>('status');

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  // 언마운트될 때(데이터시트가 열려 스택이 물러날 때)도 닫힘을 알린다 —
  // 안 알리면 레인이 올라간 채로 굳는다.
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) {
        const trigger = openTriggerRef.current === 'bell' ? bellRef.current : statusRef.current;
        trigger?.focus();
      }
    },
    [],
  );

  // transient-surface 계약(설정 기어·걸어온 길과 동일): dim 없는 self-closing
  // 앵커 팝오버, 자기 Escape 를 소유해 전역 Esc 사다리와 이중 발화하지 않는다.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, close]);

  const showBell =
    (feed.notificationsEnabled && feed.notifications.length > 0) || feed.workReceipts.length > 0;
  const showStatus = feed.showStatus;
  // 스택이 물러난 동안(데이터시트 조사 중)은 **언마운트한다** — 스택은 opacity-0
  // 로만 사라지므로 남겨 두면 보이지 않는 채 클릭·포커스 가능한 컨트롤이 된다.
  if (suppressed) return null;
  // 말할 것도 없고 열 것도 없으면 자리를 차지하지 않는다.
  if (!showStatus && !showBell) return null;

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);
  const phase = feed.work.phase ? t(`phase.${feed.work.phase}`) : null;
  const age = feed.lastAt === null ? null : relative(feed.lastAt);
  const statusLabel =
    feed.work.mode === 'live'
      ? feed.agentName && phase
        ? t('liveAgent', { agent: feed.agentName, phase })
        : phase ?? t('writing')
      : feed.work.mode === 'recent-write'
        ? feed.agentName && age
          ? t('recentWriteAgent', { agent: feed.agentName, age })
          : age
            ? t('recentWrite', { age })
            : t('quietUnknown')
        : feed.lastAt === null
          ? t('quietUnknown')
          : feed.agentName
            ? t('lastWorkedAtAgent', { agent: feed.agentName, age: age ?? '' })
            : t('lastWorkedAt', { age: age ?? '' });
  const targetPrefix = feed.work.mode === 'live' ? t('currentTarget') : t('lastTarget');
  const openInbox = (trigger: 'status' | 'bell') => {
    if (open) {
      close(false);
      return;
    }
    openTriggerRef.current = trigger;
    setOpen(true);
    feed.markAllRead();
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative min-w-0"
      data-testid="agent-activity-chip"
      data-work-mode={feed.work.mode}
    >
      {/* **상자는 내용이 정한다.** 칩 껍데기는 «글줄» 을 담는 것이라 좌우
          14px 안여백을 갖는다. 말할 상태가 없어 종 하나만 남는 경우
          (상태 표시를 끈 설정)에 그 껍데기를 씌우면 아이콘 하나가 56px 짜리
          가로로 긴 상자에 앉는다 — 소유자가 지적한 바로 그 모양이다. */}
      <div
        className={showStatus ? CHROME_STATUS_CHIP_CLASS : 'pointer-events-auto flex items-center'}
        data-writing={feed.writing ? 'true' : 'false'}>
        {showStatus ? (
          <>
            <button
              ref={statusRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={open}
              aria-label={t('statusAria', { status: statusLabel })}
              data-testid="agent-activity-status-trigger"
              onClick={() => openInbox('status')}
              className={controlClass({
                shape: 'link',
                hoverInk: 'strong',
                className: 'min-w-0 gap-1.5 text-left text-inherit',
              })}
            >
              {/* 상태는 색이 아니라 **글**이 말한다 — 점은 거들 뿐이라 색을
                  못 보는 사람도 문구만으로 판정이 선다(WCAG 1.4.1). */}
              <span
                aria-hidden
                data-testid="agent-activity-dot"
                className={cn(
                  'inline-block size-1.5 shrink-0 rounded-full',
                  feed.writing
                    ? 'bg-[color:var(--color-indigo-accent)]'
                    : 'bg-[color:var(--color-text-quaternary)]',
                )}
              />
              <span
                data-testid="agent-activity-status"
                className="min-w-0 truncate text-[color:var(--color-text-primary)]"
              >
                {statusLabel}
              </span>
            </button>
            {/* 대상이 없으면(배치 쓰기·문서 흡수, 또는 볼트에서 사라진 슬러그)
                **대상 없이 상태만** 말한다. 죽은 링크를 만들지 않는다. */}
            {feed.lastNode ? (
              // 축약 사다리 — 폭이 귀한 폰(<md)에서만 대상 이름을 접는다.
              // 접힌 구간에서도 대상은 알림함의 「작업 끝」 줄이 그대로 들고 있다.
              <span className="flex min-w-0 items-center gap-1.5 max-md:hidden">
                <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                {onOpenNode ? (
                  <button
                    type="button"
                    onClick={() => onOpenNode(feed.lastNode!.slug)}
                    data-testid="agent-activity-target"
                    aria-label={t('openOnMap', { name: feed.lastNode.name })}
                    className={controlClass({
                      shape: 'link',
                      tone: 'accent',
                      hoverInk: 'strong',
                      className:
                        'min-w-0 max-w-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                    })}
                  >
                    <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                      {targetPrefix}:
                    </span>
                    <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                  </button>
                ) : (
                  <Link
                    href={getTopologyFocusHref(feed.lastNode.slug)}
                    data-testid="agent-activity-target"
                    aria-label={t('openOnMap', { name: feed.lastNode.name })}
                  /*
                   * ⚠️ `truncate` 축을 쓰지 않는다 (2026-08-17 소유자 지적 →
                   * 실측). 그 축은 `block truncate` 를 내는데, `block` 이
                   * 이 모양의 `inline-flex` 를 밀어낸다(tailwind-merge). 그러면
                   * `items-center` 가 가운데 맞출 대상이 없어져서, 24px 짜리
                   * `min-h-6` 상자 안에서 **글자가 위에 붙는다**.
                   *
                   * 실측: 같은 줄의 이웃 글자가 윗선 17~18px 인데 이 링크만
                   * 14px 이었다 — 3px 위로 떠 있었다(글자 크기는 같다, 둘 다
                   * 잉크 높이 9px). 그래서 자르기는 안쪽 글자에 맡기고
                   * 모양은 그대로 둔다.
                   */
                    className={controlClass({
                      shape: 'link',
                      tone: 'accent',
                      hoverInk: 'strong',
                      className:
                        'min-w-0 max-w-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                    })}
                  >
                    <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                      {targetPrefix}:
                    </span>
                    <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                  </Link>
                )}
              </span>
            ) : null}
          </>
        ) : null}
        {showBell ? (
          <>
            {showStatus ? (
              <span
                aria-hidden
                className="h-4 w-px shrink-0 bg-[color:var(--color-divider)]"
              />
            ) : null}
            {/*
              * 정사각 아이콘 컨트롤의 정본은 `IconButton`(shape: 'icon')이다.
              * 종전에는 `shape: 'segment'` 였는데 그건 **가로로 늘어나는** 모양
              * 이라 아이콘 하나를 담자 40×24(비 1.67)가 됐다.
              *
              * 안 읽은 개수는 **버튼 밖**에 둔다. 안에 두면 그 폭만큼 버튼이
              * 다시 늘어나 정사각이 깨진다 — 모양을 고쳐 놓고 내용으로 되돌리는
              * 셈이다. 칩의 `gap-1.5` 리듬을 그대로 타는 형제가 맞다.
              */}
            <IconButton
              ref={bellRef}
              size="sm"
              onClick={() => {
                openInbox('bell');
              }}
              aria-haspopup="true"
              aria-expanded={open}
              label={
                feed.unreadCount > 0
                  ? t('bellUnreadAria', { count: feed.unreadCount })
                  : t('bellAria')
              }
              data-testid="agent-activity-bell"
              className="-mr-1 shrink-0 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
            >
              <Bell size={ICON_SIZE.sm} aria-hidden />
            </IconButton>
            {feed.unreadCount > 0 ? (
              <span
                data-testid="agent-activity-unread"
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-indigo-a32)] px-1 font-mono text-caption tabular-nums text-[color:var(--color-indigo-text-soft)]"
              >
                {feed.unreadCount}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {/* 알림함은 종 버튼 **아래**로 자란다. 등장 원점을 트리거 쪽(오른쪽 위)에
          맞춘다 — 중앙에서 태어나면 누른 자리와 나타나는 자리가 끊긴다.
          ⚠️ 방향은 **칩이 어디 사는지**가 정한다. 이 칩이 지도 하단에 살던 시절
          에는 위로 자랐고(`bottom-full`), 우상단으로 올라온 뒤 그 방향이 곧
          화면 밖이 됐다 — 실측 −122px. 자리를 옮기면 이 줄도 같이 본다. */}
      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={t('inboxTitle')}
        data-testid="agent-activity-inbox"
        // 오른쪽 지도 도구 열과 정확히 한 타일+간격만큼 가른다. 표면이 위에
        // 그려져도 rect가 겹치면 반투명 배경 아래 아이콘이 행 액션처럼 비친다.
        style={{ right: 'calc(var(--chrome-tile-size) + 8px)' }}
        // `whitespace-normal` 은 필수다 — 이 패널이 사는 판독 스택은 컨테이너에
        // `whitespace-nowrap` 을 걸어 두므로(범례·판독은 한 줄짜리 문구다),
        // 상속을 끊지 않으면 푸터 문장이 패널 밖으로 흘러나간다(1512 실측).
        className="absolute top-[calc(100%+8px)] z-30 w-[280px] overflow-hidden whitespace-normal rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
      >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            <span className="min-w-0 flex-1 truncate">{t('inboxTitle')}</span>
          </div>
          {feed.work.mode !== 'idle' ? (
            <section
              data-testid="agent-activity-current-work"
              className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-3"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
                  {feed.agentName ?? t('unknownAgent')}
                </span>
                <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {feed.work.mode === 'live'
                    ? phase ?? t('writing')
                    : feed.work.mode === 'recent-write'
                      ? t('recentWriteShort')
                      : t('complete')}
                </span>
              </div>
              {feed.work.summary ? (
                <p className="mt-1.5 text-label leading-label text-[color:var(--color-text-secondary)]">
                  {feed.work.summary}
                </p>
              ) : null}
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-caption leading-label">
                {feed.lastNode ? (
                  <>
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('targetLabel')}</dt>
                    <dd className="min-w-0">
                      {onOpenNode ? (
                        <button
                          type="button"
                          onClick={() => onOpenNode(feed.lastNode!.slug)}
                          className={controlClass({
                            shape: 'link',
                            tone: 'accent',
                            hoverInk: 'strong',
                            className: 'min-w-0',
                          })}
                        >
                          <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                        </button>
                      ) : (
                        <Link
                          href={getTopologyFocusHref(feed.lastNode.slug)}
                          className={controlClass({
                            shape: 'link',
                            tone: 'accent',
                            hoverInk: 'strong',
                            className: 'min-w-0',
                          })}
                        >
                          <span className="min-w-0 truncate">{feed.lastNode.name}</span>
                        </Link>
                      )}
                    </dd>
                  </>
                ) : null}
                {feed.work.nextStep ? (
                  <>
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('nextStepLabel')}</dt>
                    <dd className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">{feed.work.nextStep}</dd>
                  </>
                ) : null}
                {feed.work.lastTool ? (
                  <>
                    <dt className="text-[color:var(--color-text-quaternary)]">{t('toolLabel')}</dt>
                    <dd className="min-w-0 truncate font-mono text-[color:var(--color-text-tertiary)]">{feed.work.lastTool}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}
          {feed.workReceipts.length > 0 ? (
            <section
              data-testid="agent-work-receipts"
              className="border-b border-[color:var(--topology-floating-panel-divider)]"
            >
              <p className="px-3 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t('receiptTitle')}
              </p>
              <div className="max-h-[240px] overflow-y-auto px-2 py-1.5">
                {[...feed.workReceipts].slice(-5).reverse().map((receipt) => (
                  <WorkReceiptRow key={receipt.id} receipt={receipt} nowMs={feed.nowMs} />
                ))}
              </div>
            </section>
          ) : null}
          {feed.notifications.length === 0 && feed.work.mode === 'idle' && feed.workReceipts.length === 0 ? (
            <p
              data-testid="agent-activity-inbox-empty"
              className="px-3 py-4 text-caption leading-label text-[color:var(--color-text-tertiary)]"
            >
              {t('inboxEmpty')}
            </p>
          ) : (
            feed.notifications.length > 0 ? (
              <>
                <p className="px-3 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {t('historyTitle')}
                </p>
                <ul
                  data-testid="agent-activity-inbox-list"
                  className="flex max-h-[240px] flex-col overflow-y-auto px-2 py-1.5"
                >
                  {feed.notifications.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      age={relative(item.at)}
                      onOpenNode={onOpenNode}
                    />
                  ))}
                </ul>
              </>
            ) : null
          )}
          {/* 알림함은 감사 로그의 대체물이 아니다 — 전체 흐름은 볼트 안
              `activity.jsonl` 과 `/git` 이 들고 있다. 그 사실을 숨기지 않는다. */}
          <p className="border-t border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-label text-[color:var(--color-text-quaternary)]">
            {t('inboxFooter')}
          </p>
      </Surface>
    </div>
  );
}

/** 갈래 → 문구 키. 갈래가 늘면 여기 한 곳만 는다. */
const EVENT_LABEL_KEY: Readonly<Record<AgentNotificationKind, string>> = {
  'task-start': 'event.taskStart',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};

/** 이름을 아는 작업 알림의 문구 — 상태 칩과 같은 문법(「claude-code 작업 끝」). */
const EVENT_LABEL_KEY_WITH_AGENT: Readonly<Partial<Record<AgentNotificationKind, string>>> = {
  'task-start': 'event.taskStartAgent',
  'task-end': 'event.taskEndAgent',
};

/**
 * 한 줄은 **2행 고정**이다 — 제목이 길든 짧든, 세부가 있든 없든 같은 리듬으로
 * 읽힌다(치수 규칙성: 반복 세트에서 높이가 글자 수로 정해지면 격자가 무너진다).
 */
function NotificationRow({
  item,
  age,
  onOpenNode,
}: {
  item: AgentNotification;
  age: string;
  onOpenNode?: (slug: string) => void;
}) {
  const t = useTranslations('agentActivity');
  const problem = item.kind === 'vault-problem';

  const detail = useMemo(() => {
    if (item.counts) {
      // 0인 갈래는 그리지 않는다 — 「삭제 0」은 정보가 아니라 소음이다.
      const parts: string[] = [];
      if (item.counts.added > 0) parts.push(t('summaryAdded', { count: item.counts.added }));
      if (item.counts.edited > 0) parts.push(t('summaryEdited', { count: item.counts.edited }));
      if (item.counts.removed > 0) parts.push(t('summaryRemoved', { count: item.counts.removed }));
      return parts.join(t('summaryJoin'));
    }
    if (item.problems) {
      const parts: string[] = [];
      if (item.problems.unresolvedEdges > 0) {
        parts.push(t('problemUnresolved', { count: item.problems.unresolvedEdges }));
      }
      if (item.problems.dependencyCycles > 0) {
        parts.push(t('problemCycles', { count: item.problems.dependencyCycles }));
      }
      return parts.join(t('summaryJoin'));
    }
    if (item.childCount) return t('bridgeChildren', { count: item.childCount });
    return item.label ?? '';
  }, [item, t]);

  return (
    <li
      data-testid="agent-activity-inbox-row"
      data-kind={item.kind}
      className="flex h-12 shrink-0 flex-col justify-center gap-0.5 px-1"
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            'shrink-0 text-label',
            problem
              ? 'text-[color:var(--color-status-warning)]'
              : 'text-[color:var(--color-text-primary)]',
          )}
        >
          {item.agent && EVENT_LABEL_KEY_WITH_AGENT[item.kind]
            ? t(EVENT_LABEL_KEY_WITH_AGENT[item.kind] as string, { agent: agentDisplayName(item.agent) ?? item.agent })
            : t(EVENT_LABEL_KEY[item.kind])}
        </span>
        {item.node ? (
          onOpenNode ? (
            <button
              type="button"
              onClick={() => onOpenNode(item.node!.slug)}
              aria-label={t('openOnMap', { name: item.node.name })}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                truncate: true,
                hoverInk: 'strong',
                className:
                  'min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {item.node.name}
            </button>
          ) : (
            <Link
              href={getTopologyFocusHref(item.node.slug)}
              aria-label={t('openOnMap', { name: item.node.name })}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                truncate: true,
                hoverInk: 'strong',
                className:
                  'min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {item.node.name}
            </Link>
          )
        ) : null}
      </div>
      {/* 세부가 없어도 이 줄은 자리를 지킨다 — 선택적 절이 줄 수를 바꾸지 않는다. */}
      <p className="min-w-0 truncate text-caption text-[color:var(--color-text-tertiary)]">
        {detail ? `${detail} · ${age}` : age}
      </p>
    </li>
  );
}
