import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESIGN_CHANGE_SIGNALS } from '../../scripts/lib/design-proof-router.mjs';

// Check callable metadata, references, and mirror bytes. Human review prose is
// intentionally not pinned: the router tests own executable proof selection.
const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const seats = [...new Set(Object.values(DESIGN_CHANGE_SIGNALS).flatMap((signal) => signal.seats))].sort();
const MAX_AGENT_BYTES = 9_000;

function metadata(body: string, key: string): string {
  const frontmatter = body.split('---')[1] ?? '';
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
}

function tableAgents(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^\|.*\bAgent\b.*\|/.test(line));
  assert(start >= 0, 'Missing agent roster table');
  const end = lines.findIndex((line, index) => index > start && !line.startsWith('|'));
  return [...new Set(lines.slice(start + 1, end < 0 ? undefined : end)
    .flatMap((line) => [...line.matchAll(/`(design-[a-z-]+)`/g)].map((match) => match[1])))].sort();
}

function requireMirroredAgent(name: string, load: (path: string) => string): string {
  const canonical = `.claude/agents/${name}.md`;
  const mirror = `.agents/agents/${name}.md`;
  const body = load(canonical);
  assert.equal(metadata(body, 'name'), name, `${canonical}: frontmatter identity mismatch`);
  assert.equal(load(mirror), body, `${mirror}: differs from ${canonical}`);
  return body;
}

describe('Design Council wiring', () => {
  it('documents exactly the nonempty seat inventory declared by the executable router', () => {
    expect(seats.length).toBeGreaterThan(0);
    expect(seats).not.toContain('design-guardian');
    for (const path of [
      'docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md',
      '.claude/skills/design-council/SKILL.md',
      '.agents/skills/design-council/SKILL.md',
    ]) expect(tableAgents(read(path)), path).toEqual(seats);
  });

  it('resolves every routed seat to matching metadata and identical mirrored files', () => {
    const models = new Set<string>();
    for (const name of seats) {
      const body = requireMirroredAgent(name, read);
      const model = metadata(body, 'model');
      expect(model, `${name}: missing model`).not.toBe('');
      models.add(model);
      expect(metadata(body, 'tools').split(/,\s*/), name).toContain('Read');
      expect(metadata(body, 'tools').split(/,\s*/), name).toContain('WebSearch');
      expect(Buffer.byteLength(body, 'utf8'), name).toBeLessThanOrEqual(MAX_AGENT_BYTES);
    }
    expect(models.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps coordinator metadata non-editing and both accountable roles mirrored', () => {
    const chief = requireMirroredAgent('chief', read);
    const tools = metadata(chief, 'tools').split(/,\s*/);
    expect(tools).not.toContain('Edit');
    expect(tools).not.toContain('Write');
    requireMirroredAgent('design-guardian', read);
  });

  it.each(['design-council', 'design-directions'])('mirrors the %s skill byte-for-byte', (name) => {
    expect(read(`.agents/skills/${name}/SKILL.md`)).toBe(read(`.claude/skills/${name}/SKILL.md`));
  });

  it('rejects missing, misidentified, and divergent agent files', () => {
    const name = seats[0];
    expect(name).toBeTruthy();
    const canonical = `.claude/agents/${name}.md`;
    const mirror = `.agents/agents/${name}.md`;
    const files = new Map([[canonical, read(canonical)], [mirror, read(mirror)]]);
    const load = (path: string): string => {
      const body = files.get(path);
      assert.notEqual(body, undefined, `Missing agent file: ${path}`);
      return body!;
    };
    const original = files.get(mirror)!;
    files.delete(mirror);
    expect(() => requireMirroredAgent(name, load)).toThrow(`Missing agent file: ${mirror}`);
    files.set(mirror, `${original}\n`);
    expect(() => requireMirroredAgent(name, load)).toThrow(`${mirror}: differs`);
    files.set(mirror, original);
    files.set(canonical, original.replace(`name: ${name}`, 'name: wrong-identity'));
    expect(() => requireMirroredAgent(name, load)).toThrow('frontmatter identity mismatch');
    files.set(canonical, original);
    expect(() => requireMirroredAgent(name, load)).not.toThrow();
  });
});
