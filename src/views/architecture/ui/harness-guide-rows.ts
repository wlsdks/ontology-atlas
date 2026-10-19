import {
  declaredPairFor,
  isGuideRecord,
  isPairDrift,
  type AgentDriftFinding,
  type AgentTool,
  type HarnessReport,
  type HookConfigFacts,
} from '@/entities/agent-files';

export interface DriftFile {
  key: string;
  path: string;
  label: string;
  finding: AgentDriftFinding | null;
  twin: boolean;
  onlyIn: string | null;
}

export interface GuideFile {
  path: string;
  bytes: number;
  drifting: boolean;
}

/** A rendered row: one guide path, or one directory's worth of them. */
export interface GuideRow {
  key: string;
  /** What the person reads as the file's name. A tree row shows its directory. */
  label: string;
  tools: readonly AgentTool[];
  ruleId: string;
  bytes: number;
  fileCount: number;
  lastModified: number | null;
  files: GuideFile[];
  driftFiles: DriftFile[];
  /** The twin this row is declared byte-identical to, or `null` when it has no declared pair. */
  declaredPair: string | null;
}

export type Selection =
  | { kind: 'guide'; row: GuideRow }
  | { kind: 'drift'; row: GuideRow; file: DriftFile }
  | { kind: 'hooks'; group: HookConfigFacts };

/** Directory slots labelled by the path a person would type; only nested `AGENTS.md` needs words, from the catalogue. */
export const TREE_RULES: Readonly<Record<string, string>> = Object.freeze({
  'claude-rules': '.claude/rules/',
  'claude-skills': '.claude/skills/',
  'claude-agents': '.claude/agents/',
  'agents-skills': '.agents/skills/',
  'agents-agents': '.agents/agents/',
  'cursor-rules': '.cursor/rules/',
});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatWhen(value: number | null, locale: string): string {
  if (value == null) return '—';
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function insideFolder(path: string, folder: string): string {
  return path.startsWith(folder) ? path.slice(folder.length) : path;
}

export function buildRows(report: HarnessReport, nestedLabel: string): GuideRow[] {
  const byRule = new Map<string, GuideRow>();
  const mtimeByPath = new Map(report.times.map((time) => [time.path, time.lastModified]));
  const pairFindings = report.analysis.drift.filter(
    (finding) => finding.check === 'skill-copy' || finding.check === 'agent-copy',
  );

  for (const record of report.analysis.records) {
    /* Guides only, the same predicate the sentence's first number counts, so list and number agree. */
    if (!isGuideRecord(record)) continue;
    const treeLabel = record.ruleId === 'nested-agents-md' ? nestedLabel : TREE_RULES[record.ruleId];
    const key = treeLabel ? record.ruleId : record.path;
    const lastModified = mtimeByPath.get(record.path) ?? null;
    const codes = record.drift.filter(isPairDrift);
    const row =
      byRule.get(key) ??
      byRule
        .set(key, {
          key,
          label: treeLabel ?? record.path,
          tools: record.tools,
          ruleId: record.ruleId,
          bytes: 0,
          fileCount: 0,
          lastModified: null,
          files: [],
          driftFiles: [],
          declaredPair: declaredPairFor(record.ruleId),
        })
        .get(key)!;
    row.bytes += record.bytes;
    row.fileCount += 1;
    if (lastModified != null && (row.lastModified == null || lastModified > row.lastModified)) {
      row.lastModified = lastModified;
    }
    row.files.push({ path: record.path, bytes: record.bytes, drifting: codes.length > 0 });
    if (codes.length > 0) {
      const label = TREE_RULES[record.ruleId] ? insideFolder(record.path, TREE_RULES[record.ruleId]!) : record.path;
      row.driftFiles.push({
        key: `drift:${record.path}`,
        path: record.path,
        label,
        finding: pairFindings.find((finding) => finding.path === label && codes.includes(finding.code)) ?? null,
        twin: codes.some((code) => code.endsWith('-diverged')),
        onlyIn: codes.some((code) => code.endsWith('-diverged')) ? null : (TREE_RULES[record.ruleId] ?? null),
      });
    }
  }

  /* Root instruction files first, then trees, alphabetical within each, independent of walk order. */
  const rank = (row: GuideRow) => (TREE_RULES[row.ruleId] || row.ruleId === 'nested-agents-md' ? 1 : 0);
  const rows = [...byRule.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
  for (const row of rows) {
    listOneSided(row, rows, report);
    row.files.sort((a, b) => a.path.localeCompare(b.path));
    row.driftFiles.sort((a, b) => a.label.localeCompare(b.label));
  }
  return rows;
}

/* "Same content" needs equal file sets, so a file only the twin has is listed here as well. */
function listOneSided(row: GuideRow, rows: readonly GuideRow[], report: HarnessReport) {
  const folder = TREE_RULES[row.ruleId];
  if (!folder || comparedTwin(row, report) === null) return;
  const twinFolder = `${row.declaredPair}/`;
  const twinRow = rows.find((other) => TREE_RULES[other.ruleId] === twinFolder);
  const here = new Set(row.files.map((file) => insideFolder(file.path, folder)));
  const there = new Set(twinRow?.files.map((file) => insideFolder(file.path, twinFolder)) ?? []);
  const listed = new Set(row.driftFiles.map((file) => file.label));
  for (const file of row.files) {
    const label = insideFolder(file.path, folder);
    if (there.has(label)) continue;
    file.drifting = true;
    if (!listed.has(label)) {
      row.driftFiles.push({ key: `drift:${file.path}`, path: file.path, label, finding: null, twin: false, onlyIn: folder });
    }
  }
  for (const label of there) {
    if (here.has(label)) continue;
    row.driftFiles.push({
      key: `missing:${row.key}:${label}`,
      path: `${twinFolder}${label}`,
      label,
      finding: null,
      twin: false,
      onlyIn: twinFolder,
    });
  }
}

export function mergedShare(row: GuideRow, report: HarnessReport) {
  const cap = report.analysis.checks.codexSizeCap;
  if ((row.ruleId !== 'agents-md' && row.ruleId !== 'nested-agents-md') || cap.worstCaseBytes == null) {
    return null;
  }
  const ratio = Math.min(1, cap.worstCaseBytes / cap.capBytes);
  const percentValue = Math.round(ratio * 100);
  /* "0%" for 157 B of 32 KB would read as "empty"; under one percent says what is true. */
  const percent = percentValue < 1 && cap.worstCaseBytes > 0 ? '<1' : String(percentValue);
  return { used: cap.worstCaseBytes, cap: cap.capBytes, ratio, percentValue, percent, over: cap.status === 'drift' };
}

export function differingCount(row: GuideRow): number {
  return row.driftFiles.filter((file) => file.twin).length;
}

export function comparedTwin(row: GuideRow, report: HarnessReport): string | null {
  const { skillCopy, agentCopy } = report.analysis.checks;
  const check = row.ruleId.endsWith('-skills') ? skillCopy : row.ruleId.endsWith('-agents') ? agentCopy : null;
  return check && check.status !== 'not-applicable' ? row.declaredPair : null;
}
