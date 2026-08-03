import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 이름 있는 Tailwind 기본 스텝 래칫 — **게이트가 없다고 주석이 자백하던 자리**.
 *
 * ## 왜 이 파일이 존재하나 (2026-08-03 규칙 감사 → 체계석)
 *
 * `eslint.config.mjs` 는 오래 "래칫(`type-ramp-coverage`)이 이름 있는 스텝을
 * 붙든다" 고 적어 왔는데 **거짓이었다** — 그 래칫의 `ARBITRARY_SIZE` 는 대괄호
 * arbitrary 패턴만 세고, 이름 유틸리티(`rounded-2xl` · `text-xl` …)는 한 건도
 * 세지 않는다. 게다가 그 래칫은 eslint 가 덮는 디렉토리를 통째로 건너뛰는데
 * `rounded-2xl` 19건 중 18건이 그 안이었다 — lint 도 래칫도 안 보는 자리.
 * 증거는 수 자체다: 주석이 12건이라 적은 뒤 20건으로 자랐고 아무것도 빨개지지
 * 않았다.
 *
 * ## 왜 lint 확장이 아니라 래칫인가
 *
 * `text-lg` 류 11건은 lint 커버 디렉토리 안에 있어 셀렉터를 켜면 즉시 CI 가
 * 빨개진다. 치환은 픽셀을 움직이므로(`text-xl` 20px 은 램프 어느 스텝도 아니다)
 * 자리마다 디자인 판정이 필요하고, 그 판정을 기다리는 동안 **자라지 못하게
 * 붙드는 일**은 래칫의 몫이다. `rounded-sm`(59) + 무접미 `rounded`(37)는 같은
 * 날 `--radius-micro`(4px) 등재 + 전량 기계 치환으로 **0이 됐고** eslint
 * 셀렉터가 마저 막는다 — 여기서는 재유입 차단(기준선 0)만 맡는다.
 *
 * 이 래칫은 `type-ramp-coverage` 와 달리 **eslint 커버 디렉토리를 건너뛰지
 * 않는다** — 이름 유틸리티는 그 룰의 사정거리 밖이라 커버/미커버 구분이 없다.
 */

/**
 * 패밀리별 기준선 — **내려가기만 한다.**
 *
 * 0 인 패밀리는 "없음"이 아니라 "재유입 차단"이다. 0 이 아닌 패밀리는 아직
 * per-site 디자인 판정이 안 끝난 부채다(`rounded-2xl` 16px 은 card(9)로 내릴지
 * panel(12)로 올릴지 자리마다 다르다 — 체계석 판정 대기).
 */
const FAMILIES: ReadonlyArray<readonly [name: string, re: RegExp, budget: number]> = [
  ['rounded (무접미, 4px)', /(?<![-\w])rounded(?![-\w])/g, 0],
  ['rounded-xs', /(?<![-\w])rounded-xs(?![-\w])/g, 0],
  ['rounded-sm', /(?<![-\w])rounded-sm(?![-\w])/g, 0],
  // 19 → 16: 죽은 프리미티브 둘(`link-list-editor`·`chip-list-editor`)이 3건을
  // 지고 있었다. 코드를 지우자 부채도 같이 사라진 자리라 판정이 필요 없었다.
  ['rounded-2xl', /(?<![-\w])rounded-2xl(?![-\w])/g, 16],
  ['rounded-3xl', /(?<![-\w])rounded-3xl(?![-\w])/g, 0],
  ['text-xs', /(?<![-\w])text-xs(?![-\w])/g, 0],
  ['text-sm', /(?<![-\w])text-sm(?![-\w])/g, 0],
  ['text-base', /(?<![-\w])text-base(?![-\w])/g, 1],
  ['text-lg', /(?<![-\w])text-lg(?![-\w])/g, 3],
  ['text-xl', /(?<![-\w])text-xl(?![-\w])/g, 2],
  ['text-2xl', /(?<![-\w])text-2xl(?![-\w])/g, 1],
  ['text-3xl', /(?<![-\w])text-3xl(?![-\w])/g, 1],
  ['text-4xl', /(?<![-\w])text-4xl(?![-\w])/g, 0],
];

const ROOTS = ['src', 'app'] as const;

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      collect(p, out);
      continue;
    }
    /*
     * `.tsx` 만 — `.ts` 를 넣으면 주석·산문 속 영어 단어("rounded", 그리고
     * 값 층 주석이 실측 근거로 적어 둔 `text-lg`)가 위반으로 잡힌다(초판
     * 실측: .ts 포함 시 무접미 rounded 오탐 13건, 전부 주석/산문). 클래스
     * 문자열은 컴포넌트 파일에 산다 — 실위반 전수도 전부 .tsx 였다.
     */
    if (!name.endsWith('.tsx')) continue;
    if (name.includes('.test.') || name.includes('.spec.')) continue;
    out.push(p);
  }
}

function measure(): Map<string, { count: number; files: Map<string, number> }> {
  const files: string[] = [];
  for (const root of ROOTS) collect(join(process.cwd(), root), files);
  expect(files.length, '스캔이 비었다 — 빈 집합 위의 래칫은 게이트가 아니다').toBeGreaterThan(150);

  const result = new Map<string, { count: number; files: Map<string, number> }>();
  for (const [name] of FAMILIES) result.set(name, { count: 0, files: new Map() });
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file);
    for (const [name, re] of FAMILIES) {
      const hits = source.match(re)?.length ?? 0;
      if (hits === 0) continue;
      const bucket = result.get(name)!;
      bucket.count += hits;
      bucket.files.set(rel, hits);
    }
  }
  return result;
}

describe('이름 있는 off-ramp 유틸리티 래칫', () => {
  const actual = measure();

  it('패밀리별 부채가 기준선을 넘지 않는다', () => {
    const grown: string[] = [];
    for (const [name, , budget] of FAMILIES) {
      const bucket = actual.get(name)!;
      if (bucket.count > budget) {
        const top = [...bucket.files.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([f, n]) => `${f}(${n})`)
          .join(' · ');
        grown.push(`  ${name}: ${budget} → ${bucket.count} — ${top}`);
      }
    }
    expect(
      grown,
      `이름 있는 Tailwind 기본 스텝이 늘었다 — 램프 우회다.\n` +
        `크기는 text-caption…hero, 반경은 rounded-micro/chip/card/panel 로.\n${grown.join('\n')}`,
    ).toEqual([]);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    const lowered = FAMILIES.filter(([name, , budget]) => actual.get(name)!.count < budget).map(
      ([name, , budget]) => `  ${name}: 장부 ${budget} → 실측 ${actual.get(name)!.count}`,
    );
    expect(
      lowered,
      `부채가 줄었다. FAMILIES 의 기준선도 같이 내려라.\n${lowered.join('\n')}`,
    ).toEqual([]);
  });

  it('탐지기가 실제로 잡는다 — 위반 1줄 + 정상 1줄 프로브', () => {
    const violating =
      'className="rounded-sm rounded rounded-2xl text-xl text-sm md:text-3xl"';
    const clean =
      'className="rounded-micro rounded-chip rounded-card rounded-panel rounded-full text-caption text-label text-body-lg text-left"';
    const count = (s: string) =>
      FAMILIES.reduce((sum, [, re]) => sum + (s.match(re)?.length ?? 0), 0);
    expect(count(violating)).toBe(6);
    expect(count(clean)).toBe(0);
  });
});
