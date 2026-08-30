import { describe, expect, it } from 'vitest';

import { ONTOLOGY_STARTER_FILES } from '@/entities/vault-session';
import { STARTER_CONCEPT_COUNT } from './starter-counts';

describe('스타터 개수 의미 (#70)', () => {
  // The onboarding copy promises "5 markdown seeds". If the file list grows or shrinks that copy has
  // to change with it, so it is locked here.
  it('스타터 개념 수는 마크다운 파일 수와 같다', () => {
    expect(STARTER_CONCEPT_COUNT).toBe(ONTOLOGY_STARTER_FILES.length);
    expect(STARTER_CONCEPT_COUNT).toBe(5);
  });

  it('스타터 마크다운은 모두 .md 이고 에이전트 설정 파일을 포함하지 않는다', () => {
    for (const file of ONTOLOGY_STARTER_FILES) {
      expect(file.relPath).toMatch(/\.md$/);
    }
  // `.mcp.json` and `.codex/config.toml` are configuration, not concepts — mixed into the concept
  // count they become the lie "8 concepts".
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('.mcp.json'))).toBe(false);
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('config.toml'))).toBe(false);
  });
});
