import { expect, test, type CDPSession } from '@playwright/test';

const PROBES = [
  { lang: 'ja', text: 'Atlas 0123', expectPretendard: true },
  { lang: 'ja', text: 'ひらがなカタカナ', expectPretendard: false },
  { lang: 'ja', text: '接続地図検索', expectPretendard: false },
  { lang: 'zh-Hans', text: 'Atlas 0123', expectPretendard: true },
  { lang: 'zh-Hans', text: '连接地图检索', expectPretendard: false },
] as const;

async function platformFonts(cdp: CDPSession, selector: string): Promise<string[]> {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((font) => font.familyName);
}

test.describe('CJK font fallback', () => {
  for (const probe of PROBES) {
    test(`${probe.lang}: "${probe.text}" ${probe.expectPretendard ? 'keeps' : 'leaves'} Pretendard`, async ({ page }) => {
      await page.goto('/en/');
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      await page.evaluate(
        ({ lang, text }) => {
          document.documentElement.lang = lang;
          const el = document.createElement('p');
          el.id = 'cjk-probe';
          el.style.transition = 'none';
          el.textContent = text;
          document.body.append(el);
        },
        { lang: probe.lang, text: probe.text },
      );
      const faces = async () => {
        await page.evaluate(() => document.fonts.ready);
        return (await platformFonts(cdp, '#cjk-probe')).join(', ');
      };
      if (probe.expectPretendard) {
        await expect.poll(faces).toMatch(/pretendard/i);
      } else {
        await expect.poll(faces).not.toMatch(/pretendard/i);
        expect(await faces()).not.toBe('');
      }
    });
  }
});
