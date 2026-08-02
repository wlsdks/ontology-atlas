'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { buildOntologyNodeHref } from '@/entities/knowledge-graph';
import { CHROME_STATUS_CHIP_CLASS } from '@/shared/ui/chrome-chip';
import { cn } from '@/shared/lib/cn';
import type { AgentNotification, AgentNotificationKind } from '@/shared/lib/agent-notifications';
import { useAgentActivityFeed } from '../model/use-agent-activity-feed';

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
export function AgentActivityChip({ suppressed = false }: { suppressed?: boolean } = {}) {
  const t = useTranslations('agentActivity');
  const format = useFormatter();
  const feed = useAgentActivityFeed();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) bellRef.current?.focus();
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

  const showBell = feed.notificationsEnabled;
  // 스택이 물러난 동안(데이터시트 조사 중)은 **언마운트한다** — 스택은 opacity-0
  // 로만 사라지므로 남겨 두면 보이지 않는 채 클릭·포커스 가능한 컨트롤이 된다.
  if (suppressed) return null;
  // 말할 것도 없고 열 것도 없으면 자리를 차지하지 않는다.
  if (!feed.showStatus && !showBell) return null;
  if (!feed.showStatus && feed.notifications.length === 0) return null;

  const relative = (at: number) => format.relativeTime(new Date(at), feed.nowMs);

  return (
    <div ref={rootRef} className="pointer-events-auto relative min-w-0" data-testid="agent-activity-chip">
      <div className={CHROME_STATUS_CHIP_CLASS} data-writing={feed.writing ? 'true' : 'false'}>
        {feed.showStatus ? (
          <>
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
              {feed.writing
                ? t('writing')
                : feed.lastAt === null
                  ? t('quietUnknown')
                  : t('lastWorkedAt', { age: relative(feed.lastAt) })}
            </span>
            {/* 대상이 없으면(배치 쓰기·문서 흡수, 또는 볼트에서 사라진 슬러그)
                **대상 없이 상태만** 말한다. 죽은 링크를 만들지 않는다. */}
            {feed.lastNode ? (
              // 축약 사다리 — 폭이 귀한 폰(<md)에서만 대상 이름을 접는다.
              // 접힌 구간에서도 대상은 알림함의 「작업 끝」 줄이 그대로 들고 있다.
              <span className="flex min-w-0 items-center gap-1.5 max-md:hidden">
                <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                <Link
                  href={buildOntologyNodeHref(feed.lastNode.slug)}
                  data-testid="agent-activity-target"
                  aria-label={t('openOnMap', { name: feed.lastNode.name })}
                  className="min-w-0 max-w-40 truncate rounded-chip text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
                >
                  {feed.lastNode.name}
                </Link>
              </span>
            ) : null}
          </>
        ) : null}
        {showBell ? (
          <>
            {feed.showStatus ? (
              <span
                aria-hidden
                className="h-4 w-px shrink-0 bg-[color:var(--color-divider)]"
              />
            ) : null}
            <button
              ref={bellRef}
              type="button"
              onClick={() => {
                if (open) close(false);
                else {
                  setOpen(true);
                  feed.markAllRead();
                }
              }}
              aria-haspopup="true"
              aria-expanded={open}
              aria-label={
                feed.unreadCount > 0
                  ? t('bellUnreadAria', { count: feed.unreadCount })
                  : t('bellAria')
              }
              data-testid="agent-activity-bell"
              className="-mr-1 flex h-6 shrink-0 items-center gap-1 rounded-chip px-1 text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
            >
              <Bell size={13} aria-hidden />
              {feed.unreadCount > 0 ? (
                <span
                  data-testid="agent-activity-unread"
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--color-indigo-a32)] px-1 font-mono text-caption tabular-nums text-[color:var(--color-indigo-accent)]"
                >
                  {feed.unreadCount}
                </span>
              ) : null}
            </button>
          </>
        ) : null}
      </div>
      {open ? (
        <div
          role="group"
          aria-label={t('inboxTitle')}
          data-testid="agent-activity-inbox"
          // `whitespace-normal` 은 필수다 — 이 패널이 사는 판독 스택은 컨테이너에
          // `whitespace-nowrap` 을 걸어 두므로(범례·판독은 한 줄짜리 문구다),
          // 상속을 끊지 않으면 푸터 문장이 패널 밖으로 흘러나간다(1512 실측).
          className="absolute bottom-[calc(100%+8px)] right-0 z-30 w-[280px] overflow-hidden whitespace-normal rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            <span className="min-w-0 flex-1 truncate">{t('inboxTitle')}</span>
          </div>
          {feed.notifications.length === 0 ? (
            <p
              data-testid="agent-activity-inbox-empty"
              className="px-3 py-4 text-caption leading-relaxed text-[color:var(--color-text-tertiary)]"
            >
              {t('inboxEmpty')}
            </p>
          ) : (
            <ul
              data-testid="agent-activity-inbox-list"
              className="flex max-h-[300px] flex-col overflow-y-auto px-2 py-1.5"
            >
              {feed.notifications.map((item) => (
                <NotificationRow key={item.id} item={item} age={relative(item.at)} />
              ))}
            </ul>
          )}
          {/* 알림함은 감사 로그의 대체물이 아니다 — 전체 흐름은 볼트 안
              `activity.jsonl` 과 `/git` 이 들고 있다. 그 사실을 숨기지 않는다. */}
          <p className="border-t border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]">
            {t('inboxFooter')}
          </p>
        </div>
      ) : null}
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

/**
 * 한 줄은 **2행 고정**이다 — 제목이 길든 짧든, 세부가 있든 없든 같은 리듬으로
 * 읽힌다(치수 규칙성: 반복 세트에서 높이가 글자 수로 정해지면 격자가 무너진다).
 */
function NotificationRow({ item, age }: { item: AgentNotification; age: string }) {
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
          {t(EVENT_LABEL_KEY[item.kind])}
        </span>
        {item.node ? (
          <Link
            href={buildOntologyNodeHref(item.node.slug)}
            aria-label={t('openOnMap', { name: item.node.name })}
            className="min-w-0 truncate rounded-chip text-label text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
          >
            {item.node.name}
          </Link>
        ) : null}
      </div>
      {/* 세부가 없어도 이 줄은 자리를 지킨다 — 선택적 절이 줄 수를 바꾸지 않는다. */}
      <p className="min-w-0 truncate text-caption text-[color:var(--color-text-tertiary)]">
        {detail ? `${detail} · ${age}` : age}
      </p>
    </li>
  );
}
