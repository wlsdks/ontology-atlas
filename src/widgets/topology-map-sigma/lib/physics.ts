import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

/**
 * d3-force 스프링-질량 시뮬레이션. Sigma는 그래프의 x/y 속성을 그대로 읽어
 * 렌더링하므로 여기서 매 tick마다 sim 노드의 좌표를 graphology로 복사하면
 * 별도 이벤트 없이 화면이 반응한다.
 *
 * 옵시디언 스타일 감각을 위한 파라미터 선택:
 * - charge(repulsion): 노드 간 거리감. 너무 약하면 겹치고 너무 강하면 떠밀려
 *   나감.
 * - link distance: 연결된 노드 사이의 "이상적" 스프링 길이.
 * - collide radius: 충돌 반사 반경. 노드 size × 상수. 여기가 "부딪히는" 감각의
 *   핵심.
 * - velocityDecay: 감쇠. 0.4 = 손 떠났을 때 미끄러지듯 정착. 너무 크면 뻣뻣,
 *   너무 작으면 무한 발진.
 */
interface SimNode extends SimulationNodeDatum {
  id: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface PhysicsController {
  /** 드래그 시작: 해당 노드 pin + 시뮬레이션 깨움. */
  pin: (nodeId: string, x: number, y: number) => void;
  /** 드래그 중 mouse 이동: pin 위치 업데이트. */
  drag: (nodeId: string, x: number, y: number) => void;
  /** 드래그 종료: pin 해제. velocity는 유지돼 자연스럽게 미끄러지며 정지. */
  release: (nodeId: string) => void;
  /** 드래그 시작: 연결된 의미 그룹을 한 덩어리로 pin. */
  pinGroup: (positions: ReadonlyMap<string, { x: number; y: number }>) => void;
  /** 드래그 중: 연결 그룹 전체 pin 위치 업데이트. */
  dragGroup: (positions: ReadonlyMap<string, { x: number; y: number }>) => void;
  /** 드래그 종료: 연결 그룹 전체 pin 해제. */
  releaseGroup: (nodeIds: Iterable<string>) => void;
  /** 사용자 Forces 패널에서 실시간 튜닝. 지정한 값만 반영, 나머지 유지. */
  tune: (opts: {
    repel?: number;
    linkDistance?: number;
    collideMultiplier?: number;
  }) => void;
  /** "자동 정렬" — alpha를 1로 올려 전체 시뮬레이션이 다시 settle되게 한다.
   *  드래그 중 고정된 위치는 건드리지 않고, fx/fy 없는 자유 노드만 다시 배치된다.
   *  `opts.meteor` 가 true 면 (기본) 중심에서 멀리 떨어진 outlier 노드들을 먼저
   *  "별똥별" 트윈으로 스태거 + easeOutCubic 으로 집결 반경까지 날린 뒤 reheat. */
  reheat: (opts?: { meteor?: boolean }) => void;
  /** 컴포넌트 언마운트 시 호출. */
  stop: () => void;
}

export function startPhysics(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  onTick?: () => void,
  options: { autoStart?: boolean; initialAlpha?: number } = {},
): PhysicsController {
  const simNodes: SimNode[] = [];
  const simNodeById = new Map<string, SimNode>();
  graph.forEachNode((id, attrs) => {
    const node: SimNode = { id, x: attrs.x, y: attrs.y };
    simNodes.push(node);
    simNodeById.set(id, node);
  });

  const simLinks: SimLink[] = [];
  graph.forEachEdge((_edge, _attrs, source, target) => {
    if (source === target) return;
    simLinks.push({ source, target });
  });

  // collide radius를 사전 계산해서 매 tick마다 attribute lookup 하지 않도록
  // 캐시. 500노드 × 60fps = 30K getNodeAttributes 호출을 제거.
  const collideRadiusById = new Map<string, number>();
  for (const node of simNodes) {
    collideRadiusById.set(node.id, (graph.getNodeAttributes(node.id).size ?? 4) + 4);
  }

  const sim: Simulation<SimNode, SimLink> = forceSimulation(simNodes)
    .velocityDecay(0.4)
    .alphaDecay(0.035)
    .alphaMin(0.002)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(70)
        .strength(0.45),
    )
    .force('charge', forceManyBody<SimNode>().strength(-320).distanceMax(700))
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => collideRadiusById.get(d.id) ?? 8)
        .strength(1)
        .iterations(1),
    )
    .force('center', forceCenter(0, 0).strength(0.03))
    .on('tick', () => {
      // 옵시디언이 렉 없는 핵심 비결: 이벤트 방출을 최소화한다. graphology의
      // 개별 setNodeAttribute는 호출마다 'nodeAttributesUpdated' 이벤트를
      // 발행하고 Sigma가 매번 반응해서 500노드 × 60fps = 30K 이벤트/sec가 된다.
      // updateEachNodeAttributes는 배치 API라 단 1회 'eachNodeAttributesUpdated'
      // 이벤트만 발행 → Sigma 재렌더 비용 1/500.
      graph.updateEachNodeAttributes((id, attrs) => {
        const node = simNodeById.get(id);
        if (!node || node.x === undefined || node.y === undefined) return attrs;
        attrs.x = node.x;
        attrs.y = node.y;
        return attrs;
      });
      onTick?.();
    });

  // 초기 self-settling 은 작은 그래프에서만 유리하다. 큰 vault 에서는 mount 직후
  // 메인 스레드와 WebGL refresh 를 계속 점유해 "토폴로지가 느리다"는 체감을
  // 만든다. 큰 그래프는 정적 초기 배치로 먼저 보여주고, 드래그/자동 정렬 때만
  // 시뮬레이션을 깨운다.
  if (options.autoStart === false) {
    sim.stop();
    sim.alpha(options.initialAlpha ?? 0.35).alphaTarget(0);
  } else {
    sim.alpha(options.initialAlpha ?? 0.85).alphaTarget(0).restart();
  }

  const pinNode = (nodeId: string, x: number, y: number) => {
    const node = simNodeById.get(nodeId);
    if (!node) return;
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
  };

  const releaseNode = (nodeId: string) => {
    const node = simNodeById.get(nodeId);
    if (!node) return;
    node.fx = null;
    node.fy = null;
  };

  return {
    pin: (nodeId, x, y) => {
      pinNode(nodeId, x, y);
      sim.alphaTarget(0.35).restart();
    },
    drag: (nodeId, x, y) => {
      pinNode(nodeId, x, y);
      sim.alpha(Math.max(sim.alpha(), 0.18)).restart();
    },
    release: (nodeId) => {
      releaseNode(nodeId);
      sim.alpha(Math.max(sim.alpha(), 0.12)).alphaTarget(0).restart();
    },
    pinGroup: (positions) => {
      positions.forEach((pos, nodeId) => pinNode(nodeId, pos.x, pos.y));
      sim.alphaTarget(0.35).restart();
    },
    dragGroup: (positions) => {
      positions.forEach((pos, nodeId) => pinNode(nodeId, pos.x, pos.y));
      sim.alpha(Math.max(sim.alpha(), 0.18)).restart();
    },
    releaseGroup: (nodeIds) => {
      for (const nodeId of nodeIds) releaseNode(nodeId);
      sim.alpha(Math.max(sim.alpha(), 0.12)).alphaTarget(0).restart();
    },
    tune: ({ repel, linkDistance, collideMultiplier }) => {
      let needsRestart = false;
      if (repel !== undefined) {
        (sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>>)?.strength(repel);
        needsRestart = true;
      }
      if (linkDistance !== undefined) {
        (sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>)?.distance(
          linkDistance,
        );
        needsRestart = true;
      }
      if (collideMultiplier !== undefined) {
        (sim.force('collide') as ReturnType<typeof forceCollide<SimNode>>)?.radius((d) => {
          const base = collideRadiusById.get(d.id) ?? 8;
          return base * collideMultiplier;
        });
        needsRestart = true;
      }
      if (needsRestart) {
        sim.alpha(Math.max(sim.alpha(), 0.25)).alphaTarget(0).restart();
      }
    },
    reheat: (opts) => {
      const meteor = opts?.meteor !== false;
      if (!meteor) {
        sim.alpha(1).alphaTarget(0).restart();
        return;
      }

      // 중심 (0,0) 기준 현재 거리 분포에서 p90을 "정상 군집 반경"으로 본다.
      // 1.3 × p90 이상으로 떨어진 노드를 outlier 로 간주하고 별똥별로 복귀.
      // drag-pin (fx/fy 지정) 된 노드는 사용자가 아직 잡고 있는 중이므로 제외.
      const positions: { id: string; x: number; y: number; dist: number }[] = [];
      for (const node of simNodes) {
        if (node.fx != null || node.fy != null) continue;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        positions.push({ id: node.id, x, y, dist: Math.hypot(x, y) });
      }
      if (positions.length === 0) {
        sim.alpha(1).alphaTarget(0).restart();
        return;
      }

      const sortedDists = positions.map((p) => p.dist).sort((a, b) => a - b);
      const p90 = sortedDists[Math.floor(sortedDists.length * 0.9)] || 0;
      // 매우 작은 그래프 (뭉쳐 있는 경우) 에서는 임계값을 최소 200 으로 두어
      // 과민한 meteor trigger 를 막는다.
      const threshold = Math.max(p90 * 1.3, 200);
      const outliers = positions
        .filter((p) => p.dist > threshold)
        .sort((a, b) => b.dist - a.dist); // 가장 먼 노드부터 출발해 뒤늦게 도착

      if (outliers.length === 0) {
        sim.alpha(1).alphaTarget(0).restart();
        return;
      }

      // meteor 준비 — sim 정지 후 각 outlier 를 fx/fy 로 pin 하고 직접 트윈.
      sim.stop();
      const targetRadius = Math.max(p90 * 0.85, 120);
      const durationMs = 900;
      const staggerMs = Math.min(90, Math.floor(500 / outliers.length) + 30);
      const flights = outliers.map((o, i) => {
        const angle = Math.atan2(o.y, o.x);
        return {
          id: o.id,
          startX: o.x,
          startY: o.y,
          targetX: Math.cos(angle) * targetRadius,
          targetY: Math.sin(angle) * targetRadius,
          delay: i * staggerMs,
        };
      });
      const totalMs = durationMs + flights[flights.length - 1].delay;
      const start = performance.now();

      // 트윈 중에는 sim 이 좌표를 덮어쓰지 않도록 fx/fy 로 고정.
      for (const f of flights) {
        const node = simNodeById.get(f.id);
        if (!node) continue;
        node.fx = f.startX;
        node.fy = f.startY;
      }

      const flightById = new Map(flights.map((f) => [f.id, f]));

      const step = () => {
        const elapsed = performance.now() - start;
        // 배치 API 로 한 번에 업데이트 — Sigma 는 'eachNodeAttributesUpdated'
        // 이벤트 한 번만 받는다.
        graph.updateEachNodeAttributes((id, attrs) => {
          const f = flightById.get(id);
          if (!f) return attrs;
          const local = Math.max(0, Math.min(1, (elapsed - f.delay) / durationMs));
          // easeOutCubic — 멀리서 빠르게 출발해 부드럽게 감속하는 별똥별 감각.
          const t = 1 - Math.pow(1 - local, 3);
          const x = f.startX + (f.targetX - f.startX) * t;
          const y = f.startY + (f.targetY - f.startY) * t;
          attrs.x = x;
          attrs.y = y;
          const node = simNodeById.get(id);
          if (node) {
            node.fx = x;
            node.fy = y;
            node.x = x;
            node.y = y;
          }
          return attrs;
        });
        onTick?.();

        if (elapsed < totalMs) {
          requestAnimationFrame(step);
          return;
        }
        // 착륙 — pin 해제 후 sim reheat. 자유 노드와 함께 자연스럽게 정착.
        for (const f of flights) {
          const node = simNodeById.get(f.id);
          if (!node) continue;
          node.fx = null;
          node.fy = null;
        }
        sim.alpha(1).alphaTarget(0).restart();
      };
      requestAnimationFrame(step);
    },
    stop: () => {
      sim.stop();
    },
  };
}
