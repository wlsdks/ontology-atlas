import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CATEGORIES } from "@/entities/category";
import { DEFAULT_STATUSES } from "@/entities/status";
import { pickTaxonomyLabel } from "@/shared/lib/taxonomy-label";

/**
 * 분류(category / status) 라벨 어권 게이트.
 *
 * 2026-07-28 실사용 스윕: `/en/project/new` 의 카테고리·상태 드롭다운과 카드
 * 미리보기가 영문 화면에서도 한국어를 그렸다(렌더된 한글 12건). 원인은 두
 * 겹이었다 — ① `Status` 에는 영문 라벨 필드 자체가 없었고, ② 있는
 * `Category.labelEn` 조차 옵션 빌더가 안 쓰고 `.label` 을 직접 읽었다.
 *
 * `pnpm test:i18n:messages` 는 이걸 못 잡는다 — 그건 **메시지 카탈로그**의
 * 키 대칭을 보지, 카탈로그 밖(코드 상수)에서 온 문자열은 보지 않는다.
 * 카탈로그 밖에 사람 말이 있으면 카탈로그 게이트의 사정거리 밖이다.
 *
 * 그래서 여기서 두 층을 잠근다:
 *   (a) **데이터** — defaults 의 모든 항목이 두 어권 라벨을 다 갖는다.
 *       영문 라벨 없는 항목이 새로 추가되면 여기서 막힌다(①의 뿌리).
 *   (b) **배선** — 호출부가 `.label` 을 직접 읽지 않는다. 라벨을 고르는
 *       자리는 `TaxonomyProvider` 하나다(②의 뿌리).
 *
 * 화면에 실제로 그려진 문자열까지 보는 층은 e2e
 * (`tests/e2e/locale-purity.spec.ts`)가 맡는다 — 렌더 결과는 lint 도 vitest
 * 도 못 보는 층이라 브라우저가 있어야 한다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const SRC_DIR = path.join(process.cwd(), "src");

/** 라벨을 고르는 자리 — 여기서만 `.label` 을 직접 읽어도 된다. */
const RESOLVER_PATHS = [
  path.join("src", "features", "taxonomy"),
  path.join("src", "entities", "category"),
  path.join("src", "entities", "status"),
  path.join("src", "shared", "lib", "taxonomy-label.ts"),
];

/**
 * 분류 항목에서 라벨을 직접 꺼내는 모양. 결함 당시 코드가 정확히 이랬다:
 * `category.label` · `status.label`. 다른 도메인의 `.label`(엣지 라벨 ·
 * 문서 행 라벨 …)까지 잡지 않도록 식별자를 분류 이름으로 한정한다.
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
      `분류 라벨은 TaxonomyProvider 의 categoryLabel/statusLabel 로만 읽는다 — ` +
        `직접 읽으면 화면 언어를 무시한다:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
