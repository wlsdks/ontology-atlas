import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { constructionPrompts } from './construction-prompts.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['src/i18n/locales.ts', 'src/i18n/answer-language.ts',
  'src/features/acp-session/model/use-acp-session.ts',
  'src/features/first-run-starter/model/build-from-code-prompt.ts'];

test('reads the current shared language helper without loading the app', () => {
  const root = mkdtempSync(join(tmpdir(), 'construction-prompts-'));
  try {
    for (const file of files) cpSync(join(checkout, file), join(root, file), { recursive: true });
    const target = '/tmp/code with spaces';
    const before = constructionPrompts(root, target, 'ko');
    const file = join(root, files[1]);
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace('const name = answerLanguageName(locale, meta);',
      'const name = "changed-helper";'));
    const after = constructionPrompts(root, target, 'ko');
    assert.notEqual(before.handoff, after.handoff);
    assert.equal(before.firstTurn, after.firstTurn);
    assert.ok(after.handoff.includes('changed-helper'));
    assert.ok(after.firstTurn.includes(target));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('refuses a missing prompt declaration instead of replaying stale text', () => {
  const root = mkdtempSync(join(tmpdir(), 'construction-prompts-'));
  try {
    for (const file of files) cpSync(join(checkout, file), join(root, file), { recursive: true });
    const file = join(root, files[3]);
    writeFileSync(file, readFileSync(file, 'utf8').replace('function buildFromCodePrompt(',
      'function retiredPrompt('));
    assert.throws(() => constructionPrompts(root, '/tmp/code'), /declaration missing/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
