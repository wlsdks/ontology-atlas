import type { Project } from '@/entities/project';

export interface SearchResult {
  project: Project;
  score: number;
  matchedField: 'name' | 'nameEn' | 'slug' | 'tags' | 'stack' | 'description';
}

/**
 * Multi-field project search, O(n * fields) per query with no index, enough for 20-200 projects.
 * Scores: exact name 100, name prefix 80, name contains 60, nameEn 55, slug 50, tag 40, stack 35,
 * description 20; the highest matching field wins.
 */
export function searchProjects(projects: Project[], rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: SearchResult[] = [];

  for (const project of projects) {
    const name = project.name.toLowerCase();
    const nameEn = (project.nameEn ?? '').toLowerCase();
    // Every word a screen draws for the project (`display_<locale>`) matches like its name.
    const displays = Object.values(project.displayNames ?? {}).map((value) => value.toLowerCase());
    const slug = project.slug.toLowerCase();
    const description = project.description.toLowerCase();
    const tags = project.tags.map((t) => t.toLowerCase());
    const stack = project.stack.map((s) => s.toLowerCase());

    let bestScore = 0;
    let bestField: SearchResult['matchedField'] = 'name';

    const considered = (score: number, field: SearchResult['matchedField']) => {
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    };

    if (name === query || displays.includes(query)) considered(100, 'name');
    else if (name.startsWith(query) || displays.some((value) => value.startsWith(query))) considered(80, 'name');
    else if (name.includes(query) || displays.some((value) => value.includes(query))) considered(60, 'name');

    if (nameEn && nameEn.includes(query)) considered(55, 'nameEn');
    if (slug.includes(query)) considered(50, 'slug');

    for (const t of tags) {
      if (t.includes(query)) {
        considered(40, 'tags');
        break;
      }
    }
    for (const s of stack) {
      if (s.includes(query)) {
        considered(35, 'stack');
        break;
      }
    }
    if (description.includes(query)) considered(20, 'description');

    if (bestScore > 0) {
      results.push({ project, score: bestScore, matchedField: bestField });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
