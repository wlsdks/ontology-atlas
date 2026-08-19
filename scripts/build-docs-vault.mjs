#!/usr/bin/env node
// Docs Vault 빌드타임 매니페스트 생성기.
// docs/**/*.md 를 스캔해서:
//  1. public/docs-vault/{slug}.md 로 raw 복사
//  2. src/entities/docs-vault/data/manifest.json 생성 — tree, docs, backlinks, tags
//     (headings 는 번들 크기 때문에 manifest.headings.json 으로 분리 — `/docs` 만
//     동적 import 한다)
//  3. src/entities/docs-vault/data/content.json 생성 — desktop/static export fallback
//  4. src/entities/docs-vault/data/gateway-content.json 생성 — gateway의 동기 guide/* fallback
//  5. src/entities/docs-vault/data/gateway-changelog.json 생성 — /changelog 의
//     동기 미리보기 (최근 절 + 접힌 절 수)
// static export 빌드 중 'next build' 직전에 실행. 런타임 의존성 없음.

import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const PUBLIC_OUT = path.join(ROOT, 'public', 'docs-vault');
const MANIFEST_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'manifest.json',
);
const CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'content.json',
);
// Gateway 는 client surface 에서 첫 페인트 전에 본문을 동기적으로 필요로 한다.
// 전체 content.json 을 그 경로에 끌어들이지 않도록 guide/* 만 별도 작은 map 으로
// 만든다. 나머지 문서는 public/docs-vault raw asset 으로 읽는다.
//
// CHANGELOG 는 2026-08-19 부터 이 map 에 **전문으로 들어가지 않는다** — 파일이
// 634KB 까지 자라 모든 라우트의 공통 청크를 데스크톱 성능 예산(최대 청크
// 1.5MiB) 밖으로 밀어냈다. 관문 `/changelog` 가 첫 페인트에 동기로 필요로
// 하는 것은 최근 절 몇 개 + 「몇 개를 접었는가」뿐이므로, 그만큼만
// gateway-changelog.json 으로 잘라 담는다. `/docs` 의 CHANGELOG 전문은 다른
// 문서와 똑같이 public/docs-vault/CHANGELOG.md 를 비동기로 읽는다.
const GATEWAY_CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'gateway-content.json',
);
const GATEWAY_CHANGELOG_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'gateway-changelog.json',
);
// 번들에 담는 CHANGELOG 절 수. 관문 화면의 표시 상한(`app/[locale]/changelog/
// page.tsx` 의 RECENT_SECTIONS = 12)보다 **커야 한다** — 화면은 여기서 받은
// 것을 자기 상한으로 한 번 더 자르고, 두 절단의 접힌 수를 더해 정확한 총
// 접힌 수를 말한다. 화면 상한을 이 값 위로 올리면 그만큼은 안 보인다.
export const GATEWAY_CHANGELOG_KEEP_SECTIONS = 16;
// 매니페스트의 headings 는 `/docs` 화면(목차 레일·삽입)만 쓰는데 263KB 로
// 모든 라우트의 공통 청크에 실렸다. 번들 매니페스트에서는 비우고 slug →
// headings 맵을 별도 파일로 내, `/docs` 가 필요할 때 동적 import 한다.
// 로컬 모드(사용자 vault)는 매니페스트를 디스크에서 만들므로 headings 가
// 그대로 인라인이다 — 이 분리는 번들 볼트에만 적용된다.
const MANIFEST_HEADINGS_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'manifest.headings.json',
);
const STOREFRONT_HEADINGS_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.headings.json',
);
// P0 공감형 샘플 vault (2026-07) — 비개발자가 dogfood(이 도구 자체 설명)
// 대신 즉시 알아볼 수 있는 예시 비즈니스("온라인 쇼핑몰")를 볼 수 있게
// `samples/storefront/` 를 별도 매니페스트/콘텐츠 쌍으로 빌드한다. dogfood
// 출력(manifest.json/content.json/public/docs-vault)은 절대 건드리지 않는다 —
// `docs-vault:check` 가 그대로 통과해야 한다. public raw 복사와 dogfood
// census 모듈은 storefront 에는 만들지 않는다(스코프 최소화 — 소비처가
// 아직 JSON import 뿐).
const SAMPLES_STOREFRONT_DIR = path.join(ROOT, 'samples', 'storefront');
const STOREFRONT_MANIFEST_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.manifest.json',
);
const STOREFRONT_CONTENT_OUT = path.join(
  ROOT,
  'src',
  'entities',
  'docs-vault',
  'data',
  'sample-storefront.content.json',
);
// /download 소개 섹션의 evidence 미니어처(VaultInstrument)가 소비하는
// dogfood vault census. manifest.json(400KB)을 그 번들에 싣지 않기 위해
// 작은 상수 모듈로 분리 생성. root-first-open R+ 이전엔 `/` 의 LandingPage
// 가 이 미니어처를 그렸다 — LandingPage 제거 후 소개 콘텐츠와 함께
// `/download` 로 이관.

/** 얕은(depth 제한) 클론인가. git 이 없거나 저장소가 아니면 false. */
export function isShallowRepository(rootDir) {
  try {
    return (
      execSync('git rev-parse --is-shallow-repository', {
        cwd: rootDir,
        encoding: 'utf-8',
      }).trim() === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * 문서별 "마지막으로 바뀐 날" — 그 파일을 마지막으로 만진 커밋의 **날짜**
 * (`%cs`, 커밋이 기록한 자기 타임존 기준 YYYY-MM-DD).
 *
 * 왜 시각이 아니라 날짜인가: 이 값은 커밋에 **같이 담기는** 생성물 안에
 * 들어가는데, 그 커밋의 시각은 생성 시점에 알 수 없다. GitHub squash-merge
 * 는 PR 브랜치 커밋을 버리고 새 커밋을 만들어 시각을 다시 찍고, rebase /
 * amend 도 같은 일을 한다. 그래서 시각 정밀도로 기록하면 기준선은 **태어날
 * 때부터 어긋난다** — main 의 커밋 25개를 실측했을 때 문서 1~32건이 항상
 * 틀려 있었고(24/25 커밋), 그 어긋남을 나중에 누가 재생성하면 자기가 고치지
 * 않은 줄이 diff 에 올라와 리베이스 충돌과 유령 diff 가 됐다.
 *
 * 날짜 정밀도로 내리면 병합이 시각을 다시 찍어도 **같은 날**이라 값이 그대로다
 * (같은 날 두 PR 이 같은 문자열을 쓰므로 git 이 자동 병합한다). 소비처는 전부
 * 일 단위 이상이다 — "N일 전" 사다리, 최근 7일 렌즈, 주별 히트맵, 정렬.
 */
function gitLastCommitDays(rootDir, scopeDir) {
  const days = new Map();
  const dirty = new Set();
  try {
    const scope = path.relative(rootDir, scopeDir).replace(/\\/g, '/') || '.';
    // 얕은 클론 경고 — depth 1 체크아웃에서는 유일한 커밋이 부모 없는 root 로
    // 취급돼 `--name-only` 가 **전체 트리**를 그 한 커밋에 귀속시킨다. 그러면
    // 문서 전부가 같은 날짜를 받아 신선도 렌즈가 통째로 평평해진다(실측:
    // 247 경로 → 서로 다른 날짜 1개). CI 는 `fetch-depth: 0` 이어야 한다.
    if (isShallowRepository(rootDir)) {
      console.warn(
        '[docs-vault] ⚠️ 얕은 git 클론이다 — 문서 날짜가 전부 같아진다. 전체 히스토리로 체크아웃할 것 (CI: fetch-depth: 0).',
      );
    }
    const log = execSync(`git log --format=%x01%cs --name-only -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let currentDay = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('\x01')) {
        currentDay = line.slice(1).trim();
        continue;
      }
      const file = line.trim();
      if (!file || !currentDay) continue;
      if (!days.has(file)) days.set(file, currentDay);
    }
    const status = execSync(`git status --porcelain -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of status.split('\n')) {
      const file = line.slice(3).trim();
      if (file) dirty.add(file);
    }
  } catch {
    // git 미설치/비저장소(배포 tarball 등) — mtime 날짜로 폴백.
  }
  return { days, dirty };
}

/**
 * 로컬 타임존 기준 `YYYY-MM-DD`. `%cs` 가 커밋 자기 타임존의 날짜를 주므로
 * mtime 쪽도 같은 관례(로컬)로 맞춘다 — UTC 로 자르면 KST 오전에 편집한
 * 파일이 "어제" 로 기록돼, 그 편집을 담는 커밋의 `%cs`("오늘")와 어긋난다.
 * mtime 경로는 dirty/untracked 문서에만 쓰이므로 결과가 머신 타임존에
 * 의존하는 범위도 그 작성자의 워킹트리로 한정된다(체크아웃 상태에는 dirty
 * 문서가 없어 CI·새 워크트리는 타임존 무관).
 */
export function localDayStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function usage() {
  return [
    'Usage: node scripts/build-docs-vault.mjs [--check]',
    '',
    'Builds the static docs-vault manifest and public markdown copies.',
    '',
    'Options:',
    '  --check     Verify generated outputs are current without writing.',
    '  -h, --help  Show this help text.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length > 1) {
    return { error: `Unexpected argument: ${argv[1]}` };
  }
  if (argv[0] && argv[0] !== '--check') {
    return { error: `Unknown option: ${argv[0]}` };
  }
  return { check: argv[0] === '--check' };
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    // superpowers/ 는 AI 에이전트 내부 계획·스펙 문서함 (docs/superpowers/plans·specs).
    // 사용자 docs vault 콘텐츠가 아니므로 빌드 스캔에서 제외 — content.json 오염 방지.
    if (entry.isDirectory() && entry.name === 'superpowers') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full);
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// parser 는 scripts/lib/parse-frontmatter.mjs 의 단일 진실원에서 import.
// (R11 — 빌드 스크립트 / validator CLI / 런타임 파서 drift 방지)

function slugFromPath(full, baseDir = DOCS_DIR) {
  const rel = path.relative(baseDir, full).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '');
}

function firstHeading(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractHeadings(body) {
  const lines = body.split('\n');
  const out = [];
  const seen = new Map();
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].trim();
    const slug = text
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const occurrence = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, occurrence);
    out.push({
      depth,
      text,
      slug: occurrence === 1 ? slug : `${slug}-${occurrence}`,
    });
  }
  return out;
}

function buildExcerpt(body) {
  // Kept in sync with src/shared/lib/parse-frontmatter.ts buildExcerpt. Strip
  // markdown table separator/hr rows and turn cell pipes into middot separators
  // so a table body reads as prose instead of a wall of `|` pipes.
  const stripped = body
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/^#+\s.*$/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/^[\s|:-]*-{2,}[\s|:-]*$/gm, '') // table separator / hr rows
    .replace(/\s*\|\s*/g, ' · ') // table cell pipes → middot separators
    .replace(/^\s*[-•]\s+/gm, '') // list bullets
    .replace(/[*_`>#]/g, '') // residual emphasis / quote / heading marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ') // collapse middot runs from empty cells
    .replace(/^[\s·]+|[\s·]+$/g, '') // trim leading/trailing middots
    .trim();
  return stripped.slice(0, 320);
}

// 위키링크 target 을 문서가 속한 vault 기준으로 정규화 — mirror of
// src/shared/lib/parse-frontmatter.ts#resolveWikilinkTargetSlug (동일 로직
// 두 곳에 물리적으로 중복돼 있음 — parser 3-way contract 처럼 별도 계약
// 테스트는 아직 없지만, 여기 고치면 저기도 같이 고쳐야 drift 안 남).
// docs/ontology/ 는 이 프로젝트가 dogfood 하는 중첩 MCP vault — 그 안의
// 위키링크는 MCP 툴/사람이 쓰는 `capabilities/x` 같은 ontology-vault-루트
// 기준 slug 를 그대로 쓰지만, `/docs` 통합 트리에서 실제 slug 는
// `ontology/` 접두사가 붙어 접두사 보정 없이는 backlinksDetail 키가
// 어긋나 실제 역참조가 있어도 조회에서 누락된다 (persona QA
// fix/persona-findings ③).
export function resolveWikilinkTargetSlug(targetSlug, fromSlug) {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
}

// 링크 추출 — 상대 경로 md 참조 + 옵시디언 wikilinks. 외부 URL·이미지·
// 앵커 only 는 무시. 각 링크마다 targetSlug + 주변 context (120자) 반환.
export function extractOutLinksWithContext(body, fromSlug) {
  const slugs = new Set();
  const contexts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body))) {
    const target = m[2];
    const linkText = m[1];
    if (!target || target.startsWith('#')) continue;
    if (/^https?:\/\//i.test(target)) continue;
    if (!target.endsWith('.md') && !target.includes('.md#')) continue;
    const [mdPart] = target.split('#');
    const rel = mdPart.replace(/^\.\//, '');
    const fromDir = path.posix.dirname(fromSlug);
    const resolved = path.posix.normalize(
      fromDir === '.' ? rel : `${fromDir}/${rel}`,
    );
    const targetSlug = resolved.replace(/\.md$/, '');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault root slug
  // (중첩된 ontology/ vault 안에서는 그 vault 의 루트 기준 — 위
  // resolveWikilinkTargetSlug 참고).
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body))) {
    const targetSpec = m[1].trim();
    const [rawTargetSlug] = targetSpec.split('#');
    if (!rawTargetSlug) continue;
    const targetSlug = resolveWikilinkTargetSlug(rawTargetSlug, fromSlug);
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? rawTargetSlug).trim();
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  return { slugs: [...slugs], contexts };
}

function insertIntoTree(root, slug, title) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let child = node.children.find((c) => c.name === name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    // 디렉터리 먼저, 그 다음 파일. 그 안에서는 name 알파벳/한글 순.
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
  for (const c of node.children) sortTree(c);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// 매니페스트 스탬프 = 소스 문서 중 가장 최근 `updatedAt` **날짜**. 빌드 벽시계는
// 절대 쓰지 않는다 — 벽시계를 쓰면 재생성마다 파일 3번째 줄이 바뀌어 동시에
// 열린 PR 두 개가 **항상** 여기서 충돌한다(오늘 리베이스 충돌의 고정 지분).
// 날짜 정밀도라서 같은 날 재생성한 두 브랜치는 같은 문자열을 써 자동 병합된다.
// 날짜 있는 문서가 없으면 고정 폴백.
const STABLE_GENERATED_AT_FALLBACK = '1970-01-01';
export function deterministicGeneratedAt(docs) {
  const days = (docs ?? [])
    .map((doc) => doc?.updatedAt)
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (days.length === 0) return STABLE_GENERATED_AT_FALLBACK;
  return days.reduce((a, b) => (a >= b ? a : b));
}

/**
 * `## ` 절 단위로 앞에서 `limit` 개만 남긴다 — **`src/views/gateway-doc/lib/
 * vault-doc.ts` 의 `trimToRecentSections` 와 같은 의미론이어야 한다.** 화면이
 * 번들된 미리보기를 자기 상한으로 한 번 더 자르므로, 두 구현의 절 경계가
 * 어긋나면 「접힌 절 수」가 거짓말이 된다. 그 동일성은
 * `tests/contract/gateway-changelog-preview.contract.test.ts` 가 실제
 * CHANGELOG 로 실증한다 (parse-frontmatter 3-way 계약과 같은 패턴).
 */
export function trimToRecentSections(markdown, limit) {
  const lines = markdown.split('\n');
  const boundaries = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit];
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}

/**
 * 번들 매니페스트에서 headings 를 떼어낸다 — 매니페스트의 docs 는
 * `headings: []` 가 되고, 떼어낸 것은 slug → headings 맵으로 돌아온다
 * (빈 배열은 맵에 넣지 않는다 — 바이트만 쓰고 정보가 없다).
 */
export function splitManifestHeadings(manifest) {
  const headingsBySlug = {};
  const docs = manifest.docs.map((doc) => {
    if (Array.isArray(doc.headings) && doc.headings.length > 0) {
      headingsBySlug[doc.slug] = doc.headings;
    }
    return { ...doc, headings: [] };
  });
  return { manifest: { ...manifest, docs }, headingsBySlug };
}

export function comparableManifest(manifest) {
  return {
    ...manifest,
    docs: (manifest.docs ?? []).map((doc) => ({
      ...doc,
      updatedAt: '<ignored>',
    })),
    generatedAt: '<ignored>',
  };
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

export function comparableDoc(doc) {
  return {
    ...doc,
    updatedAt: '<ignored>',
  };
}

// Dogfood census 모듈 소스 — deterministic (timestamp 없음). vault 내용이
// 실제로 바뀔 때만 diff 가 난다. 음각 숫자 = 실데이터 계약의 산출물.

async function assertOutputsCurrent({
  manifest,
  headingsBySlug,
  content,
  gatewayContent,
  gatewayChangelog,
  publicFiles,
}) {
  const issues = [];

  const currentManifest = await readJsonIfExists(MANIFEST_OUT);
  if (!currentManifest) {
    issues.push(`missing ${path.relative(ROOT, MANIFEST_OUT)}`);
  } else if (
    stableStringify(comparableManifest(currentManifest)) !==
    stableStringify(comparableManifest(manifest))
  ) {
    issues.push(`stale ${path.relative(ROOT, MANIFEST_OUT)}`);
  }

  const currentHeadings = await readJsonIfExists(MANIFEST_HEADINGS_OUT);
  if (!currentHeadings) {
    issues.push(`missing ${path.relative(ROOT, MANIFEST_HEADINGS_OUT)}`);
  } else if (stableStringify(currentHeadings) !== stableStringify(headingsBySlug)) {
    issues.push(`stale ${path.relative(ROOT, MANIFEST_HEADINGS_OUT)}`);
  }

  const currentGatewayChangelog = await readJsonIfExists(GATEWAY_CHANGELOG_OUT);
  if (!currentGatewayChangelog) {
    issues.push(`missing ${path.relative(ROOT, GATEWAY_CHANGELOG_OUT)}`);
  } else if (
    stableStringify(currentGatewayChangelog) !== stableStringify(gatewayChangelog)
  ) {
    issues.push(`stale ${path.relative(ROOT, GATEWAY_CHANGELOG_OUT)}`);
  }

  const currentContent = await readJsonIfExists(CONTENT_OUT);
  if (!currentContent) {
    issues.push(`missing ${path.relative(ROOT, CONTENT_OUT)}`);
  } else if (stableStringify(currentContent) !== stableStringify(content)) {
    issues.push(`stale ${path.relative(ROOT, CONTENT_OUT)}`);
  }

  const currentGatewayContent = await readJsonIfExists(GATEWAY_CONTENT_OUT);
  if (!currentGatewayContent) {
    issues.push(`missing ${path.relative(ROOT, GATEWAY_CONTENT_OUT)}`);
  } else if (
    stableStringify(currentGatewayContent) !== stableStringify(gatewayContent)
  ) {
    issues.push(`stale ${path.relative(ROOT, GATEWAY_CONTENT_OUT)}`);
  }

  const expectedPublic = new Map(publicFiles.map((file) => [file.relativePath, file.raw]));
  const currentPublicFiles = existsSync(PUBLIC_OUT)
    ? (await walk(PUBLIC_OUT)).map((file) => path.relative(PUBLIC_OUT, file).replace(/\\/g, '/'))
    : [];
  for (const relativePath of currentPublicFiles) {
    if (relativePath.endsWith('.md') && !expectedPublic.has(relativePath)) {
      issues.push(`extra ${path.posix.join('public/docs-vault', relativePath)}`);
    }
  }
  for (const [relativePath, raw] of expectedPublic) {
    const outPath = path.join(PUBLIC_OUT, relativePath);
    try {
      const current = await readFile(outPath, 'utf8');
      if (current !== raw) {
        issues.push(`stale ${path.posix.join('public/docs-vault', relativePath)}`);
      }
    } catch (err) {
      if (err?.code === 'ENOENT') {
        issues.push(`missing ${path.posix.join('public/docs-vault', relativePath)}`);
      } else {
        throw err;
      }
    }
  }

  if (issues.length > 0) {
    console.error('[docs-vault] generated outputs are stale:');
    for (const issue of issues.slice(0, 20)) {
      console.error(`  - ${issue}`);
    }
    if (issues.length > 20) {
      console.error(`  - ... ${issues.length - 20} more`);
    }
    console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
    process.exit(1);
  }
}

/**
 * 한 vault 디렉터리(docs/ 또는 samples/storefront/)를 스캔해서
 * manifest/content/publicFiles 를 조립하는 공용 코어. dogfood(docs/) 빌드가
 * 원래 갖고 있던 로직 그대로 — 새 샘플 vault(storefront)를 추가하며
 * dogfood 출력에 바이트 단위 회귀가 없도록 분리만 했다(동작 변경 없음).
 * `publicOutDir` 가 주어지면 `!check` 일 때 raw md 를 그 아래로 복사한다
 * (storefront 는 아직 공개 raw 사본이 필요한 소비처가 없어 `null`).
 *
 * export 인 이유: 결정성 계약 테스트가 임시 git 저장소를 `rootDir`/`dir` 로
 * 넘겨 "커밋 시각을 같은 날 안에서 바꿔 써도 산출물 바이트가 같다" 를
 * 실증한다 (`check: true` 로 부르면 아무것도 쓰지 않는다).
 */
export async function scanVaultDir(
  dir,
  { rootDir = ROOT, publicOutDir = null, check = false, treeName = 'docs' } = {},
) {
  const files = await walk(dir);
  const gitDays = gitLastCommitDays(rootDir, dir);
  const docs = [];
  const publicFiles = [];
  const content = {};
  // backlinksDetail 만 유지 — 단순 backlinks (deprecated) 는 manifest 에서 제거.
  const backlinksDetailMap = new Map(); // slug -> Array<{ fromSlug, context, linkText }>
  const tagsMap = new Map(); // tag -> Set<slug>

  for (const full of files) {
    const raw = await readFile(full, 'utf8');
    const slug = slugFromPath(full, dir);
    const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
    const headings = extractHeadings(body);
    const title =
      (typeof frontmatter.title === 'string' && frontmatter.title) ||
      firstHeading(body) ||
      slug.split('/').pop();
    const description =
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : undefined;
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : typeof frontmatter.tags === 'string'
        ? frontmatter.tags.split(/\s+/).filter(Boolean)
        : [];
    const { slugs: linksOut, contexts: linkContexts } =
      extractOutLinksWithContext(body, slug);
    for (const ctx of linkContexts) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target).push({
        fromSlug: slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag).add(slug);
    }
    const st = await stat(full);
    const relPath = path.relative(rootDir, full).replace(/\\/g, '/');
    const committedDay = gitDays.dirty.has(relPath) ? null : gitDays.days.get(relPath);
    const nextDoc = {
      slug,
      path: relPath,
      title,
      description,
      tags,
      frontmatter,
      ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
      headings,
      excerpt: buildExcerpt(body),
      wordCount: body.split(/\s+/).filter(Boolean).length,
      // 커밋 날짜 우선 — 워킹트리에서 고치는 중(dirty)이거나 아직 추적되지
      // 않은 문서만 mtime 날짜. 둘 다 "날짜" 라서 편집한 날과 그 편집이
      // 병합되는 날이 같은 한 값이 흔들리지 않는다.
      updatedAt: committedDay ?? localDayStamp(st.mtime) ?? STABLE_GENERATED_AT_FALLBACK,
      linksOut,
    };
    // 이전 manifest 값을 되살리는 안정화 장치는 제거했다 — 생성물이 자기
    // 직전 생성물에 의존하면 "같은 입력 → 같은 바이트" 가 성립하지 않는다
    // (기준선이 유실되거나 다른 순서로 재생성되면 값이 갈린다). 날짜 정밀도가
    // 그 장치가 막으려던 mtime 널뜀을 이미 흡수한다.
    docs.push(nextDoc);

    publicFiles.push({ relativePath: `${slug}.md`, raw });
    content[slug] = raw;

    if (!check && publicOutDir) {
      // raw md 를 public/docs-vault 아래 slug 로 복사. 경로의 서브디렉토리까지 생성.
      const outPath = path.join(publicOutDir, `${slug}.md`);
      await ensureDir(path.dirname(outPath));
      await writeFile(outPath, raw, 'utf8');
    }
  }

  // D-1 — register FRONTMATTER relation-ref backlinks (mirrors
  // `src/entities/docs-vault/lib/build-local-manifest.ts`). The body pass above
  // only saw markdown links, so a doc referenced purely through frontmatter
  // (`dependencies: [capabilities/mcp-server]`, …) showed a false "no
  // backlinks" in the sample (build-time) reader. Same relation-key set as the
  // MCP `find_backlinks` tool. Deduped by fromSlug in the assembly below, so a
  // body link to the same target keeps its richer context.
  {
    const RELATION_REF_ARRAY_KEYS = [
      'domains',
      'capabilities',
      'elements',
      'dependencies',
      'relates',
      'contains',
      'describes',
    ];
    const RELATION_REF_STRING_KEYS = ['domain'];
    const slugSet = new Set(docs.map((doc) => doc.slug));
    const tailToSlug = new Map(); // tail -> slug | null (null = ambiguous)
    for (const doc of docs) {
      const tail = doc.slug.split('/').pop() ?? doc.slug;
      tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
    }
    const refStrings = (frontmatter) => {
      const out = [];
      for (const key of RELATION_REF_ARRAY_KEYS) {
        const value = frontmatter[key];
        if (Array.isArray(value)) {
          for (const item of value)
            if (typeof item === 'string' && item.trim()) out.push(item.trim());
        } else if (typeof value === 'string' && value.trim()) {
          out.push(value.trim());
        }
      }
      for (const key of RELATION_REF_STRING_KEYS) {
        const value = frontmatter[key];
        if (typeof value === 'string' && value.trim()) out.push(value.trim());
      }
      return out;
    };
    const resolveRef = (ref) => {
      const normalized = ref.replace(/\.md$/i, '');
      if (slugSet.has(normalized)) return normalized;
      const tail = normalized.split('/').pop() ?? normalized;
      return tailToSlug.get(tail) ?? null;
    };
    for (const doc of docs) {
      const seenTargets = new Set();
      for (const ref of refStrings(doc.frontmatter)) {
        const target = resolveRef(ref);
        if (!target || target === doc.slug || seenTargets.has(target)) continue;
        seenTargets.add(target);
        if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
        backlinksDetailMap.get(target).push({
          fromSlug: doc.slug,
          context: `frontmatter · **[${ref}]**`,
          linkText: ref,
        });
      }
    }
  }

  docs.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));

  const tree = { name: treeName, path: '', type: 'dir' };
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title);
  sortTree(tree);

  const backlinksDetail = {};
  for (const [slug, list] of backlinksDetailMap) {
    // fromSlug 로 그룹 후 첫 컨텍스트만 유지 (한 문서에서 여러 번 인용해도
    // 한 줄만 보여줌). fromSlug 알파벳 순 정렬.
    const byFrom = new Map();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      a.fromSlug.localeCompare(b.fromSlug, 'ko'),
    );
  }
  const tags = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest = {
    version: '2026-04-23',
    // 스탬프는 소스 문서 중 가장 최근 변경 **날짜** 다 — 빌드 벽시계도, 직전
    // 생성물도 참조하지 않는다. 그래서 같은 소스는 어느 머신에서 몇 번을
    // 재생성해도 같은 바이트가 나오고, 같은 날 갈라진 두 브랜치는 이 줄에서
    // 충돌하지 않는다.
    generatedAt: deterministicGeneratedAt(docs),
    docs,
    backlinksDetail,
    tags,
    tree,
  };

  // CHANGELOG 는 전문 대신 gateway-changelog.json 미리보기로 나간다 — 파일
  // 상단의 GATEWAY_CHANGELOG_OUT 주석 참조.
  const gatewayContent = Object.fromEntries(
    Object.entries(content).filter(([slug]) => slug.startsWith('guide/')),
  );

  return { manifest, content, gatewayContent, publicFiles };
}

async function buildDocsVault({ check = false } = {}) {
  if (!existsSync(DOCS_DIR)) {
    console.error(`[docs-vault] docs/ 디렉터리가 없음: ${DOCS_DIR}`);
    process.exit(1);
  }

  if (!check) {
    // public/docs-vault 를 먼저 비움 — 삭제된 문서가 stale 로 남지 않게
    if (existsSync(PUBLIC_OUT)) {
      await rm(PUBLIC_OUT, { recursive: true, force: true });
    }
    await ensureDir(PUBLIC_OUT);
    await ensureDir(path.dirname(MANIFEST_OUT));
  }

  const scanned = await scanVaultDir(DOCS_DIR, {
    rootDir: ROOT,
    publicOutDir: PUBLIC_OUT,
    check,
  });
  const { content, gatewayContent, publicFiles } = scanned;
  // 번들 매니페스트는 headings 를 별도 파일로 떼고 나간다 — 상단
  // MANIFEST_HEADINGS_OUT 주석 참조.
  const { manifest, headingsBySlug } = splitManifestHeadings(scanned.manifest);
  const { docs, backlinksDetail, tags } = manifest;
  const changelogRaw = content['CHANGELOG'];
  if (typeof changelogRaw !== 'string') {
    console.error('[docs-vault] docs/CHANGELOG.md 가 스캔에 없다 — 관문 미리보기를 만들 수 없다.');
    process.exit(1);
  }
  const gatewayChangelog = trimToRecentSections(
    changelogRaw,
    GATEWAY_CHANGELOG_KEEP_SECTIONS,
  );

  if (check) {
    await assertOutputsCurrent({
      manifest,
      headingsBySlug,
      content,
      gatewayContent,
      gatewayChangelog,
      publicFiles,
    });
    console.log(
      `[docs-vault] current · ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags`,
    );
    return;
  }

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(MANIFEST_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  await writeFile(GATEWAY_CONTENT_OUT, JSON.stringify(gatewayContent, null, 2), 'utf8');
  await writeFile(GATEWAY_CHANGELOG_OUT, JSON.stringify(gatewayChangelog, null, 2), 'utf8');
  console.log(
    `[docs-vault] ${docs.length} docs · ${Object.keys(backlinksDetail).length} backlinked · ${Object.keys(tags).length} tags → ${path.relative(ROOT, MANIFEST_OUT)}`,
  );
}

/**
 * 샘플 storefront vault (`samples/storefront/`) 빌드 — dogfood 와 별도
 * manifest/content 쌍만 만든다. public raw 사본·census 모듈·PUBLIC_OUT 초기화
 * 없음(아직 필요한 소비처가 없어 스코프를 최소화했다 — 필요해지면 이 함수
 * 안에서만 확장).
 */
async function buildStorefrontSample({ check = false } = {}) {
  if (!existsSync(SAMPLES_STOREFRONT_DIR)) {
    console.error(`[docs-vault] samples/storefront/ 디렉터리가 없음: ${SAMPLES_STOREFRONT_DIR}`);
    process.exit(1);
  }

  if (!check) {
    await ensureDir(path.dirname(STOREFRONT_MANIFEST_OUT));
  }

  const scanned = await scanVaultDir(SAMPLES_STOREFRONT_DIR, {
    rootDir: ROOT,
    publicOutDir: null,
    check,
    treeName: 'storefront',
  });
  const { content } = scanned;
  const { manifest, headingsBySlug } = splitManifestHeadings(scanned.manifest);

  if (check) {
    const issues = [];
    const currentManifest = await readJsonIfExists(STOREFRONT_MANIFEST_OUT);
    if (!currentManifest) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`);
    } else if (
      stableStringify(comparableManifest(currentManifest)) !==
      stableStringify(comparableManifest(manifest))
    ) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`);
    }
    const currentHeadings = await readJsonIfExists(STOREFRONT_HEADINGS_OUT);
    if (!currentHeadings) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_HEADINGS_OUT)}`);
    } else if (stableStringify(currentHeadings) !== stableStringify(headingsBySlug)) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_HEADINGS_OUT)}`);
    }
    const currentContent = await readJsonIfExists(STOREFRONT_CONTENT_OUT);
    if (!currentContent) {
      issues.push(`missing ${path.relative(ROOT, STOREFRONT_CONTENT_OUT)}`);
    } else if (stableStringify(currentContent) !== stableStringify(content)) {
      issues.push(`stale ${path.relative(ROOT, STOREFRONT_CONTENT_OUT)}`);
    }
    if (issues.length > 0) {
      console.error('[docs-vault] storefront sample outputs are stale:');
      for (const issue of issues) console.error(`  - ${issue}`);
      console.error('[docs-vault] run `pnpm docs-vault:build` to refresh them.');
      process.exit(1);
    }
    console.log(`[docs-vault] storefront sample current · ${manifest.docs.length} docs`);
    return;
  }

  await writeFile(STOREFRONT_MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  await writeFile(STOREFRONT_HEADINGS_OUT, JSON.stringify(headingsBySlug, null, 2), 'utf8');
  await writeFile(STOREFRONT_CONTENT_OUT, JSON.stringify(content, null, 2), 'utf8');
  console.log(
    `[docs-vault] storefront sample ${manifest.docs.length} docs → ${path.relative(ROOT, STOREFRONT_MANIFEST_OUT)}`,
  );
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    process.exit(2);
  }
  await buildDocsVault({ check: args.check });
  await buildStorefrontSample({ check: args.check });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[docs-vault] build failed:', err);
    process.exit(1);
  });
}
