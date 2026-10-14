import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_BLOCKED_PREFIX,
  TIMED_OUT_PREFIX,
} from '@/features/vault-agent/model/agent-loop';

/**
 * `noticeFor` in `agent-loop.ts` recognises failures by a code, not Korean substrings of Rust error
 * text; this holds the two copies of that code together across a language boundary.
 */

const repoRoot = join(import.meta.dirname, '..', '..', '..');

function productionSource(dir: string): string {
  const parts: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') parts.push(productionSource(path));
    } else if (entry.name.endsWith('.rs') && !/(^|_)tests\.rs$/.test(entry.name)) {
      parts.push(readFileSync(path, 'utf8'));
    }
  }
  return parts.join('\n');
}

const llmSource = [
  readFileSync(join(repoRoot, 'src-tauri/src/llm.rs'), 'utf8'),
  productionSource(join(repoRoot, 'src-tauri/src/llm')),
].join('\n');

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
