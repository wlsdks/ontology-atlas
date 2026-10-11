import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CATEGORIES } from "@/entities/category";
import { DEFAULT_STATUSES } from "@/entities/status";
import { routing } from "@/i18n/routing";
import { pickTaxonomyLabel } from "@/shared/lib/locale-text/taxonomy-label";

/**
 * Two layers: every default taxonomy entry carries labels for both locales, and call sites never
 * read `.label` directly; `TaxonomyProvider` is the one place that picks a label.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const SRC_DIR = path.join(process.cwd(), "src");

/** Where a label is chosen — the only place allowed to read `.label` directly. */
const RESOLVER_PATHS = [
  path.join("src", "features", "taxonomy"),
  path.join("src", "entities", "category"),
  path.join("src", "entities", "status"),
  path.join("src", "shared", "lib", "locale-text", "taxonomy-label.ts"),
];

/**
 * The shape of reading a label straight off a taxonomy entry. The defective code
 * looked exactly like this: `category.label`, `status.label`. The identifier is
 * restricted to the taxonomy names so `.label` in other domains (edge labels,
 * document row labels, …) is not caught.
 */
const DIRECT_LABEL_READ = /\b(category|status)\.label\b/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("분류 라벨 — 두 어권을 다 갖고, 고르는 자리는 하나다", () => {
  it("모든 카테고리 기본값이 한국어·영문 라벨을 다 갖는다", () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.label.trim(), `category ${category.id}`).not.toBe("");
      expect(
        category.labelEn?.trim(),
        `category ${category.id} 에 영문 라벨이 없다 — 영문 화면에 한국어가 그대로 나간다`,
      ).toBeTruthy();
      expect(
        HANGUL.test(category.labelEn ?? ""),
        `category ${category.id} 의 labelEn 이 한국어다`,
      ).toBe(false);
    }
  });

  it("모든 상태 기본값이 한국어·영문 라벨을 다 갖는다", () => {
    expect(DEFAULT_STATUSES.length).toBeGreaterThan(0);
    for (const status of DEFAULT_STATUSES) {
      expect(status.label.trim(), `status ${status.id}`).not.toBe("");
      expect(
        status.labelEn?.trim(),
        `status ${status.id} 에 영문 라벨이 없다 — 영문 화면에 한국어가 그대로 나간다`,
      ).toBeTruthy();
      expect(
        HANGUL.test(status.labelEn ?? ""),
        `status ${status.id} 의 labelEn 이 한국어다`,
      ).toBe(false);
    }
  });

  it("영문 로케일에서는 어떤 기본값도 한국어를 돌려주지 않는다", () => {
    for (const entry of [...DEFAULT_CATEGORIES, ...DEFAULT_STATUSES]) {
      const en = pickTaxonomyLabel(entry, "en");
      expect(HANGUL.test(en ?? ""), `${entry.id} → "${en}"`).toBe(false);
      expect(pickTaxonomyLabel(entry, "ko")).toBe(entry.label);
    }
  });

  it("every default carries a label for every routing locale", () => {
    for (const entry of [...DEFAULT_CATEGORIES, ...DEFAULT_STATUSES]) {
      for (const locale of routing.locales) {
        const picked = pickTaxonomyLabel(entry, locale);
        expect(picked?.trim(), `${entry.id} / ${locale}`).toBeTruthy();
        if (locale !== "ko" && locale !== "en") {
          expect(entry.labels?.[locale]?.trim(), `${entry.id} has no ${locale} label`).toBeTruthy();
        }
      }
    }
  });

  it("호출부가 분류 항목의 `.label` 을 직접 읽지 않는다", () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(process.cwd(), file);
      if (RESOLVER_PATHS.some((allowed) => rel.startsWith(allowed))) continue;

      const source = stripComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(DIRECT_LABEL_READ)) {
        violations.push(`${rel}: ${match[0]}`);
      }
    }

    expect(
      violations,
      `Taxonomy labels are read only through TaxonomyProvider's categoryLabel/statusLabel; ` +
        `reading them directly ignores the screen language:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
