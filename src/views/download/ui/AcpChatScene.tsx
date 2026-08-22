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
 * 실측 왕복의 도구 호출 — `docs/DECISIONS.md` 2026-08-16 (7).
 *
 * **호출 이름은 프로그램 기록이라 번역하지 않고, `why` 페이로드는 번역한다**
 * (2026-08-18 정정). 처음엔 줄 전체를 i18n 밖에 뒀는데, 그 페이로드는
 * 프로그램이 지어낸 문자열이 아니라 **바로 위 말풍선에 있는 사람의 문장**이다.
 * 그래서 영문 화면에서 말풍선은 영어인데 그 아래 호출은 한국어로 같은 말을
 * 되풀이했고, `locale-purity` e2e 가 그것을 잡았다. 두 자리가 같은 문장을
 * 보여 주는 이상 언어도 같아야 한다 — 각색을 피하려던 규율이 오히려 한 화면
 * 안에서 같은 문장을 두 언어로 말하게 만들고 있었다.
 */
function toolCallLine(why: string): string {
  return `add_relation | "${why}"`;
}

/**
 * 도착 시각(ms) — **에이전트의 두 걸음**(도구 호출 → 결과)만 도착한다.
 *
 * ## 사람의 문장은 등장하지 않는다 — 전제라서다 (2026-08-22)
 *
 * 종전 악보는 `[250, 1050, 1750]` 이고 첫 값이 말풍선의 것이었다. 그래서 절이
 * 뷰포트에 들어온 뒤 최소 250ms, 그리고 세 줄이 다 찰 때까지 1,750ms 동안
 * **17rem 짜리 빈 상자**가 서 있었다. 실측(1512, 스크롤 도착 직후 스크린샷):
 * 머리글 한 줄 아래로 250px 가 통째로 비어 있었고, 5초 뒤에야 세 줄이 찼다.
 * 테두리만 있는 빈 상자는 「연출 대기」가 아니라 **「고장났거나 로딩 중」**
 * 으로 읽힌다.
 *
 * 고칠 방향은 둘이었다. ① 전체를 빠르게 — 빈 상자 시간이 줄 뿐 없어지지
 * 않는다. ② **첫 줄을 안무에서 빼기** — 이쪽을 골랐다. 이 장면의 논증은
 * 「사람이 말하면 에이전트가 볼트를 고친다」이고, 거기서 **움직여야 하는 것은
 * 에이전트의 응답**이다. 사람의 문장은 그 응답이 답하는 **전제**이지 결과가
 * 아니다 — 이미 보내진 메시지가 화면에 있고 거기에 에이전트가 반응하는 것이,
 * 대화라는 것이 실제로 일어나는 모양이기도 하다.
 *
 * 그래서 상자는 **첫 프레임부터 비어 있지 않다**. 잃은 것은 말풍선이 떠오르는
 * 장식 하나이고, 얻은 것은 「이 절이 무엇을 보여 주는지」가 도착 즉시 읽히는
 * 것이다. design.md 의 「정보 모션만」이 정확히 이 교환을 요구한다.
 *
 * 남은 두 걸음의 간격(650ms)은 종전 말풍선→호출 간격(800ms)보다 짧다 — 앞의
 * 한 걸음이 사라졌으므로 전체 길이를 그만큼 되돌려 리듬을 유지한다.
 */
const STEP_AT = [400, 1050];

/** 첫 줄(사람의 문장)은 언제나 켜져 있다 — 안무의 시작점이 1 인 이유. */
const PREMISE_SHOWN = 1;

export function AcpChatScene() {
  const t = useTranslations('download');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(PREMISE_SHOWN);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timers: number[] = [];
    /** 되감아도 **전제까지만** 되감는다 — 빈 상자로 돌아가지 않는다. */
    const clear = (): void => {
      for (const id of timers) window.clearTimeout(id);
      timers = [];
      setShown(PREMISE_SHOWN);
    };
    const play = (): void => {
      clear();
      if (reduced) {
        setShown(PREMISE_SHOWN + STEP_AT.length);
        return;
      }
      STEP_AT.forEach((at, i) => {
        timers.push(window.setTimeout(() => setShown(PREMISE_SHOWN + i + 1), at));
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

        {/* ② 에이전트의 도구 호출 — 이름은 원문, `why` 는 화면 언어. */}
        <div className={cn('gateway-term-line', shown >= 2 && 'is-on', 'min-w-0')}>
          <p className="break-keep font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {t('acpToolCaption')}
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-panel border border-[color:var(--color-border-soft)] px-4 py-3 font-mono text-body leading-body text-[color:var(--color-text-tertiary)]">
            {toolCallLine(t('acpToolWhy'))}
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
