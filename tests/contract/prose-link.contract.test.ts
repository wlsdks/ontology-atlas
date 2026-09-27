import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';
import { classNameOf, readClassSource, stringsOf } from './lib/jsx-class-source';

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

const ANCHOR_REGISTRY = 'tests/contract/control-adoption/anchors';
const PROSE_REGISTRATIONS = readdirSync(ANCHOR_REGISTRY)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(ANCHOR_REGISTRY, name), 'utf8')) as { file: string; count: number; claim: string })
  .filter((row) => row.claim === 'prose');

type StyledAnchor = { line: number; className: string | null };
type ProseSource = { anchors: StyledAnchor[]; callSites: StyledAnchor[]; proseLiterals: string[] };

/** Styled anchors in a file, and those its markdown `a` override renders; comments never count. */
function readProseSource(fileName: string, text: string): ProseSource {
  const resolved = readClassSource(fileName, text);
  const { source, bindings } = resolved;
  const overrides: ts.Node[] = [];
  const proseLiterals: string[] = [];
  const index = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && /\bprose-link\b/.test(node.text)) proseLiterals.push(node.text);
    if (
      (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
      ts.isObjectLiteralExpression(node.parent) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'a'
    ) {
      overrides.push(ts.isPropertyAssignment(node) ? node.initializer : node);
    }
    ts.forEachChild(node, index);
  };
  index(source);

  const collect = (node: ts.Node, into: StyledAnchor[], follow: Set<ts.Node> | null): StyledAnchor[] => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const className = classNameOf(node);
      if ((tag === 'a' || tag === 'Link') && className) {
        const parts = className.initializer ? stringsOf(resolved, className.initializer) : [];
        into.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          className: parts.length > 0 ? parts.join(' ') : null,
        });
      }
      for (const component of follow ? (bindings.get(tag) ?? []) : []) {
        if (follow?.has(component)) continue;
        follow?.add(component);
        collect(component, into, follow);
      }
    }
    ts.forEachChild(node, (child) => void collect(child, into, follow));
    return into;
  };
  const callSites: StyledAnchor[] = [];
  const followed = new Set<ts.Node>();
  for (const override of overrides) {
    for (const rendered of ts.isIdentifier(override) ? (bindings.get(override.text) ?? []) : [override]) {
      if (followed.has(rendered)) continue;
      followed.add(rendered);
      collect(rendered, callSites, followed);
    }
  }
  return { anchors: collect(source, [], null), callSites, proseLiterals };
}

const wearsProseLink = (className: string | null): className is string => /(^|\s)prose-link(\s|$)/.test(className ?? '');

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

describe('산문 링크 계약 (.prose-link)', () => {
  it('globals.css 의 .prose-link 가 밑줄 기하만 소유한다 — display·행간·크기는 산문의 것', () => {
    const css = readGlobalCss();
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

  it('every prose-link class in a registered prose file keeps the three disciplines', () => {
    const offenders: string[] = [];
    for (const { file } of PROSE_REGISTRATIONS) {
      const { anchors, callSites, proseLiterals } = readProseSource(file, readFileSync(file, 'utf8'));
      const classes = new Set([...anchors, ...callSites].map((anchor) => anchor.className).filter(wearsProseLink));
      for (const literal of proseLiterals) classes.add(literal);
      for (const cls of classes) {
        for (const v of proseClassViolations(cls)) offenders.push(`${file}: ${v}\n  ${cls}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every styled anchor a registered markdown a override renders wears prose-link', () => {
    expect(PROSE_REGISTRATIONS.length, `no prose rows under ${ANCHOR_REGISTRY}`).toBeGreaterThan(0);
    for (const { file, count } of PROSE_REGISTRATIONS) {
      const { anchors, callSites } = readProseSource(file, readFileSync(file, 'utf8'));
      expect(callSites.length, `${file}: no markdown a override rendering a styled anchor was found`).toBeGreaterThan(0);
      const bare = callSites.filter((anchor) => !wearsProseLink(anchor.className)).map((anchor) => `${file}:${anchor.line}`);
      expect(bare, `anchors without .prose-link in the markdown a override: ${bare.join(', ')}`).toEqual([]);
      const prose = anchors.filter((anchor) => wearsProseLink(anchor.className)).length;
      expect(
        prose,
        `${file}: ${prose} anchors wear .prose-link but its prose row exempts ${count}; when anchors merge, lower the row count`,
      ).toBeGreaterThanOrEqual(count);
    }
  });

  it('probe: the anchor reader follows both override shapes and never reads a comment', () => {
    const method = readProseSource(
      'method.tsx',
      [
        'const components = {',
        '  a({ href, children }) {',
        '    // return <a className="prose-link">{children}</a>;',
        '    if (href) return <Link href={href} className="prose-link text-x">{children}</Link>;',
        '    return <a href="#" className="inline-flex">{children}</a>;',
        '  },',
        '};',
      ].join('\n'),
    );
    expect(method.callSites.map((anchor) => [anchor.line, wearsProseLink(anchor.className)])).toEqual([
      [4, true],
      [5, false],
    ]);
    expect(method.proseLiterals).toEqual(['prose-link text-x']);

    const named = readProseSource(
      'named.tsx',
      [
        "const PROSE = 'prose-link text-x';",
        'function External({ children }) { return <a className={PROSE}>{children}</a>; }',
        'function ProseLink({ children }) { return children ? <External>{children}</External> : <External />; }',
        '<a className="inline-flex">elsewhere</a>;',
        'const COMPONENTS = { a: ProseLink };',
      ].join('\n'),
    );
    expect(named.callSites.map((anchor) => anchor.className)).toEqual(['prose-link text-x']);
    expect(named.anchors.map((anchor) => anchor.line)).toEqual([2, 4]);

    const hoisted = readProseSource(
      'hoisted.tsx',
      [
        "const PROSE = cn('prose-link', 'break-words');",
        "function proseClass() { return 'prose-link'; }",
        "function Shadow() { const PROSE = 'inline-flex'; return null; }",
        'const components = {',
        '  a: ({ href, children }) => (href ? <a className={PROSE}>{children}</a> : <Link className={proseClass()}>{children}</Link>),',
        '};',
      ].join('\n'),
    );
    expect(hoisted.callSites.map((anchor) => anchor.className)).toEqual(['prose-link break-words inline-flex', 'prose-link']);
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
