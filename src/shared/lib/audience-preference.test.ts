import { beforeEach, describe, expect, it } from "vitest";

import { readAudiencePlain, writeAudiencePlain } from "./audience-preference";

describe("audience-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("기본값은 개발자 모드 — 기록 같은 크롬이 보인다", () => {
    expect(readAudiencePlain()).toBe(false);
  });

  it("plain 모드를 저장하면 다음 읽기에서 살아 있다", () => {
    writeAudiencePlain(true);
    expect(readAudiencePlain()).toBe(true);
  });

  it("되돌리면 다시 개발자 모드", () => {
    writeAudiencePlain(true);
    writeAudiencePlain(false);
    expect(readAudiencePlain()).toBe(false);
  });

  // If the shell and the map each read localStorage independently, only one of
  // them updates and they drift apart. An event for same-tab subscribers is what
  // makes the rail and the map change together.
  it("쓰기가 같은 탭 구독자에게 알린다", () => {
    let fired = 0;
    const onChange = () => { fired += 1; };
    window.addEventListener("ontology-atlas:audience-preference-change", onChange);
    writeAudiencePlain(true);
    window.removeEventListener("ontology-atlas:audience-preference-change", onChange);
    expect(fired).toBe(1);
  });
});
