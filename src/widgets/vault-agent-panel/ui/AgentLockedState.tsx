'use client';

import type { FirstWordsChip } from '@/features/vault-agent';

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
 * ## 빈 영역
 *
 * 블록은 세로 중앙에 선다. 남는 여백이 위아래로 갈라지면 "덜 만든 화면"이
 * 아니라 "지금은 여기까지"로 읽힌다(1512×950 실측: 연속 빈 영역 91% → 40%).
 */
export function AgentLockedState({
  title,
  body,
  examplesTitle,
  chips,
}: {
  title: string;
  body: string;
  examplesTitle: string;
  /** 첫 마디 생성기가 만든 문장들 — 여기서는 평문 목록으로만 그린다. */
  chips: readonly FirstWordsChip[];
}) {
  return (
    <div className="flex grow flex-col justify-center gap-4">
      {/* 순서: **무엇을 시킬 수 있나** 가 먼저, **무엇이 필요한가** 가 다음.
          값이 비용보다 먼저 읽혀야 한다 — 구 화면은 필요한 것만 말하고 이
          자리가 무엇을 하는 자리인지는 말하지 않았다.

          문장은 키가 있을 때 뜨는 첫 마디 칩과 **같은 생성기**에서 온다 —
          하드코딩 예문은 "우리 폴더엔 그런 개념 없는데요" 라는 첫 실패를
          만든다. 다만 여기서는 평문이다: 누를 수 있게 만들면 키가 없는
          상태에서 눌리는 컨트롤이 늘어나고, 그게 곧 함정이다. */}
      <AgentFirstWords chips={chips} title={examplesTitle} />

      {/* 잠긴 이유 — 바로 아래 입력칸 자리의 문(門)이 무엇을 여는지 설명한다. */}
      <div data-testid="vault-agent-notice" className="flex flex-col gap-1.5">
        <p className="text-body font-semibold text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {title}
        </p>
        <p className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
          {body}
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
      <span className="shrink-0 rounded-chip bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-label font-semibold tracking-label text-white">
        {actionLabel}
      </span>
    </>
  );
  // 파선 = 아직 안 채워진 자리. 채워진 테두리로 그리면 입력할 수 있는 칸으로
  // 읽히고, 그러면 누르고 타이핑하려는 사람이 생긴다.
  const shell =
    'flex min-h-14 w-full items-center gap-2 rounded-card border border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]';

  return (
    <footer className="shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5">
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
