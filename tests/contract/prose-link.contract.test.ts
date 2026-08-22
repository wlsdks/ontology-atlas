import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * Prose-link contract — **a link inside markdown body flow is not a control.**
 *
 * **Why this contract** (the 2026-08-04 link floor-24 round). Opening the control
 * ledger's (`control-adoption-ratchet`) "always-on underline 12" category found six
 * markdown body links — their siblings are text, the line box is owned by the
 * parent's `--leading-prose`, and WCAG 2.5.8 explicitly exempts in-sentence targets
 * (*"The target is in a sentence"*). The value layer (`controlClass`) cannot produce
 * this place in principle: all eight shapes are flex-family, and **inline-flex kills
 * wrapping in a prose position** — measured at 320px, an inline-flex link overflows
 * as a single rect (the 2 "pseudo-prose" cases, DocsVaultViewer's external/repo
 * links) while the inline control wraps into 2 rects.
 *
 * So the destination for a prose link is one thing, `.prose-link` (globals.css), and
 * this contract holds three disciplines:
 *
 * ① **Do not add a display** — the anchor's default inline is the condition for
 *    wrapping.
 * ② **Do not add its own line height or font size** — the line box belongs to the
 *    prose parent.
 * ③ **Leave focus to the UA default** — a 2px indigo box around a word inside a
 *    sentence reads as a highlight, not as focus.
 *
 * Underline geometry (offset) is also owned by `.prose-link` — a consumer re-adding
 * `underline-offset-*` gives one document two underline geometries.
 *
 * **Why lint cannot do this.** The verdict needs "is this anchor inside prose flow",
 * which is a fact about the render tree (the ReactMarkdown components map) and cannot
 * be expressed by a single file's AST selector. So this is a contract test applying
 * the discipline to every tag using `.prose-link`.
 */

/** The files prose links live in — must be the same list as the ratchet's `prose` registrations. */
const PROSE_FILES = [
  'src/widgets/docs-vault/ui/DocsVaultViewer.tsx',
  'src/views/gateway-doc/ui/GatewayDocPage.tsx',
];

const GLOBALS = 'app/globals.css';

/** Takes one className literal containing `prose-link` and returns its contract violations. */
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

/** Extracts every className literal containing `prose-link` from a file. */
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
    // The contract stated negatively — a display, line height, or size here takes
    // ownership away from the prose parent.
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
    // Idling guard — the ratchet's 6 prose registrations must actually wear this class.
    expect(seen, 'prose-link 사용처가 6 미만 — 등재와 계약이 어긋났다').toBeGreaterThanOrEqual(6);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('프로브 — 탐지기가 위반을 실제로 잡고, 정상을 지나보낸다', () => {
    // Five kinds of violation
    expect(proseClassViolations('prose-link inline-flex items-center gap-1')).not.toEqual([]);
    expect(proseClassViolations('prose-link leading-body')).not.toEqual([]);
    expect(proseClassViolations('prose-link text-body')).not.toEqual([]);
    expect(proseClassViolations('prose-link focus-visible:ring-2')).not.toEqual([]);
    expect(proseClassViolations('prose-link underline underline-offset-4')).not.toEqual([]);
    // Valid — colour and hover decoration colour belong to the place
    expect(
      proseClassViolations(
        'prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]',
      ),
    ).toEqual([]);
  });
});
