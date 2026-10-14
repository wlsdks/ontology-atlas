import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

/**
 * A class name that emits nothing looks like one that works. `@tailwindcss/typography` is not a
 * dependency and `globals.css` defines no `.prose` rule, so no product file may name it. Both sides
 * are derived from `package.json` and `globals.css`.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** `prose` / `prose-invert` / `prose-lg` … as a whole class token, never `prose-link` or `leading-prose`. */
const TYPOGRAPHY_CLASS =
  /(?<![\w-])prose(?:-(?:invert|sm|base|lg|xl|2xl|gray|slate|zinc|neutral|stone))?(?![\w-])/;

function typographyPluginInstalled(): boolean {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Boolean(
    pkg.dependencies?.["@tailwindcss/typography"] ??
      pkg.devDependencies?.["@tailwindcss/typography"],
  );
}

function stylesheetDefinesProse(): boolean {
  const css = readGlobalCss();
  // A real rule for the bare `.prose` class, not `.prose-link` and not a mention in prose.
  return /^\s*\.prose(?![\w-])[^{]*\{/m.test(css);
}

describe("타이포그래피 클래스 — 값이 없는 이름은 화면에 아무 일도 하지 않는다", () => {
  it("플러그인도 규칙도 없으면 제품 코드가 prose 계열 클래스를 부르지 않는다", () => {
    if (typographyPluginInstalled() || stylesheetDefinesProse()) {
      // The name resolves to real CSS now; this test has nothing to protect.
      return;
    }

    const files = globSync(["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"], {
      cwd: REPO_ROOT,
      exclude: (name) => /\.(test|spec)\.tsx?$/.test(name),
    });
    expect(files.length, "검사 대상이 0개면 통과가 아니라 측정 실패다").toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      /*
       * ⚠️ **Scan class positions, not the word.** Two looser versions came back with 11 and
       * then 8 findings around the one real defect: the ordinary English word "prose" lives
       * in comments, in agent instruction strings, and as this repository's own
       * `leading-prose` ramp step. What makes a class a class is where it is written, so the
       * window starts at a `className`/`class=` and the literals inside it are the subjects —
       * which is exactly how the real one was written (`className="prose prose-invert …"`).
       */
      const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (all, lead: string) => lead + " ".repeat(all.length - lead.length));
      const lineOf = (index: number) => stripped.slice(0, index).split("\n").length;
      for (const at of stripped.matchAll(/\bclass(?:Name)?\s*[=:]/g)) {
        const window = stripped.slice(at.index, at.index + 600);
        for (const literal of window.match(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g) ?? []) {
          if (!TYPOGRAPHY_CLASS.test(literal)) continue;
          offenders.push(`${file}:${lineOf(at.index)}  ${literal.trim().slice(0, 120)}`);
        }
      }
    }

    expect(
      offenders,
      "@tailwindcss/typography is not installed and globals.css has no .prose rule. " +
        "These class names produce no CSS at all: use MARKDOWN_PROSE_CLASS from " +
        "shared/ui/tokens/markdown-prose, or install the plugin and retire this check.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
