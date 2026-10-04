import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function readSkillProcedure(filePath: string): string {
  const entry = readFileSync(filePath, 'utf8');
  const reference = entry.match(/\[(?:shared workflow|shared phase procedure)\]\(([^)]+)\)/)?.[1];
  return reference
    ? readFileSync(resolve(dirname(filePath), reference), 'utf8')
    : entry;
}
