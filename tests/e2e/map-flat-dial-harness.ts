import type { Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForMapStill } from "./settle";
import type { DialProbe } from "../../src/widgets/ontology-map/dial/types";

export type Vault = "storefront" | "dogfood" | "synth 2,000" | "synth 10,000" | "layered 10,000";

export const QUERY: Record<Vault, string> = {
  storefront: "",
  dogfood: "",
  "synth 2,000": "synth=2000&synthDeps=1&",
  "synth 10,000": "synth=10000&synthDeps=1&",
  "layered 10,000": "synth=10000&synthDeps=1&synthShape=layered&",
};

export const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1040, height: 720 },
] as const;

export const ORDERS = "domain:order";

export async function openDial(page: Page, vault: Vault, size: { width: number; height: number }, extra = "") {
  await page.setViewportSize(size);
  await seedFirstRunSeen(page);
  await page.addInitScript((dogfood) => {
    if (dogfood) window.localStorage.setItem("demo:sample-source:v1", "dogfood");
  }, vault === "dogfood");
  await page.goto(`/en/topology/?${QUERY[vault]}${extra}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page, { timeout: 90_000 });
  await waitForDial(page);
}

async function waitForDial(page: Page) {
  await page.waitForFunction(
    () => {
      const dial = window.__atlasMap?.dial?.();
      return !!dial && dial.owns && (dial as DialProbe).placement.state === "settled";
    },
    undefined,
    { polling: "raf", timeout: 90_000 },
  );
  await waitForMapStill(page);
}

export async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("ontology-map-canvas").boundingBox();
  if (box === null) throw new Error("the map canvas has no box");
  return { x: box.x, y: box.y };
}

export const readDial = (page: Page) => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);

export function report(label: string, value: unknown) {
  console.log(`[flat-dial] ${label} ${JSON.stringify(value)}`);
}
