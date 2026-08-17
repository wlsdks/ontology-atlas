'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  CHAT_WIDTH_DEFAULT,
  clampChatWidth,
  readStoredChatWidth,
  writeStoredChatWidth,
} from './panel-width';

/**
 * 대화 패널의 폭을 **기억한다.**
 *
 * ## 왜 `useState` + `useEffect` 가 아닌가
 *
 * 저장된 폭은 리액트 밖에 있는 값이다(디스크의 `localStorage`). 그것을 마운트
 * 뒤에 `setState` 로 끌어오면 첫 그림이 한 번 기본 폭으로 섰다가 다시 그려지고,
 * 리액트도 그 패턴을 경고한다. 리액트가 **바깥 값**을 위해 따로 마련해 둔 문이
 * `useSyncExternalStore` 이고, 이 문에는 서버용 답을 따로 줄 수 있어서 정적
 * export 의 첫 HTML 과도 어긋나지 않는다.
 *
 * ## 끄는 동안의 폭은 왜 따로 있나
 *
 * 끌 때마다 디스크에 쓰면 초당 수십 번이다. 그래서 **끄는 동안의 폭만** 리액트
 * 상태로 들고 있다가, 손을 뗄 때 한 번 쓴다. 쓴 뒤에는 이 임시 값을 버리므로
 * 정답은 언제나 저장된 값 하나다(같은 값을 두 곳에 두지 않는다).
 */

/** 저장된 폭이 바뀌었다고 알리는 자리 — 같은 화면 안의 구독자들에게 보낸다. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // 창이 좁아지면 저장된 폭이 이 화면에서는 상한을 넘는다 — 그때 다시 접는다.
  window.addEventListener('resize', onChange);
  // 다른 창에서 폭을 바꿨을 때도 따라간다.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('storage', onChange);
  };
}

function snapshot(): number {
  return clampChatWidth(
    readStoredChatWidth(window.localStorage) ?? CHAT_WIDTH_DEFAULT,
    window.innerWidth,
  );
}

/** 서버에는 저장소도 창도 없다 — 기본 폭으로 그린다. */
function serverSnapshot(): number {
  return CHAT_WIDTH_DEFAULT;
}

export function useChatWidth(): {
  width: number;
  /** 끄는 중에 부른다 — 저장하지 않는다. */
  setWidth: (width: number) => void;
  /** 손을 뗐을 때 부른다 — 그때 한 번 저장한다. */
  commitWidth: (width: number) => void;
} {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [dragging, setDragging] = useState<number | null>(null);

  const setWidth = useCallback((next: number) => {
    setDragging(clampChatWidth(next, window.innerWidth));
  }, []);

  const commitWidth = useCallback((next: number) => {
    writeStoredChatWidth(window.localStorage, clampChatWidth(next, window.innerWidth));
    // 임시 값을 버리고 저장된 값으로 돌아간다 — 같은 사건이라 한 번에 그려진다.
    setDragging(null);
    for (const listener of listeners) listener();
  }, []);

  return { width: dragging ?? stored, setWidth, commitWidth };
}
