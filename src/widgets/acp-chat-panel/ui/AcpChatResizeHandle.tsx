'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_MIN,
  CHAT_WIDTH_STEP,
  maxChatWidth,
} from '../model/panel-width';

/**
 * 대화 패널의 **왼쪽 모서리를 잡아 끄는 자리.**
 *
 * ## 왜 버튼이 아닌가
 *
 * 이건 누르는 것이 아니라 **두 칸의 경계**다. ARIA 에 그 역할이 따로 있고
 * (`separator` — 초점을 받을 수 있으면 창 분할자다), 그때 현재값·최소·최대를
 * 같이 말해 준다. 버튼으로 만들면 보조기술에 「눌리는 것」이라고 거짓말을
 * 하게 되고, 화살표 키가 왜 듣는지도 설명되지 않는다.
 *
 * ## 왜 키보드로도 되나
 *
 * 끌기로만 발견되고 끌기로만 되는 기능은 이 저장소가 금지한
 * *drag-only discovery* 다. 초점을 받고 ←→ 로 16px 씩 움직인다.
 *
 * ## 왜 보이는 선이 1px 인데 잡는 자리는 그보다 넓나
 *
 * 마우스로 1px 을 정확히 짚게 만들면 그건 과녁이 아니라 시험이다(Fitts).
 * 눈에 보이는 것은 패널의 경계선 하나뿐이고, 손이 닿는 자리는 그 둘레
 * 좌우로 넓혀 둔다 — 화면에는 아무것도 더 그려지지 않는다.
 */
export function AcpChatResizeHandle({
  width,
  onWidth,
  onCommit,
}: {
  width: number;
  /** 끄는 동안 매 프레임 — 저장하지 않는다. */
  onWidth: (width: number) => void;
  /** 손을 뗐을 때 한 번 — 그때 저장한다. */
  onCommit: (width: number) => void;
}) {
  const t = useTranslations('acpChat');
  const [dragging, setDragging] = useState(false);
  /** 끌기 시작 시점의 (포인터 X, 그때 폭) — 상대 이동으로 계산해야 튀지 않는다. */
  const originRef = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // 주 버튼만. 오른쪽 버튼이나 보조 버튼으로 창을 끌지 않는다.
      if (event.button !== 0) return;
      event.preventDefault();
      originRef.current = { x: event.clientX, width };
      setDragging(true);
      /*
       * 포인터를 이 원소에 **묶는다.** 안 묶으면 빠르게 끌 때 포인터가 지도
       * 캔버스 위로 넘어가면서 이동 이벤트가 그쪽으로 가고, 패널이 손을 따라
       * 오다 멈춘다.
       */
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      // 패널은 오른쪽에 붙어 있다 — 손을 **왼쪽**으로 끌수록 넓어진다.
      onWidth(origin.width + (origin.x - event.clientX));
    },
    [onWidth],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!originRef.current) return;
      originRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit(width);
    },
    [onCommit, width],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // 왼쪽이 넓히는 방향 — 끌기와 같은 방향이어야 손과 키가 같은 말을 한다.
      const delta =
        event.key === 'ArrowLeft' ? CHAT_WIDTH_STEP : event.key === 'ArrowRight' ? -CHAT_WIDTH_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      onCommit(width + delta);
    },
    [onCommit, width],
  );

  const viewport = typeof window === 'undefined' ? 0 : window.innerWidth;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('resize')}
      aria-valuenow={Math.round(width)}
      aria-valuemin={CHAT_WIDTH_MIN}
      aria-valuemax={Math.round(maxChatWidth(viewport))}
      tabIndex={0}
      data-testid="acp-chat-resize"
      data-dragging={dragging ? 'true' : 'false'}
      title={t('resizeHint')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      // 두 번 누르면 기본 폭으로 — 끌다가 잃어버린 사람에게 되돌릴 길을 준다.
      onDoubleClick={() => onCommit(CHAT_WIDTH_DEFAULT)}
      /*
       * 잡는 자리는 패널의 왼쪽 경계에 걸친다(`-left-1` + `w-2`). 보이는 것은
       * 초점이 왔거나 끄는 중일 때의 인디고 실선 하나뿐이고, 평소에는 패널이
       * 이미 갖고 있는 테두리가 그 자리를 대신한다 — 화면에 새 선을 더하지
       * 않는다.
       */
      className={`absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize bg-transparent
        transition-colors after:absolute after:inset-y-0 after:left-1 after:w-px
        after:bg-transparent after:transition-colors
        hover:after:bg-[color:var(--color-indigo-a46)]
        focus-visible:outline-none focus-visible:bg-[color:var(--color-indigo-a22)]
        focus-visible:after:bg-[color:var(--color-indigo-accent)]
        data-[dragging=true]:after:bg-[color:var(--color-indigo-accent)]`}
    />
  );
}
