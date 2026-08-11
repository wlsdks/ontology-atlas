import { COLORS } from '../lib/colors.mjs';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkMd } from '../lib/walk-vault.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { validateVaultDocument, suppressParentedExpectedFieldIssues } from '../lib/validate.mjs';
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
    description: '`---` 가 닫히지 않음: 파일 머리에 frontmatter 가 끝나지 않았습니다.',
  },
  {
    code: 'parse-zero-keys',
    severity: 'warning',
    description: 'frontmatter 가 0 keys 로 파싱됨: YAML syntax 깨짐 가능.',
  },
  {
    code: 'missing-kind',
    severity: 'warning',
    description: '`kind:` 키 자체가 없음: 그래프에서 빠짐.',
  },
  {
    code: 'empty-kind',
    severity: 'error',
    description: '`kind:` 값이 비어있음: 그래프에서 빠지고 invalid.',
  },
  {
    code: 'unknown-kind',
    severity: 'warning',
    description: 'project / domain / capability / element / document 외 값.',
  },
  {
    code: 'missing-uid',
    severity: 'error',
    description: '온톨로지 노드에 영구 `uid:`가 없음.',
  },
  {
    code: 'invalid-uid',
    severity: 'error',
    description: '`uid:`가 lowercase UUIDv4 규격이 아님.',
  },
  {
    code: 'invalid-merged-uids',
    severity: 'error',
    description: '`merged_uids:`가 흡수된 UUIDv4 identity alias 규격을 어김.',
  },
  {
    code: 'non-canonical-merged-uids',
    severity: 'warning',
    description: '`merged_uids:`가 중복 제거·오름차순 정렬된 canonical set이 아님.',
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
  {
    code: 'duplicate-slug',
    severity: 'error',
    scope: 'vault',
    description: '두 문서가 같은 canonical slug 를 주장: 관계가 어느 쪽인지 정할 수 없음.',
  },
  {
    code: 'duplicate-uid',
    severity: 'error',
    scope: 'vault',
    description: '두 노드가 같은 primary 또는 merged UID를 영구 정체성으로 주장함.',
  },
];

/**
 * R11 #32 — \`ontology-atlas validate [vault]\`
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
          `사용 가능한 code 목록: ${COLORS.bold}ontology-atlas validate --list-codes${COLORS.reset}\n`,
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

  const unreadable = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch (error) {
      // **못 읽은 파일을 "스캔했다" 고 세지 않는다** (2026-07-29 실측).
      //
      // 종전엔 조용히 `continue` 하면서 `scanned` 에는 계속 포함시켰다. 권한이
      // 없는 `.md` 하나가 있으면 `6 파일 스캔 — issue 0. vault clean ✓` 라고
      // 답하고, 같은 볼트에서 `compile` 은 EACCES 로 exit 2 했다. **열어 보지도
      // 못한 파일을 깨끗하다고 보증**한 것이다.
      unreadable.push({
        file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    // NFC — `pathToSlug` 와 같은 식별자 규칙(자세한 이유는 그쪽 주석).
    const slug = relative(vaultPath, file)
      .replace(/\\/g, '/')
      .replace(/\.md$/, '')
      .normalize('NFC');
    const { frontmatter } = parseFrontmatter(raw);
    entries.push({ file, slug, frontmatter });
    const report = validateVaultDocument(raw);
    reportByFile.set(file, report);
  }

  /*
   * 부모가 이미 있는 노드에 「부모가 없다」고 말하지 않는다 (2026-08-11) — MCP 쪽
   * `validate_vault` 와 같은 좁히기다. 파일 하나만 보는 검사로는 알 수 없다.
   */
  const issuesBySlugForParents = new Map();
  const fileBySlug = new Map();
  for (const { file, slug } of entries) {
    const report = reportByFile.get(file);
    if (!report) continue;
    issuesBySlugForParents.set(slug, report.issues);
    fileBySlug.set(slug, file);
  }
  suppressParentedExpectedFieldIssues(issuesBySlugForParents, entries);
  for (const [slug, issues] of issuesBySlugForParents) {
    const report = reportByFile.get(fileBySlug.get(slug));
    if (report) report.issues = issues;
  }

  for (const { file, issue } of findDuplicateSlugIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = !report.issues.some((i) => i.severity === 'error');
  }

  for (const { file, issue } of findDuplicateUidIssues(entries)) {
    const report = reportByFile.get(file);
    if (!report) continue;
    report.issues.push(issue);
    report.ok = false;
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
      file: relative(vaultPath, file).replace(/\\/g, '/'),
      report,
    });
    if (report.issues.some((i) => i.severity === 'error')) errorFiles += 1;
    else warningFiles += 1;
  }

  // **문제 수와 파일 수는 다른 것이다** (2026-08-04 실측 정정).
  //
  // 마지막 요약 줄이 `reports.length`(문제가 있는 **파일** 수)를 「문제」라고
  // 찍고, `errorFiles`/`warningFiles`(파일 수)를 「error/warning」이라고 찍었다.
  // 그래서 오류 5 · 경고 4 짜리 볼트를 `9 파일 / 8 문제 (error 5 · warning 3)`
  // 라고 불렀다 — 경고 하나는 **오류가 있는 파일 안에 있어서 통째로 사라졌다**
  // (파일은 errorFiles 로만 세지므로). 같은 명령의 `--json` 은 issue 단위로 세어
  // 5/4 라고 답했다. 한 폴더를 두 출력이 다른 수로 부르면 둘 다 못 믿는다.
  //
  // exit code 는 파일 수 기준 그대로 둔다 — 0 이냐 아니냐만 보므로 값이 같다.
  const allIssues = reports.flatMap(({ report }) => report.issues);
  const errorIssues = allIssues.filter((i) => i.severity === 'error').length;
  const warningIssues = allIssues.length - errorIssues;

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
          // 열어 본 파일만 "스캔" 이다. 못 읽은 것은 따로 센다 — 그래야
          // `scanned` 가 보증의 범위와 일치한다.
          scanned: files.length - unreadable.length,
          unreadable: unreadable.map((u) => ({
            file: relative(vaultPath, u.file).replace(/\\/g, '/'),
            message: u.message,
          })),
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

  // 못 읽은 파일은 **clean 선언 전에** 말한다. 이 줄이 없으면 "vault clean ✓"
  // 가 열어 보지도 못한 파일까지 보증하는 문장이 된다.
  if (unreadable.length > 0) {
    console.log(
      `\n${COLORS.yellow}[validate] 읽지 못한 파일 ${unreadable.length}건: 아래는 검사 범위 밖입니다.${COLORS.reset}`,
    );
    for (const { file, message } of unreadable) {
      console.log(`  ${COLORS.yellow}?${COLORS.reset} ${relative(vaultPath, file).replace(/\\/g, '/')} · ${message}`);
    }
  }

  if (reports.length === 0) {
    // **"vault clean ✓" 라고만 말하지 않는다** (2026-08-01 실측).
    //
    // 이 명령은 frontmatter 와 그래프 참조만 본다 — `elements:` / `path:` 가
    // 가리키는 **코드 파일이 실재하는지는 보지 않는다.** 그런데 문구가 그 차이를
    // 말하지 않아서, 같은 볼트에 `validate` 는 "clean", `health` 는
    // "needs_attention" 이라고 답했고 어느 쪽이 맞는지 알 방법이 없었다.
    // 검사 범위를 문장이 말하면 두 답은 모순이 아니라 서로 다른 두 검사가 된다.
    console.log(
      `${COLORS.green}[validate] ${files.length - unreadable.length} 파일 스캔: frontmatter · 그래프 참조 issue 0 ✓${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}          코드 경로 대조(elements:/path: 가 실재하는 파일인가)는 이 검사에 없다: \`ontology-atlas health\` 가 본다.${COLORS.reset}`,
    );
    return unreadable.length > 0 ? 1 : 0;
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
        `  ${color}${tag}${COLORS.reset} ${g.code} · ${g.count} occurrence${g.count === 1 ? '' : 's'}` +
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
    `\n[validate] ${files.length - unreadable.length} 파일 스캔 / ` +
      `${reports.length} 파일에 ${allIssues.length} 문제 ` +
      `(${COLORS.red}error ${errorIssues}${COLORS.reset} · ` +
      `${COLORS.yellow}warning ${warningIssues}${COLORS.reset})${modeTag}`,
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
      `  ontology-atlas validate [vault] [--json] [--strict]\n` +
      `  ontology-atlas validate [vault] [--fail-on code,...]\n` +
      `  ontology-atlas validate --list-codes [--json]\n\n` +
      `Validate ontology vault frontmatter integrity: frontmatter shape and graph\n` +
      `references only. It does NOT check whether elements:/path: point at files that\n` +
      `exist; \`ontology-atlas health\` runs that source-path check.\n`,
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

/**
 * 두 문서가 같은 canonical slug 를 주장하는 상태 (2026-07-29 실측).
 *
 * **파일 단위 검사로는 원리적으로 못 잡는다** — 한 파일만 보면 완벽히
 * 정상이기 때문이다. 그래서 dangling 검사와 같은 자리(볼트 전수 패스)에 산다.
 *
 * 어떻게 생기나: `patch_concept` 이 `frontmatter.slug` 를 다른 노드가 이미
 * 가진 값으로 덮어써도 막지 않는다(`add_concept` 은 막고 `rename_concept` 은
 * `overwrite:true` 를 요구하는데 이 경로만 열려 있다). 그러면 두 파일이 같은
 * 이름을 주장하고, 그 이름을 가리키는 모든 관계가 **어느 쪽을 뜻하는지 알 수
 * 없게** 된다 — 컴파일러는 `ambiguous-alias` 로 보는데 `validate` 는 조용했다.
 *
 * error 로 올린다. dangling 은 "아직 안 만든 것" 일 수 있어 warning 이지만,
 * 중복 slug 는 **이미 있는 두 문서 사이의 모순**이라 그래프가 성립하지 않는다.
 */
function findDuplicateSlugIssues(entries) {
  const byDeclared = new Map();
  for (const entry of entries) {
    const declared = entry.frontmatter?.slug;
    const value = typeof declared === 'string' ? declared.trim() : '';
    if (!value) continue;
    if (!byDeclared.has(value)) byDeclared.set(value, []);
    byDeclared.get(value).push(entry);
  }
  const issues = [];
  for (const [declared, group] of byDeclared) {
    if (group.length < 2) continue;
    const others = group.map((entry) => entry.slug);
    for (const entry of group) {
      const rest = others.filter((slug) => slug !== entry.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-slug',
          severity: 'error',
          message:
            `\`slug: ${declared}\` 를 다른 문서도 주장합니다 (${rest.join(', ')}). ` +
            `같은 이름을 가리키는 관계가 어느 쪽을 뜻하는지 정할 수 없습니다: ` +
            `한쪽의 slug 를 바꾸거나 rename_concept 으로 합치세요.`,
        },
      });
    }
  }
  return issues;
}

function findDuplicateUidIssues(entries) {
  const claims = new Map();
  for (const entry of entries) {
    const primary = typeof entry.frontmatter?.uid === 'string' ? entry.frontmatter.uid.trim() : '';
    const merged = Array.isArray(entry.frontmatter?.merged_uids) ? entry.frontmatter.merged_uids : [];
    for (const uid of new Set([primary, ...merged].filter((value) => typeof value === 'string' && value))) {
      if (!claims.has(uid)) claims.set(uid, []);
      claims.get(uid).push(entry);
    }
  }
  const issues = [];
  for (const [uid, group] of claims) {
    if (group.length < 2) continue;
    for (const entry of group) {
      const others = group.filter((candidate) => candidate !== entry).map((candidate) => candidate.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-uid',
          severity: 'error',
          message:
            `UID ${uid}를 다른 문서도 정체성으로 주장합니다 (${others.join(', ')}). ` +
            '영구 identity 충돌이므로 새 노드에는 새 UID를 발급하고, 병합은 merge_concepts로 처리하세요.',
        },
      });
    }
  }
  return issues;
}

/**
 * ⚠️ **그래프 참조는 «노드» 로 resolve 되어야 한다** (2026-08-08 실측).
 *
 * 종전엔 해소 대상이 «볼트의 모든 .md 파일» 이었다. 볼트에는 노드가 아닌
 * 마크다운(회의록·메모·초안)이 정상적으로 섞여 사는데 — 그건 설계다 —
 * 그것들까지 «있는 슬러그» 로 쳐 줘서, 노드 → 잡문 관계가 통과했다.
 *
 * 침묵보다 나빴다: 그 상태에서 이 명령은 초록 글씨로 *"frontmatter · 그래프
 * 참조 issue 0 ✓"* 라고 적었는데, 같은 볼트에서 `compile` 은 `unresolved 1`
 * 을 냈다. **한 볼트를 두고 두 도구가 반대로 말했고, 사람이 먼저 보는 쪽이
 * 틀린 쪽이었다.** 없는 검사를 했다고 말하는 것이 가장 나쁜 종류다.
 */
function findDanglingGraphReferenceIssues(entries) {
  const isNodeEntry = (entry) =>
    typeof entry.frontmatter?.kind === 'string' && entry.frontmatter.kind.trim() !== '';
  const nodeEntries = entries.filter(isNodeEntry);
  // 노드가 아닌 문서의 슬러그 — 「없다」와 「노드가 아니다」를 갈라 말하려고
  // 따로 들고 있는다. 사람에게는 그 둘이 전혀 다른 할 일이다.
  const nonNodeSlugs = new Set(entries.filter((e) => !isNodeEntry(e)).map((e) => e.slug));
  const nonNodeTails = new Set(
    [...nonNodeSlugs].map((slug) => slug.split('/').pop()).filter(Boolean),
  );
  const slugs = new Set(nodeEntries.map((entry) => entry.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const entry of nodeEntries) {
    const fmSlug = entry.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, entry.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== 'string') return null;
    // 참조도 NFC 로 맞춘다 — 슬러그는 `pathToSlug` 가 이미 NFC 다. 한쪽만
    // 정규화하면 글자가 같은데 안 맞는 상태가 그대로 남는다.
    const ref = rawRef.normalize('NFC');
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
      // 「파일이 없다」와 「파일은 있는데 노드가 아니다」는 다른 할 일이다.
      // 앞의 것은 만들거나 오타를 고치는 일이고, 뒤의 것은 그 문서에 `kind:`
      // 를 주거나(승격) 관계를 지우는 일이다. 같은 문장으로 말하면 사람이
      // 파일을 찾아 헤맨다 — 그 파일은 눈앞에 있다.
      const normalized = ref.normalize('NFC');
      const isNonNodeDoc = nonNodeSlugs.has(normalized) || nonNodeTails.has(normalized);
      issues.push({
        file: entry.file,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: isNonNodeDoc
            ? `\`${key}:\` graph reference "${ref}" 는 vault 에 파일로 있지만 **node 가 아닙니다** ` +
              '(`kind:` 없음: 메모·회의록은 그래프 밖입니다). 노드로 올리려면 `kind:` 를 주고, ' +
              '아니면 이 관계를 지우세요.'
            : `\`${key}:\` graph reference "${ref}" 가 vault 의 어떤 node 로도 resolve 되지 않습니다.`,
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
