#!/usr/bin/env node
// Subject-shape and language checks for `.githooks/commit-msg`. They live in this
// file so
// `scripts/claude-hooks.test.mjs` can call the decision directly instead of
// spawning a shell, and so the pattern sits beside its tests.
//
// The character classes match `agent-language` in `cli/src/lib/agent-files.mjs`:
// Hangul, kana and Han. Emoji, accented Latin and typographic dashes stay legal
// — the gate is about the language a reader must know, not ASCII purity.

import { readFileSync } from 'node:fs';

// Includes the Jamo blocks (U+1100-11FF; U+3130-318F, the compatibility jamo
// used for laughter shorthand; U+A960-A97F; U+D7B0-D7FF) and halfwidth
// Kana/Hangul (U+FF65-FFDC): the
// repo's own markdown-language HANGUL class already counts them, and a
// jamo-only Korean subject used to pass this gate (bug sweep 2026-09-01).
// Mirror: cli/src/lib/agent-files.mjs NON_ENGLISH_SCRIPT_RE.
const NON_ENGLISH_SCRIPT_RE =
  /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFF65-\uFFDC]/u;

// A merge, revert, squash or fixup subject is generated from text that already
// exists. Blocking it would force someone to edit history they did not write.
const GENERATED_SUBJECT = /^(Merge |Revert |squash! |fixup! |amend! )/;

/**
 * The prefix list from `.claude/rules/git.md`, section "Commit messages".
 *
 * ⚠️ **The reason this is enforced and not merely written down (2026-09-12).** The
 * rule has said "allowed prefixes" since the repository started, and the language
 * gate beside it was added on 2026-08-24 for exactly the reason that a rule nothing
 * checks is not a rule. The shape half stayed unchecked, and `wip`, `wip2`, `wip3`
 * reached a branch — subjects that say nothing to the reviewer, to `git log`
 * archaeology, or to the next agent reading history for context, which is the whole
 * audience a commit message has.
 *
 * An optional `(scope)` is allowed because the repository already uses it
 * (`feat(map):`, `design(library):`). Nothing else is: an invented prefix defeats
 * the point of having a list.
 *
 * `design` is on the list because a census of the last 200 subjects found it 9 times,
 * including the commit this gate landed on. `.claude/rules/git.md` had not listed it.
 * A gate that refuses a prefix the repository actively and deliberately writes is a
 * gate somebody reaches past on its first day, so the rule was corrected to the
 * practice rather than the practice to the stale rule — the design gates are a
 * first-class workflow here and their commits say so.
 */
const ALLOWED_PREFIXES = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'chore',
  'test',
  'style',
  'perf',
  'design',
];
const SUBJECT_SHAPE = new RegExp(`^(?:${ALLOWED_PREFIXES.join('|')})(?:\\([^()\\s]+\\))?: \\S`);

export function checkCommitMessage(raw) {
  const meaningful = raw.split('\n').filter((line) => !line.startsWith('#'));
  const text = meaningful.join('\n').trim();
  if (text === '') return { ok: true, reason: 'empty' };
  if (GENERATED_SUBJECT.test(text)) return { ok: true, reason: 'generated' };

  const subject = text.split('\n')[0];
  if (!SUBJECT_SHAPE.test(subject)) return { ok: false, reason: 'shape', subject };

  const offenders = [];
  meaningful.forEach((line, index) => {
    if (NON_ENGLISH_SCRIPT_RE.test(line)) offenders.push({ line: index + 1, text: line });
  });
  return offenders.length === 0
    ? { ok: true, reason: 'english' }
    : { ok: false, reason: 'non-english', offenders };
}

export function formatRejection(verdict) {
  const red = '\u001b[31m';
  const reset = '\u001b[0m';
  if (verdict.reason === 'shape') {
    // A blocked agent reads only this text, so it carries the whole list and one
    // corrected example rather than a pointer to go and look the rule up.
    return `${[
      '',
      `${red}commit-msg${reset}  the subject needs a conventional prefix.`,
      '',
      `    ${verdict.subject}`,
      '',
      `  Allowed: ${ALLOWED_PREFIXES.map((prefix) => `${prefix}:`).join(' · ')}`,
      '  An optional scope goes in parentheses, and a space follows the colon:',
      '      feat(map): let the walked constellation keep one fact per channel',
      '',
      '  Merge, revert, squash and fixup subjects are exempt; Git writes those.',
      '  Basis: .claude/rules/git.md, section "Commit messages".',
      '  "wip" is not a prefix: the subject is what the reviewer and `git log`',
      '  archaeology get, so it has to say what changed.',
      '',
    ].join('\n')}\n`;
  }
  const lines = [
    '',
    `${red}commit-msg${reset}  the commit message must be English.`,
    '',
    ...verdict.offenders.map(({ line, text }) => `    ${line}: ${text}`),
    '',
    '  Basis: .claude/rules/git.md, section "Commit messages".',
    '  The subject states what changed; the body states why.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && process.argv[1].endsWith('commit-msg-language.mjs') && process.argv[2]) {
  const verdict = checkCommitMessage(readFileSync(process.argv[2], 'utf8'));
  if (verdict.ok) process.exit(0);
  process.stderr.write(formatRejection(verdict));
  process.exit(1);
}
