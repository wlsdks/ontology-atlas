import { describe, it, expect } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Sample')).toBe('sample');
  });

  it('lowercases', () => {
    expect(slugify('IAM Admin')).toBe('iam-admin');
  });

  it('trims leading/trailing whitespace', () => {
    expect(slugify('  Reactor  ')).toBe('reactor');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('Demo     Studio')).toBe('demo-studio');
  });

  it('strips special characters', () => {
    expect(slugify('Sample!@#$')).toBe('sample');
  });

  it('preserves hyphens', () => {
    expect(slugify('pre-existing-slug')).toBe('pre-existing-slug');
  });

  it('preserves Korean characters', () => {
    expect(slugify('뉴스 클리핑')).toBe('뉴스-클리핑');
  });
});
