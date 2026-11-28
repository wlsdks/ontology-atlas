#!/usr/bin/env node
/**
 * Writes `src-tauri/crates/mcp-server/surface/review-input-schemas.json`: the two input contracts the
 * script server keeps whole while it advertises a short schema for them (`proposal` and
 * `qualification` of `analyze_repo_structure`), and the two string patterns its refusals name in words.
 * The Rust server's `schema_check` module reads this file, so a refusal of either argument is the
 * words, the example and the repair fields the script server writes.
 *
 *   node scripts/mcp/differential/write-review-schemas.mjs           # write
 *   node scripts/mcp/differential/write-review-schemas.mjs --check   # fail when the file is stale
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA } from '../../../mcp/src/construction/construction-qualification.mjs';
import { MEANING_PROPOSAL_INPUT_SCHEMA } from '../../../mcp/src/server/tool-schemas/meaning-construction.mjs';
import {
  NON_BLANK_MULTILINE_TEXT_SCHEMA,
  NON_BLANK_STRING_SCHEMA,
} from '../../../mcp/src/server/tool-schemas/field-primitives.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const target = path.join(repoRoot, 'src-tauri', 'crates', 'mcp-server', 'surface', 'review-input-schemas.json');

export function renderReviewSchemas() {
  return `${JSON.stringify({
    nonBlankStringPattern: NON_BLANK_STRING_SCHEMA.pattern,
    nonBlankMultilinePattern: NON_BLANK_MULTILINE_TEXT_SCHEMA.pattern,
    proposal: MEANING_PROPOSAL_INPUT_SCHEMA,
    qualification: CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA,
  })}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = renderReviewSchemas();
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
      console.error('review-input-schemas.json is stale; run node scripts/mcp/differential/write-review-schemas.mjs');
      process.exit(1);
    }
    console.log('review-input-schemas.json current');
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${path.relative(repoRoot, target)}`);
  }
}
