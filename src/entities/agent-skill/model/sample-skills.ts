import type { SkillSourceFile } from "../lib/build-inventory";

/**
 * 예시 스킬 뭉치 — **폴더를 고르기 전에 이 화면이 무엇을 보여 주는지** 보게 한다.
 *
 * 볼트에 이미 있는 「예시 둘러보기」와 같은 생각이다: 아무것도 안 고른 사람이
 * 빈 화면과 설명문만 보고 나가지 않게, **채워진 화면을 먼저 보여 준다.**
 *
 * ## 문구는 전부 우리가 지어 쓴다
 *
 * ⚠️ 실제 마켓플레이스 스킬의 설명을 그대로 넣지 않는다 — 남의 자산이고, 이
 * 저장소는 타사 자산 모방을 금지한다(`forbidden.md`). 여기 있는 여덟은 이 화면이
 * 짚어야 하는 상황을 **일부러 다 담도록** 지어낸 것이다:
 *
 * | 담은 상황 | 어느 것 |
 * |---|---|
 * | 이름 충돌 (설명까지 다름 → 발동 조건이 경쟁) | `changelog` × 2 |
 * | 트리거 겹침 (이름은 다른데 조건이 비슷) | `release-notes` ↔ `changelog` |
 * | 실행되는 파일 | `csv-report` · `screenshot-diff` |
 * | 딸린 파일이 깨짐 | `api-docs` 가 없는 `references/openapi.md` 를 가리킨다 |
 * | 내가 만든 것 (남의 것과 갈려야 한다) | `commit-style` |
 * | 아무 문제 없는 평범한 것 | `sql-explain` · `flaky-test` |
 * | **서로 넘기는 것** (2026-08-18) | `api-docs` → `commit-style` → `release-notes` 사슬 + `csv-report` → `sql-explain` · `screenshot-diff` → `flaky-test` |
 *
 * 마지막 줄이 늦게 들어온 이유가 그 자체로 교훈이다 — 넘김을 세기 시작한 날
 * 예시 뭉치에는 서로 부르는 스킬이 **하나도 없었다**. 그래서 폴더를 아직 안 고른
 * 사람에게는 이 화면의 핵심 기능이 「연결 0개」로 보였다. **예시가 담지 않은
 * 상황은 첫 5분에 존재하지 않는 기능이다.**
 *
 * 마지막 줄이 중요하다 — 전부 문제 있는 뭉치를 보여 주면 이 화면이 **경고판**으로
 * 읽히고, 그건 우리가 지기로 되어 있는 축이다(2026-08-09 원장: 위험 점수·배지 금지).
 */

interface SampleSkill {
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

const SAMPLES: readonly SampleSkill[] = [
  {
    path: "skills/commit-style/SKILL.md",
    name: "commit-style",
    description:
      "Write commit messages in this repository's house style. Use when staging changes, preparing a pull request, or when the user asks how to word a commit.",
    body: "1. Read references/prefixes.md for the allowed prefixes.\n2. Draft the subject line.\n3. Check the subject before staging.\n\nWhen the change is part of a release, hand off to /release-notes.",
  },
  {
    path: "plugins/cache/docs-pack/2.1.0/skills/changelog/SKILL.md",
    name: "changelog",
    description:
      "Draft a user-facing changelog entry from a range of commits. Use when cutting a release or when the user asks what changed since the last version.",
    body: "1. Read references/tone.md first.\n2. Group entries by surface, not by author.\n3. Check that every changed surface is represented.",
  },
  {
    path: "plugins/cache/writing-pack/1.4.0/skills/changelog/SKILL.md",
    name: "changelog",
    description:
      "Maintain the CHANGELOG.md file itself — heading levels, date format, and the unreleased section. Use when the file structure needs fixing rather than new prose.",
    body: "1. Keep the Unreleased heading at the top even when empty.\n2. Check the date and heading format.\n3. Save the corrected changelog.",
  },
  {
    path: "plugins/cache/docs-pack/2.1.0/skills/release-notes/SKILL.md",
    name: "release-notes",
    description:
      "Draft release notes from a range of commits for a version announcement. Use when publishing a release or when the user asks what shipped.",
    body: "1. Lead with what a reader can now do that they could not before.\n2. Group the changes by user-facing surface.\n3. Check the version and release date.",
  },
  {
    path: "plugins/cache/data-pack/3.0.0/skills/csv-report/SKILL.md",
    name: "csv-report",
    description:
      "Turn a CSV export into a summary table with totals and outliers. Use when the user hands over a spreadsheet dump and wants the shape of it.",
    body: "1. Read references/columns.md.\n2. Run scripts/summarize.py to build the table.\n3. Check totals and outliers before sharing.\n\nIf a total looks wrong, hand off to /sql-explain.",
  },
  {
    path: "plugins/cache/data-pack/3.0.0/skills/sql-explain/SKILL.md",
    name: "sql-explain",
    description:
      "Explain a slow SQL query in plain language and name the index that would help. Use when a query plan is pasted in.",
    body: "1. Quote the plan line that dominates the cost.\n2. Explain the bottleneck in plain language.\n3. Propose the smallest useful index change.",
  },
  {
    path: "plugins/cache/qa-pack/0.9.0/skills/screenshot-diff/SKILL.md",
    name: "screenshot-diff",
    description:
      "Compare two screenshots and report which regions moved. Use when a visual regression is suspected.",
    body: "1. Run scripts/compare.py with both paths.\n2. Read references/thresholds.md.\n3. Report only regions that exceed the threshold.\n\nIf the difference moves between runs, hand off to /flaky-test.",
  },
  {
    path: "plugins/cache/qa-pack/0.9.0/skills/flaky-test/SKILL.md",
    name: "flaky-test",
    description:
      "Diagnose a test that passes and fails without code changes. Use when CI is red intermittently.",
    body: "1. Rerun the single spec ten times before touching anything.\n2. Record each pass and failure.\n3. Separate environment noise from a reproducible defect.",
  },
  {
    path: "plugins/cache/docs-pack/2.1.0/skills/api-docs/SKILL.md",
    name: "api-docs",
    description:
      "Generate endpoint reference pages from an OpenAPI document. Use when the user asks to document an HTTP surface.",
    // 일부러 없는 파일을 가리킨다 — 「깨진 참조」가 화면에서 어떻게 보이는지 담는다.
    body: "1. Read references/openapi.md for the schema conventions before writing.\n2. Check the endpoint names and response shapes.\n3. Report missing source evidence instead of inventing it.\n\nOnce the pages are written, hand off to /commit-style.",
  },
];

/** 예시 뭉치 안에 **실재하는** 파일들 — 깨진 참조 판정의 재료. */
const EXISTING = new Set<string>([
  "skills/commit-style/references/prefixes.md",
  "plugins/cache/docs-pack/2.1.0/skills/changelog/references/tone.md",
  "plugins/cache/data-pack/3.0.0/skills/csv-report/references/columns.md",
  "plugins/cache/data-pack/3.0.0/skills/csv-report/scripts/summarize.py",
  "plugins/cache/qa-pack/0.9.0/skills/screenshot-diff/scripts/compare.py",
  "plugins/cache/qa-pack/0.9.0/skills/screenshot-diff/references/thresholds.md",
]);

export const SAMPLE_SKILL_FOLDER_NAME = ".claude";

export function sampleSkillFiles(): SkillSourceFile[] {
  return SAMPLES.map((sample) => ({
    relativePath: sample.path,
    text: `---\nname: ${sample.name}\ndescription: ${sample.description}\n---\n\n${sample.body}\n`,
  }));
}

/** 예시 뭉치의 실재 경로 — `SKILL.md` 들과 위 `EXISTING` 을 합친 것. */
export function sampleExistingPaths(): Set<string> {
  return new Set([...EXISTING, ...SAMPLES.map((sample) => sample.path)]);
}
