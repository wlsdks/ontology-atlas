import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreOntology } from './score';
import type { GoldenOntologyExpected, ActualOntology } from './types';

const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/golden-ontology');

function loadFixture(id: string): GoldenOntologyExpected {
  const raw = readFileSync(join(FIXTURES_DIR, `${id}.expected.json`), 'utf8');
  return JSON.parse(raw) as GoldenOntologyExpected;
}

describe.each([
  '01-design-system',
  '02-aslan-builder',
  '03-aslan-iam',
  '04-aslan-verse-web',
  '05-reactor',
  '06-reactor-admin',
  '07-reactor-web',
  '08-paravel-app',
  '09-paravel-backend',
  '10-pick',
  '11-mcp-servers',
])(
  'golden fixture (smoke) — %s',
  (id) => {
    it('loads valid expected JSON with enum kinds + edge types', () => {
      const expected = loadFixture(id);
      expect(expected.id).toBe(id);
      const KIND = ['project', 'domain', 'capability', 'element', 'document'];
      const TYPE = [
        'contains',
        'belongs_to',
        'depends_on',
        'implements',
        'uses',
        'describes',
        'related_to',
      ];
      for (const n of expected.nodes) expect(KIND).toContain(n.kind);
      for (const e of expected.edges) expect(TYPE).toContain(e.type);
    });

    it('all edge endpoints reference declared node titles', () => {
      const expected = loadFixture(id);
      const titles = new Set(
        expected.nodes.map((n) => n.title.toLowerCase().trim()),
      );
      for (const e of expected.edges) {
        expect(titles.has(e.from.toLowerCase().trim())).toBe(true);
        expect(titles.has(e.to.toLowerCase().trim())).toBe(true);
      }
    });

    it('scoreOntology against itself yields perfect 1.0 (sanity)', () => {
      const expected = loadFixture(id);
      const actual: ActualOntology = {
        nodes: expected.nodes.map((n, i) => ({
          tempId: `n${i}`,
          title: n.title,
          kind: n.kind,
        })),
        edges: expected.edges.map((e) => {
          const fromIdx = expected.nodes.findIndex(
            (n) => n.title.toLowerCase() === e.from.toLowerCase(),
          );
          const toIdx = expected.nodes.findIndex(
            (n) => n.title.toLowerCase() === e.to.toLowerCase(),
          );
          return {
            fromTempId: `n${fromIdx}`,
            toTempId: `n${toIdx}`,
            type: e.type,
          };
        }),
      };
      const score = scoreOntology(expected, actual);
      expect(score.overallF1).toBe(1);
    });
  },
);

