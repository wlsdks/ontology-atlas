import { useCallback, useEffect, useState } from 'react';
import {
  readSampleNodeHintDismissed,
  writeSampleNodeHintDismissed,
} from './sample-node-hint';
import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

/**
 * 샘플 모드 첫 방문의 1회성 지도 힌트("지도의 노드를 눌러보세요 — 모든 것이
 * 진짜 문서예요") 표시 로직.
 *
 * **표시 계약**: 정적 샘플 모드가 안착했고(`useFirstRunSampleModeSettled`),
 * 아직 영구 dismiss 안 됐고, 지금 선택된 노드가 없을 때만 보인다. 첫 노드
 * 클릭(= `hasSelection` true 전환)이 힌트를 **영구** 소멸시킨다(localStorage).
 * 실제 vault 가 연결되면 sample-settled 게이트가 꺼져 자동으로 사라진다.
 *
 * popup soup 회피: 이 훅은 "보일지 여부"만 판정하고, 렌더는 지도 위
 * `pointer-events-none` 라벨 한 개(`SampleNodeHint`)로만 한다 — 별도 모달/
 * 플로팅 스택을 만들지 않는다.
 *
 * @param hasSelection 지도에서 현재 노드가 선택돼 있는가(HomePage 소유 상태).
 */
export function useSampleNodeHint(hasSelection: boolean) {
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [dismissed, setDismissed] = useState(() => readSampleNodeHintDismissed());

  const dismiss = useCallback(() => {
    writeSampleNodeHintDismissed();
    setDismissed(true);
  }, []);

  // 첫 노드 클릭(선택 발생) = 학습 완료 → 영구 소멸. 선택은 클릭 외에도
  // 딥링크로 생길 수 있으나, 어느 경로든 노드가 focus 되면 힌트의 목적은
  // 이미 달성된 것이라 동일하게 소멸시킨다. 표시 자체는 아래 `visible` 의
  // `!hasSelection` 로 이미 즉시 꺼지므로, 이 effect 는 오직 영구 기록만
  // 담당한다 — 동기 setState(cascading-render 경고) 회피 위해 microtask 로
  // defer 한다(HomePage 등 저장소 관례와 동일).
  useEffect(() => {
    if (!hasSelection || dismissed) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled) dismiss();
    });
    return () => {
      cancelled = true;
    };
  }, [hasSelection, dismissed, dismiss]);

  const visible = sampleModeSettled && !dismissed && !hasSelection;

  return { visible, dismiss };
}
