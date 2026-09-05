import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **The meaning workbench's sections are tabs, and their panels answer to them** (2026-09-06).
 *
 * Two separate defects, one gate, because neither is visible to lint.
 *
 * ## ① A section picker is not a value picker
 *
 * The three sections were a `SegmentedControl`. That primitive is this repository's **exclusive
 * single-selection** container and reaches the accessibility tree as a **radiogroup** — a grammar
 * that says "these are the possible values of one setting". Meaning, Findings & history and
 * Conversation are not values of a setting; they are views of one surface. A screen-reader user
 * was told the panel had a setting whose options were three nouns, and arrow keys moved a
 * selection rather than a view. `shared/ui/tab-bar.tsx` is the one tab pattern in this app and
 * says so in its own header; a second implementation is what that file exists to prevent.
 *
 * ## ② `idPrefix` is half a contract, and the other half is the consumer's
 *
 * `TabBar` writes `aria-controls={`${idPrefix}-tabpanel-${key}`}` on every tab. If the consumer
 * does not render a panel with that exact `id`, the selected tab points at nothing — axe
 * `aria-valid-attr-value`, WCAG 4.1.2. That is not hypothetical: it is the measured defect
 * recorded in `tab-bar.tsx` from the 2026-08-04 audit, and it appeared at one of two consumers
 * because the other rendered only the active panel. The workbench renders two conditionally and
 * keeps the conversation mounted, so it has both shapes at once.
 *
 * Source is the right unit here: the ids are written as literals, and the failure they cause is
 * silent in every runtime that is not running axe.
 */
const WORKBENCH = 'src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx';
const source = readFileSync(WORKBENCH, 'utf8');

/** The prefix the workbench declares, read from the source rather than assumed. */
function declaredIdPrefix(text: string): string | null {
  const file = ts.createSourceFile('w.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: string | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'TabBar') {
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        if (attr.name.getText(file) !== 'idPrefix') continue;
        const value = attr.initializer;
        if (value && ts.isStringLiteral(value)) found = value.text;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Every `key` the workbench hands to `TabBar`. */
function tabKeys(text: string): string[] {
  const items = /items=\{\[([\s\S]*?)\]\}/.exec(text)?.[1] ?? '';
  return [...items.matchAll(/key:\s*'([a-z]+)'/g)].map((match) => match[1]);
}

/** Every panel the workbench renders, as `{ id, labelledBy, role }`. */
function panels(text: string): Array<{ id: string; labelledBy: string; role: string }> {
  const file = ts.createSourceFile('w.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Array<{ id: string; labelledBy: string; role: string }> = [];
  const read = (node: ts.JsxOpeningLikeElement) => {
    const attrs = new Map<string, string>();
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr)) continue;
      const value = attr.initializer;
      if (value && ts.isStringLiteral(value)) attrs.set(attr.name.getText(file), value.text);
    }
    if (attrs.get('role') !== 'tabpanel') return;
    out.push({
      id: attrs.get('id') ?? '',
      labelledBy: attrs.get('aria-labelledby') ?? '',
      role: 'tabpanel',
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) read(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

describe('meaning workbench — sections are tabs', () => {
  it('wears the one tab pattern and not the exclusive-value container', () => {
    // Comments are stripped first: the file explains in prose *why* it is not a segmented control,
    // and a detector that reads its own rationale as a violation is a detector nobody can document
    // around.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, '워크벤치가 TabBar 를 안 쓴다').toContain('TabBar');
    expect(code, 'SegmentedControl 은 값 고르개다 — 이 셋은 한 화면의 보기다').not.toContain(
      'SegmentedControl',
    );
    // The stripper must not be so eager that the assertion becomes unfailable.
    expect(code, '주석을 걷어내니 파일이 비었다 — 이 시험이 공회전한다').toContain('TabBar');
    expect(
      `${code} SegmentedControl`,
      '심은 위반을 못 잡는다',
    ).toContain('SegmentedControl');
  });

  it('declares a prefix of its own — the default belongs to insights', () => {
    expect(declaredIdPrefix(source)).toBe('workbench');
  });

  it('renders a panel for every tab it declares, with the id that tab points at', () => {
    const prefix = declaredIdPrefix(source);
    const keys = tabKeys(source);
    // Non-empty in both directions, or the whole file measures nothing.
    expect(keys.length, '탭 키를 못 읽었다 — 이 시험이 공회전한다').toBeGreaterThan(2);
    const found = panels(source);
    expect(found.length, '패널을 못 읽었다').toBe(keys.length);
    for (const key of keys) {
      expect(
        found,
        `${key} 탭이 가리키는 패널이 없다 — 선택된 탭의 aria-controls 가 허공을 가리킨다`,
      ).toContainEqual({
        id: `${prefix}-tabpanel-${key}`,
        labelledBy: `${prefix}-tab-${key}`,
        role: 'tabpanel',
      });
    }
  });

  /**
   * ⚠️ **A gate that can only pass is not a gate.** Both halves of the consumer's contract are
   * planted: a missing panel id, and a prefix that drifts from the tabs'.
   */
  it('탐지기 프로브 — 빠진 패널과 어긋난 접두사를 실제로 잡는다', () => {
    const withoutPanel = source.replace('id="workbench-tabpanel-history"', 'id="history-panel"');
    expect(withoutPanel).not.toBe(source);
    expect(panels(withoutPanel).map((panel) => panel.id)).not.toContain(
      'workbench-tabpanel-history',
    );

    const drifted = source.replace('idPrefix="workbench"', 'idPrefix="insights"');
    expect(drifted).not.toBe(source);
    expect(declaredIdPrefix(drifted)).toBe('insights');
    // With the prefix drifted, none of the rendered panels answer the tabs any more.
    const ids = new Set(panels(drifted).map((panel) => panel.id));
    for (const key of tabKeys(drifted)) expect(ids.has(`insights-tabpanel-${key}`)).toBe(false);
  });
});
