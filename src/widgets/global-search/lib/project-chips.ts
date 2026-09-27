import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";

export interface ProjectChip {
  slug: string;
  label: string;
}

const PROJECT_ID_PREFIX = "project:";

/**
 * Project filter chips: registered projects by concept count, then name, wearing the map's display
 * name; without registered projects, the ids concepts name, most-carried first.
 */
export function buildProjectChips(
  projects: readonly Project[] | undefined,
  nodes: readonly KnowledgeGraphNode[],
): ProjectChip[] {
  const ontologyFreq = new Map<string, number>();
  for (const node of nodes) {
    for (const pid of node.projectIds) {
      ontologyFreq.set(pid, (ontologyFreq.get(pid) ?? 0) + 1);
    }
  }

  if (projects && projects.length > 0) {
    const displayBySlug = new Map<string, string>();
    for (const node of nodes) {
      if (node.kind === "project" && node.display && node.id.startsWith(PROJECT_ID_PREFIX)) {
        displayBySlug.set(node.id.slice(PROJECT_ID_PREFIX.length), node.display);
      }
    }
    const chipName = (project: Project) => displayBySlug.get(project.slug) ?? project.name;
    return projects
      .slice()
      .sort((a, b) => {
        const fa = ontologyFreq.get(a.slug) ?? 0;
        const fb = ontologyFreq.get(b.slug) ?? 0;
        if (fa !== fb) return fb - fa;
        return chipName(a).localeCompare(chipName(b), "ko");
      })
      .map((project) => ({ slug: project.slug, label: chipName(project) }));
  }
  return Array.from(ontologyFreq.keys())
    .sort((a, b) => (ontologyFreq.get(b) ?? 0) - (ontologyFreq.get(a) ?? 0))
    .map((slug) => ({ slug, label: slug }));
}
