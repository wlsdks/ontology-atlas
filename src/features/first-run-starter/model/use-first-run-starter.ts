import { useCallback, useEffect, useState } from 'react';
import { useLocalVault, useVaultCreateFlow } from '@/features/docs-vault-local';
import {
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
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [visible, dismiss]);

  return {
    visible,
    dismiss,
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
