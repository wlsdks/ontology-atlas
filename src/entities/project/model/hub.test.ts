import { describe, expect, it } from 'vitest';
import { computeHubSlugs, isSharedNode } from './hub';
import type { Project } from './types';

function project(slug: string, isHub = false): Project {
  const now = new Date('2026-04-12T00:00:00Z');
  return {
    slug,
    name: slug,
    category: 'in-progress',
    status: 'idea',
    description: '',
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub,
    position: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

describe('computeHubSlugs', () => {
  it('returns only hub slugs', () => {
    expect(computeHubSlugs([project('iam', true), project('reactor', true), project('maps')])).toEqual([
      'iam',
      'reactor',
    ]);
  });
});

describe('isSharedNode', () => {
  it('returns true when two or more hub dependencies exist', () => {
    expect(isSharedNode(['iam', 'reactor', 'other'], ['iam', 'reactor'])).toBe(true);
  });

  it('returns false when fewer than two hub dependencies exist', () => {
    expect(isSharedNode(['iam'], ['iam', 'reactor'])).toBe(false);
  });
});
