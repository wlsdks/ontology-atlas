import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUST_SOURCE = join(import.meta.dirname, '..', '..', 'src-tauri', 'src');
const BYTE_BUFFER = /Vec<u8>|\[u8\b/;
const WHY =
  'serde sends bytes as a JSON array with one number per byte (3.5x the file on the wire, ' +
  '25-35x in WebKit); return tauri::ipc::Response and read an ArrayBuffer instead';

function rustFiles(): { file: string; text: string }[] {
  return readdirSync(RUST_SOURCE, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.rs'))
    .map((file) => ({ file, text: readFileSync(join(RUST_SOURCE, file), 'utf8').replace(/\r\n/g, '\n') }));
}

describe('file bytes never cross IPC as JSON numbers', () => {
  it('no Tauri command takes or returns a serde byte buffer', () => {
    const command = /^#\[tauri::command(?:\(async\))?\]\n(?:pub(?:\(crate\))? )?(?:async )?fn (\w+)([^{]*)\{/gm;
    const offenders: string[] = [];
    let commands = 0;
    for (const { file, text } of rustFiles()) {
      for (const [, name, signature] of text.matchAll(command)) {
        commands += 1;
        if (BYTE_BUFFER.test(signature ?? '')) offenders.push(`${file}::${name}`);
      }
    }
    expect(commands, 'the command pattern matched nothing, so this gate proves nothing').toBeGreaterThan(50);
    expect(offenders, WHY).toEqual([]);
  });

  it('no serialized payload type holds a byte buffer', () => {
    const payload =
      /^#\[derive\([^)]*\bSerialize\b[^)]*\)\]\n(?:#\[[^\n]*\]\n)*(?:pub(?:\(crate\))? )?(?:struct|enum) (\w+)[^{;]*\{([\s\S]*?)^\}/gm;
    const offenders: string[] = [];
    let payloads = 0;
    for (const { file, text } of rustFiles()) {
      for (const [, name, body] of text.matchAll(payload)) {
        payloads += 1;
        if (BYTE_BUFFER.test(body ?? '')) offenders.push(`${file}::${name}`);
      }
    }
    expect(payloads, 'the payload pattern matched nothing, so this gate proves nothing').toBeGreaterThan(20);
    expect(offenders, WHY).toEqual([]);
  });
});
