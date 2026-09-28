import {
  findNameMatch,
  NAME_TIER_SCORE,
  normalizeForMatch,
  type NodeNameSource,
} from "@/shared/lib/node-name-match";
import type { Project } from "../model/types";

export type ProjectMatchSource = "name" | "nameEn" | "description" | "tags" | "stack" | "category" | "slug";

export interface ProjectMatch {
  project: Project;
  score: number;
  field: "name" | "summary" | "id";
  source: ProjectMatchSource;
  text: string;
}

const DESCRIBING_FIELD_SCORE = 2;
const SLUG_SCORE = 1;

const NAME_SOURCES = new WeakMap<Project, NodeNameSource>();

function nameSourceOf(project: Project): NodeNameSource {
  const cached = NAME_SOURCES.get(project);
  if (cached) return cached;
  const source: NodeNameSource = {
    title: project.name,
    display: project.nameEn,
    displayLocales: project.displayNames,
  };
  NAME_SOURCES.set(project, source);
  return source;
}

function matchProject(project: Project, query: string): Omit<ProjectMatch, "project"> | null {
  const byName = findNameMatch(nameSourceOf(project), query);
  if (byName) {
    const isEnglishName = byName.name !== project.name.trim() && byName.name === project.nameEn?.trim();
    return {
      score: NAME_TIER_SCORE[byName.tier],
      field: "name",
      source: isEnglishName ? "nameEn" : "name",
      text: byName.name,
    };
  }
  const describing: ReadonlyArray<readonly [ProjectMatchSource, string | undefined]> = [
    ["description", project.description],
    ...project.tags.map((tag) => ["tags", tag] as const),
    ...project.stack.map((item) => ["stack", item] as const),
    ["category", project.category],
  ];
  for (const [source, text] of describing) {
    if (text && normalizeForMatch(text).includes(query)) {
      return { score: DESCRIBING_FIELD_SCORE, field: "summary", source, text };
    }
  }
  if (normalizeForMatch(project.slug).includes(query)) {
    return { score: SLUG_SCORE, field: "id", source: "slug", text: project.slug };
  }
  return null;
}

/** O(n · f) over n projects of f names and fields each, then O(m log m) to order the m matches. */
export function rankProjectMatches(projects: readonly Project[], query: string): ProjectMatch[] {
  const normalized = normalizeForMatch(query);
  if (normalized === "") return [];
  const matches: ProjectMatch[] = [];
  for (const project of projects) {
    const match = matchProject(project, normalized);
    if (match) matches.push({ project, ...match });
  }
  return matches.sort(
    (a, b) => b.score - a.score || b.project.updatedAt.getTime() - a.project.updatedAt.getTime(),
  );
}
