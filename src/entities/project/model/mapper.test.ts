import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { fromFirestore, projectToInput, toFirestore } from './mapper';
import type { Project } from './types';

describe('fromFirestore', () => {
  it('converts full Firestore document to Project', () => {
    const now = new Date('2026-04-12T12:00:00Z');
    const ts = Timestamp.fromDate(now);

    const result = fromFirestore('aslan-maps', {
      name: 'Narnia',
      nameEn: 'Narnia',
      category: 'in-progress',
      status: 'developing',
      description: '지도 프로젝트',
      detail: '# 상세',
      tags: ['AI'],
      stack: ['Next.js'],
      links: [{ label: 'GitHub', url: 'https://github.com/aslan' }],
      dependencies: ['iam'],
      owner: '진안',
      icon: '🗺️',
      screenshots: ['url1'],
      timeline: { startedAt: ts, launchedAt: ts },
      progress: 50,
      isHub: false,
      position: { x: 100, y: 200 },
      createdAt: ts,
      updatedAt: ts,
    });

    expect(result.slug).toBe('aslan-maps');
    expect(result.name).toBe('Narnia');
    expect(result.category).toBe('in-progress');
    expect(result.isHub).toBe(false);
    expect(result.position).toEqual({ x: 100, y: 200 });
    expect(result.timeline.startedAt).toEqual(now);
    expect(result.createdAt).toEqual(now);
  });

  it('applies safe defaults for missing fields', () => {
    const result = fromFirestore('minimal', {});

    expect(result.slug).toBe('minimal');
    expect(result.name).toBe('');
    expect(result.category).toBe('in-progress');
    expect(result.status).toBe('idea');
    expect(result.tags).toEqual([]);
    expect(result.stack).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.screenshots).toEqual([]);
    expect(result.isHub).toBe(false);
    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it('coerces isHub from truthy/falsy values', () => {
    expect(fromFirestore('a', { isHub: true }).isHub).toBe(true);
    expect(fromFirestore('a', { isHub: 'yes' }).isHub).toBe(true);
    expect(fromFirestore('a', { isHub: 0 }).isHub).toBe(false);
    expect(fromFirestore('a', {}).isHub).toBe(false);
  });
});

describe('toFirestore', () => {
  const base: Omit<Project, 'slug' | 'createdAt' | 'updatedAt'> = {
    name: 'Test',
    category: 'in-progress',
    status: 'developing',
    description: 'desc',
    tags: ['a'],
    stack: ['next'],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
  };

  it('serializes required fields', () => {
    const result = toFirestore(base);

    expect(result.name).toBe('Test');
    expect(result.category).toBe('in-progress');
    expect(result.tags).toEqual(['a']);
    expect(result.position).toEqual({ x: 0, y: 0 });
  });

  it('omits undefined optional fields', () => {
    const result = toFirestore(base);

    expect(result).not.toHaveProperty('nameEn');
    expect(result).not.toHaveProperty('detail');
    expect(result).not.toHaveProperty('owner');
    expect(result).not.toHaveProperty('icon');
    expect(result).not.toHaveProperty('progress');
  });

  it('includes defined optional fields', () => {
    const result = toFirestore({
      ...base,
      nameEn: 'Test EN',
      detail: 'markdown',
      owner: '진안',
      icon: '🗺️',
      progress: 75,
    });

    expect(result.nameEn).toBe('Test EN');
    expect(result.detail).toBe('markdown');
    expect(result.owner).toBe('진안');
    expect(result.icon).toBe('🗺️');
    expect(result.progress).toBe(75);
  });

  it('normalizes timeline undefined to null', () => {
    const result = toFirestore(base);

    expect(result.timeline).toEqual({ startedAt: null, launchedAt: null });
  });
});

describe('projectToInput', () => {
  it('strips timestamps and preserves editable fields', () => {
    const now = new Date('2026-04-12T12:00:00Z');
    const project: Project = {
      slug: 'aslan-maps',
      name: 'Narnia',
      nameEn: 'Narnia',
      category: 'planned',
      status: 'idea',
      description: '지도 프로젝트',
      detail: '# 상세',
      tags: ['AI'],
      stack: ['Next.js'],
      links: [{ label: 'GitHub', url: 'https://github.com/aslan' }],
      dependencies: ['iam'],
      owner: '진안',
      icon: '🗺️',
      screenshots: ['url1'],
      timeline: { startedAt: now, launchedAt: now },
      progress: 50,
      isHub: false,
      position: { x: 100, y: 200 },
      createdAt: now,
      updatedAt: now,
    };

    expect(projectToInput(project)).toEqual({
      slug: 'aslan-maps',
      name: 'Narnia',
      nameEn: 'Narnia',
      category: 'planned',
      status: 'idea',
      description: '지도 프로젝트',
      detail: '# 상세',
      tags: ['AI'],
      stack: ['Next.js'],
      links: [{ label: 'GitHub', url: 'https://github.com/aslan' }],
      dependencies: ['iam'],
      owner: '진안',
      icon: '🗺️',
      screenshots: ['url1'],
      timeline: { startedAt: now, launchedAt: now },
      progress: 50,
      isHub: false,
      position: { x: 100, y: 200 },
    });
  });
});
