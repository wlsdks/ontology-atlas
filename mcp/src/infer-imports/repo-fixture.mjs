import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function withRepo(setup) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-imports-'));
  setup(root);
  return root;
}
