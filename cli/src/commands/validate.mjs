import { COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkMd } from '../lib/walk-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { validateVaultDocument } from '../lib/validate.mjs';
import {
  formatUnknownFlagError,
  parseCsvListFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--strict', '--list-codes', '--fail-on'];


// R+ — cycle 44: validateVaultDocument 가 surface 하는 issue codes 의
// canonical list. --list-codes 출력 + --fail-on 의 unknown code 감지에
// 사용. cli/src/lib/validate.mjs (3-way contract) 의 코드와 일관 — cycle
// 45 의 contract test (tests/contract/known-codes-drift.contract.test.ts)
// 가 drift 즉시 차단.
//
// Exported so the contract test can import the canonical list.
export const KNOWN_CODES = [
  {
    code: 'unclosed-frontmatter',
    severity: 'error',
    description: '`---` 가 닫히지 않음 — 파일 머리에 frontmatter 가 끝나지 않았습니다.',
  },
  {
    code: 'parse-zero-keys',
    severity: 'warning',
    description: 'frontmatter 가 0 keys 로 파싱됨 — YAML syntax 깨짐 가능.',
  },
  {
    code: 'missing-kind',
    severity: 'warning',
    description: '`kind:` 키 자체가 없음 — 그래프에서 빠짐.',
  },
  {
    code: 'empty-kind',
    severity: 'error',
    description: '`kind:` 값이 비어있음 — 그래프에서 빠지고 invalid.',
  },
  {
    code: 'unknown-kind',
    severity: 'warning',
    description: 'project / domain / capability / element / document 외 값.',
  },
  {
    code: 'missing-expected-field',
    severity: 'warning',
    description: 'kind 별 강하게 기대되는 필드 누락 (예: capability/element 의 `domain:`).',
  },
  {
    code: 'non-canonical-graph-array',
    severity: 'warning',
    description: 'graph 배열이 trim/dedup/sort 된 canonical set 이 아님.',
  },
  {
    code: 'dangling-graph-reference',
    severity: 'warning',
    scope: 'vault',
    description: 'graph reference 가 vault 의 어떤 node 로도 resolve 되지 않음.',
  },
];

/**
 * R11 #32 — \`oh-my-ontology validate [vault]\`
 *
 * vault 의 frontmatter integrity 검증. error issue 1+ 시 exit 1.
 *
 * R+ — \`--json\` 플래그 (cycle 40): 머신 가독 출력. CI / 스크립트 / agent
 * 가 ANSI strip 없이 issue 행을 그대로 파싱.
 *
 * R+ — \`--strict\` 플래그 (cycle 42): warning 도 exit 1. CI 가 missing-
 * expected-field (capability/element 의 domain 누락 등) 도 차단하려 할 때.
 * default 는 errors 만 fail.
 *
 * R+ — \`--fail-on=<code1,code2,...>\` (cycle 43): 특정 issue code 만 fail.
 * \`--strict\` 보다 우선 — listed code 들에 해당하는 issue 1+ 시 exit 1,
 * 나머지는 무시. CI 가 점진적으로 특정 violation 만 hard-gate 하려 할 때.
 */
export function runValidate(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    return 1;
  }

  // --list-codes 는 vault 안 보고 즉시 출력. 다른 옵션이 같이 와도 무시.
  if (parsed.listCodes) {
    return printKnownCodes(parsed.json);
  }

  const { json, strict, failOn } = parsed;
  // R+ — cycle 44: --fail-on 에 unknown code 가 들어오면 stderr 경고.
  // 실행은 진행 (silently no-match 로 빠지는 것보다 *명시 경고* 가 나음).
  if (failOn) {
    const known = new Set(KNOWN_CODES.map((c) => c.code));
    const unknown = failOn.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      process.stderr.write(
        `${COLORS.yellow}warning${COLORS.reset}  --fail-on 에 알려지지 않은 code: ${unknown.join(', ')}. ` +
          `사용 가능한 code 목록: ${COLORS.bold}oh-my-ontology validate --list-codes${COLORS.reset}\n`,
      );
    }
  }
  const vaultPath = resolveVaultRoot(parsed.vault);
  const files = walkMd(vaultPath);
  const entries = [];
  const reportByFile = new Map();
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
    const slug = relative(vaultPath, file).replace(/\\/g, '/').replace(/\.md$/, '');
    const { frontmatter } = parseFrontmatter(raw);
    entries.push({ file, slug, frontmatter });
    const report = validateVaultDocument(raw);
    reportByFile.set(file, report);
  }

  for (const { file, issue } of findDanglingGraphReferenceIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
  }

  for (const file of files) {
    const report = reportByFile.get(file);
    if (!report || report.issues.length === 0) continue;
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
  const groups = groupIssuesByCode(reports);
  if (json) {
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
            strict,
            failOn,
          },
        },
        null,
        2,
      ) + '\n',
    );
    return decideExit(errorFiles, warningFiles, strict, failOn, groups);
  }

  if (reports.length === 0) {
    console.log(
      `${COLORS.green}[validate] ${files.length} 파일 스캔 — issue 0. vault clean ✓${COLORS.reset}`,
    );
    return 0;
  }

  // strict 모드 안내는 마지막 summary 줄에서 처리.

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
  // (groups 는 위에서 한 번 빌드해놨음 — JSON / fail-on / 텍스트 모두 공유.)
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

  let modeTag = '';
  if (failOn && failOn.length > 0) {
    const matched = failOn.filter((code) => groups.some((g) => g.code === code));
    if (matched.length > 0) {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: matched ${matched.join(',')}]${COLORS.reset}`;
    } else {
      modeTag = ` ${COLORS.dim}[--fail-on=${failOn.join(',')}: no match → exit 0]${COLORS.reset}`;
    }
  } else if (strict && warningFiles > 0) {
    modeTag = ` ${COLORS.dim}[--strict: warning 도 exit 1]${COLORS.reset}`;
  }
  console.log(
    `\n[validate] ${files.length} 파일 / ${reports.length} 문제 ` +
      `(${COLORS.red}error ${errorFiles}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningFiles}${COLORS.reset})${modeTag}`,
  );
  return decideExit(errorFiles, warningFiles, strict, failOn, groups);
}

// 우선순위: --fail-on (있으면 그것만) > --strict > default (errors only).
function decideExit(errorFiles, warningFiles, strict, failOn, groups) {
  if (failOn && failOn.length > 0) {
    return groups.some((g) => failOn.includes(g.code)) ? 1 : 0;
  }
  if (errorFiles > 0) return 1;
  if (strict && warningFiles > 0) return 1;
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, strict: false, listCodes: false, failOn: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--strict') flags.strict = true;
    else if (a === '--list-codes') flags.listCodes = true;
    else if (a === '--fail-on') flags.failOn = parseCsvListFlag('--fail-on', args[++i], { itemName: 'issue code' });
    else if (a.startsWith('--fail-on=')) flags.failOn = parseCsvListFlag('--fail-on', a.slice('--fail-on='.length), { itemName: 'issue code' });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    strict: flags.strict,
    listCodes: flags.listCodes,
    failOn: flags.failOn,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology validate [vault] [--json] [--strict]\n` +
      `  oh-my-ontology validate [vault] [--fail-on code,...]\n` +
      `  oh-my-ontology validate --list-codes [--json]\n\n` +
      `Validate ontology vault frontmatter integrity.\n`,
  );
}

// R+ — cycle 44: --list-codes 출력. text 모드는 사람이 읽기 좋은 표,
// --json 모드는 머신 가독 (CI 가 어떤 code 가 있는지 동적으로 알 수 있게).
function printKnownCodes(asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ codes: KNOWN_CODES }, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(
    `${COLORS.bold}validate issue codes${COLORS.reset} ${COLORS.dim}(--fail-on=<code> 로 특정 code 만 fail)${COLORS.reset}\n\n`,
  );
  for (const c of KNOWN_CODES) {
    const severityColor = c.severity === 'error' ? COLORS.red : COLORS.yellow;
    const severityTag = c.severity === 'error' ? '✗ error  ' : '▲ warning';
    process.stdout.write(
      `  ${severityColor}${severityTag}${COLORS.reset}  ${COLORS.bold}${c.code.padEnd(24)}${COLORS.reset}  ${COLORS.dim}${c.description}${COLORS.reset}\n`,
    );
  }
  process.stdout.write('\n');
  return 0;
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

const GRAPH_REFERENCE_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
];

function collectGraphRefs(frontmatter) {
  const refs = [];
  for (const key of GRAPH_REFERENCE_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) refs.push({ key, ref });
  }
  const domain = frontmatter.domain;
  if (typeof domain === 'string' && domain.trim()) {
    refs.push({ key: 'domain', ref: domain });
  }
  return refs;
}

function findDanglingGraphReferenceIssues(entries) {
  const slugs = new Set(entries.map((entry) => entry.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const entry of entries) {
    const fmSlug = entry.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, entry.slug);
    }
  }
  const resolveRef = (ref) => {
    if (typeof ref !== 'string') return null;
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const entry of entries) {
    for (const { key, ref } of collectGraphRefs(entry.frontmatter)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      issues.push({
        file: entry.file,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: `\`${key}:\` graph reference "${ref}" 가 vault 의 어떤 node 로도 resolve 되지 않습니다.`,
        },
      });
    }
  }
  return issues;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}
