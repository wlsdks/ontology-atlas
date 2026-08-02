"use client";

import { useId } from "react";
import { cn } from "@/shared/lib/cn";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";

/**
 * 한 개념과 **바로 옆 이웃**의 작은 그림. 지도가 아니라 조회용 미리보기다.
 *
 * 지도와 **같은 실루엣**을 쓴다 — 육각=프로젝트 · 둥근사각=도메인 · 원=역량 ·
 * 사각=요소. 색이 아니라 형태가 종류를 나른다(헌장: Kind = shape, not color).
 * 선은 두 갈래: 실선 = 담음/속함, 점선 = 기댐/쓰임.
 *
 * 여기서 SVG 를 직접 그리는 이유는 `TopologyV2KindGlyph` 가 **DOM 글리프**라
 * 좌표계 안에 놓을 수 없기 때문이다. 실루엣의 정의는 그 게이트웨이가 계속
 * 진실원이고, 이 파일은 같은 매핑을 좌표계로 옮긴 것뿐이다 —
 * `node-kind-shape-parity` 계약이 지키는 그 매핑에서 벗어나면 안 된다.
 */

/** 부채 하나에 보이는 이웃 상한. 넘으면 「외 N」 알약. */
const FAN_CAP = 7;
/** 이웃이 많을수록 라벨이 붙는다 — 자르는 길이를 밀도에 맞춘다. */
function labelCap(slots: number): number {
  if (slots > 12) return 9;
  if (slots > 8) return 12;
  return 16;
}

const VIEW_W = 660;
const VIEW_H = 345;

type Geometry = {
  self: Record<string, number>;
  neighbor: Record<string, number>;
  ringMin: number;
  ringMax: number;
  ex: number;
  ey: number;
};

/**
 * 기하는 **토큰이 정한다**(`--git-ego-*`). 컴포넌트가 숫자를 들고 있으면 그
 * 값이 어디서 왔는지 다음 사람이 못 찾는다.
 */
function readGeometry(el: Element | null): Geometry {
  const read = (name: string, fallback: number) => {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    self: {
      project: read("--git-ego-r-self-project", 25),
      domain: read("--git-ego-r-self-domain", 21),
      capability: read("--git-ego-r-self-capability", 16),
      element: read("--git-ego-r-self-element", 13.5),
    },
    neighbor: {
      project: read("--git-ego-r-nb-project", 14),
      domain: read("--git-ego-r-nb-domain", 12),
      capability: read("--git-ego-r-nb-capability", 9.5),
      element: read("--git-ego-r-nb-element", 8),
    },
    ringMin: read("--git-ego-ring-min", 74),
    ringMax: read("--git-ego-ring-max", 126),
    ex: read("--git-ego-ellipse-x", 1.52),
    ey: read("--git-ego-ellipse-y", 0.8),
  };
}

function radiusOf(map: Record<string, number>, kind: string): number {
  return map[kind] ?? map.element;
}

/** 지도와 같은 매핑. `document` 등 지도에 없는 kind 는 요소로 접는다. */
function NodeShape({
  kind,
  x,
  y,
  r,
  selected,
}: {
  kind: string;
  x: number;
  y: number;
  r: number;
  selected?: boolean;
}) {
  const resolved = ["project", "domain", "capability", "element"].includes(kind)
    ? kind
    : "element";
  const style = {
    fill: `var(--topology-v2-node-fill-${resolved})`,
    stroke: selected
      ? "var(--color-indigo-accent)"
      : `var(--topology-v2-node-stroke-${resolved})`,
    strokeWidth: selected ? 1.6 : 1.15,
  };
  if (resolved === "project") {
    const points = [0, 60, 120, 180, 240, 300]
      .map((deg) => {
        const t = ((deg - 90) * Math.PI) / 180;
        return `${(x + r * Math.cos(t)).toFixed(1)},${(y + r * Math.sin(t)).toFixed(1)}`;
      })
      .join(" ");
    return <polygon points={points} style={style} />;
  }
  if (resolved === "capability") {
    return <circle cx={x} cy={y} r={r} style={style} />;
  }
  const side = r * 1.72;
  return (
    <rect
      x={x - side / 2}
      y={y - side / 2}
      width={side}
      height={side}
      rx={resolved === "domain" ? r * 0.34 : r * 0.2}
      style={style}
    />
  );
}

const DASHED: readonly EgoBearing[] = ["dependsOn", "usedBy"];

export function ConceptEgoGraph({
  ego,
  bearingLabel,
  moreLabel,
  onSelect,
  className,
}: {
  ego: ConceptEgo;
  /** 방위 이름 — i18n 은 호출부가 진다(위젯은 문구를 만들지 않는다). */
  bearingLabel: (bearing: EgoBearing) => string;
  moreLabel: (count: number) => string;
  onSelect?: (nodeId: string) => void;
  className?: string;
}) {
  const gradientId = useId();
  const geometry = readGeometry(
    typeof document === "undefined" ? null : document.documentElement,
  );

  const groups = EGO_BEARINGS.map((bearing) => {
    const all = ego.neighbors[bearing];
    const shown = all.slice(0, FAN_CAP);
    return {
      bearing,
      all,
      shown,
      rest: all.length - shown.length,
      slots: shown.length + (all.length > shown.length ? 1 : 0),
    };
  }).filter((g) => g.all.length > 0);

  if (groups.length === 0) return null;

  const slotTotal = groups.reduce((sum, g) => sum + g.slots, 0);
  const maxSlots = Math.max(...groups.map((g) => g.slots), 1);
  /*
   * 방위를 고정하면 이웃이 한 종류뿐인 개념에서 화면 3/4 가 빈다(실측: 담고
   * 있는 것 17 · 나머지 0). 그래서 **몫으로 나눈다** — 각 관계가 자기 개수에
   * 비례한 부채를 갖고 그 합이 원 전체다. 순서는 고정이라 개념을 바꿔도
   * 방향이 안 흔들린다.
   */
  const gap = groups.length > 1 ? 10 : 0;
  const usable = 360 - gap * groups.length;
  const ring = Math.max(
    geometry.ringMin,
    Math.min(geometry.ringMax, 58 + (slotTotal <= 2 ? 26 : 0) + maxSlots * 11),
  );
  const stagger = slotTotal > 12 ? 36 : slotTotal > 4 ? 22 : 0;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;

  const edges: React.ReactNode[] = [];
  const marks: React.ReactNode[] = [];
  let cursor = -90 - ((groups[0].slots / slotTotal) * usable + gap) / 2;

  for (const group of groups) {
    const span = (group.slots / slotTotal) * usable;
    const cap = labelCap(group.slots);
    /*
     * 부채가 **원 전체**를 차지할 때(관계가 한 종류뿐)는 양 끝이 같은 각도다.
     * `i/(slots-1)` 로 나누면 첫 슬롯과 끝 슬롯이 정확히 겹쳐 이웃 하나가
     * 다른 하나 밑에 숨는다 — 화면은 「담고 있는 것 3」이라 써 놓고 둘만
     * 그렸다(실측 2026-08-02). 닫힌 원에서는 `slots` 로 나눈다.
     */
    const closed = groups.length === 1;
    for (let i = 0; i < group.slots; i += 1) {
      const ratio =
        group.slots === 1 ? 0.5 : closed ? i / group.slots : i / (group.slots - 1);
      const angle =
        ((cursor + gap / 2 + (group.slots === 1 ? span / 2 : span * ratio)) * Math.PI) / 180;
      const isMore = group.rest > 0 && i === group.slots - 1;
      const radius = ring + (i % 2) * stagger + (isMore ? 34 : 0);
      const x = cx + radius * Math.cos(angle) * geometry.ex;
      const y = cy + radius * Math.sin(angle) * geometry.ey;
      const dashed = DASHED.includes(group.bearing);
      edges.push(
        <path
          key={`edge-${group.bearing}-${i}`}
          d={`M${cx},${cy} L${x.toFixed(1)},${y.toFixed(1)}`}
          fill="none"
          stroke={
            dashed ? "var(--topology-v2-edge-depends)" : "var(--topology-v2-edge-contains)"
          }
          strokeWidth={1}
          strokeDasharray={dashed ? "3.5 3.5" : undefined}
          className="git-fade-in"
          style={{ ["--git-row-index" as string]: Math.min(i, 7) }}
        />,
      );
      if (isMore) {
        const width = 26 + String(group.rest).length * 6;
        marks.push(
          <g key={`more-${group.bearing}`}>
            <rect
              x={x - width / 2}
              y={y - 9}
              width={width}
              height={18}
              rx={9}
              fill="var(--color-overlay-2)"
              stroke="var(--color-border-soft)"
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              className="fill-[color:var(--color-text-tertiary)] text-caption"
            >
              {moreLabel(group.rest)}
            </text>
          </g>,
        );
        continue;
      }
      const neighbor = group.shown[i];
      const r = radiusOf(geometry.neighbor, neighbor.kind);
      const cos = Math.cos(angle);
      /*
       * 세로에 가까운 자리에서 라벨을 노드 위/아래(가운데 정렬)에 두면 이웃한
       * 두 슬롯의 라벨이 같은 높이에 쌓여 겹친다(실측). 거의 수직인 자리만
       * 가운데로 두고 나머지는 좌우로 뻗게 해 서로 비켜 가게 한다.
       */
      const right = cos > 0.04;
      const left = cos < -0.04;
      const label =
        neighbor.label.length > cap ? `${neighbor.label.slice(0, cap - 1)}…` : neighbor.label;
      marks.push(
        <g
          key={neighbor.id}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-label={neighbor.label}
          onClick={onSelect ? () => onSelect(neighbor.id) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(neighbor.id);
                  }
                }
              : undefined
          }
          className={cn("git-fade-in group/ego", onSelect && "cursor-pointer")}
          style={{ ["--git-row-index" as string]: Math.min(i, 7) }}
        >
          <title>{neighbor.label}</title>
          <NodeShape kind={neighbor.kind} x={x} y={y} r={r} />
          <text
            x={x + (right ? r + 8 : left ? -(r + 8) : 0)}
            y={y + (right || left ? 3.5 : Math.sin(angle) > 0 ? r + 15 : -(r + 9))}
            textAnchor={right ? "start" : left ? "end" : "middle"}
            className="fill-[color:var(--color-text-tertiary)] text-label group-hover/ego:fill-[color:var(--color-text-primary)]"
          >
            {label}
          </text>
          {onSelect ? (
            <circle cx={x} cy={y} r={r + 9} fill="transparent" />
          ) : null}
        </g>,
      );
    }
    // 방위 이름은 그림 밖 읽기표가 진다 — 여기 두면 상자를 넓혀 그림이 줄어든다.
    cursor += span + gap;
  }

  const selfRadius = radiusOf(geometry.self, ego.kind);

  return (
    <div className={cn("grid min-h-0 place-items-stretch bg-[color:var(--color-canvas)]", className)}>
      <svg
        key={ego.id}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`${ego.label} · ${bearingLabel("contains")} ${ego.total}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-[var(--git-ego-min-h)] w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--topology-v2-node-sheen-tint)" />
            <stop offset="1" stopColor="var(--topology-v2-node-fill-domain)" />
          </linearGradient>
        </defs>
        {edges}
        {marks}
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={selfRadius + 6}
            fill="none"
            stroke="var(--topology-v2-selection-ring-hairline)"
          />
          <NodeShape kind={ego.kind} x={cx} y={cy} r={selfRadius} selected />
          <text
            x={cx}
            y={cy + selfRadius + 18}
            textAnchor="middle"
            className="fill-[color:var(--color-text-primary)] text-body-lg font-semibold"
          >
            {ego.label.length > 22 ? `${ego.label.slice(0, 21)}…` : ego.label}
          </text>
        </g>
      </svg>
    </div>
  );
}
