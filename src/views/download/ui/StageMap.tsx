'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { TopologyMapV2, clearTopologyV2TokensCache } from '@/widgets/topology-map-v2';
import { buildStageGraph, type StageGraph } from '../lib/stage-graph';

/**
 * 무대가 그리는 그래프 — **캡션과 지도가 같은 객체를 본다**.
 *
 * 예전엔 지도가 이 파생 그래프를 그리는 동안 캡션은 빌드 스크립트가 센
 * frontmatter 파일 수(`DOGFOOD_CENSUS`, 96)를 적었다. 같은 화면에 두 정의가
 * 있었고, 실측하면 지도의 노드는 **287** 이었다 — 캡션이 3배 작게 말한 것이다.
 * 캡션은 자기가 설명하는 그림을 세야 한다.
 *
 * `useDogfoodInsight` 는 로케일별 메모 캐시라 두 곳에서 불러도 파생은 1회다.
 */
export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}

/**
 * 무대의 지도 — **진짜 엔진이다** (2026-07-28 소유자 지시:
 * *"우리 실제가 훨씬 예쁘고 … 우측에서 드래그하면 움직이게 하고싶음 실제처럼,
 * 사용하는것처럼"*).
 *
 * ## 정적 초상을 버린 이유
 *
 * 직전 판은 빌드 시점에 구운 SVG 초상이었다. 논리는 맞았지만("관문에 두 번째
 * 워크벤치를 만들지 않는다") **틀린 것을 최적화한 것**이었다 — 이 페이지의 일이
 * 서비스를 파는 것이라면, 파는 물건을 **실제로 만져 보게 하는 것**보다 강한
 * 논증이 없다. 손으로 그린 닮은꼴은 아무리 다듬어도 진짜보다 못하고, 방문자는
 * 그 차이를 정확히 알아본다.
 *
 * ## 그래서 무엇을 지키나
 *
 * 관문이 워크벤치가 되지 않게 하는 것은 **엔진을 안 쓰는 것**이 아니라
 * **크롬을 안 붙이는 것**이었다. 그래서 여기엔 INDEX 패널도 상세 데이터시트도
 * 컨트롤 바도 없다. 남는 것은 지도 자체의 촉감 — 끌면 밀리고, 관성으로 정착하고,
 * 노드를 누르면 그 노드로 초점이 잡히는 것까지. 그 이상을 하고 싶어진 사람의
 * 목적지는 판 안의 「웹에서 지도 열기」와 앱이다.
 *
 * ## 데이터
 *
 * 그래프는 위 `useStageGraph()` 가 만들어 **캡션과 공유**한다 — 캡션이 세는
 * 숫자와 여기 그려지는 점이 같은 객체여야 이 페이지의 정직성 계약이 성립한다.
 *
 * `useDogfoodInsight()` 로 **출처를 고정**한다. `useOntologyInsight()` 는 세션의
 * 선택(로컬 볼트 · 스토어프론트 샘플)을 따라가는데, 그러면 캡션이 "이 저장소의
 * docs/ontology · 96 개념" 이라고 적어 둔 채 스토어프론트 7 노드를 그리는 일이
 * 생긴다(실측 2026-07-28, 첫 엔진 마운트). 무대가 주장하는 것과 그리는 것은
 * 같은 볼트여야 한다.
 */
export function StageMap({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download');
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * 접힌 자식 무리를 펼친 부모들. **이 상태가 없으면 클러스터 칩(`+17`)이
   * 죽은 어포던스가 된다** — 엔진은 칩을 누를 수 있게 그리는데 받는 쪽이
   * 없으면 눌러도 아무 일이 없다(실측 2026-07-28, 첫 엔진 마운트). 누를 수
   * 있게 생긴 것은 눌리거나, 그렇게 생기지 않아야 한다.
   *
   * URL 왕복은 하지 않는다 — 관문의 지도는 공유되는 상태가 아니라 만져 보는
   * 물건이라, 펼침은 이 화면을 떠나면 사라져도 되는 세션 상태다.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * 첫 지도 연출 토큰 — **엔진이 이미 가진 안무를 관문에서 깨우는 것**이다
   * (모션석 판정 2026-07-29).
   *
   * `use-topology-loop.ts` 의 P3d(E1) 연출은 전 노드를 project 노드 홈에
   * 모았다가 호밍 스프링(임계감쇠, reduced-motion 스냅 내장)으로 제자리에
   * 정착시킨다. 신규 모션 계약이 0인 기존 기제인데, 여기서 `revealToken={1}`
   * 을 **상수로** 넘기고 있어서 한 번도 발화한 적이 없었다 — 엔진의 비교
   * 기준(`lastRevealTokenRef`)이 0 으로 시작하므로 첫 마운트가 그 증가를
   * 그대로 삼킨다. 그 결과 p(t) 실측에서 캔버스가 **1프레임 하드컷**으로
   * 완성된 지도를 내놓았다(첫 유효 프레임 diff 5042/5044).
   *
   * 이 페이지의 유일한 판매 논증이 "이건 그림이 아니라 살아 있는 엔진" 인데
   * 도착하는 순간이 죽은 그림이면 그 논증이 첫 프레임에서 무너진다. 정착이
   * 보이는 것이 곧 물리의 증명이다.
   *
   * rAF 한 틱을 기다리는 이유: 월드·루프가 준비된 **뒤에** 0→1 전이가 보여야
   * 한다. 같은 프레임에 올리면 마운트가 다시 삼킨다.
   */
  const [revealToken, setRevealToken] = useState(0);

  /**
   * 관문 토큰 스코프를 켠다 — `app/globals.css` 의 `html[data-gateway-stage]`.
   *
   * 왜 루트 속성인가: 캔버스 토큰 리더는 `document.documentElement` 의
   * computed style 을 **1회 읽고 전역 캐시**한다. 그래서 이 컴포넌트의
   * 컨테이너에 클래스를 걸면 색은 CSS 로 상속돼 바뀌는 것처럼 보이지만
   * 카메라 상한 같은 **숫자 토큰은 리더를 통해서만 전달**되므로 아무 일도
   * 일어나지 않는다(실측 2026-07-28: 잉크만 밝아지고 지도 크기는 1픽셀도
   * 안 변했다). 저장소 선례가 `html[data-topology-index="collapsed"]` 로
   * 같은 구조를 이미 쓴다.
   *
   * 언마운트에서 반드시 되돌린다 — 안 그러면 클라이언트 내비게이션으로
   * `/topology` 에 갔을 때 워크벤치가 관문의 카메라 상한을 물려받는다.
   *
   * ⚠️ **지도를 이 effect **뒤에** 마운트해야 한다.** React 는 자식 effect 를
   * 부모보다 먼저 돌리므로, 지도를 같은 렌더에 그리면 **속성이 걸리기 전에**
   * 토큰을 읽고 전역 캐시에 굳힌다 — 캐시를 지운 뒤엔 다시 읽을 계기가 없다.
   * 실측(2026-07-28): 잉크 색은 CSS 상속으로 밝아졌는데 카메라 상한만 옛
   * 값이라 지도 크기가 두 번 연속 1픽셀도 안 변했다. `scoped` 게이트가
   * 그 순서를 강제한다.
   */
  const [scoped, setScoped] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-gateway-stage', '');
    clearTopologyV2TokensCache();
    // 이 setState 가 곧 **순서 계약**이다. 지도를 같은 렌더에 그리면 React 가
    // 자식 effect 를 먼저 돌려 **속성이 걸리기 전에** 토큰을 읽고 전역 캐시에
    // 굳힌다(실측 2026-07-28: 카메라 상한만 옛 값이라 지도가 두 번 연속
    // 1픽셀도 안 커졌다). 렌더를 한 번 더 도는 비용으로 그 경합을 없앤다 —
    // 대안은 렌더 중 DOM 을 만지는 것뿐이라 더 나쁘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScoped(true);
    return () => {
      root.removeAttribute('data-gateway-stage');
      clearTopologyV2TokensCache();
    };
  }, []);

  useEffect(() => {
    if (!scoped) return;
    // rAF 콜백이라 effect 본문의 동기 setState 가 아니다 — 억제 불필요.
    const id = requestAnimationFrame(() => setRevealToken(1));
    return () => cancelAnimationFrame(id);
  }, [scoped]);

  const toggleCluster = useCallback((parentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  // 스코프가 켜지기 전에는 지도를 그리지 않는다 (위 주석의 순서 계약).
  if (!scoped || graph.nodes.length === 0) return null;

  return (
    <div className="download-stage-map absolute inset-0" data-testid="download-stage-map">
      <TopologyMapV2
        nodes={graph.nodes}
        edges={graph.edges}
        focus={{ selectedSlug: selected }}
        // 관문에는 "지도 맞추기" 버튼이 없으므로 토큰은 마운트 1회로 고정한다.
        fitViewToken={1}
        relayoutToken={1}
        revealToken={revealToken}
        onSelect={setSelected}
        onPaneClick={() => setSelected(null)}
        expandedParents={expanded}
        onToggleCluster={toggleCluster}
        clusterHint={t('stageClusterHint')}
        canvasLabel={t('stageMapLabel')}
        // 관문은 스크롤하는 문서다 — 휠과 세로 스와이프는 페이지 것이고,
        // 줌은 명시적 핀치에만. 드래그 팬과 클릭은 그대로 지도 것이다.
        wheelIntent="page-scroll"
        // 관문 세션은 워크벤치보다 짧고, 이 표면에는 혜성이 나르는 읽기 과업이
        // 없다 — 손 안에서는 살아 있고 내려놓으면 몇 초 안에 식는다.
        ambientSleepDelayMs={3000}
      />
    </div>
  );
}
