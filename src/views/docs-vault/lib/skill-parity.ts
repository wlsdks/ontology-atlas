import type { AgentFilesAnalysis } from './agent-files';

/**
 * «Do my skill copies agree with each other» — one row per skill.
 *
 * **Why this screen exists** (PO council, 2026-07-29). `agent-setup` installs skills in **two
 * trees**: `.claude/skills/` is read by Claude Code, `.agents/skills/` by Codex. Editing one
 * makes **the same skill behave differently depending on the tool**. Measured case: the
 * `?guides=off` discipline of `motion-verify` existed only in the `.claude` copy, so running
 * that skill through Codex today measures a screen with the first-visit guide switched on and
 * returns a wrong verdict. Nothing on screen hints at it.
 *
 * The CLI `agent-files` already reports this. The screen could not, because both manifest
 * walkers filter dot directories with `if (name.startsWith('.')) continue;`, so `.claude/skills`
 * **never enters the manifest** and the existing `skillCopy` check was code that could not
 * fire. This slice reads them separately through the **desktop bridge (absolute paths)** rather
 * than changing the walker.
 *
 * **What this module does not do.** It only judges. It does not fix, merge, or say which side is
 * right — **which copy is newer is something the files do not know and a person does.** Fixing
 * moves off-screen to a handoff (one sentence to an agent). The person judges, the agent fixes.
 */

/** One skill's verdict. Three values only — more and the reader has to memorize a table. */
type SkillParityVerdict =
  /** The two copies are identical, file for file. */
  | 'agreed'
  /** Both copies exist and their contents diverged. */
  | 'diverged'
  /** Present in one tree only (the whole skill, or some files inside it). */
  | 'one-sided';

export interface SkillParityRow {
  /** The skill folder name — the `<name>` of `.claude/skills/<name>/…`. */
  name: string;
  verdict: SkillParityVerdict;
  /** The trees this skill actually exists in, used to phrase `one-sided` in plain language. */
  presentIn: Array<'.claude/skills' | '.agents/skills'>;
  /**
   * Skill-relative paths of the diverged (or one-sided) files. A body diff is not this screen's
   * job, but **which file** must be stated so the agent receiving the handoff knows what to open.
   */
  files: string[];
}

export interface SkillParityModel {
  rows: SkillParityRow[];
  /** How many rows have a verdict other than `agreed`. */
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
 * Folds an already-computed analysis **by skill**.
 *
 * The point is not writing new comparison logic — the per-file verdict is already produced by
 * `analyzeAgentFiles` under the same contract as the CLI, and a second implementation means
 * nobody notices the day the two diverge. This **only folds**.
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
    // skill-copy's `path` is **relative to the skill tree** (`<skill>/SKILL.md`).
    const name = finding.path.split('/')[0];
    if (!name) continue;
    const bucket = finding.code === 'skill-copy-diverged' ? diverged : oneSided;
    const set = bucket.get(name) ?? new Set();
    set.add(finding.path.slice(name.length + 1) || finding.path);
    bucket.set(name, set);
  }

  // **With only one tree present, the parity question does not arise.** `.agents/skills` being
  // absent means "Codex was never set up", not that copies diverged. Drawing a "one-sided" row
  // per skill turns **one fact into eleven rows** and makes a vault where nothing is wrong look
  // full of problems. The CLI answers this case `not-applicable` too — a contract test caught the
  // mismatch and produced this branch (2026-07-29).
  const treesInPlay = new Set<string>();
  for (const set of present.values()) for (const tree of set) treesInPlay.add(tree);
  if (treesInPlay.size < 2) return { rows: [], disagreeing: 0 };

  const rows: SkillParityRow[] = [...present.keys()].sort().map((name) => {
    const trees = [...(present.get(name) ?? [])].sort();
    // A skill folder missing entirely from one tree is one-sided as well. That produces no
    // per-file finding (there is no pair to compare), so it is decided here.
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
