import { describe, expect, it } from 'vitest';
import cases from '../../../../tests/fixtures/atlas-temporary-names.json';
import { isAtlasTemporaryName } from './atlas-temporary-names';

describe('isAtlasTemporaryName', () => {
  it.each(cases.temporary)('recognises the writer shape %s', (name) => {
    expect(isAtlasTemporaryName(name)).toBe(true);
  });

  it.each(cases.notTemporary)('leaves a person\'s file named %s alone', (name) => {
    expect(isAtlasTemporaryName(name)).toBe(false);
  });
});
