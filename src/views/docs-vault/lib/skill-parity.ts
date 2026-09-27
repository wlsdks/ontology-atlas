import type { AgentFilesAnalysis } from '@/entities/agent-files';

/**
 * Whether a skill's two copies agree, one row per skill. `.claude/skills/` is read by Claude
 * Code and `.agents/skills/` by Codex, so a one-sided edit makes one skill behave differently
 * per tool. Both manifest walkers skip dot directories, so the trees are read through the
 * desktop bridge. This module only judges; which copy is right is the person's call.
 */

/** Three values only, so the reader need not memorize a table. */
type SkillParityVerdict =
  | 'agreed'
  | 'diverged'
  /** Present in one tree only (the whole skill, or some files inside it). */
  | 'one-sided';

export interface SkillParityRow {
  /** The `<name>` of `.claude/skills/<name>/…`. */
  name: string;
  verdict: SkillParityVerdict;
  /** Used to phrase `one-sided` in plain language. */
  presentIn: Array<'.claude/skills' | '.agents/skills'>;
  /** Which files diverged, so the agent receiving the handoff knows what to open. */
  files: string[];
}

export interface SkillParityModel {
  rows: SkillParityRow[];
  disagreeing: number;
}

const CLAUDE = '.claude/skills/';
const AGENTS = '.agents/skills/';

function skillOf(path: string): string | null {
  const rest = path.startsWith(CLAUDE)
    ? path.slice(CLAUDE.length)
    : path.startsWith(AGENTS)
      ? path.slice(AGENTS.length)
      : null;
  if (rest === null) return null;
  const name = rest.split('/')[0];
  return name === '' ? null : name;
}

/**
 * Folds `analyzeAgentFiles`' per-file verdicts by skill. It adds no comparison logic, or the
 * screen and the CLI could silently disagree.
 */
export function buildSkillParityModel(analysis: AgentFilesAnalysis): SkillParityModel {
  const present = new Map<string, Set<'.claude/skills' | '.agents/skills'>>();
  for (const record of analysis.records) {
    const name = skillOf(record.path);
    if (!name) continue;
    const tree = record.path.startsWith(CLAUDE) ? '.claude/skills' : '.agents/skills';
    const set = present.get(name) ?? new Set();
    set.add(tree);
    present.set(name, set);
  }

  const diverged = new Map<string, Set<string>>();
  const oneSided = new Map<string, Set<string>>();
  for (const finding of analysis.drift) {
    if (finding.check !== 'skill-copy') continue;
    // Paths are relative to the skill tree (`<skill>/SKILL.md`).
    const name = finding.path.split('/')[0];
    if (!name) continue;
    const bucket = finding.code === 'skill-copy-diverged' ? diverged : oneSided;
    const set = bucket.get(name) ?? new Set();
    set.add(finding.path.slice(name.length + 1) || finding.path);
    bucket.set(name, set);
  }

  // With one tree present the parity question does not arise ("Codex was never set up"), as the
  // CLI answers `not-applicable`; one-sided rows per skill would make a clean vault look broken.
  const treesInPlay = new Set<string>();
  for (const set of present.values()) for (const tree of set) treesInPlay.add(tree);
  if (treesInPlay.size < 2) return { rows: [], disagreeing: 0 };

  const rows: SkillParityRow[] = [...present.keys()].sort().map((name) => {
    const trees = [...(present.get(name) ?? [])].sort();
    // A skill folder missing from one tree has no per-file finding, so it is decided here.
    const wholeTreeMissing = trees.length < 2;
    const divergedFiles = [...(diverged.get(name) ?? [])].sort();
    const oneSidedFiles = [...(oneSided.get(name) ?? [])].sort();
    const verdict: SkillParityVerdict =
      wholeTreeMissing || oneSidedFiles.length > 0
        ? 'one-sided'
        : divergedFiles.length > 0
          ? 'diverged'
          : 'agreed';
    return {
      name,
      verdict,
      presentIn: trees as SkillParityRow['presentIn'],
      files: verdict === 'diverged' ? divergedFiles : oneSidedFiles,
    };
  });

  return { rows, disagreeing: rows.filter((row) => row.verdict !== 'agreed').length };
}
