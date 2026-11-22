import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_DOWNLOAD_HOSTS } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { OUTBOUND_PATHS } from '@/widgets/app-settings-menu/model/outbound-paths';

const DOWNLOAD_SOURCE = join(process.cwd(), 'src-tauri/src/llm/embed/builtin/download.rs');

/** The string literals of `MODEL_DOWNLOAD_HOSTS` in the Rust download, the list its redirect check reads. */
function rustDownloadHosts(): string[] | null {
  const declaration = /\bMODEL_DOWNLOAD_HOSTS\s*:\s*(?:&\s*)?\[[^\]]*\]\s*=\s*&?\s*\[([^\]]*)\]/u.exec(readFileSync(DOWNLOAD_SOURCE, 'utf8'));
  return declaration ? [...declaration[1]!.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!) : null;
}

describe('the hosts the built-in model downloads from', () => {
  it('are named the same in the Rust download, the Settings outbound row and the setup dialog', () => {
    const outbound = OUTBOUND_PATHS.find((path) => path.id === 'vector-model');
    expect(rustDownloadHosts(), 'MODEL_DOWNLOAD_HOSTS in download.rs').toEqual([...MODEL_DOWNLOAD_HOSTS]);
    expect(outbound?.hosts).toEqual([...MODEL_DOWNLOAD_HOSTS]);
  });
});
