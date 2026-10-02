import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('registers every native command invoked by the model transport bridge', () => {
  const root = join(import.meta.dirname, '..', '..');
  const bridge = readFileSync(join(root, 'src/shared/lib/tauri-llm.ts'), 'utf8');
  const commands = [...bridge.matchAll(/invoke(?:<[^>]+>)?\('(llm_chat[^']*)'/g)].map((match) => match[1]);
  const native = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const handlers = native.split('generate_handler![')[1]?.split('])')[0] ?? '';
  expect(commands.length).toBeGreaterThan(0);
  for (const command of commands) expect(handlers, command).toMatch(new RegExp(`\\b(?:\\w+::)*${command}\\s*,`));
});
