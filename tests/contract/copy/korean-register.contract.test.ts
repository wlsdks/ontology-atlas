import { describe, expect, it } from "vitest";

import ko from "../../../messages/ko.json";

const FORMAL = /니다|니까\?|십시오/;

function collect(value: unknown, path: string, out: Array<[string, string]>): Array<[string, string]> {
  if (typeof value === "string") out.push([path, value]);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) collect(item, path ? `${path}.${key}` : key, out);
  return out;
}

describe("Korean register", () => {
  const strings = collect(ko, "", []);

  it("reads the Korean catalogue", () => {
    expect(strings.length).toBeGreaterThan(1000);
  });

  it("speaks in one polite register, never the formal ending", () => {
    const formal = strings.filter(([, text]) => FORMAL.test(text)).map(([path, text]) => `${path}: ${text}`);
    expect(formal).toEqual([]);
  });
});
