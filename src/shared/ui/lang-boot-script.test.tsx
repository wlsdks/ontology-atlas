import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { readGlobalCss } from "../../../scripts/lib/global-css.mjs";
import { LangBootScript } from "./lang-boot-script";

const STORED_ACCENT_KEY = "ontology-atlas:accent:v1";

function runBootScript() {
  const markup = renderToStaticMarkup(<LangBootScript />);
  const body = /<script[^>]*>([\s\S]*)<\/script>/.exec(markup)?.[1] ?? "";
  new Function(body)();
}

describe("a stored copper accent opens on indigo", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
  });

  it.each(["ember", "indigo", "violet"])("stored %s leaves no accent attribute on the root", (stored) => {
    window.localStorage.setItem(STORED_ACCENT_KEY, stored);
    runBootScript();
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);
  });

  it("no stylesheet rule answers an accent attribute", () => {
    expect(readGlobalCss()).not.toMatch(/data-accent/);
  });
});
