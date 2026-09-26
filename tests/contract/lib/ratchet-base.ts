import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * **Judge a change against its own merge base, not against a number in a file.**
 *
 * A ratchet that stores its baseline as a literal (`CEILING = 280`) is a shared write
 * target: every branch that lowers or raises the count edits the same line, so two
 * parallel branches that each improve the metric conflict, and a bundle merge has to
 * recount by hand. That happened on 2026-09-26, twice in one day.
 *
 * This helper removes the counter. The ratchet measures the working tree, then
 * measures the **same metric with the same code** on the merge-base tree, and fails
 * only when this change made it worse. A saving needs no bookkeeping: the next
 * branch's merge base already contains it, so it cannot be spent again. That is what
 * the old "lower the literal" test existed to enforce, and it now holds for free.
 *
 * **A deliberate raise** is a file, not a line: `tests/contract/ratchet-raises/<gate>.<slug>.json`
 * with `{ "gate", "raise", "why" }`. Only records this change adds (absent at the merge
 * base) widen its ceiling, so the reason is reviewed in the diff that needs it, and two
 * branches raising the same gate add two files instead of editing one line. A commit
 * trailer would say the same thing, but the landing train squashes branches, so a
 * trailer is not reliably visible to the lane that has to honor it; a file is.
 *
 * **No merge base** (a shallow clone, or no `origin/main`) falls back to the absolute
 * ceiling recorded when the gate was converted, plus every raise record ever landed.
 * That ceiling is never edited and never has to be tight; it only keeps the gate from
 * passing vacuously where there is nothing to compare against. It is also applied when
 * a base exists, so a tree compared with itself (a push to `main`) still meets a floor.
 * The CI lanes that run contracts check out with `fetch-depth: 0`, so they compare.
 */

export const RAISES_DIR = "tests/contract/ratchet-raises";

export type Raise = { file: string; gate: string; raise: number; why: string };

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/**
 * Same resolution as `scripts/check-decision-record.mjs`: `DECISION_BASE_REF` when CI
 * supplies one, then the merge base with `origin/main`, then with `main`.
 */
export function resolveRatchetBase(cwd = process.cwd(), env = process.env): string | null {
  const candidates = [env.DECISION_BASE_REF, "origin/main", "main"].filter(Boolean) as string[];
  for (const ref of candidates) {
    try {
      return git(["merge-base", "HEAD", ref], cwd);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const CACHE_ROOT = join(tmpdir(), "atlas-ratchet-base");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Extract `paths` of commit `sha` into a cached directory and return it, so the same
 * filesystem census that measured the working tree can measure the base unchanged.
 * `git archive` reads objects only: no worktree, no index, no checkout. Paths absent
 * at the base are skipped. Contract files run in parallel workers, so the extraction
 * lands in a private directory and is renamed into place once complete.
 */
export function materializeBase(sha: string, paths: readonly string[], cwd = process.cwd()): string {
  const key = createHash("sha1").update([sha, ...paths].join("\0")).digest("hex").slice(0, 20);
  const dir = join(CACHE_ROOT, key);
  if (existsSync(join(dir, ".complete"))) return dir;

  mkdirSync(CACHE_ROOT, { recursive: true });
  pruneCache(dir);
  const present = paths.filter((p) => {
    try {
      return git(["ls-tree", "--name-only", sha, "--", p], cwd) !== "";
    } catch {
      return false;
    }
  });
  const staging = `${dir}.${process.pid}.${Date.now()}`;
  mkdirSync(staging, { recursive: true });
  if (present.length > 0) {
    const tar = execFileSync("git", ["archive", "--format=tar", sha, "--", ...present], {
      cwd,
      maxBuffer: 1 << 30,
      stdio: ["ignore", "pipe", "ignore"],
    });
    execFileSync("tar", ["-x", "-f", "-", "-C", staging], { input: tar });
  }
  writeFileSync(join(staging, ".complete"), sha);
  try {
    renameSync(staging, dir);
  } catch {
    // Another worker finished first; its copy is identical.
    rmSync(staging, { recursive: true, force: true });
  }
  return dir;
}

function pruneCache(keep: string): void {
  for (const name of readdirSync(CACHE_ROOT)) {
    const p = join(CACHE_ROOT, name);
    if (p === keep) continue;
    try {
      if (Date.now() - statSync(p).mtimeMs > CACHE_TTL_MS) rmSync(p, { recursive: true, force: true });
    } catch {
      // raced with another worker's prune
    }
  }
}

/** Every raise record in the working tree, validated. A malformed record throws rather than counting as zero. */
export function readRaises(cwd = process.cwd()): Raise[] {
  const dir = join(cwd, RAISES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = `${RAISES_DIR}/${name}`;
      const record = JSON.parse(readFileSync(join(cwd, file), "utf8")) as Partial<Raise>;
      const problems = raiseProblems(name, record);
      if (problems.length > 0) throw new Error(`${file}: ${problems.join("; ")}`);
      return { file, gate: record.gate!, raise: record.raise!, why: record.why! };
    });
}

export function raiseProblems(name: string, record: Partial<Raise>): string[] {
  const problems: string[] = [];
  if (typeof record.gate !== "string" || record.gate === "") problems.push("`gate` must name the ratchet");
  else if (!name.startsWith(`${record.gate}.`)) problems.push(`file name must start with "${record.gate}."`);
  if (!Number.isInteger(record.raise) || (record.raise ?? 0) <= 0) problems.push("`raise` must be a positive integer");
  if (typeof record.why !== "string" || record.why.trim().length < 40) {
    problems.push("`why` must say, in a sentence, why this growth is deliberate");
  }
  return problems;
}

function raiseFilesAt(sha: string, cwd: string): Set<string> {
  try {
    return new Set(git(["ls-tree", "-r", "--name-only", sha, "--", `${RAISES_DIR}/`], cwd).split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

export type RatchetJudgement = {
  gate: string;
  current: number;
  ceiling: number;
  base: string | null;
  atBase: number | null;
  /** Raise records this change adds (absent at the base). */
  added: Raise[];
  /** Fallback ceiling plus every raise record in the tree. */
  absolute: number;
  explain: string;
};

export type RatchetSpec = {
  /** Stable id; raise records name it. */
  gate: string;
  /** Measure the metric with the tree rooted at `root` (the working tree, or the extracted base). */
  measure: (root: string) => number;
  /** What `measure` reads, relative to the repository root; only these are extracted at the base. */
  reads: readonly string[];
  /** The value when the gate was converted. Never edited; used without a base and as a floor. */
  fallback: number;
  cwd?: string;
  /** Injected in probes; defaults to {@link resolveRatchetBase}. */
  base?: string | null;
};

export function judgeRatchet(spec: RatchetSpec): RatchetJudgement {
  const cwd = spec.cwd ?? process.cwd();
  const base = spec.base === undefined ? resolveRatchetBase(cwd) : spec.base;
  const raises = readRaises(cwd).filter((r) => r.gate === spec.gate);
  const absolute = spec.fallback + raises.reduce((sum, r) => sum + r.raise, 0);
  const current = spec.measure(cwd);

  let atBase: number | null = null;
  let added: Raise[] = [];
  if (base !== null) {
    try {
      atBase = spec.measure(materializeBase(base, spec.reads, cwd));
    } catch {
      atBase = null;
    }
    if (atBase !== null) {
      const landed = raiseFilesAt(base, cwd);
      added = raises.filter((r) => !landed.has(r.file));
    }
  }
  const relative = atBase === null ? Infinity : atBase + added.reduce((sum, r) => sum + r.raise, 0);
  const ceiling = Math.min(relative, absolute);

  const lines = [
    atBase === null
      ? `no merge base to compare with — judged against the absolute ceiling ${absolute}`
      : `merge base ${base!.slice(0, 9)} measures ${atBase}; this change measures ${current}`,
    ...added.map((r) => `  +${r.raise} allowed by ${r.file}`),
    `To grow deliberately, add ${RAISES_DIR}/${spec.gate}.<slug>.json with`,
    `{ "gate": "${spec.gate}", "raise": <n>, "why": "<the sentence a reviewer needs>" }.`,
  ];
  return { gate: spec.gate, current, ceiling, base, atBase, added, absolute, explain: lines.join("\n") };
}
