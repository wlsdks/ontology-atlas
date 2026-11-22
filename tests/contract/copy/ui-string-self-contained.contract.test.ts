import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

/**
 * A shell variable used in on-screen copy must be defined within the same namespace, so a command and
 * the hint defining its variable are read side by side and guidance is never a dead end.
 */

type Json = { [key: string]: string | Json };

function collectStrings(node: Json, path: string[], out: Map<string, string[]>) {
  for (const [key, value] of Object.entries(node)) {
    const next = [...path, key];
    if (typeof value === 'string') {
      // The namespace is the **parent object** holding that string — exactly the grouping
      // read side by side on screen. Pinning the depth as a number degrades to
      // "within the same string only" for shallow namespaces.
      const ns = path.join('.') || '(root)';
      const bucket = out.get(ns) ?? [];
      bucket.push(value);
      out.set(ns, bucket);
    } else {
      collectStrings(value, next, out);
    }
  }
}

/** Namespaces that use `$NAME` while nothing in that namespace defines `NAME=`. */
export function danglingShellVars(messages: Json): string[] {
  const byNamespace = new Map<string, string[]>();
  collectStrings(messages, [], byNamespace);
  const dangling: string[] = [];
  for (const [ns, strings] of byNamespace) {
    const used = new Set<string>();
    for (const s of strings) {
      for (const match of s.matchAll(/\$([A-Z][A-Z0-9_]*)/g)) used.add(match[1]);
    }
    for (const name of used) {
      const defined = strings.some((s) => new RegExp(`\\b${name}\\s*=`).test(s));
      if (!defined) dangling.push(`${ns} ($${name})`);
    }
  }
  return dangling.sort();
}

describe('on-screen copy is self-contained — no dead-end shell variables', () => {
  it.each([
    ['ko', ko],
    ['en', en],
  ])('%s: if it uses a shell variable the same cell defines that variable', (_locale, messages) => {
    expect(danglingShellVars(messages as unknown as Json)).toEqual([]);
  });

  it('the check does not idle — does it count what would really be caught?', () => {
    // The planted defect is caught,
    expect(
      danglingShellVars({ card: { hint: 'run node $ATLAS/mcp/src/index.js' } }),
    ).toEqual(['card ($ATLAS)']);
    // The check must hold at shallow depth too.
    expect(danglingShellVars({ hint: 'run node $ATLAS/x' })).toEqual(['(root) ($ATLAS)']);
    // A definition in the same namespace passes.
    expect(
      danglingShellVars({
        card: { setup: 'export ATLAS="…"', hint: 'run node $ATLAS/mcp/src/index.js' },
      }),
    ).toEqual([]);
  });

  it('both locales receive the same rule — so fixing only one side does not become the default', () => {
    const nsCount = (m: Json) => {
      const out = new Map<string, string[]>();
      collectStrings(m, [], out);
      return out.size;
    };
    expect(nsCount(ko as unknown as Json)).toBeGreaterThan(50);
    expect(nsCount(en as unknown as Json)).toBe(nsCount(ko as unknown as Json));
  });
});
