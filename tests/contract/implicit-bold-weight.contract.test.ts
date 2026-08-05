import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`<b>` · `<strong>` 은 무게를 명시한다** — 안 적으면 브라우저 기본 **700** 이고,
 * 700 은 이 저장소의 무게 램프(510 · 560 · 650) 밖이다.
 *
 * ## 왜 이 게이트가 없으면 안 되나 (2026-08-05 실측)
 *
 * 무게 축을 닫고(#942) 이름 스텝을 전부 램프로 옮긴 **뒤에도**, 빌드된 화면에는
 * 700 이 그려지고 있었다. `/ko/projects/` 에서 **7개**가 잡혔고 전수는 **8곳**이다.
 *
 * 이 결함이 특별한 이유는 **코드에 아무 값도 안 남는다**는 것이다. `<b>` 에
 * 무게 클래스를 안 쓰면 lint 셀렉터가 볼 문자열이 없고, 램프 밖 값을 세는 어떤
 * 소스 스캔에도 안 걸린다. 커서 어포던스 게이트(`cursor-affordance.spec.ts`)가
 * 「중앙 규칙이 사라진 것은 렌더 결과를 재야 안다」고 적어 둔 것과 같은 층이고,
 * 실제로 이것도 **정적 export 를 브라우저에서 재다가** 잡혔다.
 *
 * 그리고 이미 **같은 파일 안에서 갈라져 있었다** — `TopologyV2DetailPanel` 의
 * 음각 숫자 `<b>` 8개 중 4개는 `strong`(650)을 명시했고 4개는 안 했다. 같은
 * 역할의 형제가 650 과 700 으로 갈린 것을 아무도 못 봤다.
 *
 * ## 왜 「700 금지」가 아니라 「명시 요구」인가
 *
 * 700 이라고 적은 곳을 막는 것은 이미 `typographyAxisSelectors` 가 한다
 * (`font-bold` 이름 스텝 금지). 여기서 막는 것은 **아무것도 안 적은 것**이라,
 * 판정 기준이 «어떤 값인가» 가 아니라 «값이 있는가» 다.
 *
 * `font-normal`(400)도 통과다 — 「강조를 끈다」는 명시적 선언이고, 실제로
 * `<b>` 를 본문 무게로 되돌리는 데 쓰인다(`ConceptEgoCard` · `CommitDetail`).
 */

const ROOT = process.cwd();
const WEIGHT_DECL = /font-\[var\(--font-weight-[a-z]+\)\]|font-(?:normal|medium|semibold|bold|light|black)(?![-\w])/;

/** 여는 태그를 중괄호 깊이로 끊는다 — 다행 태그와 콜백 중괄호를 넘긴다. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 3000);
}

/**
 * **주석을 걷어낸다.** 안 걷으면 이 파일이 스스로 못 박은 함정에 빠진다 — 위
 * 독블록이 `<b>` 를 인용하고 있어서, 첫 구현은 자기 주석 2건을 위반으로 셌다.
 * (`unused-token-ratchet` 이 토큰의 주석 언급을 「쓰인다」로 오판하는 것과 같은
 * 병이고, 그건 2026-08-05 감사가 별건으로 등재했다.)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export interface BoldScan {
  /** 스캔한 `<b>`/`<strong>` 총수 — 공회전 방지의 분모. */
  total: number;
  /** 무게 선언이 없는 자리. */
  implicit: string[];
}

export function scanSource(rel: string, raw: string, acc: BoldScan): void {
  const src = stripComments(raw);
  for (const m of src.matchAll(/<(b|strong)\b/g)) {
    const tag = openingTag(src, m.index ?? 0);
    acc.total += 1;
    let effective = tag;
    // `className={numeralClass}` 처럼 이름으로 참조하면 그 상수까지 한 단계 편다.
    const ref = /className=\{`?\$?\{?([A-Za-z_][A-Za-z0-9_]*)\}?/.exec(tag);
    if (ref && !/font-/.test(tag)) {
      const decl = new RegExp(`(?:const|let)\\s+${ref[1]}\\s*=\\s*([\\s\\S]{0,600}?);`, 'm').exec(src);
      if (decl) effective += ' ' + decl[1];
    }
    if (!WEIGHT_DECL.test(effective)) {
      const line = src.slice(0, m.index).split('\n').length;
      acc.implicit.push(`${rel}:${line}`);
    }
  }
}

function scanRepo(): BoldScan {
  const acc: BoldScan = { total: 0, implicit: [] };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
        continue;
      }
      if (!name.endsWith('.tsx') || name.includes('.test.')) continue;
      scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), acc);
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

describe('<b>/<strong> 은 무게를 명시한다', () => {
  const scan = scanRepo();

  it('스캔이 비어 있지 않다 — 공집합 위의 게이트는 게이트가 아니다', () => {
    expect(scan.total).toBeGreaterThan(10);
  });

  it('무게 선언이 없는 <b>/<strong> 이 0 이다 — 브라우저 기본 700 은 램프 밖이다', () => {
    expect(
      scan.implicit,
      '`<b>`/`<strong>` 에 무게를 안 적으면 브라우저 기본 700 으로 그려진다 — 램프는 510/560/650 이다.\n' +
        '음각 숫자·수치 강조는 `font-[var(--font-weight-strong)]`, 강조를 끄는 자리는 `font-normal`.\n' +
        `위반: ${scan.implicit.join(', ')}`,
    ).toEqual([]);
  });

  it('프로브 — 탐지기가 실제로 먹는다 (주석·상수 참조·명시 선언)', () => {
    const probe = (body: string): BoldScan => {
      const acc: BoldScan = { total: 0, implicit: [] };
      scanSource('probe.tsx', body, acc);
      return acc;
    };

    // 위반 — 무게 선언 없음
    expect(probe('<b className="tabular-nums">1</b>').implicit).toEqual(['probe.tsx:1']);
    expect(probe('<strong>x</strong>').implicit).toEqual(['probe.tsx:1']);

    // 정상 — 토큰 무게 · 명시적 해제
    expect(probe('<b className="font-[var(--font-weight-strong)]">1</b>').implicit).toEqual([]);
    expect(probe('<b className="font-normal tabular-nums">1</b>').implicit).toEqual([]);

    // 정상 — 상수를 이름으로 참조해도 그 상수를 편다
    const viaConst = probe(
      'const numeralClass = "font-mono font-[var(--font-weight-strong)] text-x";\n<b className={numeralClass}>1</b>',
    );
    expect(viaConst.implicit, '상수 참조를 못 펴면 진짜 위반과 구별되지 않는다').toEqual([]);
    // …그리고 그 상수에 무게가 없으면 여전히 잡는다
    expect(probe('const c = "font-mono text-x";\n<b className={c}>1</b>').implicit).toEqual(['probe.tsx:2']);

    // 주석 속 `<b>` 는 세지 않는다 — 이 파일 자신의 독블록이 첫 구현을 오탐시켰다
    expect(probe('// `<b>` 는 안 적으면 700 이다\nconst a = 1;').total).toBe(0);
    expect(probe('/* <strong>x</strong> */\nconst a = 1;').total).toBe(0);
  });
});
