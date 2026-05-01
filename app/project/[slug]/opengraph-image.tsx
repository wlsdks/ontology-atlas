import { ImageResponse } from 'next/og';
import { fetchAllProjectsAtBuild } from '@/entities/project';
import { INDIGO_BRAND, INDIGO_HIGHLIGHT } from '@/shared/config/indigo-tokens';

// 정적 export 환경: sitemap.ts 처럼 force-static 으로 고정해 빌드 타임 1회만
// 실행 후 PNG 를 out/ 에 박히게 한다.
export const dynamic = 'force-static';
export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };
export const alt = 'Project preview card for Demo';

interface Params {
  slug: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  const projects = await fetchAllProjectsAtBuild();
  if (projects.length === 0) return [{ slug: 'iam' }];
  return projects.map((p) => ({ slug: p.slug }));
}

export default async function ProjectOgImage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const projects = await fetchAllProjectsAtBuild();
  const project = projects.find((p) => p.slug === slug);

  const accent = project?.isHub ? INDIGO_BRAND : INDIGO_HIGHLIGHT;
  const name = project?.name ?? slug;
  const description = project?.description ?? '프로젝트 토폴로지';
  const category = project?.category ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background:
            // 중앙 약간 좌상단에 인디고 글로우 + dark canvas. glassmorphism
            // 금지 룰 하에서도 OG 이미지 외부 노출이라 단일 그라디언트 1회
            // 만 예외적으로 허용 (Hub accent 강조 목적).
            `radial-gradient(circle at 22% 28%, ${accent}26 0%, transparent 48%), linear-gradient(180deg, #08090a 0%, #0b0c0e 100%)`,
          color: '#f0f1f3',
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
        }}
      >
        {/* 상단 — Demo brand + 카테고리 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#08090a',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            N
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 14,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#6b6f78',
                fontFamily:
                  '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              oh-my-ontology
            </span>
            {category ? (
              <span
                style={{
                  fontSize: 14,
                  color: '#9a9ea6',
                  fontFamily:
                    '"JetBrains Mono", ui-monospace, monospace',
                }}
              >
                {category}
                {project?.isHub ? ' · Hub' : ''}
              </span>
            ) : null}
          </div>
        </div>

        {/* 중앙 — 프로젝트 이름 + 설명 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: name.length > 20 ? 88 : 112,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.02,
              color: project?.isHub ? accent : '#f0f1f3',
              display: 'flex',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              color: '#a7abb3',
              maxWidth: 960,
              display: 'flex',
            }}
          >
            {description.length > 140
              ? description.slice(0, 137) + '…'
              : description}
          </div>
        </div>

        {/* 하단 — url */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 20,
              color: '#6b6f78',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            /project/{slug}/
          </span>
          <span
            style={{
              fontSize: 16,
              color: '#6b6f78',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Topology
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
