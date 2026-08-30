import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ATLAS_CHECKOUT_PLACEHOLDER } from "@/shared/config/cli-invocation";

/**
 * **A screen that shows a placeholder also shows how to fill it in.**
 *
 * **Why this gate exists** (dogfooding, 2026-07-29). `/git`'s web-degraded card
 * offered `node $ATLAS/cli/src/index.mjs snapshot` with a copy button, and nothing
 * anywhere said what `$ATLAS` was. Copy and paste it and the shell expands the empty
 * variable, running `node /cli/src/index.mjs` — **a live channel handing out a dead
 * command.**
 *
 * The explanatory sentence already existed in `cli-invocation.ts`, and that file's
 * own comment said *"any surface that emits the command must carry this with it"*.
 * This repository's recurring lesson — a spec that lives only in a document is not
 * kept — repeated itself exactly.
 *
 * **What is measured.** Whether a file that **shows the placeholder to a person**
 * also uses the hint message key in the same file. Text handed to agents (recipes
 * that already carry `ATLAS_CLI_HINT_EN`) and the file defining the placeholder
 * itself are excluded.
 *
 * A tooltip does not count as a hint — it is unreachable on touch. So the check
 * looks for where the visible copy comes from (an i18n key).
 */

const HINT_KEY = "cliPlaceholderHint";
const AGENT_HINT = "ATLAS_CLI_HINT_EN";

/** The files that define and assemble the placeholder — correctly carrying no hint. */
const DEFINITION_FILES = ["src/shared/config/cli-invocation.ts"];

/**
 * **Not fixed yet — the ratchet.**
 *
 * This list **only shrinks.** These files assemble `$ATLAS` commands inside the
 * handoff blob given to agents but do not yet carry the hint line. An agent cannot
 * run those commands as-is either, so all of them must eventually be fixed — but the
 * blob structure differs per file (string arrays, prompt sentences, recipes), so
 * changing them at once would also disturb the copy-text contract tests.
 *
 * **They are listed to avoid creating silent exemptions.** A gate that quietly skips
 * these files reads to the next auditor as "everything is covered". With the names
 * on a list, the fact that coverage is incomplete is visible every time. **Adding a
 * new file here is forbidden** — the `probe` below stops the list growing.
 */
const HANDOFF_BLOBS_PENDING = [
  "src/features/docs-vault-local/model/agent-activity-status.ts",
  "src/features/docs-vault-local/ui/OntologyStarterCta.tsx",
  "src/entities/knowledge-graph/lib/ontology-tree/agent-readiness.ts",
  "src/views/home/lib/footprint-trail.ts",
  "src/views/home/lib/topology-analysis.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * **Comments are not counted.** The first version scanned raw file text and caught
 * 11 cases, all **explanatory comments** such as "on the CLI this is
 * `node $ATLAS/… health`" — prose telling a developer about a correspondence, not a
 * command drawn for a person, and demanding a hint there is meaningless. What must
 * be caught is **strings that go out as output**.
 *
 * Quote state is tracked so a `//` inside a string literal is not mistaken for a
 * comment — URLs (`https://…`) are common enough that this distinction is genuinely
 * needed.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (next ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

describe("CLI 자리 표시 — 보여 주는 화면은 채우는 법도 보여 준다", () => {
  const files = walk("src").filter((f) => !DEFINITION_FILES.includes(f));
  const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

  it("probe: 실제로 소스를 읽고 있다", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(ATLAS_CHECKOUT_PLACEHOLDER).toBe("$ATLAS");
  });

  it("probe: 자리 표시를 쓰는 파일이 실제로 존재한다 — 0건이면 탐지기가 죽은 것", () => {
    // Keep the retired helper name in the detector so an unhinted reintroduction
    // cannot bypass this contract merely because its implementation was deleted.
    const users = [...sources].filter(
      ([, s]) => s.includes(ATLAS_CHECKOUT_PLACEHOLDER) || /\b(ATLAS_CLI|atlasCli)\b/.test(s),
    );
    expect(users.length).toBeGreaterThan(0);
  });

  /**
   * **A ratchet only shrinks.** If the list can grow it becomes a new rule rather
   * than an exception, and the gate becomes a rubber stamp.
   */
  it("래칫: 미처리 목록이 자라지 않는다", () => {
    expect(HANDOFF_BLOBS_PENDING.length).toBeLessThanOrEqual(6);
  });

  /**
   * **Dead exemptions are deleted.** If a listed file has already been fixed or has
   * disappeared, this fails — otherwise a name that blocks nothing stays forever and
   * hands the next person a false inventory of "6 still to go".
   */
  it.each(HANDOFF_BLOBS_PENDING)("래칫 항목 %s 는 아직 실재하는 미처리다", (file) => {
    const src = sources.get(file);
    expect(src, `목록에 있는데 파일이 없다 — 항목을 지워라`).toBeDefined();
    expect(
      src!.includes(HINT_KEY) || src!.includes(AGENT_HINT),
      `이미 안내를 싣고 있다 — 래칫에서 지워라 (그래야 목록이 재고로 남는다)`,
    ).toBe(false);
  });

  it("사람이 읽는 자리 표시에는 안내가 붙어 있다", () => {
    const offenders = [...sources]
      // **Looking only at files that hand-write the placeholder leaves a hole.** The
      // first version did that: the `/git` degraded card that motivated this gate never
      // writes `$ATLAS` and assembles it from `ATLAS_CLI` — so it was not in the candidate
      // set at all, and a probe that deleted the hint passed. The assembly path puts the
      // same string on screen.
      .filter(
        ([, s]) =>
          s.includes(ATLAS_CHECKOUT_PLACEHOLDER) ||
          /\b(ATLAS_CLI|atlasCli)\b/.test(s),
      )
      // Text handed to agents carries the English constant directly — that passes.
      .filter(([, s]) => !s.includes(AGENT_HINT))
      .filter(([, s]) => !s.includes(HINT_KEY))
      // A long document that **writes the hint out as a sentence** (the vault starter
      // README) also passes. There is no reason the hint must be a single i18n key; the
      // requirement is that "how to fill it in is in the same place". The assignment
      // statement itself is the discriminator, because that is the line the user will
      // actually run.
      .filter(([, s]) => !s.includes(`export ${ATLAS_CHECKOUT_PLACEHOLDER.slice(1)}=`))
      .map(([f]) => f)
      .filter((f) => !HANDOFF_BLOBS_PENDING.includes(f));

    expect(
      offenders,
      `이 파일들이 "${ATLAS_CHECKOUT_PLACEHOLDER}" 를 화면에 내면서 채우는 법을 말하지 않는다.\n` +
        `사람이 읽는 자리면 t("${HINT_KEY}") 를 같은 자리에 그리고,\n` +
        `에이전트에게 건네는 텍스트면 ${AGENT_HINT} 를 실어라.\n` +
        `툴팁(title)은 안내로 치지 않는다 — 터치에서 도달할 수 없다.\n` +
        `위반: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * The i18n half — the key must exist in both locales. With only one, the other
 * language's users see **the key path** drawn where the hint should be.
 */
describe("CLI 자리 표시 안내 — 두 로케일에 다 있다", () => {
  const PATHS = [
    ["atlasGit", HINT_KEY],
    ["projectPages", "selector", HINT_KEY],
  ] as const;

  it.each(["ko", "en"])("%s 에 안내 문구가 있다", (locale) => {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    for (const path of PATHS) {
      const value = path.reduce<unknown>(
        (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
        messages,
      );
      expect(typeof value, `${locale}: ${path.join(".")}`).toBe("string");
      expect((value as string).length).toBeGreaterThan(10);
    }
  });
});
