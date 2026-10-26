import type { VaultDoc } from '@/entities/docs-vault';
import { buildEvidenceConcepts } from '@/shared/lib/git/evidence-states';

export type BriefingPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';
export interface BriefingRange { start: string; end: string; startEpoch: number; endEpoch: number }

export function localDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value ? date : null;
}
export function briefingRange(period: BriefingPeriod, anchor: string, from = '', to = ''): BriefingRange | null {
  const start = parseDate(period === 'custom' ? from : anchor);
  const end = parseDate(period === 'custom' ? to : anchor);
  if (!start || !end) return null;
  if (period === 'week') { start.setDate(start.getDate() - (start.getDay() + 6) % 7); end.setTime(start.getTime()); end.setDate(end.getDate() + 6); }
  if (period === 'month') { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  if (period === 'year') { start.setMonth(0, 1); end.setMonth(11, 31); }
  if (start > end) return null;
  const finalDate = localDate(end);
  end.setDate(end.getDate() + 1);
  return { start: localDate(start), end: finalDate, startEpoch: start.getTime() / 1000, endEpoch: end.getTime() / 1000 };
}
export function movePeriod(period: BriefingPeriod, anchor: string, direction: number): string {
  const date = parseDate(anchor);
  if (!date || period === 'custom') return anchor;
  if (period === 'month') { date.setDate(1); date.setMonth(date.getMonth() + direction); }
  else if (period === 'year') { date.setMonth(0, 1); date.setFullYear(date.getFullYear() + direction); }
  else date.setDate(date.getDate() + direction * (period === 'week' ? 7 : 1));
  return localDate(date);
}

export interface BriefingCommit { hash: string; subject: string; message?: string; messageComplete?: boolean; paths: string[] }
export interface CapabilityGroup { id: string; title: string; paths: string[]; commits: BriefingCommit[] }

/** Current anchors group evidence; a path may belong to more than one capability. O(paths × anchors). */
export function groupBriefing(commits: readonly BriefingCommit[], docs: readonly VaultDoc[], locale: string, project?: string) {
  const owner = project ? docs.find(doc => doc.slug === project) : null;
  const contained = Array.isArray(owner?.frontmatter.contains) ? owner.frontmatter.contains : [];
  const domains = new Set([...(Array.isArray(owner?.frontmatter.domains) ? owner.frontmatter.domains : []), ...contained.filter(slug => docs.some(doc => doc.slug === slug && doc.frontmatter.kind === 'domain'))]);
  const direct = new Set([...(Array.isArray(owner?.frontmatter.capabilities) ? owner.frontmatter.capabilities : []), ...contained.filter(slug => docs.some(doc => doc.slug === slug && doc.frontmatter.kind === 'capability'))]);
  const capabilities = docs.filter(doc => doc.frontmatter.kind === 'capability' && (!project || domains.has(doc.frontmatter.domain) || direct.has(doc.slug)));
  const anchors = buildEvidenceConcepts(docs, capabilities.map(doc => ({ id: doc.slug, docSlug: doc.slug })));
  const bySlug = new Map(capabilities.map(doc => [doc.slug, doc]));
  const groups = new Map<string, CapabilityGroup>();
  const allPaths = [...new Set(commits.flatMap(commit => commit.paths))];
  let unmapped = 0;
  for (const path of allPaths) {
    const matches = anchors.filter(anchor => anchor.evidencePaths.some(raw => {
      const clean = raw.replace(/^\.\//, '').replace(/\/$/, '');
      return clean && (path === clean || path.startsWith(`${clean}/`));
    })).map(anchor => anchor.id);
    if (!matches.length) { matches.push('unmapped'); unmapped++; }
    for (const id of matches) {
      const doc = bySlug.get(id);
      const display = doc?.frontmatter[`display_${locale}`];
      let group = groups.get(id);
      if (!group) { group = { id, title: typeof display === 'string' ? display : doc?.title ?? '', paths: [], commits: [] }; groups.set(id, group); }
      group.paths.push(path);
    }
  }
  for (const group of groups.values()) {
    const paths = new Set(group.paths);
    group.commits = commits.filter(commit => commit.paths.some(path => paths.has(path)));
  }
  const emptyCommits = commits.filter(commit => !commit.paths.length);
  if (emptyCommits.length) {
    const unmappedGroup = groups.get('unmapped') ?? { id: 'unmapped', title: '', paths: [], commits: [] };
    unmappedGroup.commits.push(...emptyCommits);
    groups.set('unmapped', unmappedGroup);
  }
  const rows = [...groups.values()].sort((a, b) => a.id === 'unmapped' ? 1 : b.id === 'unmapped' ? -1 : b.paths.length - a.paths.length || a.id.localeCompare(b.id));
  return { groups: rows, files: allPaths.length, mapped: allPaths.length - unmapped, unmapped };
}

/** Literal location buckets partition unmapped paths; they make no capability claim. */
export function groupSourceAreas(group: CapabilityGroup): CapabilityGroup[] {
  const buckets = new Map<string, string[]>();
  for (const path of group.paths) {
    const parts = path.split('/');
    const area = parts.length === 1 ? '.' : parts[0] === 'src' && parts.length >= 4 ? parts.slice(0, 3).join('/') : parts[0];
    const paths = buckets.get(area) ?? [];
    paths.push(path); buckets.set(area, paths);
  }
  return [...buckets].map(([id, paths]) => {
    const wanted = new Set(paths);
    return { id, title: id, paths, commits: group.commits.filter(commit => commit.paths.some(path => wanted.has(path))) };
  }).sort((a, b) => b.paths.length - a.paths.length || a.id.localeCompare(b.id));
}
