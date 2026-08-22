import type { Project } from '@/entities/project';

export interface SearchResult {
  project: Project;
  score: number;
  matchedField: 'name' | 'nameEn' | 'slug' | 'tags' | 'stack' | 'description';
}

/**
 * Simple multi-field search — enough for 20–200 projects without adding a dependency.
 *
 * Scoring:
 * - exact name match 100
 * - name prefix match 80
 * - name contains 60
 * - nameEn contains 55
 * - slug contains 50
 * - tag contains 40
 * - stack contains 35
 * - description contains 20
 *
 * With several fields matching, the highest score applies.
 */
export function searchProjects(projects: Project[], rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const results: SearchResult[] = [];

  for (const project of projects) {
    const name = project.name.toLowerCase();
    const nameEn = (project.nameEn ?? '').toLowerCase();
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

    if (name === query) considered(100, 'name');
    else if (name.startsWith(query)) considered(80, 'name');
    else if (name.includes(query)) considered(60, 'name');

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
