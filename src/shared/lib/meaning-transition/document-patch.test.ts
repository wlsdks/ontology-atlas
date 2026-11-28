import { describe, expect, it } from 'vitest';
import CASES from '../../../../tests/fixtures/document-patch-cases.json';
import { previewDocumentPatch } from './document-patch.mjs';

/**
 * The preview is the exact bytes the writer produces, so it is held to what the script server's
 * writer answered when `tests/fixtures/document-patch-cases.json` was recorded. The Rust writer's
 * output can be checked against the same file.
 */
describe('document patch preview', () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      expect(previewDocumentPatch(testCase.input)).toEqual(testCase.expected);
    });
  }
});
