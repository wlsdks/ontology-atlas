import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ATLAS_CHECKOUT_PLACEHOLDER } from "@/shared/config/agent/cli-invocation";

/**
 * A file that shows the placeholder to a person must also use the hint message key; a tooltip
 * does not count (unreachable on touch). Agent-facing text with `ATLAS_CLI_HINT_EN` and the
 * defining file are excluded.
 */

const HINT_KEY = "cliPlaceholderHint";
const AGENT_HINT = "ATLAS_CLI_HINT_EN";

/** The files that define and assemble the placeholder — correctly carrying no hint. */
const DEFINITION_FILES = ["src/shared/config/agent/cli-invocation.ts"];

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
  "src/entities/vault-session/model/agent-activity-status.ts",
  "src/features/docs-vault-local/ui/OntologyStarterCta.tsx",
  "src/entities/knowledge-graph/lib/ontology-tree/agent-readiness.ts",
  "src/views/home/lib/trail/footprint-trail.ts",
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

describe("CLI placeholders — a screen that shows one also shows how to fill it", () => {
  const files = walk("src").filter((f) => !DEFINITION_FILES.includes(f));
  const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

  it("probe: it really reads the source", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(ATLAS_CHECKOUT_PLACEHOLDER).toBe("$ATLAS");
  });

  it("probe: files that use placeholders really exist — zero means the detector is dead", () => {
    // The detector also matches `atlasCli` so a reintroduced, unhinted helper cannot bypass this
    // contract.
    const users = [...sources].filter(
      ([, s]) => s.includes(ATLAS_CHECKOUT_PLACEHOLDER) || /\b(ATLAS_CLI|atlasCli)\b/.test(s),
    );
    expect(users.length).toBeGreaterThan(0);
  });

  /**
   * **A ratchet only shrinks.** If the list can grow it becomes a new rule rather
   * than an exception, and the gate becomes a rubber stamp.
   */
  it("ratchet: the pending list does not grow", () => {
    expect(HANDOFF_BLOBS_PENDING.length).toBeLessThanOrEqual(6);
  });

  /**
   * **Dead exemptions are deleted.** If a listed file has already been fixed or has
   * disappeared, this fails — otherwise a name that blocks nothing stays forever and
   * hands the next person a false inventory of "6 still to go".
   */
  it.each(HANDOFF_BLOBS_PENDING)("ratchet entry %s is still a real pending item", (file) => {
    const src = sources.get(file);
    expect(src, `in the list but the file is missing — delete the entry`).toBeDefined();
    expect(
      src!.includes(HINT_KEY) || src!.includes(AGENT_HINT),
      `it already carries guidance — delete it from the ratchet (so the list stays an inventory)`,
    ).toBe(false);
  });

  it("human-read placeholders carry guidance", () => {
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
      `These files show "${ATLAS_CHECKOUT_PLACEHOLDER}" without saying how to fill it in.\n` +
        `Where a person reads it, render t("${HINT_KEY}") in the same place;\n` +
        `in text handed to an agent, include ${AGENT_HINT}.\n` +
        `A tooltip (title) does not count as guidance: touch cannot reach it.\n` +
        `Violations: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * The i18n half — the key must exist in both locales. With only one, the other
 * language's users see **the key path** drawn where the hint should be.
 */
describe("CLI placeholder guidance — present in both locales", () => {
  const PATHS = [
    ["atlasGit", HINT_KEY],
    ["projectPages", "selector", HINT_KEY],
    ["nav", "settingsMenu", HINT_KEY],
  ] as const;

  it.each(["ko", "en"])("%s has guidance copy", (locale) => {
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
