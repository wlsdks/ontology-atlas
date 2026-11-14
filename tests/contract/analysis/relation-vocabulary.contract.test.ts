import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import koMessages from '../../../messages/ko.json';
import enMessages from '../../../messages/en.json';
import { KNOWLEDGE_EDGE_TYPES } from '../../../src/entities/knowledge-graph/model/types';

/**
 * relation-vocabulary contract (persona measurement N5: four separate relation
 * vocabularies, one per surface). Before `relation-vocabulary.ts`, each surface that names a
 * `KnowledgeEdgeType` to a human picked its own wording. Two guardrails:
 *
 * 1. Source-grep — each surface file imports the shared dictionary
 *    (`useRelationVocabulary` from `@/entities/knowledge-graph`). A future
 *    edit that reverts one surface to a hand-rolled label reads as a
 *    missing import here, not just a silent copy drift.
 * 2. Dictionary completeness — both i18n registers (`edgeTypes` formal /
 *    `edgeTypesPlain` plain) define every `KnowledgeEdgeType`, in both
 *    locales, so `useRelationVocabulary` never silently falls through to a
 *    raw key for a real type.
 */

const ROOT = process.cwd();

const SURFACE_FILES: ReadonlyArray<{ label: string; file: string }> = [
  { label: 'map help relation guide (ShortcutSheet)', file: 'src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx' },
  { label: 'data sheet (HomePage — nodeDatasheet labels)', file: 'src/views/home/model/use-topology-preferences.tsx' },
];

const IMPORT_MARKERS = ['useRelationVocabulary'];

describe('relation-vocabulary contract — a dictionary shared by 2 surfaces', () => {
  it('the map legend and data sheet both import the shared dictionary (useRelationVocabulary)', () => {
    const missing: string[] = [];
    for (const surface of SURFACE_FILES) {
      const source = readFileSync(path.join(ROOT, surface.file), 'utf8');
      const file = ts.createSourceFile(surface.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const hasMarker = file.statements.some((statement) => {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return false;
        const bindings = statement.importClause?.namedBindings;
        return bindings && ts.isNamedImports(bindings)
          && bindings.elements.some((element) => !element.isTypeOnly && IMPORT_MARKERS.includes((element.propertyName ?? element.name).text));
      });
      if (!hasMarker) missing.push(`${surface.label} (${surface.file})`);
    }
    expect(
      missing,
      `These surfaces do not use the shared relation-vocabulary dictionary. Coining their own labels ` +
        `brings back a different word family per surface (N5):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it.each(['formal', 'plain'] as const)(
    '%s register defines every KnowledgeEdgeType in both ko/en',
    (register) => {
      const namespace = register === 'formal' ? 'edgeTypes' : 'edgeTypesPlain';
      for (const [localeName, messages] of [
        ['ko', koMessages],
        ['en', enMessages],
      ] as const) {
        const dict = (messages as Record<string, unknown>)[namespace] as
          | Record<string, string>
          | undefined;
        expect(dict, `messages/${localeName}.json has no "${namespace}" namespace`).toBeDefined();
        const missingTypes = KNOWLEDGE_EDGE_TYPES.filter(
          (type) => typeof dict?.[type] !== 'string' || dict[type].trim() === '',
        );
        expect(
          missingTypes,
          `in messages/${localeName}.json "${namespace}" the following types are empty or missing: ${missingTypes.join(', ')}`,
        ).toEqual([]);
      }
    },
  );
});

it("keeps the protected topology owners connected to the route", () => {
  const route = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
  expect(route).toContain('useTopologyPreferences()');
});
