import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { readGlobalCss } from "../../../../scripts/lib/design/global-css.mjs";
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

describe("the installed app is marked before first paint", () => {
  afterEach(() => {
    delete (window as { isTauri?: boolean }).isTauri;
    document.documentElement.removeAttribute("data-shell");
  });

  it("marks the root only when the Tauri runtime flag is present", () => {
    runBootScript();
    expect(document.documentElement.hasAttribute("data-shell")).toBe(false);
    (window as { isTauri?: boolean }).isTauri = true;
    runBootScript();
    expect(document.documentElement.getAttribute("data-shell")).toBe("desktop");
  });
});

describe("the stored sample choice is marked before first paint", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-sample");
  });

  it("marks the root only for the dogfood choice", () => {
    window.localStorage.setItem("demo:sample-source:v1", "storefront");
    runBootScript();
    expect(document.documentElement.hasAttribute("data-sample")).toBe(false);
    window.localStorage.setItem("demo:sample-source:v1", "dogfood");
    runBootScript();
    expect(document.documentElement.getAttribute("data-sample")).toBe("dogfood");
  });
});
