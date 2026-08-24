import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_VAULT_PARENT_LABEL } from '@/features/docs-vault-local/lib/default-vault-naming';

/**
 * "Just start" builds its path in **two places that cannot share code**: Rust knows `$HOME` and
 * creates the folder, TypeScript writes the label the person reads. Nothing but agreement keeps them
 * describing the same location, and a label naming a folder the app did not create is a lie told at
 * the exact moment somebody is deciding whether to trust the product with their disk.
 *
 * ⚠️ The folder must also stay **out of the directories macOS protects with TCC**. It used to be
 * `~/Documents/Ontology Atlas`; Documents is protected, so the button whose whole promise is "no
 * decisions, just begin" made a system permission dialog the first thing a new person saw, before
 * any map existed to justify it.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const TCC_PROTECTED = ['Documents', 'Desktop', 'Downloads', 'Movies', 'Music', 'Pictures'];

function rustParentDirBody(): string {
  const source = readFileSync(join(REPO_ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const match = source.match(/fn default_vault_parent_dir\(home: &str\) -> PathBuf \{([\s\S]*?)\n\}/);
  if (!match) throw new Error('default_vault_parent_dir not found in src-tauri/src/lib.rs');
  return match[1];
}

describe('그냥 시작하기의 금고 위치 — 두 쪽이 같은 곳을 말해야 한다', () => {
  it('러스트가 만드는 폴더와 화면이 읽어 주는 이름이 같다', () => {
    const body = rustParentDirBody();
    // The label is `~/<container>`; the Rust side joins the same container onto $HOME.
    const container = DEFAULT_VAULT_PARENT_LABEL.replace(/^~[/\\]/, '');
    expect(container, '라벨이 홈 밑의 한 폴더를 가리키지 않는다').not.toContain('/');
    expect(
      body.includes(`join("${container}")`),
      `화면은 「${DEFAULT_VAULT_PARENT_LABEL}」이라 말하는데 러스트는 다른 곳을 만든다: ${body.trim()}`,
    ).toBe(true);
  });

  it('macOS 가 보호하는 폴더 안에 만들지 않는다', () => {
    const body = rustParentDirBody();
    for (const protectedDir of TCC_PROTECTED) {
      expect(
        body.includes(`join("${protectedDir}")`),
        `「결정 없이 시작」이 ${protectedDir} 를 건드리면 첫 화면이 권한 대화상자가 된다`,
      ).toBe(false);
      expect(DEFAULT_VAULT_PARENT_LABEL.split(/[/\\]/)).not.toContain(protectedDir);
    }
  });
});
