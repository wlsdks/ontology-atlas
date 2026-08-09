import { describe, expect, it } from "vitest";

import { buildSkillInventory, sourceLabelOf } from "./build-inventory";

/**
 * 스킬 인벤토리가 **정말 무언가를 보고 있는지** 잠근다.
 *
 * 이 화면이 답하는 질문은 「내가 가진 스킬이 뭐고 서로 어떻게 얽히나」이고, 그
 * 답이 틀리면 사용자는 멀쩡한 스킬을 지운다. 그래서 겹침 판정에는 **양쪽 방향의
 * 시험**이 다 있다: 겹치는 것을 잡는가 · 안 겹치는 것을 안 잡는가. 뒤엣것이 없으면
 * 「무엇이든 겹쳤다고 말하는」 계기가 통과해 버린다(이번 라운드에 실제로 두 번
 * 그랬다 — 분모를 3.5배 부풀린 계기가 카운슬 판정 셋을 움직였다).
 */

const skill = (path: string, name: string, description: string, body = "") =>
  ({
    relativePath: path,
    text: `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
  }) as const;

describe("스킬 인벤토리", () => {
  it("frontmatter 두 값이 다 있는 것만 스킬로 센다", () => {
    const inv = buildSkillInventory({
      files: [
        skill("skills/pdf/SKILL.md", "pdf", "Extract text from PDF"),
        // 규격 미달 — 런타임이 못 부르므로 목록에 올리면 거짓말이 된다.
        { relativePath: "skills/half/SKILL.md", text: "---\nname: half\n---\n\nbody" },
        { relativePath: "skills/plain/SKILL.md", text: "# 그냥 마크다운\n" },
      ],
    });
    expect(inv.skills.map((s) => s.name)).toEqual(["pdf"]);
    expect(inv.totals.skills).toBe(1);
  });

  describe("호출하면 무슨 일이 일어나나 — 3단", () => {
    it("항상/발동/요청 세 층으로 갈리고, 딸린 파일은 스킬 폴더 기준으로 풀린다", () => {
      const inv = buildSkillInventory({
        files: [
          skill(
            "skills/pdf/SKILL.md",
            "pdf",
            "Extract text",
            "Read references/spec.md then run scripts/extract.py.",
          ),
        ],
      });
      const [always, onTrigger, onDemand] = inv.skills[0].invocation.steps;
      expect(always.chars, "설명 길이가 항상 실리는 값이다").toBe("Extract text".length);
      expect(onTrigger.files).toEqual(["skills/pdf/SKILL.md"]);
      expect([...onDemand.files].sort()).toEqual([
        "skills/pdf/references/spec.md",
        "skills/pdf/scripts/extract.py",
      ]);
    });

    it("읽는 것과 **돌아가는 것**을 가른다 — 이 구분이 이 화면의 요점이다", () => {
      const inv = buildSkillInventory({
        files: [
          skill(
            "skills/x/SKILL.md",
            "x",
            "does things",
            "Read references/a.md and references/b.md, then run scripts/go.sh.",
          ),
        ],
      });
      expect(inv.skills[0].invocation.executables).toEqual(["skills/x/scripts/go.sh"]);
      expect(inv.totals.executables).toBe(1);
      expect(inv.totals.bundledFiles, "읽는 것도 세되 따로 센다").toBe(3);
    });

    it("조건부 참조는 딸린 파일이 아니다 — 없어도 결함이 아니다", () => {
      const inv = buildSkillInventory({
        files: [
          skill(
            "skills/x/SKILL.md",
            "x",
            "does things",
            "If the project has src/tokens.js, read it. Always read references/spec.md.",
          ),
        ],
        existingPaths: new Set(["skills/x/references/spec.md"]),
      });
      expect(inv.skills[0].invocation.steps[2].files).toEqual(["skills/x/references/spec.md"]);
      expect(inv.broken, "조건부가 결함으로 새면 「고칠 것 700건」 소음이 돌아온다").toEqual([]);
    });
  });

  describe("깨진 자기 폴더 참조", () => {
    it("실재 목록을 주면 없는 것만 잡는다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("skills/x/SKILL.md", "x", "d", "Read references/have.md and references/gone.md."),
        ],
        existingPaths: new Set(["skills/x/references/have.md"]),
      });
      expect(inv.broken).toHaveLength(1);
      expect(inv.broken[0].missingBundled).toEqual(["skills/x/references/gone.md"]);
    });

    it("실재 목록이 없으면 「깨졌다」고 말하지 않는다", () => {
      const inv = buildSkillInventory({
        files: [skill("skills/x/SKILL.md", "x", "d", "Read references/gone.md.")],
      });
      expect(inv.broken, "확인 못 한 것을 결함이라고 부르면 멀쩡한 스킬이 빨개진다").toEqual([]);
    });
  });

  describe("이름 충돌", () => {
    it("설명이 다르면 발동 조건이 경쟁한다고 표시하고, 그쪽을 앞에 놓는다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("a/skills/dup/SKILL.md", "dup", "Build frontend interfaces"),
          skill("b/skills/dup/SKILL.md", "dup", "Guidance for visual design"),
          skill("c/skills/same/SKILL.md", "same", "identical text"),
          skill("d/skills/same/SKILL.md", "same", "identical text"),
        ],
      });
      expect(inv.collisions.map((c) => c.name)).toEqual(["dup", "same"]);
      expect(inv.collisions[0].descriptionsDiffer).toBe(true);
      expect(inv.collisions[1].descriptionsDiffer, "설명이 같으면 사본일 뿐이다").toBe(false);
    });

    it("이름이 하나뿐이면 충돌이 아니다", () => {
      const inv = buildSkillInventory({
        files: [skill("a/skills/solo/SKILL.md", "solo", "only one")],
      });
      expect(inv.collisions).toEqual([]);
    });
  });

  describe("트리거 겹침", () => {
    it("발동 조건을 공유하는 쌍을 잡는다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("s/invoice/SKILL.md", "invoice", "invoice pdf export ledger"),
          skill("s/receipt/SKILL.md", "receipt", "invoice pdf export receipt"),
        ],
      });
      expect(inv.overlaps).toHaveLength(1);
      expect([...inv.overlaps[0].shared].sort()).toEqual(["export", "invoice", "pdf"]);
      expect(inv.overlaps[0].score).toBeGreaterThan(0.4);
    });

    it("아무것도 공유하지 않는 쌍은 안 잡는다 — 이게 없으면 계기가 무엇이든 겹쳤다고 한다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("s/a/SKILL.md", "a", "invoice pdf export ledger"),
          skill("s/k/SKILL.md", "k", "kubernetes cluster pods scheduling"),
        ],
      });
      expect(inv.overlaps).toEqual([]);
    });

    it("어느 스킬에나 나오는 말만 공유하는 쌍도 안 잡는다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("s/a/SKILL.md", "a", "Use this skill when the user wants to create a chart"),
          skill("s/b/SKILL.md", "b", "Use this skill when the user wants to build a pipeline"),
        ],
      });
      expect(inv.overlaps, "불용어를 안 빼면 모든 쌍이 겹쳐 보인다").toEqual([]);
    });

    it("이름이 같은 쌍은 겹침으로 두 번 세지 않는다", () => {
      const inv = buildSkillInventory({
        files: [
          skill("a/skills/twin/SKILL.md", "twin", "alpha beta gamma delta"),
          skill("b/skills/twin/SKILL.md", "twin", "alpha beta gamma delta"),
        ],
      });
      expect(inv.collisions).toHaveLength(1);
      expect(inv.overlaps, "두 번 세면 사용자가 같은 문제를 두 곳에서 읽는다").toEqual([]);
    });
  });

  it("항상 실리는 값의 합을 낸다 — 한 번도 안 써도 매 세션 드는 값이다", () => {
    const inv = buildSkillInventory({
      files: [
        skill("s/a/SKILL.md", "a", "12345"),
        skill("s/b/SKILL.md", "b", "1234567890"),
      ],
    });
    expect(inv.totals.alwaysLoadedChars).toBe(15);
  });

  describe("출처 이름", () => {
    it("마켓플레이스 설치본은 플러그인 이름으로 줄인다", () => {
      expect(sourceLabelOf("plugins/cache/anthropic-skills/1.2.0/skills/pdf/SKILL.md")).toBe(
        "anthropic-skills",
      );
    });
    it("내 폴더의 스킬은 그 위 폴더 이름", () => {
      expect(sourceLabelOf(".claude/skills/mine/SKILL.md")).toBe(".claude");
    });
    it("최상위가 skills 면 그대로", () => {
      expect(sourceLabelOf("skills/mine/SKILL.md")).toBe("skills");
    });
  });

  it("계기가 살아 있다 — 완전히 깨끗한 뭉치에서는 아무것도 보고하지 않는다", () => {
    const inv = buildSkillInventory({
      files: [
        skill("s/one/SKILL.md", "one", "alpha bravo charlie", "references/a.md"),
        skill("s/two/SKILL.md", "two", "delta echo foxtrot", "references/b.md"),
      ],
      existingPaths: new Set(["s/one/references/a.md", "s/two/references/b.md"]),
    });
    expect(inv.collisions).toEqual([]);
    expect(inv.overlaps).toEqual([]);
    expect(inv.broken).toEqual([]);
    expect(inv.totals.skills, "그런데 0건인 이유가 「아무것도 안 봐서」면 안 된다").toBe(2);
  });
});
