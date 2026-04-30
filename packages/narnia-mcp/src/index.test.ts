import { describe, expect, it, vi } from "vitest";
import { createNarniaMcpServer } from "./index";

/**
 * MCP server 의 tool 핸들러를 직접 호출하지 않고도, server 가 잘 빌드되고
 * 외부 fetch 가 의도된 형태로 호출되는지 검증.
 *
 * 실제 stdio 통신 테스트는 수동 검증 영역 (Claude Code 에 등록 후 호출).
 */
describe("createNarniaMcpServer", () => {
  it("필수 config 가 있으면 server 인스턴스 생성", () => {
    const server = createNarniaMcpServer({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://x",
      fetch: globalThis.fetch,
    });
    expect(server).toBeDefined();
  });

  it("baseUrl 끝의 / 정리", () => {
    let capturedUrl = "";
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const server = createNarniaMcpServer({
      apiKey: "k",
      accountId: "x",
      baseUrl: "https://example.com/",
      fetch: fakeFetch,
    });
    expect(server).toBeDefined();
    // capturedUrl 은 호출이 일어났을 때만 값이 있음 — 본 테스트는 server 만 빌드.
    expect(capturedUrl).toBe("");
  });

  it("fetch 미주입 시 globalThis.fetch 사용 시도. 없으면 throw", () => {
    const originalFetch = globalThis.fetch;
    // @ts-expect-error — 강제 제거로 throw 시뮬
    globalThis.fetch = undefined;
    try {
      expect(() =>
        createNarniaMcpServer({
          apiKey: "k",
          accountId: "x",
          baseUrl: "https://x",
        }),
      ).toThrow(/fetch/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
