import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JsonLd, serializeJsonForHtml } from './json-ld';

const ATTACK = '</script><script data-owned="yes">alert(1)</script>&\u2028\u2029';

describe('JsonLd HTML boundary', () => {
  it('keeps the JSON value while never emitting a script end tag into HTML', () => {
    const payload = { name: ATTACK };
    const html = renderToStaticMarkup(<JsonLd data={payload} />);

    expect(html.match(/<script/gu)).toHaveLength(1);
    expect(html).not.toContain('</script><script');
    expect(html).not.toContain('data-owned="yes"');

    const body = html.match(/<script type="application\/ld\+json">(.*)<\/script>/u)?.[1];
    expect(body).toBeDefined();
    expect(JSON.parse(body ?? '')).toEqual(payload);
  });

  it('escapes every HTML-sensitive character as a JSON unicode escape', () => {
    const serialized = serializeJsonForHtml({ value: '<>&\u2028\u2029' });
    expect(serialized).toContain('\\u003c\\u003e\\u0026\\u2028\\u2029');
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/u);
  });

  it('throws on a root value that cannot become JSON instead of emitting an empty script', () => {
    expect(() => serializeJsonForHtml(undefined)).toThrow(/JSON-serializable/u);
  });
});
