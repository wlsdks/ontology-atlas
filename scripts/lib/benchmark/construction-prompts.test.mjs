import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { constructionPrompts, mapAreaPrompt } from './construction-prompts.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = ['src/i18n/locales.ts', 'src/i18n/answer-language.ts',
  'src/features/acp-session/model/runtime-wiring/vault-handoff-prompt.ts',
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

test('sends the map-area request the panel sends, read from the catalog at call time', () => {
  const root = mkdtempSync(join(tmpdir(), 'construction-prompts-'));
  try {
    const catalog = 'messages/en/acpChat.json';
    cpSync(join(checkout, catalog), join(root, catalog), { recursive: true });
    const prompt = mapAreaPrompt(root, 16, 383);
    assert.ok(prompt.startsWith('About 16% of the 383 abilities'));
    assert.ok(prompt.includes('validate_vault') && prompt.includes('Not mapped yet'));

    const messages = JSON.parse(readFileSync(join(root, catalog), 'utf8'));
    messages.suggest.mapArea.prompt = '{percent}% of {total}; {count} areas left.';
    writeFileSync(join(root, catalog), JSON.stringify(messages));
    assert.throws(() => mapAreaPrompt(root, 1, 2), /beyond percent and total/);

    delete messages.suggest.mapArea;
    writeFileSync(join(root, catalog), JSON.stringify(messages));
    assert.throws(() => mapAreaPrompt(root, 1, 2), /Map-area prompt missing/);
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
