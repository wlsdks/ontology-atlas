import type { RecheckConcept, RecheckRecord, RoundPassEntry, RoundPassOutcome } from "@/entities/library-round";
import {
  RECHECK_DIFF_MAX_LINES,
  RECHECK_MAX_SENT_BYTES,
  applyRecheckReply,
  buildRecheckBrief,
  chooseRecheckCandidates,
  leftBefore,
  recheckBriefHeader,
  recheckBriefSection,
  type RecheckCandidate,
  type TakenConcept,
} from "@/features/library-rounds";
import type { RecheckCommitResult, RecheckDiff, RecheckDocumentWrite, RecheckGitState } from "@/shared/lib/git/tauri-recheck";

import type { SourceRead } from "./agent-turn-summary";
import type { PassEntryStart } from "./round-pass-entry";

/**
 * One recheck run, from Git's go-ahead to its commit. Every effect goes through `ports`, so the
 * order of checks (no agent turn while held, no write after a moved `HEAD`) is tested without a desktop.
 */

export interface RecheckTurn {
  stopped: boolean;
  failed: boolean;
  /** The agent's whole last message. */
  reply: string | null;
  /** Files the agent read as source text through `analyze_repo_structure` `sourceReads`. */
  sourceReads: readonly SourceRead[];
  refused: string[];
  called: string[];
}

export interface RecheckPassPorts {
  gitState(): Promise<RecheckGitState | null>;
  /** Stale concepts of every kind, as `validate_vault` judges them; `null` when Git history cannot be read. */
  staleCandidates(): Promise<RecheckCandidate[] | null>;
  uncommitted(vaultPaths: readonly string[], repoPaths: readonly string[]): Promise<string[] | null>;
  readDocument(path: string): Promise<string | null>;
  diffs(requests: readonly { commit: string; path: string }[], maxLines: number): Promise<RecheckDiff[] | null>;
  agentTurn(brief: string): Promise<RecheckTurn>;
  commit(input: { roundId: string; passId: string; expectedHead: string; message: string; documents: readonly RecheckDocumentWrite[] }): Promise<RecheckCommitResult | null>;
}

export interface RecheckPassInput {
  ports: RecheckPassPorts;
  roundId: string;
  limit: number;
  trigger: RoundPassEntry["trigger"];
  passId: string;
  vaultRoot: string;
  locale: string;
  agentReady: boolean;
  /** The ledger so far, oldest first. */
  previous: readonly RoundPassEntry[];
  /** Slugs a person raised with `review_state: human_decides`. */
  raised: ReadonlySet<string>;
}

export interface RecheckPassResult {
  outcome: RoundPassOutcome;
  checked: number;
  agentTurns: 0 | 1;
  refused: string[];
  called: string[];
  note?: RoundPassEntry["note"];
  leftAsIs?: string[];
  recheck: RecheckRecord;
}

/** `git_recheck_diffs` answers at most this many requests per call. */
const DIFF_REQUEST_CAP = 256;
const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/** Git refused this schedule's last commit and no run has committed since. */
export function refusedLastCommit(entries: readonly RoundPassEntry[], roundId: string): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const recheck = entries[index]!.recheck;
    if (entries[index]!.roundId !== roundId || !recheck || recheck.undoOf) continue;
    if (recheck.commit) return null;
    if (recheck.error === "commit-refused") return recheck.detail ?? "";
  }
  return null;
}

export function recheckCommitMessage(concepts: readonly RecheckConcept[]): string {
  const marked = concepts.filter((concept) => concept.outcome === "accurate");
  const group = (title: string, outcome: RecheckConcept["outcome"]) => {
    const slugs = concepts.filter((concept) => concept.outcome === outcome).map((concept) => `- ${concept.slug}`);
    return slugs.length > 0 ? [`${title}:`, ...slugs, ""] : [];
  };
  return [
    `docs: recheck ${marked.length} ${marked.length === 1 ? "concept" : "concepts"} against the code`,
    "",
    ...group("Still accurate", "accurate"),
    ...group("Out of date, left as it is", "outdated"),
    ...group("Not decided, left as it is", "left"),
  ].join("\n").trimEnd() + "\n";
}

function emptyRecord(head: string | null): RecheckRecord {
  const record: RecheckRecord = { concepts: [], sentBytes: 0, waiting: 0, skippedUncommitted: 0, ignored: 0 };
  if (head) record.head = head;
  return record;
}

/**
 * Answers the agent gave that Atlas could not record read as "Not decided". They carry no
 * basis, so the next run takes them again instead of parking them on a commit Git refused.
 */
function unmarked(concepts: readonly RecheckConcept[]): RecheckConcept[] {
  return concepts.map((concept) => {
    if (concept.outcome !== "accurate") return concept;
    const { basis: _basis, ...rest } = concept;
    return { ...rest, outcome: "left" };
  });
}

const ID = /^[A-Za-z0-9-]{1,64}$/;

/** Reads under the repository's own root count; a read of another folder says nothing here. */
function readsUnder(reads: readonly SourceRead[], repoRoot: string | null): Set<string> {
  const trim = (path: string) => path.replace(/[\\/]+$/, "");
  const root = repoRoot ? trim(repoRoot) : null;
  return new Set(reads.filter((read) => root !== null && read.root !== null && trim(read.root) === root).map((read) => read.path));
}

export async function runRecheckPass(input: RecheckPassInput): Promise<RecheckPassResult> {
  const { ports } = input;
  // Git refuses these names at the commit; finding out after the agent's turn would waste it.
  if (!ID.test(input.roundId) || !ID.test(input.passId)) throw new Error("the schedule or run id is not one Git accepts");
  const state = await ports.gitState();
  const head = state?.head ?? null;
  const record = emptyRecord(head);
  const finish = (outcome: RoundPassOutcome, extra: Partial<RecheckPassResult> = {}): RecheckPassResult => ({
    outcome,
    checked: 0,
    agentTurns: 0,
    refused: [],
    called: [],
    recheck: record,
    ...extra,
  });

  if (!state || !state.repository || !head) {
    record.hold = { reason: "git", detail: state?.repository === false ? "not a Git repository" : "no commit yet" };
    return finish("held");
  }
  if (state.hold) {
    record.hold = { reason: state.hold.reason, detail: state.hold.detail };
    return finish("held");
  }
  const refusal = refusedLastCommit(input.previous, input.roundId);
  if (refusal !== null && input.trigger !== "manual") {
    record.hold = { reason: "refused", detail: refusal };
    return finish("held");
  }

  const candidates = await ports.staleCandidates();
  if (!candidates) throw new Error("Git history could not be read");
  const uncommitted = await ports.uncommitted(
    candidates.map((candidate) => candidate.path),
    [...new Set(candidates.flatMap((candidate) => candidate.moved))],
  );
  if (!uncommitted) throw new Error("Git status could not be read");
  const { ordered, skippedUncommitted } = chooseRecheckCandidates({
    candidates,
    uncommitted: new Set(uncommitted),
    raised: input.raised,
    left: leftBefore(input.previous, input.roundId),
  });
  record.skippedUncommitted = skippedUncommitted;
  if (ordered.length === 0) return finish("held");

  const budget = RECHECK_MAX_SENT_BYTES - byteLength(recheckBriefHeader(input.vaultRoot, input.locale));
  const taken = await takeCandidates(ports, ordered, input.limit, budget);
  record.waiting = ordered.length - taken.length;
  const sent = taken.filter((item) => item.refusedPath === null && !item.tooLarge);
  const leftRefused: RecheckConcept[] = taken.flatMap((item): RecheckConcept[] => {
    const base = { slug: item.candidate.slug, path: item.candidate.path, outcome: "left" as const, files: [], basis: item.candidate.basis };
    if (item.refusedPath !== null) return [{ ...base, leftReason: "refused-path", leftPath: item.refusedPath }];
    return item.tooLarge ? [{ ...base, leftReason: "too-large" }] : [];
  });
  record.concepts = leftRefused;
  const checked = taken.length;
  if (sent.length === 0) return finish("rechecked", { checked });
  if (!input.agentReady) return finish("failed", { checked: 0, note: "no-agent", recheck: { ...record, concepts: [] } });

  const brief = buildRecheckBrief({
    vaultRoot: input.vaultRoot,
    locale: input.locale,
    concepts: sent.map((item) => ({ slug: item.candidate.slug, text: item.text, files: item.files })),
  });
  record.sentBytes = byteLength(brief);
  const turn = await ports.agentTurn(brief);
  const toolFacts = { agentTurns: 1 as const, refused: turn.refused, called: turn.called };
  if (turn.stopped) return finish("failed", { ...toolFacts, checked, note: "stopped" });

  const takenConcepts: TakenConcept[] = sent.map((item) => ({
    slug: item.candidate.slug,
    path: item.candidate.path,
    text: item.text,
    files: item.files.map((file) => ({ path: file.path, cut: file.cut })),
    basis: item.candidate.basis,
  }));
  const sourceReads = readsUnder(turn.sourceReads, state.repoRoot);
  const applied = turn.failed ? null : applyRecheckReply({ taken: takenConcepts, reply: turn.reply, sourceReads, commit: head });
  if (!applied) {
    record.error = "reply-unreadable";
    return finish("failed", { ...toolFacts, checked });
  }
  record.ignored = applied.ignored;
  record.concepts = [...applied.concepts, ...leftRefused];
  if (applied.marks.length === 0) return finish("rechecked", { ...toolFacts, checked });

  const committed = await ports.commit({
    roundId: input.roundId,
    passId: input.passId,
    expectedHead: head,
    message: recheckCommitMessage(record.concepts),
    documents: applied.marks,
  });
  if (!committed) throw new Error("the desktop bridge is not available");
  const meanwhile = new Set(committed.changedMeanwhile);
  record.concepts = record.concepts.map((concept) =>
    concept.outcome === "accurate" && meanwhile.has(concept.path) ? { ...concept, outcome: "left", leftReason: "changed-meanwhile" } : concept,
  );
  if (committed.outcome === "committed" && committed.commit) {
    record.commit = committed.commit;
    if (committed.rewritten.length > 0) {
      // The commit stays for the person to read and undo; Atlas never rewrites history.
      record.error = "commit-rewritten";
      record.rewritten = committed.rewritten;
      return finish("failed", { ...toolFacts, checked });
    }
    return finish("rechecked", { ...toolFacts, checked });
  }
  if (committed.outcome === "nothing") return finish("rechecked", { ...toolFacts, checked });
  record.concepts = unmarked(record.concepts);
  if (committed.outcome === "held" && committed.hold) {
    record.error = "commit-held";
    record.hold = committed.hold;
    return finish("failed", { ...toolFacts, checked });
  }
  if (committed.outcome === "head-moved") {
    record.error = "head-moved";
    return finish("failed", { ...toolFacts, checked });
  }
  record.error = "commit-refused";
  record.detail = committed.detail ?? "";
  record.restored = committed.restored.length;
  if (committed.copy) record.copy = committed.copy;
  return finish("failed", { ...toolFacts, checked, ...(committed.left.length > 0 ? { leftAsIs: committed.left } : {}) });
}

interface SizedCandidate {
  candidate: RecheckCandidate;
  text: string;
  files: { path: string; diff: string; cut: boolean; lines: number }[];
  /** The first cited path the code reader refuses; nothing of this concept is sent. */
  refusedPath: string | null;
  /** Its part of the brief alone is over the run's budget; nothing of it is sent. */
  tooLarge: boolean;
}

/**
 * Takes candidates in order until `limit`, reading each one's document and the diff of each moved
 * file, while their parts of the brief fit `budget` bytes; at the first that does not fit, the
 * rest wait and nothing more is read. A concept with a refused path is taken without reading
 * anything of it, and one too large for any run is taken and not sent, so each is reported
 * rather than retried unseen.
 */
async function takeCandidates(ports: RecheckPassPorts, ordered: readonly RecheckCandidate[], limit: number, budget: number): Promise<SizedCandidate[]> {
  const taken: SizedCandidate[] = [];
  let bytes = 0;
  let sentCount = 0;
  for (const candidate of ordered) {
    if (taken.length >= limit) break;
    const found = new Map<string, RecheckDiff>();
    for (let start = 0; start < candidate.moved.length; start += DIFF_REQUEST_CAP) {
      const requests = candidate.moved.slice(start, start + DIFF_REQUEST_CAP).map((path) => ({ commit: candidate.docCommit, path }));
      for (const diff of (await ports.diffs(requests, RECHECK_DIFF_MAX_LINES)) ?? []) found.set(diff.path, diff);
    }
    const refused = candidate.moved.find((path) => found.get(path)?.refused);
    if (refused !== undefined) {
      taken.push({ candidate, text: "", files: [], refusedPath: refused, tooLarge: false });
      continue;
    }
    const files = candidate.moved.flatMap((path) => {
      const diff = found.get(path);
      return diff && diff.diff !== null ? [{ path, diff: diff.diff, cut: diff.cut, lines: diff.lines }] : [];
    });
    if (files.length !== candidate.moved.length) continue;
    const text = await ports.readDocument(candidate.path);
    if (text === null) continue;
    const size = byteLength(recheckBriefSection({ slug: candidate.slug, text, files }, sentCount)) + 1;
    if (size > budget) {
      taken.push({ candidate, text: "", files: [], refusedPath: null, tooLarge: true });
      continue;
    }
    if (bytes + size > budget) break;
    bytes += size;
    sentCount += 1;
    taken.push({ candidate, text, files, refusedPath: null, tooLarge: false });
  }
  return taken;
}

/** The ledger line of a finished run. */
export function buildRecheckPassEntry(input: {
  start: PassEntryStart;
  endedAt: Date;
  result: RecheckPassResult;
}): RoundPassEntry {
  const { result } = input;
  const written = result.recheck.commit
    ? result.recheck.concepts.filter((concept) => concept.outcome === "accurate").map((concept) => concept.path)
    : [];
  const entry: RoundPassEntry = {
    ...input.start,
    endedAt: input.endedAt.toISOString(),
    outcome: result.outcome,
    checked: result.checked,
    stale: [],
    written,
    refused: result.refused,
    called: result.called,
    agentTurns: result.agentTurns,
    summary: "",
    recheck: result.recheck,
  };
  if (result.note) entry.note = result.note;
  if (result.leftAsIs) entry.leftAsIs = result.leftAsIs;
  return entry;
}

/** The line an undo appends: it names the run it undid and the documents it put back. */
export function buildRecheckUndoEntry(input: {
  id: string;
  run: RoundPassEntry;
  at: Date;
  commit: string | null;
  undone: readonly string[];
}): RoundPassEntry {
  const at = input.at.toISOString();
  const recheck: RecheckRecord = { concepts: [], sentBytes: 0, waiting: 0, skippedUncommitted: 0, ignored: 0, undoOf: input.run.id, undone: [...input.undone] };
  if (input.commit) recheck.commit = input.commit;
  const entry: RoundPassEntry = {
    v: 1,
    id: input.id,
    kind: "recheck",
    startedAt: at,
    endedAt: at,
    outcome: "rechecked",
    checked: 0,
    stale: [],
    written: [...input.undone],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: "",
    trigger: "manual",
    recheck,
  };
  if (input.run.roundId) entry.roundId = input.run.roundId;
  if (input.run.roundName) entry.roundName = input.run.roundName;
  return entry;
}

/** The line written when Atlas opens after quitting in the middle of a run's commit. */
export function buildInterruptedRecheckEntry(input: {
  id: string;
  roundId: string;
  roundName: string | undefined;
  at: Date;
  restored: number;
}): RoundPassEntry {
  const at = input.at.toISOString();
  const entry: RoundPassEntry = {
    v: 1,
    id: input.id,
    roundId: input.roundId,
    kind: "recheck",
    startedAt: at,
    endedAt: at,
    outcome: "failed",
    checked: 0,
    stale: [],
    written: [],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: "",
    trigger: "manual",
    recheck: { concepts: [], sentBytes: 0, waiting: 0, skippedUncommitted: 0, ignored: 0, error: "interrupted", restored: input.restored },
  };
  if (input.roundName) entry.roundName = input.roundName;
  return entry;
}

export function recheckUndoMessage(slugs: readonly string[]): string {
  return [
    `docs: undo the recheck of ${slugs.length} ${slugs.length === 1 ? "concept" : "concepts"}`,
    "",
    ...slugs.map((slug) => `- ${slug}`),
  ].join("\n") + "\n";
}
