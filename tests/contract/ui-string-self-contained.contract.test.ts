import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * When on-screen copy uses a shell variable, that variable must be defined **within
 * the same namespace.**
 *
 * **Why** (measured 2026-08-17). The "connect my agent" card said:
 *
 *   "Verify connection in terminal: node $ATLAS/cli/src/index.mjs mcp-verify."
 *
 * What `$ATLAS` is was written only in strings belonging to **two other panels**
 * (`projectPages.selector` and `atlasGit`). Someone looking at this card alone pastes
 * that line and it fails — with no way to learn that the cause lives on a screen they
 * never saw. **Dead-end guidance is worse than no guidance.**
 *
 * **Why "same namespace" and not "same string".** The inventory before switching on
 * was 2 per locale, and one of the two was legitimate:
 * `projectPages.selector.nextSlotCliCommand` uses `$ATLAS`, and right beside it
 * `projectPages.selector.cliPlaceholderHint` gives `export ATLAS="…"`. They are read
 * side by side in the same panel, so it is not a dead end.
 *
 * Requiring the definition inside the same string would catch that legitimate pair,
 * making the rule noise rather than a rule. With the namespace as the unit of
 * judgement, only the one real defect remains.
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

describe('화면 문구는 스스로 완결한다 — 막다른 셸 변수 금지', () => {
  it.each([
    ['ko', ko],
    ['en', en],
  ])('%s: 셸 변수를 쓰면 같은 칸이 그 변수를 정의한다', (_locale, messages) => {
    expect(danglingShellVars(messages as unknown as Json)).toEqual([]);
  });

  it('검사가 헛돌고 있지 않다 — 실제로 걸릴 것을 세고 있는가', () => {
    // The planted defect is caught,
    expect(
      danglingShellVars({ card: { hint: 'run node $ATLAS/cli/src/index.mjs' } }),
    ).toEqual(['card ($ATLAS)']);
    // and the verdict must hold at shallow depth too — the earlier implementation
    // degraded here.
    expect(danglingShellVars({ hint: 'run node $ATLAS/x' })).toEqual(['(root) ($ATLAS)']);
    // A definition in the same namespace passes — the legitimate pair measured on
    // 2026-08-17 has this shape.
    expect(
      danglingShellVars({
        card: { setup: 'export ATLAS="…"', hint: 'run node $ATLAS/cli/src/index.mjs' },
      }),
    ).toEqual([]);
  });

  it('두 로케일이 같은 규칙을 받는다 — 한쪽만 고치는 것이 기본값이 되지 않게', () => {
    const nsCount = (m: Json) => {
      const out = new Map<string, string[]>();
      collectStrings(m, [], out);
      return out.size;
    };
    expect(nsCount(ko as unknown as Json)).toBeGreaterThan(50);
    expect(nsCount(en as unknown as Json)).toBe(nsCount(ko as unknown as Json));
  });
});
