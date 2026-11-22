import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VAULT_SKILL_NAMES,
  materializeStarterFiles,
  starterFilesForLocale,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
  vaultSkillFilesForLocale,
  vaultSkillPath,
} from "@/entities/vault-session/lib/ontology-starter";
import { runHealthCheck } from "../../helpers/run-health-check";

/**
 * `init` template ↔ app starter **byte-identical** contract (#73).
 *
 * `cli/templates/vault/` (what `init` copies) and `ontology-starter.ts` (what the app
 * writes) must produce the same starter files, or users reaching the same product by
 * two routes read different documents.
 */

const CLI_TEMPLATE_ROOTS = {
  en: join(process.cwd(), "cli", "templates", "vault"),
  ko: join(process.cwd(), "cli", "templates", "vault-ko"),
} as const;

describe("starter templates — init ↔ app parity (#73)", () => {
  for (const locale of ["en", "ko"] as const) {
    describe(`locale: ${locale}`, () => {
      const files = starterFilesForLocale(locale);

      it("the file set equals the CLI templates", () => {
        expect(files.map((f) => f.relPath).sort()).toEqual([
          "README.md",
          "capabilities/example-capability.md",
          "domains/example-domain.md",
          "elements/example-element.md",
          "project.md",
        ]);
      });

      for (const file of files) {
        it(`the body of ${file.relPath} is byte-identical to the CLI template`, () => {
          const onDisk = readFileSync(join(CLI_TEMPLATE_ROOTS[locale], file.relPath), "utf8");
          expect(file.content).toBe(onDisk);
        });
      }
    });
  }

  it("frontmatter is the same across locales, since the same graph must come out", () => {
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

  it("the body (prose) differs per locale, since a translation is really in it", () => {
    const en = starterFilesForLocale("en");
    const ko = starterFilesForLocale("ko");
    for (const enFile of en) {
      const koFile = ko.find((f) => f.relPath === enFile.relPath)!;
      expect(koFile.content).not.toBe(enFile.content);
    }
  });

  it("an unknown locale falls back to English", () => {
    expect(starterFilesForLocale("fr")).toBe(starterFilesForLocale("en"));
    expect(starterFilesForLocale("")).toBe(starterFilesForLocale("en"));
  });
});

/**
 * A freshly created vault must pass the product own maintenance planner, which is called instead of
 * reimplementing its rules.
 */
describe("starter templates: the product's own quality bar", () => {
  for (const locale of ["en", "ko"] as const) {
    it(`${locale}: a freshly created vault has no missing relation`, () => {
      const dir = mkdtempSync(join(tmpdir(), `starter-health-${locale}-`));
      try {
        for (const file of materializeStarterFiles(locale)) {
          const target = join(dir, file.relPath);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, file.content, "utf8");
        }
        const byId = new Map(runHealthCheck(dir).map((c) => [c.id, c]));

        // Not idling — did it actually read the vault?
        expect(byId.get("vault_present")?.count).toBe(5);
        expect(byId.get("compile_issues")?.status).toBe("pass");
        // This line is the point of the check.
        expect(byId.get("relation_recommendations")?.status, "the files we wrote leave something to fix").toBe(
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
describe("starter templates: files that are not concepts are also CLI to web byte-identical", () => {
  for (const locale of ["en", "ko"] as const) {
    const extras = [
      vaultAgentGuideForLocale(locale),
      vaultClaudeBridgeForLocale(locale),
      ...vaultSkillFilesForLocale(locale),
    ];

    it(`${locale}: the file set equals the CLI templates`, () => {
      expect(extras.map((f) => f.relPath).sort()).toEqual([
        ".claude/skills/atlas-absorb/SKILL.md",
        ".claude/skills/atlas-grow/SKILL.md",
        ".claude/skills/atlas-review/SKILL.md",
        "AGENTS.md",
        "CLAUDE.md",
      ]);
    });

    for (const file of extras) {
      it(`${locale}: the body of ${file.relPath} is byte-identical to the CLI template`, () => {
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
describe("starter templates: vault skill frontmatter", () => {
  for (const locale of ["en", "ko"] as const) {
    const skills = vaultSkillFilesForLocale(locale);

    it(`${locale}: really read all three`, () => {
      expect(skills.length, "could not read the skills, so this test spins idle").toBe(VAULT_SKILL_NAMES.length);
    });

    for (const skill of skills) {
      const folder = skill.relPath.split("/").at(-2) ?? "";
      const frontmatter = skill.content.split("---")[1] ?? "";
      const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? "";
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? "";

      it(`${locale}: the name of ${folder} equals the folder name`, () => {
        expect(name).toBe(folder);
      });

      it(`${locale}: the description of ${folder} has a shape that can be shown on screen`, () => {
        expect(description.length, "if the description is empty, only the name shows in the `/` menu").toBeGreaterThan(20);
        expect(description, "this wording is drawn on screen; use a period or parentheses instead of a dash").not.toContain(
          "—",
        );
      });
    }
  }

  it("the skill location is the one Claude Code reads", () => {
    expect(vaultSkillPath("atlas-review")).toBe(".claude/skills/atlas-review/SKILL.md");
  });
});
