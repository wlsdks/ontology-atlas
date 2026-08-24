import { describe, expect, it } from 'vitest';

import {
  PROJECT_VAULT_DIR,
  projectAlreadyHasVault,
  projectVaultLocation,
} from './project-vault-location';

/**
 * Owner, 2026-08-24: *"if someone picks a particular project, should our folder be created at that
 * project's root, rather than somewhere outside it?"* — and, on the name, *"can we not make a folder
 * called atlas? docs is used so much I think it would just get deleted."*
 *
 * What these tests hold is the part a person is asked to agree to: the path shown before anything is
 * created has to be the path that is created.
 */
describe('프로젝트 안의 지도 폴더 — 보여 준 경로가 곧 만들 경로다', () => {
  it('고른 프로젝트 바로 밑에 atlas 폴더를 잡는다', () => {
    const location = projectVaultLocation('/Users/dana/my-product');
    expect(location?.projectRoot).toBe('/Users/dana/my-product');
    expect(location?.vaultRoot).toBe('/Users/dana/my-product/atlas');
    // The screen shows this string and the create uses that path; they are the same value on purpose.
    expect(location?.displayPath).toBe(location?.vaultRoot);
  });

  it('끝에 붙은 구분자가 사람이 대조할 수 없는 경로를 만들지 않는다', () => {
    // `…/my-product//atlas` is the same folder, but it does not match what a shell prints, and a
    // path a person cannot match against their own terminal is not one they can check.
    expect(projectVaultLocation('/Users/dana/my-product/')?.vaultRoot).toBe(
      '/Users/dana/my-product/atlas',
    );
    expect(projectVaultLocation('/Users/dana/my-product///')?.vaultRoot).toBe(
      '/Users/dana/my-product/atlas',
    );
  });

  it('고른 프로젝트가 없으면 경로를 지어내지 않는다', () => {
    // ⚠️ Inventing a location here would put a real, creatable path in front of a person who chose
    // nothing — and a confirmation of something nobody picked is not a confirmation.
    for (const nothing of [null, undefined, '', '   ', '/']) {
      expect(projectVaultLocation(nothing), `「${String(nothing)}」에 경로를 지어냈다`).toBeNull();
    }
  });

  it('이름은 한 곳에서만 정해진다', () => {
    // Every surface that creates one reads this constant; a second literal is how two surfaces end
    // up disagreeing about where a person's map lives.
    expect(PROJECT_VAULT_DIR).toBe('atlas');
    expect(projectVaultLocation('/p')?.vaultRoot.endsWith(`/${PROJECT_VAULT_DIR}`)).toBe(true);
  });

  it('이미 있는 폴더를 알아본다 — 「새로 만든다」와 「이어서 쓴다」는 다른 말이다', () => {
    expect(projectAlreadyHasVault(['src', 'atlas', 'package.json'])).toBe(true);
    expect(projectAlreadyHasVault(['src', 'package.json'])).toBe(false);
    // Not a prefix match: a project of its own named `atlas-viewer` has no map in it.
    expect(projectAlreadyHasVault(['atlas-viewer', 'atlasrc'])).toBe(false);
  });
});
