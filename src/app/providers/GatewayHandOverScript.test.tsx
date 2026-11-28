import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GatewayHandOverScript } from './GatewayHandOverScript';

const markup = renderToStaticMarkup(<GatewayHandOverScript />);
const script = markup.replace(/^<script>/, '').replace(/<\/script>$/, '');

function replacedBy(pathname: string, isTauri = false): string[] {
  const replaced: string[] = [];
  vm.runInNewContext(script, {
    location: { pathname, replace: (to: string) => replaced.push(to) },
    window: isTauri ? { isTauri: true } : {},
  });
  return replaced;
}

describe('the hand over to the download page', () => {
  it('sends a plain browser at a language root on, and leaves the installed app and other pages', () => {
    expect(replacedBy('/ko/')).toEqual(['/ko/download/']);
    expect(replacedBy('/base/ko')).toEqual(['/base/ko/download/']);
    expect(replacedBy('/ko/', true)).toEqual([]);
    expect(replacedBy('/ko/topology/')).toEqual([]);
  });

  it('keeps the redirect on this site when the path begins with two slashes', () => {
    expect(replacedBy('//evil.example/ko/')).toEqual(['/evil.example/ko/download/']);
  });
});
