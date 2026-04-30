import type { Project, ProjectCategory } from "@/entities/project";

export interface FeaturedPathStep {
  slug: string;
  label: string;
}

export interface FeaturedPathPreset {
  id: string;
  label: string;
  description: string;
  summary: string;
  slug: string;
  category: ProjectCategory | null;
  focusedHubSlug: string | null;
  highlightSlugs: string[];
  steps: FeaturedPathStep[];
}

interface FeaturedPathSpec {
  id: string;
  label: string;
  description: string;
  summary: string;
  slug: string;
  category: ProjectCategory | null;
  focusedHubSlug: string | null;
  highlightSlugs: string[];
  stepSlugs: string[];
}

const PRESET_SPECS: FeaturedPathSpec[] = [
  {
    id: "identity",
    label: "인증",
    description: "IAM 중심 인증 흐름",
    summary: "공개 서비스와 내부 툴이 하나의 인증 축으로 묶이는 경로",
    slug: "iam",
    category: null,
    focusedHubSlug: "iam",
    highlightSlugs: ["iam", "aslan-maps", "news-clipping", "paravel", "pick"],
    stepSlugs: ["iam", "aslan-maps", "paravel", "pick"],
  },
  {
    id: "agent",
    label: "에이전트",
    description: "Reactor 중심 AI 확장",
    summary: "Reactor를 중심으로 MCP와 서비스가 붙는 에이전트 확장 경로",
    slug: "reactor",
    category: null,
    focusedHubSlug: "reactor",
    highlightSlugs: [
      "reactor",
      "reactor-web",
      "aslan-verse",
      "reactor-admin",
      "news-clipping",
      "atlassian-mcp",
      "swagger-mcp",
    ],
    stepSlugs: [
      "reactor",
      "reactor-web",
      "reactor-admin",
      "atlassian-mcp",
      "aslan-verse",
    ],
  },
  {
    id: "products",
    label: "제품",
    description: "현재 공개 서비스 묶음",
    summary: "방문자가 바로 이해해야 할 아슬란의 현재 서비스 표면",
    slug: "aslan-maps",
    category: "in-progress",
    focusedHubSlug: null,
    highlightSlugs: [
      "iam",
      "reactor",
      "aslan-maps",
      "news-clipping",
      "pick",
      "paravel",
      "aslan-verse",
    ],
    stepSlugs: ["aslan-maps", "news-clipping", "pick", "aslan-verse"],
  },
];

export function resolveFeaturedPathPresets(
  projects: Project[],
): FeaturedPathPreset[] {
  const projectMap = new Map(projects.map((project) => [project.slug, project]));

  return PRESET_SPECS.filter((preset) => projectMap.has(preset.slug)).map(
    (preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      summary: preset.summary,
      slug: preset.slug,
      category: preset.category,
      focusedHubSlug: preset.focusedHubSlug,
      highlightSlugs: preset.highlightSlugs.filter((slug) =>
        projectMap.has(slug),
      ),
      steps: preset.stepSlugs.flatMap((slug) => {
        const project = projectMap.get(slug);
        return project ? [{ slug, label: project.name }] : [];
      }),
    }),
  );
}
