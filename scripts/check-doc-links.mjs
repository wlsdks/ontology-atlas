#!/usr/bin/env node
// 깨진 링크 검사 — 이 저장소에 없던 그물.
//
// 오픈소스가 실제로 CI 에 거는 문서 검사는 둘뿐이다: 싸고 넓은 그물(린트 ·
// 포매팅 · **깨진 링크**)과 좁고 정확한 창(생성 후 diff). 우리에겐 후자가
// `scripts/build-docs-surface.mjs` 로 생겼고, 전자의 깨진-링크 몫이 이것이다.
//
// 외부 URL 은 기본에서 제외한다 — 네트워크에 의존하는 검사는 남의 서버가
// 죽었을 때 우리 게이트가 빨개진다. `--external` 로 따로 돌릴 수 있다.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectHtmlAssetRefs,
  collectMarkdownLinks,
  collectProseDocRefs,
  isExternalTarget,
  isHistoricalDoc,
} from './lib/doc-links.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 생성물 사본(`public/docs-vault`)과 빌드 출력은 원본을 고치면 따라온다.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'build',
  'coverage',
  '.codegraph',
  '.serena',
  'src-tauri',
  'public',
  /**
   * **워크트리는 남의 체크아웃이다** (2026-08-01).
   *
   * `.claude` 는 `KEEP_DOT_DIRS` 라 안으로 걸어 들어가는데, 이 저장소는
   * `.claude/worktrees/<브랜치>` 에 워크트리를 **상시** 둔다(`CLAUDE.md` 가
   * 그렇게 쓰라고 적어 뒀다). 그 안에는 저장소 전체 사본이 들어 있으므로
   * 검사가 문서를 두 번 세고, 그 사본의 인용을 **이쪽 저장소 루트 기준으로**
   * 풀어서 실재하는 경로를 "깨졌다" 고 보고했다.
   *
   * 결과는 오늘 두 번 본 것과 같은 부류다 — **코드가 아니라 게이트가 틀린 채로
   * 빨개진다.** 워크트리를 하나라도 두면 `docs:links` 가 통째로 못 쓰게 되고,
   * 그러면 사람은 게이트를 끄거나 무시하는 법을 배운다.
   *
   * 이름 기준이라 어디에 있든 `worktrees/` 는 건너뛴다 — 워크트리 안의 문서는
   * 그 브랜치가 자기 CI 에서 검사한다.
   */
  'worktrees',
]);
const KEEP_DOT_DIRS = new Set(['.claude', '.agents', '.codex', '.github']);

export function usage() {
  return [
    'Usage: node scripts/check-doc-links.mjs [--external]',
    '',
    '  (default)   Check repo-relative markdown links and repo-anchored `.md` path citations.',
    '  --external  Additionally resolve http(s) links over the network (opt-in; not a CI gate).',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = { external: false, help: false };
  for (const arg of argv) {
    if (arg === '--external') args.external = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else return { ...args, error: `unknown argument: ${arg}` };
  }
  return args;
}

export function listMarkdownFiles(root = ROOT) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && !KEEP_DOT_DIRS.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

function exists(target) {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 루트 절대 링크(`/guide/cli`)는 파일 경로가 아니라 **문서함의 슬러그**다 —
 * `/docs` 가 `docs/**.md` 를 슬러그로 렌더한다. 그래서 `docs/<slug>.md` 를
 * 먼저 보고, 그다음에야 저장소 경로로 본다.
 */
export function resolveLinkTarget(fromFile, target, root = ROOT) {
  const withoutAnchor = target.split('#')[0];
  if (!withoutAnchor) return null; // 같은 문서 안 앵커
  let decoded;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    decoded = withoutAnchor;
  }
  if (decoded.startsWith('/')) {
    const slugged = path.join(root, 'docs', `${decoded.slice(1)}.md`);
    if (exists(slugged)) return slugged;
    return path.join(root, decoded);
  }
  return path.resolve(path.dirname(fromFile), decoded);
}

export function checkFile(file, { root = ROOT } = {}) {
  const relative = path.relative(root, file).split('\\').join('/');
  const markdown = readFileSync(file, 'utf-8');
  const problems = [];

  for (const link of collectMarkdownLinks(markdown)) {
    if (isExternalTarget(link.target) || link.target.startsWith('#')) continue;
    const resolved = resolveLinkTarget(file, link.target, root);
    if (resolved && !exists(resolved)) {
      problems.push({ file: relative, line: link.line, target: link.target, kind: 'link' });
    }
  }

  for (const asset of collectHtmlAssetRefs(markdown)) {
    const resolved = resolveLinkTarget(file, asset.target, root);
    if (resolved && !exists(resolved)) {
      problems.push({ file: relative, line: asset.line, target: asset.target, kind: 'asset' });
    }
  }

  if (!isHistoricalDoc(relative)) {
    for (const ref of collectProseDocRefs(markdown)) {
      // 유령 디렉터리 인용은 실재 여부를 묻지 않는다 — 작업자의 컴퓨터에만 있는
      // 자리라, exists() 로 판정하면 로컬만 초록인 게이트가 된다.
      if (ref.ghost) {
        problems.push({ file: relative, line: ref.line, target: ref.target, kind: 'cited path (저장소에 없는 자리)' });
        continue;
      }
      const resolved = ref.relative ? path.resolve(path.dirname(file), ref.target) : path.join(root, ref.target);
      if (!exists(resolved)) {
        problems.push({ file: relative, line: ref.line, target: ref.target, kind: 'cited path' });
      }
    }
  }

  return problems;
}

export function collectExternalUrls(root = ROOT) {
  const urls = new Map();
  for (const file of listMarkdownFiles(root)) {
    const relative = path.relative(root, file).split('\\').join('/');
    for (const link of collectMarkdownLinks(readFileSync(file, 'utf-8'))) {
      if (!/^https?:\/\//i.test(link.target)) continue;
      const url = link.target.split('#')[0];
      if (!urls.has(url)) urls.set(url, `${relative}:${link.line}`);
    }
  }
  return urls;
}

async function checkExternal(root) {
  const urls = collectExternalUrls(root);
  const failures = [];
  const entries = [...urls.entries()];
  const CONCURRENCY = 8;
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const [url, origin] = entries[cursor++];
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
        if (response.status >= 400) failures.push(`${origin} → ${url} (HTTP ${response.status})`);
      } catch (err) {
        failures.push(`${origin} → ${url} (${err.message ?? err})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { checked: entries.length, failures: failures.sort() };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    return 2;
  }

  const files = listMarkdownFiles();
  const problems = files.flatMap((file) => checkFile(file));

  if (problems.length > 0) {
    console.error(`[doc-links] ${problems.length} broken reference(s) in ${files.length} markdown files:`);
    for (const problem of problems) {
      console.error(`  ${problem.file}:${problem.line}  ${problem.kind} → ${problem.target}`);
    }
  }

  let externalFailures = 0;
  if (args.external) {
    const result = await checkExternal(ROOT);
    externalFailures = result.failures.length;
    console.log(`[doc-links] external URLs checked: ${result.checked}, unreachable: ${externalFailures}`);
    for (const failure of result.failures) console.error(`  ${failure}`);
  }

  if (problems.length > 0 || externalFailures > 0) return 1;
  console.log(`[doc-links] ok · ${files.length} markdown files, no broken repo references`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('[doc-links] failed:', err.message ?? err);
      process.exitCode = 1;
    });
}

export { existsSync };
