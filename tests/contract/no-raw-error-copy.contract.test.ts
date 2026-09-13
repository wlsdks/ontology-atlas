import { readFileSync, readdirSync, statSync } from 'node:fs';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **A failure a person can see is a sentence in their language, never a machine's token.**
 *
 * ## The measured defect
 *
 * Installed-app inspection before v1.2.2, finding B2. On a Korean screen, pressing the answer
 * page's redraft button (`library.answers.refresh`) printed
 *
 * > The retained question or its history cannot be read.
 *
 * into the page body, in brighter ink than the Korean around it. The sentence is the argument of a
 * `throw new Error(...)` in `answer-revision-store.ts` — written for whoever reads a stack trace,
 * in a module that cannot know which language the reader chose.
 *
 * It was not one string. The inspection found **eight sites across six files**, every one of them
 * the same shape:
 *
 * ```ts
 * err instanceof Error && err.message ? err.message : t('wiki.newPageFailed')
 * ```
 *
 * Read it aloud: *prefer the developer's English; fall back to the sentence we wrote for this
 * press.* That is backwards, and it is backwards in a way no type checker and no existing lint
 * rule can see — both arms are `string`.
 *
 * ## What the re-inspection then found about this gate itself
 *
 * The first version of this file shipped green while **the first-run screen still leaked**, which
 * is the more important defect: a gate that cannot see the thing it was written for teaches the
 * next person that the thing is fixed. Three separate holes (re-inspection before v1.2.2, R3, S20
 * and S21):
 *
 * 1. **One spelling.** R1 required `.message` inside the *condition*. The tree's actual spelling
 *    is `err instanceof Error ? err.message : t('…')` — the condition never says `.message`.
 *    Dropping that single clause surfaced **eight live sites** repo-wide.
 * 2. **One operator.** A code preferred over copy is written `build.errorText || t('…')` and
 *    `vault.errorMessage ?? t('…')`, not as a `?:`. `BuildFromCodeDoor` painted the literal token
 *    `permission-denied` on a Korean first-run card through the first of those, and `FirstRunPage`
 *    put the vault layer's English on the same screen through the second — both while this file
 *    was green, and one of them from *inside* the list of files R3 claims to have repaired.
 * 3. **One property name.** The leaked value is not always spelled `.message`. `errorMessage` and
 *    `errorText` are this repository's own names for the same raw text, and a rule that knows only
 *    `.message` is blind to the producer that hands over a bare code.
 *
 * A source comment in `FirstRunPage.tsx` also asserted that `vault.errorMessage` "is deliberately
 * blank so the raw cause is not leaked". That was false — `use-local-vault.ts` documents the
 * opposite for `access-failed` ("`errorMessage` carries the cause string, including a Tauri
 * command's `Err(String)`") — and the false comment is what made the leak beneath it look
 * deliberate. It has been corrected at the source.
 *
 * ## The three rules, and why three
 *
 * | Rule | Range | What it catches |
 * |---|---|---|
 * | **R1** | every non-test file under `src/`, four justified sites aside | a raw failure value *preferred over* copy, in any of the three spellings a fallback is written in |
 * | **R2** | every non-test file under `src/`, no allowlist | a raw failure value spliced into hand-written prose or into a translated sentence's own text |
 * | **R3** | the files this repair owns | any *other* shape that would leak one, in the exact modules that leaked |
 *
 * R1 and R2 generalise. R3 exists because neither knows every shape — a regression written as
 * `toast.show(err.message)` passes both — and it is a ratchet: these modules are clean now and
 * may not slide back. Making R3 repository-wide would need an allowlist of roughly thirty
 * pre-existing `setError(err.message)` sites in surfaces this repair does not own, and an
 * allowlist that long is a gate that says nothing.
 *
 * ## What is permitted, and why each is not the defect
 *
 * These four positions are where a **developer** reads, and a reader does not. They are the whole
 * allowlist of *positions*; `PERMITTED_SITES` below is the whole allowlist of *places*, and every
 * row there names why a person never sees that one.
 *
 * - **An argument to `t(...)`** — `t('wiki.compileFailed', { reason })` renders a Korean sentence
 *   with a machine fact inside it. That is the shape `native-error.ts` already settled on for
 *   Tauri rejections (sentence, then detail in parentheses); the reader gets a sentence in their
 *   language either way. R2 still refuses the inverse — a raw value carrying the *sentence* while
 *   the copy is reduced to a prefix.
 * - **The receiver of a string test** — `err.message.includes('already exists')` reads the message
 *   to decide something. Nothing is rendered.
 * - **Inside `console.*`** — the developer's console is where the developer's English belongs.
 * - **A `data-*` or `aria-hidden` attribute** — likewise a place a person reads only when they are
 *   debugging. `useFailureSentence` returns `detail` for exactly this, and every screen repaired
 *   here puts it on `data-failure-detail`.
 *
 * Anything else in front of a reader is a leak, and the fix is the one this repair applied: mint a
 * code at the throw site (`codedFailure`) and let the screen own the sentence
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

/**
 * The property names this repository gives raw failure text.
 *
 * `message` is a thrown `Error`'s. `errorMessage` is `use-local-vault`'s cause string and
 * `agent-activity-status`'s parse complaint. `errorText` is what `use-build-from-code` hands over —
 * since v1.2.2 a bare kebab-case *code*, which is worse on screen than a sentence, not better.
 * `errorDetail` is the machine half a repaired screen carries beside its sentence.
 */
const RAW_FAILURE_FIELD = /^(message|errorMessage|errorText|errorDetail)$/;

/** Is this `<something>.message` / `.errorMessage` / `.errorText` / `.errorDetail`? */
function isRawFailureAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && RAW_FAILURE_FIELD.test(node.name.text);
}

function containsRawFailure(node: ts.Node): boolean {
  if (isRawFailureAccess(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsRawFailure(child)) found = true;
  });
  return found;
}

/**
 * The translators **this file** binds, read from its own `useTranslations` / `getTranslations`
 * declarations, plus a bare `t`.
 *
 * The first version matched the name pattern `/(^|\.)t[A-Z0-9_]?[A-Za-z0-9_]*$/`, which also
 * accepts `toast`, `title`, `text` and `tooltip` — so `toast(err.message)` counted as "passed to a
 * translator" and was permitted (re-inspection, S21). Reading the file's own bindings cannot make
 * that mistake, and it still recognises every one of the thirty-odd `tSomething` names in the
 * tree without listing them.
 */
function translatorNames(file: ts.SourceFile): Set<string> {
  const names = new Set<string>(['t']);
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = ts.isAwaitExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (
        ts.isCallExpression(initializer)
        && /(^|\.)(useTranslations|getTranslations)$/.test(initializer.expression.getText(file))
      ) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/** A `t(...)` / `tSomething(...)` / `t.rich(...)` call — this file's own translator shape. */
function isTranslatorCall(node: ts.Node, file: ts.SourceFile, names: Set<string>): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText(file);
  return names.has(callee) || names.has(callee.split('.')[0] ?? '');
}

/** Copy: a translated sentence, or a literal string standing in for one. */
function isCopy(node: ts.Node, file: ts.SourceFile, names: Set<string>): boolean {
  return (
    isTranslatorCall(node, file, names)
    || ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
  );
}

/** The four positions only a developer reads. See the header table. */
function inDeveloperPosition(node: ts.Node, file: ts.SourceFile, names: Set<string>): boolean {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor) {
    if (ts.isCallExpression(cursor)) {
      const callee = cursor.expression.getText(file);
      // The receiver of a string test reads the value; it renders nothing.
      if (
        /\.(message|errorMessage|errorText|errorDetail)\.(includes|startsWith|endsWith|trim|toLowerCase|match|split|slice)$/
          .test(callee)
      ) return true;
      if (/^console\./.test(callee)) return true;
      if (isTranslatorCall(cursor, file, names)) return true;
    }
    if (ts.isJsxAttribute(cursor) && /^(data-|aria-hidden$)/.test(cursor.name.getText(file))) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

/**
 * A reference read only to **decide** something — the condition of a `?:`, an `if`, or the operand
 * of `!`. It is the same permission `err.message.includes('x')` already has: the value is
 * inspected, and nothing is rendered. Deliberately narrow, and deliberately not part of
 * `inDeveloperPosition`: the left operand of `a || copy` is also "a truth test", and permitting
 * that would blind R1 to the code-rendered-as-copy shape it exists for.
 */
function isReadToDecide(reference: ts.Node): boolean {
  const parent = reference.parent;
  if (!parent) return false;
  if (ts.isConditionalExpression(parent) && parent.condition === reference) return true;
  if (ts.isIfStatement(parent) && parent.expression === reference) return true;
  if (
    ts.isPrefixUnaryExpression(parent)
    && parent.operator === ts.SyntaxKind.ExclamationToken
  ) return true;
  return false;
}

/**
 * One step of flow, and only one: an expression that names a `const` whose **every** later
 * reference sits in a developer position is itself in a developer position.
 *
 * `VaultAgentSetupPanel` needs exactly this — `const detail = err instanceof Error ? err.message
 * .trim() : ''` followed by `t('agentSetup.writeFailed', { files, detail })`. That is the
 * sentence-plus-detail shape `native-error.ts` settled on, and reading it as a leak would be a
 * false positive that teaches people to widen the allowlist. One step is deliberate: further
 * tracking would make this gate a type checker, and the point of a contract test is that a person
 * can read why it fired.
 */
function flowsOnlyToDeveloperPositions(
  node: ts.Node,
  file: ts.SourceFile,
  names: Set<string>,
): boolean {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor && !ts.isVariableDeclaration(cursor)) {
    if (ts.isBlock(cursor) || ts.isSourceFile(cursor)) return false;
    cursor = cursor.parent;
  }
  if (!cursor || !ts.isVariableDeclaration(cursor) || !ts.isIdentifier(cursor.name)) return false;
  const name = cursor.name.text;
  const declared = cursor.name;
  const references: ts.Identifier[] = [];
  const collect = (child: ts.Node) => {
    if (ts.isIdentifier(child) && child.text === name && child !== declared) {
      // A property name (`{ detail: x }`'s key) is not a read of the value.
      const parent = child.parent;
      const isKey =
        (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === child;
      const isMember = ts.isPropertyAccessExpression(parent) && parent.name === child;
      if (!isKey && !isMember) references.push(child);
    }
    ts.forEachChild(child, collect);
  };
  collect(file);
  return (
    references.length > 0
    && references.every(
      (reference) => isReadToDecide(reference) || inDeveloperPosition(reference, file, names),
    )
  );
}

export interface Leak {
  path: string;
  line: number;
  text: string;
}

function record(path: string, file: ts.SourceFile, node: ts.Node): Leak {
  return {
    path,
    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    text: node.getText(file).replace(/\s+/g, ' ').slice(0, 160),
  };
}

/**
 * R1 — a raw failure value ranked above the copy written for that press.
 *
 * All three spellings of "prefer the raw, fall back to copy": `?:`, `||` and `??`. The preferred
 * arm must itself not be copy, so `localVault.errorMessage ? t('banner', { message: … }) : t('…')`
 * — a translated sentence with a machine fact inside it — is not a leak.
 */
export function rawFailurePreferredOverCopy(path: string, text: string): Leak[] {
  const file = parse(path, text);
  const names = translatorNames(file);
  const out: Leak[] = [];
  const visit = (node: ts.Node) => {
    let preferred: ts.Expression | null = null;
    let fallback: ts.Expression | null = null;
    if (ts.isConditionalExpression(node)) {
      preferred = node.whenTrue;
      fallback = node.whenFalse;
    } else if (
      ts.isBinaryExpression(node)
      && (node.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      preferred = node.left;
      fallback = node.right;
    }
    if (
      preferred
      && fallback
      && containsRawFailure(preferred)
      && !isCopy(preferred, file, names)
      && isCopy(fallback, file, names)
      && !inDeveloperPosition(node, file, names)
      && !flowsOnlyToDeveloperPositions(node, file, names)
    ) {
      out.push(record(path, file, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * R2 — a raw failure value spliced into hand-written prose.
 *
 * `` setError(`<a sentence in Hangul>: ${err.message}`) `` and
 * `` setError(`${t('saveFailed')}: ${err.message}`) `` both put the reader's language and the
 * developer's English in one string, with the English carrying the part that says what happened.
 * The permitted inverse is `t('saveFailed', { detail })`, where the catalogue owns the sentence and
 * the fact sits inside it — there the translator, not the template, decides the shape.
 *
 * Non-ASCII literal text is the tell for the first form: prose in a locale, written into source.
 * A translator call inside the same template is the tell for the second.
 */
export function rawFailureSplicedIntoProse(path: string, text: string): Leak[] {
  const file = parse(path, text);
  const names = translatorNames(file);
  const out: Leak[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      const literals = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
      /*
       * Prose in a locale, hand-written into source — Hangul, kana or Han, the same scripts
       * `.githooks/commit-msg` and the `source:language` gate look for. Deliberately not "any
       * non-ASCII": `wikiProblemMachineLine` joins a validator code and its message with an em
       * dash, and that dash is punctuation, not a sentence somebody wrote for a reader.
       */
      const hasLocalisedProse = literals.some((literal) =>
        /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u4E00-\u9FFF\uAC00-\uD7A3]/.test(literal),
      );
      const hasCopy = node.templateSpans.some((span) => isTranslatorCall(span.expression, file, names));
      const carriesRaw = node.templateSpans.some((span) => containsRawFailure(span.expression));
      if (
        carriesRaw
        && (hasLocalisedProse || hasCopy)
        && !inDeveloperPosition(node, file, names)
        && !flowsOnlyToDeveloperPositions(node, file, names)
      ) {
        out.push(record(path, file, node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * Every identifier in this file that is bound to a thrown value — a `catch (x)` binding or the
 * parameter of a `.catch(x => …)` callback. `.message` on one of these is an `Error`'s message;
 * `.message` on a typed validation problem is not, and this is how the two are told apart without
 * a type checker.
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

/** R3 — a thrown message used anywhere but the four places a developer reads. */
export function thrownMessageOutsideDeveloperReach(path: string, text: string): Leak[] {
  const file = parse(path, text);
  const names = translatorNames(file);
  const bound = thrownBindings(file);
  const out: Leak[] = [];
  if (bound.size === 0) return out;

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node)
      && node.name.text === 'message'
      && ts.isIdentifier(node.expression)
      && bound.has(node.expression.text)
      && !inDeveloperPosition(node, file, names)
    ) {
      out.push(record(path, file, node.parent ?? node));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/**
 * The modules the v1.2.2 B2 repair rewrote, plus the modules the re-inspection's R3/S20/S21 repair
 * rewrote: the leak sites, the store and hook that minted and carried the thrown English, and the
 * components that rendered it.
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
  'src/views/project-detail/ui/ProjectDetailPage.tsx',
  'src/widgets/app-settings-menu/ui/VaultShapeSettings.tsx',
  'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
  'src/features/docs-vault-local/model/use-just-start-vault.ts',
  'src/features/docs-vault-local/model/use-vault-create-flow.ts',
  'src/features/docs-vault-local/ui/OntologyStarterCta.tsx',
  'src/features/first-run-starter/model/use-build-from-code.ts',
  'src/features/first-run-starter/model/use-first-run-starter.ts',
  'src/features/first-run-starter/ui/BuildFromCodeConfirmDialog.tsx',
  'src/features/first-run-starter/ui/BuildFromCodeDoor.tsx',
  'src/features/first-run-starter/ui/FirstRunStarterModule.tsx',
  'src/features/library/lib/answer-revision-store.ts',
  'src/features/library/lib/answer-revision.ts',
  'src/features/project-edit/ui/ProjectForm.tsx',
  'src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx',
] as const;

/**
 * **The whole allowlist of places, and why a person never sees each one.**
 *
 * The first version of this gate had no such list and no need of one, because its predicate was
 * too narrow to fire anywhere. Run against the pre-repair tree (`git checkout origin/main -- src`,
 * then this file) the widened R1 matches **thirteen** sites: nine were leaks a person could see
 * and are now sentences, and these four are not. R3's new rows add two more converted sites the
 * ranking rules cannot see. Each row below is here because its reason is a *fact about the
 * destination* that no predicate can read off the expression:
 */
const PERMITTED_SITES: readonly { path: string; count: number; reason: string }[] = [
  {
    path: 'src/entities/vault-session/model/agent-activity-status.ts',
    count: 1,
    // A field on the parse result for a malformed `agent-activity.json`. Nothing in `src/` reads
    // it — verified by search: the only reader is this module's own unit test. The screens read
    // `valid`, `stale` and `heartbeat` and write their own sentences from those.
    reason: 'errorMessage on the heartbeat parse result; no surface reads it, only its unit test',
  },
  {
    path: 'src/shared/lib/local-endpoint.ts',
    count: 1,
    // `LocalVerifyVerdict.detail` is declared, in its own doc comment, as "the fact the screen
    // appends" — the machine half of the sentence-plus-detail shape. The verdict's `reason` is
    // what picks the sentence; `detail` never stands alone.
    reason: 'the detail half of a verdict whose reason picks the sentence',
  },
  {
    path: 'src/shared/ui/webview-error-reporter.tsx',
    count: 1,
    // The component renders no markup at all, by design ("a reporter that could itself fail to
    // paint would be reporting from inside the problem"). The value goes to the app log through
    // `sendWebviewErrorReport`, which is the installed app's stand-in for a console nobody has
    // open.
    reason: 'window error text forwarded to the app log by a component that renders nothing',
  },
  {
    path: 'src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx',
    count: 1,
    // The diagnostics an external ACP agent returned with its qualification, listed in the
    // review's technical evidence section beside the plan and source digests. This repository did
    // not mint these strings and has no code to translate them by; a translated synonym here is a
    // word the reader has to map back to the agent transcript they are comparing against — the
    // same reason `wikiProblemMachineLine` is deliberately not localised.
    reason: "an external agent's diagnostic payload in the review's technical evidence section",
  },
];

const permittedCount = (path: string): number =>
  PERMITTED_SITES.find((site) => site.path === path)?.count ?? 0;

describe('no raw error copy — a failure speaks the reader\'s language', () => {
  it('scans a real tree, so a pass is not an empty sweep', () => {
    expect(SOURCES.length, 'read no sources — this gate is idling').toBeGreaterThan(500);
    expect(SOURCES.some((path) => path.endsWith('.tsx')), 'read no components').toBe(true);
  });

  it('R1 — no site ranks a raw failure value above the copy written for that press', () => {
    const leaks = SOURCES.flatMap((path) => {
      const found = rawFailurePreferredOverCopy(path, readFileSync(path, 'utf8'));
      return found.length <= permittedCount(path) ? [] : found;
    });
    expect(
      leaks.map((leak) => `${leak.path}:${leak.line}  ${leak.text}`),
      'A thrown message is the developer\'s English and a failure code is the machine\'s token; '
      + 'neither can be translated by the screen that shows it. Mint a code at the throw site with '
      + '`codedFailure(...)` and let the screen look it up with `useFailureSentence(err, t(...))`, '
      + 'which returns the reader\'s sentence and keeps the English on `detail` for a data-* '
      + 'attribute or the console.',
    ).toEqual([]);
  });

  it('R2 — no raw failure value is spliced into prose the reader was meant to get whole', () => {
    const leaks = SOURCES.flatMap((path) => rawFailureSplicedIntoProse(path, readFileSync(path, 'utf8')));
    expect(
      leaks.map((leak) => `${leak.path}:${leak.line}  ${leak.text}`),
      'Half a sentence in the reader\'s language and half in the developer\'s is not a sentence. '
      + 'Put the fact inside the translated sentence — `t(\'key\', { detail })` — so the catalogue '
      + 'decides the shape, or keep it on `data-failure-detail`.',
    ).toEqual([]);
  });

  it.each(REPAIRED)('R3 — %s keeps a thrown message out of everything a reader sees', (path) => {
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

  /**
   * An allowlist entry that is no longer needed is a blanket exemption nobody notices. Each row
   * must still match the site it was written for, exactly — one fewer and the row goes, one more
   * and the new one needs its own reason.
   */
  it.each(PERMITTED_SITES)('the allowlist row for $path is still earned', ({ path, count, reason }) => {
    expect(SOURCES.includes(path), `${path} is gone; drop the allowlist row`).toBe(true);
    expect(reason.length, 'a row without a reason is not an allowlist row').toBeGreaterThan(20);
    expect(
      rawFailurePreferredOverCopy(path, readFileSync(path, 'utf8')).length,
      `${path} no longer has exactly ${count} permitted site(s); update or drop the row`,
    ).toBe(count);
  });

  it('probe: every shape the rules claim to catch comes back red, and the repairs do not', () => {
    // ── R1, spelling one: the exact line the B2 inspection found, verbatim.
    const planted = 'const a = () => { try { f(); } catch (err) { '
      + 'toast.show(err instanceof Error && err.message ? err.message : t("wiki.newPageFailed")); } };';
    expect(rawFailurePreferredOverCopy('planted.ts', planted)).toHaveLength(1);
    // Two, because R3 counts accesses rather than expressions and the shape reads `.message`
    // twice: once to test it, once to render it. Both halves are the defect.
    expect(thrownMessageOutsideDeveloperReach('planted.ts', planted)).toHaveLength(2);

    // ── R1, spelling two: the eight live sites' actual shape — the condition never says
    // `.message`, which is the clause whose removal surfaced them (re-inspection, S21).
    const plantedInstanceOf = 'const a = () => { try { f(); } catch (err) { '
      + 'setError(err instanceof Error ? err.message : t("validation.saveFailed")); } };';
    expect(rawFailurePreferredOverCopy('planted.ts', plantedInstanceOf)).toHaveLength(1);

    // ── R1, spelling three: a producer's failure **code** rendered as copy. This is
    // `BuildFromCodeDoor.tsx:104` before the repair, which painted the literal token
    // `permission-denied` onto a Korean first-run card (re-inspection, R3).
    const plantedCode = 'const C = ({ build, t }) => <p>{build.errorText || t("buildFromCodeFailed")}</p>;';
    expect(rawFailurePreferredOverCopy('planted.tsx', plantedCode)).toHaveLength(1);

    // ── R1, spelling four: `??` over the vault layer's cause string — `FirstRunPage.tsx:139`
    // before the repair (re-inspection, S20).
    const plantedNullish = 'const C = ({ vault, t }) => <p>{vault.errorMessage ?? t("errorFallback")}</p>;';
    expect(rawFailurePreferredOverCopy('planted.tsx', plantedNullish)).toHaveLength(1);

    // The `: ''` variant the three creation hooks used, which leaks the same way.
    const plantedEmpty = 'const a = () => { try { f(); } catch (err) { '
      + "setActionError(err instanceof Error && err.message ? err.message : ''); } };";
    expect(rawFailurePreferredOverCopy('planted.ts', plantedEmpty)).toHaveLength(1);

    // ── R2: a catch-bound message interpolated into a sentence in the reader's language.
    const plantedProse = 'const a = () => { try { f(); } catch (err) { '
      // The Hangul is escaped so the sentence exists in the parsed source but not in this file:
      // `source:language` counts CJK code points in source, and a gate that has to be excused is
      // not a gate. `\uC800\uC7A5...` reads "could not be saved".
      + 'setError(`\uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694: ${err.message}`); } };';
    expect(rawFailureSplicedIntoProse('planted.ts', plantedProse)).toHaveLength(1);

    // ── R2: the same splice with the copy reduced to a prefix. The catalogue must own the whole
    // sentence, not the first four characters of it.
    const plantedPrefixed = 'const a = () => { try { f(); } catch (err) { '
      + 'setError(`${t("saveFailed")}: ${err.message}`); } };';
    expect(rawFailureSplicedIntoProse('planted.ts', plantedPrefixed)).toHaveLength(1);

    // ── R3: a shape R1 and R2 cannot see, which is why the ratchet exists.
    const plantedBare = 'const a = () => { try { f(); } catch (err) { setError(err.message); } };';
    expect(rawFailurePreferredOverCopy('planted.ts', plantedBare)).toHaveLength(0);
    expect(rawFailureSplicedIntoProse('planted.ts', plantedBare)).toHaveLength(0);
    expect(thrownMessageOutsideDeveloperReach('planted.ts', plantedBare)).toHaveLength(1);

    // ── The hole the re-inspection named: `toast`, `title`, `text` and `tooltip` all matched the
    // old translator *name pattern*, so a raw message handed to any of them was read as "passed
    // to a translator" and permitted. Reading the file's own bindings, they are not translators.
    for (const sink of ['toast', 'title', 'text', 'tooltip']) {
      const plantedSink = `const a = () => { try { f(); } catch (err) { ${sink}(err.message); } };`;
      expect(
        thrownMessageOutsideDeveloperReach('planted.ts', plantedSink),
        `${sink}(err.message) must not pass as a translator call`,
      ).toHaveLength(1);
    }

    // ── The repairs pass all three.
    const repaired = 'const a = () => { try { f(); } catch (err) { '
      + 'toast.show(failureSentence(err, t("wiki.newPageFailed")).sentence); } };';
    expect(rawFailurePreferredOverCopy('planted.ts', repaired)).toEqual([]);
    expect(rawFailureSplicedIntoProse('planted.ts', repaired)).toEqual([]);
    expect(thrownMessageOutsideDeveloperReach('planted.ts', repaired)).toEqual([]);

    // ── The four permitted positions really are permitted.
    const permitted = 'const a = () => { try { f(); } catch (err) {'
      + ' if (err.message.includes("x")) console.error(err.message);'
      + ' toast.show(t("wiki.compileFailed", { reason: err.message })); } };';
    expect(thrownMessageOutsideDeveloperReach('permitted.ts', permitted)).toEqual([]);
    const permittedAttribute =
      'const C = ({ failure }) => <p data-failure-detail={failure.detail}>{failure.sentence}</p>;';
    expect(rawFailurePreferredOverCopy('permitted.tsx', permittedAttribute)).toEqual([]);

    // ── A translated sentence carrying a machine fact is not the inverse of itself: the
    // preferred arm is copy, so R1 must stay quiet (`DocsVaultPage`'s vault-status banner).
    const permittedBanner = 'const C = ({ v, t }) => <p>{v.errorMessage '
      + '? t("errorBanner", { message: v.errorMessage }) : t("unknownError")}</p>;';
    expect(rawFailurePreferredOverCopy('permitted.tsx', permittedBanner)).toEqual([]);

    // ── One step of flow: the detail half goes to `t(...)` through a const
    // (`VaultAgentSetupPanel`), which is the sentence-plus-detail shape, not a leak.
    const permittedFlow = 'const f = (t) => { try { g(); } catch (err) {'
      + " const detail = err instanceof Error ? err.message.trim() : '';"
      + ' setError(detail ? t("writeFailed", { detail }) : t("writeFailedNoDetail")); } };';
    expect(rawFailurePreferredOverCopy('permitted.ts', permittedFlow)).toEqual([]);

    // ── A typed problem object is not an Error, and must not be mistaken for one.
    const notAnError = 'const a = (problem: P) => <span>{problem.message}</span>;';
    expect(thrownMessageOutsideDeveloperReach('p.tsx', notAnError)).toEqual([]);
  });
});
