import { afterEach, describe, expect, it } from "vitest";
import {
  appendAccountQuery,
  appendWorkspaceProjectQuery,
  readRuntimeWorkspaceProjectId,
  WORKSPACE_PROJECT_QUERY_KEY,
} from "./account-scope";

describe("appendAccountQuery", () => {
  it("명시 accountId 만 ?account 로 직렬화", () => {
    expect(appendAccountQuery("/", "stark")).toBe("/?account=stark");
  });

  it("accountId 없으면 그대로 반환", () => {
    expect(appendAccountQuery("/")).toBe("/");
  });
});

const ORIGINAL_HREF = window.location.href;

afterEach(() => {
  // 각 테스트가 window.location 을 바꿔도 다음 테스트에 누수 없도록 복원.
  window.history.replaceState({}, "", ORIGINAL_HREF);
});

describe("appendWorkspaceProjectQuery", () => {
  it("명시 projectId 를 ?pj 로 직렬화한다", () => {
    expect(appendWorkspaceProjectQuery("/project/iam/", "narnia")).toBe(
      "/project/iam/?pj=narnia",
    );
  });

  it("기존 query 는 보존하고 ?pj 만 추가", () => {
    expect(
      appendWorkspaceProjectQuery("/project/iam/?account=stark", "narnia"),
    ).toBe("/project/iam/?account=stark&pj=narnia");
  });

  it("projectId 가 비어있고 현재 URL 에도 없으면 그대로 반환", () => {
    expect(appendWorkspaceProjectQuery("/project/iam/")).toBe(
      "/project/iam/",
    );
  });

  it("projectId 미지정 시 현재 URL 의 ?pj 를 자동 상속", () => {
    window.history.replaceState({}, "", "/?pj=narnia");
    expect(appendWorkspaceProjectQuery("/project/iam/")).toBe(
      "/project/iam/?pj=narnia",
    );
  });

  it("appendAccountQuery 와 체이닝하면 두 query 모두 붙는다", () => {
    const partial = appendAccountQuery("/project/iam/", "stark");
    expect(appendWorkspaceProjectQuery(partial, "narnia")).toBe(
      "/project/iam/?account=stark&pj=narnia",
    );
  });
});

describe("readRuntimeWorkspaceProjectId", () => {
  it("URL 에 ?pj 없으면 null", () => {
    window.history.replaceState({}, "", "/");
    expect(readRuntimeWorkspaceProjectId()).toBeNull();
  });

  it("URL 의 ?pj 값을 trim 후 반환", () => {
    window.history.replaceState({}, "", "/?pj=narnia");
    expect(readRuntimeWorkspaceProjectId()).toBe("narnia");
  });

  it("?pj 가 빈 문자열/공백이면 null", () => {
    window.history.replaceState({}, "", "/?pj=%20%20");
    expect(readRuntimeWorkspaceProjectId()).toBeNull();
  });
});

describe("WORKSPACE_PROJECT_QUERY_KEY", () => {
  it('shared 상수는 "pj" 로 고정', () => {
    expect(WORKSPACE_PROJECT_QUERY_KEY).toBe("pj");
  });
});

describe("appendAccountQuery + ?pj 자동 chain", () => {
  it("runtime URL 에 ?pj 가 있으면 account chain 끝에 자동 부착", () => {
    window.history.replaceState({}, "", "/?pj=narnia");
    expect(appendAccountQuery("/projects/", "stark")).toBe(
      "/projects/?account=stark&pj=narnia",
    );
  });

  it("runtime URL 에 ?pj 가 없으면 ?pj 부착하지 않음 (기존 동작 보존)", () => {
    window.history.replaceState({}, "", "/");
    expect(appendAccountQuery("/projects/", "stark")).toBe(
      "/projects/?account=stark",
    );
  });
});
