import { describe, expect, it } from 'vitest';
import { readStructure, structurePath, trimStructurePath } from './structure-index';

const node = (id: string, kind: 'project' | 'domain' | 'capability' | 'element' = 'domain') => ({ id, label: id, kind });
const edge = (source: string, target: string, relationType = 'contains') => ({ source, target, relationType });

describe('recorded structure', () => {
  it('reverses child-side membership and deduplicates the same child', () => {
    const index = readStructure([node('p', 'project'), node('d'), node('c', 'capability')], [edge('p', 'd'), edge('c', 'd', 'belongs_to'), edge('d', 'c')]);
    expect(index.children.get('d')).toEqual(['c']);
    expect(structurePath(index, 'c')).toEqual(['p', 'd', 'c']);
  });
  it('retains all recorded parents and direct levels without inventing membership', () => {
    const index = readStructure([node('p', 'project'), node('d'), node('c', 'capability'), node('e', 'element')], [edge('p', 'd'), edge('p', 'c'), edge('d', 'c'), edge('d', 'e'), edge('c', 'e', 'uses')]);
    expect(index.parents.get('c')).toEqual(['d', 'p']);
    expect(index.children.get('d')).toEqual(['c', 'e']);
    expect(index.parents.get('e')).toEqual(['d']);
  });
  it('keeps disconnected closed cycles and parentless concepts accessible', () => {
    const index = readStructure([node('p', 'project'), node('a'), node('b'), node('orphan', 'element')], [edge('a', 'b'), edge('b', 'a')]);
    expect(index.outside).toEqual(['a', 'b', 'orphan']);
    expect(structurePath(index, 'b')).toEqual(['b']);
    expect(trimStructurePath(index, ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
  it('exposes every kind when there is no project document', () => {
    const index = readStructure([node('e', 'element'), node('d'), node('c', 'capability')], [edge('d', 'c'), edge('c', 'e')]);
    expect(index.roots).toEqual(['d']);
    expect(structurePath(index, 'e')).toEqual(['d', 'c', 'e']);
  });
  it('trims a removed or changed membership step to its last valid ancestor', () => {
    const index = readStructure([node('p', 'project'), node('d'), node('e', 'element')], [edge('p', 'd')]);
    expect(trimStructurePath(index, ['p', 'd', 'e'])).toEqual(['p', 'd']);
    expect(trimStructurePath(index, ['missing', 'd'])).toEqual([]);
  });
  it('ignores dependency, taxonomy, and unresolved endpoints as membership', () => {
    const index = readStructure([node('p', 'project'), node('d')], [edge('p', 'd', 'depends_on'), edge('p', 'd', 'implements'), edge('d', 'p', 'is_a'), edge('p', 'missing')]);
    expect(index.children.size).toBe(0);
    expect(index.outside).toEqual(['d']);
  });
});
