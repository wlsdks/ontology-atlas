import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * 산문 링크 계약 — **마크다운 본문 흐름 속 링크는 컨트롤이 아니다.**
 *
 * ## 왜 이 계약인가 (2026-08-04 link 바닥 24 라운드)
 *
 * 컨트롤 원장(`control-adoption-ratchet`)의 「상시 밑줄 12」 부류를 열어 보니
 * 여섯이 마크다운 본문 링크였다 — 형제가 글이고, 줄 상자는 부모의
 * `--leading-prose` 가 소유하며, WCAG 2.5.8 은 문장 속 타깃을 명시적으로
 * 면제한다(*"The target is in a sentence"*). 값 층(`controlClass`)은 이 자리를
 * 원리적으로 못 낸다: 모양 여덟이 전부 flex 계열인데, **inline-flex 는 산문
 * 자리에서 줄바꿈을 죽인다** — 실측: 320px 에서 inline-flex 링크는 rect 1개로
 * 넘치고(「가짜 산문」 2, DocsVaultViewer 외부/repo 링크), inline 대조군은
 * rect 2개로 접힌다.
 *
 * 그래서 산문 링크의 목적지는 `.prose-link`(globals.css) 한 벌이고, 이 계약이
 * 지키는 규율은 셋이다:
 *
 * ① **display 를 얹지 않는다** — 앵커 기본 inline 이 줄바꿈의 조건이다.
 * ② **자기 행간·글자 크기를 얹지 않는다** — 줄 상자는 산문 부모의 것이다.
 * ③ **포커스는 UA 기본 존치** — 문장 속 낱말에 2px 인디고 상자를 씌우면
 *    포커스가 아니라 하이라이트로 읽힌다.
 *
 * 밑줄 기하(offset)도 `.prose-link` 가 소유한다 — 소비처가 `underline-offset-*`
 * 를 다시 얹으면 같은 문서 안에서 밑줄이 두 기하가 된다.
 *
 * ## lint 가 못 하는 이유
 *
 * 판정에 「이 앵커가 산문 흐름 속인가」가 필요한데 그건 렌더 트리(ReactMarkdown
 * components 맵)의 사실이라 한 파일의 AST 셀렉터로 표현되지 않는다. 그래서
 * `.prose-link` 를 쓰는 태그 전수에 규율을 거는 계약 테스트다.
 */

/** 산문 링크가 사는 파일 — 래칫의 `prose` 등재와 같은 목록이어야 한다. */
const PROSE_FILES = [
  'src/widgets/docs-vault/ui/DocsVaultViewer.tsx',
  'src/views/gateway-doc/ui/GatewayDocPage.tsx',
];

const GLOBALS = 'app/globals.css';

/** `prose-link` 를 포함한 className 리터럴 하나를 받아 계약 위반 목록을 낸다. */
function proseClassViolations(className: string): string[] {
  const out: string[] = [];
  if (/(^|\s)(inline-)?(flex|grid|block|inline-block)(\s|$)/.test(className)) {
    out.push('display 를 얹었다 — 산문 자리의 줄바꿈이 죽는다(규율 ①)');
  }
  if (/(^|\s)items-(center|start|end|baseline)(\s|$)/.test(className)) {
    out.push('flex 정렬을 얹었다 — display 를 전제한 클래스다(규율 ①)');
  }
  if (/(^|\s)leading-/.test(className)) {
    out.push('행간을 얹었다 — 줄 상자는 산문 부모의 것이다(규율 ②)');
  }
  if (/(^|\s)text-(caption|label|body|body-lg|title|display|hero|hero-lg)(\s|$)/.test(className)) {
    out.push('타입 스텝을 얹었다 — 크기는 산문 부모에서 상속한다(규율 ②)');
  }
  if (/focus-visible:/.test(className)) {
    out.push('포커스 스타일을 얹었다 — UA 기본을 존치한다(규율 ③)');
  }
  if (/(^|\s)underline(\s|$)|underline-offset-/.test(className)) {
    out.push('밑줄 기하를 다시 얹었다 — 기하는 .prose-link 가 소유한다');
  }
  return out;
}

/** 파일에서 `prose-link` 를 포함하는 className 리터럴을 전부 뽑는다. */
function proseClassNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]*\bprose-link\b[^"]*)"/g)].map((m) => m[1]);
}

describe('산문 링크 계약 (.prose-link)', () => {
  it('globals.css 의 .prose-link 가 밑줄 기하만 소유한다 — display·행간·크기는 산문의 것', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    const block = /\.prose-link\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(block, '.prose-link 블록이 globals.css 에 없다').toBeTruthy();
    expect(block).toMatch(/text-decoration-line:\s*underline/);
    expect(block).toMatch(/text-underline-offset/);
    // 계약의 부정형 — 여기 display/행간/크기가 생기면 산문 부모의 소유권을 뺏는 것이다.
    expect(block, '.prose-link 가 display 를 선언했다').not.toMatch(/display\s*:/);
    expect(block, '.prose-link 가 행간을 선언했다').not.toMatch(/line-height\s*:/);
    expect(block, '.prose-link 가 글자 크기를 선언했다').not.toMatch(/font-size\s*:/);
  });

  it('산문 파일의 prose-link 태그 전수가 세 규율을 지킨다', () => {
    let seen = 0;
    const offenders: string[] = [];
    for (const file of PROSE_FILES) {
      const source = readFileSync(file, 'utf8');
      for (const cls of proseClassNames(source)) {
        seen += 1;
        for (const v of proseClassViolations(cls)) offenders.push(`${file}: ${v}\n  ${cls}`);
      }
    }
    // 공회전 방지 — 래칫의 prose 등재 6 이 실제로 이 클래스를 입고 있어야 한다.
    expect(seen, 'prose-link 사용처가 6 미만 — 등재와 계약이 어긋났다').toBeGreaterThanOrEqual(6);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('프로브 — 탐지기가 위반을 실제로 잡고, 정상을 지나보낸다', () => {
    // 위반 5종
    expect(proseClassViolations('prose-link inline-flex items-center gap-1')).not.toEqual([]);
    expect(proseClassViolations('prose-link leading-body')).not.toEqual([]);
    expect(proseClassViolations('prose-link text-body')).not.toEqual([]);
    expect(proseClassViolations('prose-link focus-visible:ring-2')).not.toEqual([]);
    expect(proseClassViolations('prose-link underline underline-offset-4')).not.toEqual([]);
    // 정상 — 색·호버 장식색은 자리의 것이다
    expect(
      proseClassViolations(
        'prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]',
      ),
    ).toEqual([]);
  });
});
