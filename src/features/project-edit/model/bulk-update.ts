import type { Category } from "@/entities/category";
import { projectToInput } from "../../../entities/project/model/mapper";
import type { Project } from "../../../entities/project/model/types";
import { findProjectPlacement } from "./placement";

function sortProjectsForBulkUpdate(projects: Project[]) {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function buildBulkStatusUpdateInputs(params: {
  projects: Project[];
  targetSlugs: string[];
  nextStatusId: string;
}) {
  const targetSlugSet = new Set(params.targetSlugs);

  return sortProjectsForBulkUpdate(params.projects)
    .filter((project) => targetSlugSet.has(project.slug) && project.status !== params.nextStatusId)
    .map((project) =>
      projectToInput({
        ...project,
        status: params.nextStatusId,
      }),
    );
}

export function buildBulkCategoryUpdateInputs(params: {
  projects: Project[];
  targetSlugs: string[];
  nextCategoryId: string;
  categories: Category[];
}) {
  const targetSlugSet = new Set(params.targetSlugs);
  const targetCategory = params.categories.find(
    (category) => category.id === params.nextCategoryId,
  );

  if (!targetCategory) {
    throw new Error("대상 카테고리를 찾지 못했습니다.");
  }

  const nextProjects = [...params.projects];
  const updates = [];

  for (const project of sortProjectsForBulkUpdate(params.projects)) {
    if (!targetSlugSet.has(project.slug) || project.category === params.nextCategoryId) {
      continue;
    }

    const position = findProjectPlacement(
      targetCategory,
      nextProjects.filter((candidate) => candidate.slug !== project.slug),
    );
    const updatedProject: Project = {
      ...project,
      category: params.nextCategoryId,
      position,
    };

    updates.push(projectToInput(updatedProject));

    const index = nextProjects.findIndex((candidate) => candidate.slug === project.slug);
    if (index >= 0) {
      nextProjects[index] = updatedProject;
    }
  }

  return updates;
}
