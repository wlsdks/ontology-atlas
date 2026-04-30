import { describe, expect, it, vi } from "vitest";
import { Narnia, NarniaError } from "./index";

function makeFakeFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(handler) as unknown as typeof fetch;
}

describe("Narnia constructor", () => {
  it("apiKey 누락 → throw", () => {
    expect(
      () =>
        new Narnia({
          apiKey: "",
          accountId: "x",
          baseUrl: "https://x",
          fetch: globalThis.fetch,
        }),
    ).toThrow(/apiKey/);
  });

  it("accountId 누락 → throw", () => {
    expect(
      () =>
        new Narnia({
          apiKey: "k",
          accountId: "",
          baseUrl: "https://x",
          fetch: globalThis.fetch,
        }),
    ).toThrow(/accountId/);
  });

  it("baseUrl 누락 → throw", () => {
    expect(
      () =>
        new Narnia({
          apiKey: "k",
          accountId: "x",
          baseUrl: "",
          fetch: globalThis.fetch,
        }),
    ).toThrow(/baseUrl/);
  });

  it("baseUrl 끝의 / 제거", async () => {
    let capturedUrl = "";
    const fakeFetch = makeFakeFetch(async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ status: "ok", action: "created", path: "p", writtenAt: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "stark",
      baseUrl: "https://example.com/",
      fetch: fakeFetch,
    });
    await n.pushDoc({ doc: { slug: "s", name: "n" } });
    expect(capturedUrl).toBe("https://example.com/receiveDoc");
  });
});

describe("Narnia.pushDoc", () => {
  it("Authorization Bearer 헤더와 body 를 정확히 전송", async () => {
    let capturedInit: RequestInit | undefined;
    const fakeFetch = makeFakeFetch(async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ status: "ok", action: "created", path: "p", writtenAt: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "nk_test",
      accountId: "stark",
      baseUrl: "https://example.com",
      fetch: fakeFetch,
    });
    await n.pushDoc({
      projectId: "narnia",
      doc: { slug: "iam-spec", name: "IAM Spec", isHub: false, hubIds: ["iam-hub"] },
    });
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer nk_test",
    );
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.accountId).toBe("stark");
    expect(body.projectId).toBe("narnia");
    expect(body.doc.slug).toBe("iam-spec");
    expect(body.doc.hubIds).toEqual(["iam-hub"]);
  });

  it("projectId 미지정 시 defaultProjectId 사용", async () => {
    let capturedBody: { projectId?: string } = {};
    const fakeFetch = makeFakeFetch(async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status: "ok", action: "created", path: "p", writtenAt: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      defaultProjectId: "narnia",
      fetch: fakeFetch,
    });
    await n.pushDoc({ doc: { slug: "s", name: "n" } });
    expect(capturedBody.projectId).toBe("narnia");
  });

  it("projectId / defaultProjectId 둘 다 없으면 'general'", async () => {
    let capturedBody: { projectId?: string } = {};
    const fakeFetch = makeFakeFetch(async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status: "ok", action: "created", path: "p", writtenAt: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      fetch: fakeFetch,
    });
    await n.pushDoc({ doc: { slug: "s", name: "n" } });
    expect(capturedBody.projectId).toBe("general");
  });

  it("HTTP 401 → NarniaError(401, code='unauthorized')", async () => {
    const fakeFetch = makeFakeFetch(async () => {
      return new Response(JSON.stringify({ code: "unauthorized", message: "Bearer 토큰 누락" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      fetch: fakeFetch,
    });
    await expect(n.pushDoc({ doc: { slug: "s", name: "n" } })).rejects.toMatchObject({
      name: "NarniaError",
      status: 401,
      code: "unauthorized",
    });
  });

  it("HTTP 400 → NarniaError(400, code='invalid_argument')", async () => {
    const fakeFetch = makeFakeFetch(async () => {
      return new Response(JSON.stringify({ code: "invalid_argument", message: "doc.slug 필요" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      fetch: fakeFetch,
    });
    try {
      await n.pushDoc({ doc: { slug: "", name: "n" } });
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NarniaError);
      const e = err as NarniaError;
      expect(e.status).toBe(400);
      expect(e.code).toBe("invalid_argument");
    }
  });

  it("성공 응답을 그대로 반환", async () => {
    const fakeFetch = makeFakeFetch(async () => {
      return new Response(
        JSON.stringify({
          status: "ok",
          action: "updated",
          path: "accounts/stark/workspaceProjects/narnia/hubs/iam",
          writtenAt: "2026-04-22T13:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const n = new Narnia({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      fetch: fakeFetch,
    });
    const result = await n.pushDoc({ doc: { slug: "iam", name: "IAM" } });
    expect(result.status).toBe("ok");
    expect(result.action).toBe("updated");
    expect(result.path).toContain("/iam");
  });
});
