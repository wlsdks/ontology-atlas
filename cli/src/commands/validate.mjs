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
 *
 * R+ — \`--json\` 플래그 (cycle 40): 머신 가독 출력. CI / 스크립트 / agent
 * 가 ANSI strip 없이 issue 행을 그대로 파싱.
 */
export function runValidate(args) {
  const json = args.includes('--json');
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

  // R+ — JSON 출력은 항상 같은 shape (clean vault 도 problems: [] 로). caller
  // 가 .summary.errorFiles 만 보고 분기 가능 — text 모드의 분기 없는 단일
  // structure.
  if (json) {
    const groups = groupIssuesByCode(reports);
    const byCode = {};
    for (const g of groups) {
      byCode[g.code] = {
        severity: g.severity,
        count: g.count,
        files: g.files,
      };
    }
    process.stdout.write(
      JSON.stringify(
        {
          scanned: files.length,
          problems: reports.map(({ file, report }) => ({
            file,
            issues: report.issues.map((i) => ({
              code: i.code,
              severity: i.severity,
              message: i.message,
            })),
          })),
          summary: {
            problemFiles: reports.length,
            errorFiles,
            warningFiles,
            byCode,
          },
        },
        null,
        2,
      ) + '\n',
    );
    return errorFiles > 0 ? 1 : 0;
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

  // R+ — issue code 별 그룹 요약. 큰 vault 에서 같은 종류 경고가 30+ 줄 흐를
  // 때 *어느 코드가 얼마나 많은지* 한눈에. 2+ 회 등장한 code 만 노출 — 1
  // 회짜리는 위 per-file 출력으로 충분.
  const groups = groupIssuesByCode(reports);
  const repeatedCodes = groups.filter((g) => g.count >= 2);
  if (repeatedCodes.length > 0) {
    console.log(`\n${COLORS.dim}── grouped by code ──${COLORS.reset}`);
    for (const g of repeatedCodes) {
      const color = g.severity === 'error' ? COLORS.red : COLORS.yellow;
      const tag = g.severity === 'error' ? '✗' : '▲';
      const head = g.files.slice(0, 3).join(', ');
      const tail = g.files.length > 3 ? ` (+${g.files.length - 3} more)` : '';
      console.log(
        `  ${color}${tag}${COLORS.reset} ${g.code} — ${g.count} occurrence${g.count === 1 ? '' : 's'}` +
          `\n     ${COLORS.dim}${head}${tail}${COLORS.reset}`,
      );
    }
  }

  console.log(
    `\n[validate] ${files.length} 파일 / ${reports.length} 문제 ` +
      `(${COLORS.red}error ${errorFiles}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningFiles}${COLORS.reset})`,
  );
  return errorFiles > 0 ? 1 : 0;
}

/**
 * reports 를 issue code 별로 묶는다. severity 는 같은 code 내에서 max
 * (error > warning) — 한 code 가 양쪽으로 등장하면 더 높은 severity 표시.
 * files 는 등장 순 dedup. count 는 같은 file 의 같은 code 가 여러 번이어도
 * file 당 1로 카운트 (사용자 입장에서 "몇 개 file 이 영향받았나" 가 더 유용).
 */
function groupIssuesByCode(reports) {
  const map = new Map();
  for (const { file, report } of reports) {
    const seenInFile = new Set();
    for (const issue of report.issues) {
      const key = issue.code;
      if (seenInFile.has(key)) continue;
      seenInFile.add(key);
      if (!map.has(key)) {
        map.set(key, { code: key, severity: issue.severity, files: [], count: 0 });
      }
      const entry = map.get(key);
      if (issue.severity === 'error') entry.severity = 'error';
      entry.files.push(file);
      entry.count += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    // error 먼저, 그 안에서 count 내림차순
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return b.count - a.count;
  });
}
