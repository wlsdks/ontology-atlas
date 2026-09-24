import type { VaultDoc } from '@/entities/docs-vault';

/** Device-local experience, not a second store of ontology truth or acceptance. */
export const GROWTH_PREFIX = 'ontology-atlas:companion-growth:v1:';
const GROWTH_LIMIT = 2000;
const EXPERIENCE = { explored: 5, reflected: 15 } as const;
export const REFLECTION_KINDS = ['learned', 'corrected', 'uncertain'] as const;
export type ReflectionKind = typeof REFLECTION_KINDS[number];
export type GrowthTarget = { uid: string; slug: string; title: string };
export type GrowthEntry = {
  kind: keyof typeof EXPERIENCE;
  target: GrowthTarget;
  at: number;
  note?: string;
  reflection?: ReflectionKind;
};
export type CompanionGrowth = { version: 1; entries: GrowthEntry[] };
export const EMPTY_GROWTH: CompanionGrowth = { version: 1, entries: [] };
const THRESHOLDS = [0, 30, 80, 160, 280];
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bounded = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const growthEntryKey = (entry: GrowthEntry) => `${entry.kind}:${entry.target.uid}`;

export function parseCompanionGrowth(raw: string | null): CompanionGrowth | null {
  if (raw === null) return EMPTY_GROWTH;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > GROWTH_LIMIT) return null;
    const keys = new Set<string>();
    for (const row of value.entries) {
      if (!row || !Object.hasOwn(EXPERIENCE, row.kind) || !row.target
        || typeof row.target.uid !== 'string' || !UID.test(row.target.uid)
        || !bounded(row.target.slug, 512) || !bounded(row.target.title, 240)
        || !Number.isFinite(row.at) || row.at < 0
        || (row.kind === 'reflected' && (!bounded(row.note, 240) || !REFLECTION_KINDS.includes(row.reflection)))
        || (row.kind === 'explored' && (row.note !== undefined || row.reflection !== undefined))) return null;
      const key = growthEntryKey(row);
      if (keys.has(key)) return null;
      keys.add(key);
    }
    return value as CompanionGrowth;
  } catch { return null; }
}

export function addGrowthEntry(growth: CompanionGrowth, entry: GrowthEntry): CompanionGrowth | null {
  if (growth.entries.some(row => growthEntryKey(row) === growthEntryKey(entry))) return growth;
  return parseCompanionGrowth(JSON.stringify({version: 1, entries: [entry, ...growth.entries]}));
}

export function reviseGrowthReflection(growth: CompanionGrowth, uid: string, note: string, reflection: ReflectionKind): CompanionGrowth | null {
  if (!growth.entries.some(entry => entry.kind === 'reflected' && entry.target.uid === uid)) return null;
  return parseCompanionGrowth(JSON.stringify({...growth, entries: growth.entries.map(entry =>
    entry.kind === 'reflected' && entry.target.uid === uid ? {...entry, note, reflection} : entry)}));
}

export function companionLevelForXp(xp: number): number {
  return xp >= 280 ? 5 + Math.floor((xp - 280) / 160) : THRESHOLDS.filter(value => value <= xp).length;
}

export function growthProgress(growth: CompanionGrowth, adventureXp = 0) {
  const xp = growth.entries.reduce((sum, entry) => sum + EXPERIENCE[entry.kind], adventureXp);
  const level = companionLevelForXp(xp);
  const floor = level >= 5 ? 280 + (level - 5) * 160 : THRESHOLDS[level - 1];
  const next = level >= 5 ? floor + 160 : THRESHOLDS[level];
  return { xp, level, earned: xp - floor, needed: next - floor, remaining: next - xp, stage: Math.min(5, level) };
}

/** Ambiguous or missing identity never earns cross-folder or rename-duplicate XP. */
export function growthTargets(docs: readonly VaultDoc[], locale: string): GrowthTarget[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const uid = doc.frontmatter.uid;
    if (typeof uid === 'string') counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  return docs.flatMap(doc => {
    const { uid, kind } = doc.frontmatter;
    if (typeof uid !== 'string' || !UID.test(uid) || counts.get(uid) !== 1
      || !['domain', 'capability', 'element'].includes(String(kind))) return [];
    const localized = doc.frontmatter[`display_${locale}`];
    const title = typeof localized === 'string' && localized.trim() ? localized : doc.title;
    return [{uid, slug: doc.slug, title: title.slice(0, 240)}];
  });
}

export function growthProjectKey(docs: readonly VaultDoc[]): string | null {
  const projects = docs.filter(doc => doc.frontmatter.kind === 'project');
  const uid = projects[0]?.frontmatter.uid;
  return projects.length === 1 && typeof uid === 'string' && UID.test(uid)
    && docs.filter(doc => doc.frontmatter.uid === uid).length === 1 ? uid : null;
}
