import { buildMiniDomainMapLayout, type MiniDomainMapInput } from "../model/mini-domain-map-layout";

interface Props {
  projectTitle: string;
  domains: MiniDomainMapInput[];
  ariaLabel: string;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * 히어로 밴드의 "정직한 미니 도메인 지도" — landing `VaultInstrument` 계기
 * 문법(project hex + kind-glyph 토큰 + engraved 숫자)을 프로젝트 상세로
 * 수출한 버전. 장식이 아니라 실카운트(역량+요소)에서 나온 SVG — 폭은
 * `buildMiniDomainMapLayout` 의 sqrt 스케일 그대로다. 그 스케일은 **순서**를
 * 보장하고 비례는 보장하지 않는다(이유·실측은 그 파일의 주석).
 */
export function MiniDomainMap({ projectTitle, domains, ariaLabel }: Props) {
  const layout = buildMiniDomainMapLayout(domains);

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={ariaLabel}
      className="mt-1.5 block h-[148px] w-full"
    >
      {layout.nodes.map((node) => (
        <line
          key={`edge-${node.id}`}
          x1={layout.center.x}
          y1={layout.center.y}
          x2={node.x}
          y2={node.y}
          stroke="var(--kind-glyph-edge-contains)"
          strokeWidth={1}
        />
      ))}

      <polygon
        points={hexPoints(layout.center.x, layout.center.y, 17)}
        fill="var(--kind-glyph-fill-project)"
        stroke="var(--kind-glyph-stroke-project)"
        strokeWidth={1.5}
      />
      <text
        x={layout.center.x}
        y={layout.center.y + 30}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        fill="var(--color-text-tertiary)"
        fontFamily="var(--font-mono, ui-monospace, monospace)"
      >
        {projectTitle}
      </text>

      {layout.nodes.map((node) => {
        const labelY = node.y < layout.center.y ? node.y - node.height / 2 - 6 : node.y + node.height / 2 + 12;
        return (
          <g key={node.id}>
            <rect
              x={node.x - node.width / 2}
              y={node.y - node.height / 2}
              width={node.width}
              height={node.height}
              rx={3}
              fill="var(--kind-glyph-fill-domain)"
              stroke={node.isTop ? "var(--color-indigo-hover)" : "var(--kind-glyph-stroke-domain)"}
              strokeWidth={1.3}
            />
            <text
              x={node.x}
              y={node.y + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
              fill="var(--engraved-numeral-face)"
            >
              {node.total}
            </text>
            <text
              x={node.x}
              y={labelY}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-text-quaternary)"
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {node.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
