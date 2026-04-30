import { beforeEach, describe, expect, it } from 'vitest';
import type { DeveloperActivityEvent } from '@/entities/docs-vault';
import {
  acknowledgeDeveloperActivityEvent,
  readDeveloperActivityEvents,
  restoreDeveloperActivityEvent,
} from './activity-store';

const STORAGE_KEY = 'aslan:docs-vault:developer-activity:v1';

function event(overrides: Partial<DeveloperActivityEvent> = {}) {
  return {
    id: overrides.id ?? 'evt-1',
    source: overrides.source ?? 'github',
    kind: overrides.kind ?? 'github.push',
    title: overrides.title ?? 'agent docs sync',
    createdAt: overrides.createdAt ?? '2026-04-24T10:30:00.000Z',
    unread: overrides.unread ?? true,
    docSlug: overrides.docSlug ?? 'projects/aslan-ingest',
    ...overrides,
  } satisfies DeveloperActivityEvent;
}

describe('developer activity store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores an acknowledged event back to unread', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([event()]));

    acknowledgeDeveloperActivityEvent('evt-1');
    expect(readDeveloperActivityEvents()[0]?.unread).toBe(false);

    restoreDeveloperActivityEvent('evt-1');

    expect(readDeveloperActivityEvents()[0]?.unread).toBe(true);
  });
});
