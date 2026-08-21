'use client';

import { useEffect, useRef } from 'react';
import { GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { permissionIntent } from '@/features/acp-session/model/permission-intent';
import { permissionScope } from '@/features/acp-session/model/permission-scope';
import { OntologyChangeReview } from '@/features/ontology-change-review';
import { buildOntologyChangeSet } from '@/entities/knowledge-graph';

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
  const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
  const changeSet = ontologyWrite
    ? buildOntologyChangeSet(request.toolName!, request.rawInput)
    : null;
  /* 어디만이 아니라 **무엇을** — 아래 주석 참고. */
  const intent = permissionIntent(request.toolKind);
  /*
    「계속 허용」이 **무엇을** 허용하는지 (2026-08-17).

    종전 문구는 *"위 경로가 있는 폴더 전체"* 라고 **단정**했는데, 그 범위를
    정하는 것은 우리가 아니라 어댑터다 — 실측에서 그 값은 폴더가 아니라
    **도구**였다. 폴더를 허용한다고 적어 놓고 도구를 허용하면, 사용자는 자기가
    준 적 없는 권한을 준 줄 알거나 그 반대로 안다.

    그래서 **어댑터가 선언한 것만** 말하고, 안 주면 아무것도 단정하지 않는다.
  */
  const scope = permissionScope(request.options);

  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  const rejectOnce = request.options.find((o) => o.kind === 'reject_once');
  const allowAlways = request.options.find((o) => o.kind === 'allow_always');

  /**
   * **초점을 이리 데려온다** (2026-08-16 검수에서 적발).
   *
   * 이 카드는 `role="alertdialog"` 를 선언한다. 그 역할이 약속하는 것은
   * 「일을 가로막고, 초점이 안으로 들어온다」인데 **둘 다 안 하고 있었다** —
   * 초점을 옮기는 코드가 없어서, 화면을 못 보는 사람에게는 에이전트가 멈춰 선
   * 그 순간이 **완전한 침묵**이었다. 그 상태로 계속 타이핑할 수도 있었다.
   *
   * 거절 쪽으로 데려간다: 아무 키나 눌러 지나가는 손이 **허용**에 닿으면 안
   * 된다. 이 카드가 여는 것은 되돌릴 수 없는 결정이다.
   */
  const rejectRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    rejectRef.current?.focus();
  }, []);

  return (
    <section
      role="alertdialog"
      aria-labelledby="acp-permission-title"
      aria-describedby="acp-permission-body"
      data-testid="acp-permission-card"
      /*
       * 구획 상자는 `rounded-panel` + `p-[var(--card-pad)]` 다 — 16px 을 손으로
       * 다시 적지 않는다(채택 래칫이 처음에 `rounded-card` + `px-4 py-3.5` 를
       * 잡았다). 이건 한 항목이 아니라 **하나의 구획**이다: 제목 · 근거 · 선택지가
       * 함께 서서 한 결정을 이룬다.
       */
      className={ontologyWrite
        ? 'grid gap-3 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)]'
        : 'grid gap-3 rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] p-[var(--card-pad)]'}
    >
      <div className="flex items-start gap-2.5">
        {ontologyWrite ? (
          <GitCompareArrows
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
          />
        ) : (
          <ShieldAlert
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]"
          />
        )}
        <div className="min-w-0">
          <p
            id="acp-permission-title"
            className="break-keep text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
          >
            {t(ontologyWrite ? 'ontologyWriteTitle' : 'title')}
          </p>
          <p
            id="acp-permission-body"
            className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            {t(ontologyWrite ? 'ontologyWriteBody' : 'body')}
          </p>
        </div>
      </div>

      {/*
        **무엇을 하려는가** (2026-08-17). 경로만 보여 주면 「읽겠다」와
        「지우겠다」가 화면에서 똑같다 — 그 둘은 완전히 다른 결정이다. 값은
        `toolKind` 로 오고 있었고 그 필드 주석이 «화면이 쓸 타입 있는 사실»
        이라고 이미 적어 뒀는데, 화면이 안 읽고 있었다.

        모르면 모른다고 한다. 「읽기」로 짐작하면 가장 위험한 쪽으로 틀린다.
      */}
      {changeSet ? (
        <OntologyChangeReview changeSet={changeSet} />
      ) : (
        <p
          data-testid="acp-permission-intent"
          data-intent={intent}
          className="break-keep text-label leading-label text-[color:var(--color-text-primary)]"
        >
          {t(`intent.${intent}`)}
        </p>
      )}

      {/* 경로는 판단의 근거라 줄이지 않는다. `break-all` 은 긴 경로가 칸 밖으로
          나가지 않게 하고, mono 는 여기서 장식이 아니라 «이건 파일 경로다» 를
          나르는 채널이다. */}
      {!ontologyWrite && request.filePath ? (
        <p
          data-testid="acp-permission-path"
          className="break-all rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-secondary)]"
        >
          {request.filePath}
        </p>
      ) : !ontologyWrite ? (
        <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {request.title ?? t('unknownTarget')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          ref={rejectRef}
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

      {allowAlways && !ontologyWrite ? (
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
          {t(
            scope.kind === 'tool'
              ? 'allowAlwaysTool'
              : scope.kind === 'directory'
                ? 'allowAlwaysDirectory'
                : 'allowAlwaysUnknown',
          )}
        </button>
      ) : null}
      {allowAlways && !ontologyWrite ? (
        <p
          data-testid="acp-permission-scope"
          data-scope={scope.kind}
          className="justify-self-end break-all text-right text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {scope.kind === 'unknown'
            ? t('scopeUnknownHint')
            : t('scopeHint', { names: scope.names.join(' · ') })}
        </p>
      ) : null}
    </section>
  );
}
