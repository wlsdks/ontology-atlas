import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, 'app');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolute] : [];
  });
}

describe('HTML 안의 JSON-LD는 script 경계를 데이터가 닫지 못한다', () => {
  it('모든 app JSON-LD가 중앙 JsonLd 경계를 거친다', () => {
    const sources = tsxFiles(APP_ROOT).map((file) => ({
      file,
      source: readFileSync(file, 'utf8'),
    }));
    const directScripts = sources.filter(({ source }) => source.includes('application/ld+json'));
    const consumers = sources.filter(({ source }) => /<JsonLd(?:\s|>)/u.test(source));

    expect(consumers.length, '검사가 빈 app 표면에서 조용히 통과하면 안 된다').toBeGreaterThan(0);
    expect(
      directScripts.map(({ file }) => relative(ROOT, file)),
      'app은 raw JSON-LD script를 직접 소유하지 않는다',
    ).toEqual([]);
    for (const { file, source } of consumers) {
      const label = relative(ROOT, file);
      expect(source, `${label}: raw script 삽입을 다시 만들지 않는다`).not.toContain(
        'dangerouslySetInnerHTML',
      );
      expect(source, `${label}: escape가 한 곳에 남도록 JsonLd를 쓴다`).toMatch(
        /<JsonLd(?:\s|>)/u,
      );
    }
  });
});
