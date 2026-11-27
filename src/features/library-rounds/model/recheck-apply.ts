import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import type { RecheckConcept } from '@/entities/library-round';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

/**
 * What Atlas does with a recheck agent's reply. The agent holds no write tool; this decides what
 * a run changes: one `evidence_checked` line in each document the reply calls still accurate, and
 * nothing else. The document always comes from the run's own list, never from the reply.
 */

export const EVIDENCE_CHECKED_KEY = 'evidence_checked';
const REASON_MAX_CHARS = 400;

/** A concept the run sent: its document as read and what changed in each cited file. */
export interface TakenConcept {
  slug: string;
  /** Vault-relative document. */
  path: string;
  text: string;
  files: readonly { path: string; cut: boolean }[];
  basis: string;
}

export type RecheckVerdict = 'accurate' | 'outdated' | 'unsure';

export interface RecheckAnswer {
  slug: string;
  verdict: RecheckVerdict;
  reason: string;
  passage: string;
}

const VERDICTS: readonly RecheckVerdict[] = ['accurate', 'outdated', 'unsure'];

const cut = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, REASON_MAX_CHARS) : '');

/**
 * The answers in the reply's last fenced JSON block, `{"answers": [...]}`. `null` when there is no
 * such block or it does not parse: the run then changes nothing. An answer with an unknown verdict
 * or no slug is dropped, so its concept reads as unanswered.
 */
export function parseRecheckReply(reply: string | null): RecheckAnswer[] | null {
  if (!reply) return null;
  const blocks = [...reply.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  if (last === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(last);
  } catch {
    return null;
  }
  const answers = (parsed as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) return null;
  return answers.flatMap((answer): RecheckAnswer[] => {
    const item = answer as Record<string, unknown> | null;
    if (!item || typeof item.slug !== 'string' || !VERDICTS.includes(item.verdict as RecheckVerdict)) return [];
    return [{ slug: item.slug.trim(), verdict: item.verdict as RecheckVerdict, reason: cut(item.reason), passage: cut(item.passage) }];
  });
}

/** The frontmatter block with its closing fence line, and everything after it, byte for byte. */
function splitAtFence(text: string): { head: string; rest: string } | null {
  const match = /^﻿?---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? { head: match[0], rest: text.slice(match[0].length) } : null;
}

/** The text's lines, endings kept, without any `evidence_checked:` line. */
function linesWithoutMark(text: string): string[] {
  return (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).filter((line) => !line.startsWith(`${EVIDENCE_CHECKED_KEY}:`));
}

/** Equal frontmatter apart from the mark. */
function sameExceptMark(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete(EVIDENCE_CHECKED_KEY);
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

/**
 * `text` with `evidence_checked: <commit>`, through the frontmatter line patcher. The body after the
 * closing fence is carried over as it was, and the result must differ from `text` by that one line
 * alone and parse to the same frontmatter; anything else is `null` and the document stays as it is.
 */
export function markEvidenceChecked(text: string, commit: string): string | null {
  const before = splitAtFence(text);
  if (!before) return null;
  const patched = splitAtFence(applyFrontmatterUpdates(text, { [EVIDENCE_CHECKED_KEY]: commit }));
  if (!patched) return null;
  const after = patched.head + before.rest;
  const was = parseFrontmatter(text);
  const now = parseFrontmatter(after);
  if (now.frontmatter[EVIDENCE_CHECKED_KEY] !== commit || !sameExceptMark(now.frontmatter, was.frontmatter)) return null;
  const kept = linesWithoutMark(text);
  const left = linesWithoutMark(after);
  return kept.length === left.length && kept.every((line, index) => line === left[index]) ? after : null;
}

export interface RecheckApplied {
  /** Documents to write, each differing from what the run read by the mark alone. */
  marks: { path: string; before: string; after: string }[];
  concepts: RecheckConcept[];
  /** Answers naming a concept outside the run. */
  ignored: number;
}

/**
 * Settles each concept the run sent from the agent's answers. "Still accurate" on a cut diff counts
 * only when `sourceReads` shows the agent read that file. `null` when the reply cannot be read.
 */
export function applyRecheckReply({
  taken,
  reply,
  sourceReads,
  commit,
}: {
  taken: readonly TakenConcept[];
  reply: string | null;
  sourceReads: ReadonlySet<string>;
  /** `HEAD` when the run started: the commit the code was read at. */
  commit: string;
}): RecheckApplied | null {
  const answers = parseRecheckReply(reply);
  if (!answers) return null;
  const inRun = new Set(taken.map((concept) => concept.slug));
  const bySlug = new Map<string, RecheckAnswer>();
  const conflicting = new Set<string>();
  let ignored = 0;
  for (const answer of answers) {
    if (!inRun.has(answer.slug)) ignored += 1;
    else if (!bySlug.has(answer.slug)) bySlug.set(answer.slug, answer);
    else if (bySlug.get(answer.slug)!.verdict !== answer.verdict) conflicting.add(answer.slug);
  }
  // Two verdicts for one concept say nothing Atlas can act on.
  for (const slug of conflicting) bySlug.delete(slug);
  const marks: RecheckApplied['marks'] = [];
  const concepts = taken.map((concept): RecheckConcept => {
    const base = { slug: concept.slug, path: concept.path, files: concept.files.map((file) => file.path), basis: concept.basis };
    const answer = bySlug.get(concept.slug);
    if (!answer) return { ...base, outcome: 'left', leftReason: 'no-answer' };
    if (answer.verdict === 'outdated') return withText({ ...base, outcome: 'outdated' }, answer);
    if (answer.verdict === 'unsure') return withText({ ...base, outcome: 'left', leftReason: 'cannot-tell' }, answer);
    const unread = concept.files.find((file) => file.cut && !sourceReads.has(file.path));
    if (unread) return { ...base, outcome: 'left', leftReason: 'cut-unread', leftPath: unread.path };
    const after = markEvidenceChecked(concept.text, commit);
    if (after === null) return { ...base, outcome: 'left' };
    marks.push({ path: concept.path, before: concept.text, after });
    return { ...base, outcome: 'accurate' };
  });
  return { marks, concepts, ignored };
}

function withText(concept: RecheckConcept, answer: RecheckAnswer): RecheckConcept {
  if (answer.reason) concept.reason = answer.reason;
  if (answer.passage) concept.passage = answer.passage;
  return concept;
}
