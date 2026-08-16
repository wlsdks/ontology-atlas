'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { PendingPermission } from '@/features/acp-session/model/use-acp-session';

/**
 * 「이거 해도 될까요」 카드 — 볼트 밖을 건드리려 할 때만 뜬다.
 *
 * ## 이 카드가 떠 있는 동안 에이전트는 멈춰 있다
 *
 * 그게 관문의 정의다. 그래서 이 카드는 **닫는 X 가 없다** — 답하지 않고 치울
 * 수 있으면 그건 관문이 아니라 알림이다. 대신 「안 할래요」가 명시적으로 있다.
 *
 * ## 무엇을 보여 주나
 *
 * **경로 전체를 보여 준다.** 「파일을 고치려 합니다」만으로는 판단할 수 없다 —
 * 어디를 고치려는지가 정확히 이 결정의 근거다. 그래서 경로는 줄이지 않고,
 * 긴 경로는 감싸서 다 보인다.
 *
 * ## 「항상 허용」을 눈에 띄게 두지 않는다
 *
 * 실측에서 그 선택지에는 **그 디렉터리 전체를 세션 내내 허용**하는 규칙이 딸려
 * 온다. 한 번의 클릭이 경계를 통째로 넓히는 것이라, 다른 둘과 같은 무게로 두면
 * 사람은 가장 편한 것을 고른다. 그래서 텍스트 버튼으로 내리고 그 뜻을 적는다.
 */
export function AcpPermissionCard({ pending }: { pending: PendingPermission }) {
  const t = useTranslations('acpChat.permission');
  const { request, resolve } = pending;

  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  const rejectOnce = request.options.find((o) => o.kind === 'reject_once');
  const allowAlways = request.options.find((o) => o.kind === 'allow_always');

  return (
    <section
      role="alertdialog"
      aria-labelledby="acp-permission-title"
      data-testid="acp-permission-card"
      /*
       * 구획 상자는 `rounded-panel` + `p-[var(--card-pad)]` 다 — 16px 을 손으로
       * 다시 적지 않는다(채택 래칫이 처음에 `rounded-card` + `px-4 py-3.5` 를
       * 잡았다). 이건 한 항목이 아니라 **하나의 구획**이다: 제목 · 근거 · 선택지가
       * 함께 서서 한 결정을 이룬다.
       */
      className="grid gap-3 rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] p-[var(--card-pad)]"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          size={ICON_SIZE.md}
          aria-hidden
          className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]"
        />
        <div className="min-w-0">
          <p
            id="acp-permission-title"
            className="break-keep text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
          >
            {t('title')}
          </p>
          <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
            {t('body')}
          </p>
        </div>
      </div>

      {/* 경로는 판단의 근거라 줄이지 않는다. `break-all` 은 긴 경로가 칸 밖으로
          나가지 않게 하고, mono 는 여기서 장식이 아니라 «이건 파일 경로다» 를
          나르는 채널이다. */}
      {request.filePath ? (
        <p
          data-testid="acp-permission-path"
          className="break-all rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-secondary)]"
        >
          {request.filePath}
        </p>
      ) : (
        <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {request.title ?? t('unknownTarget')}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          data-testid="acp-permission-reject"
          onClick={() => resolve(rejectOnce?.optionId ?? null)}
        >
          {t('reject')}
        </Button>
        <Button
          variant="primary"
          data-testid="acp-permission-allow"
          disabled={!allowOnce}
          onClick={() => resolve(allowOnce?.optionId ?? null)}
        >
          {t('allowOnce')}
        </Button>
      </div>

      {allowAlways ? (
        <button
          type="button"
          data-testid="acp-permission-allow-always"
          onClick={() => resolve(allowAlways.optionId)}
          className={controlClass({
            shape: 'link',
            size: 'md',
            tone: 'muted',
            hoverInk: 'secondary',
            className: 'justify-self-end',
          })}
        >
          {t('allowAlways')}
        </button>
      ) : null}
    </section>
  );
}
