import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import koMessages from '../../messages/ko.json';
import enMessages from '../../messages/en.json';
import { KNOWLEDGE_EDGE_TYPES } from '../../src/entities/knowledge-graph/model/types';

/**
 * relation-vocabulary contract (persona measurement N5: four separate relation
 * vocabularies, one per surface). Before `relation-vocabulary.ts`, the 4 surfaces that name a
 * `KnowledgeEdgeType` to a human each picked their own wording: the map
 * legend and `/ontology/insights` used formal Korean nouns, the node
 * datasheet used its own plain phrases, and the ERD builder rendered raw
 * untranslated English. Two guardrails:
 *
 * 1. Source-grep — each of the 4 surface files imports the shared
 *    dictionary (`useRelationVocabulary` or its formal-only wrapper
 *    `useEdgeTypeLabel`, both from `@/entities/knowledge-graph`). A future
 *    edit that reverts one surface to a hand-rolled label reads as a
 *    missing import here, not just a silent copy drift.
 * 2. Dictionary completeness — both i18n registers (`edgeTypes` formal /
 *    `edgeTypesPlain` plain) define every `KnowledgeEdgeType`, in both
 *    locales, so `useRelationVocabulary` never silently falls through to a
 *    raw key for a real type.
 */

const ROOT = process.cwd();

const SURFACE_FILES: ReadonlyArray<{ label: string; file: string }> = [
  { label: '지도 범례 (TopologyRelationLegend)', file: 'src/views/home/ui/TopologyRelationLegend.tsx' },
  { label: '인사이트 (OntologyInsightsPage)', file: 'src/views/ontology-insights/ui/OntologyInsightsPage.tsx' },
  { label: '데이터시트 (HomePage — nodeDatasheet labels)', file: 'src/views/home/ui/HomePage.tsx' },
];

const IMPORT_MARKERS = ['useRelationVocabulary', 'useEdgeTypeLabel'];

describe('relation-vocabulary contract — 3 표면 공용 사전', () => {
  it('지도 범례 · 인사이트 · 데이터시트가 모두 공유 사전(useRelationVocabulary/useEdgeTypeLabel)을 import 한다', () => {
    const missing: string[] = [];
    for (const surface of SURFACE_FILES) {
      const source = readFileSync(path.join(ROOT, surface.file), 'utf8');
      const hasMarker = IMPORT_MARKERS.some((marker) => source.includes(marker));
      if (!hasMarker) missing.push(`${surface.label} (${surface.file})`);
    }
    expect(
      missing,
      `다음 표면이 공유 relation-vocabulary 사전을 쓰지 않습니다 — 자체 라벨을 새로 만들면 ` +
        `표면마다 다른 단어족이 재발합니다(N5):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it.each(['formal', 'plain'] as const)(
    '%s 레지스터가 모든 KnowledgeEdgeType 을 ko/en 양쪽에 정의한다',
    (register) => {
      const namespace = register === 'formal' ? 'edgeTypes' : 'edgeTypesPlain';
      for (const [localeName, messages] of [
        ['ko', koMessages],
        ['en', enMessages],
      ] as const) {
        const dict = (messages as Record<string, unknown>)[namespace] as
          | Record<string, string>
          | undefined;
        expect(dict, `messages/${localeName}.json 에 "${namespace}" 네임스페이스가 없습니다`).toBeDefined();
        const missingTypes = KNOWLEDGE_EDGE_TYPES.filter(
          (type) => typeof dict?.[type] !== 'string' || dict[type].trim() === '',
        );
        expect(
          missingTypes,
          `messages/${localeName}.json "${namespace}" 에 다음 타입이 비어있거나 없습니다: ${missingTypes.join(', ')}`,
        ).toEqual([]);
      }
    },
  );
});
