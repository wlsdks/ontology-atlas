import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { walkMd } from '../lib/walk-vault.mjs';
import { validateVaultDocument } from '../lib/validate.mjs';

const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/**
 * R11 #32 — \`oh-my-ontology validate [vault]\`
 *
 * vault 의 frontmatter integrity 검증. 5 issue codes (unclosed-frontmatter
 * / empty-kind / missing-kind / unknown-kind / parse-zero-keys). error 1+
 * 시 exit 1.
 */
export function runValidate(args) {
  const vaultPath = resolve(args.find((a) => !a.startsWith('--')) || '.');
  const files = walkMd(vaultPath);
  const reports = [];
  let errorFiles = 0;
  let warningFiles = 0;

  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const report = validateVaultDocument(raw);
    if (report.issues.length === 0) continue;
    reports.push({
      file: relative(process.cwd(), file),
      report,
    });
    if (report.issues.some((i) => i.severity === 'error')) errorFiles += 1;
    else warningFiles += 1;
  }

  if (reports.length === 0) {
    console.log(
      `${COLORS.green}[validate] ${files.length} 파일 스캔 — issue 0. vault clean ✓${COLORS.reset}`,
    );
    return 0;
  }

  for (const { file, report } of reports) {
    console.log(`\n${file}`);
    for (const issue of report.issues) {
      const color =
        issue.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = issue.severity === 'error' ? '✗ ERROR' : '▲ WARN ';
      console.log(`  ${color}${tag}${COLORS.reset}  [${issue.code}] ${issue.message}`);
    }
  }

  console.log(
    `\n[validate] ${files.length} 파일 / ${reports.length} 문제 ` +
      `(${COLORS.red}error ${errorFiles}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningFiles}${COLORS.reset})`,
  );
  return errorFiles > 0 ? 1 : 0;
}
