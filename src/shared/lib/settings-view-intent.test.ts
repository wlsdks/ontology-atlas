import { describe, expect, it, vi } from 'vitest';

import { requestSettingsView, subscribeSettingsViewIntent } from './settings-view-intent';

describe('설정 서브뷰 요청', () => {
  it('요청한 자리 이름을 그대로 전달한다', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSettingsViewIntent((view) => seen.push(view));
    requestSettingsView('ai');
    unsubscribe();
    expect(seen).toEqual(['ai']);
  });

  it('해지 후에는 더 받지 않는다 — 언마운트된 표면이 시트를 열지 않게', () => {
    const handler = vi.fn();
    subscribeSettingsViewIntent(handler)();
    requestSettingsView('ai');
    expect(handler).not.toHaveBeenCalled();
  });
});
