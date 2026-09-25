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

  /*
   * ⚠️ **The door's own sentence is a third place that names the location** (2026-09-25). Both
   * catalogues still promised Documents on the card and on the launch chooser a month after the
   * folder moved to `~/Ontology Atlas` — the exact lie this file exists to prevent, told on the
   * button itself. The container name is derived from the label, and the protected folders are the
   * list above, so neither side of the check is a sentence pinned here.
   */
  it('문 문구도 같은 곳을 말한다 — 만드는 폴더를 이름으로 대고, 보호된 폴더는 대지 않는다', () => {
    const container = DEFAULT_VAULT_PARENT_LABEL.replace(/^~[/\\]/, '');
    const doors: string[] = [];
    const collect = (node: unknown, trail: string, locale: string, catalogue: Record<string, unknown>) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const at = trail ? `${trail}.${key}` : key;
        if (key === 'justStartBody' && typeof value === 'string') {
          doors.push(`${locale}:${at}`);
          expect(value, `${locale}:${at} 가 만드는 폴더(${container})를 말하지 않는다: ${value}`).toContain(container);
          for (const protectedDir of TCC_PROTECTED) {
            expect(value, `${locale}:${at} 가 만들지도 않는 ${protectedDir} 를 약속한다: ${value}`).not.toContain(protectedDir);
          }
        } else {
          collect(value, at, locale, catalogue);
        }
      }
    };
    for (const locale of ['en', 'ko']) {
      const catalogue = JSON.parse(readFileSync(join(REPO_ROOT, 'messages', `${locale}.json`), 'utf8')) as Record<string, unknown>;
      collect(catalogue, '', locale, catalogue);
    }
    // The card and the launch chooser, in both languages. Zero would mean the scan saw nothing.
    expect(doors.length, `검사한 문 문구: ${doors.join(', ')}`).toBeGreaterThanOrEqual(4);
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
