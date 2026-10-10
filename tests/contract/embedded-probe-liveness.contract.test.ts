import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Bans a parenthesised `null`/`undefined` literal where its value is used in the verifier
 * JavaScript: each `webview_verify/*.js` file and each `r#"…"#` script in `webview_verify/mod.rs`.
 * `x ?? null`, `=== undefined` and `return null` stay legal; the parentheses mark substitution residue.
 */

const repoRoot = join(import.meta.dirname, '..', '..');
const libSource = readFileSync(join(repoRoot, 'src-tauri/src/webview_verify/mod.rs'), 'utf8');
const verifyDir = join(repoRoot, 'src-tauri/src/webview_verify');

/** One scanned script: where it lives, the line its body starts on, and the body itself. */
interface Script {
  origin: string;
  /** 1-based line of the body's first character inside `origin`. */
  line: number;
  body: string;
}

/** Every `r#"…"#` block in `webview_verify/mod.rs` — the still-embedded scripts, and nothing else uses them. */
function embeddedScripts(source: string): Script[] {
  const blocks: Script[] = [];
  const opener = /r#"/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const from = match.index + match[0].length;
    const to = source.indexOf('"#', from);
    if (to < 0) break;
    blocks.push({
      origin: 'src-tauri/src/webview_verify/mod.rs',
      line: source.slice(0, from).split('\n').length,
      body: source.slice(from, to),
    });
    opener.lastIndex = to + 2;
  }
  return blocks;
}

/** Every extracted probe file under `src-tauri/src/webview_verify/`. */
function extractedScripts(): Script[] {
  return readdirSync(verifyDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => ({
      origin: `src-tauri/src/webview_verify/${name}`,
      line: 1,
      body: readFileSync(join(verifyDir, name), 'utf8'),
    }));
}

/** The residue shapes, each meaning "this expression can never do anything". */
const DEAD_LITERAL_USES: { label: string; pattern: RegExp }[] = [
  { label: 'used as a ternary condition', pattern: /\((?:null|undefined)\)\s*\n?\s*\?/g },
  { label: 'used as a call or property receiver', pattern: /\((?:null|undefined)\)\s*\./g },
  { label: 'used as an operand of && or ||', pattern: /\((?:null|undefined)\)\s*(?:&&|\|\|)/g },
  { label: 'passed as an argument', pattern: /\(\s*\((?:null|undefined)\)\s*[,)]/g },
];

const fileScripts = extractedScripts();
const libScripts = embeddedScripts(libSource);
const scripts = [...fileScripts, ...libScripts];

function locate(script: Script, offsetInBody: number): string {
  const line = script.line + script.body.slice(0, offsetInBody).split('\n').length - 1;
  return `${script.origin}:${line}`;
}

describe('the verifier JavaScript contains no dead literals', () => {
  it('finds the probe scripts at all', () => {
    // A gate that scans nothing reports a clean sweep: the DOM marker probe's size proves the
    // files were read, and the `format!`-templated scripts keep `webview_verify/mod.rs` in scope.
    expect(fileScripts.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...fileScripts.map((script) => script.body.length))).toBeGreaterThan(10_000);
    expect(libScripts.length).toBeGreaterThan(0);
  });

  it('leaves no parenthesised null or undefined in a position that uses the value', () => {
    const offenders: string[] = [];

    for (const script of scripts) {
      for (const { label, pattern } of DEAD_LITERAL_USES) {
        for (const hit of script.body.matchAll(pattern)) {
          offenders.push(
            `${locate(script, hit.index ?? 0)} — ${label}: ${hit[0].replace(/\s+/g, ' ')}`,
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
