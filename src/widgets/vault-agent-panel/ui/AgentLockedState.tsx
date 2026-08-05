'use client';

import type { FirstWordsChip } from '@/features/vault-agent';
import { controlClass } from '@/shared/ui';

import { AgentFirstWords } from './AgentFirstWords';

/**
 * 아직 대화가 안 되는 세 상태의 **하나의 얼굴** — 브라우저(앱 전용) · 폴더
 * 없음 · 키 없음.
 *
 * ## 왜 채팅 모양을 미리 보여주나
 *
 * 구 빈 상태는 제목 한 줄 + 문장 한 줄뿐이었고, 그 아래 패널의 대부분이 빈
 * 검은 영역이었다. 두 가지가 동시에 실패한다: ① 이게 **대화하는 자리**라는
 * 사실이 화면에 없어서 키를 넣으면 무엇이 되는지 알 수 없고, ② 빈 슬래브가
 * "미완성" 신호로 읽힌다. 그래서 아래쪽에 입력칸의 자리를 미리 그린다 —
 * 파선 테두리는 이 앱에서 이미 "아직 안 채워진 자리"를 뜻한다(공방의 소켓).
 *
 * ## 함정을 만들지 않는다
 *
 * 흉내만 내는 입력칸은 누르면 아무 일도 없는 함정이 된다. 그래서 이 자리는
 * **컨트롤 하나**다: 파선 행 전체가 버튼(또는 링크)이고, 그 안의 알약이
 * 목적지를 말한다. 비활성 버튼을 그리지 않고, 보이는 컨트롤은 전부 실제로
 * 동작한다. 같은 기능으로 가는 입구를 둘로 늘리지 않기 위해 설명 블록에는
 * 버튼을 두지 않는다 — 갈 곳은 입력칸의 자리 하나뿐이다.
 *
 * ## 빈 영역 — 덩어리를 옮기는 게 아니라 **양끝에 닻을 박는다**
 *
 * 구 배치는 블록을 세로 **중앙**에 세웠다. 1512×950 실측에서 위 361px · 아래
 * 361px 로 빈 영역이 둘로 갈라졌고, 어느 쪽도 뜻이 없었다 — 위도 아래도 아닌
 * 자리는 아무것도 설명하지 않는다.
 *
 * 통째로 바닥에 붙이는 것도 답이 아니었다(측정: 위 656px 한 덩어리). 여백의
 * 총량은 이 폭·이 높이에서 줄지 않는다 — 정할 수 있는 것은 **여백이 어디에
 * 있고 무엇을 뜻하는가** 뿐이다.
 *
 * 그래서 한 덩어리를 둘로 나눠 양끝에 박는다:
 *
 * - **위** = 이 자리의 값 — "이런 걸 시킬 수 있어요" + 이 폴더에서 뽑은 문장들.
 *   읽기가 시작되는 자리에 값이 온다.
 * - **아래** = 값을 쓰려면 드는 것 + 그 문. 손이 가는 자리(입력칸 띠) 바로 위다.
 * - **가운데 여백** = 대화가 생길 자리. 보내고 나면 실제로 거기에 답이 앉으므로
 *   이 여백은 빈 곳이 아니라 **예고**다.
 *
 * 순서(값 → 비용)는 종전과 같고, 이제 그 순서가 문장 순서가 아니라 **자리**로도
 * 참이다.
 */
export function AgentLockedState({
  title,
  body,
  consent,
  examplesTitle,
  chips,
}: {
  title: string;
  body: string;
  /**
   * 쓰기 동의 약속 — **키를 넣을지 정하는 그 순간**에 필요한 문장이다.
   *
   * 구 화면에서 이 사실("파일은 내가 확인해야 바뀐다")은 제안 카드가 뜨기
   * 전까지 화면 어디에도 없었다. 즉 사람이 자기 API 키와 문서 폴더를 이
   * 패널에 맡길지 결정하는 시점에, 최대 관심사인 "얘가 내 파일을 몰래 고치나"
   * 에 대한 답이 없었다. 안전장치는 코드에 있는 것으로 부족하고 **결정하는
   * 자리에서 읽혀야** 값을 한다.
   */
  consent: string;
  examplesTitle: string;
  /** 첫 마디 생성기가 만든 문장들 — 여기서는 평문 목록으로만 그린다. */
  chips: readonly FirstWordsChip[];
}) {
  return (
    <div className="flex grow flex-col gap-4">
      {/* 순서: **무엇을 시킬 수 있나** 가 먼저, **무엇이 필요한가** 가 다음.
          값이 비용보다 먼저 읽혀야 한다 — 구 화면은 필요한 것만 말하고 이
          자리가 무엇을 하는 자리인지는 말하지 않았다.

          문장은 키가 있을 때 뜨는 첫 마디 칩과 **같은 생성기**에서 온다 —
          하드코딩 예문은 "우리 폴더엔 그런 개념 없는데요" 라는 첫 실패를
          만든다. 다만 여기서는 평문이다: 누를 수 있게 만들면 키가 없는
          상태에서 눌리는 컨트롤이 늘어나고, 그게 곧 함정이다. */}
      <AgentFirstWords chips={chips} title={examplesTitle} />

      {/* 대화가 생길 자리 — 보내고 나면 답이 실제로 여기에 앉는다. 그래서 이
          여백은 채워야 할 구멍이 아니라 **예고**다(넘치면 shrink 되어 0). */}
      <div aria-hidden="true" className="min-h-0 shrink grow" />

      {/* 잠긴 이유 — 바로 **아래** 입력칸 자리의 문(門)이 무엇을 여는지
          설명한다. 이 두 줄이 문 바로 위에 붙어 있는 것이 설계다: 이 상태에서
          가장 중요한 문장은 "키를 남에게 주는 게 아니다" 이고, 그 문장은 누르기
          직전에 읽혀야 값을 한다. 그래서 3차 회색(구)이 아니라 2차 본문이다.
          같은 사실을 아래 띠가 다시 말하지 않는다 — 잠긴 이유의 주인은 여기
          하나뿐이고, 띠는 자기 일(입력칸의 자리 + 문)만 한다. */}
      <div data-testid="vault-agent-notice" className="flex flex-col gap-1.5">
        <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {title}
        </p>
        <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {body}
        </p>
        <p
          data-testid="vault-agent-consent-promise"
          className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {consent}
        </p>
      </div>
    </div>
  );
}

/**
 * 입력칸의 **자리** — 실제 입력칸과 같은 띠(패널 바닥, 같은 구분선), 같은 폭,
 * 같은 높이(56px = 2행 textarea 실측), 같은 라운드.
 *
 * 키가 들어오면 이 자리가 그대로 입력칸이 된다. 같은 박스에서 상태만 바뀌므로
 * 사용자는 "새 화면이 나타났다" 가 아니라 "여기가 열렸다" 로 읽는다.
 *
 * ## 안내가 아니라 **자리표시**를 쓴다
 *
 * 구 문구는 상태마다 "키를 등록하면 바로 말할 수 있어요" 처럼 잠긴 이유를
 * 한 번 더 말했는데, 바로 위 블록이 이미 같은 사실을 말하고 있었다(같은 말
 * 두 번). 이제 이 자리의 글자는 **키가 들어온 뒤 입력칸에 실제로 뜰 자리표시
 * 문구 그 자체**다 — 같은 문장이 같은 자리에 남으므로, 이 띠가 무엇이 될
 * 자리인지 글자 하나로 배운다(비활성 입력칸을 흉내 내지 않고도).
 *
 * ## 왜 비활성 입력칸을 그리지 않나 (2026-07-27 재확인)
 *
 * 다른 도구들이 그렇게 한다는 것은 근거가 아니다. 여기서 잰 것은 **이 상태의
 * 유일한 다음 걸음**이 "키 등록 / 폴더 열기 / 앱 받기" 라는 사실이다. 누를 수
 * 없는 입력칸을 그리면 그 걸음을 여는 컨트롤이 **다른 자리**로 밀려나고, 그
 * 순간 화면에는 컨트롤이 둘(못 쓰는 것 + 진짜)이 된다. 형태를 가르치려다
 * 좌절 하나와 입구 하나를 더 만드는 거래는 손해다. 그래서 이 자리는 여전히
 * **컨트롤 하나**이고, 형태는 파선 + 자리표시 문구가 가르친다.
 */
export function AgentLockedComposer({
  hint,
  actionLabel,
  onAction,
  actionHref,
  testId,
}: {
  hint: string;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
  testId: string;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {hint}
      </span>
      <span className="shrink-0 rounded-chip bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-label font-[var(--font-weight-emphasis)] tracking-label text-[color:var(--color-text-on-accent)]">
        {actionLabel}
      </span>
    </>
  );
  // 파선 = 아직 안 채워진 자리. 채워진 테두리로 그리면 입력할 수 있는 칸으로
  // 읽히고, 그러면 누르고 타이핑하려는 사람이 생긴다.
  const shell = controlClass({
    shape: 'card',
    size: 'sm',
    className:
      'min-h-14 w-full gap-2 text-left border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
  });

  return (
    // 실제 입력칸 띠와 **같은 등장 곡선**을 쓴다 — 이 자리가 그대로 입력칸이
    // 되는 것이므로 두 상태의 띠가 다른 방식으로 도착하면 "여기가 열렸다" 가
    // 아니라 "다른 게 나타났다" 로 읽힌다. 새 duration 0(같은 클래스 재사용).
    <footer className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5">
      {actionHref ? (
        <a
          data-testid={testId}
          href={actionHref}
          aria-label={actionLabel}
          className={shell}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          data-testid={testId}
          onClick={onAction}
          aria-label={actionLabel}
          className={shell}
        >
          {content}
        </button>
      )}
    </footer>
  );
}
