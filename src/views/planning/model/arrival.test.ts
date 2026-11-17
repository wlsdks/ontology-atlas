import { describe, expect, it } from 'vitest';
import { planningArrival } from './arrival';

describe('planningArrival', () => {
  it('opens the home folder when the loaded ontology folder already holds one', () => {
    expect(planningArrival({ selection: null, nativeAvailable: false, vault: 'loaded', home: 'present' })).toBe('open-home');
  });

  it('offers to create the home folder when the loaded ontology folder has none', () => {
    expect(planningArrival({ selection: null, nativeAvailable: true, vault: 'loaded', home: 'absent' })).toBe('create-home');
  });

  it('keeps the picker door and the unsupported stage when no ontology folder is open', () => {
    expect(planningArrival({ selection: null, nativeAvailable: true, vault: 'none', home: 'unknown' })).toBe('picker');
    expect(planningArrival({ selection: null, nativeAvailable: false, vault: 'none', home: 'unknown' })).toBe('unsupported');
  });

  it('keeps a picked folder in memory over the home folder', () => {
    expect(planningArrival({ selection: 'picked', nativeAvailable: true, vault: 'loaded', home: 'present' })).toBe('workbench');
  });
});
