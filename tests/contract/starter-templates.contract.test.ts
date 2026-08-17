import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ONTOLOGY_STARTER_FILES,
  VAULT_SKILL_NAMES,
  materializeStarterFiles,
  starterFilesForLocale,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
  vaultSkillFilesForLocale,
  vaultSkillPath,
} from "@/features/docs-vault-local/lib/ontology-starter";
import { runCliJson } from "../helpers/run-cli-json";

/**
 * CLI 템플릿 ↔ 웹 스타터 **바이트 동일** 계약 (#73).
 *
 * `ontology-starter.ts` 헤더가 원래부터 "Mirrors cli/templates/vault/. Keep both
 * in sync so the CLI and the web workbench produce the same starter files." 라고
 * 요구했지만, 그걸 강제하는 테스트가 없어 **사람 기억에만 의존**하고 있었다.
 * 로케일 인지 스타터를 넣으면서 동기화해야 할 파일이 5개 → 10개로 늘었으므로
 * 계약으로 고정한다 (parser/validator 3-way·2-way 계약과 같은 패턴).
 *
 * 왜 중요한가: `node $ATLAS/cli/src/index.mjs init` 으로 만든 볼트와 앱 스타터로 만든 볼트가
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

/**
 * **갓 만든 볼트는 제품 자신의 품질 기준을 통과해야 한다** (2026-08-17 실측).
 *
 * `init` 직후 `ontology-atlas health` 를 돌렸더니 사용자가 아무것도 안 했는데
 * `relation_recommendations warn:1` 이 떴다. 우리가 쓴 파일 때문이었다 —
 * `elements/example-element` 는 `domain: domains/example-domain` 을 선언하는데
 * 그 도메인이 `elements:` 로 되받아 걸지 않았다.
 *
 * 첫 화면이 「손볼 것 있음」으로 시작하면 그 신호는 그날부터 잡음이 된다.
 *
 * 판정은 **제품 자신의 유지보수 계획기**를 부른다 — 여기서 규칙을 다시
 * 구현하면 그 사본이 언젠가 본체와 어긋난다.
 */
describe("starter templates — 제품 자신의 품질 기준", () => {
  for (const locale of ["en", "ko"] as const) {
    it(`${locale}: 갓 만든 볼트에 빠진 관계가 없다`, () => {
      const dir = mkdtempSync(join(tmpdir(), `starter-health-${locale}-`));
      try {
        for (const file of materializeStarterFiles(locale)) {
          const target = join(dir, file.relPath);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, file.content, "utf8");
        }
        const payload = runCliJson<{
          checks?: Array<{ id?: string; status?: string; count?: number }>;
        }>([join(process.cwd(), "cli", "src", "index.mjs"), "health", dir, "--json"]);
        const byId = new Map((payload.checks ?? []).map((c) => [c.id, c]));

        // 헛돌지 않는지 — 볼트를 실제로 읽었는가.
        expect(byId.get("vault_present")?.count).toBe(5);
        expect(byId.get("compile_issues")?.status).toBe("pass");
        // 이 줄이 이 검사의 요점이다.
        expect(byId.get("relation_recommendations")?.status, "우리가 쓴 파일이 손볼 거리를 남긴다").toBe(
          "pass",
        );
        expect(byId.get("components")?.status).toBe("pass");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

/**
 * 개념 노드가 **아닌** 스타터 파일도 두 경로가 같아야 한다.
 *
 * 위 계약은 `starterFilesForLocale` 다섯만 봤다. 그 사이에 안내문 둘
 * (`AGENTS.md` · `CLAUDE.md`)과 절차 스킬 셋이 들어왔는데, 둘 다 CLI 템플릿과
 * TS 상수에 **사본이 둘**이면서 아무 검사도 없었다. 사본이 둘인데 게이트가
 * 없으면 어긋나는 쪽이 기본값이다.
 */
describe("starter templates — 개념이 아닌 파일도 CLI ↔ web 바이트 동일", () => {
  for (const locale of ["en", "ko"] as const) {
    const extras = [
      vaultAgentGuideForLocale(locale),
      vaultClaudeBridgeForLocale(locale),
      ...vaultSkillFilesForLocale(locale),
    ];

    it(`${locale}: 파일 세트가 CLI 템플릿과 같다`, () => {
      expect(extras.map((f) => f.relPath).sort()).toEqual([
        ".claude/skills/atlas-absorb/SKILL.md",
        ".claude/skills/atlas-grow/SKILL.md",
        ".claude/skills/atlas-review/SKILL.md",
        "AGENTS.md",
        "CLAUDE.md",
      ]);
    });

    for (const file of extras) {
      it(`${locale}: ${file.relPath} 본문이 CLI 템플릿과 바이트 동일하다`, () => {
        const onDisk = readFileSync(join(CLI_TEMPLATE_ROOTS[locale], file.relPath), "utf8");
        expect(file.content).toBe(onDisk);
      });
    }
  }
});

/**
 * 스킬 frontmatter 규칙.
 *
 * `name` 은 폴더 이름과 같아야 Claude Code 가 그 스킬을 부른다. `description`
 * 은 **화면에 그려진다** — 작성창 `/` 메뉴가 한 줄로 잘라서 보여 주므로
 * (`AcpChatPanel`), 앞부분이 뜻을 날라야 하고 작대기(—)를 쓰지 않는다.
 * 작대기 금지는 이 저장소가 화면에 그려지는 문서에 이미 건 규율과 같은 것인데,
 * `em-dash-ratchet` 의 사정거리는 `docs/**` 이고 점으로 시작하는 폴더를
 * 건너뛰므로 이 파일들은 그 시야 밖이다.
 */
describe("starter templates — 볼트 스킬 frontmatter", () => {
  for (const locale of ["en", "ko"] as const) {
    const skills = vaultSkillFilesForLocale(locale);

    it(`${locale}: 세 개를 실제로 읽었다`, () => {
      expect(skills.length, "스킬을 못 읽었다. 이 시험이 헛돈다").toBe(VAULT_SKILL_NAMES.length);
    });

    for (const skill of skills) {
      const folder = skill.relPath.split("/").at(-2) ?? "";
      const frontmatter = skill.content.split("---")[1] ?? "";
      const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? "";
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? "";

      it(`${locale}: ${folder} 의 name 이 폴더 이름과 같다`, () => {
        expect(name).toBe(folder);
      });

      it(`${locale}: ${folder} 의 설명이 화면에 낼 수 있는 모양이다`, () => {
        expect(description.length, "설명이 비면 `/` 메뉴에 이름만 뜬다").toBeGreaterThan(20);
        expect(description, "화면에 그려지는 문구다. 작대기 대신 마침표나 괄호를 쓴다").not.toContain(
          "—",
        );
      });
    }
  }

  it("스킬 자리는 Claude Code 가 읽는 그 자리다", () => {
    expect(vaultSkillPath("atlas-review")).toBe(".claude/skills/atlas-review/SKILL.md");
  });
});
