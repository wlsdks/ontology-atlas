import { afterEach, describe, expect, it } from "vitest";

import { keepFocus, type HeldFocus } from "./keep-focus";

function list(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

function held(overrides: Partial<HeldFocus> = {}): HeldFocus {
  return { el: document.createElement("button"), key: "row|a", slug: "a", group: "one", ...overrides };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("keepFocus", () => {
  it("hands focus to the same row when it is drawn elsewhere", () => {
    const root = list(`<div data-glide-key="row|a"><button data-row-index="3">a</button></div><div data-index-slug="b"><button data-row-index="4">b</button></div>`);
    keepFocus(root, held({ key: "row|a" }));
    expect(document.activeElement).toBe(root.querySelector('[data-row-index="3"]'));
  });

  it("falls back to the page's row, then the group's line, then the first stop", () => {
    const byPage = list(`<div data-index-slug="a"><button data-row-index="1">a</button></div>`);
    keepFocus(byPage, held({ key: "gone" }));
    expect(document.activeElement).toBe(byPage.querySelector("button"));

    document.body.innerHTML = "";
    const byGroup = list(`<div data-index-group="one"><button data-index-more>more</button></div><button data-row-index="9">x</button>`);
    keepFocus(byGroup, held({ key: "gone", slug: null }));
    expect(document.activeElement).toBe(byGroup.querySelector("[data-index-more]"));

    document.body.innerHTML = "";
    const first = list(`<button data-row-index="9">x</button>`);
    keepFocus(first, held({ key: "gone", slug: null, group: null }));
    expect(document.activeElement).toBe(first.querySelector("button"));
  });

  it("leaves focus alone while the row is still connected or focus already sits in the list", () => {
    const root = list(`<button data-row-index="1">a</button><button data-row-index="2">b</button>`);
    const second = root.querySelectorAll("button")[1]!;
    second.focus();
    keepFocus(root, held());
    expect(document.activeElement).toBe(second);
    const connected = held({ el: second });
    document.body.focus();
    keepFocus(root, connected);
    expect(document.activeElement).not.toBe(root.querySelector("button"));
  });
});
