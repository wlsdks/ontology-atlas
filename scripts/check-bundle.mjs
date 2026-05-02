#!/usr/bin/env node
// per-route firebase chunk 회귀 차단 (PR #99 이후).
//
// mission v2 의 *"local-first 첫 paint firebase 0"* 약속을 build artifact
// 단위로 보장. user-facing 라우트 (`/`, `/topology`, `/docs`, …) 의 정적
// 청크에 firebase JS 가 다시 들어가면 exit 1 — CI / 로컬 PR 검증.
//
// 사용:
//   pnpm build                   # out/ 와 .next/static/chunks 생성
//   node scripts/check-bundle.mjs
//
// 룰:
//   - LOCAL_FIRST_ROUTES: firebase chunk 0 이어야 함. 위반 시 fail.
//   - CLOUD_ADMIN_ROUTES: firebase chunk 정적 로드 OK (단순 보고).
//
// 새 user-facing 라우트 추가 시 LOCAL_FIRST_ROUTES 에 등록.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CHUNKS_DIR = join(ROOT, '.next/static/chunks');
const OUT_DIR = join(ROOT, 'out');

// firebase SDK 청크 식별 — 여러 unique 토큰이 *동시에* 등장해야 한다.
// 단일 `getFirestore` 문자열은 application chunk (Button / icon / route)
// 에도 `(0,r.getFirestore)` 같이 단편으로 들어가서 false positive.
// SDK bundle 은 internal class 들 (`Firestore`, `FieldValue`, `DocumentReference`
// 등) 을 다 갖고 있어 4+ 매치.
const FIREBASE_SDK_TOKENS = [
  'getFirestore',
  'onAuthStateChanged',
  'getApps',
  'Firestore',
  'DocumentReference',
  'CollectionReference',
  'FieldValue',
  '@firebase/firestore',
  '@firebase/auth',
];
const SDK_MIN_TOKEN_HITS = 4;

// next-intl migration: 모든 user-facing 라우트가 /[locale] 아래로 이동했다.
// 가드도 locale 별로 검사 — `/topology` 만 보던 시절엔 i18n 후 false green
// 으로 통과해 미래 firebase 청크 leak 회귀를 못 잡았다 (eval 결과로 발견).
const LOCALES = ['en', 'ko'];
const LOCAL_FIRST_BASE_ROUTES = [
  '',
  'topology',
  'docs',
  'ontology',
  'ontology/edit',
  'ontology/insights',
  'ontology/relations',
  'projects',
  'login',
  'signup',
  'account',
  'reset-password',
];
const CLOUD_ADMIN_BASE_ROUTES = ['settings/categories', 'settings/statuses', 'settings/import'];

function expandRoutes(baseRoutes) {
  const out = [];
  for (const locale of LOCALES) {
    for (const base of baseRoutes) {
      out.push(base ? `/${locale}/${base}` : `/${locale}`);
    }
  }
  return out;
}

// Root `/` (locale-redirect page) 는 그 자체가 firebase 호출을 하면 안 되니
// 별도로 추가.
const LOCAL_FIRST_ROUTES = ['/', ...expandRoutes(LOCAL_FIRST_BASE_ROUTES)];
const CLOUD_ADMIN_ROUTES = expandRoutes(CLOUD_ADMIN_BASE_ROUTES);

function listFirebaseChunks() {
  const out = [];
  for (const name of readdirSync(CHUNKS_DIR)) {
    if (!name.endsWith('.js')) continue;
    const path = join(CHUNKS_DIR, name);
    const sz = statSync(path).size;
    if (sz < 50_000) continue; // SDK 청크는 최소 50KB. 더 작으면 skip.
    const content = readFileSync(path, 'utf8');
    const hits = FIREBASE_SDK_TOKENS.filter((t) => content.includes(t)).length;
    if (hits >= SDK_MIN_TOKEN_HITS) {
      out.push({ id: basename(name, '.js'), size: sz, hits });
    }
  }
  return out;
}

function htmlPathForRoute(route) {
  if (route === '/') return join(OUT_DIR, 'index.html');
  return join(OUT_DIR, route.replace(/^\//, ''), 'index.html');
}

function chunksLoadedBy(html, chunkIds) {
  const loaded = [];
  for (const id of chunkIds) {
    if (html.includes(id)) loaded.push(id);
  }
  return loaded;
}

function fmtKb(bytes) {
  return `${Math.round(bytes / 1024)}K`;
}

function main() {
  // 빌드 산출물 존재 확인.
  try {
    statSync(CHUNKS_DIR);
    statSync(OUT_DIR);
  } catch {
    console.error('❌ .next/static/chunks 또는 out/ 가 없습니다. 먼저 `pnpm build` 실행.');
    process.exit(2);
  }

  const fbChunks = listFirebaseChunks();
  if (fbChunks.length === 0) {
    console.log('ℹ️  firebase SDK 청크 0 — 모든 라우트 자동 통과 (의외의 결과면 signature 점검).');
    return;
  }

  console.log(`Firebase SDK 청크 ${fbChunks.length} 개 발견:`);
  for (const c of fbChunks) console.log(`  - ${c.id} (${fmtKb(c.size)})`);
  console.log();

  let violations = 0;

  console.log('## local-first 라우트 (firebase 0 이어야 함)');
  for (const route of LOCAL_FIRST_ROUTES) {
    const path = htmlPathForRoute(route);
    let html;
    try {
      html = readFileSync(path, 'utf8');
    } catch {
      console.log(`  ${route}: ⚠️  (HTML 없음 — 해당 라우트 빌드 안 됐거나 dynamic params)`);
      continue;
    }
    const loaded = chunksLoadedBy(
      html,
      fbChunks.map((c) => c.id),
    );
    if (loaded.length === 0) {
      console.log(`  ${route}: ✅ 0K`);
    } else {
      const total = loaded.reduce(
        (sum, id) => sum + (fbChunks.find((c) => c.id === id)?.size ?? 0),
        0,
      );
      console.log(`  ${route}: ❌ ${fmtKb(total)} (chunks: ${loaded.join(', ')})`);
      violations += 1;
    }
  }

  console.log();
  console.log('## cloud-admin 라우트 (firebase 정적 로드 OK — 단순 보고)');
  for (const route of CLOUD_ADMIN_ROUTES) {
    const path = htmlPathForRoute(route);
    let html;
    try {
      html = readFileSync(path, 'utf8');
    } catch {
      console.log(`  ${route}: (skip — HTML 없음)`);
      continue;
    }
    const loaded = chunksLoadedBy(
      html,
      fbChunks.map((c) => c.id),
    );
    const total = loaded.reduce(
      (sum, id) => sum + (fbChunks.find((c) => c.id === id)?.size ?? 0),
      0,
    );
    console.log(`  ${route}: ${fmtKb(total)}`);
  }

  console.log();
  if (violations > 0) {
    console.error(
      `❌ ${violations} local-first 라우트가 firebase chunk 를 정적 로드합니다. ` +
        `자세히 \`@.claude/rules/architecture.md\` 의 "Entity barrel vs api 분리" 참조.`,
    );
    process.exit(1);
  }
  console.log('✅ 모든 local-first 라우트가 firebase chunk 0 — mission v2 약속 유지.');
}

main();
