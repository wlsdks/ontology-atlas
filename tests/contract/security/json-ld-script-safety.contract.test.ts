import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
/** Where a screen or the document renders JSON-LD; the shared boundary component itself is not one of them. */
const APP_ROOTS = [join(ROOT, 'src', 'app'), join(ROOT, 'src', 'views')];

/** The document writes its boot script, loading picture and page record as raw markup, and never JSON-LD that way. */
const WRITES_OTHER_RAW_MARKUP = new Set(['src/app/document/SiteDocument.tsx']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolute] : [];
  });
}

describe('JSON-LD in HTML: data cannot close the script boundary', () => {
  it('every app JSON-LD goes through the central JsonLd boundary', () => {
    const sources = APP_ROOTS.flatMap(tsxFiles).map((file) => ({
      file,
      source: readFileSync(file, 'utf8'),
    }));
    const directScripts = sources.filter(({ source }) => source.includes('application/ld+json'));
    const consumers = sources.filter(({ source }) => /<JsonLd(?:\s|>)/u.test(source));

    expect(consumers.length, 'the check must not pass quietly over an empty app surface').toBeGreaterThan(0);
    expect(
      directScripts.map(({ file }) => relative(ROOT, file)),
      'app does not own a raw JSON-LD script directly',
    ).toEqual([]);
    for (const { file, source } of consumers) {
      const label = relative(ROOT, file);
      if (!WRITES_OTHER_RAW_MARKUP.has(label)) {
        expect(source, `${label}: do not rebuild raw script insertion`).not.toContain('dangerouslySetInnerHTML');
      }
      expect(source, `${label}: use JsonLd so the escape stays in one place`).toMatch(
        /<JsonLd(?:\s|>)/u,
      );
    }
  });
});
