import { describe, expect, it } from 'vitest';

import type { McpInstallLinkResult } from '@/shared/lib/connectors/mcp-install-link';

import { installLinkNotice } from './install-link-notice';

const ok: McpInstallLinkResult = { ok: true, droppedValues: [] };

describe('installLinkNotice', () => {
  it('says nothing when there is no link', () => {
    expect(installLinkNotice(null)).toBeNull();
  });

  it('says nothing for a link that carried no value to drop', () => {
    expect(installLinkNotice(ok)).toBeNull();
  });

  it('names the variables whose values were dropped', () => {
    expect(installLinkNotice({ ...ok, droppedValues: ['NOTION_TOKEN'] })).toEqual({
      kind: 'dropped',
      keys: ['NOTION_TOKEN'],
    });
  });

  it('gives the reason a link was refused, defaulting to unreadable', () => {
    expect(
      installLinkNotice({ ok: false, droppedValues: [], problem: 'config-unreadable' }),
    ).toEqual({ kind: 'refused', problem: 'config-unreadable' });
    expect(installLinkNotice({ ok: false, droppedValues: [] })).toEqual({
      kind: 'refused',
      problem: 'config-unreadable',
    });
  });

  it('prefers a refusal over dropped values', () => {
    const notice = installLinkNotice({
      ok: false,
      droppedValues: ['X'],
      problem: 'config-unreadable',
    });
    expect(notice?.kind).toBe('refused');
  });
});
