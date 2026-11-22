import { describe, expect, it } from 'vitest';
import { sourceFolderOf } from './source-folder';

describe('the folder a source sits in', () => {
  it('names every folder between the sources folder and the file', () => {
    expect(sourceFolderOf('sources/meetings/agenda.md')).toBe('meetings');
    expect(sourceFolderOf('sources/Field notes/visits/site-a.txt')).toBe('Field notes/visits');
  });

  it('has no folder for a file at the top of the sources folder', () => {
    expect(sourceFolderOf('sources/agenda.md')).toBeNull();
  });
});
