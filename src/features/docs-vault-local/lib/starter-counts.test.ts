import { describe, expect, it } from 'vitest';

import { ONTOLOGY_STARTER_FILES } from '@/entities/vault-session';
import { STARTER_CONCEPT_COUNT } from './starter-counts';

describe('starter count meaning', () => {
  // The onboarding copy promises this count, so the copy changes with the file list.
  it('counts starter concepts equal to starter Markdown files', () => {
    expect(STARTER_CONCEPT_COUNT).toBe(ONTOLOGY_STARTER_FILES.length);
    expect(STARTER_CONCEPT_COUNT).toBe(5);
  });

  it('lists only .md starter files and no agent config file', () => {
    for (const file of ONTOLOGY_STARTER_FILES) {
      expect(file.relPath).toMatch(/\.md$/);
    }
  // Config files are not concepts; counting them would overstate the concept count.
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('.mcp.json'))).toBe(false);
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('config.toml'))).toBe(false);
  });
});
