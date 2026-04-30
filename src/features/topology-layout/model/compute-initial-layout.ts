import {
  forceCollide,
  forceLink,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
// d3-force의 forceManyBody는 매 tick마다 Barnes-Hut 쿼드트리를 새로 만든다.
// d3-force-reuse (BSD-3, Two Six Labs)는 13틱마다 한 번만 재생성해 1000+ 노드
// 시뮬레이션에서 10–40% 속도 향상을 보여 준다. API는 forceManyBody와 호환.
import { forceManyBodyReuse } from 'd3-force-reuse';
import type { Project } from '@/entities/project';
import type { Category } from '@/entities/category';

export type TopologyLayoutMode = 'card' | 'compact';

/**
 * 카테고리 ID → Category 맵. CategoriesPage 의 seed 레이아웃 계산에 사용.
 * 카테고리가 없는 project는 fallback bbox(큰 중앙 영역)에 배치된다.
 *
 * CategoriesPage 가 카테고리 앵커를 바꿀 때 프로젝트 위치를 clustering
 * 기반으로 다시 배치하는 용도다. 공개 홈 토폴로지 렌더링은 Sigma/WebGL이
 * 담당하고, 이 파일은 Firestore에 저장할 초기 좌표만 계산한다.
 */
export type CategoryMap = Map<string, Category>;

interface SimNode extends SimulationNodeDatum {
  id: string;
  isHub: boolean;
  /** 카테고리별 중심점(top-left 기준) — cluster gravity 대상 */
  clusterX: number;
  clusterY: number;
  /** 이 노드가 머물 영역 bbox */
  bbox: ClusterBbox;
}

/** 프로젝트 노드 고정 크기 (구 ProjectNode의 w-[220px] h-[140px]). */
const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;
const HALF_NODE_WIDTH = NODE_WIDTH / 2;
const HALF_NODE_HEIGHT = NODE_HEIGHT / 2;
/** bbox 내부 여유 — 작을수록 노드가 박스 edge에 더 가까이 붙음. */
const INNER_PADDING = 8;

/** 카테고리가 맵에 없을 때 쓰는 안전 기본값 (중앙 넓은 영역). */
const FALLBACK_POSITION = { x: 0, y: 0 };
const FALLBACK_SIZE = { width: 1600, height: 1300 };

export interface ClusterBbox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 노드를 자기 클러스터 bbox 안으로 강제 clamp하는 hard boundary force.
 */
function createBoundaryForce() {
  let allNodes: SimNode[] = [];
  const force = () => {
    for (const n of allNodes) {
      const b = n.bbox;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      if (x < b.left) {
        n.x = b.left;
        n.vx = 0;
      } else if (x > b.right) {
        n.x = b.right;
        n.vx = 0;
      }
      if (y < b.top) {
        n.y = b.top;
        n.vy = 0;
      } else if (y > b.bottom) {
        n.y = b.bottom;
        n.vy = 0;
      }
    }
  };
  force.initialize = (nodes: SimNode[]) => {
    allNodes = nodes;
  };
  return force;
}

function anchorFor(categoryId: string, categoryMap: CategoryMap) {
  return categoryMap.get(categoryId)?.position ?? FALLBACK_POSITION;
}

function sizeFor(categoryId: string, categoryMap: CategoryMap) {
  return categoryMap.get(categoryId)?.size ?? FALLBACK_SIZE;
}

/**
 * 노드(top-left 기준)가 머물 수 있는 좌표 영역.
 * 노드 크기만큼 우하단을 보정해, 노드 전체가 배경 박스 안에 들어감.
 */
function getClusterBbox(categoryId: string, categoryMap: CategoryMap): ClusterBbox {
  const anchor = anchorFor(categoryId, categoryMap);
  const size = sizeFor(categoryId, categoryMap);
  const halfW = size.width / 2;
  const halfH = size.height / 2;
  return {
    left: anchor.x - halfW + INNER_PADDING,
    right: anchor.x + halfW - NODE_WIDTH - INNER_PADDING,
    top: anchor.y - halfH + INNER_PADDING,
    bottom: anchor.y + halfH - NODE_HEIGHT - INNER_PADDING,
  };
}

/**
 * 클러스터의 top-left 기준 중심점 — 노드 top-left가 이 위치일 때
 * 노드 center가 cluster anchor(visual box center)와 일치.
 */
function getClusterCenterForTopLeft(
  categoryId: string,
  categoryMap: CategoryMap,
): { x: number; y: number } {
  const anchor = anchorFor(categoryId, categoryMap);
  return {
    x: anchor.x - HALF_NODE_WIDTH,
    y: anchor.y - HALF_NODE_HEIGHT,
  };
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface NodePosition {
  x: number;
  y: number;
}

/**
 * project.position이 (0,0)이면 "아직 설정되지 않음"으로 간주한다.
 * admin이 명시적으로 놓은 좌표는 0,0에 겹치지 않도록 placement 로직이 보장.
 */
function hasExplicitPosition(p: Project): boolean {
  return p.position.x !== 0 || p.position.y !== 0;
}

/**
 * 초기 렌더 전에 force simulation을 동기적으로 돌려 카테고리 박스 안에서
 * 겹치지 않는 배치를 계산. admin 카테고리 편집 시 프로젝트 위치를 한 번에
 * 다시 배치할 때 쓴다.
 */
export function computeInitialLayout(
  projects: Project[],
  categoryMap: CategoryMap,
  viewMode: TopologyLayoutMode = 'card',
): Map<string, NodePosition> {
  const result = new Map<string, NodePosition>();
  if (projects.length === 0) return result;
  const compact = viewMode === 'compact';

  const nodes: SimNode[] = projects.map((p) => {
    const center = getClusterCenterForTopLeft(p.category, categoryMap);
    const pinned = hasExplicitPosition(p);
    const x = pinned ? p.position.x : center.x + (Math.random() - 0.5) * (compact ? 44 : 80);
    const y = pinned ? p.position.y : center.y + (Math.random() - 0.5) * (compact ? 44 : 80);
    return {
      id: p.slug,
      isHub: p.isHub,
      clusterX: center.x,
      clusterY: center.y,
      bbox: getClusterBbox(p.category, categoryMap),
      x,
      y,
      vx: 0,
      vy: 0,
      ...(pinned ? { fx: x, fy: y } : {}),
    };
  });
  const map = new Map(nodes.map((n) => [n.id, n]));

  const links: SimLink[] = [];
  for (const project of projects) {
    for (const dep of project.dependencies) {
      if (map.has(dep)) {
        links.push({ source: project.slug, target: dep });
      }
    }
  }

  const sim = forceSimulation<SimNode>(nodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(compact ? 180 : 320)
        .strength(compact ? 0.22 : 0.3),
    )
    .force(
      'charge',
      forceManyBodyReuse<SimNode>()
        .strength((d) => (d.isHub ? (compact ? -1500 : -3200) : compact ? -760 : -1800))
        .distanceMax(1200),
    )
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => (d.isHub ? (compact ? 76 : 205) : compact ? 58 : 185))
        .strength(1),
    )
    .force('clusterX', forceX<SimNode>((d) => d.clusterX).strength(compact ? 0.08 : 0.14))
    .force('clusterY', forceY<SimNode>((d) => d.clusterY).strength(compact ? 0.07 : 0.11))
    .force('boundary', createBoundaryForce())
    .stop();

  for (let i = 0; i < 700; i++) {
    sim.tick();
  }

  for (const n of nodes) {
    result.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  }
  return result;
}
