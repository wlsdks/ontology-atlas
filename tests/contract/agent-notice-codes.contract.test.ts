import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_BLOCKED_PREFIX,
  TIMED_OUT_PREFIX,
} from '@/features/vault-agent/model/agent-loop';

/**
 * Gate against the screen and the Rust backend drifting apart on how a failure is recognised.
 *
 * `noticeFor` in `agent-loop.ts` decides which notice a failed LLM turn shows. Until 2026-08-24 it
 * decided by matching **Korean substrings** of the Rust error text — one phrase meaning "audit
 * record" for a ledger write failure, another meaning "within the time" for a curl timeout.
 * Nothing pinned the two sides together: the Rust
 * test suite checked the Rust sentence, the TypeScript test checked its own hard-coded copy of that
 * sentence, and editing the real string left both green.
 *
 * **The trap was armed by this repository's own rules.** `forbidden.md` says contributor-facing
 * prose must not be Korean, which points the next agent straight at those exact strings. Translating
 * them would have dropped an unwritable vault through to the `network-failed` branch — telling
 * someone to check their network while the real blocker was a read-only folder, which is precisely
 * the diagnosis the `audit-blocked` notice exists to give. A round of comment translation ran the
 * day this was found and stopped at string literals only because it was told to.
 *
 * So the contract is now a **code**, following `vault-root-rejected:`, and this file is what holds
 * the two copies of that code together across a language boundary neither compiler spans.
 */

const repoRoot = join(import.meta.dirname, '..', '..');
const llmSource = readFileSync(join(repoRoot, 'src-tauri/src/llm.rs'), 'utf8');

describe('the agent notice codes mean the same thing on both sides', () => {
  it('mints the same prefixes in Rust that TypeScript matches', () => {
    // The literal, not a regex on the constant name: a renamed Rust constant holding the same
    // string is fine, and a same-named constant holding a different string is the actual hazard.
    expect(llmSource).toContain(`"${AUDIT_BLOCKED_PREFIX}"`);
    expect(llmSource).toContain(`"${TIMED_OUT_PREFIX}"`);
  });

  it('puts the audit code on every path that can refuse to write the ledger', () => {
    // `reserve` is the log-before-send gate: if it fails, nothing is sent. Both call sites must
    // carry the code, or one of them silently becomes a "check your network" again.
    const reserveCalls = llmSource.match(/llm_audit::reserve\(/g) ?? [];
    expect(reserveCalls.length).toBeGreaterThan(0);

    // Split at each call and look at what immediately follows, rather than a dot-all regex: the
    // question is "does this call tag its own failure", and reading it per call site says so.
    const coded = llmSource
      .split('llm_audit::reserve(')
      .slice(1)
      .filter((tail) => tail.slice(0, 200).includes('format!("{AUDIT_BLOCKED_PREFIX}'));

    expect(
      coded.length,
      `every llm_audit::reserve call must tag its failure with ${AUDIT_BLOCKED_PREFIX} — ` +
        `found ${reserveCalls.length} call(s) but ${coded.length} tagged`,
    ).toBe(reserveCalls.length);
  });

  it('tags the curl timeout answer with its code', () => {
    // curl exit 28 is the timeout. The English `/timed out/i` fallback in `noticeFor` stays as a
    // second net, but it must not be the only one — a localized curl build says it differently.
    expect(llmSource).toMatch(/Some\(28\) => format!\("\{TIMED_OUT_PREFIX\}/);
  });

  it('leaves no Korean-prose matcher behind in the screen logic', () => {
    // The specific regression: recognising a failure by its Korean wording. If this ever returns,
    // the language gate and this contract disagree, and the language gate wins by deleting a
    // string this file cannot see.
    const agentLoop = readFileSync(
      join(repoRoot, 'src/features/vault-agent/model/agent-loop.ts'),
      'utf8',
    );
    const matcherRegion = agentLoop.slice(agentLoop.indexOf('function noticeFor('));
    expect(
      /message\.includes\('[^']*[가-힣][^']*'\)/.test(matcherRegion),
      'noticeFor must branch on codes, not on Korean prose',
    ).toBe(false);
  });
});
