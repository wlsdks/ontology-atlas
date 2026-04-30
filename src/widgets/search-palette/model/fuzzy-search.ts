import type { Project } from '@/entities/project';

export interface SearchResult {
  project: Project;
  score: number;
  matchedField: 'name' | 'nameEn' | 'slug' | 'tags' | 'stack' | 'description';
}

/**
 * 간단한 다중 필드 검색 — 의존성 추가 없이 프로젝트 20-200개 규모에 충분.
 *
 * 점수 체계:
 * - name 완전 일치 100
 * - name 시작 일치 80
 * - name 포함 60
 * - nameEn 포함 55
 * - slug 포함 50
 * - tag 포함 40
 * - stack 포함 35
 * - description 포함 20
 *
 * 복수 필드 매치 시 최고 점수 적용.
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
