import { describe, it, expect } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Aslan Maps')).toBe('aslan-maps');
  });

  it('lowercases', () => {
    expect(slugify('IAM Admin')).toBe('iam-admin');
  });

  it('trims leading/trailing whitespace', () => {
    expect(slugify('  Reactor  ')).toBe('reactor');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('Aslan     Studio')).toBe('aslan-studio');
  });

  it('strips special characters', () => {
    expect(slugify('Aslan Maps!@#$')).toBe('aslan-maps');
  });

  it('preserves hyphens', () => {
    expect(slugify('pre-existing-slug')).toBe('pre-existing-slug');
  });

  it('preserves Korean characters', () => {
    expect(slugify('뉴스 클리핑')).toBe('뉴스-클리핑');
  });
});
