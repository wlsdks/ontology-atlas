import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate against dead literals surviving inside the JavaScript that `lib.rs` embeds.
 *
 * The webview probe and the three verify scripts live inside Rust raw strings, which puts them
 * outside every TypeScript gate this repository has — no typecheck, no lint, no unused-variable
 * warning. Nothing there is checked by a compiler, so a mechanical edit can leave residue that
 * looks like code and computes nothing.
 *
 * **That is not hypothetical.** Commit `8806b8eba` (2026-08-13) removed 56 dead markers by
 * substitution and left the substitution behind: measured on 2026-08-24, 92 `(null)` and 84
 * `(undefined)` literal tokens remained, producing 31 marker fields permanently stuck at `false`,
 * `[]` or `null` — while still being emitted as evidence and still being read by
 * `payload-contract.mjs`, whose `=== true` branches on them could never fire. A verification
 * payload full of constants formatted as measurements is misinformation, and a verifier branch
 * that cannot fire is the permanently-green gate this repository's own `/gate-probe` doctrine
 * exists to reject.
 *
 * `tsc` would have caught every one of them in a second. Since the probe cannot be given to `tsc`
 * while it lives in a string, this gate stands in for it on the one pattern that actually bit.
 *
 * **Scope, deliberately narrow.** It bans a parenthesised `null`/`undefined` literal in a position
 * where the value is *used* — a condition, a receiver, an operand, an argument. It does not ban the
 * words: `x ?? null`, `=== undefined`, and `return null` are ordinary JavaScript and stay legal. The
 * distinguishing mark of the residue is the parentheses a substitution leaves behind.
 */

const repoRoot = join(import.meta.dirname, '..', '..');
const libSource = readFileSync(join(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');

/** Every `r#"…"#` block in lib.rs — these are the embedded scripts, and nothing else uses them. */
function embeddedScripts(source: string): { start: number; body: string }[] {
  const blocks: { start: number; body: string }[] = [];
  const opener = /r#"/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const from = match.index + match[0].length;
    const to = source.indexOf('"#', from);
    if (to < 0) break;
    blocks.push({ start: from, body: source.slice(from, to) });
    opener.lastIndex = to + 2;
  }
  return blocks;
}

/** The residue shapes, each meaning "this expression can never do anything". */
const DEAD_LITERAL_USES: { label: string; pattern: RegExp }[] = [
  { label: 'used as a ternary condition', pattern: /\((?:null|undefined)\)\s*\n?\s*\?/g },
  { label: 'used as a call or property receiver', pattern: /\((?:null|undefined)\)\s*\./g },
  { label: 'used as an operand of && or ||', pattern: /\((?:null|undefined)\)\s*(?:&&|\|\|)/g },
  { label: 'passed as an argument', pattern: /\(\s*\((?:null|undefined)\)\s*[,)]/g },
];

const scripts = embeddedScripts(libSource);

function lineOf(offset: number): number {
  return libSource.slice(0, offset).split('\n').length;
}

describe('the JavaScript embedded in lib.rs contains no dead literals', () => {
  it('finds the embedded scripts at all', () => {
    // A gate that scans nothing reports a clean sweep. The probe is the largest block by far;
    // if the extraction ever happens and these move to real files, this assertion is what tells
    // the next person to point this gate at the new location rather than delete it.
    expect(scripts.length).toBeGreaterThan(3);
    expect(Math.max(...scripts.map((script) => script.body.length))).toBeGreaterThan(10_000);
  });

  it('leaves no parenthesised null or undefined in a position that uses the value', () => {
    const offenders: string[] = [];

    for (const script of scripts) {
      for (const { label, pattern } of DEAD_LITERAL_USES) {
        for (const hit of script.body.matchAll(pattern)) {
          const at = script.start + (hit.index ?? 0);
          offenders.push(
            `src-tauri/src/lib.rs:${lineOf(at)} — ${label}: ${hit[0].replace(/\s+/g, ' ')}`,
          );
        }
      }
    }

    expect(
      offenders,
      'dead literals left in the embedded JavaScript compute nothing, yet the fields built from ' +
        'them are still emitted as evidence and still read by the verifiers:\n' +
        offenders.slice(0, 30).join('\n'),
    ).toEqual([]);
  });

  it('references no identifier the script never declares', () => {
    // The gap that let a real regression through on 2026-08-24: removing three dead consts left two
    // references behind, the probe threw `Can't find variable` on its first line, and **every**
    // marker was lost — while 12 contract lanes and 222 Rust tests stayed green, because none of
    // them run the script. Only launching the packaged app caught it.
    //
    // This is a deliberately shallow check, not a JavaScript engine: it collects `const`/`let`
    // declarations and function parameters, then looks for camelCase identifiers used but never
    // declared and not reachable as a global. Shallow is enough — the failure mode is a deleted
    // declaration whose use survived, and that is exactly what an undeclared name looks like.
    const globals = new Set([
      'window', 'document', 'navigator', 'location', 'console', 'Math', 'Number', 'String',
      'Boolean', 'Array', 'Object', 'JSON', 'Date', 'Set', 'Map', 'Promise', 'getComputedStyle',
      'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'Error', 'RegExp', 'history', 'performance',
    ]);

    const undeclared: string[] = [];
    for (const script of scripts) {
      const declared = new Set<string>(globals);
      for (const hit of script.body.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) {
        declared.add(hit[1]);
      }
      // Parameters, destructured names, catch bindings, and labelled object keys.
      for (const hit of script.body.matchAll(/\(([^()]{0,200}?)\)\s*=>/g)) {
        for (const part of hit[1].split(',')) declared.add(part.trim().replace(/[^\w$].*$/, ''));
      }
      for (const hit of script.body.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(hit[1]);

      // The leading class excludes `-`, so the tail of a hyphenated attribute name such as
      // `aria-activedescendant` is never mistaken for an identifier.
      // Comments are prose, not code: a word inside `// …` cannot throw. Stripping them first also
      // keeps the gate from reading an explanation of an attribute as a use of a variable.
      const code = script.body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const hit of code.matchAll(/(^|[^-.\w$"'`])([a-z][A-Za-z0-9_$]{14,})\b(?!\s*:)/g)) {
        const name = hit[2];
        if (!declared.has(name)) undeclared.push(name);
      }
    }

    expect(
      [...new Set(undeclared)].sort(),
      'the embedded script uses names it never declares — the probe will throw on its first line ' +
        'and emit no markers at all, which no unit or contract test can see',
    ).toEqual([]);
  });

  it('still allows the ordinary uses of null and undefined', () => {
    // A gate that fires on legitimate JavaScript gets deleted rather than obeyed, so the boundary
    // is asserted rather than assumed.
    for (const legal of ['const a = x ?? null;', 'if (y === undefined) {}', 'return null;']) {
      for (const { pattern } of DEAD_LITERAL_USES) {
        expect([...legal.matchAll(pattern)], `${legal} must stay legal`).toEqual([]);
      }
    }
    // And the residue itself is asserted to match, so a broken pattern cannot pass by finding nothing.
    const residue = 'const s = (null) ? Array.from((null).querySelectorAll("x")) : [];';
    expect(DEAD_LITERAL_USES.some(({ pattern }) => pattern.test(residue))).toBe(true);
  });
});
