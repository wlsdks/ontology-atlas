import { describe, expect, it } from 'vitest';

import { ONTOLOGY_STARTER_FILES } from '@/entities/vault-session';
import { STARTER_CONCEPT_COUNT } from './starter-counts';

describe('starter count meaning', () => {
  // The onboarding copy promises "5 markdown seeds". If the file list grows or shrinks that copy has
  // to change with it, so it is locked here.
  it('counts starter concepts equal to starter Markdown files', () => {
    expect(STARTER_CONCEPT_COUNT).toBe(ONTOLOGY_STARTER_FILES.length);
    expect(STARTER_CONCEPT_COUNT).toBe(5);
  });

  it('lists only .md starter files and no agent config file', () => {
    for (const file of ONTOLOGY_STARTER_FILES) {
      expect(file.relPath).toMatch(/\.md$/);
    }
  // `.mcp.json` and `.codex/config.toml` are configuration, not concepts — mixed into the concept
  // count they become the lie "8 concepts".
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('.mcp.json'))).toBe(false);
    expect(ONTOLOGY_STARTER_FILES.some((f) => f.relPath.includes('config.toml'))).toBe(false);
  });
});
