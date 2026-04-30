import type { Project } from "@/entities/project";

export interface ProjectTourStep {
  id: string;
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
}

const TOUR_STEP_SPECS: ProjectTourStep[] = [
  {
    id: "iam-core",
    slug: "iam",
    eyebrow: "기반 축",
    title: "IAM이 접근의 중심축입니다.",
    description:
      "인증과 사용자 진입점이 IAM 을 통과한다. 이 노드부터 보면 시스템의 공통 기반이 바로 읽힌다.",
  },
  {
    id: "reactor-core",
    slug: "reactor",
    eyebrow: "에이전트 허브",
    title: "에이전트 허브가 AI 확장의 중심입니다.",
    description:
      "에이전트 기능이 퍼질 중심축이다. 이 허브를 기준으로 어떤 서비스가 AI 확장 후보인지 빠르게 파악할 수 있다.",
  },
  {
    id: "self-context",
    slug: "sample",
    eyebrow: "이 제품",
    title: "이 노드가 시스템 자체를 설명합니다.",
    description:
      "지금 보고 있는 이 프로젝트다. 단순 목록이 아니라 서비스 간 위치와 관계를 한 장의 지도처럼 보여주는 역할을 맡는다.",
  },
  {
    id: "future-edge",
    slug: "demo-verse",
    eyebrow: "확장 방향",
    title: "다음 실험은 가장자리에서 보입니다.",
    description:
      "핵심 허브에서 조금 떨어진 실험적 프로젝트를 보면 다음 확장 방향이 보인다. 지도는 현재뿐 아니라 다음 움직임도 함께 드러낸다.",
  },
];

export function resolveProjectTourSteps(
  projects: Project[],
): ProjectTourStep[] {
  const slugSet = new Set(projects.map((project) => project.slug));
  return TOUR_STEP_SPECS.filter((step) => slugSet.has(step.slug));
}
