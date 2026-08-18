'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';

/**
 * 앱 안 대화 재연 — **채팅 한 번이 관계가 되는 실측 왕복 1사이클**.
 *
 * ## 이 절이 팔던 것이 틀렸었다 (2026-08-18 소유자)
 *
 * 직전 판은 `mcp-verify` 터미널이었다 — 개발자가 설정을 검증하는 장면이다.
 * 소유자: *"이건 뭔말인지를 모르겠어.. 내가 강조하고싶은건 서비스 안에 acp가
 * 들어갔거든? 에이전트가 연동되어서 채팅만으로 온톨로지 분석이 가능하다는걸
 * 강조하고싶은데"*. 파는 장면은 검증이 아니라 **앱 안의 대화**다: 사람이
 * 한국어로 설명하면, 에이전트가 볼트 도구를 부르고, 결과가 마크다운 한 줄로
 * 남는다.
 *
 * ## 재연되는 세 줄은 지어낸 것이 아니다
 *
 * `docs/DECISIONS.md` 2026-08-16 (7) 의 실측 왕복이다 — 사용자의 문장과
 * `add_relation` 의 `why` 원문을 그대로 옮겼다(원장의 규율: 날짜 박힌 기록은
 * 그때의 사실로 남는다). 탭 라벨이 그 날짜를 화면에 적는다. 도구 호출 원문은
 * 프로그램 기록이라 번역하지 않는다 — 번역하는 순간 재연이 아니라 각색이 된다.
 *
 * ## 브랜드·약관 경계 (docs/DECISIONS.md 2026-08-16 (5))
 *
 * 이 절의 문구는 「이미 쓰는 에이전트를 연결한다」 위에만 선다 — 우리가
 * Claude 접근을 제공한다는 인상을 주는 문장은 금지이고, 우리 실행기 목록을
 * 설명하는 자리의 표시 이름은 레지스트리의 허용된 이름(Claude Agent)만 쓴다
 * (`tests/contract/vendor-naming.contract.test.ts` 가 잠그는 그 규칙).
 *
 * ## 모션
 *
 * 절이 뷰포트에 들어오면 사용자 말풍선 → 도구 호출 → 결과가 인과 순서로
 * 도착한다(스태거는 원인이 먼저 움직여 인과를 보여줄 때만 — design.md).
 * reduced-motion: 타이머 없이 전 줄이 즉시 보인다. 나가면 되감고 다시
 * 들어오면 처음부터 — 한 사이클이면 논증이 끝난다(`AgentTerminal` 이 쓰던
 * 재생 계약 그대로).
 */

/**
 * 실측 왕복의 도구 호출 원문 — `docs/DECISIONS.md` 2026-08-16 (7).
 * 프로그램 기록이라 i18n 밖이다(위 독블록).
 */
const TOOL_CALL_LINE =
  'add_relation | "사용자 설명: 결제 기능이 사용자 인증에 기대고 있어서,\n' +
  '                인증이 죽으면 결제도 같이 죽는다 (2026-08-16)"';

/** 도착 시각(ms) — 말풍선 → 도구 호출 → 결과. 인과가 리듬이다. */
const STEP_AT = [250, 1050, 1750];

export function AcpChatScene() {
  const t = useTranslations('download');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timers: number[] = [];
    const clear = (): void => {
      for (const id of timers) window.clearTimeout(id);
      timers = [];
      setShown(0);
    };
    const play = (): void => {
      clear();
      if (reduced) {
        setShown(STEP_AT.length);
        return;
      }
      STEP_AT.forEach((at, i) => {
        timers.push(window.setTimeout(() => setShown(i + 1), at));
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      play();
      return clear;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) play();
        else clear();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="gateway-agent-chat"
      className="min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] text-left"
    >
      <div className="border-b border-[color:var(--color-border-soft)] px-6 py-3.5 font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t('acpSceneTab')}
      </div>

      {/* 높이를 예약해 줄이 도착해도 아래 절이 안 밀린다(터미널 시절의 계약). */}
      <div className="grid min-h-[17rem] content-start gap-5 px-6 pb-6 pt-5">
        {/* ① 사람의 문장 — 실측 세션의 사용자 입력 그대로. */}
        <div className={cn('gateway-term-line', shown >= 1 && 'is-on', 'flex min-w-0 justify-end')}>
          <div className="min-w-0 max-w-[34rem]">
            <p className="text-right font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t('acpUserLabel')}
            </p>
            <p className="mt-1.5 break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
              {t('acpUserMsg')}
            </p>
          </div>
        </div>

        {/* ② 에이전트의 도구 호출 — 원문 그대로(번역 없음). */}
        <div className={cn('gateway-term-line', shown >= 2 && 'is-on', 'min-w-0')}>
          <p className="break-keep font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {t('acpToolCaption')}
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-panel border border-[color:var(--color-border-soft)] px-4 py-3 font-mono text-body leading-body text-[color:var(--color-text-tertiary)]">
            {TOOL_CALL_LINE}
          </pre>
        </div>

        {/* ③ 남은 것 — 볼트 frontmatter 한 줄, git 이 본다. */}
        <p
          className={cn(
            'gateway-term-line',
            shown >= 3 && 'is-on',
            'min-w-0 break-keep font-mono text-body leading-body text-[color:var(--color-indigo-accent)]',
          )}
        >
          {t('acpResultLine')}
        </p>
      </div>
    </div>
  );
}
