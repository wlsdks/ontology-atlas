import { useCallback, useEffect, useState } from 'react';
import { useLocalVault, useVaultCreateFlow } from '@/features/docs-vault-local';
import {
  FIRST_RUN_STARTER_DISMISSED_KEY,
  readFirstRunStarterDismissed,
  writeFirstRunStarterDismissed,
} from './first-run-starter-dismiss';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * INDEX 패널 "시작하기" 모듈(`FirstRunStarterModule`)의 전체 로직 — dismiss
 * 정책, 폴더 열기/새 vault 만들기 액션, Esc 소비를 마크업과 분리해
 * 캡슐화한다. 모듈은 이 hook 을 소비만 하고 JSX 는 전혀 몰라도 된다.
 *
 * **재방문 계약**: `visible` 은 `useFirstRunSampleModeSettled()`(정적 모드 +
 * 복원 시도 완료) 와 `!dismissed` 를 함께 요구한다 — 이미 쓰던 vault 가
 * 복원되면 mode 가 'local' 로 바뀌어 자동으로 `visible=false`, 별도 처리
 * 불필요.
 *
 * **Esc 우선순위**: `window` 의 CAPTURE phase 에 등록한다. 캡처 단계는 DOM
 * 이벤트 흐름에서 버블 단계보다 항상 먼저 실행되므로(등록 순서와 무관),
 * `HomePage.tsx` 의 `topology-esc-ladder`(버블 단계, `window`) 보다 항상
 * 먼저 이 keydown 을 받는다. `event.preventDefault()` 를 호출해두면 ladder
 * 쪽 핸들러가 `if (event.defaultPrevented) return;` 로 즉시 멈춘다 — Radix
 * `DismissableLayer` 가 같은 트릭으로 지도 팝오버/서치와 경쟁하는 것과 동일한
 * 패턴(`topology-esc-ladder.ts` 상단 주석 참조).
 */
export function useFirstRunStarter() {
  const vault = useLocalVault();
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readFirstRunStarterDismissed());
  const { handleCreate, scaffolding, actionError, setActionError } =
    useVaultCreateFlow(vault);

  const visible = sampleModeSettled && !dismissed;

  const dismiss = useCallback(() => {
    writeFirstRunStarterDismissed();
    setDismissed(true);
  }, []);

  // 되돌아오기 (소유자 실사용 지적 2026-07-24) — "여기서 둘러볼게요"로
  // 카드를 닫고 샘플을 구경하다 보면 그 세션에서 처음(시작 안내·샘플
  // 전환·폴더 CTA)으로 돌아갈 길이 없었다. dismiss 를 세션 내에서 되돌리는
  // 명시 경로.
  const undismiss = useCallback(() => {
    try {
      window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    } catch {
      /* private mode — state 만 되돌린다 */
    }
    setDismissed(false);
  }, []);

  const openFolder = useCallback(async () => {
    setActionError(null);
    await vault.open();
  }, [vault, setActionError]);

  const busy =
    vault.status === 'opening' || vault.status === 'loading' || scaffolding;
  const errorText =
    actionError !== null
      ? actionError
      : vault.status === 'error'
        ? vault.errorMessage
        : null;

  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 가이드 투어(`src/features/guided-tour`)가 열려 있는 동안은 양보한다
      // (2026-07-23 Guardian 실측 정정) — 투어의 Esc 계약은 "투어만 닫는다"
      // (`topology-esc-ladder.ts` `close-tour` 단)인데, 이 캡처 핸들러가
      // 버블 사다리보다 먼저 실행돼 Escape 를 삼키고 **보이지도 않는**(투어
      // 스크림 아래) 첫 실행 카드를 영구 dismiss 해버렸다. 투어 오버레이의
      // DOM 존재가 신호 — 카드가 스크림에 덮인 동안 이 카드는 최상위 표면이
      // 아니므로 Esc 소유권이 없다.
      if (document.querySelector('[data-testid="guided-tour-overlay"]') !== null) return;
      // 모달(사전 안내 시트 · 에이전트 연결 시트 등)이 열려 있는 동안도
      // 동일하게 양보한다 (2026-07-24 QA 실측 — 시트에서 Esc 를 누르면
      // 시트만 닫혀야 하는데 이 캡처 핸들러가 먼저 실행돼 보이지도 않는
      // 첫 실행 카드를 세션에서 영구 dismiss 해버렸다).
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [visible, dismiss]);

  return {
    visible,
    dismissed,
    sampleModeSettled,
    dismiss,
    undismiss,
    openFolder,
    createVault: handleCreate,
    busy,
    scaffolding,
    errorText,
    /**
     * ease-of-use G1 (2026-07-23) — File System Access 미지원 브라우저
     * (Safari/Firefox) 판별. 폴더 열기·새 vault 만들기 둘 다 FSA 를 쓰므로
     * 미지원이면 주 CTA 를 "눌러야 실패"가 아니라 **사전에** 정직하게
     * 강등한다(모듈이 소비). `use-local-vault` 가 SSR-일치를 위해 hydration
     * 후 'unsupported' 로 전환하는 기존 상태를 읽기만 한다.
     */
    fsaUnsupported: vault.status === 'unsupported',
  };
}
