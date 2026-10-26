import { authorEvidence } from './author-evidence';
import type { ChangeBriefing, PullDescription } from '@/shared/lib/git/tauri-change-briefing';

export interface NarrativeSource {
  id: string; kind: 'commit' | 'pr'; title: string; text: string; integration: string;
  version: string; url?: string; updatedAt?: string; fetchedAt?: string; copyKind?: PullDescription['copyKind'];
}
export interface Passage { id: string; text: string }
export interface PacketSource { id: string; kind: 'commit' | 'pr'; passages: Passage[] }
export interface NarrativePacket { evidenceIds: string[]; text: string; sources: NarrativeSource[]; excluded: number; commits: number; prs: number; bytes: number }
export interface NarrativeClaim { text: string; evidence: string[]; inferred: boolean }
export interface NarrativeTheme { title: string; change: NarrativeClaim; reason: NarrativeClaim | null; checks: NarrativeClaim[]; limits: NarrativeClaim[] }
export interface Narrative { themes: NarrativeTheme[]; unexplained: NarrativeSource[]; unsupported: number }

export function narrativeSources(data: ChangeBriefing, prs: PullDescription[]): NarrativeSource[] {
  return data.commits.flatMap((commit, index) => [
    ...prs.filter(pr => pr.integration === commit.hash).map(pr => ({ id: `pr:${pr.number}`, kind: 'pr' as const, title: pr.title, text: `${pr.title}\n\n${pr.body}`, integration: commit.hash, version: pr.digest, url: pr.url, updatedAt: pr.updatedAt, fetchedAt: pr.fetchedAt, copyKind: pr.copyKind })),
    { id: `c:${index + 1}`, kind: 'commit' as const, title: commit.subject, text: commit.messageComplete === false ? '' : commit.message ?? commit.subject, integration: commit.hash, version: commit.hash },
  ]);
}
export function sourcePassages(source: NarrativeSource): Passage[] {
  return (source.text.match(/[\s\S]+?(?:\n\s*\n|$)/g) ?? []).map((text, index) => ({ id: `${source.id}:p${index}`, text }));
}
export function narrativePacket(sources: NarrativeSource[], period: string, maxBytes: number, lookup: { status: string; unchecked: number; unlinked: number } = { status: 'not-requested', unchecked: 0, unlinked: 0 }): NarrativePacket {
  const encoder = new TextEncoder();
  const included: NarrativeSource[] = [];
  const records: PacketSource[] = [];
  const serialize = () => JSON.stringify({ period, coverage: { collectedCommits: sources.filter(source => source.kind === 'commit').length, collectedPrs: sources.filter(source => source.kind === 'pr').length, includedCommits: records.filter(source => source.kind === 'commit').length, includedPrs: records.filter(source => source.kind === 'pr').length, excludedRecords: sources.length - records.length, prLookup: lookup }, sources: records });
  let commits = 0;
  let prs = 0;
  // Whole records only; bounded O(records × packet bytes), at most 240 records and 128 KiB.
  for (const source of sources) {
    if ((source.kind === 'commit' ? commits >= 200 : prs >= 40) || !source.text.trim() || encoder.encode(source.text).length > maxBytes) continue;
    records.push({ id: source.id, kind: source.kind, passages: sourcePassages(source) });
    if (encoder.encode(serialize()).length > maxBytes) { records.pop(); continue; }
    included.push(source);
    if (source.kind === 'commit') commits++; else prs++;
  }
  const text = serialize();
  return { text, evidenceIds: records.flatMap(source => source.passages.map(passage => passage.id)), sources: included, commits, prs, excluded: sources.length - included.length, bytes: encoder.encode(text).length };
}
export function parseNarrative(raw: string, packet: NarrativePacket): Narrative {
  const passages = new Map(packet.sources.flatMap(source => sourcePassages(source).filter(passage => packet.evidenceIds.includes(passage.id)).map(passage => [passage.id, source.id] as const)));
  const cited = new Set<string>();
  const eligible = (kind: 'checks' | 'limits') => new Set(packet.sources.flatMap(source => authorEvidence(sourcePassages(source), kind).map(value => value.id)));
  const checks = eligible('checks');
  const limits = eligible('limits');
  let unsupported = 0;
  const claim = (value: unknown): NarrativeClaim => {
    if (!value || typeof value !== 'object') throw new Error('invalid-analysis: malformed claim or unknown citation');
    const data = value as Partial<NarrativeClaim>;
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 80 || typeof data.inferred !== 'boolean' || !Array.isArray(data.evidence) || !data.evidence.length || data.evidence.length > 6 || new Set(data.evidence).size !== data.evidence.length || !data.evidence.every(id => typeof id === 'string' && passages.has(id))) throw new Error('invalid-analysis: malformed claim or unknown citation');
    return data as NarrativeClaim;
  };
  const list = (value: unknown, allowed: Set<string>): NarrativeClaim[] => {
    if (!Array.isArray(value) || value.length > 1) throw new Error('invalid-analysis: too many or missing checks/limits');
    return value.map(claim).filter(item => {
      const accepted = item.evidence.every(id => allowed.has(id));
      if (!accepted) unsupported++;
      return accepted;
    });
  };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('themes' in value) || !Array.isArray(value.themes) || value.themes.length > 3) throw new Error('invalid-analysis: missing or excessive themes');
  const themes = value.themes.map((value: unknown): NarrativeTheme => {
    if (!value || typeof value !== 'object') throw new Error('invalid-analysis: malformed theme');
    const data = value as Partial<NarrativeTheme>;
    if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 40) throw new Error('invalid-analysis: malformed title');
    return { title: data.title, change: claim(data.change), reason: data.reason === null ? null : claim(data.reason), checks: list(data.checks, checks), limits: list(data.limits, limits) };
  });
  themes.forEach(theme => [theme.change, ...(theme.reason ? [theme.reason] : []), ...theme.checks, ...theme.limits].forEach(item => item.evidence.forEach(id => cited.add(passages.get(id)!))));
  return { themes, unsupported, unexplained: packet.sources.filter(source => !cited.has(source.id)) };
}
export function narrativeResponse(body: string, packet: NarrativePacket, locale = 'en'): Narrative {
  try {
    const response = JSON.parse(body);
    const choice = response?.choices?.[0];
    if (choice?.finish_reason !== 'stop') throw new Error(`invalid-analysis: model finish ${String(choice?.finish_reason)}`);
    if (!choice.message || (choice.message.tool_calls != null && (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length > 0)) || typeof choice.message.content !== 'string') throw new Error('invalid-analysis: non-text response');
    const result = parseNarrative(choice.message.content, packet);
    if (locale === 'ko') {
      const passages = new Map(packet.sources.flatMap(source => sourcePassages(source).filter(passage => packet.evidenceIds.includes(passage.id)).map(passage => [passage.id, passage.text] as const)));
      const hasUncitedScript = (text: string, evidence: string[]) => (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) ?? []).some(word => !evidence.some(id => passages.get(id)?.includes(word)));
      if (result.themes.some(theme => {
        const claims = [theme.change, ...(theme.reason ? [theme.reason] : []), ...theme.checks, ...theme.limits];
        return hasUncitedScript(theme.title, claims.flatMap(claim => claim.evidence)) || claims.some(claim => hasUncitedScript(claim.text, claim.evidence)) || [theme.change, ...(theme.reason ? [theme.reason] : [])].some(claim => !/[\uac00-\ud7a3]/u.test(claim.text));
      })) throw new Error('invalid-analysis: language mismatch');
    }
    return result;
  } catch (error) { if (error instanceof Error && error.message.startsWith('invalid-analysis:')) throw error; throw new Error('invalid-analysis: invalid JSON'); }
}
