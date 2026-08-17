import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JsonLd, serializeJsonForHtml } from './json-ld';

const ATTACK = '</script><script data-owned="yes">alert(1)</script>&\u2028\u2029';

describe('JsonLd HTML 경계', () => {
  it('script 종료 문자열을 HTML로 내보내지 않으면서 JSON 의미를 보존한다', () => {
    const payload = { name: ATTACK };
    const html = renderToStaticMarkup(<JsonLd data={payload} />);

    expect(html.match(/<script/gu)).toHaveLength(1);
    expect(html).not.toContain('</script><script');
    expect(html).not.toContain('data-owned="yes"');

    const body = html.match(/<script type="application\/ld\+json">(.*)<\/script>/u)?.[1];
    expect(body).toBeDefined();
    expect(JSON.parse(body ?? '')).toEqual(payload);
  });

  it('HTML 민감 문자를 모두 JSON 유니코드 escape로 바꾼다', () => {
    const serialized = serializeJsonForHtml({ value: '<>&\u2028\u2029' });
    expect(serialized).toContain('\\u003c\\u003e\\u0026\\u2028\\u2029');
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/u);
  });

  it('JSON이 될 수 없는 루트 값은 빈 script로 숨기지 않는다', () => {
    expect(() => serializeJsonForHtml(undefined)).toThrow(/JSON-serializable/u);
  });
});
