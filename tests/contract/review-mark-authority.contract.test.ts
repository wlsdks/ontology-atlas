import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — the MCP package is plain ESM with no type declarations.
import * as schema from '../../mcp/src/schema.mjs';

/**
 * **A person's judgment is written only by a path that proves a person.**
 *
 * ## The measured defect this locks down
 *
 * `docs/benchmark/FINDINGS-2026-09-02-review-marks.md`. The rule was written in
 * the vault's own `AGENTS.md` — "Only a person writes those. Never set them
 * yourself." — and then three model tiers were asked to "mark these approved".
 * Two refused. The third produced this diff:
 *
 * ```diff
 * -review_state: human_decides
 * -review_note: "Whether this is one capability or two ... is the owner's call."
 * +review_state: confirmed
 * +reviewed_by: iamstark97
 * +reviewed_at: 2026-09-02
 * ```
 *
 * It deleted a live reservation, stamped an approval, and signed it with a name
 * it had never been given. A documented convention is honoured in proportion to
 * model capability, so the refusal has to live on the call path, where the
 * prompt cannot reach it.
 *
 * ## Why the server is started as a process
 *
 * Calling the guard directly proves the guard, not that anything calls it. This
 * repository has already shipped a gate that passed on invented input
 * (`docs/DECISIONS.md`, 2026-08-22 record 93 — an INDEX lens that did nothing
 * when pressed). So each case goes over JSON-RPC against a real server, and the
 * assertions read the file on disk afterwards rather than the tool's own reply.
 *
 * ## What this cannot cover, deliberately
 *
 * A direct file edit never reaches this server, and no assertion here pretends
 * otherwise. That half of the design is `reviewDigest`, tested at the bottom of
 * this file: it needs no cooperation from whoever made the change.
 */

function callTool(vaultRoot: string, name: string, args: Record<string, unknown>) {
  const script = `
    const { spawn } = require('node:child_process');
    const { writeSync } = require('node:fs');
    const child = spawn(process.execPath, [${JSON.stringify(
      join(process.cwd(), 'mcp/src/index.js'),
    )}], {
      env: { ...process.env, OATLAS_VAULT: ${JSON.stringify(vaultRoot)} },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buffer = '';
    let sentCall = false;
    let finished = false;
    const send = (o) => child.stdin.write(JSON.stringify(o) + '\\n');
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      writeSync(2, 'timed out waiting for MCP tools/call response');
      process.exitCode = 2;
    }, 25_000);
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      writeSync(2, 'MCP child failed to start: ' + error.message);
      process.exitCode = 2;
    });
    child.on('exit', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      writeSync(2, 'MCP child exited before response: ' + String(code) + '/' + String(signal));
      process.exitCode = 2;
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\\n')) {
        const at = buffer.indexOf('\\n');
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !sentCall) {
          sentCall = true;
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: ${JSON.stringify(
            name,
          )}, arguments: ${JSON.stringify(args)} } });
        }
        if (message.id === 2 && !finished) {
          finished = true;
          clearTimeout(timeout);
          writeSync(1, JSON.stringify({ isError: Boolean(message.result?.isError), text: String(message.result?.content?.[0]?.text ?? '') }));
          child.kill();
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } } });
  `;
  const raw = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return JSON.parse(raw) as { isError: boolean; text: string };
}

const RESERVED_NOTE = 'Whether this is one capability or two is the owner call.';

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-review-'));
  writeFileSync(
    join(dir, 'project.md'),
    '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: Probe\n---\n\nProbe project.\n',
    'utf8',
  );
  mkdirSync(join(dir, 'capabilities'), { recursive: true });
  writeFileSync(
    join(dir, 'capabilities', 'reserved.md'),
    '---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/reserved\nkind: capability\n' +
      `title: Reserved\nreview_state: human_decides\nreview_note: "${RESERVED_NOTE}"\n---\n\nThe person has not decided yet.\n`,
    'utf8',
  );
  writeFileSync(
    join(dir, 'capabilities', 'open.md'),
    '---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/open\nkind: capability\ntitle: Open\n---\n\nNobody has ruled on this.\n',
    'utf8',
  );
  return dir;
}

function read(vault: string, relative: string): string {
  return readFileSync(join(vault, relative), 'utf8');
}

describe('review marks — only a path that proves a person writes a human judgment', () => {
  it('refuses the exact forge the probe recorded: stamping reviewed_by', () => {
    const vault = makeVault();
    const result = callTool(vault, 'patch_concept', {
      slug: 'capabilities/open',
      frontmatter: { reviewed_by: 'iamstark97', reviewed_at: '2026-09-02' },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('reviewed_by');
    // The refusal has to name the door that IS open, or an agent that cannot
    // settle a node is left with nothing to do but guess — the failure the
    // reservation exists to absorb.
    expect(result.text).toContain('human_decides');
    expect(read(vault, 'capabilities/open.md')).not.toContain('reviewed_by');
  });

  it('refuses an agent-written confirmed', () => {
    const vault = makeVault();
    const result = callTool(vault, 'patch_concept', {
      slug: 'capabilities/open',
      frontmatter: { review_state: 'confirmed' },
    });
    expect(result.isError).toBe(true);
    expect(read(vault, 'capabilities/open.md')).not.toContain('confirmed');
  });

  it('refuses clearing a reservation, which is how the forged diff began', () => {
    const vault = makeVault();
    const result = callTool(vault, 'patch_concept', {
      slug: 'capabilities/reserved',
      frontmatter: { review_state: null },
    });
    expect(result.isError).toBe(true);
    expect(read(vault, 'capabilities/reserved.md')).toContain('review_state: human_decides');
  });

  it('refuses a body rewrite of a reserved node, and says what the person has to decide', () => {
    const vault = makeVault();
    const result = callTool(vault, 'patch_concept', {
      slug: 'capabilities/reserved',
      body: 'An agent decided it after all.',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(RESERVED_NOTE);
    expect(read(vault, 'capabilities/reserved.md')).toContain('The person has not decided yet.');
  });

  it('allows raising a reservation — the behaviour the product wants', () => {
    const vault = makeVault();
    const result = callTool(vault, 'patch_concept', {
      slug: 'capabilities/open',
      frontmatter: {
        review_state: 'human_decides',
        review_note: 'Two readings of this boundary are equally supported by the source.',
      },
    });
    expect(result.isError).toBe(false);
    const after = read(vault, 'capabilities/open.md');
    expect(after).toContain('review_state: human_decides');
    expect(after).toContain('equally supported');
  });
});

describe('review currentness — the half that needs nobody cooperation', () => {
  const frontmatter = {
    uid: '44444444-4444-4444-8444-444444444444',
    slug: 'capabilities/bound',
    kind: 'capability',
    title: 'Bound',
    domain: 'domains/example',
  };

  it('an approval bound to what was approved survives a re-read', () => {
    const digest = schema.reviewDigest(frontmatter, 'The reviewed meaning.');
    const confirmed = { ...frontmatter, review_state: 'confirmed', reviewed_by: 'jinan', reviewed_digest: digest };
    expect(schema.reviewCurrentness(confirmed, 'The reviewed meaning.')).toBe('current');
  });

  it('stops asserting approval once the body changes, with nobody touching the mark', () => {
    const digest = schema.reviewDigest(frontmatter, 'The reviewed meaning.');
    const confirmed = { ...frontmatter, review_state: 'confirmed', reviewed_by: 'jinan', reviewed_digest: digest };
    expect(schema.reviewCurrentness(confirmed, 'Rewritten by something later.')).toBe(
      'changed-since-review',
    );
  });

  it('a changed relation expires the approval too — meaning is not only prose', () => {
    const digest = schema.reviewDigest(frontmatter, 'The reviewed meaning.');
    const moved = { ...frontmatter, domain: 'domains/elsewhere', review_state: 'confirmed', reviewed_digest: digest };
    expect(schema.reviewCurrentness(moved, 'The reviewed meaning.')).toBe('changed-since-review');
  });

  it('adding a localized display name does not expire every approval in the vault', () => {
    const digest = schema.reviewDigest(frontmatter, 'The reviewed meaning.');
    const localized = {
      ...frontmatter,
      display_ko: '경계',
      review_state: 'confirmed',
      reviewed_digest: digest,
    };
    expect(schema.reviewCurrentness(localized, 'The reviewed meaning.')).toBe('current');
  });

  it('no binding reads as unknown, never as still-current', () => {
    const unbound = { ...frontmatter, review_state: 'confirmed', reviewed_by: 'jinan' };
    expect(schema.reviewCurrentness(unbound, 'anything at all')).toBe('unknown');
  });

  it('an unmarked node is not a defect — absence is its own answer', () => {
    expect(schema.reviewCurrentness(frontmatter, 'The reviewed meaning.')).toBe('not-confirmed');
  });
});
