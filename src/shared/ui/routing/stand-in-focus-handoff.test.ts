import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { installStandInFocusHandoff } from './stand-in-focus-handoff';

function mountStandIn() {
  document.body.innerHTML =
    '<div id="slot"><main id="main" tabindex="-1" data-route-loading="true"></main></div><button id="other">other</button>';
  return document.getElementById('main')!;
}

function replaceStandIn() {
  const page = document.createElement('main');
  page.id = 'main';
  document.getElementById('slot')!.replaceChildren(page);
  return page;
}

const mutationsDelivered = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('installStandInFocusHandoff', () => {
  beforeAll(() => installStandInFocusHandoff(document));
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('moves focus from a removed stand-in to the main that replaces it', async () => {
    mountStandIn().focus();
    const page = replaceStandIn();
    await mutationsDelivered();
    expect(document.activeElement).toBe(page);
  });

  it('leaves focus a person moved elsewhere before the swap', async () => {
    mountStandIn().focus();
    document.getElementById('other')!.focus();
    replaceStandIn();
    await mutationsDelivered();
    expect(document.activeElement?.id).toBe('other');
  });
});
