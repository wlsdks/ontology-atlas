import { readFileSync, readdirSync, statSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **A thrown `Error`'s message is never the sentence a person reads.**
 *
 * ## The measured defect
 *
 * Installed-app inspection before v1.2.2, finding B2. On a Korean screen, pressing
 * the answer page's redraft button (`library.answers.refresh`) printed
 *
 * > The retained question or its history cannot be read.
 *
 * into the page body, in brighter ink than the Korean around it. The sentence is the
 * argument of a `throw new Error(...)` in `answer-revision-store.ts` — written for
 * whoever reads a stack trace, in a module that cannot know which language the reader
 * chose.
 *
 * It was not one string. The inspection found **eight sites across six files**, every one
 * of them the same shape:
 *
 * ```ts
 * err instanceof Error && err.message ? err.message : t('wiki.newPageFailed')
 * ```
 *
 * Read it aloud: *prefer the developer's English; fall back to the sentence we wrote for
 * this press.* That is backwards, and it is backwards in a way no type checker and no
 * existing lint rule can see — both arms are `string`.
 *
 * ## The two rules, and why two
 *
 * | Rule | Range | What it catches |
 * |---|---|---|
 * | **R1** | every non-test file under `src/` | the eight-site shape: a raw message *preferred over* copy |
 * | **R2** | the files this repair owns | any *other* shape that would leak one, in the exact modules that leaked |
 *
 * R1 is the one that generalises and it carries **no allowlist**: there is no honest
 * reason to rank a thrown English string above a translated sentence. R2 exists because
 * R1 only knows one shape — a regression written as `toast.show(err.message)` would pass
 * it. Making R2 repository-wide would need an allowlist of roughly twenty pre-existing
 * `setError(err.message)` sites in surfaces this repair does not own, and an allowlist
 * that long is a gate that says nothing. Scoped to the repaired files it is a ratchet:
 * these modules are clean now and may not slide back.
 *
 * ## What R2 still permits, and why each is not the defect
 *
 * - **An argument to `t(...)`** — `t('wiki.compileFailed', { reason })` renders a Korean
 *   sentence with a machine fact inside it. That is the shape `native-error.ts` already
 *   settled on for Tauri rejections (sentence, then detail in parentheses); the reader
 *   gets a sentence in their language either way.
 * - **The receiver of a string test** — `err.message.includes('already exists')` reads
 *   the message to decide something. Nothing is rendered.
 * - **Inside `console.*`** — the developer's console is where the developer's English
 *   belongs.
 * - **A `data-*` or `aria-hidden` attribute** — likewise a place a person reads only
 *   when they are debugging. `RetainedAnswerContext` puts the English on
 *   `data-failure-detail` for exactly this reason.
 *
 * Anything else in those files is a leak, and the fix is the one this repair applied:
 * mint a code at the throw site (`codedFailure`) and let the screen own the sentence
 * (`useFailureSentence`).
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const SOURCES = walk('src');

function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Is this `<something>.message`? */
function isMessageAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'message';
}

function containsMessageAccess(node: ts.Node): boolean {
  if (isMessageAccess(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsMessageAccess(child)) found = true;
  });
  return found;
}

/** A `t(...)` / `tSomething(...)` call — this repository's translator shape. */
function isTranslatorCall(node: ts.Node, file: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText(file);
  return /(^|\.)t[A-Z0-9_]?[A-Za-z0-9_]*$/.test(callee);
}

/** Copy: a translated sentence, or a literal string standing in for one. */
function isCopy(node: ts.Node, file: ts.SourceFile): boolean {
  return (
    isTranslatorCall(node, file)
    || ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
  );
}

export interface Leak {
  path: string;
  line: number;
  text: string;
}

/** R1 — a raw message ranked above copy. */
export function rawMessagePreferredOverCopy(path: string, text: string): Leak[] {
  const file = parse(path, text);
  const out: Leak[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isConditionalExpression(node)
      && containsMessageAccess(node.condition)
      && containsMessageAccess(node.whenTrue)
      && isCopy(node.whenFalse, file)
    ) {
      out.push({
        path,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        text: node.getText(file).replace(/\s+/g, ' ').slice(0, 160),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * Every identifier in this file that is bound to a thrown value — a `catch (x)` binding or
 * the parameter of a `.catch(x => …)` callback. `.message` on one of these is an `Error`'s
 * message; `.message` on a typed validation problem is not, and this is how the two are
 * told apart without a type checker.
 */
function thrownBindings(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isCatchClause(node)
      && node.variableDeclaration
      && ts.isIdentifier(node.variableDeclaration.name)
    ) {
      names.add(node.variableDeclaration.name.text);
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'catch'
    ) {
      const callback = node.arguments[0];
      if (
        callback
        && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        && callback.parameters[0]
        && ts.isIdentifier(callback.parameters[0].name)
      ) {
        names.add(callback.parameters[0].name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/** R2 — a thrown message used anywhere but the four places a developer reads. */
export function thrownMessageOutsideDeveloperReach(path: string, text: string): Leak[] {
  const file = parse(path, text);
  const bound = thrownBindings(file);
  const out: Leak[] = [];
  if (bound.size === 0) return out;

  const visit = (node: ts.Node) => {
    if (isMessageAccess(node) && ts.isIdentifier(node.expression) && bound.has(node.expression.text)) {
      let cursor: ts.Node | undefined = node.parent;
      let permitted = false;
      while (cursor) {
        if (ts.isCallExpression(cursor)) {
          const callee = cursor.expression.getText(file);
          // The receiver of a string test reads the message; it renders nothing.
          if (new RegExp(`\\.message\\.(includes|startsWith|endsWith|trim|toLowerCase|match|split|slice)$`).test(callee)) permitted = true;
          if (/^console\./.test(callee)) permitted = true;
          if (isTranslatorCall(cursor, file)) permitted = true;
        }
        if (ts.isJsxAttribute(cursor) && /^(data-|aria-hidden$)/.test(cursor.name.getText(file))) permitted = true;
        cursor = cursor.parent;
      }
      if (!permitted) {
        out.push({
          path,
          line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          text: (node.parent ?? node).getText(file).replace(/\s+/g, ' ').slice(0, 160),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * The modules the v1.2.2 B2 repair rewrote: the eight leak sites, the store and hook that
 * minted and carried the thrown English, and the three components that rendered it.
 *
 * Removing a row weakens the ratchet. Adding one is how a newly repaired surface joins.
 */
const REPAIRED = [
  'src/views/library/ui/LibraryPage.tsx',
  'src/views/library/lib/use-answer-refresh.ts',
  'src/views/library/ui/parts/RetainedAnswerContext.tsx',
  'src/views/library/ui/parts/AnswerRevisionComparison.tsx',
  'src/views/home/ui/HomePage.tsx',
  'src/views/first-run/ui/FirstRunPage.tsx',
  'src/widgets/app-settings-menu/ui/VaultShapeSettings.tsx',
  'src/features/docs-vault-local/model/use-just-start-vault.ts',
  'src/features/docs-vault-local/model/use-vault-create-flow.ts',
  'src/features/first-run-starter/model/use-build-from-code.ts',
  'src/features/first-run-starter/model/use-first-run-starter.ts',
  'src/features/first-run-starter/ui/BuildFromCodeConfirmDialog.tsx',
  'src/features/library/lib/answer-revision-store.ts',
  'src/features/library/lib/answer-revision.ts',
] as const;

describe('no raw error copy — a failure speaks the reader\'s language', () => {
  it('scans a real tree, so a pass is not an empty sweep', () => {
    expect(SOURCES.length, 'read no sources — this gate is idling').toBeGreaterThan(500);
    expect(SOURCES.some((path) => path.endsWith('.tsx')), 'read no components').toBe(true);
  });

  it('R1 — no site ranks a thrown message above the copy written for that press', () => {
    const leaks = SOURCES.flatMap((path) => rawMessagePreferredOverCopy(path, readFileSync(path, 'utf8')));
    expect(
      leaks.map((leak) => `${leak.path}:${leak.line}  ${leak.text}`),
      'A thrown Error message is the developer\'s English and cannot be translated. Mint a code '
      + 'at the throw site with `codedFailure(...)` and let the screen look it up with '
      + '`useFailureSentence(err, t(...))`, which returns the reader\'s sentence and keeps the '
      + 'English on `detail` for a data-* attribute or the console.',
    ).toEqual([]);
  });

  it.each(REPAIRED)('R2 — %s keeps a thrown message out of everything a reader sees', (path) => {
    const leaks = thrownMessageOutsideDeveloperReach(path, readFileSync(path, 'utf8'));
    expect(
      leaks.map((leak) => `${leak.path}:${leak.line}  ${leak.text}`),
      'In this file a thrown message may only be read by a string test, passed to `t(...)` as a '
      + 'fact inside a translated sentence, logged to the console, or written to a data-* '
      + 'attribute. Anything else puts it in front of a reader.',
    ).toEqual([]);
  });

  it('every repaired path still exists — a stale row is a gate pointed at nothing', () => {
    for (const path of REPAIRED) {
      expect(SOURCES.includes(path), `${path} is gone from the tree; drop or update the row`).toBe(true);
    }
  });

  it('probe: the planted B2 shape comes back red, and the repaired shape does not', () => {
    // The exact line the inspection found, verbatim.
    const planted = 'const a = () => { try { f(); } catch (err) { '
      + 'toast.show(err instanceof Error && err.message ? err.message : t("wiki.newPageFailed")); } };';
    expect(rawMessagePreferredOverCopy('planted.ts', planted)).toHaveLength(1);
    // Two, because R2 counts accesses rather than expressions and the shape reads `.message`
    // twice: once to test it, once to render it. Both halves are the defect.
    expect(thrownMessageOutsideDeveloperReach('planted.ts', planted)).toHaveLength(2);

    // The `: ''` variant the three creation hooks used, which leaks the same way.
    const plantedEmpty = 'const a = () => { try { f(); } catch (err) { '
      + "setActionError(err instanceof Error && err.message ? err.message : ''); } };";
    expect(rawMessagePreferredOverCopy('planted.ts', plantedEmpty)).toHaveLength(1);

    // A shape R1 cannot see but R2 can, which is why both exist.
    const plantedBare = 'const a = () => { try { f(); } catch (err) { setError(err.message); } };';
    expect(rawMessagePreferredOverCopy('planted.ts', plantedBare)).toHaveLength(0);
    expect(thrownMessageOutsideDeveloperReach('planted.ts', plantedBare)).toHaveLength(1);

    // The repair passes both.
    const repaired = 'const a = () => { try { f(); } catch (err) { '
      + 'toast.show(failureSentence(err, t("wiki.newPageFailed")).sentence); } };';
    expect(rawMessagePreferredOverCopy('planted.ts', repaired)).toEqual([]);
    expect(thrownMessageOutsideDeveloperReach('planted.ts', repaired)).toEqual([]);

    // The three permitted developer-facing positions really are permitted.
    const permitted = 'const a = () => { try { f(); } catch (err) {'
      + ' if (err.message.includes("x")) console.error(err.message);'
      + ' toast.show(t("wiki.compileFailed", { reason: err.message })); } };';
    expect(thrownMessageOutsideDeveloperReach('permitted.ts', permitted)).toEqual([]);

    // A typed problem object is not an Error, and must not be mistaken for one.
    const notAnError = 'const a = (problem: P) => <span>{problem.message}</span>;';
    expect(thrownMessageOutsideDeveloperReach('p.tsx', notAnError)).toEqual([]);
  });
});
