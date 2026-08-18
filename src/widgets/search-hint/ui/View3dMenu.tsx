'use client';

import { useEffect, useRef } from 'react';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import {
  useMapArrangement,
  useView3d,
  writeMapArrangement,
  writeView3d,
  type MapArrangement,
} from '@/shared/lib/appearance-preferences';

/**
 * 「3D」 칩이 여는 **보기 고르개** (2026-08-18).
 *
 * ## 왜 토글이 아니라 팝업인가
 *
 * 3D 에 배치가 둘 생기면서(돔·구름) 「3D 켬/끔」 토글 하나로는 **무엇을 보고
 * 있는지**를 말할 수 없게 됐다. 처음에는 배치를 설정 시트에 넣었는데 소유자
 * 판정이 두 번 왔다: *"구름은 어디에서 볼 수 있는거지? 선택하는게 없는데?"*
 * 그리고 *"소유, 결합 이런식이면 모르지? 3D누르면 선택 팝업이 나오게 해야지?"*
 *
 * 둘 다 같은 진단이다. **지금 보는 것을 바꾸는 컨트롤은 지금 보는 화면 위에
 * 있어야 한다.** 설정 시트는 한 번 정해 두고 잘 안 바꾸는 값의 자리이지,
 * 「이 화면을 어떻게 볼까」의 자리가 아니다.
 *
 * ## 왜 세 줄인가 — 평면까지 여기서 고른다
 *
 * 「3D 를 끈다」와 「3D 안에서 모양을 고른다」를 두 컨트롤로 나누면 사용자는
 * 상태 하나를 두 곳에서 읽어야 한다. 한 목록에 셋을 놓으면 **지금 무엇을 보고
 * 있는지가 한 자리에서 읽히고**, 고르는 행위도 한 번이다. 그래서 설정 시트에
 * 있던 중복 스위치는 이 팝업이 생기면서 없앴다 — 이 저장소의 «한 사실에 자리
 * 하나» 규율.
 *
 * ## 왜 이름이 「소유/결합」이 아닌가
 *
 * 첫 문구가 그것이었고 소유자가 못 알아봤다. 추상 명사는 그 개념을 이미 아는
 * 사람에게만 이름이다. 눈에 보이는 것을 먼저 부르고(**돔** · **구름**), 무엇을
 * 답하는지는 그 아래 한 줄로 붙인다. 내부 키(`ownership`/`coupling`)는 그대로다
 * — 화면의 말과 코드의 말이 다른 것은 정상이고, 반대로 코드의 말을 화면에
 * 그대로 내보내는 것이 사고다.
 */

/** 목록의 한 줄 — 평면(2D)과 3D 배치 둘. */
type View3dChoice = 'flat' | MapArrangement;

const CHOICES: readonly View3dChoice[] = ['flat', 'ownership', 'coupling'];

export function View3dMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('searchWidgets.hint');
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  const value: View3dChoice = view3d ? arrangement : 'flat';
  const boxRef = useRef<HTMLDivElement | null>(null);
  /*
   * 나가는 길 — 조건부로 나타나는 표면은 **사라지는 길을 지고 태어난다**
   * (`surface-motion-ratchet`). 없으면 닫을 때 한 프레임에 소멸하고, 그건
   * 사용자가 방금 무엇을 닫았는지 못 보는 하드컷이다.
   */
  const presence = usePanelPresence(open);

  const apply = (next: View3dChoice) => {
    if (next === 'flat') {
      writeView3d(false);
    } else {
      // 배치를 **먼저** 쓴다 — 3D 를 켠 다음 배치를 바꾸면 한 프레임 동안 옛
      // 배치로 조립이 시작됐다가 다시 지어진다(조립 연출이 두 번 튄다).
      writeMapArrangement(next);
      writeView3d(true);
    }
    onClose();
  };

  const group = useRovingRadioGroup({ value, values: CHOICES, onChange: apply });

  /*
   * 바깥 누름·Esc 로 닫는다. 이 표면은 **뒤를 막지 않는다** — 지도를 보면서
   * 고르는 것이 요점이라 모달로 만들면 고르는 동안 결과가 안 보인다.
   * 그래서 스크림도 트랩도 없다(모달 계약의 대상이 아니다).
   *
   * ⚠️ **닫혀 있으면 아무것도 듣지 않는다.** 이 컴포넌트는 칩 옆에 **항상
   * 렌더된다**(`open` 이 false 여도). 훅은 조기 반환보다 먼저 도니, 이 가드가
   * 없으면 **메뉴가 닫혀 있는 내내** 문서 Esc 를 가로채 `stopPropagation()`
   * 하게 된다 — 앱 전역에서 Esc 가 죽는다. 실측(2026-08-19 CI): 노드 상세가
   * Esc 로 안 닫히고, 키보드 경로·포커스 반환·팝오버 계약까지 다섯 스펙이
   * 함께 빨개졌다. 조건부 표면의 전역 리스너는 **열렸을 때만** 산다.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      const box = boxRef.current;
      if (box && e.target instanceof Node && !box.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // capture 로 받는다 — 지도 캔버스가 pointerdown 을 먼저 삼켜 팝업이 안
    // 닫히는 것을 막는다.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose, open]);

  if (!presence.mounted) return null;

  return (
    <div
      ref={boxRef}
      {...transientSurface('menu')}
      data-testid="topology-view-3d-menu"
      data-state={presence.exiting ? 'closed' : 'open'}
      className={cn(
        'overlay-spring-surface',
        presence.exiting && 'pointer-events-none',
        'absolute left-1/2 top-full z-40 mt-2 w-60 -translate-x-1/2',
        'rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]',
        'bg-[color:var(--topology-v2-panel-surface)] p-1.5 shadow-[var(--topology-v2-panel-shadow)]',
      )}
    >
      <div {...group.groupProps} aria-label={t('view3dAriaLabel')} className="flex flex-col gap-1">
        {CHOICES.map((choice, index) => {
          const active = choice === value;
          return (
            <button
              key={choice}
              {...group.itemProps(index)}
              type="button"
              data-testid={`topology-view-3d-choice-${choice}`}
              className={controlClass({
                shape: 'row',
                size: 'md',
                // 호버는 값 층이 소유한다 — 손으로 쓰면 앱 전역 호버 문법이
                // 자리마다 갈린다(`hover-axis-adoption-ratchet`).
                hoverSurface: 'lift',
                active,
                className: 'w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left',
              })}
            >
              <span
                className={cn(
                  'text-body',
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--topology-v2-panel-text-primary)]',
                )}
              >
                {t(`view3dChoice.${choice}`)}
              </span>
              {/* 그 줄이 답하는 것을 한 줄로. 이름만으로는 «무엇이 다른가»가
                  안 읽힌다 — 그것이 「소유/결합」이 실패한 이유다. */}
              <span className="break-keep text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                {t(`view3dChoiceHint.${choice}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
