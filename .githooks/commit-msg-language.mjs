#!/usr/bin/env node
// Language check for `.githooks/commit-msg`. It lives in its own file so
// `scripts/claude-hooks.test.mjs` can call the decision directly instead of
// spawning a shell, and so the pattern sits beside its tests.
//
// The character classes match `agent-language` in `cli/src/lib/agent-files.mjs`:
// Hangul, kana and Han. Emoji, accented Latin and typographic dashes stay legal
// — the gate is about the language a reader must know, not ASCII purity.

import { readFileSync } from 'node:fs';

// Includes the Jamo blocks (U+1100-11FF, U+3130-318F — "ㅋㅋ"/"ㄴㄴ" —
// U+A960-A97F, U+D7B0-D7FF) and halfwidth Kana/Hangul (U+FF65-FFDC): the
// repo's own markdown-language HANGUL class already counts them, and a
// jamo-only Korean subject used to pass this gate (bug sweep 2026-09-01).
// Mirror: cli/src/lib/agent-files.mjs NON_ENGLISH_SCRIPT_RE.
const NON_ENGLISH_SCRIPT_RE =
  /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFF65-\uFFDC]/u;

// A merge, revert, squash or fixup subject is generated from text that already
// exists. Blocking it would force someone to edit history they did not write.
const GENERATED_SUBJECT = /^(Merge |Revert |squash! |fixup! |amend! )/;

export function checkCommitMessage(raw) {
  const meaningful = raw.split('\n').filter((line) => !line.startsWith('#'));
  const text = meaningful.join('\n').trim();
  if (text === '') return { ok: true, reason: 'empty' };
  if (GENERATED_SUBJECT.test(text)) return { ok: true, reason: 'generated' };

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
