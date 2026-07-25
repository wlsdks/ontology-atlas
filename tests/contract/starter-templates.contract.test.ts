import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ONTOLOGY_STARTER_FILES,
  starterFilesForLocale,
} from "@/features/docs-vault-local/lib/ontology-starter";

/**
 * CLI 템플릿 ↔ 웹 스타터 **바이트 동일** 계약 (#73).
 *
 * `ontology-starter.ts` 헤더가 원래부터 "Mirrors cli/templates/vault/. Keep both
 * in sync so the CLI and the web workbench produce the same starter files." 라고
 * 요구했지만, 그걸 강제하는 테스트가 없어 **사람 기억에만 의존**하고 있었다.
 * 로케일 인지 스타터를 넣으면서 동기화해야 할 파일이 5개 → 10개로 늘었으므로
 * 계약으로 고정한다 (parser/validator 3-way·2-way 계약과 같은 패턴).
 *
 * 왜 중요한가: `ontology-atlas init` 으로 만든 볼트와 앱 스타터로 만든 볼트가
 * 다르면, 같은 제품을 두 경로로 쓰는 사용자가 서로 다른 문서를 읽게 된다.
 */

const CLI_TEMPLATE_ROOTS = {
  en: join(process.cwd(), "cli", "templates", "vault"),
  ko: join(process.cwd(), "cli", "templates", "vault-ko"),
} as const;

describe("starter templates — CLI ↔ web parity (#73)", () => {
  for (const locale of ["en", "ko"] as const) {
    describe(`locale: ${locale}`, () => {
      const files = starterFilesForLocale(locale);

      it("파일 세트가 CLI 템플릿과 같다", () => {
        expect(files.map((f) => f.relPath).sort()).toEqual([
          "README.md",
          "capabilities/example-capability.md",
          "domains/example-domain.md",
          "elements/example-element.md",
          "project.md",
        ]);
      });

      for (const file of files) {
        it(`${file.relPath} 본문이 CLI 템플릿과 바이트 동일하다`, () => {
          const onDisk = readFileSync(join(CLI_TEMPLATE_ROOTS[locale], file.relPath), "utf8");
          expect(file.content).toBe(onDisk);
        });
      }
    });
  }

  it("로케일이 달라도 frontmatter 는 같다 — 같은 그래프가 나와야 한다", () => {
    const en = starterFilesForLocale("en");
    const ko = starterFilesForLocale("ko");
    const frontmatterOf = (content: string) => content.split("---")[1] ?? "";

    for (const enFile of en) {
      const koFile = ko.find((f) => f.relPath === enFile.relPath);
      expect(koFile, `missing ko file for ${enFile.relPath}`).toBeDefined();
      // canonical `title` 은 검색/매칭의 단일 진실원(AGENTS.md)이라 로케일에
      // 따라 바뀌면 안 된다. `display_ko`/`display_en` 이 화면 이름을 담당한다.
      expect(frontmatterOf(koFile!.content)).toBe(frontmatterOf(enFile.content));
    }
  });

  it("본문(산문)은 로케일마다 다르다 — 번역이 실제로 들어있다", () => {
    const en = starterFilesForLocale("en");
    const ko = starterFilesForLocale("ko");
    for (const enFile of en) {
      const koFile = ko.find((f) => f.relPath === enFile.relPath)!;
      expect(koFile.content).not.toBe(enFile.content);
    }
  });

  it("모르는 로케일은 영어로 떨어진다", () => {
    expect(starterFilesForLocale("fr")).toBe(ONTOLOGY_STARTER_FILES);
    expect(starterFilesForLocale("")).toBe(ONTOLOGY_STARTER_FILES);
  });
});
