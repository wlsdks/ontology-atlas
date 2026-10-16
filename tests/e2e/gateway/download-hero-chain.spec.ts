import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { HERO_TURN_MS } from "@/views/download/lib/hero-chain";

import { seedFirstRunSeen } from "../first-run-seed";
import { waitFrames } from "../settle";

type Chain = { nodes: { s: string; x: number; y: number }[] } | null;
interface EchoWindow {
  lit: () => number;
  count: number;
  chain: () => Chain;
}

const VAULT = path.join(process.cwd(), "docs", "ontology");
const FRAME_MS = 1000 / 60;
const BOUND_SHARE = 0.005;

function realChain(slugs: readonly string[]): boolean {
  const [element, capability, domain] = slugs.map((slug) => slug.split(":"));
  if (element?.[0] !== "element" || capability?.[0] !== "capability" || domain?.[0] !== "domain") return false;
  const file = readFileSync(path.join(VAULT, "capabilities", `${capability[1]}.md`), "utf8");
  const front = /^---\n([\s\S]*?)\n---/.exec(file)?.[1] ?? "";
  const elements = (/^elements:\s*\[(.*)\]/m.exec(front)?.[1] ?? "").split(",").map((s) => s.trim());
  return elements.includes(`elements/${element[1]}`) && /^domain:\s*(.*)$/m.exec(front)?.[1]?.trim() === `domains/${domain[1]}`;
}

async function installSteppedFrames(page: Page) {
  await page.addInitScript(() => {
    const realRaf = window.requestAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    let held = false;
    let now = 0;
    let seq = 0;
    let queue = new Map<number, FrameRequestCallback>();
    let pending = false;
    const flush = (t: number) => {
      const due = queue;
      queue = new Map();
      for (const callback of due.values()) callback(t);
    };
    performance.now = () => (held ? now : realNow());
    window.requestAnimationFrame = (callback) => {
      seq += 1;
      queue.set(seq, callback);
      if (!held && !pending) {
        pending = true;
        realRaf((t) => {
          pending = false;
          if (!held) flush(t);
        });
      }
      return seq;
    };
    window.cancelAnimationFrame = (id) => void queue.delete(id);
    (window as unknown as { __frames: unknown }).__frames = {
      hold: () => {
        held = true;
        now = realNow();
      },
      step: (ms: number) => {
        now += ms;
        flush(now);
      },
    };
  });
}

async function openHero(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion });
  await seedFirstRunSeen(page);
  await page.goto("/en/download/?e2e=1&guides=off", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const echo = (window as unknown as { __heroEcho?: EchoWindow }).__heroEcho;
    return Boolean(echo) && echo!.lit() >= echo!.count;
  });
}

const activeChain = (page: Page) =>
  page.evaluate(() => (window as unknown as { __heroEcho: EchoWindow }).__heroEcho.chain()?.nodes.map((n) => n.s) ?? null);

test.describe("download hero — one walked chain", () => {
  test("reduced motion holds one real chain with its caption, and nothing redraws", async ({ page }) => {
    await openHero(page, "reduce");
    await expect.poll(() => activeChain(page)).not.toBeNull();
    const chain = (await activeChain(page))!;
    expect(realChain(chain), `not a declared path: ${chain.join(" > ")}`).toBe(true);
    const caption = page.getByTestId("gateway-hero-caption");
    await expect(caption).toHaveAttribute("data-hero-caption-source", "chain");
    await expect(caption).not.toHaveText(/^\s*$/);
    const text = await caption.textContent();
    await waitFrames(page, 30);
    expect(await activeChain(page)).toEqual(chain);
    expect(await caption.textContent()).toBe(text);
  });

  test("every walk of a turn is a real path, and outside it 95% of 60 Hz frames change at most 0.5% of the viewport", async ({ page }) => {
    test.setTimeout(180_000);
    await installSteppedFrames(page);
    await openHero(page, "no-preference");
    const result = await page.evaluate(
      async ([turnMs, frameMs]) => {
        const frames = (window as unknown as { __frames: { hold: () => void; step: (ms: number) => void } }).__frames;
        const echo = (window as unknown as { __heroEcho: EchoWindow }).__heroEcho;
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="gateway-hero-object"] canvas')!;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const W = canvas.width;
        const H = canvas.height;
        const k = W / canvas.getBoundingClientRect().width;
        const R = 20 * k;
        const S = 12 * k;
        const chains = new Set<string>();
        const outside = (chain: Chain) => {
          const pts = chain?.nodes.map((n) => ({ x: n.x * k, y: n.y * k })) ?? [];
          return (x: number, y: number) => {
            for (const p of pts) if ((x - p.x) ** 2 + (y - p.y) ** 2 < R * R) return false;
            for (let i = 0; i + 1 < pts.length; i += 1) {
              const a = pts[i]!;
              const b = pts[i + 1]!;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
              if ((x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2 < S * S) return false;
            }
            return true;
          };
        };
        const value = (d: Uint8ClampedArray, i: number) => (d[i + 3]! * Math.max(d[i]!, d[i + 1]!, d[i + 2]!)) / 255;
        frames.hold();
        const changed: number[] = [];
        const total = Math.round(turnMs / frameMs);
        for (let f = 0; f < total; f += 1) {
          if (f % 60 === 0) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
          if (f % 12 !== 0) {
            frames.step(frameMs);
            continue;
          }
          const before = ctx.getImageData(0, 0, W, H).data;
          const was = echo.chain();
          frames.step(frameMs);
          const after = ctx.getImageData(0, 0, W, H).data;
          const is = echo.chain();
          for (const c of [was, is]) if (c) chains.add(c.nodes.map((n) => n.s).join(">"));
          const free = [outside(was), outside(is)];
          let count = 0;
          for (let y = 0; y < H; y += 1)
            for (let x = 0; x < W; x += 1) {
              const i = (y * W + x) * 4;
              if (Math.abs(value(after, i) - value(before, i)) > 8 && free[0]!(x, y) && free[1]!(x, y)) count += 1;
            }
          changed.push(count / (innerWidth * innerHeight * k * k));
          if (changed.length % 40 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        changed.sort((a, b) => a - b);
        return { p95: changed[Math.floor(changed.length * 0.95)]!, max: changed.at(-1)!, pairs: changed.length, chains: [...chains] };
      },
      [HERO_TURN_MS.plane, FRAME_MS] as const,
    );
    expect(result.pairs).toBeGreaterThan(200);
    expect(result.chains.length, "no chain was walked in a whole turn").toBeGreaterThan(3);
    expect(result.chains.filter((chain) => !realChain(chain.split(">")))).toEqual([]);
    expect(result.p95, `p95 ${(result.p95 * 100).toFixed(2)}%, max ${(result.max * 100).toFixed(2)}%`).toBeLessThanOrEqual(BOUND_SHARE);
  });
});
