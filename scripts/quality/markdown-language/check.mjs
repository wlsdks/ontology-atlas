#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { auditMarkdownEntries } from './inventory.mjs';

export const MARKDOWN_LANGUAGE_BASELINES = Object.freeze({
  operational: Object.freeze({
    unexpectedFiles: 0,
    unexpectedHangulCodePoints: 0,
  }),
  current: Object.freeze({
    unexpectedFiles: 0,
    unexpectedHangulCodePoints: 0,
  }),
  historical: Object.freeze({
    unexpectedFiles: 20,
    unexpectedHangulCodePoints: 189_173,
  }),
});

export function evaluateMarkdownLanguageGate(audit, baselines = MARKDOWN_LANGUAGE_BASELINES) {
  const errors = [];
  if (audit.scannedFiles === 0) {
    errors.push('markdown language inventory scanned zero canonical files');
  }
  if (audit.allowedLocaleLines === 0) {
    errors.push('markdown language inventory found zero typed display_ko locale lines');
  }
  if (audit.localeTemplateFiles === 0) {
    errors.push('markdown language inventory found zero files in the Korean vault template');
  }
  if (audit.generatedFiles === 0 || audit.mirrorFiles === 0) {
    errors.push('markdown language inventory did not observe both generated and mirrored Markdown');
  }

  for (const [scopeName, baseline] of Object.entries(baselines)) {
    const actual = audit.scopes[scopeName];
    if (!actual || actual.scannedFiles === 0) {
      errors.push(`${scopeName} Markdown scope scanned zero files`);
      continue;
    }
    for (const metric of ['unexpectedFiles', 'unexpectedHangulCodePoints']) {
      if (actual[metric] > baseline[metric]) {
        errors.push(
          `${scopeName} Markdown ${metric} regressed: ${baseline[metric]} -> ${actual[metric]}`,
        );
      } else if (actual[metric] < baseline[metric]) {
        errors.push(
          `${scopeName} Markdown ${metric} improved: ${baseline[metric]} -> ${actual[metric]}; lower the baseline in scripts/quality/markdown-language/check.mjs`,
        );
      }
    }
  }
  return errors;
}

function repositoryMarkdownEntries(root) {
  const output = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'],
    { encoding: 'utf8' },
  );
  return [...new Set(output.split('\n').filter(Boolean))]
    .sort()
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({
      path,
      content: readFileSync(resolve(root, path), 'utf8'),
    }));
}

function topViolationFiles(violations, limit = 12) {
  const rows = new Map();
  for (const violation of violations) {
    const row = rows.get(violation.path) ?? { lines: 0, codePoints: 0, scope: violation.scope };
    row.lines += 1;
    row.codePoints += violation.count;
    rows.set(violation.path, row);
  }
  return [...rows.entries()]
    .sort((left, right) => right[1].codePoints - left[1].codePoints)
    .slice(0, limit);
}

export function runMarkdownLanguageCheck({ root = process.cwd(), json = false } = {}) {
  const audit = auditMarkdownEntries(repositoryMarkdownEntries(root));
  const errors = evaluateMarkdownLanguageGate(audit);
  if (json) {
    process.stdout.write(`${JSON.stringify({ audit, errors }, null, 2)}\n`);
  } else {
    console.log(
      `[markdown-language] scanned ${audit.scannedFiles} canonical files · `
      + `${audit.allowedLocaleLines} display_ko lines · ${audit.localeTemplateFiles} Korean template files`,
    );
    for (const [scopeName, scope] of Object.entries(audit.scopes)) {
      console.log(
        `  ${scopeName}: ${scope.unexpectedFiles} files · `
        + `${scope.unexpectedLines} lines · ${scope.unexpectedHangulCodePoints} Hangul code points`,
      );
    }
    console.log('[markdown-language] largest remaining authored sources:');
    for (const [path, row] of topViolationFiles(audit.violations)) {
      console.log(`  ${row.codePoints} code points · ${row.lines} lines · ${row.scope} · ${path}`);
    }
    if (errors.length === 0) {
      console.log('[markdown-language] ratchets current');
    } else {
      console.error('[markdown-language] gate failed:');
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  return { audit, errors, exitCode: errors.length === 0 ? 0 : 1 };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = runMarkdownLanguageCheck({ json: process.argv.includes('--json') });
  process.exitCode = result.exitCode;
}
