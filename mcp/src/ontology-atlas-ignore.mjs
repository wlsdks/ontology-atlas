import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `.ontology-atlasignore` — vault 루트에 두는 gitignore-style 패턴 파일.
// `materialize_external_element` 추천에서 제외할 reference 패턴을 한 줄에 하나.
// 의도된 외부 코드 (예: 모든 src 디렉토리 하위) 가 noise 로 매번 surface 되는 걸 막는다.
//
//   - `#` 으로 시작하는 줄은 주석
//   - 빈 줄 무시
//   - `*` 는 `/` 를 제외한 모든 문자에 매치
//   - `**` 는 디렉토리 포함 모든 문자에 매치
//   - `?` 는 `/` 를 제외한 단일 문자
//   - 행 끝의 `/` 는 strip (디렉토리 표시는 매칭 무영향)
//
// 부정 (`!pattern`) 은 1차 버전 미지원 — 필요해지면 추가.
export function loadOntologyAtlasIgnore(vaultRoot) {
  const file = resolve(vaultRoot, '.ontology-atlasignore');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf-8');
  return parseOntologyAtlasIgnore(text);
}

export function parseOntologyAtlasIgnore(text) {
  const lines = text.split(/\r?\n/);
  const patterns = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('!')) continue; // negation 미지원
    patterns.push(line.endsWith('/') ? line.slice(0, -1) : line);
  }
  return patterns;
}

/**
 * ref (예: `src/views/foo.tsx`) 가 patterns 중 하나라도 매치하는가?
 */
export function refMatchesOntologyAtlasIgnore(ref, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const pat of patterns) {
    if (matchPattern(ref, pat)) return true;
  }
  return false;
}

function matchPattern(ref, pattern) {
  const regex = patternToRegex(pattern);
  return regex.test(ref);
}

function patternToRegex(pattern) {
  // 1. regex special chars escape (except `*`, `?`, `/` — 우리 glob 의 의미 char).
  let r = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // 2. `/**/` 중간 — `/(?:.*/)?` 로 *zero-or-more 디렉토리* 매칭.
  //     예: `src/**/foo.ts` 가 `src/foo.ts` 와 `src/x/foo.ts` 둘 다 매치.
  r = r.replace(/\/\*\*\//g, '/__OATLAS_MID__');
  // 3. `**/` 시작 — 같은 의미로 0+ 디렉토리 prefix.
  if (r.startsWith('**/')) r = '__OATLAS_START__' + r.slice(3);
  // 4. `/**` 끝 — 0+ 디렉토리 suffix (`src/**` 가 `src` 자체도 매치하나? gitignore
  //     에선 디렉토리 안에 있는 것만 매치. 우리 ref 는 항상 path 라 `src/**` 는
  //     `src/` 로 시작하는 모든 ref. 빈 경우 (`src` 단독) 는 매치 안 시킴).
  if (r.endsWith('/**')) r = r.slice(0, -3) + '__OATLAS_END__';

  // 5. 남은 단순 `**` — `.*`
  r = r.replace(/\*\*/g, '.*');
  // 6. `*` — `[^/]*`
  r = r.replace(/\*/g, '[^/]*');
  // 7. `?` — `[^/]`
  r = r.replace(/\?/g, '[^/]');

  // 8. placeholder 복원.
  r = r.replace(/__OATLAS_MID__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_START__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_END__/g, '/.*');

  return new RegExp('^' + r + '$');
}
