import { describe, expect, it, vi } from 'vitest';

import { resolvePickedVaultFolder } from './resolve-picked-vault-folder';

/**
 * Owner, 2026-08-24: *"so now, whether inside the project or outside it, if there is an atlas folder
 * we read it and draw the ontology?"* — asked about a hole the "map lives inside the project"
 * decision had just opened, and which nothing yet covered.
 *
 * These tests hold both halves of the answer: the map inside a project is found, and a folder that
 * merely shares the name never quietly replaces what the person actually picked.
 */
describe('고른 폴더 안의 지도 찾기 — 사람은 프로젝트를 고르고, 지도를 보길 기대한다', () => {
  const vaultInside = (names: Record<string, string[]>) =>
    vi.fn(async (path: string) => names[path] ?? null);

  it('프로젝트를 골랐는데 안에 지도가 있으면 그 지도를 연다', async () => {
    const read = vaultInside({ '/Users/dana/my-product/atlas': ['orders.md', 'billing.md'] });
    const result = await resolvePickedVaultFolder('/Users/dana/my-product', read);

    expect(result.rootPath).toBe('/Users/dana/my-product/atlas');
    // ⚠️ Never silent. Opening a different folder from the one a person chose is only acceptable
    // while the screen says so.
    expect(result.redirected, '말없이 딴 폴더를 열면 제품이 시킨 대로 안 한 것이다').toBe(true);
  });

  it('지도가 없으면 고른 폴더를 그대로 연다', async () => {
    const read = vaultInside({});
    const result = await resolvePickedVaultFolder('/Users/dana/plain-vault', read);
    expect(result.rootPath).toBe('/Users/dana/plain-vault');
    expect(result.redirected).toBe(false);
  });

  /*
   * The narrow half of the rule. A project with its own `atlas/` source module would otherwise open
   * an empty vault — the person sees nothing and has no idea why, which is worse than the failure
   * this whole function exists to fix.
   */
  it('이름만 같은 폴더로는 방향을 틀지 않는다 — 마크다운이 있어야 지도다', async () => {
    const read = vaultInside({ '/Users/dana/my-product/atlas': ['index.ts', 'render.ts'] });
    const result = await resolvePickedVaultFolder('/Users/dana/my-product', read);
    expect(result.rootPath, '소스 폴더를 금고로 열면 텅 빈 지도가 뜬다').toBe(
      '/Users/dana/my-product',
    );
    expect(result.redirected).toBe(false);
  });

  it('빈 atlas 폴더도 지도가 아니다', async () => {
    const read = vaultInside({ '/Users/dana/my-product/atlas': [] });
    const result = await resolvePickedVaultFolder('/Users/dana/my-product', read);
    expect(result.redirected).toBe(false);
  });

  it('이미 지도를 직접 골랐으면 건드리지 않는다', async () => {
    // The picked folder is the vault; there is no `atlas` inside it, so nothing moves.
    const read = vaultInside({});
    const result = await resolvePickedVaultFolder('/Users/dana/my-product/atlas', read);
    expect(result.rootPath).toBe('/Users/dana/my-product/atlas');
    expect(result.redirected).toBe(false);
  });

  it('읽을 수 없는 폴더는 오류가 아니라 「그대로 연다」이다', async () => {
    const read = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const result = await resolvePickedVaultFolder('/Users/dana/my-product', read);
    expect(result.rootPath).toBe('/Users/dana/my-product');
    expect(result.redirected).toBe(false);
  });

  it('끝에 붙은 구분자가 경로를 망가뜨리지 않는다', async () => {
    const read = vaultInside({ '/Users/dana/my-product/atlas': ['a.md'] });
    const result = await resolvePickedVaultFolder('/Users/dana/my-product/', read);
    expect(result.rootPath).toBe('/Users/dana/my-product/atlas');
  });
});
