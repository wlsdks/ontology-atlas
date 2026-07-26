import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 단일 진실원 가드 — static 모드(사용자 vault 미선택)에서 "지금 어떤 번들
 * 볼트인가" 라는 질문의 답은 **한 곳**에서만 나와야 한다.
 *
 * 실측 결함(2026-07-26): 샘플 선택(`dogfood` / `storefront`)을 존중하는
 * 소비자가 2곳뿐이었고 나머지는 dogfood 매니페스트를 직접 import 해서,
 * 사용자가 예시 쇼핑몰을 골라도 검색 팔레트·프로젝트 드로어·문서 목록은
 * dogfood 를 뒤졌다. 한 화면에 두 볼트가 섞여 "고장" 으로 읽혔다.
 *
 * 그래서 진입점을 `resolveStaticVaultSource` / `useStaticVaultSource` 로
 * 좁히고, 그 규율이 다시 무너지지 않도록 여기서 코드를 직접 스캔한다.
 *
 * 구현 주의: 외부 프로세스(ripgrep 등)에 의존하지 않는다. 도구가 없으면
 * 조용히 0건을 돌려주고 "위반 없음" 으로 오판하기 때문이다. node:fs 로 직접
 * 순회하고, 스캔 파일 수를 함께 단언해 파서가 죽으면 가드가 먼저 터지게 한다.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

/** 유일한 허용 구역 — 리졸버가 사는 엔티티. 여기서만 원본 JSON 을 만진다. */
const ALLOWED_PREFIX = path.join('src', 'entities', 'docs-vault');

/** 번들 볼트 원본 데이터의 export 이름. 화면 코드가 직접 쓰면 안 된다. */
const FORBIDDEN_BINDINGS = [
  'vaultManifest',
  'vaultContent',
  'sampleStorefrontManifest',
  'sampleStorefrontContent',
];

/** `import ... from '...'` 을 여러 줄에 걸쳐도 통째로 집는다. */
const IMPORT_STATEMENT = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;

/** 엔티티를 우회해 JSON 을 직접 집는 경로 (`.../docs-vault/data/manifest.json`). */
const RAW_DATA_SPECIFIER = /docs-vault\/data\/[\w.-]+\.json$/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

function findViolations(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const clause = match[1];
    const specifier = match[2];
    if (RAW_DATA_SPECIFIER.test(specifier)) {
      hits.push(specifier);
      continue;
    }
    for (const binding of FORBIDDEN_BINDINGS) {
      if (new RegExp(`\\b${binding}\\b`).test(clause)) hits.push(binding);
    }
  }
  return [...new Set(hits)];
}

describe('static 볼트 단일 진입점 계약', () => {
  it('entities/docs-vault 바깥에서는 번들 볼트 원본을 직접 import 하지 않는다', () => {
    const files = collectSourceFiles(SRC_DIR);

    // 가드가 살아있음을 스스로 증명한다 — 순회가 깨져 0건을 읽으면 위반도
    // 0건이 되어 조용히 통과한다. 그 실패를 여기서 먼저 잡는다.
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(process.cwd(), file);
      if (rel.startsWith(ALLOWED_PREFIX)) continue;
      const violations = findViolations(readFileSync(file, 'utf8'));
      if (violations.length > 0) offenders.push(`${rel} → ${violations.join(', ')}`);
    }

    expect(
      offenders,
      [
        '번들 볼트 원본(dogfood / storefront 매니페스트·본문)을 직접 import 하면',
        '사용자의 "예시 비즈니스 보기" 선택이 그 표면에서만 조용히 무시된다.',
        '대신 화면 코드는 useStaticVaultSource() 를, 훅이 아닌 코드는',
        'resolveStaticVaultSource(source) 를 써서 매니페스트와 본문을 짝으로 받는다.',
        '위반 파일:',
        ...offenders,
      ].join('\n'),
    ).toEqual([]);
  });
});
