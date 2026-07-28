'use client';

import { useEffect, useState } from 'react';

import { SECRET_PROVIDERS, secretStatus, subscribeSecretChange } from './tauri-secrets';

/**
 * 에이전트 도크가 **처음부터 열려 있어야 하는가.**
 *
 * ## 왜 "항상 열림" 이 아닌가
 *
 * 소유자 요구는 "바로바로 채팅하면 알아서 진행되어야 하니 시야로 보이면서"
 * 다 — 즉 **쓸 수 있는 상태의 도크**가 보여야 한다는 뜻이다. 그런데 키가 없는
 * 컴퓨터에서 도크를 기본으로 열면, 화면 오른쪽 3분의 1을 **잠긴 패널**이
 * 영구히 차지한다. 그건 요구의 이행이 아니라 요구의 글자만 지킨 것이다.
 *
 * 그래서 판정은 둘이 모두 참일 때만 열림이다:
 * 1. LLM 다리가 있다(= 설치 앱). 웹은 원리적으로 불가라 도크 자체가 없다.
 * 2. 이 컴퓨터에 벤더 키가 하나라도 있다 — **키의 존재만** 안다(끝 4자조차
 *    여기선 안 읽는다).
 *
 * ## 왜 훅이고 왜 이 자리인가
 *
 * 지도와 공방이 같은 답을 내야 한다. 두 화면이 각자 계산하면 한쪽만 고쳐지고
 * 갈라진다 — 이 저장소가 반복해서 배운 실패 모드다. 그리고 키를 **넣고
 * 돌아오는 길**도 여기서 열린다: `subscribeSecretChange` 를 듣고 있으므로
 * 설정 시트에서 키를 저장하면 새로고침 없이 도크가 열린다.
 *
 * `null` 은 "아직 모른다" 이지 "닫힘" 이 아니다. 첫 프레임에 답을 아는 척하면
 * 서버 렌더와 어긋나거나(하이드레이션) 열렸다 닫히는 깜빡임이 된다 — 호출부는
 * `null` 동안 아무것도 하지 않는다.
 */
export function useAgentDockDefaultOpen(): boolean | null {
  const [defaultOpen, setDefaultOpen] = useState<boolean | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => subscribeSecretChange(() => setNonce((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 다리가 없으면(웹) `secretStatus` 는 IPC 없이 즉시 `null` 이라 이 순환은
      // 세 번의 즉시 반환으로 끝나고 `false` 로 정착한다. **동기 분기를 두지
      // 않는 것이 요점이다** — 이펙트 본문에서 곧바로 setState 하면 연쇄 렌더가
      // 되고, 그건 lint 가 이미 잡는 실수다.
      for (const provider of SECRET_PROVIDERS) {
        const status = await secretStatus(provider);
        if (cancelled) return;
        if (status?.stored) {
          setDefaultOpen(true);
          return;
        }
      }
      if (!cancelled) setDefaultOpen(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return defaultOpen;
}
