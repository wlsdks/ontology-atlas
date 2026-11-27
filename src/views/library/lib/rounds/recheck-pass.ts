import type { RecheckConcept, RecheckRecord, RoundPassEntry, RoundPassOutcome } from "@/entities/library-round";
import {
  RECHECK_DIFF_MAX_LINES,
  RECHECK_MAX_SENT_BYTES,
  applyRecheckReply,
  buildRecheckBrief,
  chooseRecheckCandidates,
  leftBefore,
  type RecheckCandidate,
  type TakenConcept,
} from "@/features/library-rounds";
import type { RecheckCommitResult, RecheckDiff, RecheckDocumentWrite, RecheckGitState } from "@/shared/lib/git/tauri-recheck";

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
  /** Repository paths the agent read through `analyze_repo_structure` `sourceReads`. */
  sourceReads: readonly string[];
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

/** Answers the agent gave that Atlas did not act on read as "Not decided". */
function unmarked(concepts: readonly RecheckConcept[], reason?: RecheckConcept["leftReason"]): RecheckConcept[] {
  return concepts.map((concept) => {
    if (concept.outcome !== "accurate") return concept;
    const left: RecheckConcept = { ...concept, outcome: "left" };
    if (reason) left.leftReason = reason;
    return left;
  });
}

export async function runRecheckPass(input: RecheckPassInput): Promise<RecheckPassResult> {
  const { ports } = input;
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

  const taken = await takeCandidates(ports, ordered, input.limit);
  record.waiting = ordered.length - taken.length;
  const refusedConcepts = taken.filter((item) => item.refusedPath !== null);
  const sent = taken.filter((item) => item.refusedPath === null);
  const leftRefused: RecheckConcept[] = refusedConcepts.map((item) => ({
    slug: item.candidate.slug,
    path: item.candidate.path,
    outcome: "left",
    files: [],
    leftReason: "refused-path",
    leftPath: item.refusedPath!,
    basis: item.candidate.basis,
  }));
  record.concepts = leftRefused;
  const checked = taken.length;
  if (sent.length === 0) return finish("rechecked", { checked });
  if (!input.agentReady) return finish("failed", { checked: 0, note: "no-agent", recheck: { ...record, concepts: [] } });

  record.sentBytes = sent.reduce((total, item) => total + item.bytes, 0);
  const brief = buildRecheckBrief({
    vaultRoot: input.vaultRoot,
    locale: input.locale,
    concepts: sent.map((item) => ({ slug: item.candidate.slug, text: item.text, files: item.files })),
  });
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
  const applied = turn.failed ? null : applyRecheckReply({ taken: takenConcepts, reply: turn.reply, sourceReads: new Set(turn.sourceReads), commit: head });
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
    return finish("rechecked", { ...toolFacts, checked });
  }
  if (committed.outcome === "nothing") return finish("rechecked", { ...toolFacts, checked });
  record.concepts = unmarked(record.concepts);
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
  bytes: number;
}

/**
 * Takes candidates in order until `limit`, reading each one's document and the diff of each moved
 * file; one that would take the run past `RECHECK_MAX_SENT_BYTES` waits. A concept with a refused
 * path is taken without reading anything of it, so it is reported rather than retried unseen.
 */
async function takeCandidates(ports: RecheckPassPorts, ordered: readonly RecheckCandidate[], limit: number): Promise<SizedCandidate[]> {
  const taken: SizedCandidate[] = [];
  let bytes = 0;
  for (const candidate of ordered) {
    if (taken.length >= limit) break;
    const found = new Map<string, RecheckDiff>();
    for (let start = 0; start < candidate.moved.length; start += DIFF_REQUEST_CAP) {
      const requests = candidate.moved.slice(start, start + DIFF_REQUEST_CAP).map((path) => ({ commit: candidate.docCommit, path }));
      for (const diff of (await ports.diffs(requests, RECHECK_DIFF_MAX_LINES)) ?? []) found.set(diff.path, diff);
    }
    const refused = candidate.moved.find((path) => found.get(path)?.refused);
    if (refused !== undefined) {
      taken.push({ candidate, text: "", files: [], refusedPath: refused, bytes: 0 });
      continue;
    }
    const files = candidate.moved.flatMap((path) => {
      const diff = found.get(path);
      return diff && diff.diff !== null ? [{ path, diff: diff.diff, cut: diff.cut, lines: diff.lines }] : [];
    });
    if (files.length !== candidate.moved.length) continue;
    const text = await ports.readDocument(candidate.path);
    if (text === null) continue;
    const size = byteLength(text) + files.reduce((total, file) => total + byteLength(file.diff), 0);
    if (bytes + size > RECHECK_MAX_SENT_BYTES) continue;
    bytes += size;
    taken.push({ candidate, text, files, refusedPath: null, bytes: size });
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
