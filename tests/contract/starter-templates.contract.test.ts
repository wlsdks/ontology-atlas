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
 * CLI template ↔ web starter **byte-identical** contract (#73).
 *
 * The `ontology-starter.ts` header always required "Mirrors cli/templates/vault/.
 * Keep both in sync so the CLI and the web workbench produce the same starter
 * files.", but no test enforced it, so it **rested on human memory**. Adding
 * locale-aware starters raised the files to keep in sync from 5 to 10, so it is
 * pinned as a contract (the same pattern as the 3-way and 2-way parser/validator
 * contracts).
 *
 * Why it matters: if the vault produced by `node $ATLAS/cli/src/index.mjs init`
 * differs from the one produced by the app starter, users reaching the same product
 * by two routes read different documents.
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
      // The canonical `title` is the single source of truth for search and matching
      // (AGENTS.md), so it must not vary by locale. `display_ko`/`display_en` carry the
      // on-screen names.
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
 * **A freshly created vault must pass the product's own quality bar** (measured
 * 2026-08-17).
 *
 * Running `ontology-atlas health` right after `init` reported
 * `relation_recommendations warn:1` before the user had done anything. The cause was
 * a file we wrote: `elements/example-element` declares
 * `domain: domains/example-domain` while that domain does not link back via
 * `elements:`.
 *
 * If the first screen opens with "something to fix", that signal becomes noise from
 * day one.
 *
 * The verdict calls **the product's own maintenance planner** — reimplementing the
 * rules here would produce a copy that eventually diverges from the original.
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

        // Not idling — did it actually read the vault?
        expect(byId.get("vault_present")?.count).toBe(5);
        expect(byId.get("compile_issues")?.status).toBe("pass");
        // This line is the point of the check.
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
 * Starter files that are **not** concept nodes must match across both routes too.
 *
 * The contract above covered only the five in `starterFilesForLocale`. Since then
 * two guidance documents (`AGENTS.md`, `CLAUDE.md`) and three procedural skills
 * arrived, each with **two copies** — the CLI template and the TS constant — and no
 * check at all. With two copies and no gate, the diverging one is the default.
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
 * Skill frontmatter rules.
 *
 * `name` must equal the folder name for Claude Code to invoke the skill.
 * `description` **is drawn on screen** — the composer's `/` menu truncates it to one
 * line (`AcpChatPanel`), so the opening must carry the meaning and it must not use an
 * em dash. The em-dash ban is the same discipline this repository already applies to
 * on-screen documents, but `em-dash-ratchet`'s reach is `docs/**` and it skips
 * dot-prefixed folders, leaving these files outside its field of view.
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
