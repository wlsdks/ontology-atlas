import { describe, expect, it } from 'vitest';
import {
  getDeveloperActivityTargetSlugs,
  normalizeDeveloperActivityEvent,
} from './activity';

describe('developer activity event model', () => {
  it('normalizes minimal MCP events', () => {
    const event = normalizeDeveloperActivityEvent({
      source: 'mcp',
      kind: 'doc.created',
      title: '  ADR 추가  ',
      docSlug: 'superpowers/specs/new-adr',
    });

    expect(event?.title).toBe('ADR 추가');
    expect(event?.unread).toBe(true);
    expect(event?.id).toContain('mcp:doc.created:superpowers/specs/new-adr');
  });

  it('rejects empty titles', () => {
    expect(
      normalizeDeveloperActivityEvent({
        source: 'api',
        kind: 'doc.updated',
        title: ' ',
      }),
    ).toBeNull();
  });

  it('maps project targets to docs-vault project slugs', () => {
    const event = normalizeDeveloperActivityEvent({
      source: 'github',
      kind: 'github.push',
      title: 'Push',
      projectSlug: 'reactor',
    });

    expect(event ? getDeveloperActivityTargetSlugs(event) : []).toEqual([
      'reactor',
      'projects/reactor',
    ]);
  });

  it('keeps explicit target slugs for multi-file events', () => {
    const event = normalizeDeveloperActivityEvent({
      source: 'github',
      kind: 'github.push',
      title: 'Push',
      docSlug: 'ARCHITECTURE',
      targetSlugs: ['ARCHITECTURE', 'rules/naming'],
    });

    expect(event ? getDeveloperActivityTargetSlugs(event) : []).toEqual([
      'ARCHITECTURE',
      'rules/naming',
    ]);
  });
});
