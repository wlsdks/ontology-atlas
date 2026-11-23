import { expect, type Page } from "@playwright/test";

import { installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";

/**
 * The code reader over the Harness fixture's app runtime: capabilities whose documents cite lines
 * of files in the connected code folder, and a stub of the two code reader commands that answers
 * as `src-tauri/src/code_reader/` does, from a table of files and refusals.
 */

/** The fixture vault's documents are stamped 2026-09-10 12:00 UTC. */
const DOCUMENT_WRITTEN_MS = Date.UTC(2026, 8, 10, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function numbered(count: number, name: string): string {
  return Array.from({ length: count }, (_, index) => {
    const line = index + 1;
    if (line === 40) return `export function ${name}(lines: InvoiceLine[]): Money {`;
    if (line > 40 && line < 52) return `  // ${name} step ${line - 40}: rounds each line before the total`;
    if (line === 52) return "}";
    return `const value${line} = ${line};`;
  }).join("\n") + "\n";
}

interface CodeFile {
  text?: string;
  lastModified?: number;
  refusal?: string;
}

export const CODE_FILES: Record<string, CodeFile> = {
  "src/billing/invoice.ts": { text: numbered(180, "roundInvoice"), lastModified: DOCUMENT_WRITTEN_MS - DAY_MS },
  "src/billing/tax.ts": { text: numbered(80, "applyTax"), lastModified: DOCUMENT_WRITTEN_MS + DAY_MS },
  "src/billing/short.ts": { text: numbered(20, "shortRule"), lastModified: DOCUMENT_WRITTEN_MS - DAY_MS },
  "src/billing/plain.ts": { text: numbered(30, "plainRule"), lastModified: DOCUMENT_WRITTEN_MS - DAY_MS },
  "config/.env": { refusal: "code-reader-secret" },
  ".git/config": { refusal: "code-reader-outside" },
  "assets/huge.json": { refusal: "code-reader-too-large" },
  "assets/logo.png": { refusal: "code-reader-not-text" },
  "src/billing/renamed.ts": { refusal: "code-reader-gone" },
};

function uidOf(slug: string): string {
  let hash = 2166136261;
  for (const character of slug) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `00000000-0000-4000-8000-${(hash >>> 0).toString(16).padStart(12, "0")}`;
}

function capability(slug: string, title: string, path: string, body: string): string {
  return ["---", `uid: ${uidOf(slug)}`, `slug: ${slug}`, "kind: capability", `title: ${title}`, "domain: domains/shop-api", `path: ${path}`, "---", "", body, ""].join("\n");
}

export const CODE_CONCEPTS = {
  current: "capabilities/invoice-rounding",
  stale: "capabilities/tax",
  beyond: "capabilities/short-rule",
  none: "capabilities/plain-rule",
} as const;

export const REFUSED_CONCEPTS: Record<string, { slug: string; state: string }> = {
  "config/.env": { slug: "capabilities/env-config", state: "secret" },
  ".git/config": { slug: "capabilities/git-config", state: "outside" },
  "assets/huge.json": { slug: "capabilities/huge-data", state: "tooLarge" },
  "assets/logo.png": { slug: "capabilities/logo", state: "notText" },
  "src/billing/renamed.ts": { slug: "capabilities/renamed", state: "gone" },
};

const VAULT_OVERRIDES: Record<string, string> = {
  "domains/shop-api.md": [
    "---",
    "uid: 8b3c2d4e-5f60-4172-9384-ab1c2d3e4f50",
    "slug: domains/shop-api",
    "kind: domain",
    "title: Shop API",
    `capabilities: [capabilities/orders, ${[...Object.values(CODE_CONCEPTS), ...Object.values(REFUSED_CONCEPTS).map((c) => c.slug)].join(", ")}]`,
    "---",
    "",
    "## Definition",
    "The order service every storefront screen reads and writes through.",
    "",
  ].join("\n"),
  "capabilities/invoice-rounding.md": capability(
    CODE_CONCEPTS.current,
    "Invoice rounding",
    "src/billing/invoice.ts",
    "Rounds each invoice line before the total (`src/billing/invoice.ts:L40-L52`); the currency comes first (src/billing/invoice.ts:L7).",
  ),
  "capabilities/tax.md": capability(CODE_CONCEPTS.stale, "Tax", "src/billing/tax.ts", "Applies tax per line (`src/billing/tax.ts:L40-L52`)."),
  "capabilities/short-rule.md": capability(CODE_CONCEPTS.beyond, "Short rule", "src/billing/short.ts", "Decides at `src/billing/short.ts:L50-L60`."),
  "capabilities/plain-rule.md": capability(CODE_CONCEPTS.none, "Plain rule", "src/billing/plain.ts", "Names its file and cites no lines."),
  ...Object.fromEntries(
    Object.entries(REFUSED_CONCEPTS).map(([path, { slug }]) => [
      `${slug}.md`,
      capability(slug, slug.replace("capabilities/", ""), path, `Reads \`${path}:L1-L3\`.`),
    ]),
  ),
};

/** Installs the app runtime with the code reader's two commands, and counts each call. */
export async function installCodeReaderRuntime(page: Page, options: { refuseAll?: string } = {}): Promise<void> {
  await installHarnessRuntime(page, { vaultOverrides: VAULT_OVERRIDES });
  await page.addInitScript(
    ({ files, refuseAll }) => {
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      }).__TAURI_INTERNALS__;
      const inner = internals.invoke.bind(internals);
      const calls = { window: 0, stamp: 0 };
      const touched = new Map<string, number>();
      Object.assign(window, {
        __codeReaderCalls: calls,
        __codeReaderTouch: (path: string) => touched.set(path, Date.now()),
      });
      const fileFor = (args: Record<string, unknown>) => {
        if (refuseAll) throw refuseAll;
        const path = String(args.relativePath ?? "");
        const file = files[path];
        if (!file) throw "code-reader-gone";
        if (file.refusal) throw file.refusal;
        const text = file.text ?? "";
        return { text, lastModified: touched.get(path) ?? file.lastModified ?? 0, bytes: new TextEncoder().encode(text).length };
      };
      internals.invoke = (command, args = {}) => {
        if (command === "read_code_window") {
          calls.window += 1;
          try {
            const file = fileFor(args);
            const all = file.text.replace(/\n$/, "").split("\n");
            const firstLine = Math.max(1, Number(args.firstLine));
            const count = Math.min(400, Math.max(1, Number(args.lineCount)));
            return Promise.resolve({
              lines: all.slice(firstLine - 1, firstLine - 1 + count),
              firstLine,
              totalLines: all.length,
              cut: false,
              lastModified: file.lastModified,
              bytes: file.bytes,
            });
          } catch (code) {
            return Promise.reject(code);
          }
        }
        if (command === "code_file_stamp") {
          calls.stamp += 1;
          try {
            const file = fileFor(args);
            return Promise.resolve({ lastModified: file.lastModified, bytes: file.bytes });
          } catch (code) {
            return Promise.reject(code);
          }
        }
        return inner(command, args);
      };
    },
    { files: CODE_FILES, refuseAll: options.refuseAll ?? "" },
  );
}

/** Opens the fixture vault through the app's chooser, then the map on one concept. */
export async function openConceptOnMap(page: Page, slug: string, locale: "en" | "ko" = "ko"): Promise<void> {
  await mountHarnessVault(page);
  await page.goto(`/${locale}/topology/?p=${slug}&guides=off`);
  await expect(page.getByTestId("map-detail-panel")).toBeVisible({ timeout: 60_000 });
}
