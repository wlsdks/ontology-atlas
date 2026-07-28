'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { TopologyMapV2 } from '@/widgets/topology-map-v2';
import { buildStageGraph } from '../lib/stage-graph';

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
 * `useDogfoodInsight()` 로 **출처를 고정**한다. `useOntologyInsight()` 는 세션의
 * 선택(로컬 볼트 · 스토어프론트 샘플)을 따라가는데, 그러면 캡션이 "이 저장소의
 * docs/ontology · 96 개념" 이라고 적어 둔 채 스토어프론트 7 노드를 그리는 일이
 * 생긴다(실측 2026-07-28, 첫 엔진 마운트). 무대가 주장하는 것과 그리는 것은
 * 같은 볼트여야 한다.
 */
export function StageMap() {
  const t = useTranslations('download');
  const insight = useDogfoodInsight();
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

  const toggleCluster = useCallback((parentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const graph = useMemo(
    () => buildStageGraph(insight.nodes, insight.edges),
    [insight],
  );

  if (graph.nodes.length === 0) return null;

  return (
    <div className="absolute inset-0" data-testid="download-stage-map">
      <TopologyMapV2
        nodes={graph.nodes}
        edges={graph.edges}
        focus={{ selectedSlug: selected }}
        // 관문에는 "지도 맞추기" 버튼이 없으므로 토큰은 마운트 1회로 고정한다.
        fitViewToken={1}
        relayoutToken={1}
        revealToken={1}
        onSelect={setSelected}
        onPaneClick={() => setSelected(null)}
        expandedParents={expanded}
        onToggleCluster={toggleCluster}
        clusterHint={t('stageClusterHint')}
        canvasLabel={t('stageMapLabel')}
      />
    </div>
  );
}
