import { sourcePassages, type Narrative, type NarrativePacket, type NarrativeSource, type Passage } from './narrative';

interface Lookup { status: string; unchecked: number; unlinked: number }
export interface PeriodPlan {
  sources: NarrativeSource[]; parts: NarrativePacket[];
  unsent: { source: NarrativeSource; reason: 'overlarge' | 'incomplete' }[];
  period: string; limit: number; lookup: Lookup;
}
export interface OverviewCandidate { passage: Passage; source: NarrativeSource; part: number; kind: 'change' | 'reason' | 'checks' | 'limits' }
export interface OverviewSelection { packet: NarrativePacket | null; candidates: OverviewCandidate[]; selected: string[]; represented: number }

export function planPeriod(sources: NarrativeSource[], period: string, limit: number, lookup: Lookup): PeriodPlan {
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('invalid-analysis: duplicate source');
  const parts: NarrativePacket[] = [];
  const unsent: PeriodPlan['unsent'] = [];
  const encoder = new TextEncoder();
  const records = new Map(sources.filter(source => source.text.length <= limit).map(source => [source.id, { id: source.id, kind: source.kind, passages: sourcePassages(source) }]));
  const totalCommits = sources.filter(source => source.kind === 'commit').length;
  const totalPrs = sources.length - totalCommits;
  const packet = (included: NarrativeSource[]): NarrativePacket => {
    const commits = included.filter(source => source.kind === 'commit').length;
    const prs = included.length - commits;
    const selected = included.map(source => records.get(source.id)!);
    const excluded = sources.length - included.length;
    const text = JSON.stringify({ period, coverage: { collectedCommits: totalCommits, collectedPrs: totalPrs, includedCommits: commits, includedPrs: prs, excludedRecords: excluded, prLookup: lookup }, sources: selected });
    return { text, bytes: encoder.encode(text).length, sources: included, commits, prs, excluded, evidenceIds: selected.flatMap(source => source.passages.map(passage => passage.id)) };
  };
  let current: NarrativePacket | null = null;
  for (const source of sources) {
    if (!source.text.trim() || !records.has(source.id)) { unsent.push({ source, reason: source.text.trim() ? 'overlarge' : 'incomplete' }); continue; }
    const single = packet([source]);
    if (single.bytes > limit) { unsent.push({ source, reason: 'overlarge' }); continue; }
    if (!current) { current = single; continue; }
    const candidate = packet([...current.sources, source]);
    if (candidate.bytes <= limit && candidate.commits <= 200 && candidate.prs <= 40 && candidate.sources.length <= 240) current = candidate;
    else { parts.push(current); current = single; }
  }
  if (current) parts.push(current);
  return { sources, parts, period, limit, lookup, unsent };
}

/** Only source passages, never model-generated summaries, may enter the overview. */
export function overviewPacket(plan: PeriodPlan, accepted: Narrative[]): OverviewSelection {
  const candidates = new Map<string, OverviewCandidate>();
  const byPart: OverviewCandidate[][] = [];
  // Parts retain newest-first source order; give older parts the first opportunity.
  for (let part = accepted.length - 1; part >= 0; part--) {
    const originals = new Map(plan.parts[part].sources.flatMap(source => sourcePassages(source).map(passage => [passage.id, { passage, source }])));
    const nominated: OverviewCandidate[] = [];
    const nominate = (kind: OverviewCandidate['kind'], ids: string[]) => ids.forEach(id => {
      const original = originals.get(id);
      if (original && !candidates.has(id)) {
        const candidate = { ...original, part, kind };
        nominated.push(candidate); candidates.set(id, candidate);
      }
    });
    // Preserve the category with the strongest adverse-evidence priority on duplicate IDs.
    for (const kind of ['limits', 'reason', 'change', 'checks'] as const) for (const theme of accepted[part].themes) {
      const claims = kind === 'change' ? [theme.change] : kind === 'reason' ? theme.reason ? [theme.reason] : [] : theme[kind];
      claims.forEach(claim => nominate(kind, claim.evidence));
    }
    byPart.push(nominated);
  }
  const encoder = new TextEncoder();
  const first = byPart.flatMap(values => {
    // A passage can also support a change even when deduplication gave it another category.
    const changeIds = new Set(accepted[values[0]?.part ?? -1]?.themes.flatMap(theme => theme.change.evidence) ?? []);
    const changes = values.filter(value => changeIds.has(value.passage.id)).sort((a, b) => encoder.encode(a.passage.text).length - encoder.encode(b.passage.text).length);
    return changes.slice(0, 1);
  });
  const ordered = [...first];
  const seen = new Set(first.map(value => value.passage.id));
  for (const kind of ['limits', 'reason', 'change', 'checks'] as const) for (const values of byPart) for (const value of values) if (value.kind === kind && !seen.has(value.passage.id)) { ordered.push(value); seen.add(value.passage.id); }
  const selected: OverviewCandidate[] = [];
  const serialize = () => JSON.stringify({ period: plan.period, scope: 'overview-from-selected-original-passages', coverage: { collectedRecords: plan.sources.length, readingParts: plan.parts.length, candidatePassages: candidates.size, includedPassages: selected.length }, sources: [...new Set(selected.map(value => value.source.id))].map(id => {
    const values = selected.filter(value => value.source.id === id);
    return { id, kind: values[0].source.kind, title: values[0].source.title, passages: values.map(value => value.passage) };
  }) });
  for (const candidate of ordered) {
    selected.push(candidate);
    const unique = [...new Map(selected.map(value => [value.source.id, value.source])).values()];
    if (unique.length > 240 || unique.filter(source => source.kind === 'commit').length > 200 || unique.filter(source => source.kind === 'pr').length > 40 || encoder.encode(serialize()).length > plan.limit) selected.pop();
  }
  if (!selected.length) return { packet: null, candidates: [...candidates.values()], selected: [], represented: 0 };
  const sources = [...new Map(selected.map(value => [value.source.id, value.source])).values()];
  const text = serialize();
  return { candidates: [...candidates.values()], selected: selected.map(value => value.passage.id), represented: new Set(selected.map(value => value.part)).size,
    packet: { text, sources, evidenceIds: selected.map(value => value.passage.id), commits: sources.filter(source => source.kind === 'commit').length, prs: sources.filter(source => source.kind === 'pr').length, excluded: plan.sources.length - sources.length, bytes: encoder.encode(text).length } };
}
