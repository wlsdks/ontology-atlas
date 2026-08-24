#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { auditSourceCommentEntries, isSupportedSourcePath } from './inventory.mjs';

/**
 * `current` is not zero, and the zero it used to hold was a lie.
 *
 * Until 2026-08-24 the Rust tokenizer treated every `'` as a string quote, so one odd lifetime —
 * `&'static str` — put it inside a string for the rest of the file. `src-tauri/src/lib.rs` alone
 * lost 2,624 consecutive lines that way and reported **zero** Korean comments while holding 199.
 * Repairing the tokenizer recovered 1,085 comment tokens across the repository and revealed the
 * real figure below: 9 files, 979 lines, all under `src-tauri/src/`.
 *
 * These numbers are debt, not permission. The gate's job now is to stop it growing; lowering them
 * is ordinary work for whoever next opens one of those files. A gate that reported zero could not
 * do either.
 */
export const SOURCE_COMMENT_LANGUAGE_BASELINES = Object.freeze({
  current: Object.freeze({
    unexpectedFiles: 9,
    unexpectedLanguageCodePoints: 20229,
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
    .filter(isSupportedSourcePath)
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

export function runSourceCommentLanguageCheck({ root = process.cwd(), json = false } = {}) {
  const audit = auditSourceCommentEntries(repositorySourceEntries(root));
  const errors = evaluateSourceCommentLanguageGate(audit);
  if (json) {
    process.stdout.write(`${JSON.stringify({ audit, errors }, null, 2)}\n`);
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
    if (errors.length === 0) console.log('[source-language] ratchets current');
    else {
      console.error('[source-language] gate failed:');
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  return { audit, errors, exitCode: errors.length === 0 ? 0 : 1 };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = runSourceCommentLanguageCheck({ json: process.argv.includes('--json') });
  process.exitCode = result.exitCode;
}
