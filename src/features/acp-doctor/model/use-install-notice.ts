'use client';

import { useCallback, useEffect, useState } from 'react';

import { isTerminalInstallStage, listenInstallProgress } from './acp-doctor';

/**
 * **설치가 끝났는데 다른 화면에 있었다면, 레일이 알려 준다.**
 *
 * ## 왜 (2026-08-21, 원장 90 · 카운슬 처방)
 *
 * 도구 설치는 몇 분이 걸린다(Node 52MB · npm). 그동안 사람이 그 화면을 보고
 * 있을 이유가 없다 — 지도를 보거나 문서를 읽는다. 그런데 돌아오지 않으면
 * **끝난 것을 영영 모른다.** #1175 가 「닫아 둔 사이의 완료」를 Rust 에 보관해
 * 화면이 다시 열릴 때 되살리게 했는데, 그건 **돌아온 사람**에게만 유효하다.
 *
 * 이 훅은 그 반대편을 맡는다: **돌아오라고 말하는 것.**
 *
 * ## 무엇을 세지 않나
 *
 * **진행률은 안 센다.** 카운슬 처방이 「종단 상태만」이었다 — 레일 배지는
 * 곁눈으로 보는 것이라, 초마다 바뀌는 숫자를 거기 두면 읽는 게 아니라
 * 깜빡이는 것이 된다. 끝났거나(`done`) 실패했을(`failed`) 때만 선다.
 *
 * ## 언제 사라지나
 *
 * **그 화면에 가면.** 배지는 「아직 안 본 것이 있다」는 뜻이고, 보면 그 뜻이
 * 사라진다. 이 저장소의 기록 배지(`gitDirtyCount`)와 같은 문법이다.
 */
export function useInstallNotice(atDestination: boolean): {
  count: number;
  clear: () => void;
} {
  const [seenIds, setSeenIds] = useState<string[]>([]);

  const clear = useCallback(() => setSeenIds([]), []);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    void listenInstallProgress(null, (progress) => {
      if (!alive || !isTerminalInstallStage(progress.stage)) return;
      setSeenIds((current) =>
        // 같은 도구가 두 번 끝나도 배지는 하나다 — 세는 것은 「할 일이 있는
        // 도구 수」이지 사건 수가 아니다.
        current.includes(progress.runtimeId) ? current : [...current, progress.runtimeId],
      );
    }).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  /*
   * 목적지에 있으면 셀 것이 없다 — 보고 있는 것을 「안 봤다」고 말할 수 없다.
   * 도착한 순간 지우는 대신 **그리지 않는다**: effect 안에서 상태를 지우면
   * 렌더가 한 번 더 돌고, 이 저장소의 lint 래칫이 그 모양을 막는다.
   */
  return { count: atDestination ? 0 : seenIds.length, clear };
}
