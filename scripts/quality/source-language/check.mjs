#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  auditSourceCommentEntries,
  auditSourceStringEntries,
  isStringScannedPath,
  isSupportedSourcePath,
} from './inventory.mjs';

/**
 * Zero — and this time it is measured rather than assumed.
 *
 * Until 2026-08-24 the Rust tokenizer treated every `'` as a string quote, so one odd lifetime —
 * `&'static str` — put it inside a string for the rest of the file. `src-tauri/src/lib.rs` alone
 * lost 2,624 consecutive lines that way and reported **zero** Korean comments while holding 199.
 * Repairing the tokenizer recovered 1,085 comment tokens across the repository and revealed the
 * real figure: 9 files, 979 comment lines, 20,229 code points, all under `src-tauri/src/`.
 *
 * That debt was then paid rather than recorded: all 979 lines were translated to English in the
 * same round, verified line by line to have changed comment text only. So the number below is the
 * true one, and any increase is new debt rather than an old file finally being seen.
 */
export const SOURCE_COMMENT_LANGUAGE_BASELINES = Object.freeze({
  current: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
  testFixture: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
  historicalPrototype: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
});

/**
 * Korean that is **data**, named as a line rather than a count.
 *
 * A regex literal never reaches this list: `inventory.mjs` treats every regex as matcher data by
 * construction, which is what the verify scripts, `absorb`, and every slug builder rely on. What is
 * left here is Korean inside an ordinary string that is still not prose this repository writes.
 * Each row must keep matching something — `evaluateSourceStringLanguageGate` fails a row that has
 * stopped firing, because an exception that outlives its reason is indistinguishable from a file
 * nobody translated.
 */
export const SOURCE_STRING_LANGUAGE_ALLOWLIST = Object.freeze([
  Object.freeze({
    id: 'mcp-korean-user-input',
    path: 'mcp/src/index.js',
    why:
      'A `display_ko` example value and the Korean sentence a user actually types to start a '
      + 'bootstrap. Both are input the server must recognise, not output it writes.',
    allow: /이 codebase 분석해줘|"ko": "결제"/,
  }),
  Object.freeze({
    id: 'verify-app-korean-ui-labels',
    path: 'scripts/lib/verify-macos/payload-contract.mjs',
    why:
      'Comparisons against the installed app rendered in Korean. The literal is the expected UI '
      + 'label, so translating it would break the assertion instead of the copy.',
    allow: /\b(?:includes|startsWith|endsWith|test|some|every)\(|[=!]==/,
  }),
  Object.freeze({
    id: 'desktop-smoke-korean-titles',
    path: 'scripts/desktop-smoke.mjs',
    why: 'The expected `<title>` of each Korean route — the same expected-UI data, keyed by locale.',
    allow: /^\s*"ko:\/[^"]*":\s*".+ · Ontology Atlas",$/,
  }),
  Object.freeze({
    id: 'benchmark-korean-prompts',
    path: 'scripts/benchmark.mjs',
    why:
      'The prompts are the measurement stimulus. Transcripts recorded under docs/benchmark/results '
      + 'were produced with this exact wording, so rewriting them silently breaks comparability.',
    allow: /^\s*"[^"]*",?$/,
  }),
  Object.freeze({
    id: 'benchmark-scale-korean-prompt',
    path: 'scripts/benchmark-scale.mjs',
    why:
      'The same measurement stimulus as the row above, for the scale run — recorded results were '
      + 'produced with this wording, so rewriting it breaks comparability rather than a sentence.',
    allow: /^const PROMPT = `/,
  }),
]);

/**
 * Zero everywhere the strings are already English, and one measured debt.
 *
 * Measured 2026-08-31: the release scripts and the MCP server printed Korean on ~250 lines that
 * `source:language` could not see, because it reads comment tokens and a string literal is not a
 * comment — the same blind spot `cli-output-language.contract.test.ts` was written for after the
 * CLI printed Korean on 140 lines under a green gate. Those lines were translated rather than
 * recorded, so every scope below starts at zero: a new Korean runtime string anywhere in these
 * scopes is a regression, and the only way to admit one is an allowlist row with a reason.
 */
export const SOURCE_STRING_LANGUAGE_BASELINES = Object.freeze({
  scripts: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
  mcpServer: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
  cliCommands: Object.freeze({
    unexpectedFiles: 0,
    unexpectedLanguageCodePoints: 0,
  }),
});

export function evaluateSourceStringLanguageGate(
  audit,
  baselines = SOURCE_STRING_LANGUAGE_BASELINES,
  allowlist = SOURCE_STRING_LANGUAGE_ALLOWLIST,
) {
  const errors = [];
  if (audit.scannedFiles === 0 || audit.scannedStrings === 0) {
    errors.push('printed-string inventory scanned zero files or zero string literals');
  }
  for (const [scopeName, baseline] of Object.entries(baselines)) {
    const actual = audit.scopes[scopeName];
    if (!actual || actual.scannedFiles === 0 || actual.scannedStrings === 0) {
      errors.push(`${scopeName} printed-string scope scanned zero files or zero string literals`);
      continue;
    }
    for (const metric of ['unexpectedFiles', 'unexpectedLanguageCodePoints']) {
      if (actual[metric] > baseline[metric]) {
        errors.push(
          `${scopeName} printed strings ${metric} regressed: ${baseline[metric]} -> ${actual[metric]}`,
        );
      } else if (actual[metric] < baseline[metric]) {
        errors.push(
          `${scopeName} printed strings ${metric} improved: ${baseline[metric]} -> ${actual[metric]}; `
          + 'lower the baseline in scripts/quality/source-language/check.mjs',
        );
      }
    }
  }
  for (const row of allowlist) {
    if ((audit.allowlistHits?.[row.id] ?? 0) === 0) {
      errors.push(
        `printed-string allowlist row "${row.id}" (${row.path}) matched nothing; `
        + 'remove it instead of leaving an exception nobody can see expire',
      );
    }
  }
  return errors;
}

export function evaluateSourceCommentLanguageGate(
  audit,
  baselines = SOURCE_COMMENT_LANGUAGE_BASELINES,
) {
  const errors = [];
  if (audit.scannedFiles === 0 || audit.scannedComments === 0) {
    errors.push('source comment language inventory scanned zero files or zero comments');
  }
  for (const [scopeName, baseline] of Object.entries(baselines)) {
    const actual = audit.scopes[scopeName];
    if (!actual || actual.scannedFiles === 0 || actual.scannedComments === 0) {
      errors.push(`${scopeName} source-comment scope scanned zero files or zero comments`);
      continue;
    }
    for (const metric of ['unexpectedFiles', 'unexpectedLanguageCodePoints']) {
      if (actual[metric] > baseline[metric]) {
        errors.push(
          `${scopeName} source comments ${metric} regressed: ${baseline[metric]} -> ${actual[metric]}`,
        );
      } else if (actual[metric] < baseline[metric]) {
        errors.push(
          `${scopeName} source comments ${metric} improved: ${baseline[metric]} -> ${actual[metric]}; `
          + 'lower the baseline in scripts/quality/source-language/check.mjs',
        );
      }
    }
  }
  return errors;
}

function repositorySourceEntries(root) {
  const output = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  );
  return [...new Set(output.split('\n').filter(Boolean))]
    .sort()
    .filter((path) => isSupportedSourcePath(path) || isStringScannedPath(path))
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }));
}

function topViolationFiles(violations, limit = 12) {
  const rows = new Map();
  for (const violation of violations) {
    const row = rows.get(violation.path) ?? { lines: 0, scope: violation.scope };
    row.lines += 1;
    rows.set(violation.path, row);
  }
  return [...rows.entries()]
    .sort((left, right) => right[1].lines - left[1].lines)
    .slice(0, limit);
}

export function runSourceLanguageCheck({ root = process.cwd(), json = false } = {}) {
  const entries = repositorySourceEntries(root);
  const audit = auditSourceCommentEntries(entries);
  const stringAudit = auditSourceStringEntries(entries, SOURCE_STRING_LANGUAGE_ALLOWLIST);
  const errors = [
    ...evaluateSourceCommentLanguageGate(audit),
    ...evaluateSourceStringLanguageGate(stringAudit),
  ];
  if (json) {
    process.stdout.write(`${JSON.stringify({ audit, stringAudit, errors }, null, 2)}\n`);
  } else {
    console.log(
      `[source-language] scanned ${audit.scannedFiles} source files · `
      + `${audit.scannedComments} comment tokens`,
    );
    for (const [scopeName, scope] of Object.entries(audit.scopes)) {
      console.log(
        `  ${scopeName}: ${scope.unexpectedFiles} files · ${scope.unexpectedLines} lines · `
        + `${scope.unexpectedLanguageCodePoints} non-English CJK code points`,
      );
    }
    console.log('[source-language] largest remaining comment sources:');
    for (const [path, row] of topViolationFiles(audit.violations)) {
      console.log(`  ${row.lines} lines · ${row.scope} · ${path}`);
    }
    console.log(
      `[source-language] scanned ${stringAudit.scannedFiles} printing files · `
      + `${stringAudit.scannedStrings} string literals · ${stringAudit.allowedLines} allowlisted data lines`,
    );
    for (const [scopeName, scope] of Object.entries(stringAudit.scopes)) {
      console.log(
        `  ${scopeName}: ${scope.unexpectedFiles} files · ${scope.unexpectedLines} lines · `
        + `${scope.unexpectedLanguageCodePoints} non-English CJK code points`,
      );
    }
    if (stringAudit.violations.length > 0) {
      console.log('[source-language] largest remaining printed-string sources:');
      for (const [path, row] of topViolationFiles(stringAudit.violations)) {
        console.log(`  ${row.lines} lines · ${row.scope} · ${path}`);
      }
    }
    if (errors.length === 0) console.log('[source-language] ratchets current');
    else {
      console.error('[source-language] gate failed:');
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  return { audit, stringAudit, errors, exitCode: errors.length === 0 ? 0 : 1 };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = runSourceLanguageCheck({ json: process.argv.includes('--json') });
  process.exitCode = result.exitCode;
}
