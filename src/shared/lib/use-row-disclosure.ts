'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 목록 행 펼침/접힘 — **열림·닫힘·내용 교체를 하나의 높이 전이로** 통과시키는
 * 수명 관리. 시각 문법은 `app/globals.css` 의 `.ai-row-disclosure` 계열이
 * 진실원이고, 이 훅은 그 문법을 쓰는 소비처가 공유하는 **행동** 쪽이다.
 *
 * 원래 [AI 연결] 벤더 행 안에 있던 것을 shared 로 내렸다 — 인사이트 「할 일」
 * 큐 행도 같은 상호작용(행 안에서 한 필드 쓰고 저장/취소)을 하는데, 두 번째
 * 구현을 만들면 같은 동작이 표면마다 다르게 보인다. 커브·퇴장 시간·ResizeObserver
 * 재측정이 한 곳에 있어야 "같은 동작은 같게 보인다" 가 규율이 아니라 구조가 된다.
 *
 * 왜 이렇게까지 하나: 취소가 "취소됐다" 로 읽히려면 카드가 **들어온 길로**
 * 나가야 한다. 조건부 렌더만 쓰면 나가는 길이 아예 없다(툭 사라진다). 그래서
 * `open` 이 false 가 되어도 퇴장 전이가 끝날 때까지 DOM 에 남긴다.
 *
 * 높이를 px 로 쓰는 이유는 `.ai-row-disclosure` 주석에 있다 — 요약하면 `auto`
 * 는 보간이 안 되고 `0fr↔1fr` 는 내용 교체(초안 폼 → 저장됨 확인)를 못 탄다.
 * ResizeObserver 로 실제 콘텐츠 높이를 계속 써 넣으면 열림·닫힘·교체·리플로우가
 * 전부 같은 커브를 지난다.
 *
 * 영구 마운트를 쓰지 않는 이유: 접힌 행의 본문(입력칸 등)이 스크린 리더와 탭
 * 순서에 남는다. 보이지 않는 것은 읽히지도 않아야 한다.
 */
export function useRowDisclosure(open: boolean): {
  /** DOM 에 그려야 하는가 — 접히는 동안(퇴장 전이)에도 true. */
  mounted: boolean;
  open: boolean;
  /** `.ai-row-disclosure` 박스 (높이를 전이하는 쪽). */
  boxRef: React.RefObject<HTMLDivElement | null>;
  /** `.ai-row-disclosure-body` 내용 (실제 높이의 출처). */
  contentRef: React.RefObject<HTMLDivElement | null>;
} {
  const [mounted, setMounted] = useState(open);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // 이전 커밋의 열림 상태. `null` = 아직 한 번도 안 그렸다 → 그 커밋은 "상태"
  // 이지 "전이" 가 아니다. 이미 열린 행이 화면에 나타나며 스스로 펼쳐지는
  // 연출은 사용자가 시킨 적 없는 움직임이다.
  const previousOpenRef = useRef<boolean | null>(null);

  // 열림 요청은 같은 커밋에서 마운트한다 — 한 프레임 뒤에 내용이 생기면
  // 클릭과 반응 사이에 빈 칸이 보인다.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return undefined;
    // 퇴장 — 전이가 끝난 뒤에 언마운트. 지속시간은 CSS 토큰이 진실원이라
    // 여기에 ms 를 복제하지 않고 읽어 온다(복제하면 조용히 갈라진다).
    const timer = window.setTimeout(() => setMounted(false), readDisclosureExitMs());
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    // 직전 값 기록은 **박스 유무보다 먼저** 한다. 닫혀 있는 동안은 박스가
    // 언마운트라, 이 갱신이 아래 guard 뒤에 있으면 `previous` 가 영원히 `null`
    // 로 남는다 — 그러면 사용자가 연 것(닫힘 → 열림)까지 "최초 마운트" 로
    // 오판해 애니메이션이 죽는다. 2026-07-28 에 실제로 그렇게 회귀했고
    // `use-row-disclosure.test.tsx` 의 "닫힘 → 열림" 케이스가 잡았다.
    const previous = previousOpenRef.current;
    previousOpenRef.current = open;

    const box = boxRef.current;
    if (!box) return undefined;
    const content = contentRef.current;
    const isTransition = previous !== null && previous !== open;

    if (!open) {
      // 닫힘 — 출발점을 실측 px 로 못박고 나서 0 으로. `auto` 에서 출발하면
      // 브라우저가 보간할 시작값을 갖지 못해 그냥 사라진다.
      if (isTransition) {
        box.style.height = `${box.scrollHeight}px`;
        forceReflow(box);
      }
      box.style.height = '0px';
      return undefined;
    }

    if (!content) return undefined;

    if (!isTransition) {
      // **마운트는 전이가 아니다** — 위 주석대로 이미 열린 행이 스스로 펼쳐지는
      // 연출은 하지 않는다. 그러면 여기서 높이를 잴 이유도 없다: `auto` 로 두면
      // 내용이 알아서 자리를 차지하고 잘림도 없다.
      //
      // 재면 무엇이 나빠지나 (2026-07-28 트레이스 실측): `offsetHeight` 는
      // 스타일 쓰기 **직후의 레이아웃 읽기**라 강제 리플로우다. 데이터시트에는
      // 이런 행이 여럿이고 각자 자기 effect 에서 이 짓을 하므로 레이아웃
      // 스래싱이 된다 — 노드 클릭 1회의 강제 리플로우 **62ms 중 61ms** 가
      // 이 훅이었다(Chrome ForcedReflow 인사이트, 최상위 원인).
      //
      // ResizeObserver 도 여기서는 달지 않는다. 그건 px 로 **못박은** 높이가
      // 내용 변화에 잘리는 것을 막으려고 있는 것인데, `auto` 는 애초에 안
      // 잘린다. 첫 토글(= 진짜 전이)이 그때 재고 그때 관찰을 시작한다.
      box.style.height = 'auto';
      return undefined;
    }

    box.style.height = '0px';
    forceReflow(box);
    box.style.height = `${content.offsetHeight}px`;

    if (typeof ResizeObserver === 'undefined') return undefined;
    // 내용이 바뀌거나(저장 성공: 입력 폼 → 확인 줄, 캡션 3줄 → 1줄) 폭이
    // 바뀌어 줄 수가 달라져도 같은 커브를 탄다 — 높이를 한 번 재고 고정해 두면
    // 그 순간부터 잘림이 시작된다.
    const observer = new ResizeObserver(() => {
      box.style.height = `${content.offsetHeight}px`;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [open, mounted]);

  return { mounted, open, boxRef, contentRef };
}

/** 시작값을 브라우저에 확정시킨다 — 이 읽기가 없으면 두 스타일 쓰기가 한
 *  프레임에 합쳐져 전이가 통째로 건너뛰어진다. */
function forceReflow(element: HTMLElement): void {
  void element.getBoundingClientRect().height;
}

/**
 * 퇴장 지속시간 — `--motion-base` 가 단일 진실원이고 JS 는 그것을 **읽는다**.
 * 모듈 레벨 캐시: 토큰은 런타임에 바뀌지 않고, 행마다 getComputedStyle 을
 * 부르면 펼칠 때마다 레이아웃을 강제로 계산하게 된다.
 */
let disclosureExitMs: number | null = null;
export function readDisclosureExitMs(): number {
  if (disclosureExitMs !== null) return disclosureExitMs;
  const fallback = 180;
  if (typeof window === 'undefined') return fallback;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-base')
    .trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  disclosureExitMs = raw.endsWith('ms') ? value : value * 1000;
  return disclosureExitMs;
}
