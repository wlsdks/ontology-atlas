'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import {
  formatDownloadProgress,
  summarizeNotes,
  type UpdatePhase,
} from '../model/update-state';

/**
 * 앱이 꺼낸 말이지 사용자가 부른 화면이 아니다.
 *
 * 그래서 이 표면의 설계 기준은 "눈에 띄는가" 가 아니라 **"무시하기 쉬운가"** 다.
 * 모달이 아니고, 스크림이 없고, 진행 중인 작업을 막지 않고, 닫기가 항상 한
 * 클릭이다. 업데이트는 급한 적이 없다.
 *
 * 절제 헌장을 그대로 따른다 — glow · 배지 · 흔들림 · 그라디언트 없음. 색을 직접
 * 칠하지 않고 `Button` 을 쓰는 것도 같은 이유다: 주 버튼의 인디고는 이미 디자인
 * 시스템이 소유한 결정이고, 여기서 다시 정하면 그 결정이 두 곳으로 갈라진다.
 *
 * `checking` 단계는 **그리지 않는다.** 사용자가 시키지 않은 확인을 화면에
 * 보고하는 것은 소음이다 — 결과가 "새 버전 있음" 일 때 처음 말을 건다.
 */
export interface UpdateToastProps {
  readonly phase: UpdatePhase;
  readonly onInstall: () => void;
  readonly onRestart: () => void;
  readonly onDismiss: () => void;
}

export function UpdateToast({ phase, onInstall, onRestart, onDismiss }: UpdateToastProps) {
  const t = useTranslations('appUpdate');

  if (phase.kind === 'idle' || phase.kind === 'checking' || phase.kind === 'current') {
    return null;
  }

  const body = (() => {
    switch (phase.kind) {
      case 'available': {
        const notes = summarizeNotes(phase.notes);
        return {
          title: t('availableTitle', { version: phase.version }),
          detail: notes ?? t('availableBody'),
          action: { label: t('install'), onClick: onInstall },
        };
      }
      case 'downloading': {
        const percent = formatDownloadProgress(phase.received, phase.total);
        return {
          title: t('downloadingTitle', { version: phase.version }),
          // 총량을 모르면 퍼센트를 지어내지 않고 그 사실만 말한다.
          detail: percent ? t('downloadingPercent', { percent }) : t('downloadingUnknown'),
          action: null,
        };
      }
      case 'ready':
        return {
          title: t('readyTitle', { version: phase.version }),
          detail: t('readyBody'),
          action: { label: t('restart'), onClick: onRestart },
        };
      case 'failed':
        return {
          title: t('failedTitle'),
          // 실패는 무엇이 실패했는지 말한다. 손으로 받을 길이 남아 있다.
          detail: phase.message || t('failedBody'),
          action: null,
        };
    }
  })();

  return (
    <div
      // 라이브 영역이되 assertive 가 아니다 — 스크린리더 사용자의 흐름도 끊지 않는다.
      role="status"
      aria-live="polite"
      data-testid="app-update-toast"
      data-phase={phase.kind}
      className={cn(
        'pointer-events-auto fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]',
        'flex flex-col items-start gap-2 rounded-card border border-[color:var(--color-border-strong)]',
        'bg-[color:var(--color-elevated)] p-3 shadow-[var(--shadow-elevation-2)]',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <p className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {body.title}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="app-update-dismiss"
          /* 제목과 한 줄을 이루는 토스트 헤더 행 — 바닥 24(`min-h-6`)는 램프가
             내고, `-m-1 p-1` 이 시각 발자국을 글자 크기로 되돌린다. coarse 의
             44 는 `.touch-hit-expand` 가 낸다(아래 CTA 와 세로 여유 ≥12px). */
          className={controlClass({
            shape: 'link',
            tone: 'muted',
            className:
              'touch-hit-expand -m-1 shrink-0 p-1 leading-label hover:text-[color:var(--color-text-secondary)]',
          })}
        >
          {t('dismiss')}
        </button>
      </div>

      <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
        {body.detail}
      </p>

      {body.action ? (
        <Button size="sm" onClick={body.action.onClick} data-testid="app-update-action">
          {body.action.label}
        </Button>
      ) : null}
    </div>
  );
}
