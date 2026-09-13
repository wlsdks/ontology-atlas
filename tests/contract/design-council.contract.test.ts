import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESIGN_CHANGE_SIGNALS } from '../../scripts/lib/design-proof-router.mjs';

// Check each harness's metadata, references, and routed seat availability. Human review prose is
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

function requireAgent(tree: string, name: string, load: (path: string) => string): string {
  const path = `${tree}/agents/${name}.md`;
  const body = load(path);
  assert.equal(metadata(body, 'name'), name, `${path}: frontmatter identity mismatch`);
  assert(metadata(body, 'description'), `${path}: missing description`);
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

  for (const tree of ['.claude', '.agents']) {
    it(`resolves every routed seat independently in ${tree}`, () => {
      const models = new Set<string>();
      for (const name of seats) {
        const body = requireAgent(tree, name, read);
        expect(Buffer.byteLength(body, 'utf8'), name).toBeLessThanOrEqual(MAX_AGENT_BYTES);
        if (tree === '.claude') {
          expect(metadata(body, 'model'), name).not.toBe('');
          models.add(metadata(body, 'model'));
          expect(metadata(body, 'tools').split(/,\s*/), name).toContain('Read');
          expect(metadata(body, 'tools').split(/,\s*/), name).toContain('WebSearch');
        } else {
          expect(metadata(body, 'access'), name).toBe('read-only');
          expect(metadata(body, 'model'), name).toBe('');
          expect(metadata(body, 'tools'), name).toBe('');
        }
      }
      if (tree === '.claude') expect(models.size).toBeGreaterThanOrEqual(2);
      const chief = requireAgent(tree, 'chief', read);
      const guardian = requireAgent(tree, 'design-guardian', read);
      if (tree === '.claude') {
        expect(metadata(chief, 'tools').split(/,\s*/)).not.toContain('Edit');
        expect(metadata(chief, 'tools').split(/,\s*/)).not.toContain('Write');
      } else {
        expect(metadata(chief, 'access')).toBe('read-only');
        expect(metadata(guardian, 'access')).toBe('workspace-write');
      }
    });
  }

  it('rejects missing or misidentified seats but permits different client prose', () => {
    const name = seats[0];
    const files = new Map(['.claude', '.agents'].map((tree) => {
      const path = `${tree}/agents/${name}.md`;
      return [path, read(path)] as const;
    }));
    const load = (path: string): string => {
      const body = files.get(path);
      assert.notEqual(body, undefined, `Missing agent file: ${path}`);
      return body!;
    };
    for (const tree of ['.claude', '.agents']) {
      const path = `${tree}/agents/${name}.md`;
      const original = files.get(path)!;
      files.delete(path);
      expect(() => requireAgent(tree, name, load)).toThrow(`Missing agent file: ${path}`);
      files.set(path, original.replace(`name: ${name}`, 'name: wrong-identity'));
      expect(() => requireAgent(tree, name, load)).toThrow('frontmatter identity mismatch');
      files.set(path, `${original}\nIndependent client instructions.\n`);
      expect(() => requireAgent(tree, name, load)).not.toThrow();
    }
  });
});
