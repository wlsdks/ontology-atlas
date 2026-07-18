/**
 * 랜딩 히어로 topology 미니어처의 결정적 레이아웃.
 *
 * 실제 dogfood census (project 1 + domain N + hub capability) 를
 * SVG 좌표로 변환한다. 애니메이션 · 난수 0 — SSR/hydration 동일 결과.
 * 시각 언어는 B2+ (kind = shape): project hex 플레이트가 중앙,
 * domain 사각 칩이 링 위에, 허브 capability 원이 소유 domain 바깥에 앵커.
 */

export interface MiniatureCensus {
  domains: ReadonlyArray<{ slug: string; title: string }>;
  domainRelates: ReadonlyArray<ReadonlyArray<string>>;
  hub: { slug: string; title: string; domain: string | null } | null;
}

export interface MiniatureEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MiniatureLayout {
  width: number;
  height: number;
  project: { x: number; y: number };
  domains: Array<{ slug: string; title: string; x: number; y: number }>;
  relates: MiniatureEdge[];
  hub: {
    slug: string;
    title: string;
    x: number;
    y: number;
    anchor: { x: number; y: number };
  } | null;
}

const WIDTH = 440;
const HEIGHT = 320;
const RING_RADIUS = 100;
const HUB_OFFSET = 56;

export function buildMiniatureLayout(census: MiniatureCensus): MiniatureLayout {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  const domains = census.domains.map((domain, index) => {
    // 시작각 -60° — 정북/정남을 비워 hex 아래 project 라벨 레인과 위쪽
    // 허브 라벨이 chip trace 와 겹치지 않게 한다 (결정적, 난수 0).
    const angle = -Math.PI / 3 + (index * 2 * Math.PI) / Math.max(census.domains.length, 1);
    return {
      slug: domain.slug,
      title: domain.title,
      x: cx + Math.cos(angle) * RING_RADIUS,
      y: cy + Math.sin(angle) * RING_RADIUS,
    };
  });
  const bySlug = new Map(domains.map((d) => [d.slug, d]));

  const relates: MiniatureEdge[] = [];
  for (const pair of census.domainRelates) {
    const from = bySlug.get(pair[0] ?? "");
    const to = bySlug.get(pair[1] ?? "");
    if (!from || !to) continue;
    relates.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  }

  let hub: MiniatureLayout["hub"] = null;
  const owning = census.hub?.domain ? bySlug.get(census.hub.domain) : undefined;
  if (census.hub && owning) {
    const dx = owning.x - cx;
    const dy = owning.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    hub = {
      slug: census.hub.slug,
      title: census.hub.title,
      x: owning.x + (dx / length) * HUB_OFFSET,
      y: owning.y + (dy / length) * HUB_OFFSET,
      anchor: { x: owning.x, y: owning.y },
    };
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    project: { x: cx, y: cy },
    domains,
    relates,
    hub,
  };
}
