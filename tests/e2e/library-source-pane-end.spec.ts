import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **Where the source pane ends** — slice S7's first proof.
 *
 * The pane is a document: it sizes itself to what it holds, and what sits below a short
 * source is the landing's own ground rather than an empty second panel. Half of that was
 * already true and this spec is what says so in numbers; the other half was missing and
 * this spec is why it is now there.
 *
 * Measured on the static export 2026-09-12, before anything changed:
 *
 * | state | 1512x901 | 1040x720 |
 * |---|---|---|
 * | un-cited DOCX | box 657px = content, 195px of ground below | box 657px, 14px below |
 * | un-cited XLSX | box 523px = content, 329px below | box 523px, 148px below |
 * | cited Markdown | box 777px, 75px below | box 777px in a 671px scroller, **0px** |
 *
 * No `min-height`, no `justify-content`, no `align-items` and no filler anywhere in the
 * chain from the pane to the shell, and the ground under every one of them painted
 * `--color-canvas` on `library-page` — the same ground the landing stands on. So the
 * earlier reading, "395px of empty **panel**", was wrong about what the empty space is.
 *
 * What was real is the last row of that table. `pt-8` opened the document and nothing
 * closed it, so on a cited source at the app's own window floor the last block ended
 * **flush with the bottom of the window**, at the scroll end, with nothing below it —
 * while `tests/e2e/scroll-end-gap.spec.ts` holds a 24px floor for every other surface and
 * `DocReadingPane` reserves its pill's clearance. This spec asserts the gutter at both
 * ends and the ground, so a later change cannot put filler in either.
 *
 * The second proof is the `sha256` row. All 64 characters plus the clause saying when the
 * value was measured ran to **two** 16px lines at both widths (84 characters against a
 * ~69-character mono line in a 456px cell), which made the one fixed-height block in this
 * pane change height depending on whether anything had ever cited the file. The middle is
 * elided now (`src/views/library/lib/elide-hash.ts`) and the whole value stays on the
 * cell's `title`; the assertion is the rendered line count, not the string.
 *
 * A text-only folder on purpose: the cited-Markdown state is the one that proves both
 * claims, it needs no workbook bytes, and the OPFS picker exercises the browser's own
 * File System Access path end to end.
 */

const SOURCE = [
  "# Settlement Policy",
  "",
  "## Scope",
  "",
  "This policy covers how a completed order becomes money in a merchant's account.",
  "It applies to card payments and bank transfers. Cash on delivery is out of scope",
  "and handled by the logistics contract instead.",
  "",
  "## Settlement cycle",
  "",
  "Card payments settle on T+2 business days. Bank transfers settle same day when",
  "the transfer clears before 15:00 KST, and on the next business day otherwise.",
  "",
  "## Holdback",
  "",
  "A merchant in their first 90 days carries a 10% holdback. The holdback is",
  "released 30 days after the 90-day period ends, provided the chargeback rate",
  "stayed below 1%.",
  "",
  "## Reversal",
  "",
  "A refund issued before settlement is netted against that settlement. A refund",
  "issued after settlement becomes a debit on the next cycle.",
  "",
].join("\n");

const VAULT: Record<string, string> = {
  "sources/settlement-policy.md": SOURCE,
  "wiki/settlement.md": [
    "---",
    "title: Settlement",
    "created_by: agent:claude",
    "compiled_at: 2026-09-11T04:20:00Z",
    "sources:",
    "  - sources/settlement-policy.md",
    "source_hash:",
    `  sources/settlement-policy.md: ${"0".repeat(64)}`,
    "status: draft",
    "summary: How a completed order becomes money in a merchant's account.",
    "---",
    "",
    "## Summary",
    "",
    "Settlement turns a completed order into money in a merchant's account.",
    "",
    "## Facts",
    "",
    "- Card payments settle on T+2 business days. [[src:sources/settlement-policy.md#l11]]",
    "- A holdback stands for the first ninety days. [[src:sources/settlement-policy.md#l16]]",
    "",
    "## Decisions",
    "",
    "- Cash on delivery is out of scope. [[src:sources/settlement-policy.md#l6]]",
    "",
    "## Open questions",
    "",
    "- How long a carried balance may stand.",
    "",
    "## Not in sources",
    "",
    "- Nothing.",
    "",
  ].join("\n"),
};

/** The gutter `pt-8` opens the document with, and therefore the one that must close it. */
const GUTTER = 32;

/**
 * What the pane reports about its own end.
 *
 * `lastBlockBottom` is the last of the pane's own top-level blocks, not the box: the
 * difference between the two **is** the gutter, and measuring only the box would pass a
 * pane that had grown filler.
 */
const PANE_END = `(() => {
  const pane = document.querySelector('[data-testid="library-source-summary"]');
  if (!pane) return null;
  let scroller = pane.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!scroller) return null;
  const chain = [];
  let node = pane;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    chain.push({
      id: node.getAttribute('data-testid') ?? node.tagName.toLowerCase(),
      minHeight: style.minHeight,
      justify: style.justifyContent,
      align: style.alignItems,
    });
    node = node.parentElement;
  }
  const blocks = [...pane.children].map((block) => Math.round(block.getBoundingClientRect().bottom));
  const paneRect = pane.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const groundY = Math.min(Math.round(scrollerRect.bottom - 6), window.innerHeight - 6);
  const ground = document.elementFromPoint(Math.round(scrollerRect.x + scrollerRect.width / 2), groundY);
  const paintedGround = (() => {
    let node = ground;
    while (node) {
      const colour = getComputedStyle(node).backgroundColor;
      if (colour && colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') {
        return { colour, on: node.getAttribute('data-testid') ?? node.tagName.toLowerCase() };
      }
      node = node.parentElement;
    }
    return { colour: 'none', on: 'none' };
  })();
  const hashCell = [...pane.querySelectorAll('dl > div')]
    .map((row) => ({ dt: row.querySelector('dt'), dd: row.querySelector('dd') }))
    .filter((row) => row.dt && row.dd)
    .map((row) => ({
      label: (row.dt.textContent ?? '').trim(),
      text: (row.dd.textContent ?? '').trim(),
      title: row.dd.getAttribute('title'),
      lines: Math.round(row.dd.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(row.dd).lineHeight)),
    }))
    .find((row) => row.label.toLowerCase() === 'sha256');
  return {
    blocks: blocks.length,
    lastBlockBottom: Math.max(...blocks),
    paneBottom: Math.round(paneRect.bottom),
    paneHeight: Math.round(paneRect.height),
    scrollEnd: Math.round(scrollerRect.bottom),
    scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
    chain,
    paintedGround,
    canvas: getComputedStyle(document.querySelector('[data-testid="library-page"]')).backgroundColor,
    hashCell,
  };
})()`;

interface PaneEnd {
  blocks: number;
  lastBlockBottom: number;
  paneBottom: number;
  paneHeight: number;
  scrollEnd: number;
  scrolls: boolean;
  chain: { id: string; minHeight: string; justify: string; align: string }[];
  paintedGround: { colour: string; on: string };
  canvas: string;
  hashCell?: { label: string; text: string; title: string | null; lines: number };
}

for (const [width, height] of [
  [1512, 901],
  [1040, 720],
] as const) {
  test(`원본 창은 내용이 끝나는 자리에서 한 여백 뒤에 끝난다 (${width}x${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, VAULT);
    await page.goto("/en/library/?guides=off", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Open my folder/ }).first().click();
    await page.getByTestId("library-sources").waitFor({ timeout: 30_000 });

    // The cited state, reached the way a reader reaches it: a citation on the page.
    await page.getByTestId("library-index-segment-wiki").click();
    await page.getByTestId("library-wiki-wiki/settlement").click();
    const citation = page
      .locator('button[data-source-path="sources/settlement-policy.md"][data-source-anchor="l11"]')
      .first();
    await citation.click({ timeout: 30_000 });
    await expect(page.getByTestId("library-source-summary")).toBeVisible({ timeout: 25_000 });
    // The passage read is what supplies the measured hash, which is the long value.
    await expect(page.getByTestId("library-source-passage")).toHaveAttribute("data-state", "resolved", {
      timeout: 25_000,
    });

    const measured = (await page.evaluate(PANE_END)) as PaneEnd | null;
    expect(measured, "원본 창을 재지 못했다").not.toBeNull();
    const pane = measured!;

    // ── The pane is a document: nothing between it and the shell stretches or centres it.
    for (const link of pane.chain) {
      expect(link.minHeight, `${link.id} 가 최소 높이를 들고 있다`).toMatch(/^(0px|auto)$/);
      expect(link.justify, `${link.id} 가 내용을 세로로 가운데 둔다`).toBe("normal");
      expect(link.align, `${link.id} 가 내용을 가로로 가운데 둔다`).toBe("normal");
    }

    // ── The last block sits one gutter inside the pane's end — a gutter, never filler.
    expect(pane.blocks, "창의 블록을 충분히 재지 못했다").toBeGreaterThan(3);
    expect(
      pane.paneBottom - pane.lastBlockBottom,
      `마지막 블록과 창 끝 사이: ${pane.paneBottom - pane.lastBlockBottom}px`,
    ).toBe(GUTTER);

    /*
     * ⚠️ The defect this number is here for: at 1040x720 this content is taller than its
     * scroller, and before 2026-09-12 the last block ended at y=720 — flush with the
     * bottom of the window at the scroll end, 0px of clearance.
     */
    expect(
      pane.scrollEnd - pane.lastBlockBottom,
      `스크롤 끝에서 마지막 블록이 창 바닥에 붙었다 (${pane.lastBlockBottom} / ${pane.scrollEnd})`,
    ).toBeGreaterThanOrEqual(GUTTER);

    // ── The ground below is the landing's ground, not a second panel.
    expect(pane.paintedGround.colour, "창 아래 바닥이 캔버스가 아니다").toBe(pane.canvas);
    expect(pane.paintedGround.on, "창 아래에 다른 판이 깔렸다").toBe("library-page");

    // ── The sha256 row is one line, and the whole value is still on the cell.
    expect(pane.hashCell, "sha256 줄을 못 찾았다").toBeTruthy();
    expect(pane.hashCell!.lines, `sha256 줄 수: ${pane.hashCell!.text}`).toBe(1);
    expect(pane.hashCell!.text, "해시가 줄임 없이 통째로 들어갔다").toContain("…");
    expect(pane.hashCell!.title, "전체 해시가 셀에서 사라졌다").toHaveLength(64);
    expect(pane.hashCell!.title, "제목이 실제 값이 아니다").toMatch(/^[0-9a-f]{64}$/);
  });
}
