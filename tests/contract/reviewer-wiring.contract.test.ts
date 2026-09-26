import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESIGN_BASE_LENSES, DESIGN_CHANGE_SIGNALS } from '../../scripts/lib/design-proof-router.mjs';
import { PO_BASE_LENSES, PO_REVIEWER, PO_RISK_ROUTES } from '../../scripts/lib/po-risk-router.mjs';

// The routers name one independent reviewer and the lenses it applies. Each
// harness keeps its own reviewer prose; this binds only identity, metadata, and
// that every routed lens id is named in both briefs.
const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const MAX_AGENT_BYTES = 9_000;
const TREES = ['.claude', '.agents'] as const;

const lenses = [
  ...new Set([
    ...PO_BASE_LENSES,
    ...Object.values(PO_RISK_ROUTES).map((route) => route.lens),
    ...DESIGN_BASE_LENSES,
    ...Object.values(DESIGN_CHANGE_SIGNALS).flatMap((signal) => signal.lenses),
  ]),
].sort();

function metadata(body: string, key: string): string {
  const frontmatter = body.split('---')[1] ?? '';
  return frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
}

const tools = (body: string): string[] => metadata(body, 'tools').split(/,\s*/).filter(Boolean);

function requireAgent(tree: string, name: string, load: (path: string) => string): string {
  const path = `${tree}/agents/${name}.md`;
  const body = load(path);
  assert.equal(metadata(body, 'name'), name, `${path}: frontmatter identity mismatch`);
  assert(metadata(body, 'description'), `${path}: missing description`);
  return body;
}

describe('Independent reviewer wiring', () => {
  it('derives a nonempty lens vocabulary from both routers', () => {
    expect(PO_REVIEWER).toBe('reviewer');
    expect(DESIGN_BASE_LENSES).toEqual(PO_BASE_LENSES);
    expect(lenses.length).toBeGreaterThanOrEqual(12);
  });

  for (const tree of TREES) {
    it(`resolves the reviewer and names every routed lens in ${tree}`, () => {
      const body = requireAgent(tree, PO_REVIEWER, read);
      expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(MAX_AGENT_BYTES);
      for (const lens of lenses) expect(body, lens).toContain(`\`${lens}\``);
      if (tree === '.claude') {
        expect(metadata(body, 'model')).not.toBe('');
        expect(tools(body)).toContain('Read');
        expect(tools(body)).not.toContain('Edit');
        expect(tools(body)).not.toContain('Write');
      } else {
        expect(metadata(body, 'access')).toBe('read-only');
        expect(metadata(body, 'model')).toBe('');
        expect(metadata(body, 'tools')).toBe('');
      }
    });

    it(`keeps design-guardian as the editing design agent in ${tree}`, () => {
      const guardian = requireAgent(tree, 'design-guardian', read);
      if (tree === '.claude') expect(tools(guardian)).toContain('Edit');
      else expect(metadata(guardian, 'access')).toBe('workspace-write');
    });
  }

  it('rejects a missing or misidentified reviewer but permits different client prose', () => {
    const files = new Map(TREES.map((tree) => {
      const path = `${tree}/agents/${PO_REVIEWER}.md`;
      return [path, read(path)] as const;
    }));
    const load = (path: string): string => {
      const body = files.get(path);
      assert.notEqual(body, undefined, `Missing agent file: ${path}`);
      return body!;
    };
    for (const tree of TREES) {
      const path = `${tree}/agents/${PO_REVIEWER}.md`;
      const original = files.get(path)!;
      files.delete(path);
      expect(() => requireAgent(tree, PO_REVIEWER, load)).toThrow(`Missing agent file: ${path}`);
      files.set(path, original.replace(`name: ${PO_REVIEWER}`, 'name: wrong-identity'));
      expect(() => requireAgent(tree, PO_REVIEWER, load)).toThrow('frontmatter identity mismatch');
      files.set(path, `${original}\nIndependent client instructions.\n`);
      expect(() => requireAgent(tree, PO_REVIEWER, load)).not.toThrow();
    }
  });
});
