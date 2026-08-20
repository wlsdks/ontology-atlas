'use client';

import { useTranslations } from 'next-intl';

import { AcpRuntimeSettings } from '@/widgets/app-settings-menu';
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from '@/shared/ui/page-frame';

/**
 * 「에이전트」 목적지 — 이 컴퓨터의 AI 코딩 도구를 **받고 · 깔고 · 붙이고 ·
 * 고치고 · 대화를 여는** 자리.
 *
 * ## 왜 설정에서 나왔나 (2026-08-20, 원장 90)
 *
 * 소유자 지시: *"우리도 설정을 아예 LNB로 넣고 버즈나 다른 오픈소스처럼 그냥
 * 한 창을 다 쓸까? 지금처럼 팝업말고?"* → 세 선택지 중 **「에이전트를 최상위로」**.
 *
 * PO 카운슬 5인 + 디자인 벤치 5석이 심사했고, 이동의 근거는 폭이 아니다
 * (설치 앱 실측: 정상 경로에서 시트의 46~47%가 오히려 빈다). 근거는 **그릇**이다:
 *
 * - 모달이 **뒤를 딤으로 막고 Esc 를 소유한다.** 52MB 를 받는 동안 지도를 못 본다.
 * - 시트는 닫히면 **통째로 언마운트된다** — 완료 신호가 유실될 수 있다
 *   (그 결함 자체는 이동과 독립이라 별도로 고쳤다. 목적지도 라우트를 떠나면 같다).
 * - **설정은 값을 고르는 자리**이고, 이것은 **진행 상태가 있는 운영 작업**이다.
 *
 * 스킬이 문서함과 갈라선 것과 같은 문법이다(2026-08-09): 답하는 질문이 다르면
 * 목적지가 다르다.
 *
 * ## 이 화면이 담는 것과 담지 않는 것
 *
 * 담는다: 실행기 목록 · 연결 점검 · 앱 전용 설치 · 재연동 · 대화 열기.
 * 담지 않는다: **API Key**(2026-08-16 「경로 동결·비강조」 결정이 서 있다 —
 * 목적지 승격은 그 자체가 강조라 조용히 뒤집을 수 없다) · **작업 공간**(볼트가
 * 답하는 축이 다르다: `local-vault-management` 소유).
 */
export function AgentsPage() {
  const t = useTranslations('agents');

  return (
    <div className={PAGE_FRAME} data-testid="agents-page">
      {/*
        ⚠️ **설명은 헤더 «밖»이다.** `PAGE_HEADER_ROW` 는
        `justify-between` 한 줄이라, 설명을 그 안에 두면 제목의 반대쪽 끝으로
        밀려 오른쪽 정렬처럼 보인다(첫 판에서 실제로 그랬다). 스킬 화면이 자기
        주석에 같은 함정을 적어 뒀는데 그대로 밟았다 — 헤더의 오른쪽 자리는
        «제목과 나란히 서는 컨트롤» 의 것이다.
      */}
      <header className={PAGE_HEADER_ROW}>
        <div className={PAGE_TITLE_ROW}>
          {/* 형제 목적지(스킬)와 같은 헤드라인 규격 — 새 값을 만들지 않는다. */}
          <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {t('title')}
          </h1>
        </div>
      </header>
      <p className="mt-2 max-w-2xl break-keep text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
        {t('lede')}
      </p>

      <section className="mt-6 min-w-0">
        <AcpRuntimeSettings />
      </section>
    </div>
  );
}
