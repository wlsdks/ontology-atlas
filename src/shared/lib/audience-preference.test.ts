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

  // #65 — 셸과 지도가 각자 localStorage 를 읽으면 한쪽만 갱신되는 drift 가 난다.
  // 같은 탭 구독자에게 알리는 이벤트가 있어야 레일과 지도가 함께 바뀐다.
  it("쓰기가 같은 탭 구독자에게 알린다", () => {
    let fired = 0;
    const onChange = () => { fired += 1; };
    window.addEventListener("ontology-atlas:audience-preference-change", onChange);
    writeAudiencePlain(true);
    window.removeEventListener("ontology-atlas:audience-preference-change", onChange);
    expect(fired).toBe(1);
  });
});
